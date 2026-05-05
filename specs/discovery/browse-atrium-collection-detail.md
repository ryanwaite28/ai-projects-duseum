## Spec: Browse Atrium + Collection Detail Page

**Status**: ✅ Implemented
**FR coverage**: FR-DISC-08, FR-COL-08 (also touches FR-COL-02, FR-COL-03, FR-COL-06)
**Relevant PROJECT.md sections**: 2.6, 2.8, 6.1, 6.8
**Related specs**:
- `specs/discovery/browse-collections.md` — `/browse/collections` page (linked from atrium)
- `specs/artworks/collections-crud.md` — collection CRUD; `get-collection.ts` modified here
- `specs/frontend/browse-gallery-ui.md` — artworks browse page moved to `/browse/pieces`
- `specs/frontend/navigation-user-menu.md` — NavBar Browse link unchanged (still `/browse`)

**What this implements**: Converts `/browse` into a three-lane "Atrium" landing page (FR-DISC-08) so users can navigate to art pieces, authors, or collections from a single entry point. Adds a dedicated collection detail page at `/collections/:collectionId` (FR-COL-08) with full access-control-aware rendering — subscribers see pieces, non-subscribers see a gate UI with a CTA to the author's profile.

---

## New/modified files

### Backend
- `lambdas/artworks/src/routes/get-collection.ts` — replaced `ForbiddenError` throws for SUBSCRIBER_ONLY gating with structured 200 responses carrying an `access` field (`'GRANTED'` | `'SUBSCRIBER_ONLY_GATED'` | `'AUTH_REQUIRED'`); added `posterUrl` to all responses; added `collectionMeta` spread for gated payloads

### Frontend — new pages
- `frontend/src/pages/browse-atrium.tsx` — Browse Atrium at `/browse`; three lane-cards (Art Pieces → `/browse/pieces`, Authors → `/authors`, Collections → `/browse/collections`)
- `frontend/src/pages/collection-detail.tsx` — Collection Detail at `/collections/:collectionId`; renders pieces grid (GRANTED) or gate UI (SUBSCRIBER_ONLY_GATED / AUTH_REQUIRED)

### Frontend — updated
- `frontend/src/App.tsx` — `/browse` → `BrowseAtriumPage`; `/browse/pieces` → `BrowsePage` (existing); `/collections/:collectionId` → `CollectionDetailPage`
- `frontend/src/types/artwork.ts` — added `CollectionAccess` union type + `CollectionDetail` interface
- `frontend/src/services/collections.service.ts` — added `getById(collectionId)` method
- `frontend/src/components/ui/CollectionCard.tsx` — link target changed from `/authors/:authorId` to `/collections/:collectionId`; removed `authorId` prop (was only used for the link)
- `frontend/src/pages/author-profile.tsx` — removed `disableLink` prop from `CollectionCard` usage so author-profile collection cards now link to collection detail
- `frontend/src/components/home/ExploreCollectionsSection.tsx` — removed `authorId` prop from `CollectionCard` usage
- `frontend/src/pages/browse-collections.tsx` — removed `authorId` prop from `CollectionCard` usage

### Tests
- `lambdas/artworks/src/__tests__/collections.integration.test.ts` — updated SUBSCRIBER_ONLY describe block: three tests now expect 200 with `access` field instead of 403
- `frontend/src/services/__tests__/collections.service.test.ts` — added `collectionsService.getById` tests (4 cases: URL, GRANTED shape, SUBSCRIBER_ONLY_GATED shape, AUTH_REQUIRED shape)

---

## DynamoDB access patterns used

- Collection by ID: `GetItem` — `PK=COLLECTION#{collectionId}`, `SK=METADATA` (existing `getCollection()`)
- Collection items: `Query` — `PK=COLLECTION#{collectionId}`, `SK begins_with ARTWORK#` (existing `listCollectionItems()`; only called when access is GRANTED)
- Author subscription check: `GetItem` on Subscription entity (existing `getAuthorSubscription()`)

No new GSIs or access patterns required.

---

## Backend business logic — `get-collection.ts`

1. `getCollection(docClient, collectionId)` — 404 if missing
2. `isOwner = !!userId && collection.ownerId === userId`
3. Build `collectionMeta` = `{ collectionId, ownerId, title, description, visibility, posterUrl, createdAt, updatedAt }`
4. If `SUBSCRIBER_ONLY` and not owner:
   - No `userId` → return `ok({ ...collectionMeta, access: 'AUTH_REQUIRED', pieces: [], totalPieceCount: 0, visiblePieceCount: 0 })`
   - `getAuthorSubscription` not ACTIVE → return `ok({ ...collectionMeta, access: 'SUBSCRIBER_ONLY_GATED', pieces: [], totalPieceCount: 0, visiblePieceCount: 0 })`
5. Load viewer subscription flags; `listCollectionItems` + `getFreeTierLimit` in parallel
6. For each item: `getArtPiece` + `checkArtPieceAccess`; null if not allowed
7. Return `ok({ ...collectionMeta, access: 'GRANTED', pieces: visiblePieces, totalPieceCount: items.length, visiblePieceCount: visiblePieces.length })`

---

## Frontend behavior

### Browse Atrium (`/browse`)
- Static page — no data fetching
- Three lane-cards in a 3-column grid (1-col mobile); each card links to its dedicated page
- Uses the feature-card pattern with gold top-border reveal on hover

### Collection Detail (`/collections/:collectionId`)
- `useQuery` with `queryKey: ['collections', collectionId]`
- Loading: gold dot spinner
- Error / missing: "Collection not found" + link to `/browse/collections`
- `access === 'GRANTED'`: hero + `ArtworkGrid` with visible pieces; empty-state copy if `pieces.length === 0`
- `access === 'SUBSCRIBER_ONLY_GATED'`: hero + gate UI with gold lock icon + "Subscribe to unlock" CTA → `/authors/:ownerId`
- `access === 'AUTH_REQUIRED'`: gate UI + "Sign in" secondary link + author CTA primary link

### CollectionCard link change
All collection cards across the app (author profile, homepage explore section, browse-collections page) now link to `/collections/:collectionId`. Previously they linked to `/authors/:authorId` (browse/homepage) or had no link (author profile).

---

## Done-when checklist

- [x] `GET /collections/:id` returns `access: 'GRANTED'` | `'SUBSCRIBER_ONLY_GATED'` | `'AUTH_REQUIRED'` in all cases (no 403 for SUBSCRIBER_ONLY)
- [x] `/browse` renders the Atrium with three lane-cards linking to `/browse/pieces`, `/authors`, `/browse/collections`
- [x] `/browse/pieces` renders the existing artworks browse page (no regression)
- [x] `/browse/collections` still works (no regression)
- [x] `/collections/:collectionId` renders piece grid when `access === 'GRANTED'`
- [x] `/collections/:collectionId` renders gate UI with author link when `access === 'SUBSCRIBER_ONLY_GATED'`
- [x] `/collections/:collectionId` renders gate UI with login + author link when `access === 'AUTH_REQUIRED'`
- [x] Collection cards on Author Profile page link to `/collections/:collectionId`
- [x] All integration tests pass (updated SUBSCRIBER_ONLY tests; no new 403 assertions)
- [x] `collectionsService.getById` service unit tests pass
- [x] TypeScript typecheck passes (`npm run typecheck` — 15/15 tasks succeeded)
