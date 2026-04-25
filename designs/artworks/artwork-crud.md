## Design: Art Piece CRUD

**Spec**: `specs/artworks/artwork-crud.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type ArtCategory =
  | 'PAINTING' | 'DIGITAL' | 'PHOTOGRAPHY' | 'SCULPTURE'
  | 'ILLUSTRATION' | 'MIXED_MEDIA' | 'OTHER'

export type ArtPieceVisibility = 'PUBLIC' | 'PRIVATE' | 'DRAFT'

export type ArtPiece = {
  artworkId: string
  authorId: string
  title: string
  description: string
  tags: string[]
  category: ArtCategory
  visibility: ArtPieceVisibility
  status: 'ACTIVE' | 'ARCHIVED'
  s3Key: string
  mimeType: string
  fileSizeBytes: number
  viewCount: number
  commentsEnabled: boolean
  notifiedCount: number
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| ArtPiece metadata | `ARTWORK#{artworkId}` | `METADATA` | all ArtPiece fields + `visibility#createdAt` composite for GSI-AuthorPublic |
| Author-index item | `AUTHOR#{authorId}` | (varies by impl) | denormalized stub for author gallery queries |

Note: The actual PK prefix used in integration tests is `ARTWORK#` (not `ART#` as in data-model.md). The composite GSI attribute is `visibility#createdAt` (actual) vs `GSI1SK = ART#{createdAt}` (data-model.md).

### Function Signatures

```typescript
// lambdas/artworks/src/routes/create-artwork.ts
export const createArtwork = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/artworks/src/routes/get-artwork.ts
export const getArtwork = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/artworks/src/routes/update-artwork.ts
export const updateArtwork = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/artworks/src/routes/delete-artwork.ts
export const deleteArtwork = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/artworks/src/routes/list-artworks.ts
export const listArtworks = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2>
```

### Handler Boilerplate

```typescript
// POST /artworks — Zod schema
const CreateArtworkSchema = z.object({
  s3Key:           z.string().uuid('s3Key must be a UUID'),
  title:           z.string().min(1).max(200),
  description:     z.string().max(2000).optional().default(''),
  category:        z.enum(['PAINTING', 'DIGITAL', 'PHOTOGRAPHY', 'SCULPTURE', 'ILLUSTRATION', 'MIXED_MEDIA', 'OTHER']),
  tags:            z.array(z.string().min(1).max(50)).max(10).optional().default([]),
  visibility:      z.enum(['PUBLIC', 'PRIVATE', 'DRAFT']),
  commentsEnabled: z.boolean().optional().default(true),
})

// artworks-lambda — middy stack (from index.ts)
export const handler = middy<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Error, DuseumContext>()
  .use(loggerMiddleware())
  .use(cognitoAuthMiddleware())
  .use(errorHandlerMiddleware())
  .handler(dispatch)
```

### Implementation Steps

1. `POST /artworks` (Author only):
   - Author profile fetched; must be ACTIVE.
   - `validateBody(CreateArtworkSchema, event.body)` parses request.
   - Tags normalized: `[...new Set(tags.map(t => t.toLowerCase().trim()))]`.
   - UploadIntent resolved by `s3Key`; validated: belongs to caller, status `PENDING`, not expired.
   - `headObject(bucket, s3Key)` confirms S3 object exists.
   - `artworkId = randomUUID()`. `publishedAt = now` if visibility is not DRAFT, else `null`.
   - `createArtPiece()` writes ArtPiece record.
   - `markUploadIntentConsumed()` with `ConditionalCheckFailedException` guard → `ConflictError` 409 for duplicate submit.
   - `incrementAuthorPieceCount()` fire-and-forget (non-critical).
   - SQS `NEW_PIECE_PUBLISHED` message enqueued fire-and-forget — only for non-DRAFT pieces. Never blocks the 201 response.
   - Returns 201 `{ artworkId, imageUrl }`.

2. `GET /artworks/{artworkId}` (optional JWT):
   - Fetches piece; returns 404 if ARCHIVED.
   - Parallel lookups: platform subscription, author subscription (skipped for author).
   - `checkArtPieceAccess()` called with all context.
   - View count incremented fire-and-forget.
   - Signed URL generated for PRIVATE accessible pieces (1-hour TTL).

3. `PUT /artworks/{artworkId}` (Author only):
   - Validates ownership and that piece is not ARCHIVED.
   - Handles visibility transition DRAFT→PUBLISHED: sets `publishedAt`, enqueues SQS notification (only on first publish per FR-NOTIF-11).

4. `DELETE /artworks/{artworkId}` (Author only):
   - Archives piece by default (status=`ARCHIVED`).

### Integration Test Fixtures

Tests at `lambdas/artworks/src/__tests__/publish-piece.integration.test.ts`, `get-artwork.integration.test.ts`, `list-artworks.integration.test.ts`.

Seed shape (from collections test):
```typescript
{
  PK: `ARTWORK#${artworkId}`, SK: 'METADATA',
  artworkId, authorId, title, description: '', tags: [], category: 'PAINTING',
  visibility, status: visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
  'visibility#createdAt': `${visibility}#2025-06-01T00:00:00.000Z`,
  s3Key: artworkId, mimeType: 'image/jpeg', fileSizeBytes: 1000,
  viewCount: 0, commentsEnabled: true, notifiedCount: 0,
  createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z', publishedAt: null,
}
```

### Decisions & Constraints

- SQS notification send is truly fire-and-forget: `.catch(() => {})` swallows all errors — fan-out failure must never fail the 201 response (Critical Rule #12).
- `incrementAuthorPieceCount` is also fire-and-forget — counter inconsistency is acceptable (eventual consistency on a non-critical counter).
- `ConditionalCheckFailedException` on `markUploadIntentConsumed` is re-thrown as `ConflictError` (409) — duplicate artwork submissions are rejected.
- Tags max 10, deduplicated and lowercased at write time — ensures consistent tag index entries.
- `fileSizeBytes` taken from S3 `ContentLength` header if available; falls back to `declaredSizeBytes` from the UploadIntent.
