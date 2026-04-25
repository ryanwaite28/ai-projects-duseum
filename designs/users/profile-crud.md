## Design: User & Viewer Profile CRUD

**Spec**: `specs/users/profile-crud.md`
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

export type NotificationPref = 'ALL_NEW_PIECES' | 'PUBLIC_ONLY' | 'NONE'

export type ViewerProfile = {
  userId: string
  profileType: 'VIEWER'
  status: 'ACTIVE' | 'SUSPENDED'
  displayName: string
  createdAt: string
  notificationGlobalOptOut: boolean
  defaultNotificationPref: NotificationPref
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| UserAccount | `USER#{userId}` | `PROFILE` | `userId`, `email`, `systemRole`, `emailVerified`, `createdAt`, `lastLoginAt` |
| ViewerProfile | `USER#{userId}` | `PROFILE#VIEWER` | `userId`, `profileType`, `status`, `displayName`, `createdAt`, `notificationGlobalOptOut`, `defaultNotificationPref` |
| AuthorProfile | `USER#{userId}` | `PROFILE#AUTHOR` | (read-only in this spec) |

### Function Signatures

```typescript
// packages/shared/src/db/users.repository.ts

export const getUserAccount = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<UserAccount | null>

export const getViewerProfile = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<ViewerProfile | null>

export type UpdateViewerProfileInput = {
  displayName?: string
  notificationGlobalOptOut?: boolean
  defaultNotificationPref?: NotificationPref
}

export const updateViewerProfile = async (
  client: DynamoDBDocumentClient,
  userId: string,
  patch: UpdateViewerProfileInput
): Promise<ViewerProfile>

// lambdas/users/src/routes/get-me.ts
export const getMe = async (context: DuseumContext): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/users/src/routes/update-viewer.ts
export const updateViewer = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/users/src/routes/get-user-profile.ts
export const getUserProfile = (userId: string) => Promise<APIGatewayProxyStructuredResultV2>
```

### Handler Boilerplate

```typescript
// users-lambda — middy stack
export const handler = middy<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Error, DuseumContext>()
  .use(loggerMiddleware())
  .use(cognitoAuthMiddleware())
  .use(errorHandlerMiddleware())
  .handler(dispatch)
```

### Implementation Steps

1. `GET /users/me` — calls `getUserAccount`, `getViewerProfile`, `getAuthorProfile` in parallel (`Promise.all`); returns all three (any may be null).
2. `PUT /users/me/viewer` — validates body with Zod schema (displayName min 1/max 100, optional notificationGlobalOptOut boolean, optional defaultNotificationPref enum); calls `updateViewerProfile` which builds a dynamic `SET` UpdateExpression using ExpressionAttributeNames + Values; `ConditionExpression: 'attribute_exists(PK)'` guards against updating non-existent profiles.
3. `GET /users/{userId}/profile` — public endpoint (no JWT required); returns ViewerProfile for the given userId; throws 404 if not found.
4. Schema validation uses Zod's `.refine()` to require at least one field in the PATCH body.

### Integration Test Fixtures

Integration tests at `lambdas/users/src/__tests__/users.integration.test.ts`.

Seed shape:
```typescript
{ PK: 'USER#user-001', SK: 'PROFILE#VIEWER', userId: 'user-001', profileType: 'VIEWER', status: 'ACTIVE', displayName: 'Test User', createdAt: '...', notificationGlobalOptOut: false, defaultNotificationPref: 'ALL_NEW_PIECES' }
```

### Decisions & Constraints

- `updateViewerProfile` uses dynamic `SET` expression built at runtime — only fields present in the patch object are included, avoiding overwriting existing fields with undefined.
- `ReturnValues: 'ALL_NEW'` on UpdateCommand — returns full updated record without an extra GetItem call.
- Status field (`ACTIVE | SUSPENDED`) is not writable by the user — only Admin can change it via `updateProfileStatus()`. The `PUT /users/me/viewer` schema does not include a `status` field.
- `GET /users/me` returns `null` for authorProfile if the user has not yet created one — caller must check.
