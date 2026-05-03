## Spec: Author Subscription Price Management

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-PROF-05, FR-SUB-02
**Relevant PROJECT.md sections**: 2.4, 2.7, 8

**What this implements**: Author sets/updates their subscription price; Stripe Price object created on the **platform** Stripe account per the Destination Charges model; price stored on Author profile; price changes create a new Stripe Price (Stripe prices are immutable).

**Stripe Connect architecture note**: Prices are created on the **platform** Stripe account (not the connected account) because `createCheckoutSession` runs on the platform account (Destination Charges with `transfer_data.destination`). Prices created on the connected account are invisible to the platform account → "No such price" at checkout. The `transfer_data.destination` in `subscription_data` routes funds to the author's connected account; `application_fee_percent` takes the platform cut. Stripe does not support price deletion — `deactivatePlatformPrice` sets `active: false`, which is the functional equivalent.

**Prerequisites**: `subscriptions/connect-onboarding.md` complete; Author has `connectChargesEnabled=true`; Stripe secret key in Secrets Manager

**Done when**:
- [x] `POST /users/me/author/subscription-price` creates new Stripe Price on the **platform** account (`createPlatformPrice`); returns 400 if amountUsd < 1 or > 50
- [x] Previous `authorSubscriptionPriceId` deactivated on the platform account (`deactivatePlatformPrice` fire-and-forget after profile update)
- [x] `amountUsd=0` clears `authorSubscriptionPriceId` and `authorSubscriptionMonthlyUsd` on Author profile; disables subscriptions
- [x] Author without Connect account or `charges_enabled=false` → 400
- [x] Regression test: set price then viewer subscribe → checkout URL returned (no "No such price")
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/subscriptions/src/routes/set-subscription-price.ts` — `POST /users/me/author/subscription-price`
- `packages/shared/src/stripe/index.ts` — `createPlatformPrice()`, `deactivatePlatformPrice()`
- `packages/shared/src/db/users.repository.ts` — `updateAuthorProfile()` with `authorSubscriptionPriceId`, `authorSubscriptionMonthlyUsd`

**DynamoDB access patterns used**:
- Author profile: `PK=USER#{userId}, SK=PROFILE#AUTHOR` — `authorSubscriptionPriceId`, `authorSubscriptionMonthlyUsd` fields

**Business logic**:
1. `POST /users/me/author/subscription-price` — body: `{ amountUsd: number }`:
   - `amountUsd=0` → disable author subscriptions (clear `authorSubscriptionPriceId`, `authorSubscriptionMonthlyUsd`)
   - `amountUsd` min: 1, max: 50 (USD)
   - If Author has no `stripeConnectAccountId` → 400 (must complete Connect onboarding first)
   - If Connect account `charges_enabled=false` → 400
   - Create new Stripe Price on the **platform** account (`createPlatformPrice`) — no `stripeAccount`
   - Update Author profile: new `authorSubscriptionPriceId`, `authorSubscriptionMonthlyUsd`
   - Deactivate old Stripe Price on the platform account (`deactivatePlatformPrice`) — fire-and-forget; Stripe API does not support price deletion
2. Price shown on public Author profile page as the subscription CTA (if non-null)
3. Platform revenue cut applied at checkout time via `application_fee_percent` (FR-SUB-06); cut % from config table

**Error conditions**:
- `amountUsd` < 1 or > 50 → 400
- Author has no Connect account → 400
- Connect account `charges_enabled=false` → 400

**Tests**:
- Integration: `subscriptions.integration.test.ts` — 30 tests covering all happy paths, error cases, and the regression test (set price → subscribe → checkout URL)
