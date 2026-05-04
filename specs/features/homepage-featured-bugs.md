## Spec: Homepage Featured Bugs — Daily Spotlight Reveal + Weekly Card Icon

**Status**: ✅ Implemented
**FR coverage**: FR-FEAT-02 (daily spotlight), FR-FEAT-08/16 (weekly carousel)
**Relevant PROJECT.md sections**: 2.11, 6.8 (animations)
**Related specs**: `specs/features/daily-featured.md`, `specs/features/weekly-booking.md`

**What this implements**: Two bug fixes on the homepage featured sections.

---

## Bug 1 — Daily spotlight not consistently rendering (reveal animation dead-lock)

**Root cause**: `useReveal` creates an `IntersectionObserver` once on mount (`useEffect(fn, [])`). `DailyFeaturedSpotlight` returned the skeleton early (no `ref`) when `isLoading` was true, so the observer's effect fired with `ref.current = null` and never set up. When the data arrived and the real `<section ref={ref}>` mounted, the empty-deps effect didn't re-run — `.visible` was never added — and the section stayed `opacity: 0`. Only worked when the query was cached and `isLoading` was immediately false.

Same latent bug existed in `WeeklyFeaturedCarousel`.

**Fix**: Both components now always render the outer `<section ref={ref} className="reveal …">`. The skeleton and loaded content are conditional children inside it. The ref is always attached from first mount so `IntersectionObserver` fires correctly in all load-state sequences.

---

## Bug 2 — Weekly card shows slot number instead of author icon

**Root cause**: `AuthorSlot` fell back to the zero-padded slot index (`01`, `02`, `03`) when the author had no `coverPhotoUrl`. The author's profile icon (`profilePhotoS3Key`) was not included in `GET /features/weekly`.

**Fix**:
- `get-weekly.ts` now includes `avatarUrl: string | null` for each `featuredAuthor` (same `publicUrl()` pattern as `coverPhotoUrl`).
- `WeeklyFeaturedAuthor` type extended with `avatarUrl: string | null`.
- `AuthorSlot` priority: cover photo → icon avatar (centered circle) → first-letter initials (for filled slots) → question-mark placeholder (for empty slots). Slot number removed entirely.

---

## New/modified files

- `lambdas/features/src/routes/get-weekly.ts` — added `avatarUrl` to each `featuredAuthor` entry
- `frontend/src/types/features.ts` — added `avatarUrl: string | null` to `WeeklyFeaturedAuthor`
- `frontend/src/components/home/DailyFeaturedSpotlight.tsx` — outer `<section ref={ref}>` always rendered; skeleton/content are inner conditionals
- `frontend/src/components/home/WeeklyFeaturedCarousel.tsx` — same outer-section fix; `AuthorSlot` icon priority: cover → avatar circle → initials → empty placeholder
- `lambdas/features/src/__tests__/weekly-and-bookings.integration.test.ts` — updated shape test to assert `avatarUrl` key; added test for URL when `profilePhotoS3Key` is set
- `frontend/src/components/__tests__/DailyFeaturedSpotlight.test.tsx` — 7 regression/rendering tests (FR-TESTING-06)

---

## Done when

- [x] Daily spotlight renders on first page load (not just from cache)
- [x] Weekly cards show icon circle with initials fallback instead of slot number
- [x] `GET /features/weekly` includes `avatarUrl` on each author entry
- [x] Integration tests for `avatarUrl` registered in `weekly-and-bookings.integration.test.ts`
- [x] 7 `DailyFeaturedSpotlight` regression tests pass (FR-TESTING-06)
- [x] TypeScript type-checks clean for both lambda and frontend
- [x] `specs/testing/test-coverage.md` updated
