// =============================================================================
// lambdas/admin/src/__tests__/admin-features.integration.test.ts
// Integration tests for admin feature routes.
// Section 15.3 — real DynamoDB via MiniStack; Stripe calls mocked at module level.
// =============================================================================

import { describe, it, expect, vi } from 'vitest'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

// Mock Stripe at the module level — issueRefund must not call the real API.
// vi.mock is hoisted by Vitest so the static handler import below gets the mock.
vi.mock('@duseum/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duseum/shared')>()
  return {
    ...actual,
    issueRefund: vi.fn().mockResolvedValue({ refundId: 're_test_mock_001' }),
  }
})

import { handler } from '../index.js'
import { getCurrentIsoWeek, addWeeks } from '@duseum/shared'
import {
  CONFIG_TABLE,
  TABLE,
  docClient,
  makeAdminJwt,
  makeApiEvent,
  makeCtx,
  makeUserJwt,
  seedActiveAuthor,
  seedBooking,
  seedConfig,
} from './setup.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const getBookingFromTable = (isoWeek: string, authorId: string) =>
  docClient.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `FEATURE#WEEK#${isoWeek}`, SK: `AUTHOR#${authorId}` },
  })).then((r) => r.Item ?? null)

const getDailyFeaturedConfig = () =>
  docClient.send(new GetCommand({ TableName: CONFIG_TABLE, Key: { PK: 'DAILY_FEATURED_AUTHOR' } }))
    .then((r) => r.Item ?? null)

const getDailyLog = (date: string) =>
  docClient.send(new GetCommand({ TableName: TABLE, Key: { PK: 'FEATURE#DAILY', SK: `DATE#${date}` } }))
    .then((r) => r.Item ?? null)

const ctx = makeCtx()

const invoke = (event: Parameters<typeof handler>[0]) =>
  handler(event as never, ctx)

// ── Non-admin 403 ─────────────────────────────────────────────────────────────

