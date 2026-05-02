// =============================================================================
// frontend/src/services/__tests__/subscriptions.service.test.ts
// Unit tests for subscriptionsService — FR-TESTING-03
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { subscriptionsService } from '../subscriptions.service'
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

describe('subscriptionsService.getMySubscriptions', () => {
  it('calls GET /subscriptions/me', async () => {
    mockGet.mockResolvedValueOnce({ platform: null, authorSubscriptions: [] })
    await subscriptionsService.getMySubscriptions()
    expect(mockGet).toHaveBeenCalledWith('/subscriptions/me')
  })

  it('returns platform and authorSubscriptions from response', async () => {
    const platformSub = {
      userId: 'u1', targetId: 'PLATFORM', stripeSubscriptionId: 'sub_001',
      stripeCustomerId: 'cus_001', status: 'ACTIVE' as const,
      currentPeriodEnd: '2026-01-01T00:00:00.000Z', createdAt: '2025-01-01T00:00:00.000Z',
    }
    mockGet.mockResolvedValueOnce({ platform: platformSub, authorSubscriptions: [] })
    const result = await subscriptionsService.getMySubscriptions()
    expect(result.platform).toEqual(platformSub)
    expect(result.authorSubscriptions).toEqual([])
  })
})

describe('subscriptionsService.createPlatformCheckout', () => {
  it('calls POST /subscriptions/platform', async () => {
    mockPost.mockResolvedValueOnce({ checkoutUrl: 'https://checkout.stripe.com/test' })
    await subscriptionsService.createPlatformCheckout()
    expect(mockPost).toHaveBeenCalledWith('/subscriptions/platform', {})
  })

  it('returns checkoutUrl', async () => {
    mockPost.mockResolvedValueOnce({ checkoutUrl: 'https://checkout.stripe.com/test' })
    const result = await subscriptionsService.createPlatformCheckout()
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/test')
  })
})

describe('subscriptionsService.createAuthorCheckout', () => {
  it('calls POST /subscriptions/authors/{authorId}', async () => {
    mockPost.mockResolvedValueOnce({ checkoutUrl: 'https://checkout.stripe.com/author' })
    await subscriptionsService.createAuthorCheckout('author-001')
    expect(mockPost).toHaveBeenCalledWith('/subscriptions/authors/author-001', {})
  })
})

describe('subscriptionsService.createPortalSession', () => {
  it('calls POST /subscriptions/portal', async () => {
    mockPost.mockResolvedValueOnce({ portalUrl: 'https://billing.stripe.com/portal' })
    await subscriptionsService.createPortalSession()
    expect(mockPost).toHaveBeenCalledWith('/subscriptions/portal', {})
  })

  it('returns portalUrl', async () => {
    mockPost.mockResolvedValueOnce({ portalUrl: 'https://billing.stripe.com/portal' })
    const result = await subscriptionsService.createPortalSession()
    expect(result.portalUrl).toBe('https://billing.stripe.com/portal')
  })
})

describe('subscriptionsService.getMySubscribers', () => {
  it('calls GET /subscriptions/me/subscribers without cursor', async () => {
    mockGet.mockResolvedValueOnce({ items: [], nextCursor: null, total: 0 })
    await subscriptionsService.getMySubscribers()
    expect(mockGet).toHaveBeenCalledWith('/subscriptions/me/subscribers')
  })

  it('appends cursor query param when provided', async () => {
    mockGet.mockResolvedValueOnce({ items: [], nextCursor: null, total: 0 })
    await subscriptionsService.getMySubscribers('some-cursor')
    const calledUrl = mockGet.mock.calls[0][0] as string
    expect(calledUrl).toContain('/subscriptions/me/subscribers?cursor=')
    expect(calledUrl).toContain('some-cursor')
  })

  it('returns items, nextCursor, total from response', async () => {
    const response = {
      items: [{ userId: 'u1', stripeSubscriptionId: 'sub_001', status: 'ACTIVE' as const, currentPeriodEnd: '2026-01-01T00:00:00.000Z', createdAt: '2025-01-01T00:00:00.000Z' }],
      nextCursor: null,
      total: 1,
    }
    mockGet.mockResolvedValueOnce(response)
    const result = await subscriptionsService.getMySubscribers()
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.nextCursor).toBeNull()
  })
})
