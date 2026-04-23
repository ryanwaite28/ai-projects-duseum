// =============================================================================
// lambdas/artworks/src/__tests__/list-artworks.integration.test.ts
// Integration tests for GET /artworks — Section 15.3, 6.5, 1.4
//
// Prerequisites: MiniStack running at localhost:4566
// FREE_TIER_LIMIT seeded as 3 in setup.ts. Tests verify that:
//   - Pieces 1–3 per author are accessible to unauthenticated callers
//   - Piece 4+ per author is locked (REQUIRES_PLATFORM_SUB, no thumbnailUrl)
//   - Platform subscribers see all public pieces
//   - Author subscribers see all pieces by that specific author
//   - Pagination cursor is preserved correctly across annotated responses
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { handler } from '../index.js'
import {
  TABLE,
  docClient,
  makeCtx,
  makeEvent,
  seedItem,
} from './setup.js'
import { clearFreeTierLimitCache } from '@duseum/shared'

// ── Seed helpers ──────────────────────────────────────────────────────────────

const AUTHOR_A     = 'author-list-test-aa1'
const AUTHOR_B     = 'author-list-test-bb2'
const FREE_VIEWER  = 'viewer-list-free-001'
const PLAT_VIEWER  = 'viewer-list-plat-001'
const AUTH_VIEWER  = 'viewer-list-auth-001'

/**
 * Seeds N public pieces for an author with monotonically increasing timestamps.
 * Piece #1 is oldest (rank 1), piece #N is newest (rank N).
 */
const seedPublicPieces = async (authorId: string, count: number, baseDate = '2025-08-') => {
  for (let i = 1; i <= count; i++) {
    const id = `${authorId}-piece-${i.toString().padStart(3, '0')}`
    const ts = `2025-08-${i.toString().padStart(2, '0')}T10:00:00.000Z`
    await seedItem({
      PK: `ARTWORK#${id}`,
      SK: 'METADATA',
      artworkId:   id,
      authorId,
      title:       `Piece ${i} by ${authorId}`,
      description: 'desc',
      tags:        [],
      category:    'PAINTING',
      visibility:  'PUBLIC',
      status:      'PUBLIC',
      'visibility#createdAt': `PUBLIC#${ts}`,
      s3Key:       id,
      mimeType:    'image/jpeg',
      fileSizeBytes: 100,
      viewCount:   0,
      commentsEnabled: true,
      notifiedCount: 0,
      reactionCounts: {},
      commentCount: 0,
      createdAt:   ts,
      updatedAt:   ts,
      publishedAt: ts,
    })
  }
}

const seedPlatformSub = (userId: string) =>
  seedItem({ PK: `USER#${userId}`, SK: 'SUB#PLATFORM', status: 'ACTIVE' })

const seedAuthorSub = (viewerId: string, authorId: string) =>
  seedItem({ PK: `USER#${viewerId}`, SK: `SUB#AUTHOR#${authorId}`, status: 'ACTIVE' })

