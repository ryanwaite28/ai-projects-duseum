// =============================================================================
// lambdas/artworks/src/__tests__/get-artwork.integration.test.ts
// Integration tests for GET /artworks/{artworkId} — Section 15.3
//
// Prerequisites: MiniStack running at localhost:4566
// Tests use ENVIRONMENT=local JWT stub — no real Cognito verification.
// =============================================================================

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { describe, expect, it } from 'vitest'
import { handler } from '../index.js'
import {
  BUCKET,
  CONFIG_TABLE,
  TABLE,
  docClient,
  makeCtx,
  makeEvent,
  s3,
  seedItem,
} from './setup.js'

// ── Seed helpers ──────────────────────────────────────────────────────────────

const AUTHOR_ID  = 'author-get-test-001'
const VIEWER_ID  = 'viewer-get-test-001'
const PLATFORM_SUB_VIEWER = 'viewer-platform-sub-001'
const AUTHOR_SUB_VIEWER   = 'viewer-author-sub-001'

const baseArtwork = (overrides: Record<string, unknown> = {}) => ({
  PK: 'ARTWORK#art-001',
  SK: 'METADATA',
  artworkId:    'art-001',
  authorId:     AUTHOR_ID,
  title:        'Test Piece',
  description:  'A test artwork',
  tags:         ['test'],
  category:     'PAINTING',
  visibility:   'PUBLIC',
  status:       'PUBLIC',
  'visibility#createdAt': 'PUBLIC#2025-08-01T10:00:00.000Z',
  s3Key:        'art-001',
  mimeType:     'image/jpeg',
  fileSizeBytes: 1_024_000,
  viewCount:    0,
  commentsEnabled: true,
  notifiedCount: 0,
  reactionCounts: {},
  commentCount:  0,
  createdAt:    '2025-08-01T10:00:00.000Z',
  updatedAt:    '2025-08-01T10:00:00.000Z',
  publishedAt:  '2025-08-01T10:00:00.000Z',
  ...overrides,
})

const seedArtwork = (overrides: Record<string, unknown> = {}) =>
  seedItem(baseArtwork(overrides))

const seedS3Object = (key = 'art-001') =>
  s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from('fake-image') }))

const seedPlatformSub = (userId: string) =>
  seedItem({ PK: `USER#${userId}`, SK: 'SUB#PLATFORM', status: 'ACTIVE' })

const seedAuthorSub = (viewerId: string, authorId: string) =>
  seedItem({ PK: `USER#${viewerId}`, SK: `SUB#AUTHOR#${authorId}`, status: 'ACTIVE' })

const seedAuthorProfile = (authorId: string, displayName: string) =>
  seedItem({
    PK: `USER#${authorId}`,
    SK: 'PROFILE#AUTHOR',
    userId: authorId,
    profileType: 'AUTHOR',
    status: 'ACTIVE',
    displayName,
    bio: '',
  })

