// =============================================================================
// lambdas/artworks/src/routes/remove-collection-piece.ts
// DELETE /collections/{collectionId}/pieces/{artworkId} — FR-COL-04, §8.5
// Owner only. Removes a piece from the collection; the piece itself is unchanged.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  docClient,
  getCollection,
  getCollectionItemByArtworkId,
  ok,
  removeArtPieceFromCollection,
} from '@duseum/shared'

export const removeCollectionPieceRoute = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  collectionId: string,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const collection = await getCollection(docClient, collectionId)
  if (!collection) throw new NotFoundError('Collection not found')
  if (collection.ownerId !== userId) throw new ForbiddenError('Only the collection owner may remove pieces')

  const item = await getCollectionItemByArtworkId(docClient, collectionId, artworkId)
  if (!item) throw new NotFoundError('Art piece is not in this collection')

  await removeArtPieceFromCollection(docClient, collectionId, artworkId, item.order)

  return ok({ collectionId, artworkId, removedAt: new Date().toISOString() })
}
