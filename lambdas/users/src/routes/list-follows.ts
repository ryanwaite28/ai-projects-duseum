// GET /follows/authors — FR-VIEW-06, §8.8
// Auth required. Lists followed authors with per-author notification pref.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  UnauthorizedError,
  docClient,
  listFollowsByViewer,
  getPreference,
  getAuthorProfile,
  ok,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

export const listFollows = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()
  const viewerId = context.userId

  const qs        = event.queryStringParameters ?? {}
  const limitRaw  = parseInt(qs['limit'] ?? '20', 10)
  const limit     = isNaN(limitRaw) || limitRaw < 1 ? 20 : Math.min(limitRaw, 50)
  const cursorRaw = qs['cursor']
  const lastKey   = cursorRaw
    ? (JSON.parse(Buffer.from(cursorRaw, 'base64url').toString('utf8')) as Record<string, unknown>)
    : undefined

  const { items: follows, lastKey: nextKey } = await listFollowsByViewer(docClient, {
    viewerId,
    limit,
    lastKey,
  })

  const enriched = await Promise.all(
    follows.map(async (follow) => {
      const [pref, author] = await Promise.all([
        getPreference(docClient, viewerId, follow.authorId),
        getAuthorProfile(docClient, follow.authorId),
      ])
      return {
        authorId:         follow.authorId,
        displayName:      author?.displayName ?? null,
        profilePhotoUrl:  null,   // CloudFront signed URL would be resolved here in a full impl
        followedAt:       follow.followedAt,
        notificationPref: pref?.pref ?? 'ALL_NEW_PIECES',
      }
    })
  )

  const nextCursor = nextKey
    ? Buffer.from(JSON.stringify(nextKey)).toString('base64url')
    : null

  return ok({ items: enriched, nextCursor })
}
