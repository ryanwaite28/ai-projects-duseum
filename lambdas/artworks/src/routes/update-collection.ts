// =============================================================================
// lambdas/artworks/src/routes/update-collection.ts
// PUT /collections/{collectionId} — FR-COL-01/04, §8.5
// Owner only. Updates metadata and/or reorders pieces.
// =============================================================================

import { z } from 'zod'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  addArtPieceToCollection,
  docClient,
  getCollection,
  getCollectionItemByArtworkId,
  ok,
  removeArtPieceFromCollection,
  updateCollection,
  validateBody,
} from '@duseum/shared'

const PieceOrderEntrySchema = z.object({
  artworkId: z.string().uuid(),
  order:     z.number().int().min(0),
})

const UpdateCollectionSchema = z.object({
  title:       z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic:    z.boolean().optional(),
  pieceOrder:  z.array(PieceOrderEntrySchema).optional(),
}).refine(
  (v) => v.title !== undefined || v.description !== undefined || v.isPublic !== undefined || v.pieceOrder !== undefined,
  { message: 'At least one field must be provided' }
)

export const updateCollectionRoute = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  collectionId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const collection = await getCollection(docClient, collectionId)
  if (!collection) throw new NotFoundError('Collection not found')
  if (collection.ownerId !== userId) throw new ForbiddenError('Only the collection owner may update it')

  const body = validateBody(UpdateCollectionSchema, event.body)

  // Update metadata fields if any provided
  const metaPatch: { title?: string; description?: string; isPublic?: boolean } = {}
  if (body.title       !== undefined) metaPatch.title       = body.title
  if (body.description !== undefined) metaPatch.description = body.description
  if (body.isPublic    !== undefined) metaPatch.isPublic    = body.isPublic

  let updated = collection
  if (Object.keys(metaPatch).length > 0) {
    updated = await updateCollection(docClient, collectionId, metaPatch)
  }

  // Reorder pieces — FR-COL-04
  if (body.pieceOrder && body.pieceOrder.length > 0) {
    const now = new Date().toISOString()
    await Promise.all(
      body.pieceOrder.map(async ({ artworkId, order }) => {
        const existing = await getCollectionItemByArtworkId(docClient, collectionId, artworkId)
        if (!existing) return // piece not in collection; ignore silently
        if (existing.order === order) return // no change needed

        await removeArtPieceFromCollection(docClient, collectionId, artworkId, existing.order)
        await addArtPieceToCollection(docClient, { collectionId, artworkId, order, addedAt: now })
      })
    )
  }

  return ok(updated)
}

void ValidationError
