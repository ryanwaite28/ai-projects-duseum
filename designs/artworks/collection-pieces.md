## Design: Collection Piece Membership

**Spec**: `specs/artworks/collection-pieces.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type CollectionItem = {
  collectionId: string
  artworkId: string
  order: number
  addedAt: string    // ISO 8601
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| Collection item (forward) | `COLLECTION#{collectionId}` | `ARTWORK#{zeroPad8(order)}#{artworkId}` | `collectionId`, `artworkId`, `order`, `addedAt` |

Note: SK uses `String(order).padStart(8, '0')` for lexicographic sort. No reverse membership record (`ART#/COLLECTION#`) is written in the current implementation despite the spec requiring it.

### Function Signatures

```typescript
// packages/shared/src/db/collections.repository.ts

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

// lambdas/artworks/src/routes/list-collection-pieces.ts
export const listCollectionPiecesRoute = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext,
  collectionId: string
): Promise<APIGatewayProxyStructuredResultV2>

// lambdas/artworks/src/routes/add-collection-piece.ts
export const addCollectionPieceRoute = async (...)
// lambdas/artworks/src/routes/remove-collection-piece.ts
export const removeCollectionPieceRoute = async (...)
```

### Handler Boilerplate

```typescript
// GET /collections/{collectionId}/pieces — JWT required (owner or public collection)
export const listCollectionPiecesRoute = async (_event, context, collectionId) => {
  const collection = await getCollection(docClient, collectionId)
  if (!collection) throw new NotFoundError('Collection not found')
  if (!collection.isPublic && collection.ownerId !== userId) throw new ForbiddenError(...)
  const result = await listCollectionItems(docClient, collectionId, 100)
  return ok({ pieces: result.items.map(item => ({ artworkId: item.artworkId, displayOrder: item.order })) })
}
```

### Implementation Steps

1. `GET /collections/{collectionId}/pieces` (`listCollectionPiecesRoute`):
   - JWT required.
   - Fetches collection metadata; 404 if not found.
   - Access check: private collections require `collection.ownerId === userId`; throws `ForbiddenError` otherwise.
   - `listCollectionItems(docClient, collectionId, 100)` queries `COLLECTION#{id}, SK begins_with ARTWORK#`; returns sorted by SK (ascending order).
   - Maps items to `{ artworkId, displayOrder }` (minimal response — full artwork data fetched separately).

2. `POST /collections/{collectionId}/pieces` (`addCollectionPieceRoute`):
   - JWT required; must be collection owner.
   - Body: `{ artworkId, order? }`.
   - Validates artwork belongs to same Author as collection.
   - `getCollectionItemByArtworkId()` scans items in collection and filters by `artworkId`; if exists → idempotent update of `sortOrder`.
   - `addArtPieceToCollection()` writes forward membership record.

3. `DELETE /collections/{collectionId}/pieces/{artworkId}` (`removeCollectionPieceRoute`):
   - JWT required; must be collection owner.
   - `getCollectionItemByArtworkId()` finds the item (needed to get `order` for SK construction).
   - `removeArtPieceFromCollection()` deletes by full SK (requires `order` to reconstruct the composite SK).
   - No-op if piece not in collection → 200.

### Integration Test Fixtures

Tests at `lambdas/artworks/src/__tests__/collections.integration.test.ts`.

Seed:
```typescript
// Collection metadata
{ PK: 'COLLECTION#col-001', SK: 'METADATA', collectionId: 'col-001', ownerId: 'author-001', title: 'My Collection', isPublic: true, ... }
// Collection item
{ PK: 'COLLECTION#col-001', SK: 'ARTWORK#00000001#artwork-001', collectionId: 'col-001', artworkId: 'artwork-001', order: 1, addedAt: '...' }
```

Assert: `GET /collections/col-001/pieces` returns `[{ artworkId: 'artwork-001', displayOrder: 1 }]`.

### Decisions & Constraints

- `getCollectionItemByArtworkId()` does a query on the collection PK with `begins_with(SK, 'ARTWORK#')` + in-memory filter on `artworkId` — acceptable for small collections (< 100 items); noted in code comment.
- Reverse membership record (`ART#/COLLECTION#`) is not written in the current implementation — the spec mentioned it but it was deferred. "Collections containing this artwork" queries are not yet needed.
- `order` is embedded in the SK (`padStart(8, '0')`) — DynamoDB lexicographic sort gives order ascending for free without a `ScanIndexForward` sort reversal.
- `listCollectionPiecesRoute` returns `displayOrder` (renamed from `order`) to match the frontend's expected field name.
- Max 100 items fetched per call from `listCollectionItems` — adequate for v1 collections.
