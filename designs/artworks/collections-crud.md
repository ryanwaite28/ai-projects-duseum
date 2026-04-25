## Design: Collections CRUD

**Spec**: `specs/artworks/collections-crud.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type Collection = {
  collectionId: string
  ownerId: string         // userId
  title: string
  description: string
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export type CollectionItem = {
  collectionId: string
  artworkId: string
  order: number
  addedAt: string         // ISO 8601
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| Collection metadata | `COLLECTION#{collectionId}` | `METADATA` | `collectionId`, `ownerId`, `title`, `description`, `isPublic`, `createdAt`, `updatedAt` |
| Author-index (collection stub) | `AUTHOR#{authorId}` | `COLLECTION#{createdAt}#{collectionId}` | `collectionId`, `ownerId`, `title`, `isPublic`, `createdAt` |
| Collection item (forward) | `COLLECTION#{collectionId}` | `ARTWORK#{zeroPad8(order)}#{artworkId}` | `collectionId`, `artworkId`, `order`, `addedAt` |

Note: The actual PK prefix in code is `COLLECTION#` (not `COL#` as in data-model.md). The item SK uses zero-padded order (`padStart(8, '0')`) for lexicographic sort order.

### Function Signatures

```typescript
// packages/shared/src/db/collections.repository.ts

export const createCollection = async (
  client: DynamoDBDocumentClient,
  collection: Collection & { ownerId: string }
): Promise<void>

export const getCollection = async (
  client: DynamoDBDocumentClient,
  collectionId: string
): Promise<Collection | null>

export const listCollectionsByAuthor = async (
  client: DynamoDBDocumentClient,
  authorId: string,
  opts?: ListCollectionsByAuthorOptions
): Promise<{ items: Collection[]; lastKey?: Record<string, unknown> }>

export const updateCollection = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  patch: { title?: string; description?: string; isPublic?: boolean }
): Promise<Collection>

export const deleteCollection = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  ownerId: string,
  createdAt: string
): Promise<void>

export const addArtPieceToCollection = async (
  client: DynamoDBDocumentClient,
  item: CollectionItem
): Promise<void>

export const getCollectionItemByArtworkId = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  artworkId: string
): Promise<CollectionItem | null>

export const removeArtPieceFromCollection = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  artworkId: string,
  order: number
): Promise<void>

export const listCollectionItems = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  limit?: number,
  lastKey?: Record<string, unknown>
): Promise<{ items: CollectionItem[]; lastKey?: Record<string, unknown> }>
```

### Handler Boilerplate

```typescript
// artworks-lambda dispatch (index.ts) — collection routes
if (seg0 === 'collections') {
  const collectionId = seg1
  if (method === 'POST'   && !collectionId)       return createCollectionRoute(event, context)
  if (method === 'GET'    && collectionId && !seg2) return getCollectionRoute(event, context, collectionId)
  if (method === 'PUT'    && collectionId && !seg2) return updateCollectionRoute(event, context, collectionId)
  if (method === 'DELETE' && collectionId && !seg2) return deleteCollectionRoute(event, context, collectionId)
  if (seg2 === 'pieces') { /* collection piece routes */ }
}
```

### Implementation Steps

1. `POST /collections`:
   - JWT required; must be Author.
   - Zod schema validates `title` (required), `description` (optional), `isPublic` (boolean).
   - `createCollection()` writes two items in parallel: collection metadata (`COLLECTION#{id}/METADATA`) + author-index stub (`AUTHOR#{authorId}/COLLECTION#{createdAt}#{collectionId}`).
   - `ConditionExpression: 'attribute_not_exists(PK)'` on metadata write (collision prevention).

2. `GET /collections/{collectionId}`:
   - Public (optional JWT).
   - `getCollection()` fetches metadata; 404 if not found.
   - Access check: PRIVATE collection requires owner or Author subscriber.

3. `GET /authors/{authorId}/collections` (`listAuthorCollectionsRoute`):
   - Public. Queries author-index (`AUTHOR#{authorId}, SK begins_with COLLECTION#`).
   - `publicOnly=true` filter via `FilterExpression: 'isPublic = :yes'`.
   - Stubs fetched from index; full metadata fetched in parallel via `getCollection()` for each.

4. `PUT /collections/{collectionId}`:
   - JWT required; owner only.
   - Dynamic SET UpdateExpression.
   - `ConditionExpression: 'attribute_exists(PK)'`.
   - `ReturnValues: 'ALL_NEW'`.

5. `DELETE /collections/{collectionId}`:
   - JWT required; owner only.
   - `deleteCollection()` uses `TransactWriteCommand`: deletes metadata + author-index stub atomically.
   - Collection items are NOT deleted by this operation (handled separately or by the collection management UI).

### Integration Test Fixtures

Tests at `lambdas/artworks/src/__tests__/collections.integration.test.ts`.

Seed:
```typescript
// Author profile
{ PK: 'USER#col-author-001', SK: 'PROFILE#AUTHOR', userId: 'col-author-001', profileType: 'AUTHOR', status: 'ACTIVE', displayName: 'Author 001', createdAt: '2025-01-01T00:00:00.000Z' }
```

### Decisions & Constraints

- Author-index items are stubs (denormalized title, isPublic) to avoid fetching full metadata for list operations — still requires N GetItem calls for full data but avoids large scans.
- `deleteCollection()` uses `TransactWriteCommand` — atomic delete of both metadata and author-index to maintain consistency.
- `listCollectionItems` sorts ascending by SK (zero-padded order prefix) for correct display order.
- No reverse membership (piece→collection) item is written in the current implementation (spec mentioned it but the repository only maintains `COLLECTION#/ARTWORK#` forward items).
- `updateCollection` does not update the author-index stub's `title` or `isPublic` — stub may be stale after update (acceptable inconsistency in v1).
