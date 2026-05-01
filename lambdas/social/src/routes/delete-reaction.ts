// DELETE /artworks/{artworkId}/reactions — Section 8.7, FR-SOC-01
// Auth required. Removes the user's reaction for this artwork.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  UnauthorizedError,
  docClient,
  getUserReaction,
  deleteReaction,
  noContent,
} from '@duseum/shared'

export const deleteReactionRoute = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()

  const existing = await getUserReaction(docClient, artworkId, context.userId)
  if (!existing) return noContent()

  await deleteReaction(docClient, artworkId, context.userId, existing.reactionType)

  return noContent()
}
