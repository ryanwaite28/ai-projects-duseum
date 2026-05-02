# Remaining Specs — Implementation Plan
> Temporary working document. Delete once all 20 specs reach ✅ Implemented.
>
> **Process for every spec (CLAUDE.md — no exceptions):**
> 1. Read the relevant PROJECT.md section(s) listed in the spec
> 2. Read the spec file in `specs/`
> 3. Implement only the files listed in the spec
> 4. Run `npx turbo run typecheck` — must pass with zero errors before marking done
> 5. Tick all "Done when" checkboxes in the spec and set Status to ✅ Implemented

---

## Group 1 — Foundational

### 1. `specs/admin/platform-config.md`
**Why first:** Config values (`FREE_TIER_LIMIT`, `PLATFORM_SUB_PRICE_ID`, `WEEKLY_FEATURE_FEE`, slot counts) are already read by live Lambda code via `getConfigValue()` / `getFreeTierLimit()`. The admin write path doesn't exist yet.

**Key files to create/modify:**
- `lambdas/admin/src/routes/get-platform-config.ts` — `GET /admin/config`
- `lambdas/admin/src/routes/update-platform-config.ts` — `PUT /admin/config`
- `packages/shared/src/db/config.repository.ts` — `getConfigValue()`, `setConfigValue()` (may partially exist)
- `infrastructure/stacks/api-stack.ts` — register routes with Admin JWT authorizer

**Watch out for:** The config table (`duseum-{env}-dynamodb-config`) already exists in the storage stack. Admin routes use a separate JWT authorizer that checks `systemRole=ADMIN` in the Cognito token — confirm the `AdminRoute` pattern used in `admin-lambda`.

---

### 2. `specs/subscriptions/subscription-price.md`
**Why second:** Author checkout (`POST /subscriptions/author/:authorId`) reads a `stripePriceId` from the Author profile. Without this spec, that field never gets set and Author subscriptions can't be purchased end-to-end.

**Key files to create/modify:**
- `lambdas/subscriptions/src/routes/set-author-price.ts` — `PUT /subscriptions/author-price`
- `packages/shared/src/db/subscriptions.repository.ts` — `setAuthorStripePriceId()`
- `infrastructure/stacks/api-stack.ts` — register route with JWT auth

**Watch out for:** Stripe prices are immutable — updating requires creating a new `stripe.prices.create()` and archiving the old one. The spec covers this. Store both `stripePriceId` and `stripePriceAmount` on the Author profile item.

---

