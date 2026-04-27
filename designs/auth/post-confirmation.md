## Design: Post-Confirmation Trigger — Viewer Profile Auto-Creation

**Spec**: `specs/auth/post-confirmation.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type UserAccount = {
  userId: string
  email: string
  systemRole: 'USER' | 'ADMIN'
  emailVerified: boolean
  createdAt: string
  lastLoginAt: string
}

export type ViewerProfile = {
  userId: string
  profileType: 'VIEWER'
  status: 'ACTIVE' | 'SUSPENDED'
  displayName: string
  createdAt: string
  notificationGlobalOptOut: boolean
  defaultNotificationPref: NotificationPref  // 'ALL_NEW_PIECES' | 'PUBLIC_ONLY' | 'NONE'
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| UserAccount | `USER#{userId}` | `PROFILE` | `userId`, `email`, `systemRole='USER'`, `emailVerified=true`, `createdAt`, `lastLoginAt` |
| ViewerProfile | `USER#{userId}` | `PROFILE#VIEWER` | `userId`, `profileType='VIEWER'`, `status='ACTIVE'`, `displayName` (from email prefix), `createdAt`, `notificationGlobalOptOut=false`, `defaultNotificationPref='ALL_NEW_PIECES'` |

Note: UserAccount SK is `PROFILE` in the actual code, not `META` as documented in data-model.md.

### Function Signatures

```typescript
// lambdas/auth-triggers/src/handler.ts
export const handler: PostConfirmationTriggerHandler

// packages/shared/src/db/users.repository.ts
export const createUserAccount = async (
  client: DynamoDBDocumentClient,
  account: UserAccount
): Promise<void>

export const createViewerProfile = async (
  client: DynamoDBDocumentClient,
  profile: ViewerProfile
): Promise<void>
```

### Handler Boilerplate

```typescript
// lambdas/auth-triggers/src/handler.ts
import type { PostConfirmationTriggerHandler } from 'aws-lambda'
import { docClient, logger, createUserAccount, createViewerProfile } from '@duseum/shared'

export const handler: PostConfirmationTriggerHandler = async (event) => {
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event
  // ... create UserAccount and ViewerProfile ...
  return event  // Cognito contract: return event unchanged
}
```

### Implementation Steps

1. Cognito fires `PostConfirmation_ConfirmSignUp` trigger after email verification.
2. Handler checks `event.triggerSource` — non-signup confirmations (e.g., password reset) return early without writing records.
3. `userId = event.userName` (Cognito sub/UUID); `email` extracted from `event.request.userAttributes['email']`.
4. `displayName` derived from the email prefix (`email.split('@')[0]`).
5. `createUserAccount()` calls `PutCommand` with `ConditionExpression: 'attribute_not_exists(PK)'`; `ConditionalCheckFailedException` is caught and swallowed silently (idempotency).
6. `createViewerProfile()` does the same — second trigger fire is a no-op.
7. Handler returns `event` unchanged (Cognito contract).
8. On DynamoDB write failure (other than conditional check): error is re-thrown; Cognito retries trigger up to 3×.

### Integration Test Fixtures

Integration test at `lambdas/auth-triggers/src/handler.integration.test.ts`.

Seed: no pre-existing items needed. Event shape:
```typescript
{
  triggerSource: 'PostConfirmation_ConfirmSignUp',
  userName: 'user-uuid-001',
  request: { userAttributes: { email: 'test@example.com' } }
}
```
Assertions: DynamoDB items at `PK=USER#user-uuid-001, SK=PROFILE` and `PK=USER#user-uuid-001, SK=PROFILE#VIEWER` exist with correct attributes.

### Decisions & Constraints

- `ConditionExpression: 'attribute_not_exists(PK)'` on both writes guarantees idempotency — duplicate trigger fires are silent no-ops.
- Email is stored only in DynamoDB; it is never logged (PII logging rule from Section 13.2).
- `displayName` seeded from email prefix at creation time; user can update it via `PUT /users/me/viewer`.
- Both writes happen sequentially (not in parallel) to ensure UserAccount exists before ViewerProfile.
- The trigger Lambda has only `grantWriteData` on the main table (PutItem only) — no read or delete access.
