// PUT /artworks/{artworkId}/comments/{commentId}/pin — FR-SOC-04
// Author of the piece only. Max 2 pinned comments. Idempotent if already pinned.

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  countPinnedComments,
  docClient,
  getArtPiece,
  getCommentBySk,
  getCommentLookup,
  ok,
  pinComment,
} from '@duseum/shared'

export const pinCommentRoute = async (
  context: DuseumContext,
  artworkId: string,
  commentId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()

  const [artwork, lookup] = await Promise.all([
    getArtPiece(docClient, artworkId),
    getCommentLookup(docClient, commentId),
  ])

  if (!artwork) throw new NotFoundError('Artwork not found')
  if (!lookup)  throw new NotFoundError('Comment not found')

  if (context.userId !== artwork.authorId) {
    throw new ForbiddenError('Only the artwork author may pin comments')
  }

  const comment = await getCommentBySk(docClient, artworkId, lookup.sk)
  if (!comment || comment.isDeleted) throw new NotFoundError('Comment not found')

  // Idempotent — already pinned is fine
  if (comment.isPinned) return ok({ commentId, isPinned: true })

  const pinnedCount = await countPinnedComments(docClient, artworkId)
  if (pinnedCount >= 2) throw new ConflictError('Maximum of 2 pinned comments reached')

  await pinComment(docClient, artworkId, lookup.sk, true)

  return ok({ commentId, isPinned: true })
}