describe('admin group enforcement', () => {
  it('returns 403 for PUT /admin/features/daily/override when caller lacks ADMIN group', async () => {
    const event = makeApiEvent('PUT', '/admin/features/daily/override', {
      body: { authorId: 'some-author' },
      jwt:  makeUserJwt(),
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(403)
  })

  it('returns 403 for DELETE /admin/features/weekly/bookings/x when caller lacks ADMIN group', async () => {
    const event = makeApiEvent('DELETE', '/admin/features/weekly/bookings/booking-x', {
      body: { reason: 'Policy violation' },
      jwt:  makeUserJwt(),
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(403)
  })

  it('returns 403 for GET /admin/features/weekly when caller lacks ADMIN group', async () => {
    const event = makeApiEvent('GET', '/admin/features/weekly', { jwt: makeUserJwt() })
    const res = await invoke(event)
    expect(res.statusCode).toBe(403)
  })
})

// ── PUT /admin/features/daily/override ───────────────────────────────────────

describe('PUT /admin/features/daily/override', () => {
  it('writes DAILY_FEATURED_AUTHOR with ADMIN_OVERRIDE and returns previousAuthorId', async () => {
    await seedActiveAuthor('override-author-01')
    await seedConfig({ PK: 'DAILY_FEATURED_AUTHOR', authorId: 'old-author', selectedAt: '2025-01-01T00:00:00.000Z', selectionMethod: 'RANDOM' })

    const event = makeApiEvent('PUT', '/admin/features/daily/override', {
      body: { authorId: 'override-author-01' },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.authorId).toBe('override-author-01')
    expect(body.overriddenBy).toBe('admin-user-001')
    expect(body.previousAuthorId).toBe('old-author')
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const config = await getDailyFeaturedConfig()
    expect(config!.authorId).toBe('override-author-01')
    expect(config!.selectionMethod).toBe('ADMIN_OVERRIDE')
    expect(config!.overriddenBy).toBe('admin-user-001')
  })

  it('writes a DailyFeatureLog entry', async () => {
    await seedActiveAuthor('override-author-02')

    const event = makeApiEvent('PUT', '/admin/features/daily/override', {
      body: { authorId: 'override-author-02' },
    })
    await invoke(event)

    const todayIso = new Date().toISOString().split('T')[0]
    const log = await getDailyLog(todayIso)
    expect(log).not.toBeNull()
    expect(log!.authorId).toBe('override-author-02')
    expect(log!.selectionMethod).toBe('ADMIN_OVERRIDE')
  })

  it('returns null previousAuthorId when no daily author is currently set', async () => {
    await seedActiveAuthor('override-author-03')
    const event = makeApiEvent('PUT', '/admin/features/daily/override', {
      body: { authorId: 'override-author-03' },
    })
    const res = await invoke(event)
    const body = JSON.parse(res.body ?? '{}')
    expect(body.previousAuthorId).toBeNull()
  })

  it('returns 404 when authorId does not exist', async () => {
    const event = makeApiEvent('PUT', '/admin/features/daily/override', {
      body: { authorId: 'nonexistent-author' },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 when authorId is missing from body', async () => {
    const event = makeApiEvent('PUT', '/admin/features/daily/override', { body: {} })
    const res = await invoke(event)
    expect(res.statusCode).toBe(400)
  })
})

// ── DELETE /admin/features/weekly/bookings/{bookingId} ────────────────────────

describe('DELETE /admin/features/weekly/bookings/{bookingId}', () => {
  it('cancels a CONFIRMED booking, sets cancelledBy + cancellationReason, returns refundId', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedBooking('cancel-author-01', currentWeek, 'CONFIRMED', 'booking-cancel-01', '2025-01-06', '2025-01-12')

    const event = makeApiEvent('DELETE', '/admin/features/weekly/bookings/booking-cancel-01', {
      body: { reason: 'Policy violation — test.' },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.bookingId).toBe('booking-cancel-01')
    expect(body.featureStatus).toBe('CANCELLED')
    expect(body.refundId).toBe('re_test_mock_001')
    expect(body.cancelledAt).toBeDefined()

    const record = await getBookingFromTable(currentWeek, 'cancel-author-01')
    expect(record!.featureStatus).toBe('CANCELLED')
    expect(record!.cancelledBy).toBe('admin-user-001')
    expect(record!.cancellationReason).toBe('Policy violation — test.')
  })

  it('cancels an ACTIVE booking', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedBooking('cancel-author-02', currentWeek, 'ACTIVE', 'booking-cancel-02', '2025-01-06', '2025-01-12')

    const event = makeApiEvent('DELETE', '/admin/features/weekly/bookings/booking-cancel-02', {
      body: { reason: 'Content removed.' },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(200)

    const record = await getBookingFromTable(currentWeek, 'cancel-author-02')
    expect(record!.featureStatus).toBe('CANCELLED')
  })

  it('returns 409 when booking is already CANCELLED', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedBooking('cancel-author-03', currentWeek, 'CANCELLED', 'booking-cancel-03', '2025-01-06', '2025-01-12')

    const event = makeApiEvent('DELETE', '/admin/features/weekly/bookings/booking-cancel-03', {
      body: { reason: 'Duplicate cancellation' },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(409)
  })

  it('returns 409 when booking is ARCHIVED', async () => {
    const prevWeek = addWeeks(getCurrentIsoWeek(), -1)
    await seedBooking('cancel-author-04', prevWeek, 'ARCHIVED', 'booking-cancel-04', '2024-12-30', '2025-01-05')

    const event = makeApiEvent('DELETE', '/admin/features/weekly/bookings/booking-cancel-04', {
      body: { reason: 'Late cancellation attempt' },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(409)
  })

  it('returns 404 for unknown bookingId', async () => {
    const event = makeApiEvent('DELETE', '/admin/features/weekly/bookings/no-such-booking', {
      body: { reason: 'Whatever' },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 when reason is missing', async () => {
    const event = makeApiEvent('DELETE', '/admin/features/weekly/bookings/booking-x', { body: {} })
    const res = await invoke(event)
    expect(res.statusCode).toBe(400)
  })
})

// ── GET /admin/features/weekly ────────────────────────────────────────────────

describe('GET /admin/features/weekly', () => {
  it('returns bookings for the current week when no filters provided', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedBooking('list-author-01', currentWeek, 'CONFIRMED', 'booking-list-01', '2025-01-06', '2025-01-12')
    await seedBooking('list-author-02', currentWeek, 'CONFIRMED', 'booking-list-02', '2025-01-06', '2025-01-12')

    const event = makeApiEvent('GET', '/admin/features/weekly')
    const res   = await invoke(event)
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body ?? '{}')
    expect(body.bookings.length).toBe(2)
    expect(body.nextCursor).toBeNull()
  })

  it('filters by status across all weeks', async () => {
    const currentWeek  = getCurrentIsoWeek()
    const previousWeek = addWeeks(currentWeek, -1)
    await seedBooking('list-author-03', currentWeek,  'CONFIRMED', 'booking-list-03', '2025-01-06', '2025-01-12')
    await seedBooking('list-author-04', previousWeek, 'ARCHIVED',  'booking-list-04', '2024-12-30', '2025-01-05')

    const event = makeApiEvent('GET', '/admin/features/weekly', {
      queryStringParameters: { status: 'ARCHIVED' },
    })
    const res  = await invoke(event)
    const body = JSON.parse(res.body ?? '{}')

    expect(body.bookings.every((b: { featureStatus: string }) => b.featureStatus === 'ARCHIVED')).toBe(true)
    expect(body.bookings.some((b: { bookingId: string }) => b.bookingId === 'booking-list-04')).toBe(true)
    expect(body.bookings.every((b: { bookingId: string }) => b.bookingId !== 'booking-list-03')).toBe(true)
  })

  it('filters by week + status', async () => {
    const currentWeek  = getCurrentIsoWeek()
    const previousWeek = addWeeks(currentWeek, -1)
    await seedBooking('list-author-05', currentWeek,  'CONFIRMED', 'booking-list-05', '2025-01-06', '2025-01-12')
    await seedBooking('list-author-06', previousWeek, 'CONFIRMED', 'booking-list-06', '2024-12-30', '2025-01-05')

    const event = makeApiEvent('GET', '/admin/features/weekly', {
      queryStringParameters: { status: 'CONFIRMED', week: currentWeek },
    })
    const res  = await invoke(event)
    const body = JSON.parse(res.body ?? '{}')

    expect(body.bookings.length).toBe(1)
    expect(body.bookings[0].bookingId).toBe('booking-list-05')
  })

  it('returns 400 for an invalid status value', async () => {
    const event = makeApiEvent('GET', '/admin/features/weekly', {
      queryStringParameters: { status: 'INVALID_STATUS' },
    })
    const res = await invoke(event)
    expect(res.statusCode).toBe(400)
  })

  it('returns empty bookings array when no matches', async () => {
    const event = makeApiEvent('GET', '/admin/features/weekly', {
      queryStringParameters: { status: 'ACTIVE' },
    })
    const res  = await invoke(event)
    const body = JSON.parse(res.body ?? '{}')
    expect(body.bookings).toEqual([])
    expect(body.nextCursor).toBeNull()
  })
})
