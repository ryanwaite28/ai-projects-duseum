## Design: Author Subscription Price Management

**Spec**: `specs/subscriptions/subscription-price.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts — relevant AuthorProfile fields
export type AuthorProfile = {
  authorSubscriptionPriceId: string | null    // Stripe Price ID
  authorSubscriptionMonthlyUsd: number | null  // display price in USD (integer)
  stripeConnectAccountId: string | null
  connectChargesEnabled: boolean | null
  // ...
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes written |
|---|---|---|---|
| AuthorProfile (update) | `USER#{userId}` | `PROFILE#AUTHOR` | `authorSubscriptionPriceId`, `authorSubscriptionMonthlyUsd`, `updatedAt` |

### Function Signatures

```typescript
// lambdas/subscriptions/src/routes/set-subscription-price.ts
export const setSubscriptionPrice = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// packages/shared/src/stripe/index.ts
export const createConnectPrice = async (
  params: { unit_amount: number; currency: string; recurring: { interval: string }; product_data: { name: string } },
  connectAccountId: string
): Promise<StripePrice>

export const retrieveConnectAccount = async (accountId: string): Promise<StripeAccount>
```

### Handler Boilerplate

```typescript
// POST /users/me/author/subscription-price
type Body = { amountUsd: number }

export const setSubscriptionPrice = async (event, context) => {
  const { amountUsd } = JSON.parse(event.body ?? '{}') as Body
  // Validate: non-negative integer, max 50
  // amountUsd === 0 → disable (set null, no Stripe call)
  // amountUsd 1–50 → create Stripe Price on Connect account
  const price = await createConnectPrice({ unit_amount: amountUsd * 100, currency: 'usd', recurring: { interval: 'month' }, product_data: { name: 'Author Subscription' } }, author.stripeConnectAccountId)
  await updateAuthorProfile(docClient, userId, { authorSubscriptionPriceId: price.id, authorSubscriptionMonthlyUsd: amountUsd })
  return ok({ priceId: price.id, monthlyUsd: amountUsd })
}
```

### Implementation Steps

1. `POST /users/me/author/subscription-price` (JWT required — Author only):
   - Body: `{ amountUsd: number }`.
   - Validates `amountUsd` is a non-negative integer, max 50; throws `ValidationError`.
   - `getAuthorProfile()` to get current profile; 404 if not found.
   - **Disable path** (`amountUsd === 0`): `updateAuthorProfile()` sets both fields to null; returns `{ priceId: null, monthlyUsd: null }`. No Stripe API call.
   - **Enable/update path** (`amountUsd 1–50`):
     - Validates `stripeConnectAccountId` present.
     - `retrieveConnectAccount()` to verify `charges_enabled = true`; throws `ValidationError` if not.
     - `createConnectPrice()` creates new Stripe Price (`unit_amount = amountUsd * 100`, `recurring.interval = 'month'`).
     - `updateAuthorProfile()` writes new `authorSubscriptionPriceId` and `authorSubscriptionMonthlyUsd`.
     - Returns `{ priceId: price.id, monthlyUsd: amountUsd }`.

### Integration Test Fixtures

Tests at `lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts`.

Seed: Author profile with `stripeConnectAccountId` set. Mock `createConnectPrice` and `retrieveConnectAccount`.
Assert: `POST /users/me/author/subscription-price` with `{ amountUsd: 10 }` returns `{ priceId: 'price_...', monthlyUsd: 10 }`; Author profile updated in DynamoDB.

### Decisions & Constraints

- Route path is `POST /users/me/author/subscription-price` (in subscriptions-lambda, not users-lambda) — wired to `subscriptions-lambda` because it requires Stripe API access (Secrets Manager permission on subscriptions-lambda IAM role).
- Old Stripe Price is NOT archived when price is updated (spec required archiving via `prices.update({ active: false })`). This is a known gap in v1 — old prices remain active in Stripe but are no longer referenced by Duseum. Subscribers on old prices continue on the old price until they cancel/resubscribe.
- `amountUsd` is stored as a USD integer (not cents) — conversion to cents done at Stripe API call time (`amountUsd * 100`). This avoids off-by-100 errors in the UI which shows USD not cents.
- `charges_enabled` is verified live at price-set time (not using cached DynamoDB value) — ensures the Stripe account is actually ready before creating a price that would fail at checkout.
- Route registered at `POST /users/me/author/subscription-price` in the subscriptions-lambda router (not under `/subscriptions/*`), which means the path does not match the `/subscriptions/` prefix — this is the actual route key registered in API Gateway.
