// =============================================================================
// lambdas/features/src/index.ts
// features-lambda entry point — Section 4.2, 8.9
//
// Routes:
//   GET  /features/homepage                → getHomepage        (public)
//   GET  /features/daily                   → getDailyFeature    (public)
//   GET  /features/weekly                  → getWeeklyFeature   (public)
//   GET  /features/weekly/availability     → getWeeklyAvailability (public)
//   POST /features/weekly/book             → bookWeeklyFeature  (Author only)
//   GET  /features/weekly/my-bookings      → getMyBookings      (Author only)
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
import { getHomepage }              from './routes/get-homepage.js'
import { getDailyFeature }          from './routes/get-daily.js'
import { getWeeklyFeature }         from './routes/get-weekly.js'
import { getWeeklyAvailability }    from './routes/get-weekly-availability.js'
import { bookWeeklyFeature }        from './routes/book-weekly.js'
import { getMyBookings }            from './routes/get-my-bookings.js'

const dispatch = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { method, path } = event.requestContext.http
  const segments = path.split('/').filter(Boolean)
  const [seg0, seg1, seg2] = segments

  if (seg0 !== 'features') throw new NotFoundError()

  if (seg1 === 'homepage' && method === 'GET') {
    return getHomepage()
  }

  if (seg1 === 'daily' && method === 'GET') {
    return getDailyFeature(event, context)
  }

  if (seg1 === 'weekly') {
    if (method === 'GET' && !seg2)                     return getWeeklyFeature(event, context)
    if (method === 'GET' && seg2 === 'availability')   return getWeeklyAvailability(event, context)
    if (method === 'POST' && seg2 === 'book')          return bookWeeklyFeature(event, context)
    if (method === 'GET' && seg2 === 'my-bookings')    return getMyBookings(event, context)
  }

  throw new NotFoundError()
}

export const handler = middy(dispatch)
  .use(loggerMiddleware())
  .use(cognitoAuthMiddleware())
  .use(errorHandlerMiddleware())
