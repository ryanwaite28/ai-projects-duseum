// =============================================================================
// frontend/src/services/__tests__/features.service.test.ts
// Unit tests for featuresService response passthrough — FR-TESTING-03
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { featuresService } from '../features.service'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    get:  vi.fn(),
    post: vi.fn(),
  },
}))

const mockGet  = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)

beforeEach(() => vi.clearAllMocks())

describe('featuresService.getDailyFeatured', () => {
  it('calls GET /features/daily', async () => {
    mockGet.mockResolvedValueOnce({ authorId: 'a1' })
    await featuresService.getDailyFeatured()
    expect(mockGet).toHaveBeenCalledWith('/features/daily')
  })
})

describe('featuresService.getWeeklyFeatured', () => {
  it('calls GET /features/weekly when no week param', async () => {
    mockGet.mockResolvedValueOnce({ isoWeek: '2025-W32', featuredAuthors: [] })
    await featuresService.getWeeklyFeatured()
    expect(mockGet).toHaveBeenCalledWith('/features/weekly')
  })

  it('includes week query param when provided', async () => {
    mockGet.mockResolvedValueOnce({ isoWeek: '2025-W10', featuredAuthors: [] })
    await featuresService.getWeeklyFeatured('2025-W10')
    expect(mockGet).toHaveBeenCalledWith('/features/weekly?week=2025-W10')
  })
})

describe('featuresService.getWeeklyAvailability', () => {
  it('calls GET /features/weekly/availability', async () => {
    mockGet.mockResolvedValueOnce({ weeks: [], feeUsd: 25 })
    await featuresService.getWeeklyAvailability()
    expect(mockGet).toHaveBeenCalledWith('/features/weekly/availability')
  })
})

describe('featuresService.bookWeekly', () => {
  it('calls POST /features/weekly/book with isoWeek in body', async () => {
    mockPost.mockResolvedValueOnce({ bookingId: 'bk-001', clientSecret: 'pi_secret' })
    await featuresService.bookWeekly('2025-W32')
    expect(mockPost).toHaveBeenCalledWith('/features/weekly/book', { isoWeek: '2025-W32' })
  })
})

describe('featuresService.getMyBookings', () => {
  it('calls GET /features/weekly/my-bookings', async () => {
    mockGet.mockResolvedValueOnce({ items: [], nextEligibleWeek: '2025-W45' })
    await featuresService.getMyBookings()
    expect(mockGet).toHaveBeenCalledWith('/features/weekly/my-bookings')
  })

  it('returns items and nextEligibleWeek from response', async () => {
    const response = {
      items: [{ bookingId: 'bk-001', isoWeek: '2025-W32', featureStatus: 'CONFIRMED' }],
      nextEligibleWeek: '2025-W45',
    }
    mockGet.mockResolvedValueOnce(response)
    const result = await featuresService.getMyBookings()
    expect(result.items).toHaveLength(1)
    expect(result.nextEligibleWeek).toBe('2025-W45')
  })
})
