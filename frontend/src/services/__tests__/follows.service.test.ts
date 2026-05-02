// =============================================================================
// frontend/src/services/__tests__/follows.service.test.ts
// Unit tests for followsService — FR-TESTING-03
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { followsService } from '../follows.service'
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

describe('followsService.follow', () => {
  it('calls POST /follows/authors/{authorId}', async () => {
    mockPost.mockResolvedValueOnce({ authorId: 'a1', followedAt: '2025-01-01T00:00:00.000Z', notificationPref: 'ALL_NEW_PIECES' })
    await followsService.follow('a1')
    expect(mockPost).toHaveBeenCalledWith('/follows/authors/a1', {})
  })

  it('returns followedAt and notificationPref from response', async () => {
    const response = { authorId: 'a1', followedAt: '2025-01-01T00:00:00.000Z', notificationPref: 'ALL_NEW_PIECES' as const }
    mockPost.mockResolvedValueOnce(response)
    const result = await followsService.follow('a1')
    expect(result.followedAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.notificationPref).toBe('ALL_NEW_PIECES')
  })
})

describe('followsService.unfollow', () => {
  it('calls DELETE /follows/authors/{authorId}', async () => {
    mockDelete.mockResolvedValueOnce({ authorId: 'a1', unfollowedAt: '2025-01-01T00:00:00.000Z' })
    await followsService.unfollow('a1')
    expect(mockDelete).toHaveBeenCalledWith('/follows/authors/a1')
  })
})

describe('followsService.getNotificationPreferences', () => {
  it('calls GET /users/me/notification-preferences', async () => {
    mockGet.mockResolvedValueOnce({ globalOptOut: false, defaultPref: 'ALL_NEW_PIECES', perAuthorOverrides: [] })
    await followsService.getNotificationPreferences()
    expect(mockGet).toHaveBeenCalledWith('/users/me/notification-preferences')
  })

  it('returns globalOptOut, defaultPref, perAuthorOverrides', async () => {
    const response = {
      globalOptOut: true,
      defaultPref: 'NONE' as const,
      perAuthorOverrides: [{ authorId: 'a1', pref: 'ALL_NEW_PIECES' as const, updatedAt: '2025-01-01T00:00:00.000Z' }],
    }
    mockGet.mockResolvedValueOnce(response)
    const result = await followsService.getNotificationPreferences()
    expect(result.globalOptOut).toBe(true)
    expect(result.defaultPref).toBe('NONE')
    expect(result.perAuthorOverrides).toHaveLength(1)
  })
})

describe('followsService.updateNotificationPreferences', () => {
  it('calls PUT /users/me/notification-preferences with patch', async () => {
    mockPut.mockResolvedValueOnce({ globalOptOut: true, defaultPref: 'NONE', perAuthorOverrides: [] })
    const patch = { globalOptOut: true }
    await followsService.updateNotificationPreferences(patch)
    expect(mockPut).toHaveBeenCalledWith('/users/me/notification-preferences', patch)
  })
})

describe('followsService.unsubscribeByToken', () => {
  it('calls GET /notifications/unsubscribe with encoded token', async () => {
    mockGet.mockResolvedValueOnce({ message: 'ok', authorId: 'a1', authorDisplayName: 'Test' })
    await followsService.unsubscribeByToken('my-token-value')
    const calledUrl = mockGet.mock.calls[0][0] as string
    expect(calledUrl).toContain('/notifications/unsubscribe')
    expect(calledUrl).toContain('token=')
  })
})
