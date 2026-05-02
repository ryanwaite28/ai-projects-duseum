## Spec: Daily Featured Author

**Status**: ✅ Implemented
**FR coverage**: FR-FEAT-01, FR-FEAT-02, FR-FEAT-03, FR-FEAT-04, FR-FEAT-05, FR-FEAT-06, FR-FEAT-07
**Relevant PROJECT.md sections**: 2.11, 4.2, 4.7, 8

**What this implements**: Automated daily selection of one Author as the Daily Featured Author; 7-day exclusion window; Admin manual override; homepage spotlight display; maintenance-lambda EventBridge trigger.

**Prerequisites**: DynamoDB config table deployed; `packages/shared/src/features/daily-selection.ts` created; EventBridge daily rule (`cron(0 0 * * ? *)`) wired to `maintenance-lambda`; `users/author-onboarding.md` complete (Author records exist)

**Done when**:
- [x] Daily selection excludes Authors from last 7 `DAILY_FEATURED_HISTORY` entries
- [x] Empty eligible Author pool → graceful fallback (previous selection kept; no crash or error)
- [x] Admin override writes `isOverride=true` and `overriddenBy=adminId`; does NOT write to `DAILY_FEATURED_HISTORY`
- [x] `GET /features/daily` returns spotlight data with no auth required (unauthenticated → 200)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/maintenance/src/handlers/daily-feature.ts` — `selectDailyFeaturedAuthor()` — selection algorithm
- `lambdas/features/src/routes/get-daily-featured.ts` — `GET /features/daily` — public endpoint
- `lambdas/admin/src/routes/override-daily-featured.ts` — `PUT /admin/features/daily` — Admin override
- `packages/shared/src/features/daily-selection.ts` — selection + exclusion window logic

**DynamoDB access patterns used**:
- Config table: `PK=CONFIG#DAILY_FEATURED_AUTHOR, SK=META` — `authorId`, `selectedAt`, `isOverride`
- Last 7 selections: `PK=CONFIG#DAILY_FEATURED_HISTORY, SK=DATE#{isoDate}` — query range for exclusion
- Author pool: GSI scan for all `PROFILE#AUTHOR` with status=`ACTIVE` and `publicPieceCount > 0`

**Business logic**:
1. EventBridge fires at 00:00 UTC daily → `maintenance-lambda` → `selectDailyFeaturedAuthor()`:
   - Query all ACTIVE Authors with ≥ 1 PUBLIC published piece
   - Exclude Authors selected in last 7 days (query `DAILY_FEATURED_HISTORY`)
   - Random selection from remaining pool
   - Write `CONFIG#DAILY_FEATURED_AUTHOR` with `authorId` + `selectedAt`
   - Write `DAILY_FEATURED_HISTORY` entry for today
   - Log selection (no notification to Author — FR-FEAT-04)
2. `GET /features/daily` (no auth required — FR-FEAT-02):
   - Read `CONFIG#DAILY_FEATURED_AUTHOR`
   - Read Author profile → return: displayName, bio excerpt, coverPhotoUrl, up to 3 pinned pieces, followerCount, subscriptionCTA
3. `PUT /admin/features/daily` — body: `{ authorId }` (Admin only):
   - Validate Author is ACTIVE with ≥ 1 PUBLIC piece
   - Write `CONFIG#DAILY_FEATURED_AUTHOR` with `isOverride=true`, `overriddenBy=adminId`
   - Overridden day does NOT write to exclusion history (FR-FEAT-06)

**Error conditions**:
- No eligible Authors in pool → log warning; keep previous day's selection (graceful fallback)
- Admin override: `authorId` not found or not ACTIVE → 400

**Tests to write**:
- Unit: exclusion window logic; random selection from pool; empty pool fallback
- Integration: seed 10 authors, run selection, verify exclusion history written; admin override sets `isOverride=true`
