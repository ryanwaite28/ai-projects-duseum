// =============================================================================
// lambdas/subscriptions-webhook/src/handlers/account-events.ts
// Handles Stripe Connect account.updated events — FR-SUB-13
//
// Flow:
//   1. Resolve userId via the CONNECT#{stripeConnectAccountId}/META reverse-
//      lookup record (Section 4.7 — written by POST /subscriptions/connect/onboard)
//   2. If no record found, the Connect account is not associated with any
//      Duseum Author — log and return (not an error; Stripe fires account.updated
//      for all connected accounts, including incomplete onboardings)
//   3. Cache account.charges_enabled on the Author DynamoDB record so
//      GET /subscriptions/connect/status can avoid a live Stripe API call
// =============================================================================

import { GetCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { Account } from '@duseum/shared'
import { Logger } from '@aws-lambda-powertools/logger'
import { TABLE_NAME, updateAuthorProfile } from '@duseum/shared'

const logger = new Logger({ serviceName: 'subscriptions-webhook-lambda' })

export const handleAccountUpdated = async (
  client: DynamoDBDocumentClient,
  stripeConnectAccountId: string,
  account: Account
): Promise<void> => {
  // 1. Resolve userId from reverse-lookup record
  const lookupResult = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CONNECT#${stripeConnectAccountId}`, SK: 'META' },
    })
  )

  if (!lookupResult.Item) {
    logger.warn('account.updated: no Duseum Author found for Connect account — skipping', {
      stripeConnectAccountId,
    })
    return
  }

  const userId = lookupResult.Item['userId'] as string

  // 2. Cache charges_enabled on the Author record (idempotent SET)
  await updateAuthorProfile(client, userId, {
    connectChargesEnabled: account.charges_enabled,
  })

  logger.info('account.updated: cached connectChargesEnabled on Author profile', {
    userId,
    stripeConnectAccountId,
    chargesEnabled: account.charges_enabled,
  })
}
