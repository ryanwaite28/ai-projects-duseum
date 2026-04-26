## Spec: Weekly Feature Rotation & Maintenance Tasks

**Status**: ⬜ Pending
**FR coverage**: FR-FEAT-15
**Relevant PROJECT.md sections**: 2.11, 4.2, 4.7

**What this implements**: Monday 00:00 UTC rotation of Weekly Featured Authors (activate upcoming week, archive previous); daily cleanup of expired upload intents; maintenance-lambda EventBridge triggers.

**Prerequisites**: `features/weekly-booking.md` complete (CONFIRMED booking records exist); EventBridge Monday rule (`cron(0 0 ? * MON *)`) wired to `maintenance-lambda`; DynamoDB config table deployed

**Done when**:
- [ ] Monday rotation writes `CONFIG#WEEKLY_FEATURED` with all CONFIRMED authors for current ISO week
- [ ] Previous week's CONFIRMED bookings set to `featureStatus=ARCHIVED` atomically (DynamoDB transaction)
- [ ] No CONFIRMED bookings for current week → writes `CONFIG#WEEKLY_FEATURED` with empty `authorIds=[]` (no crash)
- [ ] Daily EventBridge event routes to `selectDailyFeaturedAuthor()` correctly (not to rotation handler)
- [ ] Spec `**Status**` updated to ✅ Implemented

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
1. Monday 00:00 UTC EventBridge → `rotateWeeklyFeaturedAuthors()`:
   - Compute current ISO week string (e.g., `2026-W17`)
   - Query all `FEATURE#WEEK#{currentWeek}` records with `featureStatus=CONFIRMED`
   - Write `CONFIG#WEEKLY_FEATURED` with `authorIds` list for current week
   - Archive previous week: query `FEATURE#WEEK#{prevWeek}` records → set `featureStatus=ARCHIVED`
2. Daily 00:00 UTC EventBridge → also runs `selectDailyFeaturedAuthor()` (see `specs/features/daily-featured.md`)
3. Cleanup (daily): query expired PENDING UploadIntents → delete DynamoDB records (S3 objects cleaned by lifecycle rule or explicit delete)

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
