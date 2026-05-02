# Spec: Comprehensive Test Coverage

**Status**: ✅ Implemented
**Relevant PROJECT.md sections**: 15.1, 15.2, 15.3, 15.4 (FR-TESTING-01 through FR-TESTING-07), 15.5, 15.6

**What this implements**: Establishes FR-TESTING functional requirements and closes the test gap audit — 16 untested Lambda routes + 8 untested frontend service files identified, specced, and tested.

---

## Gap Audit (as of 2026-05-02)

### Lambda Integration Tests — Gap Analysis

| Lambda | Route | Test file | Status |
|---|---|---|---|
| artworks | `GET /artworks/{id}` | get-artwork.integration.test.ts | ✅ |
| artworks | `GET /artworks` | list-artworks.integration.test.ts | ✅ |
| artworks | `POST /artworks` | publish-piece.integration.test.ts | ✅ |
| artworks | `PUT /artworks/{id}` | artwork-mutations.integration.test.ts | ✅ |
| artworks | `DELETE /artworks/{id}` | artwork-mutations.integration.test.ts | ✅ |
| artworks | `GET /artworks/mine` | artwork-mutations.integration.test.ts | ✅ |
| artworks | `POST /collections` | collections.integration.test.ts | ✅ |
| artworks | `GET /collections/{id}` | collections.integration.test.ts | ✅ |
| artworks | `DELETE /collections/{id}` | collections.integration.test.ts | ✅ |
| artworks | `GET /authors/{id}/collections` | collections.integration.test.ts | ✅ |
| artworks | `DELETE /collections/{id}/pieces/{artworkId}` | collections.integration.test.ts | ✅ |
| features | `GET /features/weekly/availability` | weekly-availability.integration.test.ts | ✅ |
| features | `POST /features/weekly/book` | book-weekly-feature.integration.test.ts | ✅ |
| features | `GET /features/daily` | daily-feature.integration.test.ts | ✅ |
| features | `GET /features/weekly` | weekly-and-bookings.integration.test.ts | ✅ |
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
| authors.service.ts | authors.service.test.ts | ✅ |
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

---

## New/modified files

### Lambda integration tests
- `lambdas/artworks/src/__tests__/artwork-mutations.integration.test.ts` — `PUT /artworks/{id}`, `DELETE /artworks/{id}` (soft + permanent), `GET /artworks/mine`
- `lambdas/features/src/__tests__/weekly-and-bookings.integration.test.ts` — `GET /features/weekly`, `GET /features/weekly/my-bookings`
- `lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts` — extended with `GET /subscriptions/me/subscribers`
- `lambdas/subscriptions/src/__tests__/setup.ts` — added `GSI-SubscribersByAuthor` to table definition

### Frontend service unit tests
- `frontend/src/services/__tests__/artworks.service.test.ts`
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
- `frontend/src/test/test-utils.tsx` — shared render wrapper (QueryClientProvider + MemoryRouter)
- `frontend/src/test/setup.ts` — updated: patches `window.location` to silence jsdom navigation warnings

### Project docs
- `PROJECT.md` — FR-TESTING-05 broadened; Section 15.5 expanded with component test pattern
- `CLAUDE.md` — component tests added as distinct testing layer with pattern guidance
- `specs/testing/test-coverage.md` — component coverage table added

---

## Done-when checklist

- [x] FR-TESTING-01: every Lambda route has ≥1 integration test
- [x] FR-TESTING-02: response shape assertions on nested wrappers
- [x] FR-TESTING-03: every frontend service file has a unit test
- [x] FR-TESTING-05: every significant component has a test file covering all rendering branches
- [x] FR-TESTING-06: regression test for `followerCount.toLocaleString()` crash in `authors.service.test.ts`
- [x] FR-TESTING-07: idempotency test exists in `stripe-webhook.integration.test.ts`
- [x] `specs/testing/test-coverage.md` gap table fully green
