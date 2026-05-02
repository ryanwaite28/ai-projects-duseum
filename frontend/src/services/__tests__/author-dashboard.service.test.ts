// =============================================================================
// frontend/src/services/__tests__/author-dashboard.service.test.ts
// Unit tests for authorDashboardService — FR-TESTING-03
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authorDashboardService } from '../author-dashboard.service'
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

describe('authorDashboardService.connectOnboard', () => {
  it('calls POST /subscriptions/connect/onboard', async () => {
    mockPost.mockResolvedValueOnce({ accountLinkUrl: 'https://connect.stripe.com/setup/test' })
    await authorDashboardService.connectOnboard()
    expect(mockPost).toHaveBeenCalledWith('/subscriptions/connect/onboard', {})
  })

  it('returns accountLinkUrl', async () => {
    mockPost.mockResolvedValueOnce({ accountLinkUrl: 'https://connect.stripe.com/setup/test' })
    const result = await authorDashboardService.connectOnboard()
    expect(result.accountLinkUrl).toBe('https://connect.stripe.com/setup/test')
  })
})

describe('authorDashboardService.connectStatus', () => {
  it('calls GET /subscriptions/connect/status', async () => {
    mockGet.mockResolvedValueOnce({
      stripeConnectAccountId: 'acct_test',
      chargesEnabled: true,
      detailsSubmitted: true,
    })
    await authorDashboardService.connectStatus()
    expect(mockGet).toHaveBeenCalledWith('/subscriptions/connect/status')
  })

  it('returns stripeConnectAccountId, chargesEnabled, detailsSubmitted', async () => {
    const response = {
      stripeConnectAccountId: 'acct_test',
      chargesEnabled: false,
      detailsSubmitted: true,
    }
    mockGet.mockResolvedValueOnce(response)
    const result = await authorDashboardService.connectStatus()
    expect(result.stripeConnectAccountId).toBe('acct_test')
    expect(result.chargesEnabled).toBe(false)
    expect(result.detailsSubmitted).toBe(true)
  })
})

describe('authorDashboardService.setSubscriptionPrice', () => {
  it('calls POST /users/me/author/subscription-price with amountUsd', async () => {
    mockPost.mockResolvedValueOnce({ priceId: 'price_001', monthlyUsd: 9.99 })
    await authorDashboardService.setSubscriptionPrice(9.99)
    expect(mockPost).toHaveBeenCalledWith('/users/me/author/subscription-price', { amountUsd: 9.99 })
  })

  it('returns priceId and monthlyUsd from response', async () => {
    mockPost.mockResolvedValueOnce({ priceId: 'price_001', monthlyUsd: 9.99 })
    const result = await authorDashboardService.setSubscriptionPrice(9.99)
    expect(result.priceId).toBe('price_001')
    expect(result.monthlyUsd).toBe(9.99)
  })

  it('handles null priceId when amountUsd is 0 (disable subscriptions)', async () => {
    mockPost.mockResolvedValueOnce({ priceId: null, monthlyUsd: null })
    const result = await authorDashboardService.setSubscriptionPrice(0)
    expect(result.priceId).toBeNull()
    expect(result.monthlyUsd).toBeNull()
  })
})
