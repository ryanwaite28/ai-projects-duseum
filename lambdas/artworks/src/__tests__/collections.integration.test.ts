// =============================================================================
// lambdas/artworks/src/__tests__/collections.integration.test.ts
// Integration tests for Collections CRUD — FR-COL-01–06, §15.3
//
// Prerequisites: MiniStack running at localhost:4566
// Tests use ENVIRONMENT=local JWT stub — no real Cognito verification.
// =============================================================================

import { randomUUID } from 'node:crypto'
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

// UUID artwork IDs — routes validate artworkId as UUID
const ART_PUB_01  = randomUUID()
const ART_PRIV_01 = randomUUID()
const ART_PUB_02  = randomUUID()
const ART_PRIV_02 = randomUUID()
const ART_DEL_01  = randomUUID()
const ART_RM_01   = randomUUID()
const ART_RM_02   = randomUUID()

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
      body:   { title: 'My First Collection', description: 'A test.', visibility: 'FREE' },
    }))

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.collectionId).toBeTruthy()
    expect(body.title).toBe('My First Collection')
    expect(body.visibility).toBe('FREE')
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
      seedArtwork(ART_PUB_01, 'PUBLIC'),
      seedArtwork(ART_PRIV_01, 'PRIVATE'),
    ])

    // Create collection
    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Mixed Visibility', visibility: 'FREE' },
    }))
    expect(createRes.statusCode).toBe(201)
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    // Add PUBLIC piece (order 1)
    const addPub = await callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
      body:   { artworkId: ART_PUB_01, order: 1 },
    }))
    expect(addPub.statusCode).toBe(201)

    // Add PRIVATE piece (order 2)
    const addPriv = await callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
      body:   { artworkId: ART_PRIV_01, order: 2 },
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
    expect(freeBody.pieces[0].artworkId).toBe(ART_PUB_01)

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
      seedArtwork(ART_PUB_02, 'PUBLIC'),
      seedArtwork(ART_PRIV_02, 'PRIVATE'),
    ])

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Owner View Test', visibility: 'FREE' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    await Promise.all([
      callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
        userId: AUTHOR_ID,
        pathParameters: { collectionId },
        body:   { artworkId: ART_PUB_02, order: 1 },
      })),
      callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
        userId: AUTHOR_ID,
        pathParameters: { collectionId },
        body:   { artworkId: ART_PRIV_02, order: 2 },
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
// SUBSCRIBER_ONLY collection visibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('SUBSCRIBER_ONLY collection access control', () => {
  it('returns 200 with access=AUTH_REQUIRED to unauthenticated viewer — FR-COL-08', async () => {
    await seedAuthorProfile()

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Subscriber-Only Collection', visibility: 'SUBSCRIBER_ONLY' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    // No auth
    const res = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      pathParameters: { collectionId },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.access).toBe('AUTH_REQUIRED')
    expect(body.pieces).toEqual([])
    expect(body.ownerId).toBe(AUTHOR_ID)
    expect(body.title).toBe('Subscriber-Only Collection')
  })

  it('returns 200 with access=SUBSCRIBER_ONLY_GATED to authenticated non-subscriber — FR-COL-08', async () => {
    await seedAuthorProfile()

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Subscriber-Only Collection 2', visibility: 'SUBSCRIBER_ONLY' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    const res = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: FREE_VIEWER,
      pathParameters: { collectionId },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.access).toBe('SUBSCRIBER_ONLY_GATED')
    expect(body.pieces).toEqual([])
    expect(body.ownerId).toBe(AUTHOR_ID)
  })

  it('returns 200 with access=GRANTED to active Author subscriber — FR-COL-08', async () => {
    await Promise.all([seedAuthorProfile(), seedAuthorSubscription(SUBSCRIBER)])

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Subscriber-Only', visibility: 'SUBSCRIBER_ONLY' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    const res = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: SUBSCRIBER,
      pathParameters: { collectionId },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.access).toBe('GRANTED')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE collection
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /collections/{collectionId}', () => {
  it('deletes collection; subsequent GET returns 404; art pieces unaffected', async () => {
    await Promise.all([seedAuthorProfile(), seedArtwork(ART_DEL_01, 'PUBLIC')])

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'To Be Deleted' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    await callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
      body:   { artworkId: ART_DEL_01, order: 1 },
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
      Key: { PK: `ARTWORK#${ART_DEL_01}`, SK: 'METADATA' },
    }))
    expect(pieceItem.Item?.artworkId).toBe(ART_DEL_01)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Remove piece from collection
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /collections/{collectionId}/pieces/{artworkId}', () => {
  it('removes a piece from the collection; subsequent GET omits it', async () => {
    await Promise.all([
      seedAuthorProfile(),
      seedArtwork(ART_RM_01, 'PUBLIC'),
      seedArtwork(ART_RM_02, 'PUBLIC'),
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
        body:   { artworkId: ART_RM_01, order: 1 },
      })),
      callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
        userId: AUTHOR_ID,
        pathParameters: { collectionId },
        body:   { artworkId: ART_RM_02, order: 2 },
      })),
    ])

    const rmRes = await callHandler(makeEvent('DELETE', `/collections/${collectionId}/pieces/${ART_RM_01}`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId, artworkId: ART_RM_01 },
    }))
    expect(rmRes.statusCode).toBe(200)

    const getRes = await callHandler(makeEvent('GET', `/collections/${collectionId}`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
    }))
    expect(getRes.statusCode).toBe(200)
    const getBody = JSON.parse(getRes.body)
    expect(getBody.totalPieceCount).toBe(1)
    expect(getBody.pieces[0].artworkId).toBe(ART_RM_02)
  })

  it('returns 404 when piece is not in the collection', async () => {
    await seedAuthorProfile()

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Empty' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    const res = await callHandler(makeEvent('DELETE', `/collections/${collectionId}/pieces/${randomUUID()}`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId, artworkId: randomUUID() },
    }))
    expect(res.statusCode).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GET /authors/{authorId}/collections
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /authors/{authorId}/collections', () => {
  it('returns only FREE collections for unauthenticated viewers', async () => {
    await seedAuthorProfile()

    // FREE collection
    await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Free Col', visibility: 'FREE' },
    }))
    // SUBSCRIBER_ONLY collection
    await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Subscriber Col', visibility: 'SUBSCRIBER_ONLY' },
    }))

    const res = await callHandler(makeEvent('GET', `/authors/${AUTHOR_ID}/collections`, {
      pathParameters: { authorId: AUTHOR_ID },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].title).toBe('Free Col')
  })

  it('includes pieceCount and coverPieceUrl in list response', async () => {
    const coverId = randomUUID()
    await Promise.all([
      seedAuthorProfile(),
      seedArtwork(coverId, 'PUBLIC'),
    ])

    // Create collection
    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Enriched Col', visibility: 'FREE' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    // Add one piece
    await callHandler(makeEvent('POST', `/collections/${collectionId}/pieces`, {
      userId: AUTHOR_ID,
      pathParameters: { collectionId },
      body:   { artworkId: coverId, order: 1 },
    }))

    const res = await callHandler(makeEvent('GET', `/authors/${AUTHOR_ID}/collections`, {
      pathParameters: { authorId: AUTHOR_ID },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const enriched = body.items.find((c: { collectionId: string }) => c.collectionId === collectionId)
    expect(enriched).toBeDefined()
    expect(enriched.pieceCount).toBe(1)
    expect(enriched.coverPieceUrl).toContain(`media.test.duseum.com/${coverId}`)
  })

  it('returns pieceCount=0 and coverPieceUrl=null for empty collection', async () => {
    await seedAuthorProfile()

    const createRes = await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Empty Col', visibility: 'FREE' },
    }))
    const { collectionId } = JSON.parse(createRes.body) as { collectionId: string }

    const res = await callHandler(makeEvent('GET', `/authors/${AUTHOR_ID}/collections`, {
      pathParameters: { authorId: AUTHOR_ID },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const col = body.items.find((c: { collectionId: string }) => c.collectionId === collectionId)
    expect(col).toBeDefined()
    expect(col.pieceCount).toBe(0)
    expect(col.coverPieceUrl).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GET /collections — FR-DISC-07 browse endpoint
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /collections (browse)', () => {
  it('returns 200 with correct top-level shape', async () => {
    await seedAuthorProfile()
    await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Browse Col A', visibility: 'FREE' },
    }))

    const res = await callHandler(makeEvent('GET', '/collections', {}))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  it('returns FREE collections with required fields on each item', async () => {
    await seedAuthorProfile()
    await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Browse Col B', visibility: 'FREE' },
    }))

    const res = await callHandler(makeEvent('GET', '/collections', {}))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const item = body.items[0]
    expect(item).toHaveProperty('collectionId')
    expect(item).toHaveProperty('title')
    expect(item).toHaveProperty('visibility', 'FREE')
    expect(item).toHaveProperty('authorId', AUTHOR_ID)
    expect(item).toHaveProperty('authorDisplayName')
    expect(item).toHaveProperty('pieceCount')
    expect(item).toHaveProperty('posterUrl')
    expect(item).toHaveProperty('createdAt')
  })

  it('does NOT include SUBSCRIBER_ONLY collections', async () => {
    await seedAuthorProfile()
    await Promise.all([
      callHandler(makeEvent('POST', '/collections', {
        userId: AUTHOR_ID,
        body:   { title: 'Visible Free', visibility: 'FREE' },
      })),
      callHandler(makeEvent('POST', '/collections', {
        userId: AUTHOR_ID,
        body:   { title: 'Hidden Sub Only', visibility: 'SUBSCRIBER_ONLY' },
      })),
    ])

    const res = await callHandler(makeEvent('GET', '/collections', {}))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items.every((c: { visibility: string }) => c.visibility === 'FREE')).toBe(true)
    expect(body.items.some((c: { title: string }) => c.title === 'Hidden Sub Only')).toBe(false)
  })

  it('returns empty items array when no FREE collections exist', async () => {
    await seedAuthorProfile()
    await callHandler(makeEvent('POST', '/collections', {
      userId: AUTHOR_ID,
      body:   { title: 'Sub Only', visibility: 'SUBSCRIBER_ONLY' },
    }))

    const res = await callHandler(makeEvent('GET', '/collections', {}))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(0)
    expect(body).not.toHaveProperty('cursor')
  })

  it('paginates correctly — cursor from page 1 fetches page 2', async () => {
    await seedAuthorProfile()
    for (let i = 1; i <= 3; i++) {
      await callHandler(makeEvent('POST', '/collections', {
        userId: AUTHOR_ID,
        body:   { title: `Paginate Col ${i}`, visibility: 'FREE' },
      }))
    }

    const page1Res = await callHandler(makeEvent('GET', '/collections', {
      queryStringParameters: { limit: '2', sort: 'newest' },
    }))
    expect(page1Res.statusCode).toBe(200)
    const page1 = JSON.parse(page1Res.body)
    expect(page1.items).toHaveLength(2)
    expect(page1).toHaveProperty('cursor')

    const page2Res = await callHandler(makeEvent('GET', '/collections', {
      queryStringParameters: { limit: '2', sort: 'newest', cursor: page1.cursor },
    }))
    expect(page2Res.statusCode).toBe(200)
    const page2 = JSON.parse(page2Res.body)
    expect(page2.items).toHaveLength(1)
    expect(page2).not.toHaveProperty('cursor')

    const allIds = [...page1.items, ...page2.items].map((c: { collectionId: string }) => c.collectionId)
    expect(new Set(allIds).size).toBe(3)
  })

  it('returns 400 for invalid sort parameter', async () => {
    const res = await callHandler(makeEvent('GET', '/collections', {
      queryStringParameters: { sort: 'oldest' },
    }))
    expect(res.statusCode).toBe(400)
  })
})
