// =============================================================================
// lambdas/subscriptions/src/routes/create-author-checkout.ts
// POST /subscriptions/authors/{authorId} — Section 8.6, FR-SUB-02, FR-SUB-06
//
// Creates a Stripe Checkout session for an Author subscription.
// The Author must have a Stripe Connect account and a published price.
// Platform cut (application_fee_amount) is read from config table.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  createCheckoutSession,
  docClient,
  getAuthorProfile,
  getAuthorSubscription,
  getConfigValue,
  getOrCreateStripeCustomer,
  ok,
} from '@duseum/shared'

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://duseum.com'

export const createAuthorCheckout = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  // Author must exist and be active
  const authorProfile = await getAuthorProfile(docClient, authorId)
  if (!authorProfile || authorProfile.status !== 'ACTIVE') {
    throw new NotFoundError('Author not found.')
  }

  if (!authorProfile.stripeConnectAccountId) {
    throw new ValidationError('Author has not connected a Stripe account.')
  }

  if (!authorProfile.authorSubscriptionPriceId) {
    throw new ValidationError('Author has not enabled subscriptions.')
  }

  // Guard: already actively subscribed to this Author
  const existing = await getAuthorSubscription(docClient, userId, authorId)
  if (existing && existing.status === 'ACTIVE') {
    throw new ConflictError(`You already have an active subscription to this author.`)
  }

  const customerId = await getOrCreateStripeCustomer(docClient, userId)

  // Platform takes a % cut via Stripe Connect application_fee_percent (FR-SUB-06)
  const cutPctStr = await getConfigValue(docClient, 'PLATFORM_CUT_PERCENT')
  const cutPct = cutPctStr ? parseFloat(cutPctStr) : 20

  const session = await createCheckoutSession({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: authorProfile.authorSubscriptionPriceId, quantity: 1 }],
    subscription_data: {
      application_fee_percent: cutPct,
      transfer_data: { destination: authorProfile.stripeConnectAccountId },
      // metadata propagated to the Stripe Subscription — required for webhook userId resolution
      metadata: { userId, authorId, type: 'AUTHOR_SUB' },
    },
    success_url: `${APP_BASE_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}&authorId=${authorId}`,
    cancel_url:  `${APP_BASE_URL}/authors/${authorId}`,
    metadata: { userId, authorId, type: 'AUTHOR_SUB' },
  })

  return ok({ checkoutUrl: session.url })
}
