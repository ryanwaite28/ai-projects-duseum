// =============================================================================
// lambdas/artworks/src/routes/list-collection-pieces.ts
// GET /collections/{collectionId}/pieces — FR-COL-04, §8.5
//
// Returns the ordered list of {artworkId, displayOrder} items in a collection.
// Used by the author's Manage Pieces modal (Collections tab).
// Auth: JWT required. Private collections: owner only.
//       Public collections: any authenticated user may list (for embedding UX).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  docClient,
  getCollection,
  listCollectionItems,
  ok,
} from '@duseum/shared'

export const listCollectionPiecesRoute = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  collectionId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const collection = await getCollection(docClient, collectionId)
  if (!collection) throw new NotFoundError('Collection not found')

  if (!collection.isPublic && collection.ownerId !== userId) {
    throw new ForbiddenError('Only the collection owner may list pieces in a private collection')
  }

  const result = await listCollectionItems(docClient, collectionId, 100)

  return ok({
    pieces: result.items.map((item) => ({
      artworkId:    item.artworkId,
      displayOrder: item.order,
    })),
  })
}
