## Spec: Admin Panel UI

**Status**: ✅ Implemented
**FR coverage**: FR-ADMIN-01, FR-ADMIN-02, FR-ADMIN-03, FR-ADMIN-04, FR-ADMIN-05, FR-ADMIN-06, FR-ADMIN-07
**Relevant PROJECT.md sections**: 2.10, 6.8

**What this implements**: Admin-only dashboard pages for user management, content moderation, platform config, feature override, and weekly booking management.

**Prerequisites**: Admin API endpoints complete (`admin/user-management.md`, `admin/feature-management.md`, `admin/platform-config.md`); `admin-guard.tsx` route guard created; test user added to Cognito `ADMIN` group

**Done when**:
- [x] Non-Admin users redirected from all `/admin/*` routes by `admin-guard.tsx`
- [x] User list is paginated; suspend/reinstate actions require confirmation modal before API call
- [x] Platform config form validates all 5 fields before calling `PUT /admin/config`
- [x] Daily feature override: Author search → select → confirm writes new daily featured
- [x] Weekly booking table shows next 8 weeks; Admin cancel shows confirmation modal with refund warning
- [x] Destructive action buttons styled with `text-[--color-error]`
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/pages/admin/index.tsx` — admin dashboard overview
- `frontend/src/pages/admin/users.tsx` — user list + suspend/reinstate actions
- `frontend/src/pages/admin/content.tsx` — flagged content queue; delete pieces/comments
- `frontend/src/pages/admin/config.tsx` — platform settings form
- `frontend/src/pages/admin/features.tsx` — daily feature override + weekly booking table
- `frontend/src/middleware/admin-guard.tsx` — route guard: redirect non-Admins to `/`
- `frontend/src/services/admin.service.ts` — all admin API calls

**Design system**:
- Admin pages use same design tokens but table-heavy layout
- `bg-ink-soft` table rows; action buttons: `text-[--color-error]` for destructive actions (suspend, delete)
- Config form: same field styling as auth forms; save button: gold fill

**Business logic**:
1. Route guard: check Cognito `ADMIN` group in JWT claims → if absent, redirect to `/`
2. User list: paginated; search by email; each row: suspend/reinstate toggle (confirmation modal before action)
3. Content moderation: list of pieces/comments with `status=REPORTED` (future: report system); manual delete
4. Platform config: read from `GET /admin/config`; form with validation; `PUT /admin/config` on save
5. Daily feature: current selection display; override form (Author search → select → confirm)
6. Weekly bookings: table by week (next 8 weeks); each row: Author name, status, booking date; Admin cancel button → confirmation modal with refund warning

**Tests to write**:
- Component: admin-guard redirects non-admin users
- Component: cancel booking modal requires explicit confirmation before calling API
