// =============================================================================
// lambdas/notifications/src/__tests__/fan-out-public.integration.test.ts
// Integration tests for PUBLIC piece fan-out — FR-NOTIF-01–05, §15.3
//
// SES calls are mocked; DynamoDB uses MiniStack at localhost:4566.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import './setup.js'
import {
  seedArtwork,
  seedAuthor,
  seedViewerProfile,
  seedUserAccount,
  seedFollow,
  seedNotifPref,
  docClient,
  TABLE,
} from './setup.js'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

// ── Mock SES (no real emails) ─────────────────────────────────────────────────

const mockSesSend = vi.hoisted(() => vi.fn().mockResolvedValue({}))

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: mockSesSend })),
  SendEmailCommand: vi.fn().mockImplementation((input: unknown) => input),
}))

vi.mock('@duseum/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@duseum/shared')>()
  return {
    ...original,
    getSesFromAddress:    vi.fn().mockResolvedValue('no-reply@test.duseum.com'),
    getUnsubscribeSecret: vi.fn().mockResolvedValue('test-notifications-hmac-secret'),
  }
})

// ── Import after mocks are registered ────────────────────────────────────────

import { fanOut, type NewPiecePublishedMessage } from '../fan-out.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockSesSend.mockClear()
})

const AUTHOR = 'notif-pub-author-001'
const ART    = 'notif-pub-art-001'

const makeMessage = (overrides: Partial<NewPiecePublishedMessage> = {}): NewPiecePublishedMessage => ({
  eventType:          'NEW_PIECE_PUBLISHED',
  artworkId:          ART,
  authorId:           AUTHOR,
  visibility:         'PUBLIC',
  title:              'Test Painting',
  descriptionExcerpt: 'A beautiful test painting.',
  thumbnailS3Key:     'artworks/test-thumb.jpg',
  publishedAt:        new Date().toISOString(),
  ...overrides,
})

// ═══════════════════════════════════════════════════════════════════════════════

describe('PUBLIC piece fan-out', () => {
  it('sends email to all followers and increments notifiedCount', async () => {
    const viewer1 = 'notif-pub-viewer-001'
    const viewer2 = 'notif-pub-viewer-002'

    await Promise.all([
      seedArtwork(ART, AUTHOR),
      seedAuthor(AUTHOR),
      seedViewerProfile(viewer1),
      seedViewerProfile(viewer2),
      seedUserAccount(viewer1, 'viewer1@test.com'),
      seedUserAccount(viewer2, 'viewer2@test.com'),
      seedFollow(viewer1, AUTHOR),
      seedFollow(viewer2, AUTHOR),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).toHaveBeenCalledTimes(2)

    const artItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `ARTWORK#${ART}`, SK: 'METADATA' },
    }))
    expect(artItem.Item?.notifiedCount).toBe(2)
  })

  it('skips follower with global notification opt-out', async () => {
    const optedOut = 'notif-pub-viewer-optout'

    await Promise.all([
      seedArtwork(ART, AUTHOR),
      seedAuthor(AUTHOR),
      seedViewerProfile(optedOut, { globalOptOut: true }),
      seedUserAccount(optedOut, 'optout@test.com'),
      seedFollow(optedOut, AUTHOR),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).not.toHaveBeenCalled()
  })

  it('skips follower whose per-author pref is NONE', async () => {
    const viewer = 'notif-pub-viewer-none'

    await Promise.all([
      seedArtwork(ART, AUTHOR),
      seedAuthor(AUTHOR),
      seedViewerProfile(viewer),
      seedUserAccount(viewer, 'none@test.com'),
      seedFollow(viewer, AUTHOR),
      seedNotifPref(viewer, AUTHOR, 'NONE'),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).not.toHaveBeenCalled()
  })

  it('sends to follower with PUBLIC_ONLY pref when piece is PUBLIC', async () => {
    const viewer = 'notif-pub-viewer-pubonly'

    await Promise.all([
      seedArtwork(ART, AUTHOR),
      seedAuthor(AUTHOR),
      seedViewerProfile(viewer),
      seedUserAccount(viewer, 'pubonly@test.com'),
      seedFollow(viewer, AUTHOR),
      seedNotifPref(viewer, AUTHOR, 'PUBLIC_ONLY'),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).toHaveBeenCalledTimes(1)
  })

  it('silently skips followers who have no UserAccount / email', async () => {
    const noAccount = 'notif-pub-viewer-noaccount'

    await Promise.all([
      seedArtwork(ART, AUTHOR),
      seedAuthor(AUTHOR),
      // ViewerProfile exists but no UserAccount (no email)
      seedViewerProfile(noAccount),
      seedFollow(noAccount, AUTHOR),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).not.toHaveBeenCalled()

    const artItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `ARTWORK#${ART}`, SK: 'METADATA' },
    }))
    // notifiedCount should remain 0
    expect(artItem.Item?.notifiedCount ?? 0).toBe(0)
  })
})
