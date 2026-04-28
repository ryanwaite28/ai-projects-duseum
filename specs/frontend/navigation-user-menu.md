## Spec: Authenticated Navigation — NavBar + UserMenu

**Status**: ✅ Implemented
**FR coverage**: FR-VIEW-01, FR-AUTH-PROF-06
**Relevant PROJECT.md sections**: 6.8

**What this implements**: `UserMenu` avatar dropdown giving authenticated users access to every account route from the nav bar; context-aware Upload button for authors; `NavBar` updated to replace the inline sign-out control with `UserMenu`.

**Prerequisites**: `route-protection.md` complete; `useMe()` hook available; design tokens defined in `tailwind.config.ts`

**Done when**:
- [x] Avatar button shows email initial; styled to match logo mark (gold border, ink background)
- [x] Dropdown closes on outside click (`useRef` + `useEffect` on `mousedown`)
- [x] Signed-in email shown in dropdown header (truncated if long)
- [x] "My Account" → `/dashboard`, "Viewer Dashboard" → `/dashboard/viewer` always shown
- [x] "Author Dashboard" → `/dashboard/author` shown only when `authorProfile !== null`
- [x] "Become an Author" → `/onboarding/author` shown only when `authorProfile === null`
- [x] "Upload Artwork" link hidden for non-authors; visible for authors
- [x] "Subscriptions" → `/settings/subscriptions`, "Settings" → `/settings/account`, "Notifications" → `/settings/notifications`
- [x] "Sign Out" calls `signOut()` then navigates to `/`
- [x] Upload button (ghost/nav variant) in NavBar visible only to authors
- [x] Unauthenticated state unchanged: Sign In + Join buttons
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/components/layout/UserMenu.tsx` — (new) avatar dropdown component
- `frontend/src/components/layout/NavBar.tsx` — remove inline auth controls; add `UserMenu`; add Upload button for authors

**Design system**:
- Avatar button: `w-8 h-8 border-[1.5px] border-gold rounded-md` — matches logo mark aesthetic
- Dropdown: `bg-ink-soft border border-gold/20 rounded-sm shadow-lg` with `animate-fade-in`
- Menu items: `text-[0.82rem] text-stone-light hover:text-parchment hover:bg-ink-raised font-body`
- Section dividers: `border-t border-gold/10`
- "Become an Author" label uses `text-gold-light` to signal CTA prominence

**Business logic**:
1. `UserMenu` receives no props — reads `user.email` from `useAuthStore` and `me.authorProfile` from `useMe()` (already cached, no extra fetch)
2. `authorProfile === null` branch shows "Become an Author"; non-null branch shows "Author Dashboard"
3. `NavBar` derives `isAuthor = !!user && me?.authorProfile != null` for Upload button visibility

**Tests to write**:
- Component: dropdown opens on avatar click; closes on outside click
- Component: "Author Dashboard" link absent when `authorProfile` is null; present when non-null
