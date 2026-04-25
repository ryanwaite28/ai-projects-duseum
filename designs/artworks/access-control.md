## Design: Art Piece Access Control

**Spec**: `specs/artworks/access-control.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/auth/access-control.ts

export type AccessContext = {
  viewerId: string
  isAuthor: boolean           // is this the Author of the piece?
  isPlatformSubscriber: boolean
  isAuthorSubscriber: boolean // subscribed to this specific Author
}

export type AccessDecision =
  | { allowed: true;  signUrl: boolean }
  | { allowed: false; reason: 'REQUIRES_PLATFORM_SUB' | 'REQUIRES_AUTHOR_SUB' | 'FORBIDDEN' }
```

### DynamoDB Access Patterns

| Access pattern | Table | Key expression |
|---|---|---|
| Platform subscription | Main | `PK=USER#{userId}, SK=SUB#PLATFORM` |
| Author subscription | Main | `PK=USER#{userId}, SK=SUB#AUTHOR#{authorId}` |
| Free-tier limit config | Config table | `PK=CONFIG#FREE_TIER_LIMIT` (or similar config key) |
| Author public piece count | Main — GSI-AuthorPublic | query to count pieces at or before this piece's `createdAt` |

### Function Signatures

```typescript
// packages/shared/src/auth/access-control.ts
export const checkArtPieceAccess = (
  piece: ArtPiece,
  ctx: AccessContext,
  freeTierLimit: number,
  authorPieceIndex: number
): AccessDecision

// lambdas/artworks/src/routes/get-artwork.ts imports:
export const getPlatformSubscription = async (client, userId): Promise<Subscription | null>
export const getAuthorSubscription = async (client, userId, authorId): Promise<Subscription | null>
export const getFreeTierLimit = async (client): Promise<number>
export const countPublicPiecesByAuthorUpTo = async (client, authorId, createdAt): Promise<number>
export const generateSignedUrl = async (s3Key: string, ttlSeconds: number): Promise<string>
export const incrementViewCount = async (client, artworkId): Promise<void>
```

### Handler Boilerplate

```typescript
// get-artwork.ts — full access control flow
const decision = checkArtPieceAccess(piece, { viewerId, isAuthor, isPlatformSubscriber, isAuthorSubscriber }, freeTierLimit, authorPieceIndex)

if (!decision.allowed) {
  if (decision.reason === 'FORBIDDEN') throw new ForbiddenError()
  if (decision.reason === 'REQUIRES_AUTHOR_SUB') throw new PaymentRequiredError('...')
  throw new PaymentRequiredError('...')  // REQUIRES_PLATFORM_SUB
}

let imageUrl: string
if (decision.signUrl) {
  imageUrl = await generateSignedUrl(piece.s3Key, SIGNED_URL_TTL)  // 3600 seconds
} else {
  imageUrl = publicUrl(piece.s3Key)
}
```

### Implementation Steps

1. `checkArtPieceAccess(piece, ctx, freeTierLimit, authorPieceIndex)` — pure function (no I/O):
   - Author short-circuit: `if (ctx.isAuthor) return { allowed: true, signUrl: piece.visibility === 'DRAFT' }`. Authors always access their own work; DRAFT pieces use `signUrl=true`.
   - PRIVATE: `if (ctx.isAuthorSubscriber) return { allowed: true, signUrl: true }`. Otherwise `{ allowed: false, reason: 'REQUIRES_AUTHOR_SUB' }`.
   - DRAFT (non-author): `return { allowed: false, reason: 'FORBIDDEN' }`.
   - PUBLIC: if `authorPieceIndex <= freeTierLimit` → allowed (no sign). If platform subscriber → allowed (no sign). Otherwise `{ allowed: false, reason: 'REQUIRES_PLATFORM_SUB' }`.

2. `get-artwork.ts` orchestrates:
   - Fetch piece; 404 if ARCHIVED.
   - `isAuthor = piece.authorId === userId`.
   - If not author and userId present: parallel fetch platform sub + author sub.
   - Parallel fetch: `getFreeTierLimit()` and `countPublicPiecesByAuthorUpTo()` (1-based rank of this piece in author's public gallery).
   - Call `checkArtPieceAccess()` with all inputs.
   - On `decision.signUrl=true`: `generateSignedUrl(piece.s3Key, 3600)` returns CloudFront signed URL.
   - `incrementViewCount()` fire-and-forget (non-critical counter).
   - Returns piece data + `imageUrl` + optional `imageUrlExpiresAt`.

### Integration Test Fixtures

Tests at `lambdas/artworks/src/__tests__/get-artwork.integration.test.ts`.

Covers:
- Author accesses own DRAFT → 200 with signed URL.
- Non-subscriber accesses PRIVATE → 402.
- Author subscriber accesses PRIVATE → 200 with signed URL.
- Public piece within free tier → 200 with plain URL.
- Public piece beyond free tier without platform sub → 402.

### Decisions & Constraints

- `checkArtPieceAccess()` is a pure function — all I/O (DynamoDB reads) happens before the call in the route handler. This makes the access logic independently unit-testable.
- `signUrl: piece.visibility === 'DRAFT'` — Draft pieces served to their author via signed URL to keep them off the public CDN path.
- `PaymentRequiredError` (HTTP 402) is used for both `REQUIRES_AUTHOR_SUB` and `REQUIRES_PLATFORM_SUB` — the client distinguishes via the error message or a `reason` field.
- `generateSignedUrl` reads the CloudFront private key from Secrets Manager; key pair ID from environment variable `CLOUDFRONT_KEY_PAIR_ID`.
- Signed URL TTL is 3600 seconds (1 hour) — response includes `imageUrlExpiresAt` so frontend can refresh before expiry.
- `countPublicPiecesByAuthorUpTo()` gives a 1-based rank so `authorPieceIndex = 1` means the first piece (within free tier). Free tier default is 10 (read from config table).
