## Spec: Author Subscription Checkout

**Status**: ✅ Implemented
**FR coverage**: FR-SUB-02, FR-SUB-04, FR-SUB-05, FR-SUB-06
**Relevant PROJECT.md sections**: 2.7, 4.2, 8

**What this implements**: Stripe Billing checkout for per-Author subscriptions; platform revenue cut via Stripe Connect application fee; immediate access grant on subscription creation; access revocation on failure/cancellation.

**Prerequisites**: `subscriptions/connect-onboarding.md` complete; Author has `connectChargesEnabled=true` and `stripePriceId` set; SSM param `/duseum/{env}/config/author_revenue_cut_percent` seeded

**Done when**:
- [ ] `POST /subscriptions/author/{authorId}/checkout` includes `application_fee_amount` = price × cut% in Stripe session
- [ ] Author's `stripeConnectAccountId` used as `transfer_data.destination`
- [ ] Author with no Connect account or `connectChargesEnabled=false` → 400
- [ ] Viewer already has ACTIVE Author subscription → 409
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/subscriptions/src/routes/create-author-checkout.ts` — `POST /subscriptions/author/{authorId}/checkout`
- `packages/shared/src/db/subscriptions.repository.ts` — `upsertSubscription()` with AUTHOR type

**DynamoDB access patterns used**:
- Author subscription: `PK=USER#{userId}, SK=SUB#AUTHOR#{authorId}` — status: `ACTIVE`|`PAST_DUE`|`CANCELLED`|`PAUSED`
- Author profile (get stripeConnectAccountId): `PK=USER#{authorId}, SK=PROFILE#AUTHOR`

**Business logic**:
1. `POST /subscriptions/author/{authorId}/checkout`:
   - Verify authenticated Viewer
   - Get Author profile → `stripeConnectAccountId` + `stripePriceId` (Author's subscription price)
   - Verify Author has `stripeConnectAccountId` and `connectChargesEnabled=true` (FR-SUB-07)
   - Create Stripe Checkout Session with:
     - `mode=subscription`
     - `payment_intent_data.application_fee_amount` = price × platform cut % (read from SSM)
     - `payment_intent_data.transfer_data.destination` = Author's `stripeConnectAccountId`
   - Return: `{ checkoutUrl }`
2. Access grant: handled by `subscriptions-webhook-lambda` on `customer.subscription.created` event — writes `SUB#AUTHOR#{authorId}` with status=`ACTIVE`
3. Access revocation: on `customer.subscription.deleted` or `invoice.payment_failed` — webhook updates status to `CANCELLED`/`PAST_DUE`; Stripe handles grace period billing cycle

**Error conditions**:
- Author has no `stripeConnectAccountId` → 400 (`Author subscriptions not enabled`)
- Author `connectChargesEnabled=false` → 400 (`Author account not ready to accept payments`)
- Viewer already has ACTIVE Author subscription → 409

**Tests to write**:
- Unit: application fee calculation at different platform cut percentages
- Integration: create checkout session → verify correct `application_fee_amount`; verify Author's Connect account used as transfer destination
