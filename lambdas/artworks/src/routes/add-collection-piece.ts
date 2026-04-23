// =============================================================================
// lambdas/artworks/src/routes/add-collection-piece.ts
// POST /collections/{collectionId}/pieces — FR-COL-04/05, §8.5
// Owner only. Adds one of the owner's own art pieces to the collection.
// =============================================================================

import { z } from 'zod'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  addArtPieceToCollection,
  created,
  docClient,
  getArtPiece,
  getCollection,
  validateBody,
} from '@duseum/shared'

const AddPieceSchema = z.object({
  artworkId: z.string().uuid(),
  order:     z.number().int().min(0).optional(),
})

export const addCollectionPieceRoute = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  collectionId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const collection = await getCollection(docClient, collectionId)
  if (!collection) throw new NotFoundError('Collection not found')
  if (collection.ownerId !== userId) throw new ForbiddenError('Only the collection owner may add pieces')

  const body = validateBody(AddPieceSchema, event.body)

  const piece = await getArtPiece(docClient, body.artworkId)
  if (!piece || piece.status === 'ARCHIVED') throw new NotFoundError('Art piece not found')
  if (piece.authorId !== userId) throw new ForbiddenError('You can only add your own pieces to a collection')

  // Use caller-supplied order; default to a monotonically increasing timestamp-based value
  const order   = body.order ?? Date.now()
  const addedAt = new Date().toISOString()

  await addArtPieceToCollection(docClient, {
    collectionId,
    artworkId: body.artworkId,
    order,
    addedAt,
  })

  return created({ collectionId, artworkId: body.artworkId, order, addedAt })
}
