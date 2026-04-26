## Design: Notification Preferences Management

**Spec**: `specs/users/notification-preferences.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type NotificationPref = 'ALL_NEW_PIECES' | 'PUBLIC_ONLY' | 'NONE'

export type NotificationPreference = {
  viewerId: string
  authorId: string
  pref: NotificationPref
  updatedAt: string   // ISO 8601; set on every write
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| NotificationPreference | `USER#{viewerId}` | `NOTIF_PREF#AUTHOR#{authorId}` | `viewerId`, `authorId`, `pref`, `updatedAt` |
| ViewerProfile (global opt-out) | `USER#{userId}` | `PROFILE#VIEWER` | `notificationGlobalOptOut` (boolean), `defaultNotificationPref` |

Note: The data-model.md describes a separate `NOTIF#META` record for global opt-out. The implementation stores `notificationGlobalOptOut` and `defaultNotificationPref` on the `PROFILE#VIEWER` record instead.

### Function Signatures

```typescript
// packages/shared/src/db/notification-preferences.repository.ts
export const upsertPreference = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string,
  pref: NotificationPref,
  updatedAt?: string
): Promise<NotificationPreference>

export const getPreference = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string
): Promise<NotificationPreference | null>

export const listPreferencesByViewer = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  limit?: number,
  lastKey?: Record<string, unknown>
): Promise<ListPreferencesResult>

// lambdas/users/src/routes/update-notification-prefs.ts
export const updateNotificationPrefs = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/users/src/routes/unsubscribe.ts
export const unsubscribe = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2>
```

### Handler Boilerplate

```typescript
// PUT /users/me/notification-preferences — body shape
{
  globalOptOut?: boolean
  defaultPref?: 'ALL_NEW_PIECES' | 'PUBLIC_ONLY' | 'NONE'
  perAuthorOverrides?: Array<{ authorId: string; pref: NotificationPref }>
}

// GET /notifications/unsubscribe?token=... — public (no JWT)
// token verified via verifyUnsubscribeToken(token) → { viewerId, authorId }
```

### Implementation Steps

1. `PUT /users/me/notification-preferences`:
   - JWT required; validates body manually (no Zod — uses `isValidPref()` set check and `typeof` guard).
   - If `globalOptOut` or `defaultPref` present: calls `updateViewerProfile()` to patch `notificationGlobalOptOut` and/or `defaultNotificationPref` on the ViewerProfile record.
   - For each entry in `perAuthorOverrides`: calls `upsertPreference()` which does an unconditional PutCommand (creates or overwrites).
   - All writes parallelised via `Promise.all`.
   - Re-fetches ViewerProfile and all preference overrides after writes; returns fresh state.

2. `GET /notifications/unsubscribe?token=...` (public):
   - Extracts `token` from query string; throws `ValidationError` if absent.
   - Calls `verifyUnsubscribeToken(token)` from `@duseum/shared/src/auth/unsubscribe-token.ts` — HMAC verification + expiry check.
   - Calls `upsertPreference(docClient, viewerId, authorId, 'NONE')` — sets pref to NONE idempotently.
   - Fetches author displayName for the response message.
   - Returns 200 with human-readable message.

### Integration Test Fixtures

No dedicated integration test file found for notification preferences. The follow routes tests cover preference creation indirectly.

### Decisions & Constraints

- Global opt-out and default pref are stored on ViewerProfile (not a separate `NOTIF#META` record) — one fewer DynamoDB item per user.
- `upsertPreference` uses unconditional PutCommand — always overwrites. Callers can safely call multiple times.
- `verifyUnsubscribeToken` uses HMAC-SHA256 signed JWT; secret loaded from Secrets Manager at Lambda cold start (cached). Expired tokens are rejected with 400.
- Unsubscribe for a non-existent follow is a no-op (upsertPreference still writes a `NONE` preference record) — idempotent and safe.
- The unsubscribe endpoint is a `GET` with query string token (not `POST`) to support one-click email links without JavaScript.
