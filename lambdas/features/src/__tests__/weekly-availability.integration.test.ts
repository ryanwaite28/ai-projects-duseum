// =============================================================================
// lambdas/features/src/__tests__/weekly-availability.integration.test.ts
// Integration tests for GET /features/weekly/availability — Section 15.3
// =============================================================================

import { describe, expect, it } from 'vitest'
import { handler } from '../index.js'
import {
  makeCtx,
  makeEvent,
  seedConfirmedBooking,
} from './setup.js'
import { addWeeks, getCurrentIsoWeek, getWeekBounds } from '@duseum/shared'

describe('GET /features/weekly/availability', () => {
  it('returns 8 eligible weeks with correct slotsAvailable counts', async () => {
    // Seed 3 confirmed bookings on the next 2 weeks
    const week1 = addWeeks(getCurrentIsoWeek(), 1)
    const week2 = addWeeks(getCurrentIsoWeek(), 2)
    const { weekStartDate: ws1, weekEndDate: we1 } = getWeekBounds(week1)
    const { weekStartDate: ws2, weekEndDate: we2 } = getWeekBounds(week2)

    await seedConfirmedBooking('a1', week1, 'bk-001', ws1, we1)
    await seedConfirmedBooking('a2', week1, 'bk-002', ws1, we1)
    await seedConfirmedBooking('a3', week2, 'bk-003', ws2, we2)

    const event = makeEvent('GET', '/features/weekly/availability')
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body!)

    // WEEKLY_FEATURE_ADVANCE_WEEKS = 8 → current week + 8 ahead = 9 options (FR-FEAT-14)
    expect(body.weeks).toHaveLength(9)
    expect(body.feeUsd).toBe(25)

    const firstWeek = body.weeks.find((w: { isoWeek: string }) => w.isoWeek === week1)
    expect(firstWeek.slotsAvailable).toBe(8)  // 10 slots - 2 confirmed
    expect(firstWeek.isAvailable).toBe(true)

    const secondWeek = body.weeks.find((w: { isoWeek: string }) => w.isoWeek === week2)
    expect(secondWeek.slotsAvailable).toBe(9)  // 10 slots - 1 confirmed

    // Weeks with no bookings have all slots available
    const week3 = addWeeks(getCurrentIsoWeek(), 3)
    const thirdWeek = body.weeks.find((w: { isoWeek: string }) => w.isoWeek === week3)
    expect(thirdWeek.slotsAvailable).toBe(10)
  })

  it('marks a fully booked week as isAvailable: false', async () => {
    const targetWeek = addWeeks(getCurrentIsoWeek(), 1)
    const { weekStartDate, weekEndDate } = getWeekBounds(targetWeek)

    // Fill all 10 slots (WEEKLY_FEATURE_SLOT_COUNT = 10 seeded in setup.ts)
    for (let i = 0; i < 10; i++) {
      await seedConfirmedBooking(
        `author-full-${i}`,
        targetWeek,
        `bk-full-${i.toString().padStart(3, '0')}`,
        weekStartDate,
        weekEndDate
      )
    }

    const event = makeEvent('GET', '/features/weekly/availability')
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body!)

    const fullWeek = body.weeks.find((w: { isoWeek: string }) => w.isoWeek === targetWeek)
    expect(fullWeek.slotsAvailable).toBe(0)
    expect(fullWeek.isAvailable).toBe(false)
  })
})
