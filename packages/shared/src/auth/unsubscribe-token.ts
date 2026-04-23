// =============================================================================
// packages/shared/src/auth/unsubscribe-token.ts
// HMAC-SHA256 signed tokens for one-click email unsubscribe — FR-NOTIF-08.
//
// Token format:  base64url(payload) + '.' + base64url(hmac_sha256(payload, secret))
// Payload:       { viewerId, authorId, exp }  (exp = Unix ms)
// TTL:           30 days
// Secret source: Secrets Manager via getUnsubscribeSecret()
// =============================================================================

import { createHmac, timingSafeEqual } from 'crypto'
import { getUnsubscribeSecret } from '../secrets.js'
import { ValidationError } from '../errors/index.js'

const TTL_MS = 30 * 24 * 60 * 60 * 1_000   // 30 days

type Payload = {
  viewerId: string
  authorId: string
  exp:      number   // Unix ms
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const sign = (payloadB64: string, secret: string): string =>
  createHmac('sha256', secret).update(payloadB64).digest('base64url')

const encodePayload = (payload: Payload): string =>
  Buffer.from(JSON.stringify(payload)).toString('base64url')

const decodePayload = (payloadB64: string): Payload =>
  JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Payload

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates a signed unsubscribe token valid for 30 days.
 * The secret is loaded from Secrets Manager (cached after first call).
 */
export const generateUnsubscribeToken = async (
  viewerId: string,
  authorId: string
): Promise<string> => {
  const secret     = await getUnsubscribeSecret()
  const payload    = encodePayload({ viewerId, authorId, exp: Date.now() + TTL_MS })
  const signature  = sign(payload, secret)
  return `${payload}.${signature}`
}

/**
 * Verifies a signed unsubscribe token.
 * Throws `ValidationError` if the token is missing, malformed, expired, or tampered.
 * Returns `{ viewerId, authorId }` on success.
 */
export const verifyUnsubscribeToken = async (
  token: string
): Promise<{ viewerId: string; authorId: string }> => {
  const parts = token.split('.')
  if (parts.length !== 2) {
    throw new ValidationError('Invalid unsubscribe token')
  }

  const [payloadB64, sigB64] = parts as [string, string]

  let payload: Payload
  try {
    payload = decodePayload(payloadB64)
  } catch {
    throw new ValidationError('Invalid unsubscribe token')
  }

  if (!payload.viewerId || !payload.authorId || typeof payload.exp !== 'number') {
    throw new ValidationError('Invalid unsubscribe token')
  }

  if (Date.now() > payload.exp) {
    throw new ValidationError('Unsubscribe token has expired')
  }

  const secret      = await getUnsubscribeSecret()
  const expected    = sign(payloadB64, secret)
  const expectedBuf = Buffer.from(expected, 'base64url')
  const actualBuf   = Buffer.from(sigB64, 'base64url')

  if (expectedBuf.length !== actualBuf.length) {
    throw new ValidationError('Invalid unsubscribe token')
  }
  if (!timingSafeEqual(expectedBuf, actualBuf)) {
    throw new ValidationError('Invalid unsubscribe token')
  }

  return { viewerId: payload.viewerId, authorId: payload.authorId }
}
