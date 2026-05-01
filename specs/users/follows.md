## Spec: Follow / Unfollow Authors

**Status**: ✅ Implemented
**FR coverage**: FR-VIEW-06, FR-VIEW-06a, FR-SOC-06
**Relevant PROJECT.md sections**: 2.3, 2.9, 4.7, 8

**What this implements**: Viewer follow/unfollow actions for Authors; follower count maintenance; follow record used by notifications fan-out.

**Prerequisites**: `users/author-onboarding.md` complete; `packages/shared/src/db/follows.repository.ts` created; Follow record schema (`PK=USER#{viewerId}, SK=FOLLOW#AUTHOR#{authorId}`) finalized

**Done when**:
- [x] `POST /users/{authorId}/follow` writes Follow record + increments Author `followerCount` atomically; second follow is idempotent (no double-increment)
- [x] Self-follow returns 400; follow non-existent Author returns 404; inactive Viewer profile returns 403
- [x] `DELETE /users/{authorId}/follow` removes record + decrements count; no-op if record doesn't exist → 200
- [x] `GET /users/me/follows` returns paginated list of followed Authors
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/users/src/routes/follow-author.ts` — `POST /users/{authorId}/follow`
- `lambdas/users/src/routes/unfollow-author.ts` — `DELETE /users/{authorId}/follow`
- `lambdas/users/src/routes/list-follows.ts` — `GET /users/me/follows` — Viewer's followed Authors list
- `packages/shared/src/db/follows.repository.ts` — `followAuthor()`, `unfollowAuthor()`, `getFollowStatus()`, `listFollowersForAuthor()`, `listFollowedAuthors()`

**DynamoDB access patterns used**:
- Follow record: `PK=USER#{viewerId}, SK=FOLLOW#AUTHOR#{authorId}`
- Reverse index (for fan-out): `PK=AUTHOR#{authorId}, SK=FOLLOWER#{viewerId}` (or GSI)
- Author follower count: atomic increment on `PK=USER#{authorId}, SK=PROFILE#AUTHOR` → `followerCount`

**Business logic**:
1. `POST /users/{authorId}/follow`:
   - Verify authenticated user is a Viewer (profile exists + ACTIVE)
   - Verify target authorId has an ACTIVE Author profile
   - Write follow record with `notificationPreference=ALL_NEW_PIECES` (default)
   - Atomic increment `followerCount` on Author profile
   - Idempotent — second follow returns 200 without double-incrementing (condition expression)
2. `DELETE /users/{authorId}/follow`:
   - Delete follow record
   - Atomic decrement `followerCount` on Author profile (min 0)
   - No-op if follow record doesn't exist → 200
3. `GET /users/me/follows` — list all Authors the authenticated Viewer follows (paginated)

**Error conditions**:
- Follow non-existent Author → 404
- Follow own Author profile → 400 (self-follow not allowed)
- Viewer profile not ACTIVE → 403

**Tests to write**:
- Unit: idempotency condition expression logic
- Integration: follow → verify record + follower count; unfollow → verify deletion + count decrement; self-follow rejected
