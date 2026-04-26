## Design: Author Subscription Checkout

**Spec**: `specs/subscriptions/author-checkout.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type Subscription = {
  userId: string
  targetId: 'PLATFORM' | string   // authorId for Author subscriptions
  stripeSubscriptionId: string
  stripeCustomerId: string
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE' | 'PAUSED'
  currentPeriodEnd: string
  createdAt: string
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| Author subscription | `USER#{subscriberId}` | `SUB#AUTHOR#{authorId}` | `userId`, `targetId=authorId`, `stripeSubscriptionId`, `stripeCustomerId`, `status`, `currentPeriodEnd`, `createdAt` |
| AuthorProfile (read) | `USER#{authorId}` | `PROFILE#AUTHOR` | `stripeConnectAccountId`, `authorSubscriptionPriceId` |

### Function Signatures

```typescript
// lambdas/subscriptions/src/routes/create-author-checkout.ts
export const createAuthorCheckout = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2>

// packages/shared/src/db/subscriptions.repository.ts
export const getAuthorSubscription = async (client, userId, authorId): Promise<Subscription | null>
export const upsertSubscription = async (client, sub: Subscription): Promise<void>
```

### Handler Boilerplate

```typescript
// POST /subscriptions/authors/{authorId}
export const createAuthorCheckout = async (_event, context, authorId) => {
  const authorProfile = await getAuthorProfile(docClient, authorId)
  // validate: ACTIVE Author, has connectAccountId, has priceId
  const existing = await getAuthorSubscription(docClient, userId, authorId)
  if (existing?.status === 'ACTIVE') throw new ConflictError(...)
  const customerId = await getOrCreateStripeCustomer(docClient, userId)
  const cutPct = parseFloat(await getConfigValue(docClient, 'PLATFORM_CUT_PERCENT') ?? '20')
  const session = await createCheckoutSession({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: authorProfile.authorSubscriptionPriceId, quantity: 1 }],
    subscription_data: {
      application_fee_percent: cutPct,
      transfer_data: { destination: authorProfile.stripeConnectAccountId },
      metadata: { userId, authorId, type: 'AUTHOR_SUB' },
    },
    ...
  })
  return ok({ checkoutUrl: session.url })
}
```

### Implementation Steps

1. JWT required.
2. `getAuthorProfile(docClient, authorId)` fetches target Author; 404 if not ACTIVE.
3. Validates `stripeConnectAccountId` present; throws `ValidationError` 400 if absent.
4. Validates `authorSubscriptionPriceId` present (Author has set a price); throws `ValidationError` 400 if absent.
5. `getAuthorSubscription(docClient, userId, authorId)` checks for existing subscription; throws `ConflictError` 409 if ACTIVE.
6. `getOrCreateStripeCustomer()` resolves Stripe Customer for subscriber.
7. Platform cut `PLATFORM_CUT_PERCENT` read from config table; defaults to 20 if not found.
8. `createCheckoutSession()` creates Stripe Checkout Session with:
   - `application_fee_percent: cutPct` on `subscription_data` — platform takes a percentage of each payment.
   - `transfer_data.destination: stripeConnectAccountId` — Author receives remainder.
   - `metadata` on both Session and `subscription_data` — propagated for webhook resolution.
9. Returns `{ checkoutUrl: session.url }`.
10. Access grant happens asynchronously in `subscriptions-webhook-lambda` on `customer.subscription.created` event.

### Integration Test Fixtures

Tests at `lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts`.

Seed: Author profile with `stripeConnectAccountId` and `authorSubscriptionPriceId` set. Mock Stripe `createCheckoutSession`.
Assert: response contains `checkoutUrl`; Stripe mock called with correct `application_fee_percent` and `transfer_data.destination`.

### Decisions & Constraints

- Platform cut uses `application_fee_percent` (not `application_fee_amount`) — percentage-based so it scales with the subscription price automatically.
- `success_url` uses `APP_BASE_URL/subscription/success?session_id={CHECKOUT_SESSION_ID}` — `{CHECKOUT_SESSION_ID}` is a Stripe template variable, not a JS template literal.
- `cancel_url` for author checkout uses `APP_BASE_URL/authors/${authorId}` — returns user to the Author's public profile page.
- Access is NOT immediately granted at checkout time — the `subscriptions-webhook-lambda` handles `customer.subscription.created` and writes `SUB#AUTHOR#{authorId}` with status ACTIVE. This ensures access is only granted after Stripe confirms payment.
- `connectChargesEnabled` is NOT re-checked here (only checked at price-setting time) — if an Author's account was previously valid and later became invalid, it will fail at Stripe's level during session creation.
