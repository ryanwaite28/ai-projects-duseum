// =============================================================================
// packages/shared/src/features/index.ts
// ISO week utilities + feature booking eligibility — Section 4.2, PROMPT-1.2
//
// ISO 8601 week format: "YYYY-Www"  (e.g. "2025-W32")
//   - Week starts on Monday, ends on Sunday
//   - Week 1 = the week containing the first Thursday of the year
// =============================================================================

// ── ISO week parsing & formatting ─────────────────────────────────────────────

/**
 * Returns the Monday (00:00 UTC) of the given ISO year+week.
 * Anchors on Jan 4 which is always in ISO week 1.
 */
const isoWeekToMonday = (year: number, week: number): Date => {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow = jan4.getUTCDay() || 7 // 1=Mon … 7=Sun
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (dow - 1))
  const target = new Date(week1Monday)
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7)
  return target
}

/**
 * Returns the ISO week string ("YYYY-Www") for a given Date.
 */
export const getIsoWeekForDate = (date: Date): string => {
  // Normalise to UTC midnight using UTC accessors to avoid local-timezone drift.
  // date-string inputs (e.g. new Date('2025-08-04')) are parsed as UTC midnight;
  // using getUTCFullYear/Month/Date ensures no off-by-one in negative-offset zones.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // Move to the nearest Thursday (ISO rule: week belongs to year of its Thursday)
  const dow = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  const year = d.getUTCFullYear()
  return `${year}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * Returns the ISO week string for the current moment (UTC).
 */
export const getCurrentIsoWeek = (): string => getIsoWeekForDate(new Date())

// ── Week arithmetic ───────────────────────────────────────────────────────────

/**
 * Parses a "YYYY-Www" string into { year, week }.
 */
const parseIsoWeek = (isoWeek: string): { year: number; week: number } => {
  const [yearStr, weekStr] = isoWeek.split('-W')
  return { year: Number(yearStr), week: Number(weekStr) }
}

/**
 * Adds n weeks (positive or negative) to an ISO week string.
 * Returns a new "YYYY-Www" string.
 */
export const addWeeks = (isoWeek: string, n: number): string => {
  const { year, week } = parseIsoWeek(isoWeek)
  const monday = isoWeekToMonday(year, week)
  monday.setUTCDate(monday.getUTCDate() + n * 7)
  return getIsoWeekForDate(monday)
}

/**
 * Returns the number of whole weeks between earlierWeek and laterWeek.
 * Positive when laterWeek is in the future.
 */
const weekDiff = (laterWeek: string, earlierWeek: string): number => {
  const { year: ly, week: lw } = parseIsoWeek(laterWeek)
  const { year: ey, week: ew } = parseIsoWeek(earlierWeek)
  const laterMs  = isoWeekToMonday(ly, lw).getTime()
  const earlierMs = isoWeekToMonday(ey, ew).getTime()
  return Math.round((laterMs - earlierMs) / (7 * 24 * 60 * 60 * 1000))
}

// ── Feature booking eligibility ───────────────────────────────────────────────

/**
 * Returns true when an Author's previous booking falls within the 3-month
 * rolling eligibility window (13 weeks inclusive), meaning they are NOT yet
 * eligible to book again.
 *
 * Rule from PROJECT.md §1.2: "Limited to 1 paid weekly feature per 3-month
 * rolling period per Author."
 *
 * @param bookingIsoWeek  - ISO week of the Author's most recent booking
 * @param nowDate         - Reference date (usually new Date())
 */
export const isWithinThreeMonthWindow = (
  bookingIsoWeek: string,
  nowDate: Date
): boolean => {
  const nowWeek = getIsoWeekForDate(nowDate)
  const diff = weekDiff(nowWeek, bookingIsoWeek)
  // diff ≥ 0 means booking is in the past or current week
  // diff < 13 means within 3-month window → ineligible
  return diff >= 0 && diff < 13
}

// ── Week bounds ───────────────────────────────────────────────────────────────

/**
 * Returns the Monday (weekStartDate) and Sunday (weekEndDate) ISO dates for
 * a given ISO week string.
 */
export const getWeekBounds = (
  isoWeek: string
): { weekStartDate: string; weekEndDate: string } => {
  const { year, week } = parseIsoWeek(isoWeek)
  const monday = isoWeekToMonday(year, week)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return {
    weekStartDate: monday.toISOString().split('T')[0],
    weekEndDate:   sunday.toISOString().split('T')[0],
  }
}

/**
 * Returns an ordered array of ISO week strings that an Author may book,
 * starting from the current week through `advanceWeeks` weeks ahead (FR-FEAT-14).
 *
 * @param advanceWeeks - How many weeks ahead to allow beyond the current week (default 8); total options = advanceWeeks + 1
 */
export const getEligibleWeeks = (advanceWeeks: number): string[] => {
  const current = getCurrentIsoWeek()
  const weeks: string[] = []
  for (let i = 0; i <= advanceWeeks; i++) {
    weeks.push(addWeeks(current, i))
  }
  return weeks
}
