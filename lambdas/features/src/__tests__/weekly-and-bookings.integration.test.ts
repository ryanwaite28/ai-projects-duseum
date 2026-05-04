// =============================================================================
// lambdas/features/src/__tests__/weekly-and-bookings.integration.test.ts
// Integration tests for GET /features/weekly and GET /features/weekly/my-bookings
// FR-TESTING-01/02 — Section 15.4
//
// Prerequisites: MiniStack running at localhost:4566
// =============================================================================

import { describe, expect, it } from 'vitest'
import { handler } from '../index.js'
import {
  makeCtx,
  makeEvent,
  seedAuthorProfile,
  seedConfirmedBooking,
  seedItem,
} from './setup.js'
import { addWeeks, getCurrentIsoWeek, getWeekBounds } from '@duseum/shared'

// ── Seed helper: ACTIVE booking (copied from week rotation scenario) ───────────

const seedActiveBooking = async (
  authorId: string,
  isoWeek: string,
  bookingId: string,
  weekStartDate: string,
  weekEndDate: string
) => {
  const base = {
    bookingId,
    authorId,
    isoWeek,
    weekStartDate,
    weekEndDate,
    featureStatus:         'ACTIVE',
    stripePaymentIntentId: `pi_test_${bookingId}`,
    amountPaidUsd:         25,
    bookedAt:              '2025-01-01T00:00:00.000Z',
    activatedAt:           new Date().toISOString(),
    cancelledAt:           null,
    cancelledBy:           null,
  }
  await seedItem({ PK: `FEATURE#WEEK#${isoWeek}`, SK: `AUTHOR#${authorId}`, ...base })
  await seedItem({ PK: `AUTHOR#${authorId}`,       SK: `FEATURE#WEEK#${isoWeek}`, ...base })
}

// ── GET /features/weekly ──────────────────────────────────────────────────────

