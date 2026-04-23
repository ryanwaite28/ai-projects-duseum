// =============================================================================
// lambdas/subscriptions/src/routes/get-my-subscriptions.ts
// GET /subscriptions/me — Section 8.6, FR-SUB-03
//
// Returns the caller's platform subscription and all Author subscriptions
// stored in DynamoDB. Active subscriptions are those with status != CANCELLED.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  docClient,
  listUserSubscriptions,
  ok,
} from '@duseum/shared'
import type { Subscription } from '@duseum/shared'

export const getMySubscriptions = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const all = await listUserSubscriptions(docClient, userId)

  const platform: Subscription | null =
    all.find((s) => s.targetId === 'PLATFORM') ?? null

  const authorSubscriptions = all.filter((s) => s.targetId !== 'PLATFORM')

  return ok({ platform, authorSubscriptions })
}
