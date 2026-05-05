# Spec: Comprehensive Test Coverage

**Status**: ✅ Implemented
**Relevant PROJECT.md sections**: 15.1, 15.2, 15.3, 15.4 (FR-TESTING-01 through FR-TESTING-07), 15.5, 15.6

**What this implements**: Establishes FR-TESTING functional requirements and closes the test gap audit — 16 untested Lambda routes + 8 untested frontend service files identified, specced, and tested.

---

## Gap Audit (as of 2026-05-02)

### Lambda Integration Tests — Gap Analysis

| Lambda | Route | Test file | Status |
|---|---|---|---|
| artworks | `GET /artworks/{id}` — incl. `authorIconUrl` null + URL | get-artwork.integration.test.ts | ✅ |
| artworks | `GET /artworks` | list-artworks.integration.test.ts | ✅ |
| artworks | `POST /artworks` | publish-piece.integration.test.ts | ✅ |
| artworks | `PUT /artworks/{id}` | artwork-mutations.integration.test.ts | ✅ |
| artworks | `DELETE /artworks/{id}` | artwork-mutations.integration.test.ts | ✅ |
| artworks | `GET /artworks/mine` | artwork-mutations.integration.test.ts | ✅ |
| artworks | `POST /collections` | collections.integration.test.ts | ✅ |
| artworks | `GET /collections` (browse — FR-DISC-07) | collections.integration.test.ts | ✅ |
| artworks | `GET /collections/{id}` | collections.integration.test.ts | ✅ |
| artworks | `DELETE /collections/{id}` | collections.integration.test.ts | ✅ |
| artworks | `GET /authors/{id}/collections` | collections.integration.test.ts | ✅ |
| artworks | `DELETE /collections/{id}/pieces/{artworkId}` | collections.integration.test.ts | ✅ |
| features | `GET /features/weekly/availability` | weekly-availability.integration.test.ts | ✅ |
| features | `POST /features/weekly/book` | book-weekly-feature.integration.test.ts | ✅ |
| features | `GET /features/daily` | daily-feature.integration.test.ts | ✅ |
| features | `GET /features/weekly` — incl. `avatarUrl` null + URL | weekly-and-bookings.integration.test.ts | ✅ |
| features | `GET /features/weekly/my-bookings` | weekly-and-bookings.integration.test.ts | ✅ |
| subscriptions | `GET /subscriptions/me` | subscriptions.integration.test.ts | ✅ |
| subscriptions | `POST /subscriptions/platform` | subscriptions.integration.test.ts | ✅ |
| subscriptions | `POST /subscriptions/authors/{id}` | subscriptions.integration.test.ts | ✅ |
| subscriptions | `POST /subscriptions/portal` | subscriptions.integration.test.ts | ✅ |
| subscriptions | `POST /subscriptions/connect/onboard` | subscriptions.integration.test.ts | ✅ |
| subscriptions | `GET /subscriptions/connect/status` | subscriptions.integration.test.ts | ✅ |
| subscriptions | `GET /subscriptions/me/subscribers` | subscriptions.integration.test.ts | ✅ |
| subscriptions | `POST /users/me/author/subscription-price` | subscriptions.integration.test.ts | ✅ |
| users | `POST /users/me/author` | users.integration.test.ts | ✅ |
| users | `GET /users/me` | users.integration.test.ts | ✅ |
| users | `PUT /users/me/viewer` | users.integration.test.ts | ✅ |
| users | `GET /authors` | users.integration.test.ts | ✅ |
| users | `GET /authors/{id}` | users.integration.test.ts | ✅ |
| users | `GET /users/{id}/profile` | users.integration.test.ts | ✅ |
| users | `GET /authors/{id}/collections` — subscriber sees SUBSCRIBER_ONLY (FR-COL-03 regression) | users.integration.test.ts | ✅ |
| admin | `PUT /admin/features/daily/override` | admin-features.integration.test.ts | ✅ |
| admin | `DELETE /admin/features/weekly/bookings/{id}` | admin-features.integration.test.ts | ✅ |
| admin | `GET /admin/features/weekly` | admin-features.integration.test.ts | ✅ |
| admin | `PUT /admin/users/{id}/suspend` | admin-users.integration.test.ts | ✅ |
| admin | `PUT /admin/users/{id}/reinstate` | admin-users.integration.test.ts | ✅ |
| admin | `DELETE /admin/artworks/{id}` | admin-users.integration.test.ts | ✅ |
| admin | `DELETE /admin/comments/{id}` | admin-users.integration.test.ts | ✅ |
| admin | `PUT /admin/config` | admin-users.integration.test.ts | ✅ |
| social | `GET /artworks/{id}/comments` | social.integration.test.ts | ✅ |
| social | `POST /artworks/{id}/comments` | social.integration.test.ts | ✅ |
| social | `PUT /artworks/{id}/reactions` | social.integration.test.ts | ✅ |
| notifications | `GET /notifications/unsubscribe` | fan-out-*.integration.test.ts | ✅ |
| media | `POST /media/upload-intent` | upload-intent.test.ts | ✅ |
| subscriptions-webhook | Stripe events | stripe-webhook.integration.test.ts | ✅ |
| auth-triggers | PostConfirmation | handler.integration.test.ts | ✅ |

