## Spec: Stripe Connect Express Onboarding

**Status**: ✅ Implemented
**FR coverage**: FR-SUB-07, FR-SUB-11, FR-SUB-12, FR-SUB-13
**Relevant PROJECT.md sections**: 2.7, 4.2, 8

**What this implements**: Stripe Connect Express onboarding for Authors to receive subscription revenue; redirect flow for completion and refresh; status endpoint with DynamoDB cache; account.updated webhook caching.

**Prerequisites**: Stripe Connect client ID in Secrets Manager; `APP_BASE_URL` added to `commonEnv` in `infrastructure/stacks/api-stack.ts`; `updateAuthorProfile()` in shared repo; `subscriptions-lambda` deployed

**Done when**:
- [ ] `POST /subscriptions/connect/onboard` creates Connect account and writes both `PROFILE#AUTHOR` field and `CONNECT#{id}/META` reverse-lookup record in parallel
- [x] `return_url` and `refresh_url` use `APP_BASE_URL` env var (not hardcoded `https://duseum.com`)
- [ ] `GET /subscriptions/connect/status` reads DynamoDB cache before calling Stripe API; Stripe only called on cache miss
- [ ] `detailsSubmitted` field fixed to not reuse `connectChargesEnabled` value (known issue in spec)
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/subscriptions/src/routes/connect-onboard.ts` — `POST /subscriptions/connect/onboard`
- `lambdas/subscriptions/src/routes/connect-status.ts` — `GET /subscriptions/connect/status`
- `packages/shared/src/db/users.repository.ts` — `updateAuthorProfile()` with `stripeConnectAccountId`, `connectChargesEnabled`

**DynamoDB access patterns used**:
- Author profile: `PK=USER#{userId}, SK=PROFILE#AUTHOR` — `stripeConnectAccountId`, `connectChargesEnabled` fields
- Connect reverse-lookup: `PK=CONNECT#{stripeConnectAccountId}, SK=META` — `{ userId }` — written on first onboard; used by webhook handler to resolve userId from Connect account ID

**Business logic**:
1. `POST /subscriptions/connect/onboard`:
   - Validate Author profile exists + status=`ACTIVE`
   - If no `stripeConnectAccountId`: create Stripe Connect Express account
   - Create Stripe Account Link with:
     - `return_url = APP_BASE_URL + /dashboard/author?connect=return`
     - `refresh_url = APP_BASE_URL + /dashboard/author?connect=refresh`
   - Write Connect account ID to Author profile (parallel write of reverse-lookup record `CONNECT#…/META`)
   - Return: `{ onboardingUrl }` — frontend redirects Author to Stripe
2. `GET /subscriptions/connect/status`:
   - Read Author profile → check `connectChargesEnabled` (DynamoDB-cached by webhook)
   - If cached value present → return immediately (no Stripe API call)
   - If absent → call Stripe `accounts.retrieve()` → backfill cache asynchronously → return live value
3. Frontend flow for `connect=return` (FR-SUB-11): show success notification, invalidate connect-status query cache
4. Frontend flow for `connect=refresh` (FR-SUB-12): auto-call `POST /subscriptions/connect/onboard` and redirect to new `onboardingUrl`

**Known issue to fix**:
- `connect-status.ts` currently returns `detailsSubmitted: author.connectChargesEnabled` (same field for two independent Stripe fields). Should either cache `connectDetailsSubmitted` separately or always call Stripe for `detailsSubmitted`.

**Error conditions**:
- Non-Author calling onboard → 403
- Author profile PENDING_SETUP → 400 (must complete onboarding first)

**Tests to write**:
- Unit: `connect-status.ts` cache hit vs miss path
- Integration: onboard → verify Connect account created and reverse-lookup written; status endpoint reads DynamoDB cache before calling Stripe
