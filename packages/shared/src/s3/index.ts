// =============================================================================
// packages/shared/src/s3/index.ts
// S3 utilities: presigned PUT URL generation + HeadObject check.
//
// AWS_ENDPOINT_URL is respected so MiniStack (localhost:4566) works locally
// without any code changes (same pattern as db/client.ts).
// =============================================================================

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ── S3 client singleton ───────────────────────────────────────────────────────

let _s3Client: S3Client | null = null

const getS3Client = (): S3Client => {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL
        ? { endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    })
  }
  return _s3Client
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Generates a presigned S3 PUT URL.
 *
 * The Lambda role must have s3:PutObject on the target bucket — the presigned
 * URL delegates that permission to the uploading client for TTL seconds.
 *
 * @param bucket      S3 bucket name
 * @param key         Object key (UUID, no prefix)
 * @param contentType MIME type to bind to the presigned URL
 * @param ttlSeconds  URL validity window (max 604,800 s for SigV4)
 */
export const generatePresignedPutUrl = async (
  bucket: string,
  key: string,
  contentType: string,
  ttlSeconds: number
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(getS3Client(), command, { expiresIn: ttlSeconds })
}

/**
 * Checks whether an object exists in S3 and returns its metadata.
 * Returns `null` when the object is not found (404/NoSuchKey) rather than
 * throwing, so callers can treat absence as a first-class value.
 */
export const headObject = async (
  bucket: string,
  key: string
): Promise<HeadObjectCommandOutput | null> => {
  try {
    return await getS3Client().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    )
  } catch (err: unknown) {
    const name = (err as { name?: string }).name ?? ''
    if (name === 'NotFound' || name === 'NoSuchKey') return null
    throw err
  }
}

/**
 * Deletes an S3 object. Used by admin-lambda for policy-violation artwork removal.
 */
export const deleteObject = async (bucket: string, key: string): Promise<void> => {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