### Frontend Service Unit Tests — Gap Analysis

| Service file | Test file | Status |
|---|---|---|
| authors.service.ts | authors.service.test.ts — incl. `updateAuthorProfile()` (5 tests) | ✅ |
| artworks.service.ts | artworks.service.test.ts | ✅ |
| features.service.ts | features.service.test.ts | ✅ |
| follows.service.ts | follows.service.test.ts | ✅ |
| social.service.ts | social.service.test.ts | ✅ |
| subscriptions.service.ts | subscriptions.service.test.ts | ✅ |
| collections.service.ts | collections.service.test.ts | ✅ |
| author-dashboard.service.ts | author-dashboard.service.test.ts | ✅ |
| admin.service.ts | admin.service.test.ts | ✅ |

### Frontend Component Tests — Coverage

| Component | Test file | Branches covered | Status |
|---|---|---|---|
| ArtworkCard | ArtworkCard.test.tsx | public image, inaccessible lock overlay, PRIVATE badge, stats | ✅ |
| ArtworkGrid | ArtworkGrid.test.tsx | PUBLIC→ArtworkCard, REQUIRES_PLATFORM_SUB→LockedArtworkCard, mixed, empty | ✅ |
| LockedArtworkCard | LockedArtworkCard.test.tsx | lock overlay, unauth redirect, auth checkout mutation, error state | ✅ |
| AuthorSubscribeCTA | AuthorSubscribeCTA.test.tsx | returns null (charges disabled), already subscribed, subscribe button+price, unauth redirect, auth mutation, error state | ✅ |
| ProtectedRoute | ProtectedRoute.test.tsx | loading spinner, unauth redirect, children rendered | ✅ |
| AdminRoute | AdminRoute.test.tsx | auth loading, me loading, unauth redirect, non-ADMIN→403, ADMIN renders children | ✅ |
| ProfileImageUpload | ProfileImageUpload.test.tsx | idle render, currentUrl preview, no-image placeholder, unsupported MIME error, size error, success+Saved+updateAuthorProfile called, API error, button disabled during upload | ✅ |
| DailyFeaturedSpotlight | DailyFeaturedSpotlight.test.tsx | skeleton when loading, author content on initial load (reveal regression), follower/subscriber counts, cover photo, null-author fallback, buttons, subscribe CTA | ✅ |

### Zustand Store Regression Tests

| Store | Test file | What is covered | Status |
|---|---|---|---|
| auth.store.ts | auth.store.test.ts | `signOut()` calls `queryClient.clear()` before nulling user (FR-TESTING-06) | ✅ |

### Collection Poster Image Tests — FR-COL-07

