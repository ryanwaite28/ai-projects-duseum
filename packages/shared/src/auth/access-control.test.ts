// =============================================================================
// packages/shared/src/auth/access-control.test.ts
// Unit tests for checkArtPieceAccess — Section 15.2 (6 decision branches)
// =============================================================================

import { describe, it, expect } from 'vitest'
import { checkArtPieceAccess } from './access-control.js'
import type { AccessContext } from './access-control.js'
import type { ArtPiece } from '../types/index.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const basePiece = (overrides: Partial<ArtPiece> = {}): ArtPiece => ({
  artworkId: 'art-1',
  authorId: 'author-1',
  title: 'Test Piece',
  description: '',
  tags: [],
  category: 'PAINTING',
  visibility: 'PUBLIC',
  status: 'ACTIVE',
  s3Key: 's3/art-1',
  mimeType: 'image/jpeg',
  fileSizeBytes: 1024,
  viewCount: 0,
  commentsEnabled: true,
  notifiedCount: 0,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  publishedAt: '2025-01-01T00:00:00Z',
  ...overrides,
})

const baseCtx = (overrides: Partial<AccessContext> = {}): AccessContext => ({
  viewerId: 'viewer-1',
  isAuthor: false,
  isPlatformSubscriber: false,
  isAuthorSubscriber: false,
  ...overrides,
})

const FREE_TIER = 10

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkArtPieceAccess', () => {
  it('Author always sees their own PUBLIC piece', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'PUBLIC' }),
      baseCtx({ isAuthor: true }),
      FREE_TIER,
      1
    )
    expect(result).toEqual({ allowed: true, signUrl: false })
  })

  it('Author always sees their own PRIVATE piece', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'PRIVATE' }),
      baseCtx({ isAuthor: true }),
      FREE_TIER,
      1
    )
    expect(result).toEqual({ allowed: true, signUrl: false })
  })

  it('Author always sees their own DRAFT piece (signUrl: true)', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'DRAFT' }),
      baseCtx({ isAuthor: true }),
      FREE_TIER,
      1
    )
    expect(result).toEqual({ allowed: true, signUrl: true })
  })

  it('FREE viewer sees PUBLIC piece within free tier limit', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'PUBLIC' }),
      baseCtx(),
      FREE_TIER,
      1 // piece index 1 ≤ free tier 10
    )
    expect(result).toEqual({ allowed: true, signUrl: false })
  })

  it('FREE viewer is blocked on PUBLIC piece beyond free tier limit', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'PUBLIC' }),
      baseCtx(),
      FREE_TIER,
      11 // piece index 11 > free tier 10
    )
    expect(result).toEqual({ allowed: false, reason: 'REQUIRES_PLATFORM_SUB' })
  })

  it('Platform subscriber sees PUBLIC piece beyond free tier limit', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'PUBLIC' }),
      baseCtx({ isPlatformSubscriber: true }),
      FREE_TIER,
      999 // far beyond free tier
    )
    expect(result).toEqual({ allowed: true, signUrl: false })
  })

  it('Author subscriber sees PRIVATE piece (returns signUrl: true)', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'PRIVATE' }),
      baseCtx({ isAuthorSubscriber: true }),
      FREE_TIER,
      1
    )
    expect(result).toEqual({ allowed: true, signUrl: true })
  })

  it('Non-subscriber is blocked on PRIVATE piece with REQUIRES_AUTHOR_SUB', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'PRIVATE' }),
      baseCtx(), // no subscriptions
      FREE_TIER,
      1
    )
    expect(result).toEqual({ allowed: false, reason: 'REQUIRES_AUTHOR_SUB' })
  })

  it('Non-author is blocked on DRAFT piece with FORBIDDEN', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'DRAFT' }),
      baseCtx(),
      FREE_TIER,
      1
    )
    expect(result).toEqual({ allowed: false, reason: 'FORBIDDEN' })
  })

  it('Platform subscriber cannot access DRAFT piece (not author)', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'DRAFT' }),
      baseCtx({ isPlatformSubscriber: true }),
      FREE_TIER,
      1
    )
    expect(result).toEqual({ allowed: false, reason: 'FORBIDDEN' })
  })

  it('FREE viewer at exactly the free tier limit boundary is allowed', () => {
    const result = checkArtPieceAccess(
      basePiece({ visibility: 'PUBLIC' }),
      baseCtx(),
      FREE_TIER,
      10 // exactly at limit
    )
    expect(result).toEqual({ allowed: true, signUrl: false })
  })
})
