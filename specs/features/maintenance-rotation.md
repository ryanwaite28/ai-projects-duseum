## Spec: Weekly Feature Rotation & Maintenance Tasks

**Status**: ✅ Implemented
**FR coverage**: FR-FEAT-15
**Relevant PROJECT.md sections**: 2.11, 4.2, 4.7

**What this implements**: Monday 00:00 UTC rotation of Weekly Featured Authors (activate upcoming week, archive previous); daily cleanup of expired upload intents; maintenance-lambda EventBridge triggers.

**Prerequisites**: `features/weekly-booking.md` complete (CONFIRMED booking records exist); EventBridge Monday rule (`cron(0 0 ? * MON *)`) wired to `maintenance-lambda`; DynamoDB config table deployed

**Done when**:
- [x] Monday rotation activates CONFIRMED→ACTIVE bookings for current week (sets `activatedAt`); features endpoint reads ACTIVE directly (no separate CONFIG record needed)
- [x] Previous week's ACTIVE bookings set to `featureStatus=ARCHIVED`
- [x] Safety-net: previous week's CONFIRMED bookings (late payments) also archived to `ARCHIVED`
- [x] No CONFIRMED bookings for current week → empty result from features endpoint (no crash)
- [x] Daily EventBridge event routes to `runDailySelection()` correctly (not to rotation handler)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/maintenance/src/handlers/weekly-rotation.ts` — `rotateWeeklyFeaturedAuthors()`
- `lambdas/maintenance/src/handlers/cleanup.ts` — `cleanupExpiredUploadIntents()`
- `lambdas/maintenance/src/index.ts` — EventBridge handler routing to daily vs Monday handler
- `infrastructure/stacks/api-stack.ts` (or messaging-stack) — EventBridge rules: daily 00:00 UTC, Monday 00:00 UTC

**DynamoDB access patterns used**:
- Current week bookings: `PK=FEATURE#WEEK#{isoWeek}` — query all SK begins_with `AUTHOR#`
- Previous week bookings: same pattern for previous ISO week
- Config current week record: `PK=CONFIG#WEEKLY_FEATURED, SK=META` — `isoWeek`, `authorIds[]`
- Upload intents cleanup: query `PK begins_with UPLOAD#` with status=`PENDING` and `expiresAt < now`

**Business logic**:
1. Monday 00:00 UTC EventBridge → `runWeeklyRotation()` in `lambdas/maintenance/src/tasks/weekly-rotation.ts`:
   - Compute `currentWeek` and `previousWeek` via `getCurrentIsoWeek()` / `addWeeks(current, -1)` from `packages/shared`
   - **Step 1 — Activate**: query `GSI-WeeklyFeatureByStatus` for `featureStatus=CONFIRMED` + `isoWeek=currentWeek` (with `FilterExpression: begins_with(PK, 'FEATURE#WEEK#')` to avoid GSI double-count); set each to `featureStatus=ACTIVE`, `activatedAt=now`
   - **Step 2 — Archive ACTIVE**: same query for `featureStatus=ACTIVE` + `isoWeek=previousWeek`; set each to `ARCHIVED`
   - **Step 3 — Safety-net**: query `featureStatus=CONFIRMED` + `isoWeek=previousWeek`; set each to `ARCHIVED` (catches payments confirmed after Monday 00:00 UTC missed by last week's rotation)
   - All three steps use `updateBookingStatus()` which updates both the week-keyed and author-keyed records atomically
2. Daily 00:00 UTC EventBridge → runs `selectDailyFeaturedAuthor()` (see `specs/features/daily-featured.md`)
3. Cleanup (daily): query expired PENDING UploadIntents → delete DynamoDB records

**Infrastructure**:
- EventBridge Rule 1: `cron(0 0 * * ? *)` → maintenance-lambda with `{ action: 'DAILY' }`
- EventBridge Rule 2: `cron(0 0 ? * MON *)` → maintenance-lambda with `{ action: 'WEEKLY_ROTATION' }`
- Both rules invoke the same Lambda; `action` field distinguishes behavior

**Error conditions**:
- No CONFIRMED bookings for current week → write empty `CONFIG#WEEKLY_FEATURED` (no featured Authors this week)
- DynamoDB failure during rotation → log + alert; do NOT partially archive (use DynamoDB transactions for atomicity)

**Tests to write**:
- Unit: ISO week arithmetic; previous week computation
- Integration: seed CONFIRMED bookings for next week, run rotation handler, verify `CONFIG#WEEKLY_FEATURED` written and previous week archived
