// =============================================================================
// lambdas/social/src/index.ts
// social-lambda entry point — Section 4.2, 6.3
//
// Routes:
//   GET    /artworks/{artworkId}/comments                          → listCommentsRoute    (public)
//   POST   /artworks/{artworkId}/comments                          → postCommentRoute     (auth)
//   DELETE /comments/{commentId}                                   → deleteCommentRoute   (auth)
//   PUT    /artworks/{artworkId}/comments/{commentId}/pin          → pinCommentRoute      (auth)
//   PUT    /artworks/{artworkId}/reactions                         → upsertReactionRoute  (auth)
//   DELETE /artworks/{artworkId}/reactions                         → deleteReactionRoute  (auth)
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
import { listCommentsRoute }   from './routes/list-comments.js'
import { postCommentRoute }    from './routes/post-comment.js'
import { deleteCommentRoute }  from './routes/delete-comment.js'
import { pinCommentRoute }     from './routes/pin-comment.js'
import { upsertReactionRoute } from './routes/upsert-reaction.js'
import { deleteReactionRoute } from './routes/delete-reaction.js'

const dispatch = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { method, path } = event.requestContext.http
  const artworkId  = event.pathParameters?.['artworkId']
  const commentId  = event.pathParameters?.['commentId']

  // /artworks/{artworkId}/comments/{commentId}/pin
  if (artworkId && commentId && path.endsWith('/pin')) {
    if (method === 'PUT') return pinCommentRoute(context, artworkId, commentId)
  }

  // /artworks/{artworkId}/comments
  if (artworkId && path.endsWith('/comments')) {
    if (method === 'GET')  return listCommentsRoute(event, artworkId)
    if (method === 'POST') return postCommentRoute(event, context, artworkId)
  }

  // /comments/{commentId}
  if (commentId && path.startsWith('/comments/')) {
    if (method === 'DELETE') return deleteCommentRoute(event, context, commentId)
  }

  // /artworks/{artworkId}/reactions
  if (artworkId && path.endsWith('/reactions')) {
    if (method === 'PUT')    return upsertReactionRoute(event, context, artworkId)
    if (method === 'DELETE') return deleteReactionRoute(event, context, artworkId)
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
