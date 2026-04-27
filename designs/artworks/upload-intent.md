## Design: Media Upload Intent (Presigned URL)

**Spec**: `specs/artworks/upload-intent.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type UploadIntent = {
  intentId: string
  uploaderId: string      // userId
  s3Key: string
  mimeType: string
  declaredSizeBytes: number
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED'
  expiresAt: string       // ISO 8601; 10 min from creation
  createdAt: string
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| UploadIntent | `UPLOAD#{intentId}` | `META` | `intentId`, `uploaderId`, `s3Key`, `mimeType`, `declaredSizeBytes`, `status`, `expiresAt`, `createdAt` |

Note: `s3Key = intentId` (UUID) — the intent ID and the S3 object key are the same value in the implementation.

### Function Signatures

```typescript
// lambdas/media/src/routes/upload-intent.ts
export const handler = buildHandler(async (event, context) => Promise<{ intentId, uploadUrl, s3Key, expiresAt }>)

// packages/shared/src/db/upload-intents.repository.ts (imported as createUploadIntent)
export const createUploadIntent = async (
  client: DynamoDBDocumentClient,
  intent: UploadIntent
): Promise<void>

// lambdas/artworks/src/routes/create-artwork.ts uses:
export const getUploadIntent = async (client, s3Key): Promise<UploadIntent | null>
export const markUploadIntentConsumed = async (client, s3Key): Promise<void>
```

### Handler Boilerplate

```typescript
// lambdas/media/src/routes/upload-intent.ts — uses buildHandler (not middy)
const UploadIntentBodySchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
})

export const handler = buildHandler(async (event, context) => {
  const body = validateBody(UploadIntentBodySchema, event.body)
  // mimeType allowlist check
  // sizeBytes ceiling check (20 MB)
  // Author profile ACTIVE check
  // Generate UUID as intentId + s3Key
  // generatePresignedPutUrl(bucket, s3Key, mimeType, 600)
  // createUploadIntent(...)
  return ok({ intentId, uploadUrl, s3Key, expiresAt })
})
```

### Implementation Steps

1. `POST /media/upload-intent` (JWT required — Author only):
   - `validateBody(UploadIntentBodySchema, event.body)` parses and validates request.
   - mimeType validated against `Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])`.
   - `sizeBytes` validated ≤ 20 MB (20,971,520 bytes).
   - `getAuthorProfile()` called; throws `ForbiddenError` if no ACTIVE Author profile.
   - `intentId = crypto.randomUUID()`. `s3Key = intentId` (identical — the UUID is the S3 key).
   - `expiresAt = now + 600 seconds (10 min)`.
   - `generatePresignedPutUrl(mediaBucket, s3Key, mimeType, 600)` generates S3 presigned PUT URL.
   - `createUploadIntent()` writes record with status `'PENDING'`.
   - Returns `{ intentId, uploadUrl, s3Key, expiresAt }`.

2. Upload confirmation is handled by `create-artwork.ts` (not a separate confirm-upload route):
   - `getUploadIntent(docClient, s3Key)` looks up the intent by s3Key.
   - Validates intent exists, belongs to authenticated Author, status is `'PENDING'`, and not expired.
   - `headObject(bucket, s3Key)` verifies S3 object exists.
   - `markUploadIntentConsumed(docClient, s3Key)` updates status to `'CONSUMED'` with `ConditionalCheckFailedException` guard for duplicate submissions.

### Integration Test Fixtures

Tests at `lambdas/media/src/routes/upload-intent.test.ts`.

Seed: Author profile at `PK=USER#author-001, SK=PROFILE#AUTHOR`.
Assert: Response contains `intentId`, `uploadUrl` (presigned S3 URL), `s3Key` (UUID), `expiresAt`.

### Decisions & Constraints

- `s3Key = intentId` simplifies the confirm step — `create-artwork.ts` looks up intent by `s3Key` which equals the `intentId` passed in the artwork body.
- Spec described a separate `POST /media/confirm-upload` endpoint; the implementation inlines confirmation into `POST /artworks` — more atomic and eliminates a round-trip.
- `markUploadIntentConsumed` uses a `ConditionExpression` so that duplicate artwork creation requests (race condition) are caught as `ConflictError`.
- Media-lambda deployed separately from artworks-lambda; presigned URL generation (Secrets Manager, S3 PutObject permission) is isolated to media-lambda IAM role.
- `buildHandler` is the media-lambda's own Middy wrapper; artworks-lambda uses the shared `middy` + `cognitoAuthMiddleware` stack.
