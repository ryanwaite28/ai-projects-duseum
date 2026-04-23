// POST /artworks/{artworkId}/comments — Section 8.7, FR-SOC-02–03
// Auth required. Max 1,000 chars. One-level nesting only.

import { randomUUID } from 'crypto'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  docClient,
  createComment,
  getArtPiece,
  getParentComment,
  created,
} from '@duseum/shared'

export const postCommentRoute = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()

  let body: { body?: unknown; parentCommentId?: unknown }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    throw new ValidationError('Invalid JSON body')
  }

  const commentBody    = body.body
  const parentId       = body.parentCommentId ?? null

  if (typeof commentBody !== 'string' || commentBody.trim().length === 0) {
    throw new ValidationError('body is required')
  }
  if (commentBody.length > 1000) {
    throw new ValidationError('body must be 1,000 characters or fewer')
  }
  if (parentId !== null && typeof parentId !== 'string') {
    throw new ValidationError('parentCommentId must be a string or null')
  }

  const artwork = await getArtPiece(docClient, artworkId)
  if (!artwork) throw new NotFoundError('Artwork not found')
  if (!artwork.commentsEnabled) throw new ForbiddenError('Comments are disabled on this artwork')

  if (parentId) {
    const parent = await getParentComment(docClient, artworkId, parentId)
    if (!parent) throw new NotFoundError('Parent comment not found')
    if (parent.isDeleted) throw new ValidationError('Cannot reply to a deleted comment')
    if (parent.parentCommentId !== null) {
      throw new ValidationError('Replies to replies are not allowed (one-level nesting only)')
    }
  }

  const comment = await createComment(docClient, {
    commentId:       randomUUID(),
    artworkId,
    artworkAuthorId: artwork.authorId,
    authorId:        context.userId,
    body:            commentBody.trim(),
    parentCommentId: parentId,
    createdAt:       new Date().toISOString(),
  })

  return created(comment)
}
