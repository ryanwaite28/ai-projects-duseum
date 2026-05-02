## Spec: Author Subscription Price Management

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-PROF-05, FR-SUB-02
**Relevant PROJECT.md sections**: 2.4, 2.7, 8

**What this implements**: Author sets/updates their subscription price; Stripe Price object created per-Author; price stored on Author profile; price changes create new Stripe Price (Stripe prices are immutable).

**Prerequisites**: `subscriptions/connect-onboarding.md` complete; Author has `connectChargesEnabled=true`; Stripe secret key in Secrets Manager

**Done when**:
- [x] `POST /users/me/author/subscription-price` creates new Stripe Price on Author's Connect account; returns 400 if amountUsd < 1 or > 50
- [x] Previous `authorSubscriptionPriceId` archived in Stripe when updating price (`archiveConnectPrice` fire-and-forget after profile update)
- [x] `amountUsd=0` clears `authorSubscriptionPriceId` and `authorSubscriptionMonthlyUsd` on Author profile; disables subscriptions
- [x] Author without Connect account or `charges_enabled=false` → 400
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/subscriptions/src/routes/set-author-price.ts` — `POST /subscriptions/author/price`
- `packages/shared/src/db/users.repository.ts` — `updateAuthorProfile()` with `stripePriceId`, `authorSubscriptionPrice`

**DynamoDB access patterns used**:
- Author profile: `PK=USER#{userId}, SK=PROFILE#AUTHOR` — `stripePriceId`, `authorSubscriptionPriceCents` fields

**Business logic**:
1. `POST /subscriptions/author/price` — body: `{ priceCents: number | null }`:
   - `null` → disable author subscriptions (set `stripePriceId=null`, `authorSubscriptionPriceCents=null`)
   - `priceCents` min: 100 (=$1), max: 5000 (=$50)
   - If Author has no `stripeConnectAccountId` → 400 (must complete Connect onboarding first)
   - Create new Stripe Price object (`unit_amount=priceCents`, `currency=usd`, `recurring.interval=month`) on Author's Connect account
   - Update Author profile: new `stripePriceId`, `authorSubscriptionPriceCents`
   - Archive old Stripe Price (if exists) — Stripe prices cannot be deleted, only archived
2. Price shown on public Author profile page as the subscription CTA (if non-null)
3. Platform revenue cut applied at checkout time via `application_fee_amount` (FR-SUB-06); cut % from SSM

**Error conditions**:
- `priceCents` < 100 or > 5000 → 400
- Author has no Connect account → 400
- Connect account `charges_enabled=false` → 400 (Stripe won't allow price creation)

**Tests to write**:
- Unit: price validation boundaries; null disables subscriptions
- Integration: set price → verify Stripe Price created; update price → old price archived, new price written to DynamoDB
