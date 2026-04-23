// =============================================================================
// lambdas/media/src/routes/upload-intent.ts
// POST /media/upload-intent — Section 4.3, 8.3
//
// Issues a 10-minute S3 presigned PUT URL and writes a PENDING UploadIntent
// record so artworks-lambda can verify the upload later.
// =============================================================================

import { z } from 'zod'
import {
  ForbiddenError,
  ValidationError,
  buildHandler,
  createUploadIntent,
  docClient,
  generatePresignedPutUrl,
  getAuthorProfile,
  ok,
  validateBody,
} from '@duseum/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

const PRESIGNED_TTL_SECONDS = 600 // 10 minutes

// ── Request schema ────────────────────────────────────────────────────────────

const UploadIntentBodySchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
})

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = buildHandler(async (event, context) => {
  const body = validateBody(UploadIntentBodySchema, event.body)

  // Validate mimeType allowlist
  if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
    throw new ValidationError(
      `mimeType must be one of: ${[...ALLOWED_MIME_TYPES].join(', ')}`
    )
  }

  // Validate sizeBytes ceiling
  if (body.sizeBytes > MAX_SIZE_BYTES) {
    throw new ValidationError(
      `sizeBytes must not exceed ${MAX_SIZE_BYTES} (20 MB)`
    )
  }

  // Require an ACTIVE Author profile
  const authorProfile = await getAuthorProfile(docClient, context.userId)
  if (!authorProfile || authorProfile.profileType !== 'AUTHOR') {
    throw new ForbiddenError('An Author profile is required to upload media')
  }
  if (authorProfile.status !== 'ACTIVE') {
    throw new ForbiddenError('Author profile must be ACTIVE to upload media')
  }

  // Generate intent
  const intentId = crypto.randomUUID()
  const s3Key = intentId
  const mediaBucket = process.env.S3_MEDIA_BUCKET_NAME!
  const now = new Date()
  const expiresAt = new Date(now.getTime() + PRESIGNED_TTL_SECONDS * 1000).toISOString()

  const uploadUrl = await generatePresignedPutUrl(
    mediaBucket,
    s3Key,
    body.mimeType,
    PRESIGNED_TTL_SECONDS
  )

  await createUploadIntent(docClient, {
    intentId,
    uploaderId: context.userId,
    s3Key,
    mimeType: body.mimeType,
    declaredSizeBytes: body.sizeBytes,
    status: 'PENDING',
    expiresAt,
    createdAt: now.toISOString(),
  })

  return ok({ intentId, uploadUrl, s3Key, expiresAt })
})
