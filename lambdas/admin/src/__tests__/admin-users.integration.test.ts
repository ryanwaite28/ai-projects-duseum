// =============================================================================
// lambdas/admin/src/__tests__/admin-users.integration.test.ts
// Integration tests for admin user/content/config/dashboard routes.
// Section 15.3 — real DynamoDB via MiniStack; Cognito, SQS, S3 are mocked.
// =============================================================================

import { describe, it, expect, vi } from 'vitest'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

// ── Module mocks (hoisted by Vitest) ─────────────────────────────────────────

// Mock S3 deleteObject + any Stripe calls in @duseum/shared
vi.mock('@duseum/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duseum/shared')>()
  return {
    ...actual,
    deleteObject: vi.fn().mockResolvedValue(undefined),
    issueRefund:  vi.fn().mockResolvedValue({ refundId: 're_test_mock_001' }),
  }
})

// Mock Cognito admin functions
vi.mock('../cognito.js', () => ({
  cognitoListUsers: vi.fn().mockResolvedValue({
    users: [
      { userId: 'cognito-user-01', email: 'user01@test.com', enabled: true, userStatus: 'CONFIRMED', createdAt: '2025-01-01T00:00:00.000Z' },
    ],
    nextToken: null,
  }),
  cognitoAdminDisableUser: vi.fn().mockResolvedValue(undefined),
  cognitoAdminEnableUser:  vi.fn().mockResolvedValue(undefined),
  cognitoDescribeUserPool: vi.fn().mockResolvedValue({ estimatedNumberOfUsers: 42 }),
}))

// Mock SQS DLQ depth
vi.mock('../sqs.js', () => ({
  getDlqDepth: vi.fn().mockResolvedValue(0),
}))

import { handler } from '../index.js'
import {
  CONFIG_TABLE,
  TABLE,
  docClient,
  makeAdminJwt,
  makeApiEvent,
  makeCtx,
  makeUserJwt,
  seedActiveAuthor,
  seedArtwork,
  seedAuthorProfile,
  seedBooking,
  seedComment,
  seedConfig,
  seedUserAccount,
  seedViewerProfile,
} from './setup.js'
import { getCurrentIsoWeek } from '@duseum/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

const ctx = makeCtx()
const invoke = (event: Parameters<typeof handler>[0]) => handler(event as never, ctx)

const getItem = (pk: string, sk: string) =>
  docClient
    .send(new GetCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } }))
    .then((r) => r.Item ?? null)

const getConfigItem = (pk: string) =>
  docClient
    .send(new GetCommand({ TableName: CONFIG_TABLE, Key: { PK: pk } }))
    .then((r) => r.Item ?? null)

// ── 403 enforcement (new routes) ──────────────────────────────────────────────

describe('admin group enforcement — new routes', () => {
  const nonAdminJwt = makeUserJwt()

  const cases: Array<[string, string, unknown?]> = [
    ['GET',    '/admin/users'],
    ['PUT',    '/admin/users/some-user/suspend'],
    ['PUT',    '/admin/users/some-user/reinstate'],
    ['PUT',    '/admin/users/some-user/profiles/AUTHOR/suspend'],
    ['DELETE', '/admin/artworks/some-artwork'],
    ['DELETE', '/admin/comments/some-comment'],
    ['PUT',    '/admin/config', { freeTierLimit: 10 }],
    ['GET',    '/admin/dashboard'],
  ]

  for (const [method, path, body] of cases) {
    it(`returns 403 for ${method} ${path} when caller lacks ADMIN group`, async () => {
      const event = makeApiEvent(method, path, { body, jwt: nonAdminJwt })
      const res   = await invoke(event)
      expect(res.statusCode).toBe(403)
    })
  }
})

// ── PUT /admin/users/{userId}/suspend ─────────────────────────────────────────

describe('PUT /admin/users/{userId}/suspend', () => {
  it('suspends ViewerProfile and AuthorProfile when both exist', async () => {
    const userId = 'suspend-user-01'
    await Promise.all([
      seedUserAccount(userId),
      seedViewerProfile(userId, 'ACTIVE'),
      seedAuthorProfile(userId, 'ACTIVE'),
    ])

    const event = makeApiEvent('PUT', `/admin/users/${userId}/suspend`)
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.suspended).toBe(true)
    expect(body.userId).toBe(userId)

    const viewer = await getItem(`USER#${userId}`, 'PROFILE#VIEWER')
    const author = await getItem(`USER#${userId}`, 'PROFILE#AUTHOR')
    expect(viewer!.status).toBe('SUSPENDED')
    expect(author!.status).toBe('SUSPENDED')
  })

  it('suspends only ViewerProfile when no AuthorProfile exists', async () => {
    const userId = 'suspend-user-02'
    await Promise.all([seedUserAccount(userId), seedViewerProfile(userId)])

    const event = makeApiEvent('PUT', `/admin/users/${userId}/suspend`)
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const viewer = await getItem(`USER#${userId}`, 'PROFILE#VIEWER')
    expect(viewer!.status).toBe('SUSPENDED')
  })

  it('skips AuthorProfile when its status is DEACTIVATED', async () => {
    const userId = 'suspend-user-03'
    await Promise.all([
      seedUserAccount(userId),
      seedViewerProfile(userId, 'ACTIVE'),
      seedAuthorProfile(userId, 'DEACTIVATED'),
    ])

    const event = makeApiEvent('PUT', `/admin/users/${userId}/suspend`)
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const author = await getItem(`USER#${userId}`, 'PROFILE#AUTHOR')
    expect(author!.status).toBe('DEACTIVATED')
  })

  it('returns 404 when ViewerProfile does not exist', async () => {
    const event = makeApiEvent('PUT', '/admin/users/nonexistent-user/suspend')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(404)
  })
})

