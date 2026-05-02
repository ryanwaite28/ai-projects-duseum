## Spec: Stripe Webhook Processing

**Status**: ✅ Implemented
**FR coverage**: FR-SUB-03, FR-SUB-13, FR-FEAT-17
**Relevant PROJECT.md sections**: 2.7, 2.11, 4.5, CLAUDE.md extra webhook events

**What this implements**: SQS-triggered Lambda handling all Stripe webhook events: subscription lifecycle, invoice events, Payment Intent events (weekly feature), account.updated (Connect); idempotency via DynamoDB table.

**Prerequisites**: SQS stripe webhook queue + idempotency DynamoDB table deployed; `upsertSubscription()` in shared repo; **two** Stripe webhook secrets in Secrets Manager (`webhook-secret` Connect + `webhook-secret-account` Account); MiniStack running for integration tests

**Done when**:
- [x] All event types in the spec's event map handled correctly (verified by integration tests against MiniStack)
- [x] Replayed event (existing idempotency record) → skipped with no state change, no `batchItemFailure`
- [x] Invalid Stripe signature → `batchItemFailure`; malformed SQS body → `batchItemFailure`
- [x] `account.updated` for unknown Connect account → graceful skip, idempotency record written, no failure
- [x] `customer.subscription.created` with `current_period_end: null` in `items.data[0]` → subscription record written with `currentPeriodEnd: null`; no crash (regression for Stripe API `2026-03-25.dahlia`)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/subscriptions-webhook/src/index.ts` — SQS handler; per-record processing loop
- `lambdas/subscriptions-webhook/src/handlers/account-events.ts` — `handleAccountUpdated()`
- `lambdas/subscriptions-webhook/src/handlers/subscription-events.ts` — `StripeSubscription` type updated for Stripe API `2026-03-25.dahlia`; `buildRecord` reads `current_period_end` from `items.data[0]`
- `packages/shared/src/db/subscriptions.repository.ts` — `upsertSubscription()`
- `packages/shared/src/db/features.repository.ts` — `confirmWeeklyFeatureBooking()`, `cancelWeeklyFeatureBooking()`
- `packages/shared/src/types/index.ts` — `Subscription.currentPeriodEnd: string | null`
- `frontend/src/services/subscriptions.service.ts` — `currentPeriodEnd: string | null` in both interfaces
- `frontend/src/pages/dashboard/viewer.tsx` — null guard on `currentPeriodEnd`
- `frontend/src/pages/dashboard/tabs/subscribers-tab.tsx` — null guard on `currentPeriodEnd`

**DynamoDB access patterns used**:
- Idempotency: `PK=STRIPE#{eventId}` in idempotency table; TTL = 7 days
- Subscription: `PK=USER#{userId}, SK=SUB#PLATFORM` or `SUB#AUTHOR#{authorId}`
- Weekly feature booking: `PK=FEATURE#WEEK#{isoWeek}, SK=AUTHOR#{authorId}`
- Connect reverse-lookup: `PK=CONNECT#{stripeConnectAccountId}, SK=META`

**Event handler map**:
| Stripe event | Action |
|---|---|
| `customer.subscription.created` | `upsertSubscription()` → status `ACTIVE` |
| `customer.subscription.updated` | `upsertSubscription()` → map Stripe status to Duseum status |
| `customer.subscription.deleted` | `upsertSubscription()` → status `CANCELLED` |
| `customer.subscription.paused` | `upsertSubscription()` → status `PAUSED` |
| `customer.subscription.resumed` | `upsertSubscription()` → status `ACTIVE` |
| `invoice.payment_failed` | `upsertSubscription()` → status `PAST_DUE` |
| `invoice.payment_succeeded` | mark idempotency, no-op |
| `payment_intent.succeeded` | if `metadata.type=WEEKLY_FEATURE` → `confirmWeeklyFeatureBooking()` |
| `payment_intent.payment_failed` | if `metadata.type=WEEKLY_FEATURE` → `cancelWeeklyFeatureBooking()` |
| `account.updated` | `handleAccountUpdated()` → cache `connectChargesEnabled` on Author |
| `subscription_schedule.*` | mark idempotency, log, no-op |
| `customer.subscription.trial_will_end` | mark idempotency, log, no-op |
| unknown | mark idempotency, warn log, no-op |

**Business logic**:
1. SQS handler loops over `event.Records`; each record processed independently (partial batch failure)
2. Per record: parse SQS body → extract `rawBody` + `stripeSignature`
3. Verify Stripe signature — try Account webhook secret (`webhook-secret-account`) first; on `StripeSignatureVerificationError` fall back to Connect webhook secret (`webhook-secret`). Both secrets cached module-level. Second failure → `batchItemFailure` (poison pill).
4. Check idempotency table — if `STRIPE#{eventId}` exists → skip (already processed)
5. Dispatch to event handler → on success → write idempotency record with 7-day TTL
6. Any unhandled error → add `messageId` to `batchItemFailures` (SQS retry)

**Stripe API `2026-03-25.dahlia` field change — `current_period_end`**:
In this API version, `current_period_end` was removed from the subscription root object and moved into each `items.data[]` entry. The `StripeSubscription` local type reflects this. `buildRecord` reads `sub.items.data[0]?.current_period_end ?? null`; if absent, stores `currentPeriodEnd: null`. The subsequent `customer.subscription.updated` event (fires seconds later when payment clears) carries the real value and overwrites it. `Subscription.currentPeriodEnd` is typed `string | null` to accommodate this brief null state. All frontend render sites that display `currentPeriodEnd` must guard for `null`.

**Error conditions**:
- Invalid Stripe signature → add to `batchItemFailures` (poison pill — retry won't help, but SQS will DLQ after max attempts)
- Malformed SQS body → `batchItemFailures`
- Missing `rawBody` field → `batchItemFailures`
- DynamoDB error mid-processing → `batchItemFailures` (SQS will retry idempotently)

**Tests to write**:
- Integration (MiniStack): all event types listed above; idempotency replay; invalid signature; malformed body; account.updated with known/unknown Connect account
