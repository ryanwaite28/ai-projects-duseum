// =============================================================================
// lambdas/subscriptions/src/routes/create-platform-checkout.ts
// POST /subscriptions/platform — Section 8.6, FR-SUB-01
//
// Creates a Stripe Checkout session for the platform subscription.
// Resolves (or creates) a Stripe Customer for the caller, then starts a
// Checkout session using the price ID stored in the DynamoDB config table.
// Returns immediately with { checkoutUrl }.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ConflictError,
  ValidationError,
  createCheckoutSession,
  docClient,
  getConfigValue,
  getOrCreateStripeCustomer,
  getPlatformSubscription,
  ok,
} from '@duseum/shared'

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://duseum.com'

export const createPlatformCheckout = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  // Guard: already actively subscribed
  const existing = await getPlatformSubscription(docClient, userId)
  if (existing && existing.status === 'ACTIVE') {
    throw new ConflictError('You already have an active platform subscription.')
  }

  // Load platform price ID from config table
  const priceId = await getConfigValue(docClient, 'PLATFORM_SUB_PRICE_ID')
  if (!priceId) {
    throw new ValidationError('Platform subscription is not configured.')
  }

  const customerId = await getOrCreateStripeCustomer(docClient, userId)

  const session = await createCheckoutSession({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // subscription_data.metadata is propagated to the Stripe Subscription object,
    // making userId available in customer.subscription.* webhook events.
    subscription_data: { metadata: { userId, type: 'PLATFORM' } },
    success_url: `${APP_BASE_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${APP_BASE_URL}/subscription/cancel`,
    metadata: { userId, type: 'PLATFORM' },
  })

  return ok({ checkoutUrl: session.url })
}