| Scope | What | Status |
|---|---|---|
| artworks integration | `POST /collections` with `posterS3Key` → list response includes `posterUrl` | ❌ |
| artworks integration | `PUT /collections/{id}` with `posterS3Key: null` → clears poster | ❌ |
| users integration | `GET /authors/{id}/collections` includes `posterUrl` on each item | ❌ |
| frontend component | `CollectionCard` renders poster → thumbnail → placeholder fallback chain | ❌ |

### Browse Collections Tests — FR-DISC-06, FR-DISC-07

| Scope | What | Status |
|---|---|---|
| artworks integration | `GET /collections` returns FREE collections only with correct shape | ✅ |
| artworks integration | `GET /collections` cursor pagination | ✅ |
| artworks integration | `GET /collections?sort=oldest` → 400 | ✅ |
| artworks integration | `GET /collections` empty array when only SUBSCRIBER_ONLY collections exist | ✅ |
| features integration | `GET /features/homepage` `exploreCollections` array (not implemented — `ExploreCollectionsSection` fetches independently) | N/A |
| frontend component | `ExploreCollectionsSection` renders skeleton, cards, empty state | ❌ |

### Browse Atrium + Collection Detail Tests — FR-DISC-08, FR-COL-08

| Scope | What | Status |
|---|---|---|
| artworks integration | `GET /collections/{id}` unauthenticated + SUBSCRIBER_ONLY → 200 `access: AUTH_REQUIRED` | ✅ |
| artworks integration | `GET /collections/{id}` non-subscriber + SUBSCRIBER_ONLY → 200 `access: SUBSCRIBER_ONLY_GATED` | ✅ |
| artworks integration | `GET /collections/{id}` active subscriber + SUBSCRIBER_ONLY → 200 `access: GRANTED` | ✅ |
| frontend service | `collectionsService.getById` URL, GRANTED shape, SUBSCRIBER_ONLY_GATED shape, AUTH_REQUIRED shape | ✅ |
| frontend component | `BrowseAtriumPage` — three lane cards, correct hrefs | ❌ |
| frontend component | `CollectionDetailPage` — GRANTED renders grid, SUBSCRIBER_ONLY_GATED renders gate, AUTH_REQUIRED renders gate + login link | ❌ |

### Transactional Email Tests — Gap Analysis (FR-NOTIF-12)

> Tests for the email module (`specs/notifications/transactional-emails.md`) are not yet written.

| Scope | What | Status |
|---|---|---|
| auth-triggers integration | `sendWelcomeEmail` fired after PostConfirmation | ❌ |
| subscriptions-webhook integration | `sendPlatformSubStartedEmail` + admin notif on PLATFORM created | ❌ |
| subscriptions-webhook integration | `sendAuthorSubStartedViewerEmail` + author email on AUTHOR_SUB created | ❌ |
| subscriptions-webhook integration | `sendPlatformSubCanceledEmail` on PLATFORM deleted | ❌ |
| subscriptions-webhook integration | `sendAuthorSubCanceledViewerEmail` + author email on AUTHOR_SUB deleted | ❌ |
| account-events unit | `sendConnectOnboardingCompleteEmail` on charges_enabled false→true; not fired on true→true | ❌ |

---

## New/modified files

### Lambda integration tests
- `lambdas/artworks/src/__tests__/artwork-mutations.integration.test.ts` — `PUT /artworks/{id}`, `DELETE /artworks/{id}` (soft + permanent), `GET /artworks/mine`
- `lambdas/features/src/__tests__/weekly-and-bookings.integration.test.ts` — `GET /features/weekly`, `GET /features/weekly/my-bookings`
- `lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts` — extended with `GET /subscriptions/me/subscribers`; mock updated `createConnectPrice` → `createPlatformPrice` + `deactivatePlatformPrice`; regression test added: set price → subscriber checkout → "No such price" fix (Destination Charges mismatch)
- `lambdas/users/src/__tests__/users.integration.test.ts` — extended: `GET /authors/{authorId}/collections` — owner (JWT sub === authorId) sees FREE + SUBSCRIBER_ONLY; non-owner / unauthenticated sees FREE only; 404 for nonexistent author
- `lambdas/subscriptions/src/__tests__/setup.ts` — added `GSI-SubscribersByAuthor` to table definition
- `lambdas/subscriptions-webhook/src/__tests__/stripe-webhook.integration.test.ts` — extended: current-week `payment_intent.succeeded` → immediately ACTIVE; past-week → CONFIRMED; test description clarified; `makeSub` fixture updated to Stripe API `2026-03-25.dahlia` shape (`items.data[]`); regression test for `current_period_end: null` → `currentPeriodEnd: null` written, no crash
- `lambdas/maintenance/src/__tests__/weekly-rotation.integration.test.ts` — extended: safety-net test for CONFIRMED previous-week → ARCHIVED

