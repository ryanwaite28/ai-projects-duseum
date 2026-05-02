// =============================================================================
// packages/shared/src/features/iso-week.test.ts
// Unit tests for ISO week utilities — Section 15.2
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  getIsoWeekForDate,
  getCurrentIsoWeek,
  addWeeks,
  isWithinThreeMonthWindow,
  getEligibleWeeks,
  shouldActivateImmediately,
} from './index.js'

// Deterministic reference dates for time-sensitive tests
const MONDAY = new Date('2025-08-04') // 2025-W32, getUTCDay() === 1
const SUNDAY = new Date('2025-08-10') // 2025-W32, getUTCDay() === 0

// ── getIsoWeekForDate ─────────────────────────────────────────────────────────

describe('getIsoWeekForDate', () => {
  it('returns YYYY-Www format', () => {
    const week = getIsoWeekForDate(new Date('2025-08-04'))
    expect(week).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('returns correct week for a known date (2025-08-04 = W32)', () => {
    expect(getIsoWeekForDate(new Date('2025-08-04'))).toBe('2025-W32')
  })

  it('returns correct week for Jan 1 2025 (belongs to 2025-W01)', () => {
    // Jan 1 2025 is a Wednesday — it's in W01 2025
    expect(getIsoWeekForDate(new Date('2025-01-01'))).toBe('2025-W01')
  })

  it('returns correct week for Dec 30 2024 (belongs to 2025-W01)', () => {
    // Dec 30 2024 is a Monday — first day of W01 2025
    expect(getIsoWeekForDate(new Date('2024-12-30'))).toBe('2025-W01')
  })

  it('returns correct week for Dec 28 2024 (belongs to 2024-W52)', () => {
    // Dec 28 2024 is a Saturday
    expect(getIsoWeekForDate(new Date('2024-12-28'))).toBe('2024-W52')
  })

  it('pads week number to two digits', () => {
    // 2025-01-06 is a Monday in W02
    expect(getIsoWeekForDate(new Date('2025-01-06'))).toBe('2025-W02')
  })
})

// ── getCurrentIsoWeek ─────────────────────────────────────────────────────────

describe('getCurrentIsoWeek', () => {
  it('returns a valid YYYY-Www string', () => {
    expect(getCurrentIsoWeek()).toMatch(/^\d{4}-W\d{2}$/)
  })
})

// ── addWeeks ──────────────────────────────────────────────────────────────────

describe('addWeeks', () => {
  it('adds 1 week within the same year', () => {
    expect(addWeeks('2025-W32', 1)).toBe('2025-W33')
  })

  it('adds multiple weeks within the same year', () => {
    expect(addWeeks('2025-W01', 4)).toBe('2025-W05')
  })

  it('handles year boundary (adding weeks into next year)', () => {
    // 2025-W52 + 1 week = 2026-W01
    expect(addWeeks('2025-W52', 1)).toBe('2026-W01')
  })

  it('handles negative n (subtracting weeks)', () => {
    expect(addWeeks('2025-W32', -1)).toBe('2025-W31')
  })

  it('handles subtracting across year boundary', () => {
    // 2025-W01 - 1 week = 2024-W52
    expect(addWeeks('2025-W01', -1)).toBe('2024-W52')
  })

  it('returns same week when n = 0', () => {
    expect(addWeeks('2025-W20', 0)).toBe('2025-W20')
  })
})

// ── isWithinThreeMonthWindow ──────────────────────────────────────────────────

describe('isWithinThreeMonthWindow', () => {
  const ref = new Date('2025-08-04') // W32 2025

  it('returns true when booking is the current week (0 weeks ago)', () => {
    expect(isWithinThreeMonthWindow('2025-W32', ref)).toBe(true)
  })

  it('returns true when booking is 12 weeks ago (within window)', () => {
    const booking = addWeeks('2025-W32', -12) // W20
    expect(isWithinThreeMonthWindow(booking, ref)).toBe(true)
  })

  it('returns false when booking is exactly 13 weeks ago (outside window)', () => {
    const booking = addWeeks('2025-W32', -13) // W19
    expect(isWithinThreeMonthWindow(booking, ref)).toBe(false)
  })

  it('returns false when booking is 20 weeks ago (clearly outside window)', () => {
    const booking = addWeeks('2025-W32', -20)
    expect(isWithinThreeMonthWindow(booking, ref)).toBe(false)
  })

  it('returns false when booking is in the future', () => {
    const futureBooking = addWeeks('2025-W32', 1) // W33 — future
    expect(isWithinThreeMonthWindow(futureBooking, ref)).toBe(false)
  })

  it('returns true when booking is 1 week ago (well within window)', () => {
    const booking = addWeeks('2025-W32', -1)
    expect(isWithinThreeMonthWindow(booking, ref)).toBe(true)
  })
})

// ── getEligibleWeeks ──────────────────────────────────────────────────────────

describe('getEligibleWeeks', () => {
  it('returns advanceWeeks + 1 entries (current week + N future weeks)', () => {
    expect(getEligibleWeeks(8, MONDAY)).toHaveLength(9)
  })

  it('first entry is the current week on a non-Sunday', () => {
    expect(getEligibleWeeks(8, MONDAY)[0]).toBe('2025-W32')
  })

  it('last entry is current + advanceWeeks', () => {
    const eligible = getEligibleWeeks(8, MONDAY)
    expect(eligible[8]).toBe(addWeeks('2025-W32', 8))
  })

  it('all entries are in YYYY-Www format', () => {
    getEligibleWeeks(4, MONDAY).forEach(w => {
      expect(w).toMatch(/^\d{4}-W\d{2}$/)
    })
  })

  it('returns single entry (current week) when advanceWeeks is 0', () => {
    expect(getEligibleWeeks(0, MONDAY)).toEqual(['2025-W32'])
  })

  it('weeks are sequential (each is one week apart)', () => {
    const weeks = getEligibleWeeks(5, MONDAY)
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i]).toBe(addWeeks(weeks[i - 1]!, 1))
    }
  })

  it('on Sunday: skips the current week, first entry is next week', () => {
    // SUNDAY = 2025-08-10, which is still in 2025-W32 (getUTCDay() === 0)
    const eligible = getEligibleWeeks(3, SUNDAY)
    expect(eligible[0]).toBe('2025-W33')
  })

  it('on Sunday with advanceWeeks=3: returns exactly 3 entries', () => {
    expect(getEligibleWeeks(3, SUNDAY)).toHaveLength(3)
  })

  it('on Sunday with advanceWeeks=0: returns empty array (current week blocked)', () => {
    expect(getEligibleWeeks(0, SUNDAY)).toHaveLength(0)
  })
})

// ── shouldActivateImmediately ─────────────────────────────────────────────────

describe('shouldActivateImmediately', () => {
  it('returns true when booking is for the current ISO week', () => {
    expect(shouldActivateImmediately('2025-W32', MONDAY)).toBe(true)
  })

  it('returns false when booking is for a future week', () => {
    expect(shouldActivateImmediately('2025-W33', MONDAY)).toBe(false)
  })

  it('returns false when booking is for a past week', () => {
    expect(shouldActivateImmediately('2025-W31', MONDAY)).toBe(false)
  })

  it('returns true on a Sunday for the same ISO week (booking made earlier in the week)', () => {
    // SUNDAY (2025-08-10) is still in 2025-W32 — a booking placed Mon–Sat for W32
    // should still activate immediately when payment confirms on Sunday
    expect(shouldActivateImmediately('2025-W32', SUNDAY)).toBe(true)
  })
})
