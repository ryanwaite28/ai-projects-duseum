// =============================================================================
// lambdas/features/src/__tests__/book-weekly-feature.integration.test.ts
// Integration tests for POST /features/weekly/book — Section 15.3
// Stripe SDK calls are mocked; DynamoDB state changes are verified against real MiniStack.
// =============================================================================

import { describe, expect, it, vi } from 'vitest'
import { addWeeks, getCurrentIsoWeek, getWeekBounds } from '@duseum/shared'

// ── Stripe mock ───────────────────────────────────────────────────────────────
vi.mock('@duseum/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duseum/shared')>()
  return {
    ...actual,
    createPaymentIntent: vi.fn().mockResolvedValue({
      id:            'pi_test_mock_001',
      client_secret: 'pi_test_mock_001_secret_abc',
    }),
  }
})

import { handler } from '../index.js'
import {
  TABLE,
  docClient,
  makeCtx,
  makeEvent,
  seedAuthorProfile,
  seedConfirmedBooking,
} from './setup.js'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'

const NEXT_WEEK = addWeeks(getCurrentIsoWeek(), 1)

describe('POST /features/weekly/book', () => {
  it('creates PENDING_PAYMENT booking and returns stripeClientSecret for eligible Author', async () => {
    const authorId = 'author-book-001'
    await seedAuthorProfile(authorId)

    const event = makeEvent('POST', '/features/weekly/book', {
      userId: authorId,
      body:   { isoWeek: NEXT_WEEK },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body!)
    expect(body.bookingId).toBeTruthy()
    expect(body.isoWeek).toBe(NEXT_WEEK)
    expect(body.amountUsd).toBe(25)
    expect(body.stripeClientSecret).toBe('pi_test_mock_001_secret_abc')
    expect(body.status).toBe('PENDING_PAYMENT')

    // Verify PENDING_PAYMENT record written to DynamoDB
    const { weekStartDate, weekEndDate } = getWeekBounds(NEXT_WEEK)
    const stored = await docClient.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `FEATURE#WEEK#${NEXT_WEEK}`,
        ':sk': `AUTHOR#${authorId}`,
      },
    }))
    expect(stored.Count).toBe(1)
    expect(stored.Items![0]['featureStatus']).toBe('PENDING_PAYMENT')
    expect(stored.Items![0]['weekStartDate']).toBe(weekStartDate)
    expect(stored.Items![0]['weekEndDate']).toBe(weekEndDate)
  })

  it('returns 409 CONFLICT with eligibleAgainAfter when Author has booking within 3-month window', async () => {
    const authorId = 'author-book-002'
    await seedAuthorProfile(authorId)

    // Seed an existing CONFIRMED booking 4 weeks ago (within 3-month / 13-week window)
    const recentWeek = addWeeks(getCurrentIsoWeek(), -4)
    const { weekStartDate, weekEndDate } = getWeekBounds(recentWeek)
    await seedConfirmedBooking(authorId, recentWeek, 'bk-existing-001', weekStartDate, weekEndDate)

    const event = makeEvent('POST', '/features/weekly/book', {
      userId: authorId,
      body:   { isoWeek: NEXT_WEEK },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(409)
    const body = JSON.parse(result.body!)
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.existingBooking).toBeDefined()
    expect(body.error.existingBooking.isoWeek).toBe(recentWeek)
    expect(body.error.existingBooking.eligibleAgainAfter).toBeTruthy()
  })

  it('returns 409 CONFLICT when the selected week has no slots available', async () => {
    const authorId = 'author-book-003'
    await seedAuthorProfile(authorId)

    // Fill all 10 slots for NEXT_WEEK
    const { weekStartDate, weekEndDate } = getWeekBounds(NEXT_WEEK)
    for (let i = 0; i < 10; i++) {
      await seedConfirmedBooking(
        `author-slot-filler-${i}`,
        NEXT_WEEK,
        `bk-slot-${i.toString().padStart(3, '0')}`,
        weekStartDate,
        weekEndDate
      )
    }

    const event = makeEvent('POST', '/features/weekly/book', {
      userId: authorId,
      body:   { isoWeek: NEXT_WEEK },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(409)
    const body = JSON.parse(result.body!)
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.message).toMatch(/No slots available/)
  })

  it('returns 403 FORBIDDEN when caller has no Author profile', async () => {
    // No author profile seeded for this userId
    const event = makeEvent('POST', '/features/weekly/book', {
      userId: 'viewer-only-user',
      body:   { isoWeek: NEXT_WEEK },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(403)
    const body = JSON.parse(result.body!)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 400 VALIDATION_ERROR when booking week is beyond advance window', async () => {
    const authorId = 'author-book-004'
    await seedAuthorProfile(authorId)

    // WEEKLY_FEATURE_ADVANCE_WEEKS = 8; week 9 is outside the window
    const tooFarAhead = addWeeks(getCurrentIsoWeek(), 9)

    const event = makeEvent('POST', '/features/weekly/book', {
      userId: authorId,
      body:   { isoWeek: tooFarAhead },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body!)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toMatch(/advance booking window/)
  })
})
