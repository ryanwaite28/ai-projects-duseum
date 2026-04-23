// =============================================================================
// lambdas/subscriptions/src/routes/create-portal-session.ts
// POST /subscriptions/portal — Section 8.6, FR-SUB-09
//
// Creates a Stripe Billing Portal session so the caller can manage or cancel
// their subscriptions. Requires the user to have an existing Stripe Customer
// (i.e. they've subscribed at least once).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ValidationError,
  createBillingPortalSession,
  docClient,
  getUserAccount,
  ok,
} from '@duseum/shared'

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://duseum.com'

export const createPortalSession = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const account = await getUserAccount(docClient, userId)
  const stripeCustomerId = (account as (typeof account & { stripeCustomerId?: string }) | null)
    ?.stripeCustomerId

  if (!stripeCustomerId) {
    throw new ValidationError('No billing account found. Subscribe to a plan first.')
  }

  const session = await createBillingPortalSession({
    customer: stripeCustomerId,
    return_url: `${APP_BASE_URL}/dashboard`,
  })

  return ok({ portalUrl: session.url })
}
