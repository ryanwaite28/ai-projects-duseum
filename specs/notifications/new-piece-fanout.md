## Spec: New-Piece Notification Fan-Out

**Status**: ✅ Implemented
**FR coverage**: FR-NOTIF-01, FR-NOTIF-02, FR-NOTIF-03, FR-NOTIF-04, FR-NOTIF-05, FR-NOTIF-06, FR-NOTIF-07, FR-NOTIF-08, FR-NOTIF-09, FR-NOTIF-10, FR-NOTIF-11, FR-NOTIF-12
**Relevant PROJECT.md sections**: 2.12, 4.2, 4.6, 8

**What this implements**: Async fan-out of new-piece email notifications to followers via SQS → notifications-lambda → SES; respects access tier, notification preferences, global opt-out; one-click unsubscribe; delivery count back-write.

**Prerequisites**: `users/follows.md` and `users/notification-preferences.md` complete; SQS notifications queue deployed; SES `no-reply@duseum.com` verified (pre-provisioned); unsubscribe HMAC secret in Secrets Manager; `notifications-lambda` deployed

**Done when**:
- [x] PRIVATE piece notifications sent only to Author Subscribers with preference ≠ `PUBLIC_ONLY` and ≠ `NONE` and `globalNotificationOptOut=false`
- [x] PUBLIC piece notifications sent to all followers except preference=`NONE` or `globalNotificationOptOut=true`
- [x] SES failure for one follower logged + skipped; remaining followers still notified (FR-NOTIF-10)
- [x] Unsubscribe link in email sets that follower's `notificationPreference=NONE` when clicked (no login required)
- [x] `notifiedCount` atomically incremented on ArtPiece record after fan-out completes
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/notifications/src/index.ts` — SQS handler for `NEW_PIECE_PUBLISHED` messages
- `lambdas/notifications/src/handlers/new-piece.ts` — fan-out logic: page through followers, filter, send SES
- `packages/shared/src/db/follows.repository.ts` — `listFollowersForAuthor()` (paginated)
- `packages/shared/src/db/subscriptions.repository.ts` — `getAuthorSubscription()` (check if follower is Author Subscriber)
- `packages/shared/src/email/templates/new-piece.ts` — SES email template

**DynamoDB access patterns used**:
- Followers: `PK=AUTHOR#{authorId}, SK begins_with FOLLOWER#` — paginated query
- Per-follower notification preference: `notificationPreference` on Follow record
- Global opt-out: `globalNotificationOptOut` on `PK=USER#{userId}, SK=META`
- Author subscription check (for PRIVATE piece): `PK=USER#{viewerId}, SK=SUB#AUTHOR#{authorId}`
- Delivery count back-write: `PK=ART#{pieceId}, SK=META` → `notificationsSent` (atomic ADD)

**Business logic**:
1. `artworks-lambda` publishes: `{ pieceId, authorId, visibility: 'PUBLIC'|'PRIVATE', title, thumbnailKey, descriptionExcerpt }` to notification SQS queue
2. `notifications-lambda` receives SQS message:
   - Not sent if Author profile SUSPENDED/DEACTIVATED (check Author status first — FR-NOTIF-11)
   - Page through `FOLLOWER#` records for `authorId` (page size: 100)
3. Per follower:
   - Skip if `globalNotificationOptOut=true`
   - Skip if `notificationPreference=NONE`
   - If `visibility=PRIVATE`: skip if follower is not an Author Subscriber (FR-NOTIF-05); also skip if preference=`PUBLIC_ONLY`
   - If `visibility=PUBLIC`: all followers notified unless preference=`NONE` (FR-NOTIF-06)
4. For each follower to notify:
   - Generate unsubscribe token: HMAC-signed JWT `{ viewerId, authorId, exp: now+30d }` using secret from Secrets Manager
   - Build SES email from template: Author name, piece title, thumbnail URL (CloudFront public URL for PUBLIC; signed URL for PRIVATE), description excerpt (max 160 chars), piece deep link, one-click unsubscribe link
   - Send via SES `send-email`; on failure log + continue (FR-NOTIF-10)
5. After all pages: atomic ADD `notificationsSent` count to ArtPiece record (FR-NOTIF-12)

**Conditions that suppress notification entirely** (FR-NOTIF-11):
- Piece visibility is DRAFT (never published pieces)
- Author profile is SUSPENDED or DEACTIVATED
- Visibility change after initial publish (no second notification)

**Tests to write**:
- Unit: preference filter logic (all combinations); unsubscribe token generation/validation
- Integration: seed followers with varying preferences + subscription status; publish PUBLIC piece → verify correct subset received; publish PRIVATE piece → only Author Subscribers with correct preference receive; SES failure on one follower → others still sent
