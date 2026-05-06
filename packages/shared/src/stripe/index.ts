// =============================================================================
// packages/shared/src/stripe/index.ts
// Stripe client wrapper — Section 5.7, FR-SUB-01/02/06
//
// The Stripe client is instantiated lazily on first call and cached in module
// scope to avoid repeated Secrets Manager calls on warm Lambda invocations.
//
// Stripe v22 uses `export = StripeConstructor` (CJS namespace style).
// Types are derived via InstanceType<typeof StripeLib> to avoid Stripe.X.Y
// namespace references which do not work with the v22 type declarations.
// =============================================================================

import StripeLib from 'stripe'
import { getStripeKey } from '../secrets.js'

type StripeClient = InstanceType<typeof StripeLib>

type CheckoutSessionCreateParams = Parameters<StripeClient['checkout']['sessions']['create']>[0]
type CheckoutSession            = Awaited<ReturnType<StripeClient['checkout']['sessions']['create']>>
type PortalSessionCreateParams  = Parameters<StripeClient['billingPortal']['sessions']['create']>[0]
type PortalSession              = Awaited<ReturnType<StripeClient['billingPortal']['sessions']['create']>>
type PaymentIntentCreateParams  = Parameters<StripeClient['paymentIntents']['create']>[0]
type PaymentIntent              = Awaited<ReturnType<StripeClient['paymentIntents']['create']>>
type CustomerCreateParams          = Parameters<StripeClient['customers']['create']>[0]
type Customer                      = Awaited<ReturnType<StripeClient['customers']['create']>>
type AccountCreateParams           = Parameters<StripeClient['accounts']['create']>[0]
type Account                       = Awaited<ReturnType<StripeClient['accounts']['create']>>
type AccountLinkCreateParams       = Parameters<StripeClient['accountLinks']['create']>[0]
type AccountLink                   = Awaited<ReturnType<StripeClient['accountLinks']['create']>>
type PriceCreateParams             = Parameters<StripeClient['prices']['create']>[0]
type Price                         = Awaited<ReturnType<StripeClient['prices']['create']>>
type RefundCreateParams            = Parameters<StripeClient['refunds']['create']>[0]
type Refund                        = Awaited<ReturnType<StripeClient['refunds']['create']>>

// Re-export inferred types so callers can type-check params without importing stripe directly
export type {
  CheckoutSessionCreateParams,
  CheckoutSession,
  PortalSessionCreateParams,
  PortalSession,
  PaymentIntentCreateParams,
  PaymentIntent,
  CustomerCreateParams,
  Customer,
  AccountCreateParams,
  Account,
  AccountLinkCreateParams,
  AccountLink,
  PriceCreateParams,
  Price,
  RefundCreateParams,
  Refund,
}

let _stripe: StripeClient | null = null

export const getStripeClient = async (): Promise<StripeClient> => {
  if (_stripe) return _stripe
  const secretKey = await getStripeKey()
  _stripe = new StripeLib(secretKey, { apiVersion: '2026-03-25.dahlia' })
  return _stripe
}

// ── Checkout ──────────────────────────────────────────────────────────────────

export const createCheckoutSession = async (
  params: CheckoutSessionCreateParams
): Promise<CheckoutSession> => {
  const stripe = await getStripeClient()
  return stripe.checkout.sessions.create(params)
}

// ── Billing Portal ────────────────────────────────────────────────────────────

export const createBillingPortalSession = async (
  params: PortalSessionCreateParams
): Promise<PortalSession> => {
  const stripe = await getStripeClient()
  return stripe.billingPortal.sessions.create(params)
}

// ── Payment Intent ────────────────────────────────────────────────────────────

export const createPaymentIntent = async (
  params: PaymentIntentCreateParams
): Promise<PaymentIntent> => {
  const stripe = await getStripeClient()
  return stripe.paymentIntents.create(params)
}

// ── Webhook ───────────────────────────────────────────────────────────────────

export const constructWebhookEvent = (
  payload: string | Buffer,
  signature: string,
  secret: string
): ReturnType<(typeof StripeLib)['webhooks']['constructEvent']> => {
  return StripeLib.webhooks.constructEvent(payload, signature, secret)
}

// ── Customer helpers ──────────────────────────────────────────────────────────

export const createStripeCustomer = async (
  params: CustomerCreateParams
): Promise<Customer> => {
  const stripe = await getStripeClient()
  return stripe.customers.create(params)
}

// ── Connect Express ───────────────────────────────────────────────────────────

export const createConnectAccount = async (
  params: AccountCreateParams
): Promise<Account> => {
  const stripe = await getStripeClient()
  return stripe.accounts.create(params)
}

export const createAccountLink = async (
  params: AccountLinkCreateParams
): Promise<AccountLink> => {
  const stripe = await getStripeClient()
  return stripe.accountLinks.create(params)
}

export const retrieveConnectAccount = async (
  accountId: string
): Promise<Account> => {
  const stripe = await getStripeClient()
  return stripe.accounts.retrieve(accountId)
}

export const createConnectLoginLink = async (
  accountId: string
): Promise<{ url: string }> => {
  const stripe = await getStripeClient()
  return stripe.accounts.createLoginLink(accountId)
}

export const createConnectPrice = async (
  params: PriceCreateParams,
  stripeAccount: string
): Promise<Price> => {
  const stripe = await getStripeClient()
  return stripe.prices.create(params, { stripeAccount })
}

export const archiveConnectPrice = async (
  priceId: string,
  stripeAccount: string
): Promise<void> => {
  const stripe = await getStripeClient()
  await stripe.prices.update(priceId, { active: false }, { stripeAccount })
}

// Platform-account price helpers — used for author subscription prices under the
// Destination Charges model (transfer_data). Prices must live on the platform
// account so the platform-account checkout session can resolve them.

export const createPlatformPrice = async (
  params: PriceCreateParams
): Promise<Price> => {
  const stripe = await getStripeClient()
  return stripe.prices.create(params)
}

export const deactivatePlatformPrice = async (
  priceId: string
): Promise<void> => {
  const stripe = await getStripeClient()
  await stripe.prices.update(priceId, { active: false })
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export const issueRefund = async (
  paymentIntentId: string
): Promise<{ refundId: string }> => {
  const stripe = await getStripeClient()
  const refund = await stripe.refunds.create({ payment_intent: paymentIntentId } as RefundCreateParams)
  return { refundId: refund.id }
}
