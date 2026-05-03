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
//   4. If charges_enabled just flipped false→true, fire onboarding-complete email
// =============================================================================

import { GetCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { Account } from '@duseum/shared'
import { Logger } from '@aws-lambda-powertools/logger'
import {
  TABLE_NAME,
  updateAuthorProfile,
  getAuthorProfile,
  getUserAccount,
  sendConnectOnboardingCompleteEmail,
} from '@duseum/shared'

const logger = new Logger({ serviceName: 'subscriptions-webhook-lambda' })

const BASE_URL = process.env['APP_BASE_URL'] ?? 'https://duseum.com'

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

  // 2. Read current charges_enabled before overwriting to detect false→true transition
  const existingProfile = await getAuthorProfile(client, userId)
  const wasChargesEnabled = existingProfile?.connectChargesEnabled ?? false

  // 3. Cache charges_enabled on the Author record (idempotent SET)
  await updateAuthorProfile(client, userId, {
    connectChargesEnabled: account.charges_enabled,
  })

  logger.info('account.updated: cached connectChargesEnabled on Author profile', {
    userId,
    stripeConnectAccountId,
    chargesEnabled: account.charges_enabled,
  })

  // 4. Fire onboarding-complete email when charges_enabled flips false→true
  if (!wasChargesEnabled && account.charges_enabled) {
    void (async () => {
      try {
        const [userAccount] = await Promise.all([getUserAccount(client, userId)])
        if (!userAccount?.email) return
        const displayName = existingProfile?.displayName ?? userAccount.email
        await sendConnectOnboardingCompleteEmail(userAccount.email, {
          authorDisplayName: displayName,
          dashboardUrl: `${BASE_URL}/dashboard`,
        })
      } catch (err) {
        logger.error('Failed to send connect onboarding complete email', { userId, err })
      }
    })()
  }
}