describe('GET /features/weekly', () => {
  it('returns response shape with isoWeek, weekStartDate, weekEndDate, slotsFilled, slotsTotal, featuredAuthors', async () => {
    const event = makeEvent('GET', '/features/weekly')
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(typeof body.isoWeek).toBe('string')
    expect(typeof body.weekStartDate).toBe('string')
    expect(typeof body.weekEndDate).toBe('string')
    expect(typeof body.slotsFilled).toBe('number')
    expect(typeof body.slotsTotal).toBe('number')
    expect(Array.isArray(body.featuredAuthors)).toBe(true)
  })

  it('returns empty featuredAuthors array when no ACTIVE bookings exist', async () => {
    const event = makeEvent('GET', '/features/weekly')
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.slotsFilled).toBe(0)
    expect(body.featuredAuthors).toEqual([])
  })

  it('includes active featured authors for current week', async () => {
    const currentWeek = getCurrentIsoWeek()
    const { weekStartDate, weekEndDate } = getWeekBounds(currentWeek)

    await seedAuthorProfile('author-weekly-001')
    await seedActiveBooking('author-weekly-001', currentWeek, 'bk-w-001', weekStartDate, weekEndDate)

    const event = makeEvent('GET', '/features/weekly')
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.slotsFilled).toBeGreaterThanOrEqual(1)
    const authorIds = body.featuredAuthors.map((a: { authorId: string }) => a.authorId)
    expect(authorIds).toContain('author-weekly-001')
  })

  it('featuredAuthor shape includes authorId, displayName, avatarUrl, coverPhotoUrl, recentPieces', async () => {
    const currentWeek = getCurrentIsoWeek()
    const { weekStartDate, weekEndDate } = getWeekBounds(currentWeek)

    await seedAuthorProfile('author-weekly-002')
    await seedActiveBooking('author-weekly-002', currentWeek, 'bk-w-002', weekStartDate, weekEndDate)

    const event = makeEvent('GET', '/features/weekly')
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    const author = body.featuredAuthors.find(
      (a: { authorId: string }) => a.authorId === 'author-weekly-002'
    )
    expect(author).toBeDefined()
    expect(typeof author.authorId).toBe('string')
    expect(typeof author.displayName).toBe('string')
    expect(Array.isArray(author.recentPieces)).toBe(true)
    // avatarUrl and coverPhotoUrl both present; null when no photo set
    expect(Object.prototype.hasOwnProperty.call(author, 'avatarUrl')).toBe(true)
    expect(author.avatarUrl).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(author, 'coverPhotoUrl')).toBe(true)
  })

  it('featuredAuthor.avatarUrl is a public URL when author has a profile photo', async () => {
    const currentWeek = getCurrentIsoWeek()
    const { weekStartDate, weekEndDate } = getWeekBounds(currentWeek)

    await seedAuthorProfile('author-weekly-icon', { profilePhotoS3Key: 'icon-photo-key' })
    await seedActiveBooking('author-weekly-icon', currentWeek, 'bk-w-icon', weekStartDate, weekEndDate)

    const event = makeEvent('GET', '/features/weekly')
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    const author = body.featuredAuthors.find(
      (a: { authorId: string }) => a.authorId === 'author-weekly-icon'
    )
    expect(author).toBeDefined()
    expect(author.avatarUrl).toContain('icon-photo-key')
  })

  it('accepts ?week= query param for a specific week', async () => {
    const nextWeek = addWeeks(getCurrentIsoWeek(), 1)
    const event = makeEvent('GET', '/features/weekly', {
      queryStringParameters: { week: nextWeek },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.isoWeek).toBe(nextWeek)
  })

  it('returns 400 for invalid week format', async () => {
    const event = makeEvent('GET', '/features/weekly', {
      queryStringParameters: { week: 'bad-week' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })

  it('does not include CONFIRMED (not yet ACTIVE) bookings', async () => {
    const currentWeek = getCurrentIsoWeek()
    const { weekStartDate, weekEndDate } = getWeekBounds(currentWeek)

    await seedAuthorProfile('author-weekly-confirmed')
    // Seed as CONFIRMED, not ACTIVE
    await seedConfirmedBooking('author-weekly-confirmed', currentWeek, 'bk-w-confirmed', weekStartDate, weekEndDate)

    const event = makeEvent('GET', '/features/weekly')
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    const authorIds = body.featuredAuthors.map((a: { authorId: string }) => a.authorId)
    expect(authorIds).not.toContain('author-weekly-confirmed')
  })
})

// ── GET /features/weekly/my-bookings ─────────────────────────────────────────

describe('GET /features/weekly/my-bookings', () => {
  it('returns empty items array when Author has no bookings', async () => {
    await seedAuthorProfile('author-mb-001')

    const event = makeEvent('GET', '/features/weekly/my-bookings', { userId: 'author-mb-001' })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items).toHaveLength(0)
    expect(typeof body.nextEligibleWeek).toBe('string')
  })

  it('returns booking history with correct shape', async () => {
    const week = addWeeks(getCurrentIsoWeek(), 2)
    const { weekStartDate, weekEndDate } = getWeekBounds(week)

    await seedAuthorProfile('author-mb-002')
    await seedConfirmedBooking('author-mb-002', week, 'bk-mb-001', weekStartDate, weekEndDate)

    const event = makeEvent('GET', '/features/weekly/my-bookings', { userId: 'author-mb-002' })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.items).toHaveLength(1)

    const booking = body.items[0]
    expect(booking.bookingId).toBe('bk-mb-001')
    expect(booking.isoWeek).toBe(week)
    expect(typeof booking.weekStartDate).toBe('string')
    expect(typeof booking.weekEndDate).toBe('string')
    expect(booking.featureStatus).toBe('CONFIRMED')
    expect(booking.amountPaidUsd).toBe(25)
    expect(typeof booking.bookedAt).toBe('string')
  })

  it('includes nextEligibleWeek derived from most recent booking in 3-month window', async () => {
    const nextWeek = addWeeks(getCurrentIsoWeek(), 1)
    const { weekStartDate, weekEndDate } = getWeekBounds(nextWeek)

    await seedAuthorProfile('author-mb-003')
    await seedConfirmedBooking('author-mb-003', nextWeek, 'bk-mb-002', weekStartDate, weekEndDate)

    const event = makeEvent('GET', '/features/weekly/my-bookings', { userId: 'author-mb-003' })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    // nextEligibleWeek must be at least 13 weeks after the disqualifying booking
    expect(typeof body.nextEligibleWeek).toBe('string')
    expect(body.nextEligibleWeek).toMatch(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/)
  })

  it('returns 403 when caller has no Author profile', async () => {
    const event = makeEvent('GET', '/features/weekly/my-bookings', { userId: 'no-author-here' })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(403)
  })

  it('returns 401 when no JWT provided', async () => {
    const event = makeEvent('GET', '/features/weekly/my-bookings')
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(401)
  })
})
