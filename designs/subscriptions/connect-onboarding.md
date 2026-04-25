## Design: Stripe Connect Express Onboarding

**Spec**: `specs/subscriptions/connect-onboarding.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts — relevant fields on AuthorProfile
export type AuthorProfile = {
  userId: string
  stripeConnectAccountId: string | null
  connectChargesEnabled: boolean | null   // cached from account.updated webhook
  // ...
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| AuthorProfile (write) | `USER#{userId}` | `PROFILE#AUTHOR` | `stripeConnectAccountId`, `connectChargesEnabled` |
| Connect reverse-lookup | `CONNECT#{stripeConnectAccountId}` | `META` | `userId`, `createdAt` |

### Function Signatures

```typescript
// lambdas/subscriptions/src/routes/connect-onboard.ts
export const connectOnboard = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/subscriptions/src/routes/connect-status.ts
export const connectStatus = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// packages/shared/src/stripe/index.ts (imported in routes)
export const createConnectAccount = async (params): Promise<StripeAccount>
export const createAccountLink = async (params): Promise<StripeAccountLink>
export const retrieveConnectAccount = async (accountId): Promise<StripeAccount>
```

### Handler Boilerplate

```typescript
// POST /subscriptions/connect/onboard
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://duseum.com'

export const connectOnboard = async (_event, context) => {
  const author = await getAuthorProfile(docClient, userId)
  let connectAccountId = author.stripeConnectAccountId

  if (!connectAccountId) {
    const account = await createConnectAccount({ type: 'express' })
    connectAccountId = account.id
    await Promise.all([
      updateAuthorProfile(docClient, userId, { stripeConnectAccountId: connectAccountId }),
      docClient.send(new PutCommand({ TableName, Item: { PK: `CONNECT#${connectAccountId}`, SK: 'META', userId, createdAt: now }, ConditionExpression: 'attribute_not_exists(PK)' }))
        .catch(err => { if (err.name === 'ConditionalCheckFailedException') return; throw err })
    ])
  }

  const link = await createAccountLink({ account: connectAccountId, type: 'account_onboarding', refresh_url, return_url })
  return ok({ accountLinkUrl: link.url })
}
```

### Implementation Steps

1. `POST /subscriptions/connect/onboard`:
   - JWT required; Author profile must exist.
   - Checks Author status; throws `ValidationError` if SUSPENDED or DEACTIVATED.
   - If `stripeConnectAccountId` is null: creates new Stripe Connect Express account.
   - Writes `stripeConnectAccountId` to Author profile AND writes `CONNECT#{id}/META` reverse-lookup record in parallel.
   - Reverse-lookup `ConditionExpression: 'attribute_not_exists(PK)'` — no-ops silently on duplicate (e.g., if a previous onboard write partially succeeded).
   - Creates Stripe Account Link with `type: 'account_onboarding'`, `return_url`, `refresh_url` using `APP_BASE_URL`.
   - Returns `{ accountLinkUrl: link.url }`.

2. `GET /subscriptions/connect/status`:
   - JWT required; Author profile must exist.
   - Throws `ValidationError` if no `stripeConnectAccountId`.
   - Cache hit path: if `connectChargesEnabled !== null && !== undefined` → return cached value immediately (no Stripe API call).
   - Cache miss path: calls `retrieveConnectAccount()` → backfills `connectChargesEnabled` via `updateAuthorProfile()` (fire-and-forget `.catch(() => {})`) → returns live Stripe values.
   - Known issue: `detailsSubmitted` returns `author.connectChargesEnabled` from cache (same field) instead of the separate `account.details_submitted` — acceptable for v1 since charges_enabled implies details_submitted.

### Integration Test Fixtures

Tests at `lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts`.

Seed: Author profile with `stripeConnectAccountId: null`. Mock Stripe `createConnectAccount` and `createAccountLink`.
Assert: Author profile updated with `stripeConnectAccountId`; `CONNECT#{id}/META` record written; response contains `accountLinkUrl`.

### Decisions & Constraints

- Parallel write of Author profile + reverse-lookup: if the Author profile update succeeds but the reverse-lookup write fails (and vice versa), the system is inconsistent. The `ConditionalCheckFailedException` swallow on the reverse-lookup prevents re-throw on duplicate (idempotent retry safety), but does not address partial failure. This is an acceptable v1 risk.
- `return_url = APP_BASE_URL + /dashboard/author?connect=return` — frontend reads `?connect=return` query param to show a success notification and invalidate the connect-status query cache.
- `refresh_url = APP_BASE_URL + /dashboard/author?connect=refresh` — frontend reads `?connect=refresh` and auto-calls `POST /subscriptions/connect/onboard` to get a new link.
- Connect account type is `'express'` (not `'standard'` or `'custom'`) — Express provides a Stripe-hosted onboarding UI with Duseum receiving full platform control.
- `connectChargesEnabled` cached via `account.updated` webhook → `handleAccountUpdated()` — enables status endpoint to skip live Stripe API calls on most requests.
