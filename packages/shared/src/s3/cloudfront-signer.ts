// =============================================================================
// packages/shared/src/s3/cloudfront-signer.ts
// CloudFront signed URL generation for PRIVATE art pieces — Section 4.4
//
// Uses @aws-sdk/cloudfront-signer with the RSA private key stored in
// Secrets Manager (duseum/{env}/cloudfront/private-key).
// Key pair ID is injected as CLOUDFRONT_KEY_PAIR_ID env var at deploy time.
// =============================================================================

import { getSignedUrl } from '@aws-sdk/cloudfront-signer'
import { getCloudfrontPrivateKey } from '../secrets.js'

/**
 * Generates a CloudFront canned-policy signed URL for a private S3 object.
 *
 * @param s3Key      Object key in the media bucket (UUID — no prefix)
 * @param ttlSeconds URL validity window from now (e.g. 3600 for 1 hour)
 */
export const generateSignedUrl = async (
  s3Key: string,
  ttlSeconds: number
): Promise<string> => {
  const privateKey   = await getCloudfrontPrivateKey()
  const keyPairId    = process.env.CLOUDFRONT_KEY_PAIR_ID!
  const domain       = process.env.CLOUDFRONT_MEDIA_DOMAIN!

  const url          = `https://${domain}/${s3Key}`
  const dateLessThan = new Date(Date.now() + ttlSeconds * 1000).toISOString()

  return getSignedUrl({ keyPairId, privateKey, url, dateLessThan })
}

/**
 * Returns the plain (unsigned) CloudFront URL for a PUBLIC piece.
 * Never called for PRIVATE pieces — those always require generateSignedUrl().
 */
export const publicUrl = (s3Key: string): string => {
  const domain = process.env.CLOUDFRONT_MEDIA_DOMAIN!
  return `https://${domain}/${s3Key}`
}
