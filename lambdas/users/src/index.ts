// =============================================================================
// lambdas/users/src/index.ts
// users-lambda entry point — Section 4.2, 8.4, 8.5, 8.8
//
// Routes:
//   GET    /users/me                                 → getMe                    (🔒 JWT)
//   PUT    /users/me/viewer                          → updateViewer             (🔒 JWT)
//   POST   /users/me/author                          → createAuthor             (🔒 JWT)
//   PUT    /users/me/author                          → updateAuthor             (🔒 JWT)
//   GET    /users/me/notification-preferences        → getNotificationPrefs     (🔒 JWT)
//   PUT    /users/me/notification-preferences        → updateNotificationPrefs  (🔒 JWT)
//   GET    /users/{userId}/profile                   → getUserProfile           (public)
//   GET    /authors                                  → listAuthors              (public)
//   GET    /authors/{authorId}                       → getAuthor                (public)
//   GET    /authors/{authorId}/collections           → getAuthorCollections     (public)
//   POST   /follows/authors/{authorId}               → followAuthor             (🔒 JWT)
//   DELETE /follows/authors/{authorId}               → unfollowAuthor           (🔒 JWT)
//   GET    /follows/authors                          → listFollows              (🔒 JWT)
//   GET    /notifications/unsubscribe                → unsubscribe              (public)
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
import { getMe }                    from './routes/get-me.js'
import { updateViewer }             from './routes/update-viewer.js'
import { createAuthor }             from './routes/create-author.js'
import { updateAuthor }             from './routes/update-author.js'
import { getUserProfile }           from './routes/get-user-profile.js'
import { listAuthors }              from './routes/list-authors.js'
import { getAuthor }                from './routes/get-author.js'
import { getAuthorCollections }     from './routes/get-author-collections.js'
import { followAuthor }             from './routes/follow-author.js'
import { unfollowAuthor }           from './routes/unfollow-author.js'
import { listFollows }              from './routes/list-follows.js'
import { getNotificationPrefs }     from './routes/get-notification-prefs.js'
import { updateNotificationPrefs }  from './routes/update-notification-prefs.js'
import { unsubscribe }              from './routes/unsubscribe.js'

const dispatch = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { method, path } = event.requestContext.http
  const userId   = event.pathParameters?.['userId']
  const authorId = event.pathParameters?.['authorId']

  // /users/me routes — most-specific first
  if (method === 'GET'  && path === '/users/me/notification-preferences') return getNotificationPrefs(context)
  if (method === 'PUT'  && path === '/users/me/notification-preferences') return updateNotificationPrefs(event, context)
  if (method === 'GET'  && path === '/users/me')          return getMe(context)
  if (method === 'PUT'  && path === '/users/me/viewer')   return updateViewer(event, context)
  if (method === 'POST' && path === '/users/me/author')   return createAuthor(event, context)
  if (method === 'PUT'  && path === '/users/me/author')   return updateAuthor(event, context)

  // /users/{userId}/profile
  if (method === 'GET'  && userId && path.endsWith('/profile')) return getUserProfile(userId)

  // /authors routes
  if (method === 'GET'  && path === '/authors')                        return listAuthors(event)
  if (method === 'GET'  && authorId && path.endsWith('/collections'))  return getAuthorCollections(authorId)
  if (method === 'GET'  && authorId)                                   return getAuthor(event, authorId)

  // /follows routes
  if (method === 'GET'    && path === '/follows/authors')                      return listFollows(event, context)
  if (method === 'POST'   && authorId && path.startsWith('/follows/authors/')) return followAuthor(context, authorId)
  if (method === 'DELETE' && authorId && path.startsWith('/follows/authors/')) return unfollowAuthor(context, authorId)

  // /notifications/unsubscribe (public)
  if (method === 'GET' && path === '/notifications/unsubscribe') return unsubscribe(event)

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