### Frontend service unit tests
- `frontend/src/services/__tests__/artworks.service.test.ts` — extended with `listMyArtworks` tests (GET /artworks/mine, limit/cursor params, PRIVATE artworks in response)
- `frontend/src/services/__tests__/features.service.test.ts`
- `frontend/src/services/__tests__/follows.service.test.ts`
- `frontend/src/services/__tests__/social.service.test.ts`
- `frontend/src/services/__tests__/subscriptions.service.test.ts`
- `frontend/src/services/__tests__/collections.service.test.ts`
- `frontend/src/services/__tests__/author-dashboard.service.test.ts`
- `frontend/src/services/__tests__/admin.service.test.ts`

### Frontend component tests
- `frontend/src/components/__tests__/ArtworkCard.test.tsx`
- `frontend/src/components/__tests__/ArtworkGrid.test.tsx`
- `frontend/src/components/__tests__/LockedArtworkCard.test.tsx`
- `frontend/src/components/__tests__/AuthorSubscribeCTA.test.tsx`
- `frontend/src/components/__tests__/ProtectedRoute.test.tsx`
- `frontend/src/components/__tests__/AdminRoute.test.tsx`
- `frontend/src/components/__tests__/ProfileImageUpload.test.tsx` — icon/wallpaper upload: 8 tests (idle, preview, errors, success, disabled state)
- `frontend/src/test/test-utils.tsx` — shared render wrapper (QueryClientProvider + MemoryRouter)
- `frontend/src/test/setup.ts` — updated: patches `window.location` to silence jsdom navigation warnings

### Shared package unit tests
- `packages/shared/src/features/iso-week.test.ts` — extended: `getEligibleWeeks` tests use deterministic `MONDAY`/`SUNDAY` fixtures; Sunday blocking tests added; `shouldActivateImmediately` test suite added

### Zustand store regression tests
- `frontend/src/store/__tests__/auth.store.test.ts` — FR-TESTING-06: `signOut()` clears React Query cache

### Project docs
- `PROJECT.md` — FR-TESTING-05 broadened; Section 15.5 expanded with component test pattern
- `PROJECT.md` — FR-FEAT-08/10/12/14/15/17 updated; slot count default corrected to 3; immediate-ACTIVE lifecycle; Sunday booking block; safety-net rotation step; GSI deduplication
- `CLAUDE.md` — component tests added as distinct testing layer with pattern guidance
- `specs/features/weekly-booking.md` — business logic updated for immediate-ACTIVE, Sunday block, GSI dedup, slotsTotal from API
- `specs/features/maintenance-rotation.md` — three-step rotation described; safety-net done-when item added
- `specs/testing/test-coverage.md` — new test coverage entries added

---

## Done-when checklist

- [x] FR-TESTING-01: every Lambda route has ≥1 integration test
- [x] FR-TESTING-02: response shape assertions on nested wrappers
- [x] FR-TESTING-03: every frontend service file has a unit test
- [x] FR-TESTING-05: every significant component has a test file covering all rendering branches
- [x] FR-TESTING-06: regression test for `followerCount.toLocaleString()` crash in `authors.service.test.ts`
- [x] FR-TESTING-06: regression test for sign-out React Query cache not cleared in `auth.store.test.ts`
- [x] FR-TESTING-07: idempotency test exists in `stripe-webhook.integration.test.ts`
- [x] `specs/testing/test-coverage.md` gap table fully green
