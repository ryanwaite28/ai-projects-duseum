// DELETE /comments/{commentId} — Section 8.7, FR-SOC-05
// Auth required. Own comment or artwork author may delete.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  docClient,
  getCommentLookup,
  getCommentBySk,
  softDeleteComment,
  noContent,
} from '@duseum/shared'

export const deleteCommentRoute = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  commentId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()

  const lookup = await getCommentLookup(docClient, commentId)
  if (!lookup) throw new NotFoundError('Comment not found')

  const comment = await getCommentBySk(docClient, lookup.artworkId, lookup.sk)
  if (!comment || comment.isDeleted) throw new NotFoundError('Comment not found')

  const isCommentAuthor  = context.userId === lookup.authorId
  const isArtworkAuthor  = context.userId === lookup.artworkAuthorId

  if (!isCommentAuthor && !isArtworkAuthor) {
    throw new ForbiddenError('Not authorized to delete this comment')
  }

  await softDeleteComment(
    docClient,
    lookup.artworkId,
    lookup.sk,
    context.userId,
    new Date().toISOString()
  )

  return noContent()
}
