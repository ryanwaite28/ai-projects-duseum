## Design: Stripe Webhook Processing

**Spec**: `specs/subscriptions/webhook-processing.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// Internal to subscriptions-webhook-lambda/src/index.ts
type SqsMessageBody = {
  rawBody: string
  stripeSignature: string
}
```

### DynamoDB Record Shapes

| Record type | Table | PK | SK | Key attributes |
|---|---|---|---|---|
| Idempotency record | Idempotency | `{stripeEventId}` | `META` | `eventId`, `processedAt`, `ttl` (epoch + 48h) |
| Platform subscription | Main | `USER#{userId}` | `SUB#PLATFORM` | `status`, `currentPeriodEnd`, `updatedAt` |
| Author subscription | Main | `USER#{subscriberId}` | `SUB#AUTHOR#{authorId}` | `status`, `currentPeriodEnd`, `updatedAt` |
| AuthorProfile (cached) | Main | `USER#{userId}` | `PROFILE#AUTHOR` | `connectChargesEnabled` |
| Connect reverse-lookup (read) | Main | `CONNECT#{connectAccountId}` | `META` | `userId` |

### Function Signatures

```typescript
// lambdas/subscriptions-webhook/src/index.ts
export const handler = async (sqsEvent: SQSEvent): Promise<SQSBatchResponse>

// lambdas/subscriptions-webhook/src/handlers/account-events.ts
export const handleAccountUpdated = async (
  client: DynamoDBDocumentClient,
  stripeConnectAccountId: string,
  account: Account
): Promise<void>

// lambdas/subscriptions-webhook/src/handlers/subscription-events.ts
export const handleSubscriptionCreated = async (client, sub): Promise<void>
export const handleSubscriptionUpdated = async (client, sub): Promise<void>
export const handleSubscriptionDeleted = async (client, sub): Promise<void>
export const handleSubscriptionPaused  = async (client, sub): Promise<void>
export const handleSubscriptionResumed = async (client, sub): Promise<void>

// lambdas/subscriptions-webhook/src/handlers/invoice-events.ts
export const handleInvoicePaymentFailed    = async (client, invoice): Promise<void>
export const handleInvoicePaymentSucceeded = (invoice): void  // synchronous no-op

// lambdas/subscriptions-webhook/src/handlers/payment-intent-events.ts
export const handlePaymentIntentSucceeded = async (client, paymentIntent): Promise<void>
export const handlePaymentIntentFailed    = async (client, paymentIntent): Promise<void>

// packages/shared/src/db/idempotency.repository.ts
export const checkProcessed = async (client, eventId): Promise<boolean>
export const markProcessed  = async (client, eventId): Promise<void>
```

### Handler Boilerplate

```typescript
// SQS handler — batchSize: 1
export const handler = async (sqsEvent: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: Array<{ itemIdentifier: string }> = []

  for (const record of sqsEvent.Records) {
    const messageId = record.messageId
    try {
      const { rawBody, stripeSignature } = JSON.parse(record.body) as SqsMessageBody
      const webhookSecret = await getStripeWebhookSecret()
      const event = constructWebhookEvent(rawBody, stripeSignature, webhookSecret)
      const alreadyProcessed = await checkProcessed(docClient, event.id)
      if (alreadyProcessed) continue
      // switch(event.type) → handler dispatch
      await markProcessed(docClient, event.id)
    } catch (err) {
      // ConditionalCheckFailedException on markProcessed = concurrent duplicate → success
      batchItemFailures.push({ itemIdentifier: messageId })
    }
  }
  return { batchItemFailures }
}
```

### Implementation Steps

1. SQS event received (batchSize: 1 — one Stripe event per SQS message).
2. Per record:
   a. Parse `record.body` as `SqsMessageBody`; validate `rawBody` and `stripeSignature` present → `batchItemFailure` if missing.
   b. `getStripeWebhookSecret()` reads webhook signing secret from Secrets Manager.
   c. `constructWebhookEvent(rawBody, stripeSignature, webhookSecret)` verifies Stripe signature → `batchItemFailure` on invalid signature.
   d. `checkProcessed(docClient, event.id)` reads idempotency table → skip (no batchItemFailure) if already processed.
   e. Switch on `event.type` → dispatch to handler.
   f. After successful handler → `markProcessed(docClient, event.id)` writes idempotency record with 48-hour TTL.
   g. Any thrown error → `batchItemFailure` (SQS retries up to 3×, then DLQ).
3. `ConditionalCheckFailedException` on `markProcessed` = concurrent duplicate → treated as success (not a failure).

**Event handler map** (as implemented):

| Stripe event | Handler | Action |
|---|---|---|
| `customer.subscription.created` | `handleSubscriptionCreated` | `upsertSubscription()` → ACTIVE |
| `customer.subscription.updated` | `handleSubscriptionUpdated` | `upsertSubscription()` → map Stripe status |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` | `upsertSubscription()` → CANCELLED |
| `customer.subscription.paused` | `handleSubscriptionPaused` | `upsertSubscription()` → PAUSED |
| `customer.subscription.resumed` | `handleSubscriptionResumed` | `upsertSubscription()` → ACTIVE |
| `invoice.payment_failed` | `handleInvoicePaymentFailed` | `upsertSubscription()` → PAST_DUE |
| `invoice.payment_succeeded` | `handleInvoicePaymentSucceeded` | synchronous log, no-op |
| `payment_intent.succeeded` | `handlePaymentIntentSucceeded` | if `metadata.type=WEEKLY_FEATURE` → confirm booking |
| `payment_intent.payment_failed` | `handlePaymentIntentFailed` | if `metadata.type=WEEKLY_FEATURE` → cancel booking |
| `account.updated` | `handleAccountUpdated` | cache `connectChargesEnabled` on Author profile |
| `customer.subscription.trial_will_end` | noOp (info) | log + mark idempotency |
| `customer.subscription.pending_update_*` | noOp (info) | log + mark idempotency |
| `subscription_schedule.*` | noOp (info) | log + mark idempotency |
| unknown | noOp (warn) | warn log + mark idempotency |

### Integration Test Fixtures

Tests at `lambdas/subscriptions-webhook/src/__tests__/stripe-webhook.integration.test.ts`.

Uses MiniStack for real DynamoDB; Stripe and Secrets Manager mocked via `vi.mock('@duseum/shared')`.

Mock SQS event:
```typescript
makeSqsEvent([{ rawBody: JSON.stringify(makeStripeEvent('customer.subscription.created', makeSub())), stripeSignature: 'sig' }])
```

Assertions: idempotency record written; DynamoDB subscription record created with correct status.

### Decisions & Constraints

- `batchSize: 1` on SQS event source — one Stripe event per Lambda invocation. Eliminates partial-batch complexity and ensures per-event idempotency without batch context confusion.
- Idempotency TTL is 48 hours (not 7 days as spec says) — covers Stripe's retry window (typically 24h) with buffer.
- `ConditionalCheckFailedException` from `markProcessed` is swallowed as success — two concurrent Lambda invocations for the same event (rare but possible during SQS deduplication window) will both succeed without producing an error.
- `noOp` helper marks idempotency before returning — unknown events are deduped so a Stripe retry doesn't cause repeated warn logs.
- `event.account` (not `event.data.object.id`) used as the Connect account ID for `account.updated` — correct Stripe webhook structure.
- Webhook secret fetched per invocation from Secrets Manager (cold-start cached by AWS Lambda power tools or SDK caching).
