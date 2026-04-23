// =============================================================================
// lambdas/notifications/src/__tests__/fan-out-private.integration.test.ts
// Integration tests for PRIVATE piece fan-out — FR-NOTIF-06/07/10, §15.3
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
  seedAuthorSubscription,
  seedNotifPref,
} from './setup.js'

// ── Mock SES ──────────────────────────────────────────────────────────────────

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

// ── Import after mocks ────────────────────────────────────────────────────────

import { fanOut, type NewPiecePublishedMessage } from '../fan-out.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockSesSend.mockClear()
})

const AUTHOR = 'notif-priv-author-001'
const ART    = 'notif-priv-art-001'

const makeMessage = (): NewPiecePublishedMessage => ({
  eventType:          'NEW_PIECE_PUBLISHED',
  artworkId:          ART,
  authorId:           AUTHOR,
  visibility:         'PRIVATE',
  title:              'Exclusive Work',
  descriptionExcerpt: 'For subscribers only.',
  thumbnailS3Key:     '',
  publishedAt:        new Date().toISOString(),
})

// ═══════════════════════════════════════════════════════════════════════════════

describe('PRIVATE piece fan-out', () => {
  it('sends email to active author subscribers only', async () => {
    const sub1 = 'notif-priv-sub-001'
    const sub2 = 'notif-priv-sub-002'

    await Promise.all([
      seedArtwork(ART, AUTHOR, { visibility: 'PRIVATE', status: 'PRIVATE' }),
      seedAuthor(AUTHOR),
      seedViewerProfile(sub1),
      seedViewerProfile(sub2),
      seedUserAccount(sub1, 'sub1@test.com'),
      seedUserAccount(sub2, 'sub2@test.com'),
      seedAuthorSubscription(sub1, AUTHOR),
      seedAuthorSubscription(sub2, AUTHOR),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).toHaveBeenCalledTimes(2)
  })

  it('does NOT notify plain followers for a PRIVATE piece', async () => {
    const follower = 'notif-priv-follower-only'

    await Promise.all([
      seedArtwork(ART, AUTHOR, { visibility: 'PRIVATE', status: 'PRIVATE' }),
      seedAuthor(AUTHOR),
      seedViewerProfile(follower),
      seedUserAccount(follower, 'follower@test.com'),
      // Follow exists but no author subscription
      seedFollow(follower, AUTHOR),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).not.toHaveBeenCalled()
  })

  it('skips subscriber whose per-author pref is PUBLIC_ONLY', async () => {
    const subscriber = 'notif-priv-sub-pubonly'

    await Promise.all([
      seedArtwork(ART, AUTHOR, { visibility: 'PRIVATE', status: 'PRIVATE' }),
      seedAuthor(AUTHOR),
      seedViewerProfile(subscriber),
      seedUserAccount(subscriber, 'subpubonly@test.com'),
      seedAuthorSubscription(subscriber, AUTHOR),
      seedNotifPref(subscriber, AUTHOR, 'PUBLIC_ONLY'),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).not.toHaveBeenCalled()
  })

  it('skips INACTIVE author subscriptions', async () => {
    const inactiveSub = 'notif-priv-sub-inactive'

    await Promise.all([
      seedArtwork(ART, AUTHOR, { visibility: 'PRIVATE', status: 'PRIVATE' }),
      seedAuthor(AUTHOR),
      seedViewerProfile(inactiveSub),
      seedUserAccount(inactiveSub, 'inactive@test.com'),
      seedAuthorSubscription(inactiveSub, AUTHOR, { status: 'CANCELLED' }),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).not.toHaveBeenCalled()
  })
})
