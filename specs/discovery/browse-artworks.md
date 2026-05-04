## Spec: Discovery & Browse

**Status**: ✅ Implemented
**FR coverage**: FR-DISC-01, FR-DISC-02, FR-DISC-03, FR-DISC-04, FR-DISC-05, FR-VIEW-02
**Relevant PROJECT.md sections**: 2.8, 4.7, 8
**Related specs**: `specs/discovery/browse-collections.md` (FR-DISC-06/07 — collections on homepage + browse page, not yet implemented)

**What this implements**: Public homepage data (Daily Featured Author, Weekly Featured Authors, recent/trending pieces); browse page with filters; full-text search; piece detail page data.

**Prerequisites**: GSI2 (tag browse) and GSI3 (recent/trending) defined on DynamoDB main table; `artworks/access-control.md` complete; `features/daily-featured.md` and `features/maintenance-rotation.md` complete; `features-lambda` and `artworks-lambda` deployed

**Done when**:
- [x] `GET /features/homepage` returns daily featured author (null if not yet set) + weekly featured authors (order randomized) + 12 recent PUBLIC pieces; no auth required
- [x] `GET /artworks` returns only PUBLIC pieces; tag, category, authorId filters work; cursor pagination functional; `sort=newest` accepted, any other sort value → 400
- [x] `limit` > 50 → clamped to 50; invalid `limit` → 400
- [x] Spec `**Status**` updated to ✅ Implemented

**Deferred** (noted in PROJECT.md FR-DISC-01/02/03/05):
- sort=trending, sort=most-viewed — requires trendScore GSI not yet provisioned
- Full-text search — deferred to future phase
- Related pieces + comment thread on detail page — deferred to frontend integration phase
- Separate `/artworks/browse` route — `GET /artworks` already covers the browse use case

**New/modified files**:
- `lambdas/features/src/routes/get-homepage.ts` — new: `GET /features/homepage`
- `lambdas/features/src/index.ts` — add homepage dispatch
- `infrastructure/stacks/api-stack.ts` — register `RouteGetHomepage`
- `lambdas/artworks/src/routes/list-artworks.ts` — add `sort` param validation (only `newest` accepted)

**DynamoDB access patterns used**:
- Daily featured: `PK=CONFIG, SK=DAILY_FEATURED_AUTHOR` (config table)
- Weekly featured: `GSI-WeeklyFeatureByStatus` with status=ACTIVE + current ISO week
- Recent pieces: `GSI-AllPublicPieces`, newest first (already used by `listPublicArtPieces`)

**Business logic**:
1. `GET /features/homepage` (public, no auth):
   - Load in parallel: daily featured author config + this week's ACTIVE bookings + recent 12 PUBLIC pieces
   - Daily featured: null if maintenance-lambda hasn't run yet (no error)
   - Weekly featured: shuffle order each response (FR-FEAT-16)
   - Return combined payload; caller renders each section independently
2. `GET /artworks?sort=newest&category=&tag=&authorId=&limit=&cursor=` (existing, enhanced):
   - Add `sort` param: only `newest` valid; anything else → 400
   - `limit` already clamped to 50

**Error conditions**:
- `sort` not `newest` → 400
- `limit` > 50 → clamped; non-integer → 400
