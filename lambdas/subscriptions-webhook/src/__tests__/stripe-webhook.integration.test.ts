// =============================================================================
// lambdas/subscriptions-webhook/src/__tests__/stripe-webhook.integration.test.ts
// Section 15.3 — real DynamoDB via MiniStack; Stripe & Secrets Manager mocked.
//
// Coverage: all mapped event types, paused/resumed, no-op graceful events,
// unknown event warn-and-skip, replay idempotency, invalid-signature drop.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  docClient,
  MAIN_TABLE,
  IDEM_TABLE,
  makeSqsEvent,
  makeStripeEvent,
  seedItem,
  getItem,
} from './setup.js'
import { getCurrentIsoWeek } from '@duseum/shared'

// ── Mocks ─────────────────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of the file by Vitest before any imports run.
// Values used inside the factory must be declared with vi.hoisted() to avoid
// the temporal dead zone (TDZ) — a plain const would not yet be initialised.

const { WEBHOOK_SECRET } = vi.hoisted(() => ({
  WEBHOOK_SECRET: 'whsec_test_secret',
}))

vi.mock('@duseum/shared', async (importOriginal) => {
  const real = await importOriginal<typeof import('@duseum/shared')>()
  return {
    ...real,
    // Override the shared docClient with our local test one
    docClient,
    getStripeWebhookSecret: vi.fn().mockResolvedValue(WEBHOOK_SECRET),
    constructWebhookEvent: vi.fn((rawBody: string, _sig: string, _secret: string) => {
      // Parse the raw body as the Stripe event; ignore real sig verification in tests
      const parsed = JSON.parse(rawBody)
      if (rawBody === 'INVALID_SIG') throw new Error('Invalid Stripe signature')
      return parsed
    }),
  }
})

// Import handler AFTER mocks are registered
import { handler } from '../index.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Stripe API 2026-03-25.dahlia: current_period_end moved from subscription root
// into items.data[]. Top-level field no longer exists.
const makeSub = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_test_001',
  customer: 'cus_test_001',
  status: 'active',
  items: {
    data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30 }],
  },
  metadata: { userId: 'user-001', type: 'PLATFORM' },
  ...overrides,
})

const makeInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'in_test_001',
  customer: 'cus_test_001',
  subscription: 'sub_test_001',
  subscription_details: { metadata: { userId: 'user-001', type: 'PLATFORM' } },
  ...overrides,
})

const makePaymentIntent = (overrides: Record<string, unknown> = {}) => ({
  id: 'pi_test_001',
  metadata: {
    type: 'WEEKLY_FEATURE',
    isoWeek: '2026-W16',
    authorId: 'author-001',
    bookingId: 'booking-001',
  },
  ...overrides,
})

const seedBooking = () =>
  seedItem(MAIN_TABLE, {
    PK:            'FEATURE#WEEK#2026-W16',
    SK:            'AUTHOR#author-001',
    isoWeek:       '2026-W16',
    authorId:      'author-001',
    featureStatus: 'PENDING',
    bookedAt:      '2026-04-20T00:00:00.000Z',
  })

