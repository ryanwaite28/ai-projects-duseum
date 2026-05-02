// =============================================================================
// frontend/src/services/__tests__/artworks.service.test.ts
// Unit tests for artworks.service.ts response mapping — FR-TESTING-03
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listArtworks,
  getArtwork,
  createArtwork,
  updateArtwork,
  deleteArtwork,
  getUploadIntent,
} from '../artworks.service'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    get:    vi.fn(),
    post:   vi.fn(),
    put:    vi.fn(),
    delete: vi.fn(),
  },
}))

const mockGet    = vi.mocked(api.get)
const mockPost   = vi.mocked(api.post)
const mockPut    = vi.mocked(api.put)
const mockDelete = vi.mocked(api.delete)

beforeEach(() => vi.clearAllMocks())

// ── listArtworks ──────────────────────────────────────────────────────────────

describe('listArtworks', () => {
  const mockListResponse = {
    items: [
      {
        artworkId: 'art-001',
        title: 'Piece One',
        category: 'DIGITAL',
        tags: ['abstract'],
        thumbnailUrl: 'https://cdn.test/art-001.jpg',
        viewCount: 100,
        accessTier: 'PUBLIC',
        authorId: 'author-001',
        authorDisplayName: 'Test Author',
        reactionCounts: {},
        commentCount: 0,
        publishedAt: '2025-03-01T00:00:00.000Z',
      },
    ],
    nextCursor: null,
  }

  it('calls GET /artworks with no query params when filters are empty', async () => {
    mockGet.mockResolvedValueOnce(mockListResponse)
    await listArtworks({})
    expect(mockGet).toHaveBeenCalledWith('/artworks')
  })

  it('appends tag filter to query string', async () => {
    mockGet.mockResolvedValueOnce(mockListResponse)
    await listArtworks({ tag: 'abstract' })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('tag=abstract'))
  })

  it('appends category filter to query string', async () => {
    mockGet.mockResolvedValueOnce(mockListResponse)
    await listArtworks({ category: 'DIGITAL' })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('category=DIGITAL'))
  })

  it('appends authorId filter to query string', async () => {
    mockGet.mockResolvedValueOnce(mockListResponse)
    await listArtworks({ authorId: 'author-001' })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('authorId=author-001'))
  })

  it('appends cursor to query string', async () => {
    mockGet.mockResolvedValueOnce(mockListResponse)
    await listArtworks({ cursor: 'eyJjdXJzb3IiOiIxIn0' })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('cursor='))
  })

  it('returns the API response directly', async () => {
    mockGet.mockResolvedValueOnce(mockListResponse)
    const result = await listArtworks({})
    expect(result).toEqual(mockListResponse)
  })
})

// ── getArtwork ────────────────────────────────────────────────────────────────

describe('getArtwork', () => {
  it('calls GET /artworks/{artworkId}', async () => {
    mockGet.mockResolvedValueOnce({ artworkId: 'art-001' })
    await getArtwork('art-001')
    expect(mockGet).toHaveBeenCalledWith('/artworks/art-001')
  })

  it('returns artwork object from API', async () => {
    const artwork = { artworkId: 'art-001', title: 'Test', visibility: 'PUBLIC' }
    mockGet.mockResolvedValueOnce(artwork)
    const result = await getArtwork('art-001')
    expect(result).toEqual(artwork)
  })
})

// ── createArtwork ─────────────────────────────────────────────────────────────

describe('createArtwork', () => {
  it('calls POST /artworks with request body', async () => {
    const body = {
      s3Key: 'some/key.jpg',
      title: 'New Piece',
      description: '',
      category: 'DIGITAL' as const,
      tags: [],
      visibility: 'PUBLIC' as const,
      mimeType: 'image/jpeg',
      fileSizeBytes: 1024,
      commentsEnabled: true,
    }
    mockPost.mockResolvedValueOnce({ artworkId: 'new-001', ...body })
    await createArtwork(body)
    expect(mockPost).toHaveBeenCalledWith('/artworks', body)
  })
})

// ── updateArtwork ─────────────────────────────────────────────────────────────

describe('updateArtwork', () => {
  it('calls PUT /artworks/{artworkId} with patch', async () => {
    mockPut.mockResolvedValueOnce({ artworkId: 'art-001', title: 'Updated' })
    await updateArtwork('art-001', { title: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/artworks/art-001', { title: 'Updated' })
  })
})

// ── deleteArtwork ─────────────────────────────────────────────────────────────

describe('deleteArtwork', () => {
  it('calls DELETE /artworks/{artworkId} without permanent flag by default', async () => {
    mockDelete.mockResolvedValueOnce(undefined)
    await deleteArtwork('art-001')
    expect(mockDelete).toHaveBeenCalledWith('/artworks/art-001')
  })

  it('appends ?permanent=true when flag is set', async () => {
    mockDelete.mockResolvedValueOnce(undefined)
    await deleteArtwork('art-001', true)
    expect(mockDelete).toHaveBeenCalledWith('/artworks/art-001?permanent=true')
  })
})

// ── getUploadIntent ───────────────────────────────────────────────────────────

describe('getUploadIntent', () => {
  it('calls POST /media/upload-intent with opts', async () => {
    const opts = { fileName: 'test.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 }
    mockPost.mockResolvedValueOnce({ uploadUrl: 'https://s3.test/upload', intentId: 'intent-001', s3Key: 'key/test.jpg' })
    await getUploadIntent(opts)
    expect(mockPost).toHaveBeenCalledWith('/media/upload-intent', opts)
  })

  it('returns uploadUrl, intentId, s3Key from API', async () => {
    const response = { uploadUrl: 'https://s3.test/upload', intentId: 'intent-001', s3Key: 'key/test.jpg' }
    mockPost.mockResolvedValueOnce(response)
    const result = await getUploadIntent({ fileName: 'f.jpg', mimeType: 'image/jpeg', sizeBytes: 100 })
    expect(result.uploadUrl).toBe('https://s3.test/upload')
    expect(result.intentId).toBe('intent-001')
    expect(result.s3Key).toBe('key/test.jpg')
  })
})