// ── PUT /admin/users/{userId}/reinstate ───────────────────────────────────────

describe('PUT /admin/users/{userId}/reinstate', () => {
  it('reinstates both profiles from SUSPENDED to ACTIVE', async () => {
    const userId = 'reinstate-user-01'
    await Promise.all([
      seedUserAccount(userId),
      seedViewerProfile(userId, 'SUSPENDED'),
      seedAuthorProfile(userId, 'SUSPENDED'),
    ])

    const event = makeApiEvent('PUT', `/admin/users/${userId}/reinstate`)
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.reinstated).toBe(true)

    const viewer = await getItem(`USER#${userId}`, 'PROFILE#VIEWER')
    const author = await getItem(`USER#${userId}`, 'PROFILE#AUTHOR')
    expect(viewer!.status).toBe('ACTIVE')
    expect(author!.status).toBe('ACTIVE')
  })

  it('does not change DEACTIVATED AuthorProfile on reinstate', async () => {
    const userId = 'reinstate-user-02'
    await Promise.all([
      seedUserAccount(userId),
      seedViewerProfile(userId, 'SUSPENDED'),
      seedAuthorProfile(userId, 'DEACTIVATED'),
    ])

    const event = makeApiEvent('PUT', `/admin/users/${userId}/reinstate`)
    await invoke(event)

    const author = await getItem(`USER#${userId}`, 'PROFILE#AUTHOR')
    expect(author!.status).toBe('DEACTIVATED')
  })

  it('returns 404 for unknown userId', async () => {
    const event = makeApiEvent('PUT', '/admin/users/nobody/reinstate')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(404)
  })
})

// ── PUT /admin/users/{userId}/profiles/{profileType}/suspend ──────────────────

describe('PUT /admin/users/{userId}/profiles/{profileType}/suspend', () => {
  it('suspends AuthorProfile without touching ViewerProfile', async () => {
    const userId = 'profile-suspend-01'
    await Promise.all([
      seedViewerProfile(userId, 'ACTIVE'),
      seedAuthorProfile(userId, 'ACTIVE'),
    ])

    const event = makeApiEvent('PUT', `/admin/users/${userId}/profiles/AUTHOR/suspend`)
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.profileType).toBe('AUTHOR')
    expect(body.status).toBe('SUSPENDED')

    const viewer = await getItem(`USER#${userId}`, 'PROFILE#VIEWER')
    const author = await getItem(`USER#${userId}`, 'PROFILE#AUTHOR')
    expect(viewer!.status).toBe('ACTIVE')
    expect(author!.status).toBe('SUSPENDED')
  })

  it('returns 400 for an invalid profileType', async () => {
    const event = makeApiEvent('PUT', '/admin/users/any-user/profiles/UNKNOWN/suspend')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when profile does not exist', async () => {
    const event = makeApiEvent('PUT', '/admin/users/no-profile-user/profiles/AUTHOR/suspend')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(404)
  })

  it('returns 409 when profile is already SUSPENDED', async () => {
    const userId = 'profile-suspend-02'
    await seedAuthorProfile(userId, 'SUSPENDED')

    const event = makeApiEvent('PUT', `/admin/users/${userId}/profiles/AUTHOR/suspend`)
    const res   = await invoke(event)
    expect(res.statusCode).toBe(409)
  })
})

// ── DELETE /admin/artworks/{artworkId} ────────────────────────────────────────

describe('DELETE /admin/artworks/{artworkId}', () => {
  it('archives artwork and returns 200', async () => {
    await seedActiveAuthor('artwork-author-01')
    await seedArtwork('artwork-remove-01', 'artwork-author-01', 'media/artwork-remove-01.jpg', 'PUBLIC')

    const event = makeApiEvent('DELETE', '/admin/artworks/artwork-remove-01')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.artworkId).toBe('artwork-remove-01')
    expect(body.status).toBe('ARCHIVED')

    const item = await getItem('ARTWORK#artwork-remove-01', 'METADATA')
    expect(item!.status).toBe('ARCHIVED')
  })

  it('returns 409 when artwork is already archived', async () => {
    await seedActiveAuthor('artwork-author-02')
    await seedArtwork('artwork-remove-02', 'artwork-author-02', 'media/r2.jpg', 'ARCHIVED')

    const event = makeApiEvent('DELETE', '/admin/artworks/artwork-remove-02')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(409)
  })

  it('returns 404 for unknown artworkId', async () => {
    const event = makeApiEvent('DELETE', '/admin/artworks/no-such-artwork')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(404)
  })
})

