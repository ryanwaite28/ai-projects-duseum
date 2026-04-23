// =============================================================================
// packages/shared/src/middleware/error-handler.test.ts
// Unit tests for errorHandlerMiddleware — Section 15.2
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request } from '@middy/core'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda'
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from '../errors/index.js'
import { errorHandlerMiddleware } from './error-handler.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeRequest = (
  error: unknown
): Request<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2> =>
  ({
    event: {} as APIGatewayProxyEventV2,
    context: { awsRequestId: 'req-123' } as unknown as Context,
    error,
    response: null,
    internal: {},
  }) as unknown as Request<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2>

const parseBody = (req: ReturnType<typeof makeRequest>) =>
  JSON.parse((req.response as APIGatewayProxyStructuredResultV2).body!)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('errorHandlerMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('converts NotFoundError to 404 with NOT_FOUND code', () => {
    const req = makeRequest(new NotFoundError('Artwork not found'))
    errorHandlerMiddleware().onError!(req)
    expect((req.response as APIGatewayProxyStructuredResultV2).statusCode).toBe(404)
    expect(parseBody(req)).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Artwork not found', requestId: 'req-123' },
    })
  })

  it('converts UnauthorizedError to 401 with UNAUTHORIZED code', () => {
    const req = makeRequest(new UnauthorizedError())
    errorHandlerMiddleware().onError!(req)
    expect((req.response as APIGatewayProxyStructuredResultV2).statusCode).toBe(401)
    expect(parseBody(req).error.code).toBe('UNAUTHORIZED')
  })

  it('converts ForbiddenError to 403 with FORBIDDEN code', () => {
    const req = makeRequest(new ForbiddenError())
    errorHandlerMiddleware().onError!(req)
    expect((req.response as APIGatewayProxyStructuredResultV2).statusCode).toBe(403)
    expect(parseBody(req).error.code).toBe('FORBIDDEN')
  })

  it('converts ValidationError to 400 with VALIDATION_ERROR code', () => {
    const req = makeRequest(new ValidationError('name: Required'))
    errorHandlerMiddleware().onError!(req)
    expect((req.response as APIGatewayProxyStructuredResultV2).statusCode).toBe(400)
    expect(parseBody(req).error.code).toBe('VALIDATION_ERROR')
  })

  it('converts unknown error to 500 with INTERNAL_ERROR and hides message', () => {
    const req = makeRequest(new Error('db connection string leaked'))
    errorHandlerMiddleware().onError!(req)
    expect((req.response as APIGatewayProxyStructuredResultV2).statusCode).toBe(500)
    const body = parseBody(req)
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.message).not.toContain('db connection string leaked')
  })

  it('converts non-Error thrown value to 500', () => {
    const req = makeRequest('string error')
    errorHandlerMiddleware().onError!(req)
    expect((req.response as APIGatewayProxyStructuredResultV2).statusCode).toBe(500)
    expect(parseBody(req).error.code).toBe('INTERNAL_ERROR')
  })

  it('includes requestId from context in response body', () => {
    const req = makeRequest(new AppError(422, 'CUSTOM', 'test'))
    errorHandlerMiddleware().onError!(req)
    expect(parseBody(req).error.requestId).toBe('req-123')
  })

  it('sets Content-Type: application/json header', () => {
    const req = makeRequest(new NotFoundError())
    errorHandlerMiddleware().onError!(req)
    expect(
      (req.response as APIGatewayProxyStructuredResultV2).headers?.['Content-Type']
    ).toBe('application/json')
  })

  it('uses "unknown" requestId when awsRequestId is absent', () => {
    const req = makeRequest(new NotFoundError())
    ;(req.context as unknown as Record<string, unknown>).awsRequestId = undefined
    errorHandlerMiddleware().onError!(req)
    expect(parseBody(req).error.requestId).toBe('unknown')
  })
})
