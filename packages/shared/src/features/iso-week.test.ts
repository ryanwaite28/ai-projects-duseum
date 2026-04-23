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
} from './index.js'

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
  it('returns an array with length equal to advanceWeeks', () => {
    expect(getEligibleWeeks(8)).toHaveLength(8)
  })

  it('first entry is next week (current + 1)', () => {
    const current = getCurrentIsoWeek()
    const eligible = getEligibleWeeks(8)
    expect(eligible[0]).toBe(addWeeks(current, 1))
  })

  it('last entry is current + advanceWeeks', () => {
    const current = getCurrentIsoWeek()
    const eligible = getEligibleWeeks(8)
    expect(eligible[7]).toBe(addWeeks(current, 8))
  })

  it('all entries are in YYYY-Www format', () => {
    getEligibleWeeks(4).forEach(w => {
      expect(w).toMatch(/^\d{4}-W\d{2}$/)
    })
  })

  it('returns empty array when advanceWeeks is 0', () => {
    expect(getEligibleWeeks(0)).toEqual([])
  })

  it('weeks are sequential (each is one week apart)', () => {
    const weeks = getEligibleWeeks(5)
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i]).toBe(addWeeks(weeks[i - 1]!, 1))
    }
  })
})
