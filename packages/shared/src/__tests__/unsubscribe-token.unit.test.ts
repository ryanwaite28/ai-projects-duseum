// =============================================================================
// packages/shared/src/__tests__/unsubscribe-token.unit.test.ts
// Unit tests for HMAC-based unsubscribe token — FR-NOTIF-08, §15.2
// =============================================================================

import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'crypto'

// Mock the secrets module before importing the token utility
vi.mock('../secrets.js', () => ({
  getUnsubscribeSecret: vi.fn().mockResolvedValue('test-hmac-secret-for-unit-tests'),
}))

import { generateUnsubscribeToken, verifyUnsubscribeToken } from '../auth/unsubscribe-token.js'

const VIEWER_ID = 'viewer-unit-test-001'
const AUTHOR_ID = 'author-unit-test-001'
const SECRET    = 'test-hmac-secret-for-unit-tests'

const buildExpiredToken = (): string => {
  const payload = Buffer.from(JSON.stringify({
    viewerId: VIEWER_ID,
    authorId: AUTHOR_ID,
    exp:      Date.now() - 1_000,
  })).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

describe('generateUnsubscribeToken + verifyUnsubscribeToken', () => {
  it('round-trips correctly and returns viewerId + authorId', async () => {
    const token = await generateUnsubscribeToken(VIEWER_ID, AUTHOR_ID)
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(2)

    const result = await verifyUnsubscribeToken(token)
    expect(result.viewerId).toBe(VIEWER_ID)
    expect(result.authorId).toBe(AUTHOR_ID)
  })

  it('throws on an expired token', async () => {
    const token = buildExpiredToken()
    await expect(verifyUnsubscribeToken(token)).rejects.toThrow('expired')
  })

  it('throws when the payload is tampered', async () => {
    const token = await generateUnsubscribeToken(VIEWER_ID, AUTHOR_ID)
    const [payloadB64, sig] = token.split('.') as [string, string]

    const tamperedPayload = payloadB64.slice(0, -1) + (payloadB64.endsWith('a') ? 'b' : 'a')
    const tampered = `${tamperedPayload}.${sig}`

    await expect(verifyUnsubscribeToken(tampered)).rejects.toThrow()
  })

  it('throws when the signature is tampered', async () => {
    const token = await generateUnsubscribeToken(VIEWER_ID, AUTHOR_ID)
    const [payload, sig] = token.split('.') as [string, string]

    const tamperedSig = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a')
    await expect(verifyUnsubscribeToken(`${payload}.${tamperedSig}`)).rejects.toThrow()
  })

  it('throws when the token has no dot separator', async () => {
    await expect(verifyUnsubscribeToken('nodot')).rejects.toThrow()
  })
})
