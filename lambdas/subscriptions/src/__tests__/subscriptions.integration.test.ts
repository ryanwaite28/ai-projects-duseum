// =============================================================================
// lambdas/subscriptions/src/__tests__/subscriptions.integration.test.ts
// Integration tests — Section 15.3
//
// Prerequisites: MiniStack running at localhost:4566
// Stripe SDK calls are mocked — tests validate routing, DynamoDB reads/writes,
// and error responses without hitting real Stripe.
// =============================================================================

import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { handler } from '../index.js'
import {
  TABLE,
  CONFIG_TABLE,
  docClient,
  makeCtx,
  makeEvent,
  seedItem,
} from './setup.js'

// ── Stripe mock ───────────────────────────────────────────────────────────────
// All Stripe API calls are mocked; this test suite validates DynamoDB logic,
// routing, and error responses — not Stripe's SDK.

vi.mock('@duseum/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duseum/shared')>()
  return {
    ...actual,
    getStripeClient: vi.fn(),
    createCheckoutSession: vi.fn().mockResolvedValue({
      url: 'https://checkout.stripe.com/test-session-url',
      id:  'cs_test_123',
    }),
    createBillingPortalSession: vi.fn().mockResolvedValue({
      url: 'https://billing.stripe.com/test-portal-url',
    }),
    createStripeCustomer: vi.fn().mockResolvedValue({
      id: 'cus_test_mock_001',
    }),
    createConnectAccount: vi.fn().mockResolvedValue({
      id: 'acct_test_new_connect',
    }),
    createAccountLink: vi.fn().mockResolvedValue({
      url: 'https://connect.stripe.com/setup/e/test-link',
    }),
    retrieveConnectAccount: vi.fn().mockImplementation((accountId: string) => {
      // acct_incomplete → not yet charges_enabled
      if (accountId === 'acct_incomplete') {
        return Promise.resolve({ id: accountId, charges_enabled: false, details_submitted: false })
      }
      return Promise.resolve({ id: accountId, charges_enabled: true, details_submitted: true })
    }),
    createConnectPrice: vi.fn().mockResolvedValue({
      id: 'price_test_mock_001',
    }),
  }
})

// ── Seed helpers ──────────────────────────────────────────────────────────────

const USER_ID   = 'user-sub-test-001'
const AUTHOR_ID = 'author-sub-test-001'

const seedUserAccount = (userId = USER_ID, overrides: Record<string, unknown> = {}) =>
  seedItem({
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    userId,
    email: `${userId}@test.com`,
    createdAt: '2025-08-01T00:00:00.000Z',
    ...overrides,
  })

const seedAuthorProfile = (authorId = AUTHOR_ID, overrides: Record<string, unknown> = {}) =>
  seedItem({
    PK: `USER#${authorId}`,
    SK: 'PROFILE#AUTHOR',
    userId: authorId,
    displayName: 'Test Author',
    bio: 'A test author',
    status: 'ACTIVE',
    stripeConnectAccountId: 'acct_test_connect_001',
    authorSubscriptionPriceId: 'price_author_test_456',
    authorSubscriptionMonthlyUsd: 5,
    followerCount: 0,
    subscriberCount: 0,
    createdAt: '2025-08-01T00:00:00.000Z',
    profileType: 'AUTHOR',
    ...overrides,
  })

const seedPlatformSubscription = (userId = USER_ID, status = 'ACTIVE') =>
  seedItem({
    PK: `USER#${userId}`,
    SK: 'SUB#PLATFORM',
    userId,
    targetId: 'PLATFORM',
    stripeSubscriptionId: 'sub_platform_test',
    stripeCustomerId: 'cus_existing_001',
    status,
    currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    createdAt: '2025-08-01T00:00:00.000Z',
  })

const seedAuthorSubscription = (userId = USER_ID, authorId = AUTHOR_ID, status = 'ACTIVE') =>
  seedItem({
    PK: `USER#${userId}`,
    SK: `SUB#AUTHOR#${authorId}`,
    userId,
    targetId: authorId,
    stripeSubscriptionId: 'sub_author_test',
    stripeCustomerId: 'cus_existing_001',
    status,
    currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    createdAt: '2025-08-01T00:00:00.000Z',
  })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /subscriptions/me', () => {
  it('returns empty when no subscriptions exist', async () => {
    await seedUserAccount()

    const event = makeEvent('GET', '/subscriptions/me', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.platform).toBeNull()
    expect(body.authorSubscriptions).toEqual([])
  })

  it('returns platform subscription when present', async () => {
    await seedUserAccount()
    await seedPlatformSubscription()

    const event = makeEvent('GET', '/subscriptions/me', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.platform).not.toBeNull()
    expect(body.platform.targetId).toBe('PLATFORM')
    expect(body.platform.status).toBe('ACTIVE')
  })

  it('separates platform and author subscriptions correctly', async () => {
    await seedUserAccount()
    await seedPlatformSubscription()
    await seedAuthorProfile()
    await seedAuthorSubscription()

    const event = makeEvent('GET', '/subscriptions/me', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.platform.targetId).toBe('PLATFORM')
    expect(body.authorSubscriptions).toHaveLength(1)
    expect(body.authorSubscriptions[0].targetId).toBe(AUTHOR_ID)
  })
})

