## Spec: Admin User & Content Management

**Status**: ⬜ Pending
**FR coverage**: FR-ADMIN-01, FR-ADMIN-02, FR-ADMIN-03, FR-ADMIN-04
**Relevant PROJECT.md sections**: 2.10, 4.2, 7.1, 8

**What this implements**: Admin endpoints for viewing all users/profiles/pieces/subscriptions; suspending/reinstating accounts and profiles; removing policy-violating content; manually overriding Daily Featured Author.

**Prerequisites**: Cognito User Pool deployed with `ADMIN` group; Admin JWT middleware implemented (checks Cognito group claim); `admin-lambda` deployed; `users/profile-crud.md` and `artworks/artwork-crud.md` complete

**Done when**:
- [ ] Non-Admin JWT on any `/admin/*` route → 403 (rejected by middleware before route handler)
- [ ] Suspend user: Cognito `Enabled=false` AND both VIEWER + AUTHOR profile records set to `SUSPENDED`; already-suspended → 200 idempotent
- [ ] Reinstate: Cognito `Enabled=true` AND profiles restored to `ACTIVE`
- [ ] Delete piece: `status=ARCHIVED`; delete comment: `hidden=true`; both log moderation action
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/admin/src/routes/list-users.ts` — `GET /admin/users`
- `lambdas/admin/src/routes/suspend-user.ts` — `PUT /admin/users/{userId}/suspend`
- `lambdas/admin/src/routes/reinstate-user.ts` — `PUT /admin/users/{userId}/reinstate`
- `lambdas/admin/src/routes/suspend-profile.ts` — `PUT /admin/users/{userId}/profiles/{profileType}/suspend`
- `lambdas/admin/src/routes/delete-content.ts` — `DELETE /admin/content/{type}/{id}` (pieces, comments)
- `lambdas/admin/src/routes/override-daily-feature.ts` — `PUT /admin/features/daily`
- `packages/shared/src/db/admin.repository.ts` — admin read queries

**DynamoDB access patterns used**:
- List all users: GSI scan (or paginated full table scan with filter — needs GSI for prod scale)
- User record: `PK=USER#{userId}, SK=META`
- Profile records: `PK=USER#{userId}, SK=PROFILE#VIEWER` or `PROFILE#AUTHOR`
- All auth via Cognito group `ADMIN` — verified by JWT authorizer in API Gateway

**Business logic**:
1. All admin endpoints require `ADMIN` Cognito group membership (enforced in JWT middleware + Middy)
2. `PUT /admin/users/{userId}/suspend`:
   - Set Cognito user `Enabled=false` (invalidates all tokens immediately)
   - Set `status=SUSPENDED` on both VIEWER and AUTHOR profile records (FR-AUTH-07)
3. `PUT /admin/users/{userId}/reinstate`:
   - Set Cognito user `Enabled=true`
   - Set `status=ACTIVE` on profiles (restore previous state)
4. `PUT /admin/users/{userId}/profiles/{profileType}/suspend`:
   - Set `status=SUSPENDED` on the specific profile only (FR-PROF-04 — does not affect other profile)
5. `DELETE /admin/content/{type}/{id}`:
   - For pieces: set `status=ARCHIVED` + log moderation action
   - For comments: set `hidden=true` + log moderation action
6. `PUT /admin/features/daily` — see `specs/features/daily-featured.md` for override logic

**Error conditions**:
- Non-Admin JWT → 403 (middleware rejects before route handler)
- `userId` not found → 404
- Suspend already-suspended account → 200 (idempotent)

**Tests to write**:
- Unit: Admin group check middleware
- Integration: suspend user → verify Cognito disabled + DynamoDB status; reinstate → verify re-enabled; delete piece → verify ARCHIVED
