## Spec: Author Own Pieces Endpoint — GET /artworks/mine

**Status**: ✅ Implemented
**FR coverage**: FR-ART-11
**Relevant PROJECT.md sections**: 2.4, 4.2, 4.7, 6.5

**What this implements**: A new authenticated endpoint `GET /artworks/mine` that returns all art pieces belonging to the caller (PUBLIC, PRIVATE, DRAFT) regardless of tier. The existing `GET /artworks` endpoint only returns PUBLIC pieces gated by subscriber tier and is not suitable for the Author dashboard "my pieces" view.

**New/modified files**:
- `lambdas/artworks/src/routes/list-my-artworks.ts` — new route handler
- `lambdas/artworks/src/index.ts` — wire `GET /artworks/mine` route
- `packages/shared/src/db/artworks.repository.ts` — new `listArtPiecesByAuthor()` function querying `GSI-AuthorPublic` without visibility filter
- `infrastructure/stacks/api-stack.ts` — register `GET /artworks/mine` route with JWT auth

**DynamoDB access patterns used**:
- `GSI-AuthorPublic`: `authorId = :authorId` (no SK filter) — returns all pieces for the author sorted by `visibility#createdAt` DESC. No new GSI required.

**Business logic**:
1. `GET /artworks/mine` — requires JWT (author only)
2. Query `GSI-AuthorPublic` with `authorId = caller.userId`, no visibility SK filter, newest-first
3. Return all pieces (PUBLIC, PRIVATE, DRAFT) with signed CloudFront URLs for PRIVATE pieces
4. Supports pagination via `cursor` and `limit` query params (same pattern as existing routes)
5. No access tier filtering — the author sees everything they own

**Query params**:
- `limit` — 1–50, default 20
- `cursor` — base64url-encoded DynamoDB `LastEvaluatedKey`
- `visibility` — optional filter: `PUBLIC` | `PRIVATE` | `DRAFT` (default: all)

**Error conditions**:
- No Author profile → 403

**Done when**:
- [x] `GET /artworks/mine` returns all visibility types for the authenticated author
- [x] PRIVATE pieces include a signed CloudFront URL
- [x] Pagination works correctly
- [x] Route registered in `api-stack.ts` with JWT auth

**Tests to write**:
- Integration: returns PUBLIC + PRIVATE + DRAFT pieces for the owner; non-author caller → 403; pagination cursor
