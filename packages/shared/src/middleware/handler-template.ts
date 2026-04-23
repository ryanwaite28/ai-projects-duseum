// =============================================================================
// packages/shared/src/middleware/handler-template.ts
// Canonical Middy handler assembly — copy this into each Lambda route file.
//
// Middleware order (innermost first):
//   loggerMiddleware → cognitoAuthMiddleware → errorHandlerMiddleware
//
// errorHandlerMiddleware MUST be last so its onError hook wraps all others.
// =============================================================================

import middy from '@middy/core'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from './auth.js'
import { cognitoAuthMiddleware } from './auth.js'
import { errorHandlerMiddleware } from './error-handler.js'
import { loggerMiddleware } from './logger.js'
import { ok } from './responses.js'

/**
 * Example handler — replace with real route logic.
 *
 * Pattern:
 *   export const handler = buildHandler(async (event, context) => { ... })
 */
export const buildHandler = (
  fn: (
    event: APIGatewayProxyEventV2,
    context: DuseumContext
  ) => Promise<APIGatewayProxyStructuredResultV2>
) =>
  middy<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Error, DuseumContext>()
    .use(loggerMiddleware())
    .use(cognitoAuthMiddleware())
    .use(errorHandlerMiddleware())
    .handler(fn)

// ── Example usage (not exported — illustrative only) ──────────────────────────

// export const handler = buildHandler(async (event, context) => {
//   const body = validateBody(MySchema, event.body)
//   const result = await myService.doSomething(body, context.userId)
//   return ok(result)
// })

// Silence unused-import linter for the template itself
void ok
