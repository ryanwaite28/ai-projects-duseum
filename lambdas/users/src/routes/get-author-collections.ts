// =============================================================================
// lambdas/users/src/routes/get-author-collections.ts
// GET /authors/{authorId}/collections — Author's collections (§8.5, FR-COL-*)
// JWT optional.
// Owner            → all collections (FREE + SUBSCRIBER_ONLY)
// Active subscriber → all collections (FR-COL-03)
// Everyone else    → FREE only
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  docClient,
  getAuthorProfile,
  getAuthorSubscription,
  listCollectionsByAuthor,
  ok,
  publicUrl,
} from '@duseum/shared'

export const getAuthorCollections = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const author = await getAuthorProfile(docClient, authorId)
  if (!author || author.status !== 'ACTIVE') throw new NotFoundError('Author not found')

  const isOwner = context.userId === authorId

  let isSubscriber = false
  if (!isOwner && context.userId) {
    const sub = await getAuthorSubscription(docClient, context.userId, authorId)
    isSubscriber = sub?.status === 'ACTIVE'
  }

  const result = await listCollectionsByAuthor(docClient, authorId, {
    visibilityFilter: (isOwner || isSubscriber) ? undefined : 'FREE',
  })

  return ok({
    items: result.items.map((c) => ({
      collectionId: c.collectionId,
      title:        c.title,
      description:  c.description,
      visibility:   c.visibility,
      posterUrl:    c.posterS3Key ? publicUrl(c.posterS3Key) : null,
      createdAt:    c.createdAt,
      updatedAt:    c.updatedAt,
    })),
  })
}
