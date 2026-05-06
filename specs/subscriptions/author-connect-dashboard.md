## Spec: Author Stripe Connect Dashboard Access

**Status**: ✅ Implemented
**FR coverage**: FR-SUB-14
**Relevant PROJECT.md sections**: 2.7, 4.2 (`subscriptions-lambda`), 6.8 (design system)
**Related specs**:
- `specs/subscriptions/connect-onboarding.md` — Connect Express onboarding flow (FR-SUB-07, FR-SUB-11, FR-SUB-12)

**What this implements**: Authors can open their Stripe Express Dashboard from the Author Analytics tab to view income, payouts, and download statements. A new `POST /subscriptions/connect/login-link` route generates a one-time Stripe Login Link; the frontend redirects the author on button click.

---

## New/modified files

### Lambda
- `lambdas/subscriptions/src/routes/connect-login-link.ts` (new) — `POST /subscriptions/connect/login-link`; validates Connect account exists and `connectChargesEnabled = true`; calls `createConnectLoginLink`; returns `{ loginUrl }`
- `lambdas/subscriptions/src/index.ts` — added dispatch for `POST /subscriptions/connect/login-link` and updated route table comment

### Shared package
- `packages/shared/src/stripe/index.ts` — added `createConnectLoginLink(accountId)` wrapper calling `stripe.accounts.createLoginLink(accountId)`

### Infrastructure
- `infrastructure/stacks/api-stack.ts` — registered `POST /subscriptions/connect/login-link` on `subscriptions-lambda` with JWT authorizer
- `scripts/bootstrap.sh` §16 — registered `POST /subscriptions/connect/login-link` in local API Gateway

### Frontend
- `frontend/src/services/subscriptions.service.ts` — added `ConnectLoginLinkResponse` interface + `createConnectLoginLink()` method
- `frontend/src/pages/dashboard/tabs/analytics-tab.tsx` — added `useConnectStatus()` hook; added "Stripe Connect" card section below "Stripe Billing" card

### Tests
- `lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts` — added `createConnectLoginLink` to Stripe mock; added `describe('POST /subscriptions/connect/login-link', ...)` with 4 tests
- `frontend/src/services/__tests__/subscriptions.service.test.ts` — added `describe('subscriptionsService.createConnectLoginLink', ...)` with 2 tests
- `frontend/src/components/__tests__/AnalyticsTab.test.tsx` (new) — 4 tests covering all render branches

---

## DynamoDB access patterns used

- Author profile: `GetItem` — `PK=AUTHOR#{userId}`, `SK=PROFILE#AUTHOR` (existing `getAuthorProfile()`)

No new GSIs or IAM required.

---

## Backend business logic — `connect-login-link.ts`

1. `getAuthorProfile(docClient, userId)` — 404 if missing
2. `!author.stripeConnectAccountId` → 400 "No Stripe Connect account found. Complete onboarding first."
3. `!author.connectChargesEnabled` → 400 "Stripe account setup is not complete."
4. `createConnectLoginLink(author.stripeConnectAccountId)` → `{ url }`
5. `return ok({ loginUrl: url })`

---

## Frontend behavior — `AnalyticsTab` Stripe Connect card

- `chargesEnabled === true` (from `useConnectStatus()`) → renders "Open Stripe Dashboard" button; on click calls `subscriptionsService.createConnectLoginLink()` and redirects `window.location.href = loginUrl`; pending state shows "Redirecting…"; error state shows inline error message
- `chargesEnabled === false` → renders informational note: "Your Stripe Connect account is still being set up. Once onboarding is complete you'll be able to access your Express Dashboard here."

---

## Done-when checklist

- [x] FR-SUB-14 added to PROJECT.md Section 2.7
- [x] `createConnectLoginLink()` added to `packages/shared/src/stripe/index.ts`
- [x] `POST /subscriptions/connect/login-link` route implemented, registered in lambda index, api-stack, and bootstrap.sh §16
- [x] `subscriptionsService.createConnectLoginLink()` added to frontend service
- [x] "Stripe Connect" card added to `AnalyticsTab` — all render states work correctly
- [x] Lambda integration tests pass (4 cases)
- [x] Frontend service unit tests pass (2 cases)
- [x] `AnalyticsTab` component tests pass (4 cases)
- [x] `specs/testing/test-coverage.md` updated
