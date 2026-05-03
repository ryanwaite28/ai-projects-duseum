// =============================================================================
// lambdas/users/src/routes/get-author-collections.ts
// GET /authors/{authorId}/collections — Author's collections (§8.5, FR-COL-*)
// JWT optional. Owner sees all collections; non-owners/unauthenticated see FREE only.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  docClient,
  getAuthorProfile,
  listCollectionsByAuthor,
  ok,
} from '@duseum/shared'

export const getAuthorCollections = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const author = await getAuthorProfile(docClient, authorId)
  if (!author || author.status !== 'ACTIVE') throw new NotFoundError('Author not found')

  const isOwner = context.userId === authorId

  const result = await listCollectionsByAuthor(docClient, authorId, {
    visibilityFilter: isOwner ? undefined : 'FREE',
  })

  return ok({
    items: result.items.map((c) => ({
      collectionId: c.collectionId,
      title:        c.title,
      description:  c.description,
      visibility:   c.visibility,
      createdAt:    c.createdAt,
      updatedAt:    c.updatedAt,
    })),
  })
}
