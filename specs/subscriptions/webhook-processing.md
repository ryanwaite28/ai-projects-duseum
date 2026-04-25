## Spec: Stripe Webhook Processing

**Status**: ✅ Implemented
**FR coverage**: FR-SUB-03, FR-SUB-13, FR-FEAT-17
**Relevant PROJECT.md sections**: 2.7, 2.11, 4.5, CLAUDE.md extra webhook events

**What this implements**: SQS-triggered Lambda handling all Stripe webhook events: subscription lifecycle, invoice events, Payment Intent events (weekly feature), account.updated (Connect); idempotency via DynamoDB table.

**Prerequisites**: SQS stripe webhook queue + idempotency DynamoDB table deployed; `upsertSubscription()` in shared repo; Stripe webhook secret in Secrets Manager; MiniStack running for integration tests

**Done when**:
- [ ] All 14 event types in the spec's event map handled correctly (verified by integration tests against MiniStack)
- [ ] Replayed event (existing idempotency record) → skipped with no state change, no `batchItemFailure`
- [ ] Invalid Stripe signature → `batchItemFailure`; malformed SQS body → `batchItemFailure`
- [ ] `account.updated` for unknown Connect account → graceful skip, idempotency record written, no failure
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/subscriptions-webhook/src/index.ts` — SQS handler; per-record processing loop
- `lambdas/subscriptions-webhook/src/handlers/account-events.ts` — `handleAccountUpdated()`
- `packages/shared/src/db/subscriptions.repository.ts` — `upsertSubscription()`
- `packages/shared/src/db/features.repository.ts` — `confirmWeeklyFeatureBooking()`, `cancelWeeklyFeatureBooking()`

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
3. Retrieve webhook secret from Secrets Manager; verify Stripe signature (`constructWebhookEvent`)
4. Check idempotency table — if `STRIPE#{eventId}` exists → skip (already processed)
5. Dispatch to event handler → on success → write idempotency record with 7-day TTL
6. Any unhandled error → add `messageId` to `batchItemFailures` (SQS retry)

**Error conditions**:
- Invalid Stripe signature → add to `batchItemFailures` (poison pill — retry won't help, but SQS will DLQ after max attempts)
- Malformed SQS body → `batchItemFailures`
- Missing `rawBody` field → `batchItemFailures`
- DynamoDB error mid-processing → `batchItemFailures` (SQS will retry idempotently)

**Tests to write**:
- Integration (MiniStack): all event types listed above; idempotency replay; invalid signature; malformed body; account.updated with known/unknown Connect account
