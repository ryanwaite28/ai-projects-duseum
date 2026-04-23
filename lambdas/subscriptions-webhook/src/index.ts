// =============================================================================
// lambdas/subscriptions-webhook/src/index.ts
// subscriptions-webhook-lambda — Section 4.5, FR-SUB-03, FR-FEAT-17
//
// SQS trigger (batch size: 1, visibility timeout: 60s).
// Each SQS message body is a JSON object with shape:
//   { rawBody: string, stripeSignature: string }
// set by the API Gateway → SQS direct integration VTL mapping template.
//
// Processing contract per message:
//   1. Parse body + verify Stripe signature → batchItemFailure on invalid sig
//   2. Check idempotency table — return success (no retry) if already processed
//   3. Route to event handler
//   4. Mark idempotency AFTER successful handler write (not before)
//   5. Any thrown error → batchItemFailure → SQS retry → DLQ after 3×
// =============================================================================

import type { SQSEvent, SQSBatchResponse } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import {
  checkProcessed,
  constructWebhookEvent,
  docClient,
  getStripeWebhookSecret,
  markProcessed,
} from '@duseum/shared'
import {
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionPaused,
  handleSubscriptionResumed,
  handleSubscriptionUpdated,
} from './handlers/subscription-events.js'
import {
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
} from './handlers/invoice-events.js'
import {
  handlePaymentIntentFailed,
  handlePaymentIntentSucceeded,
} from './handlers/payment-intent-events.js'

const logger = new Logger({ serviceName: 'subscriptions-webhook-lambda' })

type SqsMessageBody = {
  rawBody: string
  stripeSignature: string
}

/** Graceful no-op: log at INFO + mark idempotency + return without throwing. */
const noOp = async (eventId: string, eventType: string, level: 'info' | 'warn' = 'info') => {
  if (level === 'warn') {
    logger.warn('Unrecognised Stripe event type — skipping', { eventId, eventType })
  } else {
    logger.info(`Stripe event type not handled in v1 — skipping`, { eventId, eventType })
  }
  await markProcessed(docClient, eventId)
}

export const handler = async (sqsEvent: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: Array<{ itemIdentifier: string }> = []

  for (const record of sqsEvent.Records) {
    const messageId = record.messageId
    let eventId = messageId // fallback until we have the Stripe event ID

    try {
      // 1. Parse SQS message
      const body = JSON.parse(record.body) as SqsMessageBody
      const { rawBody, stripeSignature } = body

      if (!rawBody || !stripeSignature) {
        logger.error('SQS message missing rawBody or stripeSignature', { messageId })
        batchItemFailures.push({ itemIdentifier: messageId })
        continue
      }

      // 2. Verify Stripe signature
      const webhookSecret = await getStripeWebhookSecret()
      const event = constructWebhookEvent(rawBody, stripeSignature, webhookSecret)
      eventId = event.id

      logger.appendKeys({ stripeEventId: eventId, stripeEventType: event.type })

      // 3. Idempotency check
      const alreadyProcessed = await checkProcessed(docClient, eventId)
      if (alreadyProcessed) {
        logger.info('Stripe event already processed — skipping', { eventId })
        continue // success; no retry
      }

      // 4. Route to handler
      const obj = event.data.object as unknown as Record<string, unknown>

      switch (event.type) {
        case 'customer.subscription.created':
          await handleSubscriptionCreated(docClient, obj as never)
          break
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(docClient, obj as never)
          break
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(docClient, obj as never)
          break
        case 'customer.subscription.paused':
          await handleSubscriptionPaused(docClient, obj as never)
          break
        case 'customer.subscription.resumed':
          await handleSubscriptionResumed(docClient, obj as never)
          break
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(docClient, obj as never)
          break
        case 'invoice.payment_succeeded':
          handleInvoicePaymentSucceeded(obj as never) // synchronous no-op log
          break
        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(docClient, obj as never)
          break
        case 'payment_intent.payment_failed':
          await handlePaymentIntentFailed(docClient, obj as never)
          break
        // ── Graceful no-ops ──────────────────────────────────────────────────
        case 'customer.subscription.trial_will_end':
        case 'customer.subscription.pending_update_applied':
        case 'customer.subscription.pending_update_expired':
          await noOp(eventId, event.type, 'info')
          continue // idempotency already written by noOp
        default:
          if (event.type.startsWith('subscription_schedule.')) {
            await noOp(eventId, event.type, 'info')
            continue
          }
          await noOp(eventId, event.type, 'warn')
          continue
      }

      // 5. Mark processed after successful handler
      await markProcessed(docClient, eventId)

    } catch (err) {
      // ConditionalCheckFailedException on markProcessed means concurrent
      // duplicate — that is NOT an error; treat as success.
      if (
        err instanceof Error &&
        err.name === 'ConditionalCheckFailedException'
      ) {
        logger.info('Concurrent duplicate event — idempotency write raced; treating as success', { eventId })
        continue
      }

      logger.error('Error processing Stripe webhook event', {
        eventId,
        error: err instanceof Error ? err.message : String(err),
      })
      batchItemFailures.push({ itemIdentifier: messageId })
    }
  }

  return { batchItemFailures }
}
