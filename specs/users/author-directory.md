## Spec: Author Directory

**Status**: ⬜ Pending
**FR coverage**: FR-DISC-04
**Relevant PROJECT.md sections**: 2.8, 4.7, 8

**What this implements**: Paginated, sortable list of all Authors for the browse/discover experience; sortable by subscriber count or newest.

**Prerequisites**: GSI1 (`GSI1PK=ENTITY#AUTHOR`) defined on DynamoDB main table; Author profile writes must include `GSI1PK` + `GSI1SK` attributes; `users/author-onboarding.md` complete

**Done when**:
- [ ] `GET /users/authors?sort=newest` and `?sort=subscribers` return paginated, correctly sorted results
- [ ] SUSPENDED and DEACTIVATED Authors excluded from results
- [ ] Cursor-based pagination returns correct next page using base64-encoded `LastEvaluatedKey`
- [ ] `limit` > 50 clamped or rejected
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/users/src/routes/list-authors.ts` — `GET /users/authors` — paginated Author directory
- `packages/shared/src/db/users.repository.ts` — `listAuthors()` with GSI query

**DynamoDB access patterns used**:
- Authors by GSI: `GSI1 PK=ENTITY#AUTHOR` sorted by `createdAt` (newest) or `subscriberCount` (descending)
- Requires GSI1 on Author profile records with `GSI1PK=ENTITY#AUTHOR, GSI1SK=createdAt` or subscriber count

**Business logic**:
1. `GET /users/authors?sort=newest|subscribers&limit=20&cursor={paginationToken}`
2. Query GSI1 for all Author profiles with status=`ACTIVE`
3. Return: displayName, profilePhotoUrl, thumbnailUrl, followerCount, subscriberCount, publicPieceCount, subscriptionPrice (if enabled)
4. Cursor-based pagination using DynamoDB `LastEvaluatedKey` (base64-encoded)
5. Max page size: 50 (NFR-PERF-05)
6. Only `ACTIVE` Author profiles appear; `SUSPENDED` / `DEACTIVATED` excluded

**Error conditions**:
- Invalid `sort` value → 400
- Invalid cursor token → 400
- `limit` > 50 → clamp to 50 (or 400)

**Tests to write**:
- Unit: cursor encode/decode utilities
- Integration: seed 5 authors, verify sort order and pagination cursor works correctly
