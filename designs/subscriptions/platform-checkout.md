## Design: Platform Subscription Checkout

**Spec**: `specs/subscriptions/platform-checkout.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type Subscription = {
  userId: string
  targetId: 'PLATFORM' | string   // 'PLATFORM' or authorId
  stripeSubscriptionId: string
  stripeCustomerId: string
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE' | 'PAUSED'
  currentPeriodEnd: string         // ISO 8601
  createdAt: string
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| Platform subscription | `USER#{userId}` | `SUB#PLATFORM` | `userId`, `targetId='PLATFORM'`, `stripeSubscriptionId`, `stripeCustomerId`, `status`, `currentPeriodEnd`, `createdAt` |

### Function Signatures

```typescript
// lambdas/subscriptions/src/routes/create-platform-checkout.ts
export const createPlatformCheckout = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/subscriptions/src/routes/create-portal-session.ts
export const createPortalSession = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/subscriptions/src/routes/get-my-subscriptions.ts
export const getMySubscriptions = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// packages/shared/src/db/subscriptions.repository.ts
export const getPlatformSubscription = async (client, userId): Promise<Subscription | null>
export const getOrCreateStripeCustomer = async (client, userId): Promise<string>
export const upsertSubscription = async (client, sub: Subscription): Promise<void>
```

### Handler Boilerplate

```typescript
// subscriptions-lambda — middy stack
export const handler = middy<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Error, DuseumContext>()
  .use(loggerMiddleware())
  .use(cognitoAuthMiddleware())
  .use(errorHandlerMiddleware())
  .handler(dispatch)

// Route dispatch
if (method === 'POST' && path.endsWith('/platform')) return createPlatformCheckout(event, context)
if (method === 'POST' && path.endsWith('/portal'))   return createPortalSession(event, context)
if (method === 'GET'  && path.endsWith('/me'))        return getMySubscriptions(event, context)
```

### Implementation Steps

1. `POST /subscriptions/platform`:
   - JWT required.
   - `getPlatformSubscription()` checks for existing ACTIVE subscription → `ConflictError` 409 if found.
   - `getConfigValue(docClient, 'PLATFORM_SUB_PRICE_ID')` reads platform price ID from config table.
   - `getOrCreateStripeCustomer()` creates or retrieves Stripe Customer linked to userId; stores `stripeCustomerId` on User record.
   - `createCheckoutSession()` creates Stripe Checkout Session:
     - `mode: 'subscription'`
     - `line_items: [{ price: priceId, quantity: 1 }]`
     - `subscription_data.metadata: { userId, type: 'PLATFORM' }` — propagated to Subscription, available in webhook events
     - `success_url`, `cancel_url` use `APP_BASE_URL` env var (not hardcoded)
   - Returns `{ checkoutUrl: session.url }`.

2. `POST /subscriptions/portal`:
   - JWT required.
   - Fetches user record; requires `stripeCustomerId` present → `ValidationError` 400 if absent.
   - Creates Stripe Billing Portal Session; returns `{ portalUrl }`.

3. `GET /subscriptions/me`:
   - JWT required.
   - Reads `SUB#PLATFORM` + queries all `SUB#AUTHOR#*` records for the userId.
   - Returns all subscriptions with statuses.

### Integration Test Fixtures

Tests at `lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts`.

Seed: User account + Viewer profile at standard keys. Mock Stripe SDK.
Assert: `POST /subscriptions/platform` returns `{ checkoutUrl: '...' }` with non-null URL.

### Decisions & Constraints

- `APP_BASE_URL` is read from `process.env.APP_BASE_URL ?? 'https://duseum.com'` — env var injected by CDK from `commonEnv`. The fallback `'https://duseum.com'` is a known gap (api-stack spec notes `APP_BASE_URL` was missing from `commonEnv`; it was subsequently added).
- Platform price ID read from config table (not SSM or hardcoded) — allows runtime price ID changes without Lambda redeployment.
- `subscription_data.metadata` on the Checkout Session propagates to the Stripe Subscription object — critical for webhook handlers to resolve `userId` from `customer.subscription.*` events.
- `getOrCreateStripeCustomer` idempotent — checks `stripeCustomerId` on user record before creating a new Stripe Customer to avoid duplicates.
