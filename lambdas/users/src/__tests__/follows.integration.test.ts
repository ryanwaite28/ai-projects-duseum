// =============================================================================
// lambdas/users/src/__tests__/follows.integration.test.ts
// Integration tests for follow/unfollow, notification preferences, and
// unsubscribe — FR-VIEW-06/06a/09/10, FR-NOTIF-08, §15.3
//
// Prerequisites: MiniStack running at localhost:4566
// Shares `duseum-test-users` table (and lifecycle) from setup.ts.
// =============================================================================

import { describe, it, expect, vi } from 'vitest'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { handler } from '../index.js'
import { TABLE, docClient, makeEvent, makeCtx, seedItem } from './setup.js'

// Stub the unsubscribe secret so token operations work without Secrets Manager
vi.mock('@duseum/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@duseum/shared')>()
  return {
    ...original,
    getUnsubscribeSecret: vi.fn().mockResolvedValue('follows-test-hmac-secret'),
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerResult = { statusCode: number; body: string }

const callHandler = async (event: unknown): Promise<HandlerResult> => {
  const result = await handler(event as never, makeCtx())
  return result as HandlerResult
}

const seedViewer = (userId: string) =>
  seedItem({
    PK: `USER#${userId}`,
    SK: 'PROFILE#VIEWER',
    userId,
    profileType:              'VIEWER',
    status:                   'ACTIVE',
    displayName:              `Viewer ${userId}`,
    createdAt:                '2025-01-01T00:00:00.000Z',
    notificationGlobalOptOut: false,
    defaultNotificationPref:  'ALL_NEW_PIECES',
  })

const seedAuthor = (authorId: string) =>
  seedItem({
    PK: `USER#${authorId}`,
    SK: 'PROFILE#AUTHOR',
    userId:         authorId,
    profileType:    'AUTHOR',
    status:         'ACTIVE',
    displayName:    `Author ${authorId}`,
    createdAt:      '2025-01-01T00:00:00.000Z',
    followerCount:  0,
    subscriberCount: 0,
  })

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEWER   = 'follows-viewer-001'
const AUTHOR_A = 'follows-author-aaa'
const AUTHOR_B = 'follows-author-bbb'

// ═══════════════════════════════════════════════════════════════════════════════
// Follow / Unfollow
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /follows/authors/{authorId}', () => {
  it('creates Follow + NOTIF_PREF records, increments followerCount', async () => {
    await Promise.all([seedViewer(VIEWER), seedAuthor(AUTHOR_A)])

    const res = await callHandler(makeEvent(
      'POST', `/follows/authors/${AUTHOR_A}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_A } }
    ))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.authorId).toBe(AUTHOR_A)
    expect(body.notificationPref).toBe('ALL_NEW_PIECES')

    // Follow record exists
    const followItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${VIEWER}`, SK: `FOLLOW#AUTHOR#${AUTHOR_A}` },
    }))
    expect(followItem.Item?.viewerId).toBe(VIEWER)

    // NOTIF_PREF record exists
    const prefItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${VIEWER}`, SK: `NOTIF_PREF#AUTHOR#${AUTHOR_A}` },
    }))
    expect(prefItem.Item?.pref).toBe('ALL_NEW_PIECES')

    // followerCount incremented
    const authorItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${AUTHOR_A}`, SK: 'PROFILE#AUTHOR' },
    }))
    expect(authorItem.Item?.followerCount).toBe(1)
  })

  it('returns 409 when following the same author twice', async () => {
    await Promise.all([seedViewer(VIEWER), seedAuthor(AUTHOR_A)])

    await callHandler(makeEvent('POST', `/follows/authors/${AUTHOR_A}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_A } }))

    const res = await callHandler(makeEvent('POST', `/follows/authors/${AUTHOR_A}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_A } }))
    expect(res.statusCode).toBe(409)
  })

  it('returns 404 when author does not exist', async () => {
    await seedViewer(VIEWER)

    const res = await callHandler(makeEvent('POST', `/follows/authors/nonexistent-author`,
      { userId: VIEWER, pathParameters: { authorId: 'nonexistent-author' } }))
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /follows/authors/{authorId}', () => {
  it('deletes Follow + NOTIF_PREF records, decrements followerCount', async () => {
    await Promise.all([seedViewer(VIEWER), seedAuthor(AUTHOR_A)])
    await callHandler(makeEvent('POST', `/follows/authors/${AUTHOR_A}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_A } }))

    const res = await callHandler(makeEvent('DELETE', `/follows/authors/${AUTHOR_A}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_A } }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.authorId).toBe(AUTHOR_A)
    expect(body.unfollowedAt).toBeTruthy()

    // Follow record gone
    const followItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${VIEWER}`, SK: `FOLLOW#AUTHOR#${AUTHOR_A}` },
    }))
    expect(followItem.Item).toBeUndefined()

    // NOTIF_PREF record gone
    const prefItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${VIEWER}`, SK: `NOTIF_PREF#AUTHOR#${AUTHOR_A}` },
    }))
    expect(prefItem.Item).toBeUndefined()

    // followerCount back to 0
    const authorItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${AUTHOR_A}`, SK: 'PROFILE#AUTHOR' },
    }))
    expect(authorItem.Item?.followerCount).toBe(0)
  })

  it('returns 200 (no-op) when not following the author', async () => {
    await Promise.all([seedViewer(VIEWER), seedAuthor(AUTHOR_A)])

    const res = await callHandler(makeEvent('DELETE', `/follows/authors/${AUTHOR_A}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_A } }))
    expect(res.statusCode).toBe(200)
  })
})

