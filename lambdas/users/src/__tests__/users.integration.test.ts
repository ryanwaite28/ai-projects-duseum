// =============================================================================
// lambdas/users/src/__tests__/users.integration.test.ts
// Integration tests for users-lambda routes — Section 15.3
//
// Prerequisites: MiniStack running at localhost:4566
// =============================================================================

import { describe, expect, it } from 'vitest'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { handler } from '../index.js'
import { TABLE, docClient, makeCtx, makeEvent, seedItem } from './setup.js'

// ── Seed helpers ──────────────────────────────────────────────────────────────

const USER_ID   = 'user-test-001'
const AUTHOR_ID = 'author-test-001'
const VIEWER_ID = 'viewer-test-001'

const seedUserAccount = (userId = USER_ID) =>
  seedItem({
    PK: `USER#${userId}`, SK: 'PROFILE',
    userId, email: `${userId}@test.com`,
    systemRole: 'USER', emailVerified: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  })

const seedViewerProfile = (userId = USER_ID) =>
  seedItem({
    PK: `USER#${userId}`, SK: 'PROFILE#VIEWER',
    userId, profileType: 'VIEWER', status: 'ACTIVE',
    displayName: 'Test Viewer',
    createdAt: new Date().toISOString(),
    notificationGlobalOptOut: false,
    defaultNotificationPref: 'ALL_NEW_PIECES',
  })

