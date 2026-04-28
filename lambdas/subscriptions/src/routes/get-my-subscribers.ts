// =============================================================================
// lambdas/subscriptions/src/routes/get-my-subscribers.ts
// GET /subscriptions/me/subscribers — FR-SUB-13
//
// Returns the caller's Author subscribers via GSI-SubscribersByAuthor.
// Requires the caller to have an AuthorProfile (returns 403 otherwise).
// Pagination: optional `cursor` query param (base64 ExclusiveStartKey).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  docClient,
  getAuthorProfile,
  listAuthorSubscribersByAuthor,
  ok,
  ForbiddenError,
  UnauthorizedError,
} from '@duseum/shared'

export const getMySubscribers = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context
  if (!userId) throw new UnauthorizedError()

  const author = await getAuthorProfile(docClient, userId)
  if (!author) throw new ForbiddenError('Author profile required')

  // Decode opaque cursor from query string
  let lastKey: Record<string, unknown> | undefined
  const cursorParam = event.queryStringParameters?.['cursor']
  if (cursorParam) {
    try {
      lastKey = JSON.parse(Buffer.from(cursorParam, 'base64url').toString('utf8')) as Record<string, unknown>
    } catch {
      lastKey = undefined
    }
  }

  const { items, lastKey: nextKey } = await listAuthorSubscribersByAuthor(
    docClient,
    userId,
    lastKey,
  )

  const nextCursor = nextKey
    ? Buffer.from(JSON.stringify(nextKey)).toString('base64url')
    : null

  return ok({
    items: items.map((s) => ({
      userId:               s.userId,
      stripeSubscriptionId: s.stripeSubscriptionId,
      status:               s.status,
      currentPeriodEnd:     s.currentPeriodEnd,
      createdAt:            s.createdAt,
    })),
    nextCursor,
    total: author.subscriberCount,
  })
}
