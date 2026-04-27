## Design: Author Profile Onboarding

**Spec**: `specs/users/author-onboarding.md`
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
  coverPhotoS3Key: string | null
  stripeConnectAccountId: string | null
  connectChargesEnabled: boolean | null
  authorSubscriptionPriceId: string | null
  authorSubscriptionMonthlyUsd: number | null
  featuredPieceIds: string[]
  createdAt: string
  totalPiecesCount: number
  followerCount: number
  subscriberCount: number
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| AuthorProfile | `USER#{userId}` | `PROFILE#AUTHOR` | all fields above; `profileType='AUTHOR'` written as top-level attribute for GSI-AuthorDirectory |

### Function Signatures

```typescript
// packages/shared/src/db/users.repository.ts

export const createAuthorProfile = async (
  client: DynamoDBDocumentClient,
  profile: AuthorProfile
): Promise<void>

export const getAuthorProfile = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<AuthorProfile | null>

export type UpdateAuthorProfileInput = {
  displayName?: string
  bio?: string
  profilePhotoS3Key?: string | null
  coverPhotoS3Key?: string | null
  featuredPieceIds?: string[]
  stripeConnectAccountId?: string | null
  connectChargesEnabled?: boolean | null
  authorSubscriptionPriceId?: string | null
  authorSubscriptionMonthlyUsd?: number | null
}

export const updateAuthorProfile = async (
  client: DynamoDBDocumentClient,
  userId: string,
  patch: UpdateAuthorProfileInput
): Promise<AuthorProfile>

// lambdas/users/src/routes/create-author.ts
export const createAuthor = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>
```

### Handler Boilerplate

```typescript
// POST /users/me/author — validated by Zod schema
const schema = z.object({
  displayName: z.string().min(1).max(100),
  bio: z.string().min(1).max(2000),
  authorSubscriptionPriceUsd: z.number().min(1).max(50).optional(),
})
```

### Implementation Steps

1. `POST /users/me/author` validates JWT; extracts `userId` from `DuseumContext`.
2. Zod schema validates `displayName` (required, 1–100 chars), `bio` (required, 1–2000 chars), optional `authorSubscriptionPriceUsd` (1–50).
3. `getAuthorProfile()` called; if profile exists → throws `ConflictError` (409).
4. `createAuthorProfile()` writes with `ConditionExpression: 'attribute_not_exists(PK)'`; initializes status as `ACTIVE` (implementation diverges from spec's `PENDING_SETUP`), counters at 0, null Stripe fields.
5. `profileType: 'AUTHOR'` written as top-level attribute enabling GSI-AuthorDirectory queries.
6. `PUT /users/me/author` calls `updateAuthorProfile()` with dynamic SET expression.
7. `GET /authors/{authorId}` (in `get-author.ts`) calls `getAuthorProfile()` + `getAuthorPublicGallery()` in sequence; returns public fields + paginated gallery.

### Integration Test Fixtures

Integration tests at `lambdas/users/src/__tests__/users.integration.test.ts`.

Seed for duplicate test:
```typescript
{ PK: 'USER#user-001', SK: 'PROFILE#AUTHOR', userId: 'user-001', profileType: 'AUTHOR', status: 'ACTIVE', ... }
```
Assert: second `POST /users/me/author` returns `409 Conflict`.

### Decisions & Constraints

- Implementation creates Author with `status: 'ACTIVE'` immediately (not `PENDING_SETUP`) when `displayName` and `bio` are both provided — diverges from spec which says status begins as `PENDING_SETUP` and transitions to `ACTIVE` once `displayName` is set.
- `createAuthorProfile()` uses `attribute_not_exists(PK)` condition — duplicate calls throw `ConditionalCheckFailedException` which propagates up (not swallowed) unlike `createUserAccount` and `createViewerProfile`.
- `updateAuthorProfile()` uses `ConditionExpression: 'attribute_exists(PK)'` — updating a non-existent Author profile throws `ConditionalCheckFailedException`.
- `followerCount` and `subscriberCount` use `ADD` atomic increments (see `incrementAuthorFollowerCount` / `decrementAuthorFollowerCount`) rather than read-modify-write to avoid race conditions.
