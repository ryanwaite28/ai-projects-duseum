## Spec: Author Dashboard — Dedicated Sub-Routes

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-PROF-06
**Relevant PROJECT.md sections**: 6.1, 6.3

**What this implements**: Converts the author dashboard tab UI at `/dashboard/author` into dedicated nested routes:
- `/dashboard/author` → redirect to `/dashboard/author/overview`
- `/dashboard/author/overview`
- `/dashboard/author/analytics`
- `/dashboard/author/pieces` (previously "my pieces" tab)
- `/dashboard/author/collections`
- `/dashboard/author/settings`

Each route renders the appropriate section directly (deep-linkable, browser-navigable). The tab bar becomes a nav link group.

**New/modified files**:
- `frontend/src/pages/dashboard/author/` — refactor: split monolithic tab component into page components per route; update React Router config
- No backend changes

**Business logic**:
1. Update React Router to add nested routes under `/dashboard/author`
2. `/dashboard/author` (index) redirects to `/dashboard/author/overview`
3. Each sub-route renders its own page component
4. Active nav link highlighted based on current route (`useMatch` or `NavLink`)
5. Route protection: all sub-routes require authenticated Author profile (existing `ProtectedRoute` wrapping)

**Done when**:
- [x] `/dashboard/author/overview`, `/analytics`, `/pieces`, `/collections` each render independently
- [x] `/dashboard/author` redirects to `/dashboard/author/overview`
- [x] Browser back/forward works correctly between sections
- [x] Active tab highlighted based on current URL

**Tests to write**: none new — manual browser verification
