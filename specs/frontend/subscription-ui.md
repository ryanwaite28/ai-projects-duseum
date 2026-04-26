## Spec: Subscription UI

**Status**: ⬜ Pending
**FR coverage**: FR-SUB-09, FR-SUB-11, FR-SUB-12, FR-VIEW-04, FR-VIEW-05
**Relevant PROJECT.md sections**: 2.7, 6.8

**What this implements**: Platform subscription checkout CTA; Author subscription CTA on Author profile; Stripe Billing Portal self-service; Stripe Connect onboarding redirect + return/refresh detection.

**Prerequisites**: Subscription API endpoints complete (`subscriptions/platform-checkout.md`, `subscriptions/author-checkout.md`, `subscriptions/connect-onboarding.md`); Stripe.js loaded in `index.html`; React Query configured with query client

**Done when**:
- [x] `?connect=return` URL param detected on Author Dashboard mount → success toast + React Query cache invalidated
- [x] `?connect=refresh` URL param detected → auto-calls `POST /subscriptions/connect/onboard` → redirects to new `onboardingUrl`
- [x] `ConnectStatusCard` shows correct status (pending/connected) with animated status dot
- [ ] `PlatformSubscribeCTA` redirects to Stripe Checkout on click; cache invalidated on post-success return
- [ ] `AuthorSubscribeCTA` visible only when Author has price set + `connectChargesEnabled=true`
- [ ] "Manage" button → `POST /subscriptions/portal` → Billing Portal redirect
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/pages/dashboard/author.tsx` — Connect onboarding status card; return/refresh param detection
- `frontend/src/components/subscription/PlatformSubscribeCTA.tsx` — upsell for non-subscribers
- `frontend/src/components/subscription/AuthorSubscribeCTA.tsx` — per-Author subscribe button
- `frontend/src/components/subscription/ConnectStatusCard.tsx` — shows Connect account status + onboarding link
- `frontend/src/services/subscriptions.service.ts` — `getConnectStatus()`, `startConnectOnboarding()`, `createPlatformCheckout()`, `createAuthorCheckout()`

**Design system**:
- Subscription CTAs: gold fill primary button
- Connect status: green status dot (`animate-float`) when `chargesEnabled=true`; amber dot when pending
- Upsell overlays on locked pieces use blurred background + lock icon

**Business logic**:
1. Author Dashboard — Connect onboarding (FR-SUB-11, FR-SUB-12):
   - On mount: check URL params for `?connect=return` → show success toast, invalidate `connectStatus` React Query cache
   - Check URL params for `?connect=refresh` → auto-call `POST /subscriptions/connect/onboard` → redirect to new `onboardingUrl`
   - `ConnectStatusCard` shows: `chargesEnabled` status; "Set up payouts" button if not connected; "Connected" badge if `chargesEnabled=true`
2. Platform subscription:
   - Non-subscriber sees upsell on locked pieces → click → `POST /subscriptions/platform/checkout` → redirect to Stripe Checkout
   - After success: Stripe redirects to dashboard; React Query invalidates subscription status
3. Author subscription:
   - Author profile page shows `AuthorSubscribeCTA` if Author has a price set + `connectChargesEnabled=true`
   - Click → `POST /subscriptions/author/{authorId}/checkout` → redirect to Stripe Checkout
4. Manage subscriptions: "Manage" button → `POST /subscriptions/portal` → redirect to Stripe Billing Portal

**Tests to write**:
- Component: `?connect=refresh` param triggers auto-redirect (mock `startConnectOnboarding`)
- Component: `?connect=return` param shows success notification and invalidates query