### 3. `specs/users/follows.md`
**Why third:** Follow records are iterated by the notifications fan-out (spec #7). `GET /authors/:authorId` likely already returns a `followerCount`; the write path (follow/unfollow) may be missing.

**Key files to create/modify:**
- `lambdas/users/src/routes/follow-author.ts` — `POST /authors/:authorId/follow`
- `lambdas/users/src/routes/unfollow-author.ts` — `DELETE /authors/:authorId/follow`
- `packages/shared/src/db/follows.repository.ts` — `createFollow()`, `deleteFollow()`, `listFollowersByAuthor()`
- `infrastructure/stacks/api-stack.ts` — register routes

**Watch out for:** DynamoDB access pattern — Follow items use `PK=USER#{viewerId}, SK=FOLLOW#AUTHOR#{authorId}`. The `GSI-FollowersByAuthor` index (`PK=authorId, SK=followedAt`) already exists in the storage stack and is used by `listFollowersByAuthor()`. Follower count is maintained via `ADD followerCount :one` on the Author profile.

---

### 4. `specs/users/notification-preferences.md`
**Why fourth:** Must exist before any notification email is sent. The `notifications-lambda` reads preferences before sending; sending to a user who opted out would be a compliance issue.

**Key files to create/modify:**
- `lambdas/users/src/routes/get-notification-prefs.ts` — `GET /users/me/notification-preferences`
- `lambdas/users/src/routes/update-notification-prefs.ts` — `PUT /users/me/notification-preferences`
- `lambdas/users/src/routes/unsubscribe.ts` — `GET /notifications/unsubscribe?token=...` (one-click; signed JWT)
- `packages/shared/src/db/notification-prefs.repository.ts`
- `infrastructure/stacks/api-stack.ts` — register routes

**Watch out for:** The one-click unsubscribe uses a signed HMAC token (secret stored in Secrets Manager: `duseum/{env}/unsubscribe-hmac-secret`). This secret is pre-provisioned per CLAUDE.md. The unsubscribe route must be `NONE` auth (no JWT required — the user is clicking from an email).

---

## Group 2 — Social & Notifications

### 5. `specs/social/reactions.md`
**Simplest spec in the list.** One reaction per viewer per piece; `PUT` to set/change, `DELETE` to remove. Reaction counts tracked on the piece record itself (`reactionCounts` map attribute).

**Key files to create/modify:**
- `lambdas/social/src/routes/put-reaction.ts` — already registered as `PUT /artworks/:artworkId/reactions`
- `lambdas/social/src/routes/delete-reaction.ts` — `DELETE /artworks/:artworkId/reactions`
- `packages/shared/src/db/reactions.repository.ts`

**Watch out for:** The route is already registered in `api-stack.ts` (`RoutePutReaction`, `RouteDeleteReaction`) and in `social-lambda`'s index. Check whether the route handler file exists and is just a stub or is missing entirely before creating.

---

### 6. `specs/social/comments.md`
**Key files to create/modify:**
- `lambdas/social/src/routes/list-comments.ts` — `GET /artworks/:artworkId/comments`
- `lambdas/social/src/routes/post-comment.ts` — `POST /artworks/:artworkId/comments`
- `lambdas/social/src/routes/delete-comment.ts` — `DELETE /artworks/:artworkId/comments/:commentId`
- `lambdas/social/src/routes/pin-comment.ts` — `PUT /artworks/:artworkId/comments/:commentId/pin`
- `packages/shared/src/db/comments.repository.ts`
- `infrastructure/stacks/api-stack.ts` — register any missing routes

**Watch out for:** `GET /artworks/:artworkId/comments` and `POST /artworks/:artworkId/comments` are already registered in `api-stack.ts`. Replies are one level only (no recursive nesting). Pin is Author-only. Comment access respects `commentsEnabled` flag on the piece.

---

### 7. `specs/notifications/new-piece-fanout.md`
**Depends on:** specs #3 (follows) and #4 (notification-preferences).

**Key files to create/modify:**
- `lambdas/notifications/src/index.ts` — SQS consumer (may already be a stub)
- `lambdas/notifications/src/handlers/new-piece.ts` — fan-out logic
- `packages/shared/src/db/follows.repository.ts` — `listFollowersByAuthor()` (added in #3)

**Watch out for:**
- `artworks-lambda` already publishes ONE SQS message on `POST /artworks`. Do not change this — the fan-out reads from the queue.
- PRIVATE piece notifications go to **Author Subscribers only**, not mere followers (critical rule in CLAUDE.md).
- PUBLIC piece notifications go to **all followers**.
- Must check notification preferences before each SES send.
- Must NOT send for DRAFT pieces or visibility changes after initial publish (FR-NOTIF-11).
- Back-write `notifiedCount` on the piece record after fan-out completes.

---

## Group 3 — Discovery

### 8. `specs/discovery/browse-artworks.md`
**Two-pass strategy:** Homepage trending/browse queries work without featured data. Daily Featured and Weekly Featured sections of the homepage must wait until specs #10 and #11 are live. Implement the non-featured queries first; add featured aggregation in a follow-up.

**Key files to create/modify:**
- `lambdas/artworks/src/routes/list-artworks.ts` — may already handle browse; confirm filters (category, tag, authorId, cursor) are wired
- New route for homepage data aggregation (Daily Featured Author + Weekly Featured Authors + trending) — check PROJECT.md §4.2 for which Lambda owns this
- `packages/shared/src/db/artworks.repository.ts` — any missing browse query functions

**Watch out for:** Do not add homepage featured-aggregation routes to `artworks-lambda` if PROJECT.md assigns them elsewhere (e.g., a dedicated discovery or features Lambda). Read §4.2 before touching the Lambda inventory.

---

## Group 4 — Featured / Monetization

### 9. `specs/features/maintenance-rotation.md`
**Foundation for #10 and #11.** EventBridge rule triggers `maintenance-lambda` on a schedule.

**Key files to create/modify:**
- `lambdas/maintenance/src/handlers/weekly-rotation.ts` — activate upcoming week slots, archive previous
- `lambdas/maintenance/src/handlers/daily-selection.ts` — stub (fully implemented in #10)
- `lambdas/maintenance/src/handlers/cleanup-uploads.ts` — expire stale upload intents
- `infrastructure/stacks/api-stack.ts` or separate `maintenance-stack.ts` — EventBridge rules

**Watch out for:** The weekly rotation runs Monday 00:00 UTC — use `cron(0 0 ? * MON *)` in EventBridge. Archiving previous week's slots must be idempotent (safe to run twice). Check PROJECT.md §4.2 for whether `maintenance-lambda` is already wired to EventBridge or needs CDK setup.

---

### 10. `specs/features/daily-featured.md`
**Depends on:** spec #9 (maintenance-rotation for the exclusion window reset).

**Key files to create/modify:**
- `lambdas/maintenance/src/handlers/daily-selection.ts` — select one eligible Author; write `DailyFeatured#CURRENT` record
- `lambdas/admin/src/routes/override-daily-featured.ts` — Admin manual override
- `packages/shared/src/db/featured.repository.ts` — `getDailyFeaturedAuthor()`, `setDailyFeaturedAuthor()`

**Watch out for:** Exclusion window — an Author cannot be Daily Featured within 7 days of their last feature. Store `lastDailyFeaturedAt` on the Author profile and filter during selection. The Admin override must also write `lastDailyFeaturedAt` to respect the exclusion going forward.

---

### 11. `specs/features/weekly-booking.md`
**Most complex spec. Depends on:** spec #9 (slot availability), spec #2 (Author must exist to be featured, though price isn't required for this).

**Key files to create/modify:**
- `lambdas/features/src/routes/get-weekly-availability.ts` — returns eligible weeks + remaining slots
- `lambdas/features/src/routes/book-weekly.ts` — creates Stripe Payment Intent; writes pending booking record
- `lambdas/subscriptions-webhook/src/handlers/payment-intent.ts` — `payment_intent.succeeded` / `payment_intent.payment_failed` → confirm or cancel booking
- `packages/shared/src/db/features.repository.ts` — `createWeeklyBooking()`, `confirmBooking()`, `cancelBooking()`
- `infrastructure/stacks/api-stack.ts` — register feature routes

**Watch out for:**
- Eligibility check uses `isWithinThreeMonthWindow()` from `packages/shared/src/features/` — never reimplement inline.
- Slot count comes from config table (`WEEKLY_FEATURE_SLOT_COUNT`) set in spec #1.
- Stripe webhook handler for `payment_intent.succeeded` lives in `subscriptions-webhook-lambda` (not a new Lambda). Must be idempotent (check idempotency table first).
- `payment_intent.payment_failed` must set booking status to `FAILED` and release the slot.

---

## Group 5 — Admin

### 12. `specs/admin/user-management.md`
**Key files to create/modify:**
- `lambdas/admin/src/routes/list-users.ts`
- `lambdas/admin/src/routes/suspend-user.ts`
- `lambdas/admin/src/routes/remove-content.ts`
- `lambdas/admin/src/routes/override-daily-featured.ts` — (shared with spec #10)

**Watch out for:** Suspension sets `status=SUSPENDED` on `UserAccount` and/or `AuthorProfile`. Suspended Authors' pieces must not appear in public feeds — confirm the browse query filters handle this. Removing content (pieces) follows the same archival path as Author delete (`status=ARCHIVED`), not a hard DynamoDB delete.

---

### 13. `specs/admin/feature-management.md`
**Depends on:** spec #11 (weekly-booking must exist to cancel/refund).

**Key files to create/modify:**
- `lambdas/admin/src/routes/list-weekly-bookings.ts`
- `lambdas/admin/src/routes/cancel-weekly-booking.ts` — cancels booking + Stripe refund via `stripe.refunds.create()`
- `lambdas/admin/src/routes/get-dashboard-metrics.ts` — MRR, signups, flagged content counts

**Watch out for:** Stripe refunds for Payment Intents (not Subscriptions) use `stripe.refunds.create({ payment_intent: piId })`. Must also release the slot (decrement slot usage for that week) and update booking status to `CANCELLED_ADMIN`.

---

## Group 6 — Frontend

### 14. `frontend/auth-ui.md`
Read the spec carefully — login/register/verify pages may already exist as stubs in `frontend/src/pages/auth/`. Confirm what's missing (Google OAuth, password reset) vs. what just needs polish.

---

### 15. `frontend/browse-gallery-ui.md`
**Depends on:** spec #8 (browse-artworks backend). Implement after the discovery API is live so real data can be tested.

---

### 16. `frontend/subscription-ui.md`
**Depends on:** spec #2 (subscription-price). The Author subscription CTA on the Author profile page needs the price to display. Much of the platform subscription UI was fixed in the recent billing-fixes spec — focus on the Author subscription CTA and Connect onboarding polish.

---

### 17. `frontend/social-ui.md`
**Depends on:** specs #5 (reactions) and #6 (comments). Reaction buttons and comment thread on the piece detail page.

---

### 18. `frontend/featured-ui.md`
**Depends on:** specs #10 (daily-featured) and #11 (weekly-booking). Daily Featured hero + Weekly Featured carousel on homepage; booking calendar with Stripe payment redirect.

---

### 19. `frontend/author-dashboard-ui.md`
**Depends on:** most of Groups 1–4 being live so there is real data (follower counts, revenue, booking history) to display. Implement last among the non-admin frontend specs.

---

### 20. `frontend/admin-panel-ui.md`
**Depends on:** specs #1, #12, and #13. Implement last.

---

## Quick-reference checklist

```
Group 1 — Foundational
[x] 1.  specs/admin/platform-config.md
[x] 2.  specs/subscriptions/subscription-price.md
[x] 3.  specs/users/follows.md
[x] 4.  specs/users/notification-preferences.md

Group 2 — Social & notifications
[x] 5.  specs/social/reactions.md
[x] 6.  specs/social/comments.md
[x] 7.  specs/notifications/new-piece-fanout.md

Group 3 — Discovery
[x] 8.  specs/discovery/browse-artworks.md

Group 4 — Featured / monetization
[x] 9.  specs/features/maintenance-rotation.md
[x] 10. specs/features/daily-featured.md
[x] 11. specs/features/weekly-booking.md

Group 5 — Admin
[x] 12. specs/admin/user-management.md
[x] 13. specs/admin/feature-management.md

Group 6 — Frontend
[x] 14. specs/frontend/auth-ui.md
[x] 15. specs/frontend/browse-gallery-ui.md
[x] 16. specs/frontend/subscription-ui.md
[x] 17. specs/frontend/social-ui.md
[x] 18. specs/frontend/featured-ui.md
[x] 19. specs/frontend/author-dashboard-ui.md
[x] 20. specs/frontend/admin-panel-ui.md
```
