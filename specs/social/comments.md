## Spec: Comments

**Status**: ⬜ Pending
**FR coverage**: FR-SOC-02, FR-SOC-03, FR-SOC-04, FR-SOC-05, FR-AUTH-PROF-09
**Relevant PROJECT.md sections**: 2.9, 4.2, 8

**What this implements**: Viewer comments on Art Pieces; Author replies (one level nesting only); comment pinning by Author; moderation delete by Author/Admin; per-piece comment toggle.

**Prerequisites**: `artworks/artwork-crud.md` and `artworks/access-control.md` complete; `social-lambda` deployed; `packages/shared/src/db/social.repository.ts` created

**Done when**:
- [ ] Reply to a reply (depth > 1) returns 400; `parentCommentId` must be a top-level comment
- [ ] `commentCount` on ArtPiece increments on create (atomic); does not go negative on soft-delete
- [ ] Max 2 pinned comments enforced: third pin attempt returns 409; pinning already-pinned is idempotent → 200
- [ ] Delete by non-owner, non-Author-of-piece, non-Admin → 403
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/social/src/routes/create-comment.ts` — `POST /comments`
- `lambdas/social/src/routes/list-comments.ts` — `GET /comments?pieceId={id}`
- `lambdas/social/src/routes/delete-comment.ts` — `DELETE /comments/{commentId}`
- `lambdas/social/src/routes/pin-comment.ts` — `PUT /comments/{commentId}/pin`
- `packages/shared/src/db/social.repository.ts` — `createComment()`, `listComments()`, `deleteComment()`, `pinComment()`

**DynamoDB access patterns used**:
- Comment record: `PK=ART#{pieceId}, SK=COMMENT#{commentId}`
- Reply record: `PK=ART#{pieceId}, SK=COMMENT#{parentCommentId}#REPLY#{commentId}`
- Pinned comments: stored as `pinnedCommentIds` array on ArtPiece record (max 2)
- Comment count on piece: atomic increment on `PK=ART#{pieceId}, SK=META` → `commentCount`

**Business logic**:
1. `POST /comments` — body: `{ pieceId, text, parentCommentId? }`:
   - Viewer must have access to the piece (`checkArtPieceAccess()`)
   - Check piece `commentsEnabled=true` — if false → 403
   - `text` max 1,000 chars; strip HTML
   - If `parentCommentId` provided → this is a reply; `parentCommentId` must be top-level (no nested replies to replies — FR-SOC-03)
   - Write comment record; increment `commentCount` on piece
2. `GET /comments?pieceId={id}` — paginated; returns top-level comments with nested replies inline
3. `DELETE /comments/{commentId}`:
   - Author of the piece OR owner of the comment OR Admin may delete
   - Soft-delete: set `hidden=true` (preserves reply chain structure)
4. `PUT /comments/{commentId}/pin`:
   - Author of the piece only
   - Max 2 pinned comments (FR-SOC-04) — if already 2 → 409
   - Idempotent — pinning already-pinned comment returns 200

**Error conditions**:
- Comments disabled on piece → 403
- Viewer has no access to piece → 403
- Reply to a reply → 400
- Pin when 2 already pinned → 409
- Delete by non-owner non-Author non-Admin → 403

**Tests to write**:
- Unit: `text` length validation; reply-to-reply rejection
- Integration: create comment → verify count incremented; pin 2 → third pin rejected; delete by Author of piece vs non-owner
