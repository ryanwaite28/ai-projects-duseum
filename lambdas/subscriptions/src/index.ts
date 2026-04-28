// =============================================================================
// lambdas/subscriptions/src/index.ts
// subscriptions-lambda entry point — Section 4.2, 8.6
//
// Routes (plain TypeScript switch — no Express, no Hono):
//   GET    /subscriptions/me                         → getMySubscriptions     (JWT required)
//   GET    /subscriptions/me/subscribers             → getMySubscribers       (JWT required)
//   POST   /subscriptions/platform                   → createPlatformCheckout (JWT required)
//   POST   /subscriptions/authors/{authorId}         → createAuthorCheckout   (JWT required)
//   POST   /subscriptions/portal                     → createPortalSession     (JWT required)
//   POST   /subscriptions/connect/onboard            → connectOnboard         (JWT required)
//   GET    /subscriptions/connect/status             → connectStatus          (JWT required)
//   POST   /users/me/author/subscription-price       → setSubscriptionPrice   (JWT required)
// =============================================================================

import middy from '@middy/core'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  cognitoAuthMiddleware,
  errorHandlerMiddleware,
  loggerMiddleware,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'
import { getMySubscriptions }     from './routes/get-my-subscriptions.js'
import { getMySubscribers }       from './routes/get-my-subscribers.js'
import { createPlatformCheckout } from './routes/create-platform-checkout.js'
import { createAuthorCheckout }   from './routes/create-author-checkout.js'
import { createPortalSession }    from './routes/create-portal-session.js'
import { connectOnboard }         from './routes/connect-onboard.js'
import { connectStatus }          from './routes/connect-status.js'
import { setSubscriptionPrice }   from './routes/set-subscription-price.js'

const dispatch = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { method, path } = event.requestContext.http
  const authorId = event.pathParameters?.['authorId']

  // GET /subscriptions/me/subscribers (must come before /me)
  if (method === 'GET' && path.endsWith('/me/subscribers')) {
    return getMySubscribers(event, context)
  }

  // GET /subscriptions/me
  if (method === 'GET' && path.endsWith('/me')) {
    return getMySubscriptions(event, context)
  }

  // GET /subscriptions/connect/status
  if (method === 'GET' && path.endsWith('/connect/status')) {
    return connectStatus(event, context)
  }

  // POST /subscriptions/connect/onboard
  if (method === 'POST' && path.endsWith('/connect/onboard')) {
    return connectOnboard(event, context)
  }

  // POST /subscriptions/portal
  if (method === 'POST' && path.endsWith('/portal')) {
    return createPortalSession(event, context)
  }

  // POST /subscriptions/platform
  if (method === 'POST' && path.endsWith('/platform')) {
    return createPlatformCheckout(event, context)
  }

  // POST /users/me/author/subscription-price
  if (method === 'POST' && path.endsWith('/subscription-price')) {
    return setSubscriptionPrice(event, context)
  }

  // POST /subscriptions/authors/{authorId}
  if (method === 'POST' && authorId) {
    return createAuthorCheckout(event, context, authorId)
  }

  throw new NotFoundError(`Route not found: ${method} ${path}`)
}

export const handler = middy<
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Error,
  DuseumContext
>()
  .use(loggerMiddleware())
  .use(cognitoAuthMiddleware())
  .use(errorHandlerMiddleware())
  .handler(dispatch)
