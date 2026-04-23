// DELETE /admin/artworks/{artworkId} — soft-delete an art piece + S3 cleanup.
// FR-ADMIN-03: Admins can remove art pieces that violate platform policies.
//
// Soft delete sets status=ARCHIVED (removes from all public GSIs).
// S3 object is deleted to free storage and prevent direct URL access.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ConflictError,
  NotFoundError,
  archiveArtPiece,
  deleteObject,
  docClient,
  getArtPiece,
  ok,
} from '@duseum/shared'

const MEDIA_BUCKET = process.env.MEDIA_BUCKET!

export const removeArtwork = async (
  _event: APIGatewayProxyEventV2,
  _context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const artwork = await getArtPiece(docClient, artworkId)
  if (!artwork) throw new NotFoundError('Artwork not found')
  if (artwork.status === 'ARCHIVED') throw new ConflictError('Artwork is already archived')

  const now = new Date().toISOString()

  await Promise.all([
    archiveArtPiece(docClient, artworkId, now),
    deleteObject(MEDIA_BUCKET, artwork.s3Key),
  ])

  return ok({ artworkId, status: 'ARCHIVED', removedAt: now })
}
