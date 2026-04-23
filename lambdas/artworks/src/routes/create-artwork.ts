// =============================================================================
// lambdas/artworks/src/routes/create-artwork.ts
// POST /artworks — Section 4.3, 4.6, 8.2
//
// Author only. Validates UploadIntent, confirms S3 object exists, creates
// ArtPiece record, then fire-and-forgets a NEW_PIECE_PUBLISHED SQS message
// for PUBLIC/PRIVATE pieces. Returns 201 BEFORE SQS processing.
// =============================================================================

import { randomUUID } from 'node:crypto'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { z } from 'zod'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  created,
  createArtPiece,
  docClient,
  getAuthorProfile,
  getUploadIntent,
  headObject,
  incrementAuthorPieceCount,
  markUploadIntentConsumed,
  publicUrl,
  sendMessage,
  validateBody,
} from '@duseum/shared'

const ART_CATEGORIES = [
  'PAINTING', 'DIGITAL', 'PHOTOGRAPHY', 'SCULPTURE',
  'ILLUSTRATION', 'MIXED_MEDIA', 'OTHER',
] as const

const CreateArtworkSchema = z.object({
  s3Key:           z.string().uuid('s3Key must be a UUID'),
  title:           z.string().min(1).max(200),
  description:     z.string().max(2000).optional().default(''),
  category:        z.enum(ART_CATEGORIES),
  tags:            z.array(z.string().min(1).max(50)).max(10).optional().default([]),
  visibility:      z.enum(['PUBLIC', 'PRIVATE', 'DRAFT']),
  commentsEnabled: z.boolean().optional().default(true),
})

export const createArtwork = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const authorProfile = await getAuthorProfile(docClient, userId)
  if (!authorProfile || authorProfile.profileType !== 'AUTHOR') {
    throw new ForbiddenError('An Author profile is required to create art pieces')
  }
  if (authorProfile.status !== 'ACTIVE') {
    throw new ForbiddenError('Author profile must be ACTIVE to create art pieces')
  }

  const body = validateBody(CreateArtworkSchema, event.body)
  const { s3Key, title, description, category, visibility, commentsEnabled } = body

  // Normalize tags to lowercase and deduplicate
  const tags = [...new Set(body.tags.map((t) => t.toLowerCase().trim()))]

  // Validate UploadIntent
  const intent = await getUploadIntent(docClient, s3Key)
  if (!intent) {
    throw new ValidationError('s3Key does not correspond to a known upload intent')
  }
  if (intent.uploaderId !== userId) {
    throw new ForbiddenError('This upload intent belongs to a different user')
  }
  if (intent.status !== 'PENDING') {
    throw new ValidationError('Upload intent has already been consumed or expired')
  }
  if (new Date(intent.expiresAt) < new Date()) {
    throw new ValidationError('Upload intent has expired — request a new presigned URL')
  }

  // Confirm S3 object exists
  const s3Meta = await headObject(process.env.S3_MEDIA_BUCKET_NAME!, s3Key)
  if (!s3Meta) {
    throw new ValidationError(
      'Upload not found in S3 — complete the presigned PUT before creating the art piece'
    )
  }

  const artworkId  = randomUUID()
  const now        = new Date().toISOString()
  const publishedAt = visibility !== 'DRAFT' ? now : null

  // Persist ArtPiece (two items: main + author-index)
  await createArtPiece(docClient, {
    artworkId,
    authorId: userId,
    title,
    description: description ?? '',
    tags,
    category,
    visibility,
    s3Key,
    mimeType:       intent.mimeType,
    fileSizeBytes:  s3Meta.ContentLength ?? intent.declaredSizeBytes,
    commentsEnabled,
    createdAt:  now,
    updatedAt:  now,
    publishedAt,
  })

  // Mark upload intent consumed — ConditionalCheckFailedException = duplicate submit
  try {
    await markUploadIntentConsumed(docClient, s3Key)
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new ConflictError('Duplicate submission: this upload has already been processed')
    }
    throw err
  }

  // Increment author piece count (fire-and-forget — non-critical counter)
  void incrementAuthorPieceCount(docClient, userId).catch(() => {})

  // Enqueue notification — ONLY for non-DRAFT pieces, NEVER blocks response (§4.6, Critical Rule #12)
  if (visibility !== 'DRAFT') {
    const queueUrl = process.env.NOTIFICATION_QUEUE_URL!
    void sendMessage(queueUrl, {
      eventType:          'NEW_PIECE_PUBLISHED',
      artworkId,
      authorId:           userId,
      visibility,
      title,
      descriptionExcerpt: (description ?? '').slice(0, 200),
      thumbnailS3Key:     s3Key,
      publishedAt:        now,
    }).catch(() => {/* swallow — fan-out failure must not fail the 201 response */})
  }

  return created({
    artworkId,
    imageUrl: publicUrl(s3Key),
  })
}

// ConflictError is imported for the duplicate-submit guard above
void NotFoundError
