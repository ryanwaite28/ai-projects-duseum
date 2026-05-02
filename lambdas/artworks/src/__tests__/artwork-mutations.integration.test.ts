// =============================================================================
// lambdas/artworks/src/__tests__/artwork-mutations.integration.test.ts
// Integration tests for PUT /artworks/{id}, DELETE /artworks/{id}, GET /artworks/mine
// FR-TESTING-01/02 — Section 15.4
//
// Prerequisites: MiniStack running at localhost:4566
// =============================================================================

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { describe, expect, it } from 'vitest'
import { handler } from '../index.js'
import {
  BUCKET,
  TABLE,
  docClient,
  makeCtx,
  makeEvent,
  s3,
  seedItem,
} from './setup.js'

// ── Seed helpers ──────────────────────────────────────────────────────────────

const AUTHOR_ID = 'author-mut-001'
const OTHER_AUTHOR = 'author-mut-002'
const VIEWER_ID = 'viewer-mut-001'

const seedAuthorProfile = (userId = AUTHOR_ID) =>
  seedItem({
    PK: `USER#${userId}`,
    SK: 'PROFILE#AUTHOR',
    userId,
    profileType:  'AUTHOR',
    status:       'ACTIVE',
    displayName:  'Mutation Author',
    bio:          '',
    profilePhotoS3Key:             null,
    coverPhotoS3Key:               null,
    stripeConnectAccountId:        null,
    authorSubscriptionPriceId:     null,
    authorSubscriptionMonthlyUsd:  null,
    featuredPieceIds:              [],
    createdAt:                     '2025-01-01T00:00:00.000Z',
    totalPiecesCount:              2,
    followerCount:                 0,
    subscriberCount:               0,
  })

const seedViewerProfile = (userId = VIEWER_ID) =>
  seedItem({
    PK: `USER#${userId}`,
    SK: 'PROFILE#VIEWER',
    userId,
    profileType: 'VIEWER',
    status:      'ACTIVE',
    displayName: 'Mutation Viewer',
    createdAt:   '2025-01-01T00:00:00.000Z',
  })

const seedArtwork = (
  artworkId: string,
  authorId: string,
  overrides: Record<string, unknown> = {}
) =>
  seedItem({
    PK: `ARTWORK#${artworkId}`,
    SK: 'METADATA',
    artworkId,
    authorId,
    title:        `Piece ${artworkId}`,
    description:  'Test description',
    tags:         ['test'],
    category:     'PAINTING',
    visibility:   'PUBLIC',
    status:       'PUBLIC',
    'visibility#createdAt': `PUBLIC#2025-06-01T10:00:00.000Z`,
    s3Key:        artworkId,
    mimeType:     'image/jpeg',
    fileSizeBytes: 512_000,
    viewCount:    0,
    commentsEnabled: true,
    notifiedCount: 0,
    reactionCounts: {},
    commentCount:  0,
    publishedAt:  '2025-06-01T10:00:00.000Z',
    createdAt:    '2025-06-01T10:00:00.000Z',
    updatedAt:    '2025-06-01T10:00:00.000Z',
    ...overrides,
  })

const seedS3Object = (key: string) =>
  s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from('fake') }))

// ── PUT /artworks/{artworkId} ─────────────────────────────────────────────────