const seedBookingAuthorKey = () =>
  seedItem(MAIN_TABLE, {
    PK:            'AUTHOR#author-001',
    SK:            'FEATURE#WEEK#2026-W16',
    isoWeek:       '2026-W16',
    authorId:      'author-001',
    featureStatus: 'PENDING',
    bookedAt:      '2026-04-20T00:00:00.000Z',
  })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('subscriptions-webhook handler', () => {

  // ── subscription events ───────────────────────────────────────────────────

  it('customer.subscription.created → upserts ACTIVE subscription', async () => {
    const raw = makeStripeEvent('evt_001', 'customer.subscription.created', makeSub())
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const item = await getItem(MAIN_TABLE, { PK: 'USER#user-001', SK: 'SUB#PLATFORM' })
    expect(item).not.toBeNull()
    expect(item?.status).toBe('ACTIVE')
  })

  it('customer.subscription.updated → maps Stripe status to Duseum status', async () => {
    const raw = makeStripeEvent('evt_002', 'customer.subscription.updated', makeSub({ status: 'past_due' }))
    await handler(makeSqsEvent(raw) as never)

    const item = await getItem(MAIN_TABLE, { PK: 'USER#user-001', SK: 'SUB#PLATFORM' })
    expect(item?.status).toBe('PAST_DUE')
  })

  it('customer.subscription.deleted → sets status CANCELLED', async () => {
    const raw = makeStripeEvent('evt_003', 'customer.subscription.deleted', makeSub({ status: 'canceled' }))
    await handler(makeSqsEvent(raw) as never)

    const item = await getItem(MAIN_TABLE, { PK: 'USER#user-001', SK: 'SUB#PLATFORM' })
    expect(item?.status).toBe('CANCELLED')
  })

  it('customer.subscription.paused → sets status PAUSED', async () => {
    const raw = makeStripeEvent('evt_004', 'customer.subscription.paused', makeSub({ status: 'paused' }))
    await handler(makeSqsEvent(raw) as never)

    const item = await getItem(MAIN_TABLE, { PK: 'USER#user-001', SK: 'SUB#PLATFORM' })
    expect(item?.status).toBe('PAUSED')
  })

  it('customer.subscription.resumed → sets status ACTIVE', async () => {
    const raw = makeStripeEvent('evt_005', 'customer.subscription.resumed', makeSub({ status: 'active' }))
    await handler(makeSqsEvent(raw) as never)

    const item = await getItem(MAIN_TABLE, { PK: 'USER#user-001', SK: 'SUB#PLATFORM' })
    expect(item?.status).toBe('ACTIVE')
  })

  // ── invoice events ────────────────────────────────────────────────────────

  it('invoice.payment_failed → sets subscription PAST_DUE', async () => {
    const raw = makeStripeEvent('evt_006', 'invoice.payment_failed', makeInvoice())
    await handler(makeSqsEvent(raw) as never)

    const item = await getItem(MAIN_TABLE, { PK: 'USER#user-001', SK: 'SUB#PLATFORM' })
    expect(item?.status).toBe('PAST_DUE')
  })

  it('invoice.payment_succeeded → no-op (no state change), marks idempotency', async () => {
    const raw = makeStripeEvent('evt_007', 'invoice.payment_succeeded', makeInvoice())
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const idem = await getItem(IDEM_TABLE, { PK: 'STRIPE#evt_007' })
    expect(idem).not.toBeNull()
  })

  // ── payment_intent events (WeeklyFeature) ─────────────────────────────────

  // ── regression: Stripe API 2026-03-25.dahlia ─────────────────────────────

  it('customer.subscription.created with null current_period_end in items → writes record, currentPeriodEnd null (regression: Stripe 2026-03-25.dahlia)', async () => {
    const raw = makeStripeEvent('evt_rg_001', 'customer.subscription.created', makeSub({
      id: 'sub_rg_001',
      items: { data: [{ current_period_end: null }] },
    }))
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const item = await getItem(MAIN_TABLE, { PK: 'USER#user-001', SK: 'SUB#PLATFORM' })
    expect(item).not.toBeNull()
    expect(item?.status).toBe('ACTIVE')
    expect(item?.currentPeriodEnd).toBeNull()
  })

  it('payment_intent.succeeded for a past week → sets status CONFIRMED (awaits Monday rotation)', async () => {
    await seedBooking()
    await seedBookingAuthorKey()

    const raw = makeStripeEvent('evt_008', 'payment_intent.succeeded', makePaymentIntent())
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const item = await getItem(MAIN_TABLE, { PK: 'FEATURE#WEEK#2026-W16', SK: 'AUTHOR#author-001' })
    expect(item?.featureStatus).toBe('CONFIRMED')
  })

  it('payment_intent.succeeded for the current week → immediately activates WEEKLY_FEATURE booking', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedItem(MAIN_TABLE, {
      PK:            `FEATURE#WEEK#${currentWeek}`,
      SK:            'AUTHOR#author-current',
      isoWeek:       currentWeek,
      authorId:      'author-current',
      featureStatus: 'PENDING',
      bookedAt:      new Date().toISOString(),
    })
    await seedItem(MAIN_TABLE, {
      PK:            'AUTHOR#author-current',
      SK:            `FEATURE#WEEK#${currentWeek}`,
      isoWeek:       currentWeek,
      authorId:      'author-current',
      featureStatus: 'PENDING',
      bookedAt:      new Date().toISOString(),
    })

    const raw = makeStripeEvent('evt_008b', 'payment_intent.succeeded', {
      id: 'pi_current',
      metadata: {
        type:      'WEEKLY_FEATURE',
        isoWeek:   currentWeek,
        authorId:  'author-current',
        bookingId: 'booking-current',
      },
    })
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const item = await getItem(MAIN_TABLE, {
      PK: `FEATURE#WEEK#${currentWeek}`,
      SK: 'AUTHOR#author-current',
    })
    expect(item?.featureStatus).toBe('ACTIVE')
    expect(item?.activatedAt).toBeDefined()
  })

  it('payment_intent.payment_failed → cancels WEEKLY_FEATURE booking', async () => {
    await seedBooking()
    await seedBookingAuthorKey()

    const raw = makeStripeEvent('evt_009', 'payment_intent.payment_failed', makePaymentIntent())
    await handler(makeSqsEvent(raw) as never)

    const item = await getItem(MAIN_TABLE, { PK: 'FEATURE#WEEK#2026-W16', SK: 'AUTHOR#author-001' })
    expect(item?.featureStatus).toBe('CANCELLED')
    expect(item?.cancelledBy).toBe('STRIPE_PAYMENT_FAILED')
  })

  it('payment_intent.succeeded with non-WEEKLY_FEATURE metadata → no-op, no failure', async () => {
    const raw = makeStripeEvent('evt_010', 'payment_intent.succeeded', {
      id: 'pi_other',
      metadata: { type: 'OTHER' },
    })
    const result = await handler(makeSqsEvent(raw) as never)
    expect(result.batchItemFailures).toHaveLength(0)
  })

  // ── graceful no-ops ───────────────────────────────────────────────────────

  it('customer.subscription.trial_will_end → graceful no-op, marks idempotency', async () => {
    const raw = makeStripeEvent('evt_011', 'customer.subscription.trial_will_end', makeSub())
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const idem = await getItem(IDEM_TABLE, { PK: 'STRIPE#evt_011' })
    expect(idem).not.toBeNull()
  })

  it('subscription_schedule.* → graceful no-op, marks idempotency', async () => {
    const raw = makeStripeEvent('evt_012', 'subscription_schedule.created', {})
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const idem = await getItem(IDEM_TABLE, { PK: 'STRIPE#evt_012' })
    expect(idem).not.toBeNull()
  })

  it('unknown event type → warn-and-skip, marks idempotency, no batch failure', async () => {
    const raw = makeStripeEvent('evt_013', 'completely.unknown.event', {})
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const idem = await getItem(IDEM_TABLE, { PK: 'STRIPE#evt_013' })
    expect(idem).not.toBeNull()
  })

  // ── idempotency (replay) ──────────────────────────────────────────────────

  it('replayed event → skipped without re-processing, no failure', async () => {
    // Seed the idempotency record as if already processed
    await seedItem(IDEM_TABLE, {
      PK:          'STRIPE#evt_014',
      processedAt: '2026-04-20T00:00:00.000Z',
      ttl:         Math.floor(Date.now() / 1000) + 604800,
    })

    const raw = makeStripeEvent('evt_014', 'customer.subscription.created', makeSub())
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    // No subscription should have been written (handler never ran)
    const item = await getItem(MAIN_TABLE, { PK: 'USER#user-001', SK: 'SUB#PLATFORM' })
    expect(item).toBeNull()
  })

  // ── error handling ────────────────────────────────────────────────────────

  it('invalid Stripe signature → batchItemFailure (no retry poisoning)', async () => {
    const result = await handler(makeSqsEvent('INVALID_SIG') as never)
    expect(result.batchItemFailures).toHaveLength(1)
  })

  it('malformed SQS body (not JSON) → batchItemFailure', async () => {
    const event = {
      Records: [{
        messageId: 'msg-bad',
        body: 'not-json',
        receiptHandle: 'r',
        attributes: {},
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:q',
        awsRegion: 'us-east-1',
      }],
    }
    const result = await handler(event as never)
    expect(result.batchItemFailures).toHaveLength(1)
  })

  it('SQS body missing rawBody → batchItemFailure', async () => {
    const event = {
      Records: [{
        messageId: 'msg-missing',
        body: JSON.stringify({ stripeSignature: 'sig' }), // no rawBody
        receiptHandle: 'r',
        attributes: {},
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:q',
        awsRegion: 'us-east-1',
      }],
    }
    const result = await handler(event as never)
    expect(result.batchItemFailures).toHaveLength(1)
  })

  // ── account.updated (Stripe Connect) ─────────────────────────────────────

  it('account.updated → caches connectChargesEnabled on Author profile (FR-SUB-13)', async () => {
    const connectAccountId = 'acct_connect_test'
    const userId = 'user-connect-001'

    // Seed the reverse-lookup record (written by connect-onboard)
    await seedItem(MAIN_TABLE, {
      PK:        `CONNECT#${connectAccountId}`,
      SK:        'META',
      userId,
      createdAt: '2026-04-23T00:00:00.000Z',
    })
    // Seed a minimal Author profile
    await seedItem(MAIN_TABLE, {
      PK:           `USER#${userId}`,
      SK:           'PROFILE#AUTHOR',
      userId,
      profileType:  'AUTHOR',
      displayName:  'Test Author',
    })

    const accountObj = { id: connectAccountId, charges_enabled: true, details_submitted: true }
    const raw = makeStripeEvent('evt_acct_001', 'account.updated', accountObj, connectAccountId)
    const result = await handler(makeSqsEvent(raw) as never)

    expect(result.batchItemFailures).toHaveLength(0)
    const profile = await getItem(MAIN_TABLE, { PK: `USER#${userId}`, SK: 'PROFILE#AUTHOR' })
    expect(profile?.connectChargesEnabled).toBe(true)
    const idem = await getItem(IDEM_TABLE, { PK: 'STRIPE#evt_acct_001' })
    expect(idem).not.toBeNull()
  })

  it('account.updated for unknown Connect account → graceful skip, no failure', async () => {
    const accountObj = { id: 'acct_unknown', charges_enabled: true }
    const raw = makeStripeEvent('evt_acct_002', 'account.updated', accountObj, 'acct_unknown')
    const result = await handler(makeSqsEvent(raw) as never)

    // No lookup record exists — handler should log warn and continue
    expect(result.batchItemFailures).toHaveLength(0)
    const idem = await getItem(IDEM_TABLE, { PK: 'STRIPE#evt_acct_002' })
    expect(idem).not.toBeNull()
  })
})
