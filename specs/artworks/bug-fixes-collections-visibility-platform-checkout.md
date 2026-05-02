## Spec: Dev Bug Fixes — Collections Visibility Enum + Platform Checkout Config

**Status**: ✅ Implemented
**Relevant PROJECT.md sections**: §2.6, §4.3, §4.7, §8.6, FR-TESTING-06

**What this implements**: Fixes three dev environment bugs: (1+2) collections list empty / create 400 because frontend sent `'PUBLIC'`/`'PRIVATE'` but backend expects `'FREE'`/`'SUBSCRIBER_ONLY'`; (3) platform checkout always 400 "not configured" because `getConfigValue` used wrong DynamoDB key pattern `{ PK:'CONFIG', SK:key }` while `setConfigValue` writes `{ PK:key }`.

---

### Bug 1 & 2 — Collections visibility enum mismatch

**Root cause**: Frontend is wrong; backend is correct per PROJECT.md §2.6.
- `AuthorCollection.visibility` typed as `'PUBLIC' | 'PRIVATE'` → should be `'FREE' | 'SUBSCRIBER_ONLY'`
- `CollectionBody.visibility` typed as `'PUBLIC' | 'PRIVATE'` → should be `'FREE' | 'SUBSCRIBER_ONLY'`
- UI `<option>` values sent `'PUBLIC'`/`'PRIVATE'` → Zod validation on backend rejects with 400

**Modified files**:
- `frontend/src/types/artwork.ts` — `AuthorCollection.visibility: 'FREE' | 'SUBSCRIBER_ONLY'`
- `frontend/src/services/collections.service.ts` — `CollectionBody.visibility: 'FREE' | 'SUBSCRIBER_ONLY'`
- `frontend/src/pages/dashboard/tabs/collections-tab.tsx` — state type, default `'FREE'`, options `FREE`/`SUBSCRIBER_ONLY`, display label mapping
- `frontend/src/services/__tests__/collections.service.test.ts` — updated existing tests + 2 regression tests (FR-TESTING-06)
- `specs/artworks/collections-crud.md` — corrected visibility enum in business logic section

---

### Bug 3 — Platform checkout always "not configured"

**Root cause**: Backend key mismatch.
- `setConfigValue` (config.repository.ts) writes: `{ PK: key, value }` — e.g. `{ PK: 'PLATFORM_SUB_PRICE_ID', value: '...' }`
- `getConfigValue` (subscriptions.repository.ts) read: `{ PK: 'CONFIG', SK: key }` — looks for a different item that never exists
- Config table is PK-only (no SK) per StorageStack CDK definition; test setup.ts also created it with composite key (wrong)

**Modified files**:
- `packages/shared/src/db/subscriptions.repository.ts` — fixed `getConfigValue` key from `{ PK:'CONFIG', SK:key }` → `{ PK:key }`
- `lambdas/subscriptions/src/__tests__/setup.ts` — config table now PK-only (no SK); seed items use `{ PK:'PLATFORM_SUB_PRICE_ID', value:'...' }` (no SK)
- `lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts` — regression test name updated (FR-TESTING-06)

---

### Done-when checklist

- [x] `AuthorCollection.visibility` type is `'FREE' | 'SUBSCRIBER_ONLY'` in `artwork.ts`
- [x] `CollectionBody.visibility` type is `'FREE' | 'SUBSCRIBER_ONLY'` in `collections.service.ts`
- [x] Collections tab sends `FREE` or `SUBSCRIBER_ONLY` to backend; UI labels show "Free" and "Subscribers only"
- [x] `collections.service.test.ts` regression tests pass with correct enum values
- [x] `getConfigValue` key pattern is `{ PK: key }` (no SK)
- [x] `setup.ts` config table is PK-only; seeds config as `{ PK:'PLATFORM_SUB_PRICE_ID', value:'...' }` (no SK)
- [x] `POST /subscriptions/platform` integration test regression test passes (29/29)
- [x] `specs/artworks/collections-crud.md` visibility enum corrected
- [x] Frontend TypeScript check passes (no new errors)
- [x] Collections service unit tests pass (10/10)
