## Spec: Browse & Gallery UI

**Status**: ⬜ Pending
**FR coverage**: FR-DISC-01, FR-DISC-02, FR-DISC-05, FR-VIEW-02, FR-VIEW-03, FR-VIEW-04, FR-VIEW-05
**Relevant PROJECT.md sections**: 2.8, 6.8

**What this implements**: Public homepage with Daily Featured Author spotlight + Weekly Featured Authors carousel + recent/trending pieces; Browse page with filters; Art Piece detail page with access tier gating.

**Prerequisites**: Browse and homepage API endpoints complete (`discovery/browse-artworks.md`); `ArtPieceCard` and `LockedPieceOverlay` components created; design tokens in `tailwind.config.ts`; `artworks.service.ts` with `browseArtworks()` and `getArtworkDetail()` implemented

**Done when**:
- [ ] Homepage renders Daily Featured Author hero + Weekly Featured carousel + recent/trending grids
- [ ] `LockedPieceOverlay` never includes actual `img` `src` when `accessible=false`
- [ ] `ArtPieceCard` renders correct overlay type (PRIVATE/free-tier) based on API `accessible` flag
- [ ] Browse page filters (category, tags, sort) update URL params and trigger re-fetch
- [ ] Cursor-based pagination loads next page without full page reload
- [ ] Piece detail page shows full image when `accessible=true`; locked overlay when `accessible=false`
- [ ] Frontend never constructs CloudFront/S3 URLs — always uses `imageUrl`/`thumbnailUrl` from API
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/pages/home.tsx` — homepage: featured Author, featured Authors carousel, recent + trending
- `frontend/src/pages/browse.tsx` — browse with category/tag filters and sort
- `frontend/src/pages/artwork/[pieceId].tsx` — piece detail page
- `frontend/src/components/artwork/ArtPieceCard.tsx` — shared piece card with access gate overlay
- `frontend/src/components/artwork/LockedPieceOverlay.tsx` — blur + lock + subscribe CTA
- `frontend/src/services/artworks.service.ts` — `browseArtworks()`, `getArtworkDetail()`

**Design system**:
- Art piece aspect ratio: `aspect-[4/5]` (portrait) or `aspect-video` (landscape) with `border border-gold/10`
- `object-cover` for thumbnails, `object-contain` for detail view
- PRIVATE inaccessible: `filter blur-sm` overlay + lock icon + "Subscribe to unlock" CTA — NEVER fetch or render actual image
- `imageUrl` / `thumbnailUrl` always from API response — frontend never constructs CloudFront/S3 URLs
- `EyebrowLabel` above every section heading; section alternation pattern

**Business logic**:
1. Homepage: `GET /features/homepage` → render Daily Featured Author as hero; Weekly Featured Authors randomized grid; paginated recent + trending
2. Browse: `GET /artworks/browse` with filters; cursor-based pagination; filter UI (category dropdown, tag pills, sort dropdown)
3. Piece detail:
   - If `accessible=true` → render full image (from `imageUrl`)
   - If `accessible=false` (PRIVATE, not subscribed) → `LockedPieceOverlay` with subscribe CTA
   - If `accessible=false` (beyond free tier) → upsell overlay for platform subscription
4. Free-tier limit indicator: count visible pieces per Author on browse; show "X more pieces — subscribe to see all" when limit reached

**Tests to write**:
- Component: `LockedPieceOverlay` never renders actual `img` src when `accessible=false`
- Component: `ArtPieceCard` renders correct overlay based on `accessible` flag
