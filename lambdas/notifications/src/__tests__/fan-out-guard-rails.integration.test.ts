// =============================================================================
// lambdas/notifications/src/__tests__/fan-out-guard-rails.integration.test.ts
// Guard-rail tests — DRAFT, ARCHIVED, inactive author, zero recipients §15.3
// FR-NOTIF-11
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import './setup.js'
import {
  seedArtwork,
  seedAuthor,
  seedViewerProfile,
  seedUserAccount,
  seedFollow,
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

const AUTHOR = 'notif-guard-author-001'
const ART    = 'notif-guard-art-001'

const makeMessage = (): NewPiecePublishedMessage => ({
  eventType:          'NEW_PIECE_PUBLISHED',
  artworkId:          ART,
  authorId:           AUTHOR,
  visibility:         'PUBLIC',
  title:              'Guard Rail Piece',
  descriptionExcerpt: '',
  thumbnailS3Key:     '',
  publishedAt:        new Date().toISOString(),
})

// ═══════════════════════════════════════════════════════════════════════════════

describe('fan-out guard rails', () => {
  it('skips fan-out when artwork status is DRAFT', async () => {
    const viewer = 'notif-guard-viewer-001'

    await Promise.all([
      seedArtwork(ART, AUTHOR, { status: 'DRAFT', visibility: 'DRAFT' as never }),
      seedAuthor(AUTHOR),
      seedViewerProfile(viewer),
      seedUserAccount(viewer, 'viewer@test.com'),
      seedFollow(viewer, AUTHOR),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).not.toHaveBeenCalled()
  })

  it('skips fan-out when author is not ACTIVE', async () => {
    const viewer = 'notif-guard-viewer-002'

    await Promise.all([
      seedArtwork(ART, AUTHOR),
      seedAuthor(AUTHOR, { status: 'SUSPENDED' }),
      seedViewerProfile(viewer),
      seedUserAccount(viewer, 'viewer2@test.com'),
      seedFollow(viewer, AUTHOR),
    ])

    await fanOut(makeMessage())

    expect(mockSesSend).not.toHaveBeenCalled()
  })

  it('completes cleanly with zero recipients and sends no emails', async () => {
    // Artwork + author exist but no followers
    await Promise.all([
      seedArtwork(ART, AUTHOR),
      seedAuthor(AUTHOR),
    ])

    await expect(fanOut(makeMessage())).resolves.toBeUndefined()

    expect(mockSesSend).not.toHaveBeenCalled()
  })
})
