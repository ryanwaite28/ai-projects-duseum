// =============================================================================
// lambdas/artworks/src/routes/list-author-collections.ts
// GET /authors/{authorId}/collections — §8.5
// Public (no auth required). Returns the author's PUBLIC collections only.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  docClient,
  listCollectionsByAuthor,
  ok,
} from '@duseum/shared'

export const listAuthorCollectionsRoute = async (
  event: APIGatewayProxyEventV2,
  _context: DuseumContext,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const qs      = event.queryStringParameters ?? {}
  const limit   = Math.min(parseInt(qs['limit'] ?? '20', 10) || 20, 50)
  const lastKey = qs['cursor']
    ? JSON.parse(Buffer.from(qs['cursor'], 'base64url').toString()) as Record<string, unknown>
    : undefined

  const result = await listCollectionsByAuthor(docClient, authorId, {
    publicOnly: true,
    limit,
    lastKey,
  })

  const cursor = result.lastKey
    ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64url')
    : undefined

  return ok({ items: result.items, ...(cursor ? { cursor } : {}) })
}
