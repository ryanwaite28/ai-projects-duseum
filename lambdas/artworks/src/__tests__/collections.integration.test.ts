// =============================================================================
// lambdas/artworks/src/__tests__/collections.integration.test.ts
// Integration tests for Collections CRUD — FR-COL-01–06, §15.3
//
// Prerequisites: MiniStack running at localhost:4566
// Tests use ENVIRONMENT=local JWT stub — no real Cognito verification.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { handler } from '../index.js'
import {
  TABLE,
  docClient,
  makeCtx,
  makeEvent,
  seedItem,
} from './setup.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTHOR_ID    = 'col-author-001'
const SUBSCRIBER   = 'col-subscriber-001'
const FREE_VIEWER  = 'col-free-viewer-001'

// ── Seed helpers ──────────────────────────────────────────────────────────────

type HandlerResult = { statusCode: number; body: string }

const callHandler = async (event: unknown): Promise<HandlerResult> => {
  const result = await handler(event as never, makeCtx())
  return result as HandlerResult
}

const seedAuthorProfile = (userId = AUTHOR_ID) =>
  seedItem({
    PK:          `USER#${userId}`,
    SK:          'PROFILE#AUTHOR',
    userId,
    profileType: 'AUTHOR',
    status:      'ACTIVE',
    displayName: `Author ${userId}`,
    createdAt:   '2025-01-01T00:00:00.000Z',
  })

