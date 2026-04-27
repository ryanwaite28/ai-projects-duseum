## Spec: Notification Preferences Management

**Status**: ⬜ Pending
**FR coverage**: FR-VIEW-09, FR-VIEW-10, FR-NOTIF-08
**Relevant PROJECT.md sections**: 2.3, 2.12, 8

**What this implements**: Per-Author and global notification preference settings for Viewers; one-click unsubscribe via signed JWT link.

**Prerequisites**: `users/follows.md` complete; unsubscribe HMAC secret in Secrets Manager at `duseum/{env}/notifications/unsubscribe-secret`

**Done when**:
- [ ] `PUT /users/me/notification-preferences` updates `notificationPreference` on specified Follow records; global opt-out sets `globalNotificationOptOut=true` on User META record
- [ ] `POST /users/unsubscribe` validates HMAC token; rejects expired tokens → 400; sets preference=`NONE` on valid token
- [ ] Unsubscribe for non-existent follow → 200 (idempotent no-op)
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/users/src/routes/update-notification-prefs.ts` — `PUT /users/me/notification-preferences`
- `lambdas/users/src/routes/unsubscribe.ts` — `POST /users/unsubscribe` (no auth required; validates signed token)
- `packages/shared/src/db/follows.repository.ts` — `updateNotificationPreference()`, `setGlobalOptOut()`

**DynamoDB access patterns used**:
- Follow record: `PK=USER#{viewerId}, SK=FOLLOW#AUTHOR#{authorId}` — `notificationPreference` field
- User base record: `PK=USER#{userId}, SK=META` — `globalNotificationOptOut` boolean field
- Unsubscribe token: HMAC-signed JWT containing `{ viewerId, authorId, exp }` (TTL: 30 days)

**Business logic**:
1. `PUT /users/me/notification-preferences`:
   - Body: `{ global?: boolean, perAuthor?: [{ authorId, preference: 'ALL_NEW_PIECES'|'PUBLIC_ONLY'|'NONE' }] }`
   - Update `globalNotificationOptOut` on User META record (if `global` provided)
   - Update `notificationPreference` on each specified Follow record
   - Only affects Follow records that exist (silently skip non-existent follows)
2. `POST /users/unsubscribe` (unauthenticated):
   - Body: `{ token: string }`
   - Verify HMAC signature + expiry using unsubscribe HMAC secret from Secrets Manager
   - Extract `viewerId` + `authorId`
   - Set follow record `notificationPreference=NONE`
   - Returns 200 with `{ message: 'Unsubscribed successfully' }`
3. One-click global opt-out: `PUT /users/me/notification-preferences` with `{ global: true }` (FR-VIEW-10)

**Error conditions**:
- Invalid/expired unsubscribe token → 400
- `preference` not in allowed enum values → 400
- Unsubscribe for follow that doesn't exist → 200 (no-op, idempotent)

**Tests to write**:
- Unit: HMAC token sign/verify; expired token rejection; preference enum validation
- Integration: update per-author pref → verify Follow record; global opt-out → verify META record; unsubscribe endpoint with valid token
