## Spec: Art Piece Access Control

**Status**: ✅ Implemented
**FR coverage**: FR-VIEW-03, FR-VIEW-04, FR-VIEW-05, FR-ART-02, FR-COL-02
**Relevant PROJECT.md sections**: 1.4, 2.3, 4.4, 6.5

**What this implements**: Server-side enforcement of the 4-tier access model — free viewer limit, platform subscriber unlimited, Author subscriber private access, Author own-content access. CloudFront signed URLs for PRIVATE pieces.

**Prerequisites**: `artworks/artwork-crud.md` complete; CloudFront private key in Secrets Manager; `CLOUDFRONT_KEY_PAIR_ID` and `CLOUDFRONT_MEDIA_DOMAIN` in Lambda env vars; SSM free-tier limit param seeded

**Done when**:
- [ ] Unit tests cover all 12 combinations (4 access tiers × 3 visibility states) in `checkArtPieceAccess()` — all pass
- [ ] PRIVATE piece accessible to Author Subscriber returns a CloudFront signed URL (never a raw S3 URL) in `imageUrl`
- [ ] PRIVATE piece inaccessible → 403 `{ reason: 'AUTHOR_SUBSCRIPTION_REQUIRED' }`; beyond free tier → 403 `{ reason: 'PLATFORM_SUBSCRIPTION_REQUIRED' }`
- [ ] `checkArtPieceAccess()` is only called server-side (no frontend access control logic)
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `packages/shared/src/auth/access-control.ts` — `checkArtPieceAccess(viewerContext, piece)` — the single source of truth for access enforcement
- `lambdas/artworks/src/routes/get-artwork.ts` — calls `checkArtPieceAccess()` before returning piece data
- `lambdas/artworks/src/routes/list-author-artworks.ts` — filters list results through `checkArtPieceAccess()`

**DynamoDB access patterns used**:
- Platform subscription: `PK=USER#{userId}, SK=SUB#PLATFORM`
- Author subscription: `PK=USER#{userId}, SK=SUB#AUTHOR#{authorId}`
- Free-tier limit config: SSM Parameter Store (not DynamoDB)

**Business logic**:
1. `checkArtPieceAccess(viewerContext, piece)` returns `{ allowed: boolean, reason?: string }`:
   - DRAFT → only piece's Author can access (always)
   - PRIVATE → Author (own) OR active Author Subscriber (check `SUB#AUTHOR#{authorId}` record, status=`ACTIVE`)
   - PUBLIC → Author (own) OR Platform Subscriber (status=`ACTIVE`) OR free viewer within limit
2. Free viewer limit: count of PUBLIC pieces already served to viewer in same Author's gallery in this session vs platform config limit (default: 10); pieces beyond limit return `{ allowed: false, reason: 'PLATFORM_SUBSCRIPTION_REQUIRED' }`
3. CloudFront signed URL generation (for PRIVATE accessible pieces):
   - Lambda calls `generateSignedUrl(s3Key)` → CloudFront signed URL with 1hr TTL
   - `imageUrl` in response is always the CloudFront signed URL (never raw S3)
4. `checkArtPieceAccess()` is called server-side ONLY — never enforced solely in frontend

**Error conditions**:
- Unauthorized PRIVATE piece access → 403 with `{ reason: 'AUTHOR_SUBSCRIPTION_REQUIRED' }`
- Beyond free tier limit → 403 with `{ reason: 'PLATFORM_SUBSCRIPTION_REQUIRED' }`
- DRAFT accessed by non-owner → 403 with `{ reason: 'DRAFT_NOT_ACCESSIBLE' }`

**Tests to write**:
- Unit: all 4 access tiers × all 3 visibility states in `checkArtPieceAccess()`
- Integration: verify correct HTTP status for each access level combination; verify signed URL returned for accessible PRIVATE pieces
