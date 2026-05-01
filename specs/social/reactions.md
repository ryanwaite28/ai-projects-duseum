## Spec: Reactions

**Status**: ✅ Implemented
**FR coverage**: FR-SOC-01, FR-VIEW-07
**Relevant PROJECT.md sections**: 2.9, 4.2, 8

**What this implements**: One reaction per Viewer per piece (LOVE, WOW, FIRE, INSPIRED); changing reaction replaces previous; reaction count by type tracked on piece record.

**Prerequisites**: `artworks/artwork-crud.md` and `artworks/access-control.md` complete; `social-lambda` deployed

**Done when**:
- [x] Change reaction: old type count decremented, new type count incremented atomically in single DynamoDB update
- [x] Delete reaction: count decremented; no-op if no reaction → 200
- [x] `GET /artworks/{artworkId}` returns `viewerReaction` (null if none) alongside existing `reactionCounts`
- [x] Invalid `reactionType` value → 400
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/social/src/routes/upsert-reaction.ts` — `PUT /artworks/{artworkId}/reactions` (create or replace) — already complete
- `lambdas/social/src/routes/delete-reaction.ts` — fix: no-op 200 when reaction doesn't exist (was throwing 404)
- `lambdas/artworks/src/routes/get-artwork.ts` — add `viewerReaction` field to response
- `packages/shared/src/db/reactions.repository.ts` — `upsertReaction()`, `deleteReaction()`, `getUserReaction()`, `getReactionCounts()` — already complete

**DynamoDB access patterns used**:
- Reaction record: `PK=ARTWORK#{artworkId}, SK=REACTION#{userId}` — `reactionType: 'LOVE'|'WOW'|'FIRE'|'INSPIRED'`
- Reaction counts on piece: `PK=ARTWORK#{artworkId}, SK=METADATA` — `reactionCounts: { LOVE: n, WOW: n, FIRE: n, INSPIRED: n }`

**Business logic**:
1. `PUT /artworks/{artworkId}/reactions` — body: `{ reactionType }`:
   - Verify piece exists (404 if not)
   - Read existing reaction (if any) for this `userId + artworkId`
   - If same type → no-op (idempotent)
   - If different type → decrement old type count, increment new type count; update reaction record
   - If no existing reaction → write new; increment count
   - All count updates are atomic (DynamoDB `ADD` expression)
2. `DELETE /artworks/{artworkId}/reactions`:
   - If no reaction exists → 200 no-op
   - Delete reaction record; decrement count for that type
3. `GET /artworks/{artworkId}` — extended:
   - Existing response includes `reactionCounts` map
   - Add `viewerReaction: ReactionType | null` — viewer's current reaction (null if not authenticated or no reaction)

**Error conditions**:
- Invalid `reactionType` (not in enum) → 400
- Piece not found → 404

**Note**: No separate `GET /reactions` endpoint. No `checkArtPieceAccess()` in social-lambda — access is enforced at the artwork read layer (FR-SOC-01 revised).

**Tests to write**:
- Unit: reaction type enum validation; count floor at 0 on delete
- Integration: react → verify count; change reaction → verify old decremented, new incremented; delete → count returns to 0
