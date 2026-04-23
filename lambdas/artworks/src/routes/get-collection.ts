// =============================================================================
// lambdas/artworks/src/routes/get-collection.ts
// GET /collections/{collectionId} — FR-COL-02/03/06, §8.5
//
// JWT optional. PRIVATE collections require an active Author subscription.
// Each piece is filtered by checkArtPieceAccess; response includes
// totalPieceCount + visiblePieceCount so the frontend can display
// "X pieces — Y visible to you" (FR-COL-06).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
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

  // PRIVATE collection gate — FR-COL-03
  if (!collection.isPublic && !isOwner) {
    if (!userId) throw new ForbiddenError('Authentication required for private collections')
    const authorSub = await getAuthorSubscription(docClient, userId, collection.ownerId)
    if (authorSub?.status !== 'ACTIVE') {
      throw new ForbiddenError('An active Author subscription is required to view this collection')
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
    ...collection,
    pieces:           visiblePieces,
    totalPieceCount:  items.length,
    visiblePieceCount: visiblePieces.length,
  })
}
