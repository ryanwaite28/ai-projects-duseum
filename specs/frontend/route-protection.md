## Spec: Frontend Route Protection (ProtectedRoute + AdminRoute)

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-01, FR-ADMIN-01
**Relevant PROJECT.md sections**: 2.1, 2.11, 6.3

**What this implements**: `ProtectedRoute` wrapper that redirects unauthenticated users to `/login?return=…` and `AdminRoute` wrapper that additionally checks `systemRole=ADMIN` via the `/users/me` API; all authenticated and admin-only routes in `App.tsx` guarded accordingly.

**Prerequisites**: `auth-stack.md` complete; Zustand `useAuthStore` initialized; `useMe()` React Query hook available

**Done when**:
- [x] `ProtectedRoute` redirects unauthenticated users to `/login?return={encodedPath}` with `replace`
- [x] `ProtectedRoute` shows gold spinner while `authLoading` is true — no flash of protected content
- [x] `AdminRoute` redirects to `/403` when `me.account.systemRole !== 'ADMIN'`
- [x] `AdminRoute` redirects to `/login?return=…` when no authenticated user
- [x] All 5 `/admin/*` routes wrapped in `AdminRoute`
- [x] `/dashboard`, `/dashboard/author`, `/subscriptions`, `/settings/*`, `/onboarding/author` wrapped in `ProtectedRoute`
- [x] Stripe redirect pages (`/subscription/success`, `/subscription/cancel`) remain public
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/components/layout/ProtectedRoute.tsx` — redirects unauthenticated users
- `frontend/src/components/layout/AdminRoute.tsx` — (new) redirects non-ADMIN users to `/403`
- `frontend/src/App.tsx` — all authenticated + admin routes wrapped with correct guard component

**Business logic**:
1. `ProtectedRoute` reads `{ user, isLoading }` from `useAuthStore`; shows spinner while loading; redirects to `/login?return=${encoded}` when `user === null`
2. `AdminRoute` additionally calls `useMe()` (React Query, 5-min stale); waits for both auth and me to load; checks `me.account.systemRole === 'ADMIN'`; redirects to `/403` on mismatch
3. `App.tsx` route ordering: specific paths before catch-alls; `/dashboard/viewer` before `/dashboard`; Stripe redirect pages intentionally kept public for post-payment session completion

**Tests to write**:
- Component: `ProtectedRoute` renders children when authenticated; redirects with `return` param when not
- Component: `AdminRoute` redirects to `/403` when systemRole is `USER`
