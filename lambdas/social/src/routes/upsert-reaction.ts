// PUT /artworks/{artworkId}/reactions — Section 8.7, FR-SOC-01
// Auth required. Replaces any existing reaction for this user.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  docClient,
  getArtPiece,
  getUserReaction,
  upsertReaction,
  isValidReactionType,
  ok,
} from '@duseum/shared'

export const upsertReactionRoute = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()

  let body: { reactionType?: unknown }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    throw new ValidationError('Invalid JSON body')
  }

  const { reactionType } = body
  if (!isValidReactionType(reactionType)) {
    throw new ValidationError('reactionType must be one of LOVE, WOW, FIRE, INSPIRED')
  }

  const artwork = await getArtPiece(docClient, artworkId)
  if (!artwork) throw new NotFoundError('Artwork not found')

  const existing = await getUserReaction(docClient, artworkId, context.userId)

  if (existing?.reactionType === reactionType) {
    return ok({ reactionType })
  }

  const reaction = await upsertReaction(
    docClient,
    artworkId,
    context.userId,
    reactionType,
    new Date().toISOString(),
    existing?.reactionType
  )

  return ok({ reactionType: reaction.reactionType })
}
