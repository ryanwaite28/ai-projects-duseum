// =============================================================================
// lambdas/users/src/routes/get-author-collections.ts
// GET /authors/{authorId}/collections — Author's public collections (§8.5, FR-COL-*)
// =============================================================================

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  docClient,
  getAuthorProfile,
  listCollectionsByAuthor,
  ok,
} from '@duseum/shared'

export const getAuthorCollections = async (
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const author = await getAuthorProfile(docClient, authorId)
  if (!author || author.status !== 'ACTIVE') throw new NotFoundError('Author not found')

  const result = await listCollectionsByAuthor(docClient, authorId, { publicOnly: true })

  return ok({
    items: result.items.map((c) => ({
      collectionId: c.collectionId,
      title:        c.title,
      description:  c.description,
      isPublic:     c.isPublic,
      createdAt:    c.createdAt,
      updatedAt:    c.updatedAt,
    })),
  })
}