const seedAuthorProfile = (userId = AUTHOR_ID, overrides: Record<string, unknown> = {}) =>
  seedItem({
    PK: `USER#${userId}`, SK: 'PROFILE#AUTHOR',
    userId, profileType: 'AUTHOR', status: 'ACTIVE',
    displayName: 'Test Author', bio: 'A test bio.',
    profilePhotoS3Key: null, coverPhotoS3Key: null,
    stripeConnectAccountId: null,
    authorSubscriptionPriceId: null,
    authorSubscriptionMonthlyUsd: null,
    featuredPieceIds: [],
    createdAt: new Date().toISOString(),
    totalPiecesCount: 0, followerCount: 0, subscriberCount: 0,
    ...overrides,
  })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /users/me/author', () => {

  it('creates AuthorProfile with status=ACTIVE when required fields provided', async () => {
    await seedUserAccount()
    await seedViewerProfile()

    const event = makeEvent('POST', '/users/me/author', {
      userId: USER_ID,
      body: { displayName: 'Jane Doe', bio: 'Illustrator based in NYC.' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(201)

    const body = JSON.parse(res.body!)
    expect(body.status).toBe('ACTIVE')
    expect(body.displayName).toBe('Jane Doe')
    expect(body.bio).toBe('Illustrator based in NYC.')
    expect(body.profileType).toBe('AUTHOR')
    expect(body.totalPiecesCount).toBe(0)
    expect(body.followerCount).toBe(0)
    expect(body.subscriberCount).toBe(0)

    // Verify DynamoDB record
    const item = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${USER_ID}`, SK: 'PROFILE#AUTHOR' },
    }))
    expect(item.Item).toBeDefined()
    expect(item.Item!['status']).toBe('ACTIVE')
    expect(item.Item!['profileType']).toBe('AUTHOR') // GSI-AuthorDirectory PK
  })

  it('returns 409 when AuthorProfile already exists', async () => {
    await seedAuthorProfile(USER_ID)

    const event = makeEvent('POST', '/users/me/author', {
      userId: USER_ID,
      body: { displayName: 'Jane Doe', bio: 'Bio.' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body!)
    expect(body.error.code).toBe('CONFLICT')
  })

  it('returns 400 when displayName is missing', async () => {
    await seedUserAccount()
    const event = makeEvent('POST', '/users/me/author', {
      userId: USER_ID,
      body: { bio: 'Bio only, no name.' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when bio is missing', async () => {
    await seedUserAccount()
    const event = makeEvent('POST', '/users/me/author', {
      userId: USER_ID,
      body: { displayName: 'Name only' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })

  it('stores authorSubscriptionPriceUsd when provided', async () => {
    await seedUserAccount()

    const event = makeEvent('POST', '/users/me/author', {
      userId: USER_ID,
      body: { displayName: 'Jane', bio: 'Bio.', authorSubscriptionPriceUsd: 9.99 },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body!)
    expect(body.authorSubscriptionMonthlyUsd).toBe(9.99)
  })
})

describe('GET /users/me', () => {

  it('returns account + viewerProfile + null authorProfile when no author created', async () => {
    await seedUserAccount()
    await seedViewerProfile()

    const event = makeEvent('GET', '/users/me', { userId: USER_ID })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.account.userId).toBe(USER_ID)
    expect(body.viewerProfile.profileType).toBe('VIEWER')
    expect(body.authorProfile).toBeNull()
  })

  it('returns authorProfile after POST /users/me/author', async () => {
    await seedUserAccount()
    await seedViewerProfile()
    await seedAuthorProfile(USER_ID)

    const event = makeEvent('GET', '/users/me', { userId: USER_ID })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.authorProfile).not.toBeNull()
    expect(body.authorProfile.profileType).toBe('AUTHOR')
    expect(body.authorProfile.status).toBe('ACTIVE')
  })

  it('returns 401 when no JWT is provided', async () => {
    const event = makeEvent('GET', '/users/me')
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(401)
  })
})

describe('PUT /users/me/viewer', () => {

  it('updates displayName on ViewerProfile', async () => {
    await seedUserAccount()
    await seedViewerProfile()

    const event = makeEvent('PUT', '/users/me/viewer', {
      userId: USER_ID,
      body: { displayName: 'Updated Name' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.displayName).toBe('Updated Name')
  })

  it('updates notificationGlobalOptOut', async () => {
    await seedUserAccount()
    await seedViewerProfile()

    const event = makeEvent('PUT', '/users/me/viewer', {
      userId: USER_ID,
      body: { notificationGlobalOptOut: true },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.notificationGlobalOptOut).toBe(true)
  })

  it('returns 400 when no fields provided', async () => {
    await seedViewerProfile()
    const event = makeEvent('PUT', '/users/me/viewer', { userId: USER_ID, body: {} })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /authors', () => {

  const seedAuthors = async (count: number) => {
    for (let i = 1; i <= count; i++) {
      const id = `author-dir-${String(i).padStart(3, '0')}`
      const ts = `2025-0${Math.min(i, 9)}-01T10:00:00.000Z`
      await seedItem({
        PK: `USER#${id}`, SK: 'PROFILE#AUTHOR',
        userId: id, profileType: 'AUTHOR', status: 'ACTIVE',
        displayName: `Author ${i}`, bio: `Bio ${i}.`,
        profilePhotoS3Key: null, coverPhotoS3Key: null,
        stripeConnectAccountId: null,
        authorSubscriptionPriceId: null,
        authorSubscriptionMonthlyUsd: null,
        featuredPieceIds: [],
        createdAt: ts,
        totalPiecesCount: 0,
        followerCount: 0,
        subscriberCount: i * 10, // varying subscriber counts
      })
    }
  }

  it('returns paginated list of active authors (newest sort)', async () => {
    await seedAuthors(3)

    const event = makeEvent('GET', '/authors', { queryStringParameters: { limit: '2' } })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.items).toHaveLength(2)
    expect(body.nextCursor).toBeDefined()

    // Fetch second page
    const event2 = makeEvent('GET', '/authors', {
      queryStringParameters: { limit: '2', cursor: body.nextCursor },
    })
    const res2 = await handler(event2 as never, makeCtx())
    expect(res2.statusCode).toBe(200)
    const body2 = JSON.parse(res2.body!)
    expect(body2.items).toHaveLength(1)
    expect(body2.nextCursor).toBeUndefined()
  })

  it('returns authors sorted by subscriberCount desc', async () => {
    await seedAuthors(3)

    const event = makeEvent('GET', '/authors', {
      queryStringParameters: { sort: 'subscriberCount', limit: '10' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    const counts = body.items.map((a: { subscriberCount: number }) => a.subscriberCount)
    const sorted = [...counts].sort((a: number, b: number) => b - a)
    expect(counts).toEqual(sorted)
  })

  it('excludes SUSPENDED authors from results', async () => {
    await seedAuthors(2)
    // Seed one SUSPENDED author — must not appear in the response
    await seedItem({
      PK: 'USER#author-suspended-001', SK: 'PROFILE#AUTHOR',
      userId: 'author-suspended-001', profileType: 'AUTHOR', status: 'SUSPENDED',
      displayName: 'Suspended Author', bio: 'Should not appear.',
      profilePhotoS3Key: null, coverPhotoS3Key: null,
      stripeConnectAccountId: null, authorSubscriptionPriceId: null,
      authorSubscriptionMonthlyUsd: null, featuredPieceIds: [],
      createdAt: '2025-06-01T00:00:00.000Z',
      totalPiecesCount: 0, followerCount: 0, subscriberCount: 999,
    })

    const event = makeEvent('GET', '/authors', { queryStringParameters: { limit: '20' } })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    const ids = body.items.map((a: { userId: string }) => a.userId)
    expect(ids).not.toContain('author-suspended-001')
    expect(body.items).toHaveLength(2)
  })

  it('excludes DEACTIVATED authors from results', async () => {
    await seedAuthors(1)
    await seedItem({
      PK: 'USER#author-deactivated-001', SK: 'PROFILE#AUTHOR',
      userId: 'author-deactivated-001', profileType: 'AUTHOR', status: 'DEACTIVATED',
      displayName: 'Deactivated Author', bio: 'Should not appear.',
      profilePhotoS3Key: null, coverPhotoS3Key: null,
      stripeConnectAccountId: null, authorSubscriptionPriceId: null,
      authorSubscriptionMonthlyUsd: null, featuredPieceIds: [],
      createdAt: '2025-06-01T00:00:00.000Z',
      totalPiecesCount: 0, followerCount: 0, subscriberCount: 999,
    })

    const event = makeEvent('GET', '/authors', { queryStringParameters: { limit: '20' } })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    const ids = body.items.map((a: { userId: string }) => a.userId)
    expect(ids).not.toContain('author-deactivated-001')
    expect(body.items).toHaveLength(1)
  })

  it('returns 400 for invalid sort value', async () => {
    const event = makeEvent('GET', '/authors', { queryStringParameters: { sort: 'invalid' } })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /authors/{authorId}', () => {

  const seedPublicPiece = (artworkId: string, authorId: string, createdAt: string) =>
    seedItem({
      PK: `ARTWORK#${artworkId}`,
      SK: 'ARTWORK',
      artworkId,
      authorId,
      title:       `Piece ${artworkId}`,
      category:    'DIGITAL',
      tags:        ['test'],
      visibility:  'PUBLIC',
      status:      'ACTIVE',
      s3Key:       `media/${artworkId}.jpg`,
      viewCount:   10,
      publishedAt: createdAt,
      createdAt,
      'visibility#createdAt': `PUBLIC#${createdAt}`,
    })

  const seedPrivatePiece = (artworkId: string, authorId: string, createdAt: string) =>
    seedItem({
      PK: `ARTWORK#${artworkId}`,
      SK: 'ARTWORK',
      artworkId,
      authorId,
      title:       `Private ${artworkId}`,
      category:    'DIGITAL',
      tags:        [],
      visibility:  'PRIVATE',
      status:      'ACTIVE',
      s3Key:       `media/${artworkId}.jpg`,
      viewCount:   0,
      publishedAt: createdAt,
      createdAt,
      'visibility#createdAt': `PRIVATE#${createdAt}`,
    })

  it('returns { profile, gallery } shape with correct field names', async () => {
    await seedAuthorProfile(AUTHOR_ID, {
      followerCount:                42,
      subscriberCount:              5,
      authorSubscriptionMonthlyUsd: 9.99,
      connectChargesEnabled:        true,
    })
    await seedPublicPiece('art-001', AUTHOR_ID, '2025-03-01T00:00:00.000Z')

    const event = makeEvent('GET', `/authors/${AUTHOR_ID}`, {
      pathParameters: { authorId: AUTHOR_ID },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)

    // Top-level shape must be { profile, gallery }
    expect(body.profile).toBeDefined()
    expect(body.gallery).toBeDefined()
    // Profile field names exactly as documented in Section 8.5
    expect(body.profile.authorId).toBe(AUTHOR_ID)
    expect(body.profile.displayName).toBe('Test Author')
    expect(body.profile.followerCount).toBe(42)
    expect(body.profile.subscriberCount).toBe(5)
    expect(body.profile.authorSubscriptionMonthlyUsd).toBe(9.99)
    expect(body.profile.connectChargesEnabled).toBe(true)
    expect(body.profile.profilePhotoUrl).toBeNull()
    expect(body.profile.coverPhotoUrl).toBeNull()
    // Gallery shape
    expect(body.gallery.items).toHaveLength(1)
    expect(body.gallery.items[0].artworkId).toBe('art-001')
    expect(body.gallery.items[0].title).toBe('Piece art-001')
    expect(body.gallery.items[0].thumbnailUrl).toContain('art-001.jpg')
    expect(body.gallery.items[0].viewCount).toBe(10)
  })

  it('gallery items contain only PUBLIC pieces', async () => {
    await seedAuthorProfile(AUTHOR_ID)
    await seedPublicPiece('art-pub',  AUTHOR_ID, '2025-03-02T00:00:00.000Z')
    await seedPrivatePiece('art-priv', AUTHOR_ID, '2025-03-01T00:00:00.000Z')

    const event = makeEvent('GET', `/authors/${AUTHOR_ID}`, {
      pathParameters: { authorId: AUTHOR_ID },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.gallery.items).toHaveLength(1)
    expect(body.gallery.items[0].artworkId).toBe('art-pub')
  })

  it('returns 404 for non-existent author', async () => {
    const event = makeEvent('GET', '/authors/no-such-author', {
      pathParameters: { authorId: 'no-such-author' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for a SUSPENDED author', async () => {
    await seedAuthorProfile(AUTHOR_ID, { status: 'SUSPENDED' })

    const event = makeEvent('GET', `/authors/${AUTHOR_ID}`, {
      pathParameters: { authorId: AUTHOR_ID },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /users/{userId}/profile', () => {

  it('returns public Author profile with gallery preview', async () => {
    await seedAuthorProfile(AUTHOR_ID)

    const event = makeEvent('GET', `/users/${AUTHOR_ID}/profile`, {
      pathParameters: { userId: AUTHOR_ID },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body!)
    expect(body.authorId).toBe(AUTHOR_ID)
    expect(body.displayName).toBe('Test Author')
    expect(body.galleryPreview).toBeInstanceOf(Array)
  })

  it('returns 404 for non-existent userId', async () => {
    const event = makeEvent('GET', '/users/nonexistent/profile', {
      pathParameters: { userId: 'nonexistent' },
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(404)
  })
})
