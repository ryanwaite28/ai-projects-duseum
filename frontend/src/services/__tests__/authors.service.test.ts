// =============================================================================
// frontend/src/services/__tests__/authors.service.test.ts
// Unit tests for getAuthor() response mapping.
//
// Regression: getAuthor() previously returned the raw { profile, gallery }
// wrapper without unwrapping, causing author.followerCount to be undefined
// and author.reactionCounts to crash with "Cannot convert undefined to object".
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAuthor } from '../authors.service'
import { api } from '../api'

vi.mock('../api', () => ({
  api: { get: vi.fn() },
}))

const mockGet = vi.mocked(api.get)

const makeApiResponse = (overrides: Record<string, unknown> = {}) => ({
  profile: {
    authorId:                     'author-001',
    displayName:                  'Test Author',
    bio:                          'A short bio.',
    profilePhotoUrl:              'https://cdn.test/photo.jpg',
    coverPhotoUrl:                null,
    followerCount:                42,
    subscriberCount:              5,
    totalPiecesCount:             3,
    authorSubscriptionMonthlyUsd: 9.99,
    connectChargesEnabled:        true,
    createdAt:                    '2025-01-01T00:00:00.000Z',
    ...overrides,
  },
  gallery: {
    items: [
      {
        artworkId:    'art-001',
        title:        'Piece One',
        category:     'DIGITAL',
        tags:         ['abstract'],
        thumbnailUrl: 'https://cdn.test/art-001.jpg',
        viewCount:    100,
        publishedAt:  '2025-03-01T00:00:00.000Z',
      },
    ],
    nextCursor: null,
  },
})

describe('getAuthor', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('profile field mapping', () => {
    it('maps authorId → userId', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.userId).toBe('author-001')
    })

    it('maps profilePhotoUrl → avatarUrl', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.avatarUrl).toBe('https://cdn.test/photo.jpg')
    })

    it('maps authorSubscriptionMonthlyUsd → authorSubscriptionPriceUsd', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.authorSubscriptionPriceUsd).toBe(9.99)
    })

    it('passes through followerCount and subscriberCount directly', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.followerCount).toBe(42)
      expect(result.subscriberCount).toBe(5)
    })

    it('passes through displayName, bio, coverPhotoUrl, connectChargesEnabled', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.displayName).toBe('Test Author')
      expect(result.bio).toBe('A short bio.')
      expect(result.coverPhotoUrl).toBeNull()
      expect(result.connectChargesEnabled).toBe(true)
    })

    it('status is always ACTIVE', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.status).toBe('ACTIVE')
    })

    it('handles null authorSubscriptionMonthlyUsd', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse({ authorSubscriptionMonthlyUsd: null }))
      const result = await getAuthor('author-001')
      expect(result.authorSubscriptionPriceUsd).toBeNull()
    })
  })

  describe('gallery item normalization', () => {
    it('fills authorId from profile.authorId', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.recentPieces[0].authorId).toBe('author-001')
    })

    it('fills authorDisplayName from profile.displayName', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.recentPieces[0].authorDisplayName).toBe('Test Author')
    })

    it('sets accessTier to PUBLIC for all gallery items', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.recentPieces[0].accessTier).toBe('PUBLIC')
    })

    it('sets reactionCounts to {} — prevents Object.values(undefined) crash', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.recentPieces[0].reactionCounts).toEqual({})
      // Verify the crash scenario is resolved: Object.values({}) must not throw
      expect(() =>
        Object.values(result.recentPieces[0].reactionCounts).reduce((a, b) => a + (b ?? 0), 0)
      ).not.toThrow()
    })

    it('sets commentCount to 0', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      expect(result.recentPieces[0].commentCount).toBe(0)
    })

    it('preserves original gallery item fields', async () => {
      mockGet.mockResolvedValueOnce(makeApiResponse())
      const result = await getAuthor('author-001')
      const piece = result.recentPieces[0]
      expect(piece.artworkId).toBe('art-001')
      expect(piece.title).toBe('Piece One')
      expect(piece.category).toBe('DIGITAL')
      expect(piece.tags).toEqual(['abstract'])
      expect(piece.thumbnailUrl).toBe('https://cdn.test/art-001.jpg')
      expect(piece.viewCount).toBe(100)
      expect(piece.publishedAt).toBe('2025-03-01T00:00:00.000Z')
    })

    it('returns empty recentPieces when gallery is empty', async () => {
      const response = makeApiResponse()
      ;(response.gallery as { items: unknown[] }).items = []
      mockGet.mockResolvedValueOnce(response)
      const result = await getAuthor('author-001')
      expect(result.recentPieces).toEqual([])
    })
  })
})
