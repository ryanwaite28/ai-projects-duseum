// =============================================================================
// lambdas/admin/src/index.ts
// admin-lambda entry point — Section 4.2, 8.10
//
// All routes require ADMIN Cognito group membership (enforced by
// requireAdminMiddleware, which runs after cognitoAuthMiddleware).
//
// Routes:
//   GET    /admin/users                                        → listUsers
//   PUT    /admin/users/{userId}/suspend                       → suspendUser
//   PUT    /admin/users/{userId}/reinstate                     → reinstateUser
//   PUT    /admin/users/{userId}/profiles/{type}/suspend       → suspendProfile
//   DELETE /admin/artworks/{artworkId}                         → removeArtwork
//   DELETE /admin/comments/{commentId}                         → hideComment
//   GET    /admin/config                                        → getConfig
//   PUT    /admin/config                                        → updateConfig
//   GET    /admin/dashboard                                     → adminDashboard
//   PUT    /admin/features/daily/override                       → overrideDailyFeature
//   DELETE /admin/features/weekly/bookings/{id}                 → cancelBooking
//   GET    /admin/features/weekly                               → listBookings
// =============================================================================

import middy from '@middy/core'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  cognitoAuthMiddleware,
  requireAdminMiddleware,
  errorHandlerMiddleware,
  loggerMiddleware,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'
import { overrideDailyFeature } from './routes/override-daily-feature.js'
import { cancelBooking }        from './routes/cancel-booking.js'
import { listBookings }         from './routes/list-bookings.js'
import { listUsers }            from './routes/list-users.js'
import { suspendUser }          from './routes/suspend-user.js'
import { reinstateUser }        from './routes/reinstate-user.js'
import { suspendProfile }       from './routes/suspend-profile.js'
import { removeArtwork }        from './routes/remove-artwork.js'
import { hideComment }          from './routes/hide-comment.js'
import { getConfig }            from './routes/get-config.js'
import { updateConfig }         from './routes/update-config.js'
import { adminDashboard }       from './routes/admin-dashboard.js'

const dispatch = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { method, path } = event.requestContext.http
  const segments = path.split('/').filter(Boolean)
  // [0]=admin [1]=users|artworks|comments|config|dashboard|features
  // [2]=userId|artworkId|commentId|...  [3]=suspend|reinstate|profiles|...
  // [4]=profileType|bookings|...        [5]=suspend
  const [seg0, seg1, seg2, seg3, seg4, seg5] = segments

  if (seg0 !== 'admin') throw new NotFoundError()

  // ── User management ────────────────────────────────────────────────────────
  if (seg1 === 'users') {
    if (method === 'GET' && !seg2)                                      return listUsers(event, context)
    if (seg2 && seg3 === 'suspend'   && method === 'PUT')               return suspendUser(event, context, seg2)
    if (seg2 && seg3 === 'reinstate' && method === 'PUT')               return reinstateUser(event, context, seg2)
    if (seg2 && seg3 === 'profiles' && seg4 && seg5 === 'suspend' && method === 'PUT')
                                                                        return suspendProfile(event, context, seg2, seg4)
  }

  // ── Content moderation ─────────────────────────────────────────────────────
  if (seg1 === 'artworks' && seg2 && method === 'DELETE')               return removeArtwork(event, context, seg2)
  if (seg1 === 'comments' && seg2 && method === 'DELETE')               return hideComment(event, context, seg2)

  // ── Platform config ────────────────────────────────────────────────────────
  if (seg1 === 'config'    && method === 'GET')                         return getConfig(event, context)
  if (seg1 === 'config'    && method === 'PUT')                         return updateConfig(event, context)
  if (seg1 === 'dashboard' && method === 'GET')                         return adminDashboard(event, context)

  // ── Feature management (existing) ─────────────────────────────────────────
  if (seg1 === 'features') {
    if (seg2 === 'daily' && seg3 === 'override' && method === 'PUT') {
      return overrideDailyFeature(event, context)
    }
    if (seg2 === 'weekly') {
      if (method === 'GET' && !seg3)                                    return listBookings(event, context)
      if (seg3 === 'bookings' && seg4 && method === 'DELETE')           return cancelBooking(event, context, seg4)
    }
  }

  throw new NotFoundError()
}

export const handler = middy(dispatch)
  .use(loggerMiddleware())
  .use(cognitoAuthMiddleware())
  .use(requireAdminMiddleware())
  .use(errorHandlerMiddleware())
