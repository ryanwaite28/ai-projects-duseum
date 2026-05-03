// =============================================================================
// lambdas/artworks/src/routes/list-author-collections.ts
// GET /authors/{authorId}/collections — §8.5
// JWT optional. Owner sees all collections; others see FREE-only.
// Each collection is enriched with pieceCount and coverPieceUrl.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  countCollectionItems,
  docClient,
  getArtPiece,
  getFirstCollectionItem,
  listCollectionsByAuthor,
  ok,
  publicUrl,
} from '@duseum/shared'

export const listAuthorCollectionsRoute = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const qs      = event.queryStringParameters ?? {}
  const limit   = Math.min(parseInt(qs['limit'] ?? '20', 10) || 20, 50)
  const lastKey = qs['cursor']
    ? JSON.parse(Buffer.from(qs['cursor'], 'base64url').toString()) as Record<string, unknown>
    : undefined

  const isOwner = context.userId === authorId

  const result = await listCollectionsByAuthor(docClient, authorId, {
    visibilityFilter: isOwner ? undefined : 'FREE',
    limit,
    lastKey,
  })

  const enriched = await Promise.all(
    result.items.map(async (collection) => {
      const [pieceCount, firstItem] = await Promise.all([
        countCollectionItems(docClient, collection.collectionId),
        getFirstCollectionItem(docClient, collection.collectionId),
      ])

      let coverPieceUrl: string | null = null
      if (firstItem) {
        const piece = await getArtPiece(docClient, firstItem.artworkId)
        if (piece) coverPieceUrl = publicUrl(piece.s3Key)
      }

      return { ...collection, pieceCount, coverPieceUrl }
    })
  )

  const cursor = result.lastKey
    ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64url')
    : undefined

  return ok({ items: enriched, ...(cursor ? { cursor } : {}) })
}
