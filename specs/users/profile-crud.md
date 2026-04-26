## Spec: User & Viewer Profile CRUD

**Status**: ✅ Implemented
**FR coverage**: FR-PROF-02, FR-PROF-03, FR-PROF-04, FR-PROF-05, FR-PROF-06, FR-VIEW-08
**Relevant PROJECT.md sections**: 2.2, 2.3, 4.2, 8

**What this implements**: Read/update operations for User base record and Viewer profile; lifecycle state management (ACTIVE → SUSPENDED → DEACTIVATED); public Viewer profile page data.

**Prerequisites**: `auth/post-confirmation.md` complete (USER + VIEWER records exist in DynamoDB); `users-lambda` deployed with JWT middleware

**Done when**:
- [ ] `GET /users/me`, `PUT /users/me`, `GET /users/{userId}/viewer` routes registered and functional
- [ ] `PUT /users/me` rejects empty `displayName` (400) and `bio` > 500 chars (400)
- [ ] Viewer profile status cannot be changed to `DEACTIVATED` by the user → 403
- [ ] `GET /users/{userId}/viewer` returns 404 for non-existent user
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/users/src/routes/get-user.ts` — `GET /users/me` (own profile)
- `lambdas/users/src/routes/update-user.ts` — `PUT /users/me`
- `lambdas/users/src/routes/get-viewer-profile.ts` — `GET /users/{userId}/viewer` (public profile page)
- `packages/shared/src/db/users.repository.ts` — `getViewerProfile()`, `updateViewerProfile()`

**DynamoDB access patterns used**:
- User base record: `PK=USER#{userId}, SK=META`
- Viewer profile: `PK=USER#{userId}, SK=PROFILE#VIEWER`
- Author profile: `PK=USER#{userId}, SK=PROFILE#AUTHOR`

**Business logic**:
1. `GET /users/me` — returns authenticated user's base record + both profiles (if they exist)
2. `PUT /users/me` — update displayName, bio, notificationPreferences; validate displayName non-empty, bio ≤ 500 chars
3. `GET /users/{userId}/viewer` — public profile: displayName, memberSince, followedAuthorsCount, commentsCount, reactionsCount
4. Profile lifecycle: status field on each profile record; `SUSPENDED` → cannot create content or access private pieces; `DEACTIVATED` soft-hides all associated content
5. Viewer profile cannot be self-deactivated (FR-PROF-05) — `PUT /users/me` ignores any `viewerStatus` field
6. Author profile deactivation allowed via `PUT /users/me/author` with `{ status: 'DEACTIVATED' }` (90-day reactivation window)

**Error conditions**:
- `GET /users/{userId}/viewer` for non-existent user → 404
- `PUT /users/me` — displayName empty → 400
- Attempt to deactivate Viewer profile → 403

**Tests to write**:
- Unit: `updateViewerProfile()` validates input fields
- Integration: full CRUD cycle; verify status field changes; verify public profile fields exclude private data
