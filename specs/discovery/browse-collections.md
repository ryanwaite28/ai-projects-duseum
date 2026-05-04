## Spec: Browse Collections — Homepage Section + Dedicated Browse Page

**Status**: ✅ Implemented
**FR coverage**: FR-DISC-06, FR-DISC-07
**Relevant PROJECT.md sections**: 2.8, 4.7, 6.8, 8
**Related specs**: `specs/artworks/collection-poster-image.md` (posterUrl), `specs/discovery/browse-artworks.md` (pattern reference), `specs/artworks/collections-crud.md`

**What this implements**: Two new discovery surfaces for FREE collections — (1) an "Explore Collections" section on the public homepage showing up to 6 randomly sampled FREE collections, and (2) a dedicated `/browse/collections` frontend page backed by a new `GET /collections` Lambda route. Both use the new `GSI-AllFreeCollections` DynamoDB index.

**Prerequisite**: `specs/artworks/collection-poster-image.md` must be implemented first — both surfaces return `posterUrl`.

---

## New/modified files

### Infrastructure
- `infrastructure/stacks/storage-stack.ts` — add `GSI-AllFreeCollections` to the main DynamoDB table (PK=`collectionBrowse`, SK=`createdAt`)
- `infrastructure/stacks/api-stack.ts` — register `GET /collections` route on `artworks-lambda`

### Lambda
- `lambdas/artworks/src/routes/list-collections.ts` (new) — `GET /collections` — paginated list of all FREE collections for the browse page (FR-DISC-07)
- `lambdas/artworks/src/index.ts` — add `list-collections` dispatch
- `packages/shared/src/db/collections.repository.ts` — add `listFreeCollections()` function using `GSI-AllFreeCollections`; add `collectionBrowse = 'FREE'` write on FREE collection METADATA item in `createCollection`

### Frontend
- `frontend/src/services/collections.service.ts` — add `browse()` method calling `GET /collections`
- `frontend/src/components/ui/CollectionCard.tsx` (new) — shared card component; shows poster → coverPieceUrl → placeholder fallback
- `frontend/src/components/home/ExploreCollectionsSection.tsx` (new) — calls `GET /collections?limit=6` directly (not via homepage endpoint); 6-card grid; links to `/browse/collections`
- `frontend/src/pages/browse-collections.tsx` (new) — `/browse/collections` page; paginated with "Load more"
- `frontend/src/App.tsx` — added `BrowseCollectionsPage` lazy import + route

### Tests
- `lambdas/artworks/src/__tests__/collections.integration.test.ts` — added `GET /collections` browse tests (happy path, SUBSCRIBER_ONLY exclusion, empty case, cursor pagination, invalid sort → 400)

### Implementation deviations from original spec
- `GET /features/homepage` was NOT extended with `exploreCollections`. `ExploreCollectionsSection` fetches independently via `GET /collections?limit=6` — keeps features-lambda unchanged and avoids homepage data coupling.
- No separate `use-collections.ts` hook created; `useQuery`/`useInfiniteQuery` called inline in the components.
- Browse tests added to existing `collections.integration.test.ts` instead of a new file.

---

## DynamoDB access patterns used

### New GSI: `GSI-AllFreeCollections`

| Attribute | Value | Notes |
|---|---|---|
| PK | `collectionBrowse = 'FREE'` | Written only on FREE collection METADATA items; SUBSCRIBER_ONLY items do not carry this attribute (sparse GSI) |
| SK | `createdAt` (ISO 8601 string) | Newest-first sort via `ScanIndexForward: false` |

**Schema change**: `createCollection()` in `collections.repository.ts` must write `collectionBrowse: 'FREE'` on the METADATA item when `visibility === 'FREE'`. SUBSCRIBER_ONLY collections must NOT carry this attribute.

---

## Business logic

### `listFreeCollections()` (shared package)

```
Input: { limit?: number, lastKey?: Record<string, unknown> }
Query: GSI-AllFreeCollections, KeyConditionExpression: collectionBrowse = 'FREE'
ScanIndexForward: false (newest first)
Limit: min(limit, 50), default 20
Returns: { items: Collection[], lastKey? }
```

