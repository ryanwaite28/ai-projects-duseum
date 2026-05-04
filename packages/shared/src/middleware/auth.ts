// =============================================================================
// packages/shared/src/middleware/auth.ts
// Cognito JWT verification middleware for Middy
// Supports public path bypass and ENVIRONMENT=local stub.
// =============================================================================

import { CognitoJwtVerifier } from 'aws-jwt-verify'
import type { MiddlewareObj } from '@middy/core'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda'
import { UnauthorizedError } from '../errors/index.js'

// ── Extended context type ─────────────────────────────────────────────────────

/**
 * Lambda context augmented with the verified Cognito sub (userId) and
 * Cognito group memberships (userGroups). Downstream middleware and handlers
 * receive this via `request.context`.
 */
export interface DuseumContext extends Context {
  userId: string
  userGroups: string[]
}

/**
 * APIGatewayProxyEventV2 paired with DuseumContext for typed handlers.
 */
export type DuseumEvent = APIGatewayProxyEventV2

// ── Verifier singleton ────────────────────────────────────────────────────────

let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

const getVerifier = () => {
  if (!_verifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID!
    const clientId = process.env.COGNITO_CLIENT_ID!
    _verifier = CognitoJwtVerifier.create({
      userPoolId,
      clientId,
      tokenUse: 'access',
    })
  }
  return _verifier
}

// ── Public paths (no auth required) ──────────────────────────────────────────

const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  'GET /health',
  'GET /artworks',
  'GET /artworks/{artworkId}',
  'GET /artworks/{artworkId}/comments',
  'GET /authors',
  'GET /authors/{authorId}',
  'GET /authors/{authorId}/artworks',
  'GET /authors/{authorId}/collections',
  'GET /collections',
  'GET /collections/{collectionId}',
  'GET /users/{userId}/profile',
  'GET /notifications/unsubscribe',
  'POST /webhooks/stripe',
  // features-lambda public routes (no JWT required)
  'GET /features/daily',
  'GET /features/weekly',
  'GET /features/weekly/availability',
])

const isPublicPath = (event: APIGatewayProxyEventV2): boolean => {
  const method = event.requestContext.http.method
  const path = event.requestContext.http.path
  const key = `${method} ${path}`
  if (PUBLIC_PATHS.has(key)) return true

  // Pattern-match for paths with dynamic segments already resolved by APIGW
  // e.g. GET /artworks/abc123 → matches GET /artworks/{artworkId}
  for (const pattern of PUBLIC_PATHS) {
    const regex = new RegExp(
      '^' + pattern.replace(/\{[^}]+\}/g, '[^/]+') + '$'
    )
    if (regex.test(key)) return true
  }
  return false
}

// ── Middleware ─────────────────────────────────────────────────────────────────

/**
 * Middy middleware that validates the Cognito access token in the
 * Authorization header and writes the verified `sub` to `context.userId`.
 *
 * - Skips verification for public paths.
 * - When `ENVIRONMENT=local`, any non-empty token is accepted and `sub` is
 *   taken from the token payload without signature verification (dev only).
 */
export const cognitoAuthMiddleware = (): MiddlewareObj<
  DuseumEvent,
  APIGatewayProxyStructuredResultV2,
  Error,
  DuseumContext
> => ({
  before: async (request) => {
    const { event, context } = request

    if (isPublicPath(event)) {
      context.userGroups = []

      // Optional auth: if a Bearer token is present, try to extract the caller
      // identity so routes can apply auth-aware logic (subscriber access, owner
      // view) without requiring authentication. Failures are silently ignored.
      const optHeader = event.headers?.['authorization'] ?? event.headers?.['Authorization']
      if (optHeader?.startsWith('Bearer ')) {
        const optToken = optHeader.slice(7)
        try {
          if (process.env.ENVIRONMENT === 'local') {
            const payloadB64 = optToken.split('.')[1]
            if (payloadB64) {
              const payload = JSON.parse(
                Buffer.from(payloadB64, 'base64url').toString('utf8')
              ) as { sub?: string; 'cognito:groups'?: string[] }
              if (payload.sub) {
                context.userId = payload.sub
                context.userGroups = payload['cognito:groups'] ?? []
              }
            }
          } else {
            const payload = await getVerifier().verify(optToken)
            context.userId = payload.sub
            context.userGroups = (payload['cognito:groups'] as string[] | undefined) ?? []
          }
        } catch { /* invalid token on public path — treat as unauthenticated */ }
      }

      return
    }

    const authHeader =
      event.headers?.['authorization'] ?? event.headers?.['Authorization']

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header')
    }

    const token = authHeader.slice(7)

    if (process.env.ENVIRONMENT === 'local') {
      // Local stub: decode payload without verification so devs can pass
      // a hand-crafted JWT or a real Cognito token against MiniStack.
      try {
        const payloadB64 = token.split('.')[1]
        if (!payloadB64) throw new Error('Invalid token format')
        const payload = JSON.parse(
          Buffer.from(payloadB64, 'base64url').toString('utf8')
        ) as { sub?: string; 'cognito:groups'?: string[] }
        context.userId     = payload.sub ?? 'local-user'
        context.userGroups = payload['cognito:groups'] ?? []
      } catch {
        throw new UnauthorizedError('Invalid token')
      }
      return
    }

    try {
      const payload = await getVerifier().verify(token)
      context.userId     = payload.sub
      context.userGroups = (payload['cognito:groups'] as string[] | undefined) ?? []
    } catch {
      throw new UnauthorizedError('Invalid or expired token')
    }
  },
})
