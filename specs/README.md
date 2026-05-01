# Duseum Spec Index

> Each spec covers one cohesive feature unit. Load the relevant spec(s) into your Claude session before starting implementation work — they are small enough to fit within a single context window. All specs are derived from PROJECT.md (the single source of truth); PROJECT.md takes precedence on any conflict.

Run `/sync-specs` to audit FR coverage and generate stubs for any uncovered functional requirements.

---

## Auth

| Spec | FR Coverage | Status |
|---|---|---|
| [cognito-registration.md](auth/cognito-registration.md) | FR-AUTH-01, FR-AUTH-03–07 | ✅ Implemented |
| [post-confirmation.md](auth/post-confirmation.md) | FR-AUTH-02, FR-PROF-01, FR-VIEW-01 | ✅ Implemented |

## Users

| Spec | FR Coverage | Status |
|---|---|---|
| [profile-crud.md](users/profile-crud.md) | FR-PROF-02–06, FR-VIEW-08 | ✅ Implemented |
| [author-onboarding.md](users/author-onboarding.md) | FR-AUTH-PROF-01, 05–09 | ✅ Implemented |
| [author-directory.md](users/author-directory.md) | FR-DISC-04 | ✅ Implemented |
| [follows.md](users/follows.md) | FR-VIEW-06, FR-VIEW-06a, FR-SOC-06 | ⬜ Pending |
| [notification-preferences.md](users/notification-preferences.md) | FR-VIEW-09, FR-VIEW-10, FR-NOTIF-08 | ⬜ Pending |

## Artworks

| Spec | FR Coverage | Status |
|---|---|---|
| [upload-intent.md](artworks/upload-intent.md) | FR-ART-01, 03, 04 | ✅ Implemented |
| [artwork-crud.md](artworks/artwork-crud.md) | FR-ART-01, 02, 05–10 | ✅ Implemented |
| [access-control.md](artworks/access-control.md) | FR-VIEW-03–05, FR-ART-02, FR-COL-02 | ✅ Implemented |
| [collections-crud.md](artworks/collections-crud.md) | FR-COL-01–06 | ✅ Implemented |
| [collection-pieces.md](artworks/collection-pieces.md) | FR-COL-04, FR-COL-05 | ✅ Implemented |

## Subscriptions

| Spec | FR Coverage | Status |
|---|---|---|
| [platform-checkout.md](subscriptions/platform-checkout.md) | FR-SUB-01, 03, 09, 10 | ✅ Implemented |
| [author-checkout.md](subscriptions/author-checkout.md) | FR-SUB-02, 04, 05, 06 | ✅ Implemented |
| [webhook-processing.md](subscriptions/webhook-processing.md) | FR-SUB-03, 13, FR-FEAT-17 | ✅ Implemented |
| [connect-onboarding.md](subscriptions/connect-onboarding.md) | FR-SUB-07, 11, 12, 13 | ✅ Implemented |
| [subscription-price.md](subscriptions/subscription-price.md) | FR-AUTH-PROF-05, FR-SUB-02 | ⬜ Pending |
| [my-subscribers.md](subscriptions/my-subscribers.md) | FR-AUTH-PROF-09, FR-SUB-02 | ✅ Implemented |

## Social

| Spec | FR Coverage | Status |
|---|---|---|
| [comments.md](social/comments.md) | FR-SOC-02–05, FR-AUTH-PROF-09 | ⬜ Pending |
| [reactions.md](social/reactions.md) | FR-SOC-01, FR-VIEW-07 | ⬜ Pending |

## Notifications

| Spec | FR Coverage | Status |
|---|---|---|
| [new-piece-fanout.md](notifications/new-piece-fanout.md) | FR-NOTIF-01–12 | ⬜ Pending |

## Features

| Spec | FR Coverage | Status |
|---|---|---|
| [daily-featured.md](features/daily-featured.md) | FR-FEAT-01–07 | ⬜ Pending |
| [weekly-booking.md](features/weekly-booking.md) | FR-FEAT-08–14, 16–18 | ⬜ Pending |
| [maintenance-rotation.md](features/maintenance-rotation.md) | FR-FEAT-15 | ⬜ Pending |

## Admin

