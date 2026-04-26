## Spec: Discovery & Browse

**Status**: ⬜ Pending
**FR coverage**: FR-DISC-01, FR-DISC-02, FR-DISC-03, FR-DISC-04, FR-DISC-05, FR-VIEW-02
**Relevant PROJECT.md sections**: 2.8, 4.7, 8

**What this implements**: Public homepage data (Daily Featured Author, Weekly Featured Authors, recent/trending pieces); browse page with filters; full-text search; piece detail page data.

**Prerequisites**: GSI2 (tag browse) and GSI3 (recent/trending) defined on DynamoDB main table; `artworks/access-control.md` complete; `features/daily-featured.md` and `features/maintenance-rotation.md` complete; `features-lambda` and `artworks-lambda` deployed

**Done when**:
- [ ] `GET /features/homepage` returns daily featured author + weekly featured authors (order randomized per request) + recent PUBLIC pieces + trending pieces; no auth required
- [ ] `GET /artworks/browse` returns only PUBLIC pieces; tag and category filters work correctly; cursor pagination functional
- [ ] `GET /artworks/{id}/detail` returns 403 stub for PRIVATE inaccessible pieces (not full data); related pieces included
- [ ] Browse `sort` value not in enum → 400; `limit` > 50 → clamped or 400
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/features/src/routes/get-homepage.ts` — `GET /features/homepage` — aggregated homepage data
- `lambdas/artworks/src/routes/browse-artworks.ts` — `GET /artworks/browse` — filtered + paginated browse
- `lambdas/artworks/src/routes/search-artworks.ts` — `GET /artworks/search?q=` — title/description/tag search
- `lambdas/artworks/src/routes/get-piece-detail.ts` — `GET /artworks/{pieceId}/detail` — full piece detail page

**DynamoDB access patterns used**:
- Recent pieces: GSI sorted by `publishedAt` descending (PUBLIC only)
- Trending pieces: GSI on `trendScore` (composite of view + reaction velocity); updated by maintenance-lambda
- Tag filter: `GSI2PK=TAG#{tag}` → pieces by tag
- Author search: GSI on Author `displayName` (or DynamoDB scan with filter for v1)
- Piece detail: `PK=ART#{pieceId}, SK=META`; related pieces by Author + same tags

**Business logic**:
1. `GET /features/homepage` (public, no auth):
   - Daily Featured Author (from `CONFIG#DAILY_FEATURED_AUTHOR`)
   - Weekly Featured Authors (from `CONFIG#WEEKLY_FEATURED`); randomize order each request (FR-FEAT-16)
   - Recently published PUBLIC pieces (last 20, paginated)
   - Trending pieces (top 10 by trendScore)
2. `GET /artworks/browse?category=&tags=&sort=newest|trending|most-viewed&limit=20&cursor=`:
   - Filters: `category` (medium tag), `tags` (comma-separated, must include all specified tags)
   - Sort: newest (`publishedAt` desc), trending (`trendScore` desc), most-viewed (`viewCount` desc)
   - Access control: only PUBLIC pieces in browse; PRIVATE pieces never appear in browse
3. `GET /artworks/search?q=&limit=20&cursor=`:
   - v1: Lambda-side filter scan (acceptable at early scale; OpenSearch deferred to future phase)
   - Match against: title, description, tags, Author displayName
4. `GET /artworks/{pieceId}/detail`:
   - Full metadata, Author info, comment thread (first page), reaction counts, viewer's own reaction
   - Related pieces: same Author (up to 4) + same tags from other Authors (up to 4)
   - Access control via `checkArtPieceAccess()`; PRIVATE inaccessible pieces: return metadata stub only

**Error conditions**:
- `sort` value not in enum → 400
- `limit` > 50 → clamp or 400
- Piece not found → 404

**Tests to write**:
- Unit: trending score formula; tag filter intersection logic
- Integration: browse with tag filter → only pieces with that tag returned; search → title match; homepage includes randomized Weekly Featured order