describe('PUT /artworks/{artworkId}', () => {
  it('updates title and tags; returns updated piece', async () => {
    await seedAuthorProfile()
    await seedArtwork('art-put-001', AUTHOR_ID)
    await seedS3Object('art-put-001')

    const event = makeEvent('PUT', '/artworks/art-put-001', {
      userId: AUTHOR_ID,
      pathParameters: { artworkId: 'art-put-001' },
      body: { title: 'Updated Title', tags: ['new-tag'] },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.title).toBe('Updated Title')
    expect(body.tags).toEqual(['new-tag'])
    expect(body.artworkId).toBe('art-put-001')
  })

  it('sets publishedAt on first publish (DRAFT → PUBLIC)', async () => {
    await seedAuthorProfile()
    await seedArtwork('art-put-002', AUTHOR_ID, {
      visibility: 'DRAFT',
      status: 'DRAFT',
      'visibility#createdAt': 'DRAFT#2025-06-01T10:00:00.000Z',
      publishedAt: null,
    })
    await seedS3Object('art-put-002')

    const event = makeEvent('PUT', '/artworks/art-put-002', {
      userId: AUTHOR_ID,
      pathParameters: { artworkId: 'art-put-002' },
      body: { visibility: 'PUBLIC' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.publishedAt).not.toBeNull()
  })

  it('returns 403 when caller is not the owner', async () => {
    await seedAuthorProfile(OTHER_AUTHOR)
    await seedArtwork('art-put-003', AUTHOR_ID)
    await seedS3Object('art-put-003')

    const event = makeEvent('PUT', '/artworks/art-put-003', {
      userId: OTHER_AUTHOR,
      pathParameters: { artworkId: 'art-put-003' },
      body: { title: 'Hijacked' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(403)
  })

  it('returns 404 for non-existent artworkId', async () => {
    await seedAuthorProfile()

    const event = makeEvent('PUT', '/artworks/no-such-art', {
      userId: AUTHOR_ID,
      pathParameters: { artworkId: 'no-such-art' },
      body: { title: 'Ghost' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 when body is empty', async () => {
    await seedAuthorProfile()
    await seedArtwork('art-put-004', AUTHOR_ID)
    await seedS3Object('art-put-004')

    const event = makeEvent('PUT', '/artworks/art-put-004', {
      userId: AUTHOR_ID,
      pathParameters: { artworkId: 'art-put-004' },
      body: {},
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })
})

// ── DELETE /artworks/{artworkId} ──────────────────────────────────────────────

describe('DELETE /artworks/{artworkId} — soft delete', () => {
  it('archives the artwork and returns 204', async () => {
    await seedAuthorProfile()
    await seedArtwork('art-del-001', AUTHOR_ID)
    await seedS3Object('art-del-001')

    const event = makeEvent('DELETE', '/artworks/art-del-001', {
      userId: AUTHOR_ID,
      pathParameters: { artworkId: 'art-del-001' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(204)

    // Verify DynamoDB status is ARCHIVED
    const item = await docClient.send(
      new GetCommand({ TableName: TABLE, Key: { PK: 'ARTWORK#art-del-001', SK: 'METADATA' } })
    )
    expect(item.Item?.['status']).toBe('ARCHIVED')
  })

  it('returns 404 for already-archived artwork', async () => {
    await seedAuthorProfile()
    await seedArtwork('art-del-002', AUTHOR_ID, { status: 'ARCHIVED' })

    const event = makeEvent('DELETE', '/artworks/art-del-002', {
      userId: AUTHOR_ID,
      pathParameters: { artworkId: 'art-del-002' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when caller is not the owner', async () => {
    await seedAuthorProfile(OTHER_AUTHOR)
    await seedArtwork('art-del-003', AUTHOR_ID)

    const event = makeEvent('DELETE', '/artworks/art-del-003', {
      userId: OTHER_AUTHOR,
      pathParameters: { artworkId: 'art-del-003' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(403)
  })

  it('returns 404 for non-existent artworkId', async () => {
    await seedAuthorProfile()

    const event = makeEvent('DELETE', '/artworks/ghost-artwork', {
      userId: AUTHOR_ID,
      pathParameters: { artworkId: 'ghost-artwork' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /artworks/{artworkId}?permanent=true', () => {
  it('permanently deletes DynamoDB item and S3 object; returns 204', async () => {
    await seedAuthorProfile()
    await seedArtwork('art-perm-001', AUTHOR_ID)
    await seedS3Object('art-perm-001')

    const event = makeEvent('DELETE', '/artworks/art-perm-001', {
      userId: AUTHOR_ID,
      pathParameters: { artworkId: 'art-perm-001' },
      queryStringParameters: { permanent: 'true' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(204)

    const item = await docClient.send(
      new GetCommand({ TableName: TABLE, Key: { PK: 'ARTWORK#art-perm-001', SK: 'METADATA' } })
    )
    expect(item.Item).toBeUndefined()
  })
})

// ── GET /artworks/mine ────────────────────────────────────────────────────────

describe('GET /artworks/mine', () => {
  it('returns all own pieces (PUBLIC, PRIVATE, DRAFT) for Author', async () => {
    await seedAuthorProfile()
    await seedS3Object('mine-pub-001')
    await seedS3Object('mine-priv-001')
    await seedS3Object('mine-draft-001')
    await seedArtwork('mine-pub-001',   AUTHOR_ID, { visibility: 'PUBLIC',  status: 'PUBLIC',  createdAt: '2025-05-01T00:00:00.000Z', 'visibility#createdAt': 'PUBLIC#2025-05-01T00:00:00.000Z' })
    await seedArtwork('mine-priv-001',  AUTHOR_ID, { visibility: 'PRIVATE', status: 'PRIVATE', createdAt: '2025-05-02T00:00:00.000Z', 'visibility#createdAt': 'PRIVATE#2025-05-02T00:00:00.000Z' })
    await seedArtwork('mine-draft-001', AUTHOR_ID, { visibility: 'DRAFT',   status: 'DRAFT',   createdAt: '2025-05-03T00:00:00.000Z', 'visibility#createdAt': 'DRAFT#2025-05-03T00:00:00.000Z', publishedAt: null })

    const event = makeEvent('GET', '/artworks/mine', { userId: AUTHOR_ID })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items.length).toBeGreaterThanOrEqual(3)

    const visibilities = body.items.map((i: { visibility: string }) => i.visibility)
    expect(visibilities).toContain('PUBLIC')
    expect(visibilities).toContain('PRIVATE')
    expect(visibilities).toContain('DRAFT')
  })

  it('response shape includes imageUrl on each item', async () => {
    await seedAuthorProfile()
    await seedArtwork('mine-shape-001', AUTHOR_ID)
    await seedS3Object('mine-shape-001')

    const event = makeEvent('GET', '/artworks/mine', { userId: AUTHOR_ID })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    const piece = body.items.find((i: { artworkId: string }) => i.artworkId === 'mine-shape-001')
    expect(piece).toBeDefined()
    expect(typeof piece.imageUrl).toBe('string')
    expect(piece.imageUrl.length).toBeGreaterThan(0)
  })

  it('returns 403 for caller without an Author profile', async () => {
    await seedViewerProfile()

    const event = makeEvent('GET', '/artworks/mine', { userId: VIEWER_ID })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(403)
  })

  it('respects visibility filter query param', async () => {
    await seedAuthorProfile()
    await seedArtwork('mine-vis-pub',  AUTHOR_ID, { visibility: 'PUBLIC',  status: 'PUBLIC',  createdAt: '2025-05-01T00:00:00.000Z', 'visibility#createdAt': 'PUBLIC#2025-05-01T00:00:00.000Z' })
    await seedArtwork('mine-vis-priv', AUTHOR_ID, { visibility: 'PRIVATE', status: 'PRIVATE', createdAt: '2025-05-02T00:00:00.000Z', 'visibility#createdAt': 'PRIVATE#2025-05-02T00:00:00.000Z' })
    await seedS3Object('mine-vis-pub')
    await seedS3Object('mine-vis-priv')

    const event = makeEvent('GET', '/artworks/mine?visibility=PRIVATE', {
      userId: AUTHOR_ID,
      queryStringParameters: { visibility: 'PRIVATE' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    const visibilities = body.items.map((i: { visibility: string }) => i.visibility)
    // all returned items should be PRIVATE
    expect(visibilities.every((v: string) => v === 'PRIVATE')).toBe(true)
  })
})
