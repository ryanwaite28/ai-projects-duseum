// =============================================================================
// lambdas/subscriptions-webhook/src/handlers/payment-intent-events.ts
// Handles payment_intent.succeeded / payment_intent.payment_failed
// for Weekly Feature bookings — FR-FEAT-12/17
//
// Only acts when metadata.type === 'WEEKLY_FEATURE'. Other Payment Intents
// (e.g. regular purchases) are logged and skipped.
// metadata shape: { type: 'WEEKLY_FEATURE', bookingId, isoWeek, authorId }
// =============================================================================

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  shouldActivateImmediately,
  updateBookingStatus,
  getAuthorProfile,
  sendPlatformFeatureBookedEmail,
} from '@duseum/shared'
import { logger } from './logger.js'

const ADMIN_EMAIL = process.env['SES_ADMIN_ADDRESS'] ?? 'admin@duseum.com'

type StripePaymentIntent = {
  id: string
  amount: number
  metadata: Record<string, string>
}

const resolveBooking = (
  pi: StripePaymentIntent
): { isoWeek: string; authorId: string } | null => {
  const { type, isoWeek, authorId } = pi.metadata ?? {}

  if (type !== 'WEEKLY_FEATURE') {
    logger.info('payment_intent event is not WEEKLY_FEATURE — skipping', {
      paymentIntentId: pi.id,
      metadataType: type,
    })
    return null
  }

  if (!isoWeek || !authorId) {
    logger.warn('WEEKLY_FEATURE payment_intent missing isoWeek or authorId', {
      paymentIntentId: pi.id,
    })
    return null
  }

  return { isoWeek, authorId }
}

export const handlePaymentIntentSucceeded = async (
  client: DynamoDBDocumentClient,
  pi: StripePaymentIntent
): Promise<void> => {
  const booking = resolveBooking(pi)
  if (!booking) return

  if (shouldActivateImmediately(booking.isoWeek)) {
    await updateBookingStatus(client, booking.isoWeek, booking.authorId, 'ACTIVE', {
      activatedAt: new Date().toISOString(),
    })
    logger.info('WeeklyFeatureBooking immediately activated', booking)
  } else {
    await updateBookingStatus(client, booking.isoWeek, booking.authorId, 'CONFIRMED')
    logger.info('WeeklyFeatureBooking confirmed (awaits Monday rotation)', booking)
  }

  // Fire-and-forget admin notification
  void (async () => {
    try {
      const authorProfile = await getAuthorProfile(client, booking.authorId)
      await sendPlatformFeatureBookedEmail(ADMIN_EMAIL, {
        authorId: booking.authorId,
        authorDisplayName: authorProfile?.displayName ?? booking.authorId,
        isoWeek: booking.isoWeek,
        feeUsd: Math.round(pi.amount / 100),
      })
    } catch (err) {
      logger.error('Failed to send feature booked admin email', { authorId: booking.authorId, err })
    }
  })()
}

export const handlePaymentIntentFailed = async (
  client: DynamoDBDocumentClient,
  pi: StripePaymentIntent
): Promise<void> => {
  const booking = resolveBooking(pi)
  if (!booking) return

  await updateBookingStatus(client, booking.isoWeek, booking.authorId, 'CANCELLED', {
    cancelledAt: new Date().toISOString(),
    cancelledBy: 'STRIPE_PAYMENT_FAILED',
  })
  logger.info('WeeklyFeatureBooking cancelled due to payment failure', booking)
}
