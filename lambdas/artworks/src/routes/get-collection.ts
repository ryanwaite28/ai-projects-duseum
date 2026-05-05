// =============================================================================
// lambdas/artworks/src/routes/get-collection.ts
// GET /collections/{collectionId} — FR-COL-02/03/06/08, §8.5
//
// JWT optional. SUBSCRIBER_ONLY collections gated for non-subscribers: instead
// of throwing 403, always return collection metadata + access field so the
// frontend can render a gate UI with a subscribe CTA (FR-COL-08).
//   access: 'GRANTED'               — viewer may see pieces
//   access: 'SUBSCRIBER_ONLY_GATED' — authenticated but not subscribed
//   access: 'AUTH_REQUIRED'         — unauthenticated + SUBSCRIBER_ONLY
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  checkArtPieceAccess,
  countPublicPiecesByAuthorUpTo,
  docClient,
  getArtPiece,
  getAuthorSubscription,
  getCollection,
  getFreeTierLimit,
  getPlatformSubscription,
  listCollectionItems,
  ok,
  publicUrl,
} from '@duseum/shared'

export const getCollectionRoute = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  collectionId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const collection = await getCollection(docClient, collectionId)
  if (!collection) throw new NotFoundError('Collection not found')

  const userId: string | undefined = context.userId
  const isOwner = !!userId && collection.ownerId === userId

  const collectionMeta = {
    collectionId:  collection.collectionId,
    ownerId:       collection.ownerId,
    title:         collection.title,
    description:   collection.description,
    visibility:    collection.visibility,
    posterUrl:     collection.posterS3Key ? publicUrl(collection.posterS3Key) : null,
    createdAt:     collection.createdAt,
    updatedAt:     collection.updatedAt,
  }

  // SUBSCRIBER_ONLY gate — FR-COL-03/08: return structured response instead of 403
  if (collection.visibility === 'SUBSCRIBER_ONLY' && !isOwner) {
    if (!userId) {
      return ok({ ...collectionMeta, access: 'AUTH_REQUIRED' as const, pieces: [], totalPieceCount: 0, visiblePieceCount: 0 })
    }
    const authorSub = await getAuthorSubscription(docClient, userId, collection.ownerId)
    if (authorSub?.status !== 'ACTIVE') {
      return ok({ ...collectionMeta, access: 'SUBSCRIBER_ONLY_GATED' as const, pieces: [], totalPieceCount: 0, visiblePieceCount: 0 })
    }
  }

  // Load viewer subscription state once (used for every piece access check)
  let isPlatformSubscriber = false
  let isAuthorSubscriber   = false

  if (!isOwner && userId) {
    const [platformSub, authorSub] = await Promise.all([
      getPlatformSubscription(docClient, userId),
      getAuthorSubscription(docClient, userId, collection.ownerId),
    ])
    isPlatformSubscriber = platformSub?.status === 'ACTIVE'
    isAuthorSubscriber   = authorSub?.status === 'ACTIVE'
  }

  const [collectionItemsResult, freeTierLimit] = await Promise.all([
    listCollectionItems(docClient, collectionId, 100),
    getFreeTierLimit(docClient),
  ])

  const items = collectionItemsResult.items

  // Fetch each piece and check access in parallel (bounded by collection size ≤100)
  type PieceWithUrl = Record<string, unknown> & { thumbnailUrl?: string }
  const pieceResults = await Promise.all(
    items.map(async (item) => {
      const piece = await getArtPiece(docClient, item.artworkId)
      if (!piece || piece.status === 'ARCHIVED') return null

      const pieceIsAuthor = isOwner && piece.authorId === collection.ownerId
      const authorPieceIndex = await countPublicPiecesByAuthorUpTo(
        docClient, piece.authorId, piece.createdAt
      )

      const decision = checkArtPieceAccess(
        piece,
        {
          viewerId:            userId ?? '',
          isAuthor:            pieceIsAuthor,
          isPlatformSubscriber,
          isAuthorSubscriber,
        },
        freeTierLimit,
        authorPieceIndex
      )

      if (!decision.allowed) return null

      const pieceWithUrl: PieceWithUrl = {
        ...piece,
        thumbnailUrl: decision.signUrl ? undefined : publicUrl(piece.s3Key),
        order:        item.order,
      }
      return pieceWithUrl
    })
  )

  const visiblePieces = pieceResults.filter(Boolean) as PieceWithUrl[]

  return ok({
    ...collectionMeta,
    access:            'GRANTED' as const,
    pieces:            visiblePieces,
    totalPieceCount:   items.length,
    visiblePieceCount: visiblePieces.length,
  })
}
