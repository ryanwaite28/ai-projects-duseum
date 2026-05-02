// =============================================================================
// frontend/src/services/__tests__/collections.service.test.ts
// Unit tests for collectionsService — FR-TESTING-03
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collectionsService } from '../collections.service'
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

describe('collectionsService.listMy', () => {
  it('calls GET /authors/{authorId}/collections', async () => {
    mockGet.mockResolvedValueOnce({ items: [] })
    await collectionsService.listMy('author-001')
    expect(mockGet).toHaveBeenCalledWith('/authors/author-001/collections')
  })

  it('returns items array', async () => {
    const collection = { collectionId: 'col-001', title: 'My Work', visibility: 'FREE' }
    mockGet.mockResolvedValueOnce({ items: [collection] })
    const result = await collectionsService.listMy('author-001')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].collectionId).toBe('col-001')
  })
})

describe('collectionsService.create', () => {
  it('calls POST /collections with body', async () => {
    const body = { title: 'New Collection', visibility: 'FREE' as const }
    mockPost.mockResolvedValueOnce({ collectionId: 'col-001', ...body })
    await collectionsService.create(body)
    expect(mockPost).toHaveBeenCalledWith('/collections', body)
  })

  // FR-TESTING-06: regression — frontend was sending 'PUBLIC'/'PRIVATE' causing backend 400
  it('sends FREE (not PUBLIC) for free visibility', async () => {
    mockPost.mockResolvedValueOnce({ collectionId: 'col-001' })
    await collectionsService.create({ title: 'Free Collection', visibility: 'FREE' })
    const [, body] = mockPost.mock.calls[0]
    expect((body as { visibility: string }).visibility).toBe('FREE')
    expect((body as { visibility: string }).visibility).not.toBe('PUBLIC')
  })

  it('sends SUBSCRIBER_ONLY (not PRIVATE) for subscriber visibility', async () => {
    mockPost.mockResolvedValueOnce({ collectionId: 'col-002' })
    await collectionsService.create({ title: 'Sub Collection', visibility: 'SUBSCRIBER_ONLY' })
    const [, body] = mockPost.mock.calls[0]
    expect((body as { visibility: string }).visibility).toBe('SUBSCRIBER_ONLY')
    expect((body as { visibility: string }).visibility).not.toBe('PRIVATE')
  })
})

describe('collectionsService.update', () => {
  it('calls PUT /collections/{collectionId} with patch', async () => {
    mockPut.mockResolvedValueOnce({ collectionId: 'col-001', title: 'Updated' })
    await collectionsService.update('col-001', { title: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/collections/col-001', { title: 'Updated' })
  })
})

describe('collectionsService.delete', () => {
  it('calls DELETE /collections/{collectionId}', async () => {
    mockDelete.mockResolvedValueOnce(undefined)
    await collectionsService.delete('col-001')
    expect(mockDelete).toHaveBeenCalledWith('/collections/col-001')
  })
})

describe('collectionsService.listPieces', () => {
  it('calls GET /collections/{collectionId}/pieces', async () => {
    mockGet.mockResolvedValueOnce({ pieces: [] })
    await collectionsService.listPieces('col-001')
    expect(mockGet).toHaveBeenCalledWith('/collections/col-001/pieces')
  })
})

describe('collectionsService.addPiece', () => {
  it('calls POST /collections/{collectionId}/pieces with artworkId and displayOrder', async () => {
    mockPost.mockResolvedValueOnce(undefined)
    await collectionsService.addPiece('col-001', 'art-001', 1)
    expect(mockPost).toHaveBeenCalledWith('/collections/col-001/pieces', {
      artworkId: 'art-001',
      displayOrder: 1,
    })
  })
})

describe('collectionsService.removePiece', () => {
  it('calls DELETE /collections/{collectionId}/pieces/{artworkId}', async () => {
    mockDelete.mockResolvedValueOnce(undefined)
    await collectionsService.removePiece('col-001', 'art-001')
    expect(mockDelete).toHaveBeenCalledWith('/collections/col-001/pieces/art-001')
  })
})