| Spec | FR Coverage | Status |
|---|---|---|
| [user-management.md](admin/user-management.md) | FR-ADMIN-01–04 | ⬜ Pending |
| [feature-management.md](admin/feature-management.md) | FR-ADMIN-06, 07, FR-FEAT-06 | ⬜ Pending |
| [platform-config.md](admin/platform-config.md) | FR-ADMIN-05, FR-SUB-01, 10 | ⬜ Pending |

## Discovery

| Spec | FR Coverage | Status |
|---|---|---|
| [browse-artworks.md](discovery/browse-artworks.md) | FR-DISC-01–05, FR-VIEW-02 | ⬜ Pending |

## Infrastructure

| Spec | FR Coverage | Status |
|---|---|---|
| [storage-stack.md](infrastructure/storage-stack.md) | NFR-SCALE-01, 03, NFR-REL-03 | ✅ Implemented |
| [auth-stack.md](infrastructure/auth-stack.md) | FR-AUTH-03, 04, 05, 06 | ✅ Implemented |
| [messaging-stack.md](infrastructure/messaging-stack.md) | NFR-REL-02, 04, FR-NOTIF-02, 09 | ✅ Implemented |
| [api-stack.md](infrastructure/api-stack.md) | NFR-PERF-03, NFR-SEC-01, NFR-OBS-03 | ✅ Implemented |
| [cdn-stack.md](infrastructure/cdn-stack.md) | NFR-PERF-02, NFR-SEC-04, 06, 07 | ✅ Implemented |
| [monitoring-stack.md](infrastructure/monitoring-stack.md) | NFR-OBS-01–04 | ✅ Implemented |
| [cicd.md](infrastructure/cicd.md) | NFR-REL-01 | ✅ Implemented |

## Frontend

| Spec | FR Coverage | Status |
|---|---|---|
| [auth-ui.md](frontend/auth-ui.md) | FR-AUTH-01, 02, 03, 06 | ⬜ Pending |
| [browse-gallery-ui.md](frontend/browse-gallery-ui.md) | FR-DISC-01, 02, 05, FR-VIEW-02–05 | ⬜ Pending |
| [subscription-ui.md](frontend/subscription-ui.md) | FR-SUB-09, 11, 12, FR-VIEW-04, 05 | ✅ Implemented (partial) |
| [social-ui.md](frontend/social-ui.md) | FR-SOC-01–05, FR-VIEW-07 | ⬜ Pending |
| [author-dashboard-ui.md](frontend/author-dashboard-ui.md) | FR-AUTH-PROF-06, 08, 09, FR-FEAT-18, FR-NOTIF-12 | ✅ Implemented (partial) |
| [admin-panel-ui.md](frontend/admin-panel-ui.md) | FR-ADMIN-01–07 | ⬜ Pending |
| [featured-ui.md](frontend/featured-ui.md) | FR-FEAT-07, 08, 10, 12, 16 | ⬜ Pending |
| [route-protection.md](frontend/route-protection.md) | FR-AUTH-01, FR-ADMIN-01 | ✅ Implemented |
| [navigation-user-menu.md](frontend/navigation-user-menu.md) | FR-VIEW-01, FR-AUTH-PROF-06 | ✅ Implemented |
| [dashboard-settings-ui.md](frontend/dashboard-settings-ui.md) | FR-VIEW-01, 08, 09, 10, FR-AUTH-PROF-01, 06, FR-PROF-02, FR-SUB-09 | ✅ Implemented |

---

## FR Coverage Summary

All FR-* identifiers from PROJECT.md Sections 2.1–2.12 are covered by at least one spec above.

| Domain prefix | Total FRs | Covered |
|---|---|---|
| FR-AUTH | 7 | ✅ 7/7 |
| FR-PROF | 6 | ✅ 6/6 |
| FR-VIEW | 10 | ✅ 10/10 |
| FR-AUTH-PROF | 9 | ✅ 9/9 |
| FR-ART | 10 | ✅ 10/10 |
| FR-COL | 6 | ✅ 6/6 |
| FR-SUB | 13 | ✅ 13/13 |
| FR-DISC | 5 | ✅ 5/5 |
| FR-SOC | 6 | ✅ 6/6 |
| FR-ADMIN | 7 | ✅ 7/7 |
| FR-FEAT | 18 | ✅ 18/18 |
| FR-NOTIF | 12 | ✅ 12/12 |
| **Total** | **109** | **✅ 109/109** |
