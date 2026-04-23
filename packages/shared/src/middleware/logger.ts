// =============================================================================
// packages/shared/src/middleware/logger.ts
// Structured logger singleton + Middy middleware that injects requestId/userId
// Uses @aws-lambda-powertools/logger v2
// =============================================================================

import { Logger } from '@aws-lambda-powertools/logger'
import type { MiddlewareObj } from '@middy/core'
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda'

// ── Singleton ─────────────────────────────────────────────────────────────────

export const logger = new Logger({
  serviceName: process.env.SERVICE_NAME ?? 'duseum',
  logLevel:
    process.env.LOG_LEVEL === 'DEBUG'
      ? 'DEBUG'
      : process.env.ENVIRONMENT === 'local'
        ? 'DEBUG'
        : 'INFO',
})

// ── Middleware ─────────────────────────────────────────────────────────────────

/**
 * Middy middleware that adds requestId and (when present) userId to every
 * subsequent log line emitted from the logger singleton during this invocation.
 *
 * Usage: `.use(loggerMiddleware())`
 */
export const loggerMiddleware = (): MiddlewareObj<APIGatewayProxyEventV2> => ({
  before: ({ event, context }) => {
    logger.addContext(context)

    const userId =
      // Cognito sub injected by cognitoAuthMiddleware via context.authorizer
      (context as Context & { userId?: string }).userId ??
      (event.requestContext as unknown as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } })?.authorizer?.jwt?.claims?.['sub'] as string | undefined

    if (userId) {
      logger.appendKeys({ userId })
    }
  },

  after: () => {
    logger.resetKeys()
  },

  onError: ({ error }) => {
    logger.error('Unhandled error in handler', { error })
    logger.resetKeys()
  },
})
