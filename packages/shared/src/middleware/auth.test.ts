// =============================================================================
// packages/shared/src/middleware/auth.test.ts
// Unit tests for cognitoAuthMiddleware — Section 15.2
// Tests public-path bypass and ENVIRONMENT=local JWT stub.
// Full Cognito verification is not tested here (integration test scope).
// =============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { Request } from '@middy/core'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda'
import { UnauthorizedError } from '../errors/index.js'
import { cognitoAuthMiddleware } from './auth.js'
import type { DuseumContext } from './auth.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeEvent = (
  method: string,
  path: string,
  authHeader?: string
): APIGatewayProxyEventV2 =>
  ({
    headers: authHeader ? { authorization: authHeader } : {},
    requestContext: {
      http: { method, path },
      authorizer: undefined,
    },
  }) as unknown as APIGatewayProxyEventV2

const makeRequest = (
  event: APIGatewayProxyEventV2
): Request<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Error, DuseumContext> =>
  ({
    event,
    context: { awsRequestId: 'req-test' } as unknown as DuseumContext,
    error: null,
    response: null,
    internal: {},
  }) as unknown as Request<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Error, DuseumContext>

// ── Local stub token helpers ──────────────────────────────────────────────────

const makeLocalToken = (sub: string): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url')
  return `${header}.${payload}.fakesig`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cognitoAuthMiddleware', () => {
  beforeEach(() => {
    process.env.ENVIRONMENT = 'local'
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_testpool'
    process.env.COGNITO_CLIENT_ID = 'test-client-id'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ENVIRONMENT
  })

  // ── Public path bypass ─────────────────────────────────────────────────────

  it('bypasses auth for GET /health (public path)', async () => {
    const req = makeRequest(makeEvent('GET', '/health'))
    await expect(cognitoAuthMiddleware().before!(req)).resolves.toBeUndefined()
    expect((req.context as DuseumContext).userId).toBeUndefined()
  })

  it('bypasses auth for GET /artworks (public path)', async () => {
    const req = makeRequest(makeEvent('GET', '/artworks'))
    await expect(cognitoAuthMiddleware().before!(req)).resolves.toBeUndefined()
  })

  it('bypasses auth for GET /artworks/abc-123 (pattern match)', async () => {
    const req = makeRequest(makeEvent('GET', '/artworks/abc-123'))
    await expect(cognitoAuthMiddleware().before!(req)).resolves.toBeUndefined()
  })

  it('bypasses auth for POST /webhooks/stripe', async () => {
    const req = makeRequest(makeEvent('POST', '/webhooks/stripe'))
    await expect(cognitoAuthMiddleware().before!(req)).resolves.toBeUndefined()
  })

  // ── Missing / malformed token ──────────────────────────────────────────────

  it('throws UnauthorizedError when Authorization header is absent on private route', async () => {
    const req = makeRequest(makeEvent('POST', '/artworks'))
    await expect(cognitoAuthMiddleware().before!(req)).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws UnauthorizedError when header does not start with "Bearer "', async () => {
    const req = makeRequest(makeEvent('POST', '/artworks', 'Token abc123'))
    await expect(cognitoAuthMiddleware().before!(req)).rejects.toBeInstanceOf(UnauthorizedError)
  })

  // ── ENVIRONMENT=local stub ─────────────────────────────────────────────────

  it('accepts a stub token and extracts sub in local mode', async () => {
    const token = makeLocalToken('user-sub-42')
    const req = makeRequest(makeEvent('POST', '/artworks', `Bearer ${token}`))
    await cognitoAuthMiddleware().before!(req)
    expect((req.context as DuseumContext).userId).toBe('user-sub-42')
  })

  it('defaults userId to "local-user" when token has no sub in local mode', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ email: 'x@x.com' })).toString('base64url')
    const token = `${header}.${payload}.fakesig`
    const req = makeRequest(makeEvent('POST', '/artworks', `Bearer ${token}`))
    await cognitoAuthMiddleware().before!(req)
    expect((req.context as DuseumContext).userId).toBe('local-user')
  })

  it('throws UnauthorizedError for a completely invalid token format in local mode', async () => {
    const req = makeRequest(makeEvent('POST', '/artworks', 'Bearer notavalidjwt'))
    await expect(cognitoAuthMiddleware().before!(req)).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