const seedArtwork = (artworkId: string, visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC') =>
  seedItem({
    PK:                    `ARTWORK#${artworkId}`,
    SK:                    'METADATA',
    artworkId,
    authorId:              AUTHOR_ID,
    title:                 `Piece ${artworkId}`,
    description:           '',
    tags:                  [],
    category:              'PAINTING',
    visibility,
    status:                visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
    'visibility#createdAt': `${visibility}#2025-06-01T00:00:00.000Z`,
    s3Key:                 artworkId,
    mimeType:              'image/jpeg',
    fileSizeBytes:         1024,
    viewCount:             0,
    commentsEnabled:       true,
    notifiedCount:         0,
    reactionCounts:        {},
    commentCount:          0,
    createdAt:             '2025-06-01T00:00:00.000Z',
    updatedAt:             '2025-06-01T00:00:00.000Z',
    publishedAt:           '2025-06-01T00:00:00.000Z',
  })

const seedAuthorSubscription = (userId: string, authorId = AUTHOR_ID) =>
  seedItem({
    PK:                   `USER#${userId}`,
    SK:                   `SUB#AUTHOR#${authorId}`,
    userId,
    targetId:             authorId,
    status:               'ACTIVE',
    stripeSubscriptionId: `sub_test_${userId}`,
    stripeCustomerId:     `cus_test_${userId}`,
    currentPeriodEnd:     '2026-12-31T00:00:00.000Z',
    createdAt:            '2025-01-01T00:00:00.000Z',
  })

// ═══════════════════════════════════════════════════════════════════════════════
// POST /collections
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /collections', () => {
  it('creates a collection and returns 201', async () => {
    await seedAuthorProfile()

    const res = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'My First Collection', description: 'A test.', isPublic: true },
    }))

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.collectionId).toBeTruthy()
    expect(body.title).toBe('My First Collection')
    expect(body.isPublic).toBe(true)
    expect(body.ownerId).toBe(AUTHOR_ID)
  })

  it('returns 403 when caller has no Author profile', async () => {
    const res = await callHandler(makeEvent('POST', '/collections', {
      userId: FREE_VIEWER,
      body:   { title: 'Unauthorized' },
    }))
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 when title is missing', async () => {
    await seedAuthorProfile()

    const res = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { description: 'No title' },
    }))
    expect(res.statusCode).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Full lifecycle: create → add pieces → GET with access-tier filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('Collection lifecycle: add pieces → GET access-tier filtering', () => {
  it('GET returns pieces filtered by viewer access tier — visible < total when PRIVATE pieces present', async () => {
    await Promise.all([
      seedAuthorProfile(),
      seedArtwork('col-art-pub-01', 'PUBLIC'),
      seedArtwork('col-art-priv-01', 'PRIVATE'),
    ])

    // Create collection
    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Mixed Visibility', isPublic: true },
    }))
    expect(createRes.statusCode).toBe(201)
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    // Add PUBLIC piece (order 1)
    const addPub = await callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
      body:   { artworkId: 'col-art-pub-01', order: 1 },
    }))
    expect(addPub.statusCode).toBe(201)

    // Add PRIVATE piece (order 2)
    const addPriv = await callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
      body:   { artworkId: 'col-art-priv-01', order: 2 },
    }))
    expect(addPriv.statusCode).toBe(201)

    // GET as free viewer (no subscription) — should see PUBLIC only
    const freeRes = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: FREE_VIEWER,
      pathParameters: { collectionId },
    }))
    expect(freeRes.statusCode).toBe(200)
    const freeBody = JSON.parse(freeRes.body)
    expect(freeBody.totalPieceCount).toBe(2)
    expect(freeBody.visiblePieceCount).toBe(1)
    expect(freeBody.pieces).toHaveLength(1)
    expect(freeBody.pieces[0].artworkId).toBe('col-art-pub-01')

    // GET as author subscriber — should see both pieces
    await seedAuthorSubscription(SUBSCRIBER)
    const subRes = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: SUBSCRIBER,
      pathParameters: { collectionId },
    }))
    expect(subRes.statusCode).toBe(200)
    const subBody = JSON.parse(subRes.body)
    expect(subBody.totalPieceCount).toBe(2)
    expect(subBody.visiblePieceCount).toBe(2)
  })

  it('GET as owner shows all pieces regardless of visibility', async () => {
    await Promise.all([
      seedAuthorProfile(),
      seedArtwork('col-art-pub-02', 'PUBLIC'),
      seedArtwork('col-art-priv-02', 'PRIVATE'),
    ])

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Owner View Test', isPublic: true },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    await Promise.all([
      callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
        userId: AUTHOR_ID,
        pathParameters: { collectionId },
        body:   { artworkId: 'col-art-pub-02', order: 1 },
      })),
      callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
        userId: AUTHOR_ID,
        pathParameters: { collectionId },
        body:   { artworkId: 'col-art-priv-02', order: 2 },
      })),
    ])

    const ownerRes = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
    }))
    expect(ownerRes.statusCode).toBe(200)
    const ownerBody = JSON.parse(ownerRes.body)
    expect(ownerBody.totalPieceCount).toBe(2)
    expect(ownerBody.visiblePieceCount).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVATE collection visibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('PRIVATE collection access control', () => {
  it('returns 403 to unauthenticated viewer for PRIVATE collection', async () => {
    await seedAuthorProfile()

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Private Collection', isPublic: false },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    // No auth
    const res = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      pathParameters: { collectionId },
    }))
    expect(res.statusCode).toBe(403)
  })

  it('returns 403 to non-subscriber for PRIVATE collection', async () => {
    await seedAuthorProfile()

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Private Collection 2', isPublic: false },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    const res = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: FREE_VIEWER,
      pathParameters: { collectionId },
    }))
    expect(res.statusCode).toBe(403)
  })

  it('returns 200 to active Author subscriber for PRIVATE collection', async () => {
    await Promise.all([seedAuthorProfile(), seedAuthorSubscription(SUBSCRIBER)])

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Subscriber-Only', isPublic: false },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    const res = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: SUBSCRIBER,
      pathParameters: { collectionId },
    }))
    expect(res.statusCode).toBe(200)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE collection
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /collections/{collectionId}', () => {
  it('deletes collection; subsequent GET returns 404; art pieces unaffected', async () => {
    await Promise.all([seedAuthorProfile(), seedArtwork('col-art-del-01', 'PUBLIC')])

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'To Be Deleted' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    await callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
      body:   { artworkId: 'col-art-del-01', order: 1 },
    }))

    const delRes = await callHandler(makeEvent('DELETE', `/collections/${collectionId}`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
    }))
    expect(delRes.statusCode).toBe(200)
    expect(JSON.parse(delRes.body).collectionId).toBe(collectionId)

    // Collection no longer accessible
    const getRes = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
    }))
    expect(getRes.statusCode).toBe(404)

    // Art piece still exists in DynamoDB
    const pieceItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: 'ARTWORK#col-art-del-01', SK: 'METADATA' },
    }))
    expect(pieceItem.Item?.artworkId).toBe('col-art-del-01')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Remove piece from collection
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /collections/{collectionId}/pieces/{artworkId}', () => {
  it('removes a piece from the collection; subsequent GET omits it', async () => {
    await Promise.all([
      seedAuthorProfile(),
      seedArtwork('col-art-rm-01', 'PUBLIC'),
      seedArtwork('col-art-rm-02', 'PUBLIC'),
    ])

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Remove Test' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    await Promise.all([
      callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
        userId: AUTHOR_ID,
        pathParameters: { collectionId },
        body:   { artworkId: 'col-art-rm-01', order: 1 },
      })),
      callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
        userId: AUTHOR_ID,
        pathParameters: { collectionId },
        body:   { artworkId: 'col-art-rm-02', order: 2 },
      })),
    ])

    const rmRes = await callHandler(makeEvent('DELETE', `/collections/${collectionId}/pieces/col-art-rm-01`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId, artworkId: 'col-art-rm-01' },
    }))
    expect(rmRes.statusCode).toBe(200)

    const getRes = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
    }))
    expect(getRes.statusCode).toBe(200)
    const getBody = JSON.parse(getRes.body)
    expect(getBody.totalPieceCount).toBe(1)
    expect(getBody.pieces[0].artworkId).toBe('col-art-rm-02')
  })

  it('returns 404 when piece is not in the collection', async () => {
    await seedAuthorProfile()

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Empty' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    const res = await callHandler(makeEvent('DELETE', `/collections/${collectionId}/pieces/nonexistent-art`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId, artworkId: 'nonexistent-art' },
    }))
    expect(res.statusCode).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GET /authors/{authorId}/collections
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /authors/{authorId}/collections', () => {
  it('returns only PUBLIC collections for the author', async () => {
    await seedAuthorProfile()

    // Public collection
    await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Public Col', isPublic: true },
    }))
    // Private collection
    await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Private Col', isPublic: false },
    }))

    const res = await callHandler(makeEvent('GET', `/authors/${AUTHOR_ID}/collections`, {
      pathParameters: { authorId: AUTHOR_ID },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].title).toBe('Public Col')
  })
})
