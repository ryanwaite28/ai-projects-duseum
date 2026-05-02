## Spec: Collections CRUD

**Status**: ✅ Implemented
**FR coverage**: FR-COL-01, FR-COL-02, FR-COL-03, FR-COL-04, FR-COL-05, FR-COL-06
**Relevant PROJECT.md sections**: 2.6, 4.7, 8

**What this implements**: Create, read, update, delete Collections; visibility settings; piece membership management; access-tier-adjusted piece counts.

**Prerequisites**: `artworks/artwork-crud.md` and `artworks/access-control.md` complete; `packages/shared/src/db/collections.repository.ts` created

**Done when**:
- [ ] `GET /collections/{id}` returns both `totalPieces` and `accessiblePieces` counts adjusted to viewer's access tier
- [ ] PRIVATE collection access by non-Author-Subscriber → 403
- [ ] Collection delete removes all membership records but NOT the art pieces themselves
- [ ] `coverPieceId` from a different Author → 400
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/artworks/src/routes/create-collection.ts` — `POST /collections`
- `lambdas/artworks/src/routes/get-collection.ts` — `GET /collections/{collectionId}`
- `lambdas/artworks/src/routes/update-collection.ts` — `PUT /collections/{collectionId}`
- `lambdas/artworks/src/routes/delete-collection.ts` — `DELETE /collections/{collectionId}`
- `lambdas/artworks/src/routes/list-author-collections.ts` — `GET /collections?authorId={id}`
- `packages/shared/src/db/collections.repository.ts` — full collection CRUD + membership operations

**DynamoDB access patterns used**:
- Collection record: `PK=COLLECTION#{collectionId}, SK=META`
- Collections by Author: `PK=AUTHOR#{authorId}, SK=COLLECTION#{collectionId}` (or GSI)
- Collection membership: `PK=COLLECTION#{collectionId}, SK=ART#{pieceId}` — `sortOrder` attribute
- Reverse membership (piece → collections): `PK=ART#{pieceId}, SK=COLLECTION#{collectionId}`

**Business logic**:
1. `POST /collections` — body: `{ title, description?, visibility: 'FREE'|'SUBSCRIBER_ONLY', coverPieceId? }`:
   - Must be authenticated Author; `coverPieceId` must belong to same Author
2. `GET /collections/{collectionId}`:
   - FREE collection: visible to all
   - SUBSCRIBER_ONLY collection: Author (own) or Author Subscriber only
   - `totalPieces` count = all pieces in collection; `accessiblePieces` = pieces visible to requesting viewer (respects `checkArtPieceAccess()`)
   - FR-COL-06: return both counts so frontend can show "12 pieces — 4 visible to you"
3. `PUT /collections/{collectionId}` — update title, description, visibility, coverPieceId, pieceOrder (array of pieceIds)
4. `DELETE /collections/{collectionId}` — deletes collection record + all membership records; pieces themselves are NOT deleted
5. A piece can belong to multiple collections (many-to-many via membership records)

**Error conditions**:
- SUBSCRIBER_ONLY collection access by non-subscriber → 403
- `coverPieceId` not owned by authenticated Author → 400
- Update/delete collection owned by another Author → 403

**Tests to write**:
- Unit: `accessiblePieces` count logic with mocked access control
- Integration: create collection, add pieces, verify both counts in GET response; PRIVATE collection access by different user tiers