describe('POST /subscriptions/platform', () => {
  it('returns checkoutUrl when no existing subscription', async () => {
    await seedUserAccount()

    const event = makeEvent('POST', '/subscriptions/platform', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test-session-url')
  })

  it('returns 409 when caller already has an active platform subscription', async () => {
    await seedUserAccount()
    await seedPlatformSubscription(USER_ID, 'ACTIVE')

    const event = makeEvent('POST', '/subscriptions/platform', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(409)
    const body = JSON.parse(result.body as string)
    expect(body.error.code).toBe('CONFLICT')
  })
})

describe('POST /subscriptions/authors/{authorId}', () => {
  it('returns 404 for non-existent authorId', async () => {
    await seedUserAccount()

    const event = makeEvent('POST', `/subscriptions/authors/nonexistent-author`, {
      userId: USER_ID,
      pathParameters: { authorId: 'nonexistent-author' },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(404)
  })

  it('returns 400 when author has no subscription price set', async () => {
    await seedUserAccount()
    await seedAuthorProfile(AUTHOR_ID, {
      authorSubscriptionPriceId: null,
      stripeConnectAccountId: 'acct_test',
    })

    const event = makeEvent('POST', `/subscriptions/authors/${AUTHOR_ID}`, {
      userId: USER_ID,
      pathParameters: { authorId: AUTHOR_ID },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.message).toMatch(/subscriptions/)
  })

  it('returns 400 when author has no Stripe Connect account', async () => {
    await seedUserAccount()
    await seedAuthorProfile(AUTHOR_ID, {
      stripeConnectAccountId: null,
      authorSubscriptionPriceId: 'price_something',
    })

    const event = makeEvent('POST', `/subscriptions/authors/${AUTHOR_ID}`, {
      userId: USER_ID,
      pathParameters: { authorId: AUTHOR_ID },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.message).toMatch(/Stripe/)
  })

  it('returns checkoutUrl for valid author subscription', async () => {
    await seedUserAccount()
    await seedAuthorProfile()

    const event = makeEvent('POST', `/subscriptions/authors/${AUTHOR_ID}`, {
      userId: USER_ID,
      pathParameters: { authorId: AUTHOR_ID },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test-session-url')
  })

  it('returns 409 when caller is already subscribed to this author', async () => {
    await seedUserAccount()
    await seedAuthorProfile()
    await seedAuthorSubscription(USER_ID, AUTHOR_ID, 'ACTIVE')

    const event = makeEvent('POST', `/subscriptions/authors/${AUTHOR_ID}`, {
      userId: USER_ID,
      pathParameters: { authorId: AUTHOR_ID },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(409)
  })
})

describe('POST /subscriptions/portal', () => {
  it('returns 400 when user has no Stripe customer ID', async () => {
    await seedUserAccount(USER_ID, { stripeCustomerId: undefined })

    const event = makeEvent('POST', '/subscriptions/portal', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.message).toMatch(/billing account/)
  })

  it('returns portalUrl when user has existing Stripe customer', async () => {
    await seedUserAccount(USER_ID, { stripeCustomerId: 'cus_existing_portal_001' })

    const event = makeEvent('POST', '/subscriptions/portal', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.portalUrl).toBe('https://billing.stripe.com/test-portal-url')
  })
})

// ── Connect onboarding ────────────────────────────────────────────────────────

describe('POST /subscriptions/connect/onboard', () => {
  it('creates a Connect account and returns accountLinkUrl for new author', async () => {
    await seedAuthorProfile(USER_ID, { stripeConnectAccountId: null })

    const event = makeEvent('POST', '/subscriptions/connect/onboard', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.accountLinkUrl).toBe('https://connect.stripe.com/setup/e/test-link')

    // stripeConnectAccountId must be written back to DynamoDB
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb')
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${USER_ID}`, SK: 'PROFILE#AUTHOR' },
    }))
    expect(Item?.stripeConnectAccountId).toBe('acct_test_new_connect')
  })

  it('reuses existing stripeConnectAccountId (idempotent)', async () => {
    await seedAuthorProfile(USER_ID, { stripeConnectAccountId: 'acct_already_exists' })

    const event = makeEvent('POST', '/subscriptions/connect/onboard', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.accountLinkUrl).toBe('https://connect.stripe.com/setup/e/test-link')
  })

  it('returns 404 when author profile does not exist', async () => {
    const event = makeEvent('POST', '/subscriptions/connect/onboard', { userId: 'no-such-user' })
    const result = await handler(event as never, makeCtx())
    expect(result.statusCode).toBe(404)
  })
})

// ── Connect status ────────────────────────────────────────────────────────────

describe('GET /subscriptions/connect/status', () => {
  it('returns chargesEnabled and detailsSubmitted from Stripe', async () => {
    await seedAuthorProfile(USER_ID, { stripeConnectAccountId: 'acct_test_connect_001' })

    const event = makeEvent('GET', '/subscriptions/connect/status', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.chargesEnabled).toBe(true)
    expect(body.detailsSubmitted).toBe(true)
    expect(body.stripeConnectAccountId).toBe('acct_test_connect_001')
  })

  it('returns 400 when author has no Connect account', async () => {
    await seedAuthorProfile(USER_ID, { stripeConnectAccountId: null })

    const event = makeEvent('GET', '/subscriptions/connect/status', { userId: USER_ID })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(400)
  })

  it('returns 404 when author profile does not exist', async () => {
    const event = makeEvent('GET', '/subscriptions/connect/status', { userId: 'no-such-user' })
    const result = await handler(event as never, makeCtx())
    expect(result.statusCode).toBe(404)
  })
})

// ── Set subscription price ────────────────────────────────────────────────────

describe('POST /users/me/author/subscription-price', () => {
  it('creates Stripe Price and stores priceId + monthlyUsd on AuthorProfile', async () => {
    await seedAuthorProfile(USER_ID, {
      stripeConnectAccountId: 'acct_test_connect_001',
      authorSubscriptionPriceId: null,
      authorSubscriptionMonthlyUsd: null,
    })

    const event = makeEvent('POST', '/users/me/author/subscription-price', {
      userId: USER_ID,
      body: { amountUsd: 10 },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.priceId).toBe('price_test_mock_001')
    expect(body.monthlyUsd).toBe(10)

    const { GetCommand } = await import('@aws-sdk/lib-dynamodb')
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${USER_ID}`, SK: 'PROFILE#AUTHOR' },
    }))
    expect(Item?.authorSubscriptionPriceId).toBe('price_test_mock_001')
    expect(Item?.authorSubscriptionMonthlyUsd).toBe(10)
  })

  it('disables subscriptions when amountUsd = 0', async () => {
    await seedAuthorProfile(USER_ID, {
      stripeConnectAccountId:      'acct_test_connect_001',
      authorSubscriptionPriceId:   'price_existing',
      authorSubscriptionMonthlyUsd: 5,
    })

    const event = makeEvent('POST', '/users/me/author/subscription-price', {
      userId: USER_ID,
      body:   { amountUsd: 0 },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.priceId).toBeNull()
    expect(body.monthlyUsd).toBeNull()
  })

  it('returns 400 when author has no connected Stripe account', async () => {
    await seedAuthorProfile(USER_ID, { stripeConnectAccountId: null })

    const event = makeEvent('POST', '/users/me/author/subscription-price', {
      userId: USER_ID,
      body:   { amountUsd: 5 },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.message).toMatch(/connect/)
  })

  it('returns 400 when Stripe Connect account is not charges_enabled', async () => {
    await seedAuthorProfile(USER_ID, { stripeConnectAccountId: 'acct_incomplete' })

    const event = makeEvent('POST', '/users/me/author/subscription-price', {
      userId: USER_ID,
      body:   { amountUsd: 5 },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.message).toMatch(/onboarding/)
  })

  it('returns 400 when amountUsd exceeds 50', async () => {
    await seedAuthorProfile(USER_ID, { stripeConnectAccountId: 'acct_test_connect_001' })

    const event = makeEvent('POST', '/users/me/author/subscription-price', {
      userId: USER_ID,
      body:   { amountUsd: 99 },
    })
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.message).toMatch(/50/)
  })

  it('returns 404 when author profile does not exist', async () => {
    const event = makeEvent('POST', '/users/me/author/subscription-price', {
      userId: 'no-such-user',
      body:   { amountUsd: 5 },
    })
    const result = await handler(event as never, makeCtx())
    expect(result.statusCode).toBe(404)
  })
})
