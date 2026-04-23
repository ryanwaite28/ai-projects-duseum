// =============================================================================
// lambdas/subscriptions/src/routes/connect-onboard.ts
// POST /subscriptions/connect/onboard — FR-SUB-07
//
// Creates (or reuses) a Stripe Connect Express account for the authenticated
// Author, then generates a one-time account-onboarding link and returns its URL.
// Idempotent: if stripeConnectAccountId already set, skips account creation.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  ValidationError,
  createAccountLink,
  createConnectAccount,
  docClient,
  getAuthorProfile,
  ok,
  updateAuthorProfile,
} from '@duseum/shared'

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://duseum.com'

export const connectOnboard = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const author = await getAuthorProfile(docClient, userId)
  if (!author) throw new NotFoundError('Author profile not found.')
  if (author.status === 'SUSPENDED' || author.status === 'DEACTIVATED') {
    throw new ValidationError('Author account is not eligible for Connect onboarding.')
  }

  let connectAccountId = author.stripeConnectAccountId

  if (!connectAccountId) {
    const account = await createConnectAccount({ type: 'express' })
    connectAccountId = account.id
    await updateAuthorProfile(docClient, userId, { stripeConnectAccountId: connectAccountId })
  }

  const link = await createAccountLink({
    account:     connectAccountId,
    type:        'account_onboarding',
    refresh_url: `${APP_BASE_URL}/dashboard?connect=refresh`,
    return_url:  `${APP_BASE_URL}/dashboard?connect=return`,
  })

  return ok({ accountLinkUrl: link.url })
}
