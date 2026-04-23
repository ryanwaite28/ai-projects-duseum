// =============================================================================
// lambdas/artworks/src/routes/delete-artwork.ts
// DELETE /artworks/{artworkId} — Section 8.2, FR-ART-07/08
//
// Author only; own pieces only.
//   Default (soft delete): sets status=ARCHIVED — piece leaves all public GSIs.
//   ?permanent=true: removes DynamoDB items + S3 object (irreversible).
// =============================================================================

import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  archiveArtPiece,
  decrementAuthorPieceCount,
  deleteArtPiece,
  docClient,
  getArtPiece,
  noContent,
} from '@duseum/shared'

// S3 client for permanent delete — respects MiniStack endpoint
let _s3: S3Client | null = null
const getS3 = () => {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL
        ? { endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    })
  }
  return _s3
}

export const deleteArtwork = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const piece = await getArtPiece(docClient, artworkId)
  if (!piece || piece.status === 'ARCHIVED') throw new NotFoundError('Art piece not found')
  if (piece.authorId !== userId) throw new ForbiddenError('You can only delete your own pieces')

  const permanent = event.queryStringParameters?.['permanent'] === 'true'

  if (permanent) {
    // Delete S3 object — ignore NoSuchKey (idempotent)
    await getS3().send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_MEDIA_BUCKET_NAME!,
        Key: piece.s3Key,
      })
    ).catch(() => {})

    // Delete both DynamoDB items
    await deleteArtPiece(docClient, artworkId, piece.authorId, piece.createdAt)

    // Decrement denormalized counter (fire-and-forget — non-critical)
    void decrementAuthorPieceCount(docClient, userId).catch(() => {})
  } else {
    // Soft delete: marks status=ARCHIVED; piece leaves all public GSIs
    await archiveArtPiece(docClient, artworkId, new Date().toISOString())
  }

  return noContent()
}
