// =============================================================================
// frontend/src/services/__tests__/social.service.test.ts
// Unit tests for socialService — FR-TESTING-03
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { socialService } from '../social.service'
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

describe('socialService.listComments', () => {
  it('calls GET /artworks/{artworkId}/comments?limit=20 without cursor', async () => {
    mockGet.mockResolvedValueOnce({ items: [], nextCursor: null })
    await socialService.listComments('art-001')
    expect(mockGet).toHaveBeenCalledWith('/artworks/art-001/comments?limit=20')
  })

  it('appends cursor and limit when cursor provided', async () => {
    mockGet.mockResolvedValueOnce({ items: [], nextCursor: null })
    await socialService.listComments('art-001', 'cursor-abc')
    expect(mockGet).toHaveBeenCalledWith(
      '/artworks/art-001/comments?cursor=cursor-abc&limit=20'
    )
  })

  it('returns items and nextCursor', async () => {
    const response = {
      items: [{ commentId: 'c1', body: 'Nice!', authorId: 'u1', createdAt: '2025-01-01T00:00:00.000Z' }],
      nextCursor: 'next-cursor',
    }
    mockGet.mockResolvedValueOnce(response)
    const result = await socialService.listComments('art-001')
    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBe('next-cursor')
  })
})

describe('socialService.postComment', () => {
  it('calls POST /artworks/{artworkId}/comments with body', async () => {
    mockPost.mockResolvedValueOnce({ commentId: 'c1', body: 'Hello', authorId: 'u1' })
    await socialService.postComment('art-001', 'Hello')
    expect(mockPost).toHaveBeenCalledWith('/artworks/art-001/comments', {
      body: 'Hello',
      parentCommentId: null,
    })
  })

  it('passes parentCommentId when provided', async () => {
    mockPost.mockResolvedValueOnce({ commentId: 'c2', body: 'Reply', authorId: 'u1' })
    await socialService.postComment('art-001', 'Reply', 'c1')
    expect(mockPost).toHaveBeenCalledWith('/artworks/art-001/comments', {
      body: 'Reply',
      parentCommentId: 'c1',
    })
  })
})

describe('socialService.deleteComment', () => {
  it('calls DELETE /comments/{commentId}', async () => {
    mockDelete.mockResolvedValueOnce({ commentId: 'c1', deletedAt: '2025-01-01T00:00:00.000Z' })
    await socialService.deleteComment('c1')
    expect(mockDelete).toHaveBeenCalledWith('/comments/c1')
  })
})

describe('socialService.upsertReaction', () => {
  it('calls PUT /artworks/{artworkId}/reactions with reactionType', async () => {
    mockPut.mockResolvedValueOnce({ artworkId: 'art-001', reactionType: 'LOVE' })
    await socialService.upsertReaction('art-001', 'LOVE')
    expect(mockPut).toHaveBeenCalledWith('/artworks/art-001/reactions', { reactionType: 'LOVE' })
  })
})

describe('socialService.deleteReaction', () => {
  it('calls DELETE /artworks/{artworkId}/reactions', async () => {
    mockDelete.mockResolvedValueOnce({ artworkId: 'art-001' })
    await socialService.deleteReaction('art-001')
    expect(mockDelete).toHaveBeenCalledWith('/artworks/art-001/reactions')
  })
})

describe('socialService.pinComment', () => {
  it('calls PUT /artworks/{artworkId}/comments/{commentId}/pin', async () => {
    mockPut.mockResolvedValueOnce({ commentId: 'c1', isPinned: true })
    await socialService.pinComment('art-001', 'c1')
    expect(mockPut).toHaveBeenCalledWith('/artworks/art-001/comments/c1/pin', {})
  })
})
