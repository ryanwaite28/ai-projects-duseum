## Design: Author Directory

**Spec**: `specs/users/author-directory.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type AuthorProfile = {
  userId: string
  profileType: 'AUTHOR'
  status: 'PENDING_SETUP' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
  displayName: string
  bio: string
  profilePhotoS3Key: string | null
  followerCount: number
  subscriberCount: number
  totalPiecesCount: number
  authorSubscriptionMonthlyUsd: number | null
  createdAt: string
  // ... other fields
}
```

### DynamoDB Access Patterns

| Access pattern | Table/Index | Key expression |
|---|---|---|
| List all ACTIVE Authors newest first | Main table — GSI-AuthorDirectory | `profileType = 'AUTHOR'` (GSI PK), sort by `createdAt` (GSI SK) desc |
| List all ACTIVE Authors by subscriberCount | Main table — scan with filter | No GSI — application-level sort (v1 acceptable) |

Note: The actual GSI implementation uses `profileType` as the GSI partition key (written as top-level attribute on every Author record) rather than the `ENTITY#AUTHOR` literal described in data-model.md.

### Function Signatures

```typescript
// lambdas/users/src/routes/list-authors.ts
export const listAuthors = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2>

// packages/shared/src/db/users.repository.ts (listAuthors import)
export const listAuthors = async (
  client: DynamoDBDocumentClient,
  opts: { sort: 'newest' | 'subscriberCount'; limit: number; lastKey?: Record<string, unknown> }
): Promise<{ items: AuthorProfile[]; lastKey?: Record<string, unknown> }>
```

### Handler Boilerplate

```typescript
// GET /authors — no JWT required (public endpoint)
export const listAuthors = async (event: APIGatewayProxyEventV2) => {
  const sort = qs['sort'] ?? 'newest'  // 'newest' | 'subscriberCount'
  const limit = parseInt(qs['limit'] ?? '20', 10)  // clamped 1–50
  // cursor: base64url-encoded JSON of DynamoDB LastEvaluatedKey
}
```

### Implementation Steps

1. `GET /authors` is a public endpoint — no JWT middleware check.
2. Query string: `sort` (default `'newest'`), `limit` (default 20, max 50), `cursor` (base64url-encoded).
3. Validates `sort` against allowed values `'newest'` and `'subscriberCount'`; throws `ValidationError` on invalid value.
4. Validates `limit` is 1–50; throws `ValidationError` if out of range.
5. Cursor decoded via `JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))`.
6. Calls `listAuthorsRepo()` from `@duseum/shared` with resolved options.
7. Response: `{ items: AuthorProfile[], nextCursor: string | undefined }`.
8. `nextCursor` encoded via `Buffer.from(JSON.stringify(lastKey)).toString('base64url')`.

### Integration Test Fixtures

Integration tests in `lambdas/users/src/__tests__/users.integration.test.ts`.

Seed: multiple Author profile items with varying `createdAt` and `subscriberCount`. Assert sort order and that `nextCursor` is present when items exceed page size.

### Decisions & Constraints

- Suspended and Deactivated Authors excluded via filter expression on the GSI query (`status = 'ACTIVE'`).
- `sort=subscriberCount` is implemented as application-level sort (fetch page, sort in memory) rather than a dedicated GSI — acceptable for v1 at current scale.
- Cursor encoding uses base64url (URL-safe) to avoid `+` and `/` characters in query string without requiring percent-encoding.
- `limit > 50` throws `ValidationError` rather than clamping silently — consistent with the fail-fast validation approach used across the codebase.
