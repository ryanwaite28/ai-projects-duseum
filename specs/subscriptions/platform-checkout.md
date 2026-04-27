## Spec: Platform Subscription Checkout

**Status**: ✅ Implemented
**FR coverage**: FR-SUB-01, FR-SUB-03, FR-SUB-09, FR-SUB-10
**Relevant PROJECT.md sections**: 2.7, 4.2, 4.5, 8

**What this implements**: Stripe Billing checkout session creation for the Platform Subscription (flat monthly fee); subscription state storage in DynamoDB; Stripe Billing Portal for self-service management; free-tier limit configuration.

**Prerequisites**: Stripe secret key in Secrets Manager; SSM config param `/duseum/{env}/config/platform_subscription_price_id` seeded; `subscriptions-lambda` deployed; DynamoDB main table deployed

**Done when**:
- [ ] `POST /subscriptions/platform/checkout` creates Stripe Checkout Session using price ID from SSM (not hardcoded); returns `{ checkoutUrl }`
- [ ] `stripeCustomerId` stored on User META record after first checkout
- [ ] `POST /subscriptions/portal` returns 400 when no `stripeCustomerId` on user
- [ ] `GET /subscriptions/status` reads `SUB#PLATFORM` + all `SUB#AUTHOR#*` records from DynamoDB
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/subscriptions/src/routes/create-platform-checkout.ts` — `POST /subscriptions/platform/checkout`
- `lambdas/subscriptions/src/routes/billing-portal.ts` — `POST /subscriptions/portal`
- `lambdas/subscriptions/src/routes/get-subscription-status.ts` — `GET /subscriptions/status`
- `packages/shared/src/db/subscriptions.repository.ts` — `upsertSubscription()`, `getSubscription()`

**DynamoDB access patterns used**:
- Platform subscription: `PK=USER#{userId}, SK=SUB#PLATFORM`
- Subscription status values: `ACTIVE`, `PAST_DUE`, `CANCELLED`, `PAUSED`

**Business logic**:
1. `POST /subscriptions/platform/checkout`:
   - Resolve Stripe price ID from platform config (SSM param, not hardcoded)
   - Create Stripe `Customer` for user (or retrieve existing via `stripeCustomerId` on User record)
   - Create Stripe Checkout Session with `mode=subscription`, `priceId`, `success_url`, `cancel_url`
   - Store `stripeCustomerId` on User META record
   - Return: `{ checkoutUrl }`
2. `POST /subscriptions/portal`:
   - Requires active `stripeCustomerId` on user
   - Create Stripe Billing Portal Session
   - Return: `{ portalUrl }`
3. `GET /subscriptions/status`:
   - Read `SUB#PLATFORM` from DynamoDB; return status + periodEnd
   - Read all `SUB#AUTHOR#{authorId}` records for Author subscriptions
4. Free-tier limit: read from SSM `/duseum/{env}/config/free_tier_piece_limit`; not stored in code

**Error conditions**:
- `POST /subscriptions/portal` with no `stripeCustomerId` → 400
- Platform price ID not configured in SSM → 500 (infrastructure misconfiguration)

**Tests to write**:
- Unit: none (Stripe calls mocked in integration)
- Integration: create checkout session → verify Stripe mock called with correct priceId; verify response contains `checkoutUrl`
