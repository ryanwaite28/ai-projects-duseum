## Spec: Author Profile Onboarding

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-PROF-01, FR-AUTH-PROF-05, FR-AUTH-PROF-06, FR-AUTH-PROF-07, FR-AUTH-PROF-08, FR-AUTH-PROF-09
**Relevant PROJECT.md sections**: 2.4, 4.2, 8
**Related spec**: `specs/users/author-profile-images.md` — icon & wallpaper upload UI, `authorIconUrl` in artwork response, and display changes on author profile and artwork detail pages

**What this implements**: The opt-in Author profile creation flow including display name, bio, profile photo, cover photo, optional subscription price; Author dashboard data; Author public profile page.

**Prerequisites**: `users/profile-crud.md` complete; `updateAuthorProfile()` in `packages/shared/src/db/users.repository.ts`

**Done when**:
- [ ] `POST /users/me/author` rejects duplicate Author profile creation → 409
- [ ] `PUT /users/me/author` validates price range ($1–$50); rejects `pinnedPieceIds` length > 3 → 400
- [ ] `GET /users/{userId}/author` returns public Author page data; 404 for users without Author profile
- [ ] Deactivation via `PUT /users/me/author { status: 'DEACTIVATED' }` sets `reactivationDeadline = now + 90 days`
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/users/src/routes/create-author.ts` — `POST /users/me/author` — create Author profile
- `lambdas/users/src/routes/get-author-profile.ts` — `GET /users/{userId}/author` — public Author page
- `lambdas/users/src/routes/update-author-profile.ts` — `PUT /users/me/author` — update bio, price, pinned pieces, comment settings
- `packages/shared/src/db/users.repository.ts` — `createAuthorProfile()`, `getAuthorProfile()`, `updateAuthorProfile()`

**DynamoDB access patterns used**:
- Author profile write/read: `PK=USER#{userId}, SK=PROFILE#AUTHOR`
- Pinned pieces: stored as array on Author profile record (max 3 pieceIds)

**Business logic**:
1. `POST /users/me/author` — user must not already have Author profile (FR-PROF-03); write `PROFILE#AUTHOR` with status=`PENDING_SETUP`; return profile
2. `PUT /users/me/author` — update displayName (required), bio (optional, max 1,000 chars), authorSubscriptionPrice (min 100 cents, max 5000 cents, or null to disable), pinnedPieceIds (max 3), commentsEnabled (bool)
3. Once displayName set, status transitions to `ACTIVE` automatically
4. `GET /users/{userId}/author` — public fields: displayName, bio, coverPhotoUrl, profilePhotoUrl, followerCount, subscriberCount, publicPieceCount, collections, subscriptionCTA (if price set)
5. Author dashboard (authenticated, own profile): adds totalViews, MRR, recentComments, upcomingFeatureBooking
6. `PUT /users/me/author` with `{ status: 'DEACTIVATED' }` → soft-hides all pieces; sets reactivationDeadline = now + 90 days

**Error conditions**:
- `POST /users/me/author` when Author profile already exists → 409
- `PUT /users/me/author` — price < $1 or > $50 → 400
- `GET /users/{userId}/author` for user without Author profile → 404
- `pinnedPieceIds` length > 3 → 400

**Tests to write**:
- Unit: price validation logic; pinnedPieceIds limit enforcement
- Integration: full onboarding flow; verify PROFILE#AUTHOR record; deactivation sets correct deadline
