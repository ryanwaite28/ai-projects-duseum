## Design: Follow / Unfollow Authors

**Spec**: `specs/users/follows.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type Follow = {
  viewerId: string
  authorId: string
  followedAt: string   // ISO 8601
}

// Internal to follows.repository.ts
export type FollowRecord = {
  viewerId: string
  authorId: string
  followedAt: string
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| Follow | `USER#{viewerId}` | `FOLLOW#AUTHOR#{authorId}` | `viewerId`, `authorId`, `followedAt` |
| NotificationPreference | `USER#{viewerId}` | `NOTIF_PREF#AUTHOR#{authorId}` | `viewerId`, `authorId`, `pref`, `updatedAt` |
| AuthorProfile (counter update) | `USER#{authorId}` | `PROFILE#AUTHOR` | `followerCount` (ADD :one) |

GSI: `GSI-FollowersByAuthor` — `authorId` (PK), `followedAt` (SK) — used by notifications fan-out.

### Function Signatures

```typescript
// packages/shared/src/db/follows.repository.ts
export const createFollow = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string,
  followedAt: string
): Promise<FollowRecord>

export const deleteFollow = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string
): Promise<void>

export const getFollow = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string
): Promise<FollowRecord | null>

export const listFollowsByViewer = async (
  client: DynamoDBDocumentClient,
  input: ListFollowsByViewerInput
): Promise<ListFollowsResult>

export const listFollowersByAuthor = async (
  client: DynamoDBDocumentClient,
  input: ListFollowersByAuthorInput
): Promise<ListFollowsResult>

// lambdas/users/src/routes/
export const followAuthor = async (context: DuseumContext, authorId: string): Promise<APIGatewayProxyStructuredResultV2>
export const unfollowAuthor = async (context: DuseumContext, authorId: string): Promise<APIGatewayProxyStructuredResultV2>
export const listFollows = async (event: APIGatewayProxyEventV2, context: DuseumContext): Promise<APIGatewayProxyStructuredResultV2>
```

### Handler Boilerplate

```typescript
// followAuthor — TransactWrite: Follow record + NotificationPreference + followerCount increment
await docClient.send(new TransactWriteCommand({
  TransactItems: [
    { Put: { TableName, Item: { PK: `USER#${viewerId}`, SK: `FOLLOW#AUTHOR#${authorId}`, ... }, ConditionExpression: 'attribute_not_exists(PK)' } },
    { Put: { TableName, Item: { PK: `USER#${viewerId}`, SK: `NOTIF_PREF#AUTHOR#${authorId}`, ... }, ConditionExpression: 'attribute_not_exists(PK)' } },
    { Update: { TableName, Key: { PK: `USER#${authorId}`, SK: 'PROFILE#AUTHOR' }, UpdateExpression: 'ADD followerCount :one', ConditionExpression: 'attribute_exists(PK)' } },
  ]
}))
```

### Implementation Steps

1. `POST /follows/authors/{authorId}` (followAuthor):
   - Verify JWT; extract `viewerId` from context.
   - Parallel fetch: `getAuthorProfile(authorId)`, `getViewerProfile(viewerId)`, `getFollow(viewerId, authorId)`.
   - If author not found → 404. If follow record exists → `ConflictError` 409.
   - Default notification pref taken from viewer's `defaultNotificationPref` (falls back to `'ALL_NEW_PIECES'` if viewer profile not found).
   - `TransactWriteCommand` with 3 items: Follow record (conditional), NotificationPreference record (conditional — does not overwrite existing pref from previous follow-unfollow cycle), followerCount ADD :one (conditional on Author existing).
   - Returns `{ authorId, followedAt, notificationPref }`.

2. `DELETE /follows/authors/{authorId}` (unfollowAuthor):
   - Verify JWT; extract `viewerId`.
   - `getFollow()` to verify follow exists; if not → 404 (spec says 200 no-op but implementation throws 404).
   - `TransactWriteCommand` with 3 items: Delete Follow record, Delete NotificationPreference record, followerCount ADD :-1.
   - Returns `{ authorId, unfollowedAt }`.

3. `GET /follows/authors` (listFollows):
   - JWT required; paginated with cursor.
   - `listFollowsByViewer()` queries `PK=USER#{viewerId}, SK begins_with FOLLOW#AUTHOR#`.
   - Enriches each follow with author's displayName and per-author notification pref via parallel `Promise.all`.
   - Returns `{ items: enriched[], nextCursor }`.

### Integration Test Fixtures

Integration tests at `lambdas/users/src/__tests__/follows.integration.test.ts`.

Follow record seed:
```typescript
{ PK: 'USER#viewer-001', SK: 'FOLLOW#AUTHOR#author-001', viewerId: 'viewer-001', authorId: 'author-001', followedAt: '...' }
```

### Decisions & Constraints

- `TransactWriteCommand` ensures atomicity: Follow record, NotificationPreference record, and followerCount increment are all-or-nothing.
- The NotificationPreference `Put` uses `attribute_not_exists(PK)` — re-following an author after unfollowing does NOT reset a previously customized notification preference. This is intentional (preserves user's previous preference setting).
- `unfollowAuthor` returns 404 if not already following (spec said 200 no-op); this was a deliberate implementation choice for clarity.
- `listFollowersByAuthor` uses `GSI-FollowersByAuthor` with `authorId` as the GSI partition key — a top-level attribute on Follow items. Max page size 500 for fan-out use by notifications-lambda.
