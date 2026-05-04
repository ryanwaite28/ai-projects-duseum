// =============================================================================
// lambdas/artworks/src/routes/list-collections.ts
// GET /collections — FR-DISC-07
// Public. Returns all FREE collections globally, paginated, newest first.
// Uses GSI-AllFreeCollections (PK=collectionBrowse='FREE', SK=createdAt).
// Each item is enriched with posterUrl, authorDisplayName, and pieceCount.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ValidationError,
  countCollectionItems,
  docClient,
  getAuthorProfile,
  listFreeCollections,
  ok,
  publicUrl,
} from '@duseum/shared'

export const listCollectionsRoute = async (
  event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const qs   = event.queryStringParameters ?? {}
  const sort = qs['sort'] ?? 'newest'

  if (sort !== 'newest') {
    throw new ValidationError('Invalid sort — only newest is supported')
  }

  const limit   = Math.min(parseInt(qs['limit'] ?? '20', 10) || 20, 50)
  const lastKey = qs['cursor']
    ? JSON.parse(Buffer.from(qs['cursor'], 'base64url').toString()) as Record<string, unknown>
    : undefined

  const result = await listFreeCollections(docClient, { limit, lastKey })

  const enriched = await Promise.all(
    result.items.map(async (col) => {
      const [authorProfile, pieceCount] = await Promise.all([
        getAuthorProfile(docClient, col.ownerId),
        countCollectionItems(docClient, col.collectionId),
      ])
      return {
        collectionId:      col.collectionId,
        title:             col.title,
        description:       col.description,
        visibility:        col.visibility,
        posterUrl:         col.posterS3Key ? publicUrl(col.posterS3Key) : null,
        authorId:          col.ownerId,
        authorDisplayName: authorProfile?.displayName ?? '',
        pieceCount,
        createdAt:         col.createdAt,
      }
    })
  )

  const cursor = result.lastKey
    ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64url')
    : undefined

  return ok({ items: enriched, ...(cursor ? { cursor } : {}) })
}

void ValidationError
