// DELETE /admin/comments/{commentId} — hide a comment (policy violation).
// FR-ADMIN-03: Admins can hide comments that violate platform policies.
//
// Uses the shadow lookup record (COMMENT#{id}/METADATA) to resolve the full key,
// then soft-deletes via the existing softDeleteComment transaction.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ConflictError,
  NotFoundError,
  docClient,
  getCommentBySk,
  getCommentLookup,
  ok,
  softDeleteComment,
} from '@duseum/shared'

export const hideComment = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  commentId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const lookup = await getCommentLookup(docClient, commentId)
  if (!lookup) throw new NotFoundError('Comment not found')

  const comment = await getCommentBySk(docClient, lookup.artworkId, lookup.sk)
  if (!comment) throw new NotFoundError('Comment not found')
  if (comment.isDeleted) throw new ConflictError('Comment is already hidden')

  const now = new Date().toISOString()
  await softDeleteComment(docClient, lookup.artworkId, lookup.sk, context.userId, now)

  return ok({ commentId, hidden: true, hiddenAt: now })
}