Each item is enriched with `posterUrl = posterS3Key ? publicUrl(posterS3Key) : null`, `authorDisplayName` (fetched from `AuthorProfile`), and `pieceCount` (from `countCollectionItems`).

### FR-DISC-06 — Homepage "Explore Collections"

1. `GET /features/homepage` is extended to also query `listFreeCollections({ limit: 20 })`
2. Lambda randomly samples up to 6 items from the result in memory (Fisher-Yates shuffle, take first 6)
3. Response includes new key `exploreCollections: CollectionCard[]`
4. If no FREE collections exist, `exploreCollections` is an empty array (never null)
5. Runs in parallel with existing homepage data fetches (daily featured, weekly featured, recent pieces)

### FR-DISC-07 — `GET /collections`

```
GET /collections?sort=newest&limit=20&cursor=<base64url>
```

- `sort=newest` is the only accepted value; anything else → 400
- `limit` default 20, clamped to 50
- Returns only FREE collections (SUBSCRIBER_ONLY are never surfaced on the global browse)
- Response shape:
  ```json
  {
    "items": [
      {
        "collectionId": "...",
        "title": "...",
        "visibility": "FREE",
        "posterUrl": "https://... | null",
        "authorId": "...",
        "authorDisplayName": "...",
        "pieceCount": 12,
        "createdAt": "..."
      }
    ],
    "cursor": "<base64url> | undefined"
  }
  ```

### Frontend: `/browse/collections` page

- Same page layout as `/browse` (artworks): `EyebrowLabel` → section title → filter bar → grid
- Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6`
- Pagination: "Load more" button that appends next page (React Query `useInfiniteQuery`)
- Each cell: `CollectionCard` component (poster → thumbnail → placeholder; title; author name; piece count badge)
- No auth required (FREE collections only)

### Frontend: `ExploreCollectionsSection` (homepage)

- Placed between `WeeklyFeaturedCarousel` and `RecentPiecesSection` in `home.tsx`
- `EyebrowLabel` + heading with italic gold emphasis word
- 3-column grid on desktop
- Shows 6 cards maximum; no pagination (links to `/browse/collections` for more)
- Fetches `GET /collections?limit=6` directly via `useQuery`; section hidden when no collections exist

---

## Error conditions

- `GET /collections` with `sort` ≠ `newest` → 400 `{ error: 'Invalid sort — only newest is supported' }`
- `GET /collections` with non-integer `limit` → 400
- `GET /collections` with invalid `cursor` → 400

---

## Tests to write

**Lambda integration** (`lambdas/artworks/__tests__/list-collections.integration.test.ts`):
- Returns empty array when no FREE collections exist
- Returns FREE collections only (SUBSCRIBER_ONLY must not appear)
- Response shape includes `collectionId`, `title`, `posterUrl`, `authorId`, `authorDisplayName`, `pieceCount`, `createdAt`
- Cursor pagination: second page starts after first page's last item
- `sort=trending` → 400; invalid `limit` → 400

**Lambda integration** (`lambdas/features/__tests__/`):
- `GET /features/homepage` response shape includes `exploreCollections` array
- `exploreCollections` is empty array when no FREE collections exist
- `exploreCollections` contains at most 6 items when more exist

**Frontend component** (`ExploreCollectionsSection.test.tsx`):
- Renders skeleton when loading
- Renders collection cards when data present
- Renders empty state when `exploreCollections` is empty

---

## Done-when checklist

- [x] `GSI-AllFreeCollections` added to StorageStack CDK; `collectionBrowse = 'FREE'` written by `createCollection()` for FREE collections
- [x] `listFreeCollections()` added to `collections.repository.ts`
- [x] `GET /collections` route implemented in `artworks-lambda`; registered in `api-stack.ts`
- [x] `browse()` service method added to `collections.service.ts`
- [x] `/browse/collections` frontend page renders paginated FREE collections
- [x] `ExploreCollectionsSection` component rendered on homepage (between weekly carousel and recent pieces)
- [x] Integration tests added to `collections.integration.test.ts`: happy path shape, SUBSCRIBER_ONLY exclusion, empty case, cursor pagination, invalid sort → 400
- [x] `specs/testing/test-coverage.md` updated with new test entries
- [x] Spec `**Status**` updated to ✅ Implemented
