## Spec: Weekly Feature — Include Current Week in Booking Calendar

**Status**: ✅ Implemented
**FR coverage**: FR-FEAT-10, FR-FEAT-14
**Relevant PROJECT.md sections**: 2.10, 4.2, shared/features

**What this implements**: Updates the weekly feature booking calendar to include the **current week** as the first bookable option (slot count permitting). Previously `getEligibleWeeks()` started at `i = 1` (next week only), excluding the current week entirely. The calendar now shows current week + 8 future weeks (9 options total), matching the updated FR-FEAT-14.

**New/modified files**:
- `packages/shared/src/features/index.ts` — change `getEligibleWeeks()` loop start from `i = 1` to `i = 0`
- `packages/shared/src/features/iso-week.test.ts` — update tests: length = `advanceWeeks + 1`; first entry = current week

**No changes needed to**:
- `lambdas/features/src/routes/get-weekly-availability.ts` — already passes `eligibleWeeks` to slot count query; current week will appear automatically
- `lambdas/features/src/routes/book-weekly.ts` — already validates `eligibleWeeks.includes(isoWeek)`; current week will be accepted automatically once included

**Business logic change**:
- `getEligibleWeeks(advanceWeeks)`: loop `for (let i = 0; i <= advanceWeeks; i++)` — current week at index 0, then 8 future weeks
- Return length changes from `advanceWeeks` to `advanceWeeks + 1`

**Done when**:
- [x] `getEligibleWeeks(8)` returns 9 entries; first entry equals the current ISO week
- [x] `GET /features/weekly/availability` response includes current week with correct `slotsAvailable`
- [x] `POST /features/weekly/book` accepts the current ISO week if slots remain
- [x] Unit tests updated and passing

**Tests to write**:
- Unit: `getEligibleWeeks(8)` length = 9; first entry = `getCurrentIsoWeek()`; last entry = current + 8
