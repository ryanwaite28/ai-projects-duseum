// =============================================================================
// lambdas/artworks/src/routes/delete-collection.ts
// DELETE /collections/{collectionId} — FR-COL-05, §8.5
// Owner only. Deletes METADATA + author-index item. Does NOT delete pieces.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  deleteCollection,
  docClient,
  getCollection,
  ok,
} from '@duseum/shared'

export const deleteCollectionRoute = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  collectionId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const collection = await getCollection(docClient, collectionId)
  if (!collection) throw new NotFoundError('Collection not found')
  if (collection.ownerId !== userId) throw new ForbiddenError('Only the collection owner may delete it')

  await deleteCollection(docClient, collectionId, collection.ownerId, collection.createdAt)

  return ok({ collectionId, deletedAt: new Date().toISOString() })
}
