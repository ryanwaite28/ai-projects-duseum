## Spec: Dashboard Hub, Viewer Dashboard, Author Onboarding Wizard & Settings Pages

**Status**: ✅ Implemented
**FR coverage**: FR-VIEW-01, FR-VIEW-08, FR-VIEW-09, FR-VIEW-10, FR-AUTH-PROF-01, FR-AUTH-PROF-06, FR-PROF-02, FR-SUB-09
**Relevant PROJECT.md sections**: 2.2, 2.4, 2.7, 6.8

**What this implements**: Account hub (`/dashboard`) with profile cards linking viewer and author views; viewer dashboard (`/dashboard/viewer`) showing followed authors, subscription summary, and recent artworks feed; 2-step author onboarding wizard (`/onboarding/author`); settings index redirect; account settings page (`/settings/account`); subscriptions settings page (`/settings/subscriptions`).

**Prerequisites**: `route-protection.md` complete; `navigation-user-menu.md` complete; `users/author-onboarding.md` backend complete; `useMe()` hook available; `useSubscriptions()`, `useNotificationPreferences()` hooks available

**Done when**:
- [x] `/dashboard` renders account hub (no longer redirects to `/dashboard/viewer`)
- [x] Account hub shows both Viewer and Author profile cards with correct CTA per state
- [x] Author hub card shows "Become an Author" → `/onboarding/author` when `authorProfile === null`
- [x] Author hub card shows "Author Dashboard" → `/dashboard/author` when `authorProfile !== null`
- [x] Admin users see "Admin Panel" quick link in hub
- [x] Viewer dashboard shows followed authors list from `useNotificationPreferences()` override keys
- [x] Viewer dashboard shows subscription status summary with manage link
- [x] Viewer dashboard shows recent artworks feed (newest, limit 8) with load-more pagination
- [x] Onboarding wizard Step 1: display name (required, max 100) + bio (required, min 10, max 2000)
- [x] Onboarding wizard Step 2: optional subscription price ($1–$50 or blank); summary of Step 1 data
- [x] Onboarding wizard POSTs `POST /users/me/author`; on success invalidates `useMeQueryKey` + navigates to `/dashboard/author`
- [x] Onboarding wizard shows server error inline on 4xx/5xx response
- [x] `/settings` redirects to `/settings/account`
- [x] Account settings shows read-only email; editable display name via `PUT /users/me/viewer`; save shows success/error state
- [x] Account settings links to `/settings/notifications` and `/settings/subscriptions`
- [x] `/settings/subscriptions` renders the existing `SubscriptionsPage` (re-export, no duplication)
- [x] All new routes registered in `App.tsx` under `ProtectedRoute`
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/pages/dashboard/index.tsx` — (new) account hub page
- `frontend/src/pages/dashboard/viewer.tsx` — (new) viewer dashboard
- `frontend/src/pages/onboarding/author.tsx` — (new) 2-step author onboarding wizard
- `frontend/src/pages/settings/index.tsx` — (new) redirect → `/settings/account`
- `frontend/src/pages/settings/account.tsx` — (new) display name edit + nav to other settings
- `frontend/src/pages/settings/subscriptions.tsx` — (new) re-export of `pages/subscriptions`
- `frontend/src/App.tsx` — 6 new routes: `/dashboard`, `/dashboard/viewer`, `/onboarding/author`, `/settings`, `/settings/account`, `/settings/subscriptions`

**Design system**:
- Account hub: dual-column grid (`grid grid-cols-1 md:grid-cols-2 gap-px bg-gold/10 border border-gold/10`) — matches feature grid pattern
- Each profile card uses the feature card hover pattern (gold top-border reveal on hover)
- Onboarding wizard: step indicator dots (filled gold for completed/current; muted for future); `StepIndicator` component inline in page
- Form inputs: `bg-ink-soft border border-gold/20 focus:border-gold/50 text-parchment rounded-sm px-4 py-3`
- Settings page: read-only fields use `bg-ink-soft border border-gold/15` with "Read-only" muted badge

**Business logic**:
1. Account hub: reads `me?.authorProfile` — null → show "Become an Author" CTA; non-null → show Author Dashboard link
2. Viewer dashboard: `useNotificationPreferences()` provides followed-author list via `perAuthorOverrides` (each entry has `authorId` + optional `displayName`)
3. Onboarding Step 2: `authorSubscriptionPriceUsd` only included in POST body when field is non-empty and valid; omitting it creates author profile without subscriptions enabled
4. Account settings: `PUT /users/me/viewer` with `{ displayName }` — invalidates `useMeQueryKey` on success
5. `/settings/subscriptions` re-exports from `../subscriptions` to avoid duplicating the full `SubscriptionsPage` component

**DynamoDB access patterns used**:
- Author profile create: `PK=USER#{userId}, SK=PROFILE#AUTHOR` (via `POST /users/me/author`)
- Viewer profile update: `PK=USER#{userId}, SK=PROFILE#VIEWER` (via `PUT /users/me/viewer`)

**Tests to write**:
- Component: onboarding Step 1 "Continue" button disabled until display name and bio (≥10 chars) filled
- Component: onboarding Step 2 price validation rejects values outside $1–$50
- Component: onboarding success invalidates me query and navigates to author dashboard
- Component: account settings save calls `PUT /users/me/viewer` and shows success state
