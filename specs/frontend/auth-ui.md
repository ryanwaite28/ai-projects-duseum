## Spec: Auth UI (Registration, Login, Verification)

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-01, FR-AUTH-02, FR-AUTH-03, FR-AUTH-06
**Relevant PROJECT.md sections**: 2.1, 6.8

**What this implements**: Registration form, login form, email verification prompt, password reset flow, Google OAuth button; all wired to Cognito via AWS Amplify or custom Cognito SDK.

**Prerequisites**: Cognito User Pool + App Client deployed (`auth-stack.md` complete); `auth.service.ts` Cognito SDK wrappers created; Zustand auth store initialized; design tokens defined in `tailwind.config.ts`

**Done when**:
- [x] Registration form submits → redirects to `/auth/verify-email` with correct Cognito `signUp()` call
- [x] Login form stores access + refresh tokens in Zustand store → redirects to `/dashboard`
- [x] Google OAuth button initiates Cognito hosted UI redirect (correct client ID + redirect URI)
- [x] Password reset form sends Cognito reset code and confirms new password
- [x] Token refresh handled automatically on 401; persistent failure redirects to `/auth/login`
- [x] All form states (loading, error, success) render correctly with design system tokens
- [x] `signOut()` calls `queryClient.clear()` before nulling user state — regression test in `auth.store.test.ts` passes
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/pages/auth/register.tsx` — registration form
- `frontend/src/pages/auth/login.tsx` — login form + Google OAuth
- `frontend/src/pages/auth/verify-email.tsx` — "check your email" prompt
- `frontend/src/pages/auth/reset-password.tsx` — password reset form
- `frontend/src/services/auth.service.ts` — Cognito SDK wrappers
- `frontend/src/store/auth.store.ts` — Zustand auth state; `signOut()` calls `queryClient.clear()`
- `frontend/src/lib/query-client.ts` — singleton `QueryClient` export (moved from `App.tsx` so store can import it)
- `frontend/src/App.tsx` — imports `queryClient` from `lib/query-client` instead of declaring inline
- `frontend/src/store/__tests__/auth.store.test.ts` — FR-TESTING-06 regression test

**Design system**:
- Hero pattern: `bg-ink` + radial glow; `EyebrowLabel` + Playfair Display h1
- Form inputs: `bg-ink-soft border border-gold/20 text-parchment focus:border-gold/60 rounded-sm px-4 py-3`
- Primary CTA button: gold fill
- Google OAuth button: secondary (transparent gold border)
- Error messages: `text-[--color-error]` below field

**Business logic**:
1. Registration: email + password → `signUp()` → redirect to `/auth/verify-email`
2. Login: `signIn()` → on success → store tokens → redirect to `/dashboard`
3. Google OAuth: initiate OAuth flow via Cognito hosted UI redirect
4. Token refresh: Amplify handles automatically; on 401 → retry once → if fails → redirect to login
5. Logout: `signOut()` → call `queryClient.clear()` (clears React Query cache) → null Zustand user → redirect to `/`

**Bug fix (2026-05-02)**: `signOut()` originally cleared Zustand state and called `amplifySignOut()` but did not clear the React Query cache. After sign-out, a new user signing in on the same browser session would receive the previous user's stale API responses (profile data, subscriptions, etc.) until the 60-second `staleTime` expired. The fix: moved `queryClient` to `frontend/src/lib/query-client.ts` as an exported singleton; `auth.store.ts` imports it and calls `queryClient.clear()` in both the Cognito and local-stub `signOut()` branches.

**Tests to write**:
- Unit: `auth.service.ts` function signatures + error mapping
- Regression (FR-TESTING-06): `frontend/src/store/__tests__/auth.store.test.ts` — asserts `queryClient.clear()` is called on sign-out
- E2E (future): full registration → verify → login flow
