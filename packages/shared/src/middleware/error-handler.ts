// =============================================================================
// packages/shared/src/middleware/error-handler.ts
// Middy onError middleware — converts AppError → structured JSON response.
// Never leaks stack traces to clients.
// =============================================================================

import type { MiddlewareObj, Request } from '@middy/core'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { AppError } from '../errors/index.js'
import { logger } from './logger.js'

// ── Error response shape ───────────────────────────────────────────────────────

export interface ErrorResponseBody {
  error: {
    code: string
    message: string
    requestId: string
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const jsonResponse = (
  statusCode: number,
  body: ErrorResponseBody
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// ── Middleware ─────────────────────────────────────────────────────────────────

/**
 * Must be the LAST middleware added so its `onError` hook fires after all
 * others. Catches any error thrown during handler or earlier middleware
 * and converts it to a well-shaped API response.
 *
 * AppError subclasses → their status code + code + message
 * Unknown errors      → 500 INTERNAL_ERROR (message hidden from client)
 */
export const errorHandlerMiddleware = (): MiddlewareObj<
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
> => ({
  onError: (
    request: Request<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2>
  ) => {
    const { error, context } = request
    const requestId = context.awsRequestId ?? 'unknown'

    if (error instanceof AppError) {
      logger.warn('AppError', {
        code: error.code,
        statusCode: error.statusCode,
        errorMessage: error.message,
        requestId,
      })

      request.response = jsonResponse(error.statusCode, {
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      })
      return
    }

    // Unknown / unexpected errors — log details server-side, hide from client
    logger.error('Unexpected error', {
      error,
      requestId,
    })

    request.response = jsonResponse(500, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    })
  },
})
