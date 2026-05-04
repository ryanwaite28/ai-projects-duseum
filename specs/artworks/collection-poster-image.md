## Spec: Collection Poster Image

**Status**: ✅ Implemented
**FR coverage**: FR-COL-07
**Relevant PROJECT.md sections**: 2.6, 4.4, 4.7, 8.5
**Related specs**: `specs/artworks/collections-crud.md`, `specs/discovery/browse-collections.md`, `specs/users/author-profile-images.md`

**What this implements**: Adds an optional poster image to collections. Authors upload a poster via the existing media upload-intent flow when creating or editing a collection. The `posterUrl` (resolved CloudFront URL) is returned in all collection list responses.

---

## New/modified files

- `packages/shared/src/types/index.ts` — add `posterS3Key?: string | null` to `Collection` type
- `packages/shared/src/db/collections.repository.ts` — include `posterS3Key` in `createCollection` write; add it to `updateCollection` patch fields; include it when building the author-index stub
- `lambdas/artworks/src/routes/create-collection.ts` — accept optional `posterS3Key` in request body; write to DynamoDB
- `lambdas/artworks/src/routes/update-collection.ts` — accept optional `posterS3Key` patch; null clears the poster
- `lambdas/artworks/src/routes/list-author-collections.ts` — return `posterUrl` (resolved via `publicUrl()`) in each collection item
- `lambdas/users/src/routes/get-author-collections.ts` — return `posterUrl` in each collection item
- `lambdas/features/src/routes/get-homepage.ts` — return `posterUrl` on each collection in the "Explore Collections" payload (FR-DISC-06)
- `lambdas/artworks/src/routes/list-collections.ts` (new) — `GET /collections` browse route (FR-DISC-07); returns `posterUrl`
- `frontend/src/types/artwork.ts` — add `posterUrl: string | null` to `AuthorCollection`
- `frontend/src/pages/dashboard/tabs/collections-tab.tsx` — add `PosterUpload` inline component (upload-intent → S3 → key returned via callback); wired into `CollectionModal` with `posterTouched` guard so edits that don't touch the poster don't overwrite it
- `frontend/src/components/ui/CollectionCard.tsx` (new) — shared card component used on author profile, homepage, and browse-collections page; shows poster → first-piece thumbnail → branded placeholder fallback
- `lambdas/artworks/src/__tests__/collections.integration.test.ts` — tests for `posterS3Key` in create, update, and list responses
- `lambdas/users/src/__tests__/users.integration.test.ts` — `posterUrl` included in `GET /authors/{id}/collections` response

---

## DynamoDB access patterns used

- Collection METADATA write (existing): `PK=COLLECTION#{collectionId}, SK=METADATA` — add `posterS3Key` attribute
- Author-index stub (existing): `PK=AUTHOR#{authorId}, SK=COLLECTION#{createdAt}#{collectionId}` — add `posterS3Key` to stub so list queries can resolve the URL without an extra fetch
- Collection update (existing): `UpdateCommand` on METADATA item — add `posterS3Key` to patchable fields

---

## Business logic

1. **Create collection** (`POST /collections`):
   - Body now accepts optional `posterS3Key: string | null`
   - If provided, stored on METADATA item and author-index stub
   - Validated: must be a raw S3 key (no `https://` prefix); enforce with Zod `.regex(/^[^/].+/)` or similar
2. **Update collection** (`PUT /collections/{collectionId}`):
   - `posterS3Key: null` explicitly clears the poster (sets attribute to null in DynamoDB)
   - `posterS3Key` absent from body → no change to existing poster
3. **List responses** (author profile, homepage, browse-collections):
   - `posterUrl = posterS3Key ? publicUrl(posterS3Key) : null`
   - Return `posterUrl` (never the raw `posterS3Key`) to all callers
4. **Frontend fallback chain**: `posterUrl` → `coverPieceUrl` (first-piece thumbnail) → branded placeholder `<div>` with gold-outlined frame icon

---

## Error conditions

- `posterS3Key` containing `https://` or a full URL → 400 (must be a raw S3 key)
- `posterS3Key` on a collection owned by another author → not applicable (update route already enforces ownership)

---

## Tests to write

- Integration (`lambdas/artworks`): create collection with `posterS3Key` → list response includes `posterUrl` containing the key; update with `posterS3Key: null` → `posterUrl` is null in subsequent list
- Integration (`lambdas/users`): `GET /authors/{id}/collections` response includes `posterUrl` field on each item (null when not set)
- Frontend component: `CollectionCard` renders poster image when `posterUrl` set; renders first-piece thumbnail fallback when `posterUrl` null but cover piece exists; renders placeholder when both null

---

## Implementation notes

- `get-homepage.ts` was NOT extended with `exploreCollections`. Instead, `ExploreCollectionsSection` calls `GET /collections?limit=6` independently (avoids touching features-lambda; simpler boundary).
- `ProfileImageUpload` was NOT reused for poster — it is tightly coupled to `PUT /users/me/author`. A lightweight inline `PosterUpload` was built instead, using upload-intent → S3 → key-via-callback pattern.
- `posterTouched` state guards the update mutation: if the user edits title/description without touching the poster, `posterS3Key` is omitted from the body so the backend preserves the existing poster.

## Done-when checklist

- [x] `Collection` type in `packages/shared/src/types/index.ts` has `posterS3Key?: string | null`
- [x] `POST /collections` accepts and stores `posterS3Key`
- [x] `PUT /collections/{id}` patches `posterS3Key`; `null` clears it
- [x] `GET /authors/{id}/collections` returns `posterUrl` on each item
- [x] `GET /collections` (browse) returns `posterUrl` on each item
- [x] Dashboard collection create/edit UI shows poster upload input (`PosterUpload` in `CollectionModal`)
- [x] `CollectionCard` component implements fallback chain: poster → thumbnail → placeholder
- [x] `specs/testing/test-coverage.md` updated
- [x] Spec `**Status**` updated to ✅ Implemented
