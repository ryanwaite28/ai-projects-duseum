## Spec: Collection Piece Membership

**Status**: ✅ Implemented
**FR coverage**: FR-COL-04, FR-COL-05
**Relevant PROJECT.md sections**: 2.6, 4.7, 8

**What this implements**: Add/remove pieces to/from collections; reorder pieces within a collection.

**Prerequisites**: `artworks/collections-crud.md` complete; membership record schema (`PK=COLLECTION#{id}, SK=ART#{id}` + reverse) finalized

**Done when**:
- [ ] Add piece writes both forward and reverse membership records; idempotent (second add updates `sortOrder` only)
- [ ] Remove piece deletes both forward and reverse records; no-op if piece not in collection → 200
- [ ] `GET /collections/{id}/pieces` returns pieces in `sortOrder` order; inaccessible pieces return `{ pieceId, accessible: false }` stub
- [ ] `PUT /collections/{id}/pieces/order` with `orderedPieceIds` not matching current membership → 400
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/artworks/src/routes/add-piece-to-collection.ts` — `POST /collections/{collectionId}/pieces`
- `lambdas/artworks/src/routes/remove-piece-from-collection.ts` — `DELETE /collections/{collectionId}/pieces/{pieceId}`
- `lambdas/artworks/src/routes/list-collection-pieces.ts` — `GET /collections/{collectionId}/pieces`
- `lambdas/artworks/src/routes/reorder-collection-pieces.ts` — `PUT /collections/{collectionId}/pieces/order`
- `packages/shared/src/db/collections.repository.ts` — `addPieceToCollection()`, `removePieceFromCollection()`, `listCollectionPieces()`, `reorderCollectionPieces()`

**DynamoDB access patterns used**:
- Membership record: `PK=COLLECTION#{collectionId}, SK=ART#{pieceId}` — includes `sortOrder` (integer)
- Reverse membership: `PK=ART#{pieceId}, SK=COLLECTION#{collectionId}`
- List pieces in collection (ordered): query `PK=COLLECTION#{collectionId}, SK begins_with ART#`

**Business logic**:
1. `POST /collections/{collectionId}/pieces`:
   - Body: `{ pieceId, sortOrder? }` (sortOrder defaults to end of list)
   - Piece must belong to same Author as collection
   - Idempotent — adding same piece again updates sortOrder only
   - Write both forward and reverse membership records
2. `DELETE /collections/{collectionId}/pieces/{pieceId}`:
   - Delete both forward and reverse membership records
   - No-op if piece not in collection (200)
3. `GET /collections/{collectionId}/pieces`:
   - No JWT required for PUBLIC collections (access control per piece via `checkArtPieceAccess()`)
   - Returns pieces sorted by `sortOrder`; each piece respects viewer's access tier
   - Pieces beyond access tier: return stub with `{ pieceId, accessible: false }` instead of full data
4. `PUT /collections/{collectionId}/pieces/order`:
   - Body: `{ orderedPieceIds: string[] }` — must be complete list of current members
   - Batch write `sortOrder` updates

**Error conditions**:
- Add piece from different Author → 403
- `orderedPieceIds` doesn't match current membership → 400

**Tests to write**:
- Unit: sortOrder default computation; reorder batch validation
- Integration: add 3 pieces, reorder, verify GET returns in new order; remove piece, verify both membership records deleted
