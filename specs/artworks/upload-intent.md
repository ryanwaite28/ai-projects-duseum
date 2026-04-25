## Spec: Media Upload Intent (Presigned URL)

**Status**: ✅ Implemented
**FR coverage**: FR-ART-01, FR-ART-03, FR-ART-04
**Relevant PROJECT.md sections**: 2.5, 4.3, 4.4, 8

**What this implements**: Two-step image upload flow — Lambda generates an S3 presigned PUT URL; frontend uploads directly to S3; Lambda confirms the upload and records the s3Key.

**Prerequisites**: S3 media bucket deployed with CORS configured for PUT; `packages/shared/src/db/artworks.repository.ts` created; `artworks-lambda` (or `media-lambda`) deployed

**Done when**:
- [ ] `POST /media/upload-intent` returns `{ intentId, uploadUrl, s3Key, expiresAt }` with 10-min presigned URL TTL
- [ ] Unsupported `mimeType` → 400; `sizeBytes` > 20MB → 400
- [ ] `POST /media/confirm-upload` returns 422 when S3 `HeadObject` confirms object was never uploaded
- [ ] Intent already CONFIRMED → idempotent 200 (not 409)
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/artworks/src/routes/upload-intent.ts` — `POST /media/upload-intent`
- `lambdas/artworks/src/routes/confirm-upload.ts` — `POST /media/confirm-upload`
- `packages/shared/src/db/artworks.repository.ts` — `createUploadIntent()`, `confirmUploadIntent()`

**DynamoDB access patterns used**:
- Upload intent record: `PK=UPLOAD#{intentId}, SK=META` — status: `PENDING` → `CONFIRMED`
- Maintenance lambda cleans up expired (>10 min, still PENDING) intents

**Business logic**:
1. `POST /media/upload-intent`:
   - Validate JWT → must be Author profile (ACTIVE)
   - Validate `mimeType` against allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
   - Validate `sizeBytes` ≤ 20MB (20,971,520 bytes)
   - Generate `s3Key = UUID` (no prefix, bucket-namespaced)
   - Generate S3 presigned PUT URL (10-min TTL), `ContentType` header required
   - Write UploadIntent to DynamoDB: `{ intentId, s3Key, authorId, status: 'PENDING', expiresAt }`
   - Return: `{ intentId, uploadUrl, s3Key, expiresAt }`
2. Frontend PUTs file directly to S3 using `uploadUrl` (bypasses Lambda)
3. `POST /media/confirm-upload`:
   - Validate `intentId` exists + belongs to authenticated Author + status=`PENDING`
   - Verify S3 object exists (`HeadObject` call)
   - Update intent status to `CONFIRMED`
   - Return: `{ s3Key, confirmed: true }`

**Error conditions**:
- Unsupported `mimeType` → 400
- `sizeBytes` > 20MB → 400
- `POST /media/confirm-upload` — intent not found or wrong owner → 404
- Intent already CONFIRMED → 409 (idempotent: return 200)
- S3 object not found after confirm → 422 (upload never completed)

**Tests to write**:
- Unit: mimeType allowlist; sizeBytes boundary; s3Key UUID format
- Integration: full flow — generate intent, mock S3 HeadObject, confirm; expired intent cleanup