describe('GET /follows/authors', () => {
  it('returns list of followed authors with notificationPref', async () => {
    await Promise.all([seedViewer(VIEWER), seedAuthor(AUTHOR_A), seedAuthor(AUTHOR_B)])
    await callHandler(makeEvent('POST', `/follows/authors/${AUTHOR_A}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_A } }))
    await callHandler(makeEvent('POST', `/follows/authors/${AUTHOR_B}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_B } }))

    const res = await callHandler(makeEvent('GET', '/follows/authors', { userId: VIEWER }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(2)
    expect(body.items[0].notificationPref).toBe('ALL_NEW_PIECES')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Preferences
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /users/me/notification-preferences', () => {
  it('returns global prefs and per-author overrides', async () => {
    await Promise.all([seedViewer(VIEWER), seedAuthor(AUTHOR_A)])
    await callHandler(makeEvent('POST', `/follows/authors/${AUTHOR_A}`,
      { userId: VIEWER, pathParameters: { authorId: AUTHOR_A } }))

    const res = await callHandler(makeEvent('GET', '/users/me/notification-preferences',
      { userId: VIEWER }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.globalOptOut).toBe(false)
    expect(body.defaultPref).toBe('ALL_NEW_PIECES')
    expect(body.perAuthorOverrides).toHaveLength(1)
    expect(body.perAuthorOverrides[0].authorId).toBe(AUTHOR_A)
  })
})

describe('PUT /users/me/notification-preferences', () => {
  it('updates globalOptOut on viewer profile', async () => {
    await seedViewer(VIEWER)

    const res = await callHandler(makeEvent('PUT', '/users/me/notification-preferences',
      { userId: VIEWER, body: { globalOptOut: true } }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).globalOptOut).toBe(true)

    const viewerItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${VIEWER}`, SK: 'PROFILE#VIEWER' },
    }))
    expect(viewerItem.Item?.notificationGlobalOptOut).toBe(true)
  })

  it('upserts per-author overrides from body', async () => {
    await Promise.all([seedViewer(VIEWER), seedAuthor(AUTHOR_A)])

    const res = await callHandler(makeEvent('PUT', '/users/me/notification-preferences', {
      userId: VIEWER,
      body:   { perAuthorOverrides: [{ authorId: AUTHOR_A, pref: 'PUBLIC_ONLY' }] },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.perAuthorOverrides[0].pref).toBe('PUBLIC_ONLY')

    const prefItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${VIEWER}`, SK: `NOTIF_PREF#AUTHOR#${AUTHOR_A}` },
    }))
    expect(prefItem.Item?.pref).toBe('PUBLIC_ONLY')
  })

  it('returns 400 for invalid pref value', async () => {
    await seedViewer(VIEWER)

    const res = await callHandler(makeEvent('PUT', '/users/me/notification-preferences',
      { userId: VIEWER, body: { defaultPref: 'MAYBE' } }))
    expect(res.statusCode).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Unsubscribe
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /notifications/unsubscribe', () => {
  it('sets per-author pref to NONE and returns author display name', async () => {
    await Promise.all([seedViewer(VIEWER), seedAuthor(AUTHOR_A)])

    // Generate a real signed token (uses the mocked secret)
    const { generateUnsubscribeToken } = await import('@duseum/shared')
    const token = await generateUnsubscribeToken(VIEWER, AUTHOR_A)

    const res = await callHandler(makeEvent('GET', '/notifications/unsubscribe', {
      queryStringParameters: { token },
    }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.authorId).toBe(AUTHOR_A)
    expect(body.authorDisplayName).toContain(AUTHOR_A)

    // Pref record set to NONE
    const prefItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${VIEWER}`, SK: `NOTIF_PREF#AUTHOR#${AUTHOR_A}` },
    }))
    expect(prefItem.Item?.pref).toBe('NONE')
  })

  it('returns 400 for an expired token', async () => {
    const { createHmac } = await import('crypto')
    const secret  = 'follows-test-hmac-secret'
    const payload = Buffer.from(JSON.stringify({
      viewerId: VIEWER,
      authorId: AUTHOR_A,
      exp:      Date.now() - 1_000,
    })).toString('base64url')
    const sig   = createHmac('sha256', secret).update(payload).digest('base64url')
    const token = `${payload}.${sig}`

    const res = await callHandler(makeEvent('GET', '/notifications/unsubscribe', {
      queryStringParameters: { token },
    }))
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for a tampered token', async () => {
    const { generateUnsubscribeToken } = await import('@duseum/shared')
    const token   = await generateUnsubscribeToken(VIEWER, AUTHOR_A)
    const [p, s]  = token.split('.') as [string, string]
    const tampered = `${p}.${s.slice(0, -1)}X`

    const res = await callHandler(makeEvent('GET', '/notifications/unsubscribe', {
      queryStringParameters: { token: tampered },
    }))
    expect(res.statusCode).toBe(400)
  })
})

