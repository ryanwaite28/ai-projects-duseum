// =============================================================================
// frontend/src/services/__tests__/admin.service.test.ts
// Unit tests for adminService — FR-TESTING-03
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adminService } from '../admin.service'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    get:            vi.fn(),
    post:           vi.fn(),
    put:            vi.fn(),
    delete:         vi.fn(),
    deleteWithBody: vi.fn(),
  },
}))

const mockGet            = vi.mocked(api.get)
const mockPut            = vi.mocked(api.put)
const mockDelete         = vi.mocked(api.delete)
const mockDeleteWithBody = vi.mocked(api.deleteWithBody)

beforeEach(() => vi.clearAllMocks())

describe('adminService.getDashboard', () => {
  it('calls GET /admin/dashboard', async () => {
    mockGet.mockResolvedValueOnce({ totalUsers: 10, activePlatformSubs: 2 })
    await adminService.getDashboard()
    expect(mockGet).toHaveBeenCalledWith('/admin/dashboard')
  })
})

describe('adminService.listUsers', () => {
  it('calls GET /admin/users with no params when filters are empty', async () => {
    mockGet.mockResolvedValueOnce({ users: [], nextCursor: null })
    await adminService.listUsers()
    expect(mockGet).toHaveBeenCalledWith('/admin/users')
  })

  it('appends email filter to query string', async () => {
    mockGet.mockResolvedValueOnce({ users: [], nextCursor: null })
    await adminService.listUsers({ email: 'test@example.com' })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('email='))
  })
})

describe('adminService.suspendUser', () => {
  it('calls PUT /admin/users/{userId}/suspend', async () => {
    mockPut.mockResolvedValueOnce({ userId: 'u1', suspended: true, suspendedAt: '2025-01-01T00:00:00.000Z' })
    await adminService.suspendUser('u1')
    expect(mockPut).toHaveBeenCalledWith('/admin/users/u1/suspend', {})
  })
})

describe('adminService.reinstateUser', () => {
  it('calls PUT /admin/users/{userId}/reinstate', async () => {
    mockPut.mockResolvedValueOnce({ userId: 'u1', reinstated: true, reinstatedAt: '2025-01-01T00:00:00.000Z' })
    await adminService.reinstateUser('u1')
    expect(mockPut).toHaveBeenCalledWith('/admin/users/u1/reinstate', {})
  })
})

describe('adminService.removeArtwork', () => {
  it('calls DELETE /admin/artworks/{artworkId}', async () => {
    mockDelete.mockResolvedValueOnce({ artworkId: 'art-001', status: 'ARCHIVED', removedAt: '2025-01-01T00:00:00.000Z' })
    await adminService.removeArtwork('art-001')
    expect(mockDelete).toHaveBeenCalledWith('/admin/artworks/art-001')
  })
})

describe('adminService.updateConfig', () => {
  it('calls PUT /admin/config with body', async () => {
    mockPut.mockResolvedValueOnce({ updated: ['weeklyFeatureFeeUsd'] })
    await adminService.updateConfig({ weeklyFeatureFeeUsd: 30 })
    expect(mockPut).toHaveBeenCalledWith('/admin/config', { weeklyFeatureFeeUsd: 30 })
  })

  it('returns list of updated config keys', async () => {
    mockPut.mockResolvedValueOnce({ updated: ['freeTierLimit', 'platformCutPercent'] })
    const result = await adminService.updateConfig({ freeTierLimit: 5, platformCutPercent: 25 })
    expect(result.updated).toContain('freeTierLimit')
    expect(result.updated).toContain('platformCutPercent')
  })
})

describe('adminService.overrideDailyFeature', () => {
  it('calls PUT /admin/features/daily/override with authorId', async () => {
    mockPut.mockResolvedValueOnce({ authorId: 'a1', previousAuthorId: null })
    await adminService.overrideDailyFeature('a1')
    expect(mockPut).toHaveBeenCalledWith('/admin/features/daily/override', { authorId: 'a1' })
  })
})

describe('adminService.getAdminWeeklyBookings', () => {
  it('calls GET /admin/features/weekly with no params when filters are empty', async () => {
    mockGet.mockResolvedValueOnce({ bookings: [], nextCursor: null })
    await adminService.getAdminWeeklyBookings()
    expect(mockGet).toHaveBeenCalledWith('/admin/features/weekly')
  })

  it('appends week filter to query string', async () => {
    mockGet.mockResolvedValueOnce({ bookings: [], nextCursor: null })
    await adminService.getAdminWeeklyBookings({ week: '2025-W32' })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('week=2025-W32'))
  })
})

describe('adminService.cancelBooking', () => {
  it('calls DELETE /admin/features/weekly/bookings/{bookingId} with reason', async () => {
    mockDeleteWithBody.mockResolvedValueOnce({ bookingId: 'bk-001', status: 'CANCELLED' })
    await adminService.cancelBooking('bk-001', 'Policy violation')
    expect(mockDeleteWithBody).toHaveBeenCalledWith(
      '/admin/features/weekly/bookings/bk-001',
      { reason: 'Policy violation' }
    )
  })
})