// Plant multiple PUBLIC pieces by the same author to control free-tier rank.
// FREE_TIER_LIMIT seeded as 3 in setup.ts.
const seedPublicPiecesForAuthor = async (authorId: string, count: number) => {
  for (let i = 1; i <= count; i++) {
    const id  = `art-rank-${i.toString().padStart(3, '0')}`
    const ts  = `2025-07-0${i}T10:00:00.000Z`
    await seedItem({
      PK: `ARTWORK#${id}`,
      SK: 'METADATA',
      artworkId:   id,
      authorId,
      title:       `Rank ${i}`,
      description: '',
      tags:        [],
      category:    'PAINTING',
      visibility:  'PUBLIC',
      status:      'PUBLIC',
      'visibility#createdAt': `PUBLIC#${ts}`,
      s3Key:       id,
      mimeType:    'image/jpeg',
      fileSizeBytes: 100,
      viewCount: 0,
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /artworks/{artworkId}', () => {

  it('returns 404 for a non-existent artworkId', async () => {
    const event = makeEvent('GET', '/artworks/nonexistent', {
      pathParameters: { artworkId: 'nonexistent' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for an archived piece', async () => {
    await seedArtwork({ status: 'ARCHIVED' })
    const event = makeEvent('GET', '/artworks/art-001', {
      pathParameters: { artworkId: 'art-001' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(404)
  })

  it('returns 200 with plain CloudFront URL for public piece within free tier (unauthenticated)', async () => {
    await seedAuthorProfile(AUTHOR_ID, 'Test Author')
    await seedArtwork()  // rank 1 (only piece) — within free tier limit of 3
    const event = makeEvent('GET', '/artworks/art-001', {
      pathParameters: { artworkId: 'art-001' },
    })
    const res  = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.artworkId).toBe('art-001')
    expect(body.imageUrl).toContain('media.test.duseum.com/art-001')
    expect(body.imageUrlExpiresAt).toBeUndefined()
    expect(body.authorDisplayName).toBe('Test Author')
  })

  it('returns 402 for public piece beyond free tier for unauthenticated caller', async () => {
    // Seed 3 earlier pieces + 1 target piece at rank 4 (beyond free tier limit of 3)
    await seedPublicPiecesForAuthor(AUTHOR_ID, 3)
    await seedArtwork({ createdAt: '2025-08-01T10:00:00.000Z' }) // rank 4
    const event = makeEvent('GET', '/artworks/art-001', {
      pathParameters: { artworkId: 'art-001' },
    })
    const res  = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(402)
    const body = JSON.parse(res.body!)
    expect(body.error.code).toBe('PAYMENT_REQUIRED')
  })

  it('returns 200 for platform subscriber viewing piece beyond free tier', async () => {
    await seedPublicPiecesForAuthor(AUTHOR_ID, 3)
    await seedArtwork({ createdAt: '2025-08-01T10:00:00.000Z' }) // rank 4
    await seedPlatformSub(PLATFORM_SUB_VIEWER)
    const event = makeEvent('GET', '/artworks/art-001', {
      userId:         PLATFORM_SUB_VIEWER,
      pathParameters: { artworkId: 'art-001' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.imageUrl).toContain('media.test.duseum.com')
    expect(body.imageUrlExpiresAt).toBeUndefined()
  })

  it('returns 402 for PRIVATE piece when caller is not an Author subscriber', async () => {
    await seedArtwork({
      visibility:   'PRIVATE',
      status:       'PRIVATE',
      'visibility#createdAt': 'PRIVATE#2025-08-01T10:00:00.000Z',
    })
    const event = makeEvent('GET', '/artworks/art-001', {
      userId:         VIEWER_ID,
      pathParameters: { artworkId: 'art-001' },
    })
    const res  = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(402)
    const body = JSON.parse(res.body!)
    expect(body.error.code).toBe('PAYMENT_REQUIRED')
  })

  it('returns 200 with signed URL for PRIVATE piece when caller is Author subscriber', async () => {
    await seedArtwork({
      visibility:   'PRIVATE',
      status:       'PRIVATE',
      'visibility#createdAt': 'PRIVATE#2025-08-01T10:00:00.000Z',
    })
    await seedAuthorSub(AUTHOR_SUB_VIEWER, AUTHOR_ID)
    const event = makeEvent('GET', '/artworks/art-001', {
      userId:         AUTHOR_SUB_VIEWER,
      pathParameters: { artworkId: 'art-001' },
    })
    // getCloudfrontPrivateKey reads __TEST_CLOUDFRONT_PRIVATE_KEY__ env var
    // (set in setup.ts beforeAll) so no Secrets Manager call is needed here.
    const res  = await handler(event as never, makeCtx())

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.imageUrl).toBeDefined()
    expect(body.imageUrlExpiresAt).toBeDefined()
  })

  it('returns 200 for DRAFT piece when the Author accesses their own draft', async () => {
    await seedArtwork({
      visibility:   'DRAFT',
      status:       'DRAFT',
      'visibility#createdAt': 'DRAFT#2025-08-01T10:00:00.000Z',
      publishedAt:  null,
    })
    const event = makeEvent('GET', '/artworks/art-001', {
      userId:         AUTHOR_ID,
      pathParameters: { artworkId: 'art-001' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)
  })

  it('returns 403 for DRAFT piece when a non-author viewer accesses it', async () => {
    await seedArtwork({
      visibility:   'DRAFT',
      status:       'DRAFT',
      'visibility#createdAt': 'DRAFT#2025-08-01T10:00:00.000Z',
      publishedAt:  null,
    })
    const event = makeEvent('GET', '/artworks/art-001', {
      userId:         VIEWER_ID,
      pathParameters: { artworkId: 'art-001' },
    })
    const res  = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(403)
    const body = JSON.parse(res.body!)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('includes authorIconUrl: null when author has no profile photo', async () => {
    await seedAuthorProfile(AUTHOR_ID, 'Test Author')
    await seedArtwork()
    const event = makeEvent('GET', '/artworks/art-001', {
      pathParameters: { artworkId: 'art-001' },
    })
    const res  = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(Object.prototype.hasOwnProperty.call(body, 'authorIconUrl')).toBe(true)
    expect(body.authorIconUrl).toBeNull()
  })

  it('includes authorIconUrl as a public URL when author has a profile photo', async () => {
    await seedItem({
      PK:               `USER#${AUTHOR_ID}`,
      SK:               'PROFILE#AUTHOR',
      userId:           AUTHOR_ID,
      profileType:      'AUTHOR',
      status:           'ACTIVE',
      displayName:      'Test Author',
      bio:              '',
      profilePhotoS3Key: 'icon-key-abc',
    })
    await seedArtwork()
    const event = makeEvent('GET', '/artworks/art-001', {
      pathParameters: { artworkId: 'art-001' },
    })
    const res  = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.authorIconUrl).toContain('icon-key-abc')
  })
})
