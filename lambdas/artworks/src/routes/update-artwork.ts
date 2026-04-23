// =============================================================================
// lambdas/artworks/src/routes/update-artwork.ts
// PUT /artworks/{artworkId} — Section 8.2, FR-ART-06
//
// Author only; own pieces only. All body fields are optional. When visibility
// changes the full GSI-AuthorPublic composite attribute is rewritten. If the
// piece transitions from DRAFT → PUBLIC/PRIVATE, publishedAt is set once.
// =============================================================================

import { z } from 'zod'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  docClient,
  getArtPiece,
  ok,
  updateArtPiece,
  validateBody,
} from '@duseum/shared'

const ART_CATEGORIES = [
  'PAINTING', 'DIGITAL', 'PHOTOGRAPHY', 'SCULPTURE',
  'ILLUSTRATION', 'MIXED_MEDIA', 'OTHER',
] as const

const UpdateArtworkSchema = z.object({
  title:           z.string().min(1).max(200).optional(),
  description:     z.string().max(2000).optional(),
  category:        z.enum(ART_CATEGORIES).optional(),
  tags:            z.array(z.string().min(1).max(50)).max(10).optional(),
  visibility:      z.enum(['PUBLIC', 'PRIVATE', 'DRAFT']).optional(),
  commentsEnabled: z.boolean().optional(),
})

export const updateArtwork = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const piece = await getArtPiece(docClient, artworkId)
  if (!piece || piece.status === 'ARCHIVED') throw new NotFoundError('Art piece not found')
  if (piece.authorId !== userId) throw new ForbiddenError('You can only edit your own pieces')

  const body = validateBody(UpdateArtworkSchema, event.body)
  if (Object.keys(body).length === 0) {
    throw new ValidationError('Request body must include at least one field to update')
  }

  const now        = new Date().toISOString()
  const tags       = body.tags
    ? [...new Set(body.tags.map((t) => t.toLowerCase().trim()))]
    : undefined

  const newVisibility = body.visibility

  // First publish: DRAFT → PUBLIC or PRIVATE sets publishedAt once
  const wasPublished  = piece.publishedAt !== null
  const isFirstPublish =
    !wasPublished &&
    newVisibility !== undefined &&
    newVisibility !== 'DRAFT'

  // Caller has piece.createdAt in memory — build the full composite for the GSI
  const visibilityCreatedAt = newVisibility !== undefined
    ? `${newVisibility}#${piece.createdAt}`
    : undefined

  await updateArtPiece(docClient, artworkId, {
    title:              body.title,
    description:        body.description,
    tags,
    visibility:         newVisibility,
    visibilityCreatedAt,
    commentsEnabled:    body.commentsEnabled,
    publishedAt:        isFirstPublish ? now : undefined,
    updatedAt:          now,
  })

  const updated = await getArtPiece(docClient, artworkId)
  return ok(updated)
}
