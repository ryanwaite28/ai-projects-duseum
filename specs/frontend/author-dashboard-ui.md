## Spec: Author Dashboard UI

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-PROF-06, FR-AUTH-PROF-08, FR-AUTH-PROF-09, FR-FEAT-18, FR-NOTIF-12
**Relevant PROJECT.md sections**: 2.4, 6.8

**What this implements**: Author dashboard with stats (views, followers, subscribers, revenue); artwork management table; collection management; Stripe Connect status; weekly feature booking history; notification delivery counts.

**Prerequisites**: All Author API endpoints complete; upload flow endpoints done (`artworks/upload-intent.md`); `StatCard` and `ArtworkRow` components created; Author dashboard page scaffolded

**Done when**:
- [x] Stats section renders `totalViews`, `followerCount`, `subscriberCount`, `MRR` from API
- [x] Connect status card visible in Author dashboard with correct onboarding state
- [x] Upload flow completes all 4 steps (intent → S3 PUT → confirm → publish) with progress indicator
- [x] Artworks tab shows `notificationsSent` count per published piece
- [x] Pinned pieces drag-and-drop enforces max 3 before allowing reorder
- [x] Collections tab creates, lists, and manages pieces within collections
- [x] Bookings tab shows upcoming + past bookings with correct status badges
- [x] Subscribers tab shows paginated subscriber list with status badges + count stat (see `subscriptions/my-subscribers.md`)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/pages/dashboard/author.tsx` — main Author dashboard
- `frontend/src/pages/dashboard/tabs/collections-tab.tsx` — collections management tab
- `frontend/src/pages/dashboard/tabs/artworks-tab.tsx` — artwork list + upload form
- `frontend/src/pages/dashboard/tabs/analytics-tab.tsx` — subscriber count, MRR, churn
- `frontend/src/pages/dashboard/tabs/bookings-tab.tsx` — weekly feature booking history + book new slot
- `frontend/src/components/dashboard/StatCard.tsx` — metric card (views, followers, etc.)
- `frontend/src/components/dashboard/ArtworkRow.tsx` — artwork list item with edit/archive/delete actions

**Design system**:
- Dashboard: `bg-ink` full-width; tabs use `border-b border-gold/20` nav
- Stat cards: `bg-ink-soft border border-gold/10` with large Playfair number + DM Sans label
- Artwork table: alternating `bg-ink` / `bg-ink-soft` rows; visibility badge (color-coded)

**Business logic**:
1. Stats section: `GET /users/me/author` → show totalViews, followerCount, subscriberCount, MRR
2. Artworks tab: paginated `GET /artworks?authorId=me`; each row shows: thumbnail, title, visibility badge, viewCount, reactionCount, commentCount, notificationsSent; actions: Edit, Archive, Delete
3. Collections tab: `GET /collections?authorId=me`; create new; manage pieces in collection
4. Upload flow: file picker → `POST /media/upload-intent` → direct S3 PUT → `POST /media/confirm-upload` → `POST /artworks`; progress indicator
5. Pinned pieces: drag-and-drop reorder (max 3); sends `PUT /users/me/author` with `pinnedPieceIds`
6. Bookings tab: upcoming + past bookings; "Book a feature week" flow (calendar picker → payment)
7. `notificationsSent` count shown on each published piece (FR-NOTIF-12)

**Tests to write**:
- Component: upload flow state machine (intent → uploading → confirming → done)
- Component: pinned pieces enforces max 3 before allowing drag
