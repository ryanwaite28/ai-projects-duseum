## Spec: Art Piece CRUD

**Status**: ✅ Implemented
**FR coverage**: FR-ART-01, FR-ART-02, FR-ART-05, FR-ART-06, FR-ART-07, FR-ART-08, FR-ART-09, FR-ART-10
**Relevant PROJECT.md sections**: 2.5, 4.2, 4.7, 8

**What this implements**: Create, read, update, archive, and permanently delete Art Pieces; lifecycle management (DRAFT → PUBLISHED → ARCHIVED); tag management; view/reaction count tracking; notification fan-out trigger on publish.

**Prerequisites**: `artworks/upload-intent.md` complete; SQS notifications queue deployed and URL available in Lambda env vars; `artworks-lambda` deployed

**Done when**:
- [ ] Creating with PUBLIC/PRIVATE visibility enqueues exactly one SQS `NEW_PIECE_PUBLISHED` message; DRAFT does not enqueue
- [ ] Visibility change from DRAFT → PUBLIC enqueues notification; subsequent visibility changes do NOT re-enqueue (FR-NOTIF-11)
- [ ] Permanent delete (`{ permanent: true }`) removes both DynamoDB record and S3 object
- [ ] Update or delete of ARCHIVED piece returns 403; update another Author's piece returns 403
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/artworks/src/routes/create-artwork.ts` — `POST /artworks`
- `lambdas/artworks/src/routes/get-artwork.ts` — `GET /artworks/{pieceId}`
- `lambdas/artworks/src/routes/update-artwork.ts` — `PUT /artworks/{pieceId}`
- `lambdas/artworks/src/routes/delete-artwork.ts` — `DELETE /artworks/{pieceId}`
- `lambdas/artworks/src/routes/list-author-artworks.ts` — `GET /artworks?authorId={id}`
- `packages/shared/src/db/artworks.repository.ts` — `createArtPiece()`, `getArtPiece()`, `updateArtPiece()`, `archiveArtPiece()`, `deleteArtPiece()`, `listArtPiecesByAuthor()`

**DynamoDB access patterns used**:
- Art piece by ID: `PK=ART#{pieceId}, SK=META`
- Art pieces by Author: `PK=AUTHOR#{authorId}, SK=ART#{pieceId}` (or GSI: `GSI1PK=AUTHOR#{authorId}`)
- Tag index: `GSI2PK=TAG#{tag}` for tag-based browse queries

**Business logic**:
1. `POST /artworks` — body: `{ intentId, title, description?, tags?, visibility, mediumTag?, commentsEnabled? }`:
   - Resolve `s3Key` from confirmed UploadIntent (validates intentId belongs to Author)
   - Write ArtPiece record with status matching visibility: `PUBLIC`/`PRIVATE` → `PUBLISHED`; `DRAFT` → `DRAFT`
   - If `PUBLISHED`: publish timestamp recorded; SQS message `NEW_PIECE_PUBLISHED` enqueued (FR-NOTIF-02); notification NOT sent for DRAFT
   - Tags normalized to lowercase, max 10
   - `description` max 2,000 chars
2. `PUT /artworks/{pieceId}` — update title, description, tags, visibility, commentsEnabled:
   - Cannot edit ARCHIVED pieces → 403
   - Visibility change to PUBLISHED (from DRAFT): sets publishedAt, enqueues SQS notification
   - Visibility change after initial publish: NO second notification (FR-NOTIF-11)
3. `DELETE /artworks/{pieceId}` with `{ permanent: true }` → removes DynamoDB record + S3 object (irreversible); otherwise archives (status=`ARCHIVED`)
4. View count: atomic increment on `GET /artworks/{pieceId}` (non-owner, non-draft)

**Error conditions**:
- `intentId` not found or not CONFIRMED → 400
- `tags` count > 10 → 400
- `description` > 2,000 chars → 400
- Update/delete of another Author's piece → 403
- Update ARCHIVED piece → 403
- `visibility=DRAFT` with `commentsEnabled=true` → 400 (drafts can't have comments)

**Tests to write**:
- Unit: tag normalization; visibility transition rules; notification trigger condition
- Integration: create → publish → verify SQS message sent; update visibility DRAFT→PUBLIC → SQS sent only once; permanent delete → S3 object removed
