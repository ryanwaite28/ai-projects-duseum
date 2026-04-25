## Spec: Reactions

**Status**: ⬜ Pending
**FR coverage**: FR-SOC-01, FR-VIEW-07
**Relevant PROJECT.md sections**: 2.9, 4.2, 8

**What this implements**: One reaction per Viewer per piece (LOVE, WOW, FIRE, INSPIRED); changing reaction replaces previous; reaction count by type tracked on piece record.

**Prerequisites**: `artworks/artwork-crud.md` and `artworks/access-control.md` complete; `social-lambda` deployed

**Done when**:
- [ ] Change reaction: old type count decremented, new type count incremented atomically in single DynamoDB update
- [ ] Delete reaction: count decremented with floor of 0 (no negative counts); no-op if no reaction → 200
- [ ] `GET /reactions?pieceId=` returns aggregate counts by type + viewer's current reaction type (null if none)
- [ ] Invalid `type` value → 400; viewer with no piece access → 403
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/social/src/routes/upsert-reaction.ts` — `PUT /reactions` (create or replace)
- `lambdas/social/src/routes/delete-reaction.ts` — `DELETE /reactions?pieceId={id}`
- `lambdas/social/src/routes/get-reactions.ts` — `GET /reactions?pieceId={id}` (aggregate counts + viewer's own)
- `packages/shared/src/db/social.repository.ts` — `upsertReaction()`, `deleteReaction()`, `getReactionCounts()`

**DynamoDB access patterns used**:
- Reaction record: `PK=ART#{pieceId}, SK=REACTION#{userId}` — `type: 'LOVE'|'WOW'|'FIRE'|'INSPIRED'`
- Reaction counts on piece: `PK=ART#{pieceId}, SK=META` — `reactionCounts: { LOVE: n, WOW: n, FIRE: n, INSPIRED: n }`

**Business logic**:
1. `PUT /reactions` — body: `{ pieceId, type }`:
   - Viewer must have access to piece (`checkArtPieceAccess()`)
   - Read existing reaction (if any) for this `userId + pieceId`
   - If same type → no-op (idempotent)
   - If different type → decrement old type count, increment new type count; update reaction record
   - If no existing reaction → write new; increment count
   - All count updates are atomic (DynamoDB `ADD` expression)
2. `DELETE /reactions?pieceId={id}`:
   - Delete reaction record; decrement count for that type (min 0)
   - No-op if no reaction exists → 200
3. `GET /reactions?pieceId={id}`:
   - Returns aggregate counts by type + authenticated viewer's current reaction type (null if none)
   - Viewer must have access to piece

**Error conditions**:
- Invalid `type` (not in enum) → 400
- Viewer has no access to piece → 403

**Tests to write**:
- Unit: reaction type enum validation; count floor at 0 on delete
- Integration: react → verify count; change reaction → verify old decremented, new incremented; delete → count returns to 0