// Reset the module-level freeTierLimit cache before each test so the seeded
// config value (3) is re-read rather than a stale value from another suite.
beforeEach(() => clearFreeTierLimitCache())

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /artworks — free-tier annotation', () => {

  it('unauthenticated caller: pieces within free tier have thumbnailUrl + accessTier PUBLIC', async () => {
    // Seed 3 pieces (all within limit of 3)
    await seedPublicPieces(AUTHOR_A, 3)

    const event = makeEvent('GET', '/artworks', { queryStringParameters: { authorId: AUTHOR_A } })
    const res   = await handler(event as never, makeCtx())

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.items).toHaveLength(3)

    for (const item of body.items) {
      expect(item.accessTier).toBe('PUBLIC')
      expect(item.thumbnailUrl).toMatch(/media\.test\.duseum\.com/)
    }
  })

  it('unauthenticated caller: piece 4 is locked — REQUIRES_PLATFORM_SUB, no thumbnailUrl', async () => {
    await seedPublicPieces(AUTHOR_A, 4)

    const event = makeEvent('GET', '/artworks', { queryStringParameters: { authorId: AUTHOR_A } })
    const res   = await handler(event as never, makeCtx())

    expect(res.statusCode).toBe(200)
    const body  = JSON.parse(res.body!)
    expect(body.items).toHaveLength(4)

    // GSI-AuthorPublic returns newest first, so items[0] = rank 4 (locked)
    const locked = body.items.find((i: Record<string, unknown>) => i['accessTier'] === 'REQUIRES_PLATFORM_SUB')
    expect(locked).toBeDefined()
    expect(locked.thumbnailUrl).toBeUndefined()
    expect(locked.s3Key).toBeUndefined()

    // Pieces 1–3 are accessible
    const accessible = body.items.filter((i: Record<string, unknown>) => i['accessTier'] === 'PUBLIC')
    expect(accessible).toHaveLength(3)
    for (const item of accessible) {
      expect(item.thumbnailUrl).toBeDefined()
    }
  })

  it('free viewer cannot see s3Key or thumbnailUrl on locked items', async () => {
    await seedPublicPieces(AUTHOR_A, 5)

    const event = makeEvent('GET', '/artworks', {
      userId: FREE_VIEWER,
      queryStringParameters: { authorId: AUTHOR_A },
    })
    const res  = await handler(event as never, makeCtx())
    const body = JSON.parse(res.body!)

    const locked = body.items.filter((i: Record<string, unknown>) => i['accessTier'] === 'REQUIRES_PLATFORM_SUB')
    expect(locked).toHaveLength(2) // pieces 4 and 5
    for (const item of locked) {
      expect(item.s3Key).toBeUndefined()
      expect(item.thumbnailUrl).toBeUndefined()
    }
  })

  it('platform subscriber sees all public pieces with thumbnailUrl', async () => {
    await seedPublicPieces(AUTHOR_A, 5)
    await seedPlatformSub(PLAT_VIEWER)

    const event = makeEvent('GET', '/artworks', {
      userId: PLAT_VIEWER,
      queryStringParameters: { authorId: AUTHOR_A },
    })
    const res  = await handler(event as never, makeCtx())
    const body = JSON.parse(res.body!)

    expect(body.items).toHaveLength(5)
    for (const item of body.items) {
      expect(item.accessTier).toBe('PUBLIC')
      expect(item.thumbnailUrl).toBeDefined()
    }
  })

  it('author subscriber sees all pieces by subscribed author beyond free tier', async () => {
    await seedPublicPieces(AUTHOR_A, 5)
    await seedAuthorSub(AUTH_VIEWER, AUTHOR_A)

    const event = makeEvent('GET', '/artworks', {
      userId: AUTH_VIEWER,
      queryStringParameters: { authorId: AUTHOR_A },
    })
    const res  = await handler(event as never, makeCtx())
    const body = JSON.parse(res.body!)

    expect(body.items).toHaveLength(5)
    for (const item of body.items) {
      expect(item.accessTier).toBe('PUBLIC')
      expect(item.thumbnailUrl).toBeDefined()
    }
  })

  it('author subscriber to A can still see only 3 free pieces from author B', async () => {
    await seedPublicPieces(AUTHOR_A, 2) // both within free tier
    await seedPublicPieces(AUTHOR_B, 5) // 2 locked
    await seedAuthorSub(AUTH_VIEWER, AUTHOR_A) // subscribed to A only

    // Global feed — no authorId filter
    const event = makeEvent('GET', '/artworks', { userId: AUTH_VIEWER })
    const res   = await handler(event as never, makeCtx())
    const body  = JSON.parse(res.body!)

    const authorBItems = body.items.filter((i: Record<string, unknown>) => i['authorId'] === AUTHOR_B)
    const lockedB = authorBItems.filter((i: Record<string, unknown>) => i['accessTier'] === 'REQUIRES_PLATFORM_SUB')
    expect(lockedB).toHaveLength(2) // pieces 4 + 5 of AUTHOR_B are locked

    const authorAItems = body.items.filter((i: Record<string, unknown>) => i['authorId'] === AUTHOR_A)
    for (const item of authorAItems) {
      expect(item.accessTier).toBe('PUBLIC') // all A's pieces accessible (subscribed)
    }
  })

  it('free-tier rank is per-author and independent between authors', async () => {
    await seedPublicPieces(AUTHOR_A, 4) // 1 locked
    await seedPublicPieces(AUTHOR_B, 2) // all accessible

    const event = makeEvent('GET', '/artworks') // global feed, no auth
    const res   = await handler(event as never, makeCtx())
    const body  = JSON.parse(res.body!)

    const lockedA = body.items.filter((i: Record<string, unknown>) =>
      i['authorId'] === AUTHOR_A && i['accessTier'] === 'REQUIRES_PLATFORM_SUB'
    )
    const lockedB = body.items.filter((i: Record<string, unknown>) =>
      i['authorId'] === AUTHOR_B && i['accessTier'] === 'REQUIRES_PLATFORM_SUB'
    )
    expect(lockedA).toHaveLength(1)
    expect(lockedB).toHaveLength(0)
  })

  it('pagination cursor is included in response and works correctly', async () => {
    await seedPublicPieces(AUTHOR_A, 5)

    // Fetch 2 items at a time
    const page1Event = makeEvent('GET', '/artworks', {
      queryStringParameters: { authorId: AUTHOR_A, limit: '2' },
    })
    const res1   = await handler(page1Event as never, makeCtx())
    const body1  = JSON.parse(res1.body!)

    expect(body1.items).toHaveLength(2)
    expect(body1.nextCursor).toBeDefined()

    const page2Event = makeEvent('GET', '/artworks', {
      queryStringParameters: { authorId: AUTHOR_A, limit: '2', cursor: body1.nextCursor },
    })
    const res2  = await handler(page2Event as never, makeCtx())
    const body2 = JSON.parse(res2.body!)

    expect(body2.items).toHaveLength(2)
    // All items across both pages are distinct
    const ids1 = body1.items.map((i: Record<string, unknown>) => i['artworkId'])
    const ids2 = body2.items.map((i: Record<string, unknown>) => i['artworkId'])
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0)
  })

  it('invalid cursor returns 400', async () => {
    const event = makeEvent('GET', '/artworks', {
      queryStringParameters: { cursor: 'not-valid-base64url' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })

  it('invalid category returns 400', async () => {
    const event = makeEvent('GET', '/artworks', {
      queryStringParameters: { category: 'INVALID_CAT' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })

  it('empty result returns items: [] with no nextCursor', async () => {
    const event = makeEvent('GET', '/artworks', {
      queryStringParameters: { authorId: 'author-with-no-pieces' },
    })
    const res  = await handler(event as never, makeCtx())
    const body = JSON.parse(res.body!)

    expect(res.statusCode).toBe(200)
    expect(body.items).toHaveLength(0)
    expect(body.nextCursor).toBeUndefined()
  })
})
