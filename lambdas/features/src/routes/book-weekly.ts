// =============================================================================
// lambdas/features/src/routes/book-weekly.ts
// POST /features/weekly/book — Section 8.9, FR-FEAT-09/10/11/12
//
// Author only. Eligibility and slot-counting logic from packages/shared/src/features/.
// Creates Stripe Payment Intent then writes PENDING_PAYMENT booking record.
// Booking is promoted to CONFIRMED by subscriptions-webhook-lambda on
// payment_intent.succeeded (FR-FEAT-17).
// =============================================================================

import { randomUUID }  from 'crypto'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
  addWeeks,
  countActiveBookingsForWeek,
  createBooking,
  createPaymentIntent,
  docClient,
  getAuthorProfile,
  getEligibleWeeks,
  getRecentBookingsByAuthor,
  getWeekBounds,
  getWeeklyFeatureConfig,
  isWithinThreeMonthWindow,
  ok,
} from '@duseum/shared'

const ISO_WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/

export const bookWeeklyFeature = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  // ── Verify caller is an Author with Stripe Connect enabled ───────────────
  const authorProfile = await getAuthorProfile(docClient, userId)
  if (!authorProfile || authorProfile.status !== 'ACTIVE') {
    throw new ForbiddenError('An active Author profile is required to book a weekly feature.')
  }
  if (!authorProfile.connectChargesEnabled) {
    throw new ForbiddenError('Stripe Connect charges must be enabled on your account before booking a weekly feature.')
  }

  // ── Parse + validate body ──────────────────────────────────────────────────
  let body: { isoWeek?: string }
  try {
    body = JSON.parse(event.body ?? '{}') as { isoWeek?: string }
  } catch {
    throw new ValidationError('Invalid JSON body.')
  }

  const { isoWeek } = body
  if (!isoWeek || !ISO_WEEK_RE.test(isoWeek)) {
    throw new ValidationError('isoWeek is required and must match YYYY-Www format (e.g. 2025-W33).')
  }

  // ── Load config ────────────────────────────────────────────────────────────
  const { feeUsd, slotCount, advanceWeeks } = await getWeeklyFeatureConfig(docClient)

  // ── Validate isoWeek is within booking window (FR-FEAT-14) ────────────────
  const eligibleWeeks = getEligibleWeeks(advanceWeeks)
  if (!eligibleWeeks.includes(isoWeek)) {
    throw new ValidationError(
      `Week ${isoWeek} is outside the ${advanceWeeks}-week advance booking window.`
    )
  }

  // ── 3-month eligibility check (FR-FEAT-11) ────────────────────────────────
  const recentBookings = await getRecentBookingsByAuthor(docClient, userId, 10)
  const disqualifying = recentBookings.find(
    (b) =>
      (b.featureStatus === 'CONFIRMED' || b.featureStatus === 'ACTIVE') &&
      isWithinThreeMonthWindow(b.isoWeek, new Date())
  )
  if (disqualifying) {
    const { weekStartDate } = getWeekBounds(disqualifying.isoWeek)
    const eligibleAgainAfter = getWeekBounds(addWeeks(disqualifying.isoWeek, 13)).weekStartDate
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'CONFLICT',
          message: 'You already have a weekly feature booking within the last 3 months.',
          existingBooking: {
            isoWeek:             disqualifying.isoWeek,
            weekStartDate,
            eligibleAgainAfter,
          },
        },
      }),
    }
  }

  // ── Slot availability check (FR-FEAT-10) ──────────────────────────────────
  const confirmedCount = await countActiveBookingsForWeek(docClient, isoWeek)
  if (confirmedCount >= slotCount) {
    throw new ConflictError(
      `No slots available for week ${isoWeek}. Please choose a different week.`
    )
  }

  // ── Create Stripe Payment Intent ───────────────────────────────────────────
  const bookingId = randomUUID()
  const { weekStartDate, weekEndDate } = getWeekBounds(isoWeek)

  const paymentIntent = await createPaymentIntent({
    amount:   Math.round(feeUsd * 100),  // cents
    currency: 'usd',
    metadata: {
      type:      'WEEKLY_FEATURE',
      bookingId,
      authorId:  userId,
      isoWeek,
    },
  })

  // ── Write PENDING_PAYMENT booking ──────────────────────────────────────────
  await createBooking(docClient, {
    bookingId,
    authorId:              userId,
    isoWeek,
    weekStartDate,
    weekEndDate,
    featureStatus:         'PENDING_PAYMENT',
    stripePaymentIntentId: paymentIntent.id,
    amountPaidUsd:         feeUsd,
    bookedAt:              new Date().toISOString(),
    activatedAt:           null,
    cancelledAt:           null,
    cancelledBy:           null,
    cancellationReason:    null,
  })

  return ok({
    bookingId,
    isoWeek,
    weekStartDate,
    weekEndDate,
    amountUsd:          feeUsd,
    stripeClientSecret: paymentIntent.client_secret,
    status:             'PENDING_PAYMENT',
  })
}
