// =============================================================================
// lambdas/subscriptions-webhook/src/handlers/invoice-events.ts
// Handles invoice.payment_failed and invoice.payment_succeeded — FR-SUB-03
//
// invoice.payment_succeeded: idempotency write only (per CLAUDE.md extra events).
// invoice.payment_failed: marks the related subscription PAST_DUE.
//
// userId resolution: Invoice.subscription_details.metadata carries the
// subscription_data.metadata set at checkout (userId, type, authorId?).
// =============================================================================

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { upsertSubscription } from '@duseum/shared'
import { logger } from './logger.js'

type StripeInvoice = {
  id: string
  customer: string
  subscription: string | null
  subscription_details?: {
    metadata?: Record<string, string>
  } | null
}

const resolveFromInvoice = (
  invoice: StripeInvoice
): { userId: string; targetId: string; stripeSubscriptionId: string } | null => {
  const meta = invoice.subscription_details?.metadata ?? {}
  const { userId, type, authorId } = meta

  if (!userId) {
    logger.warn('Invoice event missing userId in subscription metadata', {
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription,
    })
    return null
  }
  if (!invoice.subscription) {
    logger.warn('Invoice event has no subscription reference', { invoiceId: invoice.id })
    return null
  }

  const targetId = type === 'PLATFORM' ? 'PLATFORM' : (authorId ?? '')
  if (!targetId) {
    logger.warn('Invoice event missing authorId for AUTHOR_SUB', { invoiceId: invoice.id })
    return null
  }

  return { userId, targetId, stripeSubscriptionId: invoice.subscription }
}

export const handleInvoicePaymentFailed = async (
  client: DynamoDBDocumentClient,
  invoice: StripeInvoice
): Promise<void> => {
  const ids = resolveFromInvoice(invoice)
  if (!ids) return

  await upsertSubscription(client, {
    userId:               ids.userId,
    targetId:             ids.targetId,
    stripeSubscriptionId: ids.stripeSubscriptionId,
    stripeCustomerId:     typeof invoice.customer === 'string' ? invoice.customer : '',
    status:               'PAST_DUE',
    currentPeriodEnd:     new Date().toISOString(), // will be overwritten on next subscription.updated
    createdAt:            new Date().toISOString(),
  })
}

// invoice.payment_succeeded: no state change needed — subscription.updated fires too.
// We write idempotency and return. Handler called from index.ts but is a no-op here.
export const handleInvoicePaymentSucceeded = (
  _invoice: StripeInvoice
): void => {
  logger.info('invoice.payment_succeeded received — no state change (subscription.updated handles this)')
}