// ── DELETE /admin/comments/{commentId} ────────────────────────────────────────

describe('DELETE /admin/comments/{commentId}', () => {
  it('hides a comment and returns 200', async () => {
    await seedArtwork('comment-art-01', 'comment-art-author-01')
    await seedComment('comment-hide-01', 'comment-art-01', 'comment-author-01')

    const event = makeApiEvent('DELETE', '/admin/comments/comment-hide-01')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.commentId).toBe('comment-hide-01')
    expect(body.hidden).toBe(true)

    const createdAt = '2025-01-01T00:00:00.000Z'
    const item = await getItem('ARTWORK#comment-art-01', `COMMENT#${createdAt}#comment-hide-01`)
    expect(item!.isDeleted).toBe(true)
  })

  it('returns 409 when comment is already hidden', async () => {
    await seedArtwork('comment-art-02', 'comment-art-author-02')
    await seedComment('comment-hide-02', 'comment-art-02', 'comment-author-02', true)

    const event = makeApiEvent('DELETE', '/admin/comments/comment-hide-02')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(409)
  })

  it('returns 404 for unknown commentId', async () => {
    const event = makeApiEvent('DELETE', '/admin/comments/no-such-comment')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(404)
  })
})

// ── PUT /admin/config ─────────────────────────────────────────────────────────

describe('PUT /admin/config', () => {
  it('updates weeklyFeatureFeeUsd and weeklyFeatureSlotCount', async () => {
    const event = makeApiEvent('PUT', '/admin/config', {
      body: { weeklyFeatureFeeUsd: 50, weeklyFeatureSlotCount: 5 },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.updated).toContain('weeklyFeatureFeeUsd')
    expect(body.updated).toContain('weeklyFeatureSlotCount')

    const feeItem   = await getConfigItem('WEEKLY_FEATURE_FEE_USD')
    const slotItem  = await getConfigItem('WEEKLY_FEATURE_SLOT_COUNT')
    expect(feeItem!.value).toBe(50)
    expect(slotItem!.value).toBe(5)
  })

  it('updates freeTierLimit', async () => {
    const event = makeApiEvent('PUT', '/admin/config', { body: { freeTierLimit: 15 } })
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const item = await getConfigItem('FREE_TIER_LIMIT')
    expect(item!.value).toBe(15)
  })

  it('returns 400 for empty body', async () => {
    const event = makeApiEvent('PUT', '/admin/config', { body: {} })
    const res   = await invoke(event)
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for invalid freeTierLimit (non-integer)', async () => {
    const event = makeApiEvent('PUT', '/admin/config', { body: { freeTierLimit: 1.5 } })
    const res   = await invoke(event)
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for platformCutPercent out of range', async () => {
    const event = makeApiEvent('PUT', '/admin/config', { body: { platformCutPercent: 150 } })
    const res   = await invoke(event)
    expect(res.statusCode).toBe(400)
  })
})

// ── GET /admin/dashboard ─────────────────────────────────────────────────────

describe('GET /admin/dashboard', () => {
  it('returns aggregate dashboard shape with upcoming feature bookings', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedActiveAuthor('dash-author-01')
    await seedBooking('dash-author-01', currentWeek, 'CONFIRMED', 'dash-booking-01', '2026-01-06', '2026-01-12')

    // Seed sub counts in config table
    await Promise.all([
      seedConfig({ PK: 'ACTIVE_PLATFORM_SUB_COUNT', value: 80 }),
      seedConfig({ PK: 'ACTIVE_AUTHOR_SUB_COUNT',   value: 210 }),
      seedConfig({ PK: 'PLATFORM_MRR_USD_CENTS',     value: 120000 }),
    ])

    const event = makeApiEvent('GET', '/admin/dashboard')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.totalUsers).toBe(42)         // from mocked cognitoDescribeUserPool
    expect(body.activePlatformSubs).toBe(80)
    expect(body.activeAuthorSubs).toBe(210)
    expect(body.platformMrrUsd).toBe(1200)   // 120000 cents / 100
    expect(body.dlqDepths).toMatchObject({ stripeWebhook: 0, notifications: 0 })
    expect(Array.isArray(body.upcomingFeatureBookings)).toBe(true)
    const booking = body.upcomingFeatureBookings.find((b: { isoWeek: string }) => b.isoWeek === currentWeek)
    expect(booking).toBeDefined()
    expect(booking.confirmedCount).toBe(1)
  })

  it('returns null for newSignups when counters are not seeded', async () => {
    const event = makeApiEvent('GET', '/admin/dashboard')
    const res   = await invoke(event)
    const body  = JSON.parse(res.body ?? '{}')
    expect(body.newSignups7d).toBeNull()
    expect(body.newSignups30d).toBeNull()
  })
})
