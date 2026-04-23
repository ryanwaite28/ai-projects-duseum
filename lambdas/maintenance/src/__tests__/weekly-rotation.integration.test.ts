// =============================================================================
// lambdas/maintenance/src/__tests__/weekly-rotation.integration.test.ts
// Integration tests for the Monday weekly feature-rotation task.
// Section 15.3 — real DynamoDB via MiniStack, no AWS service mocks.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import {
  TABLE,
  docClient,
  makeEventBridgeEvent,
  seedBooking,
} from './setup.js'
import { handler } from '../index.js'
import { getCurrentIsoWeek, addWeeks } from '@duseum/shared'

const WEEKLY_RULE = 'duseum-test-weekly-feature-rotation'

const getBooking = (isoWeek: string, authorId: string) =>
  docClient.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `FEATURE#WEEK#${isoWeek}`, SK: `AUTHOR#${authorId}` },
  })).then((r) => r.Item ?? null)

describe('weekly-rotation task', () => {
  it('promotes CONFIRMED bookings for the current week to ACTIVE', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedBooking('author-a', currentWeek, 'CONFIRMED', 'booking-a', '2025-01-06', '2025-01-12')

    await handler(makeEventBridgeEvent(WEEKLY_RULE) as any)

    const booking = await getBooking(currentWeek, 'author-a')
    expect(booking).not.toBeNull()
    expect(booking!.featureStatus).toBe('ACTIVE')
    expect(booking!.activatedAt).toBeDefined()
  })

  it('archives ACTIVE bookings from the previous week', async () => {
    const previousWeek = addWeeks(getCurrentIsoWeek(), -1)
    await seedBooking('author-b', previousWeek, 'ACTIVE', 'booking-b', '2024-12-30', '2025-01-05')

    await handler(makeEventBridgeEvent(WEEKLY_RULE) as any)

    const booking = await getBooking(previousWeek, 'author-b')
    expect(booking).not.toBeNull()
    expect(booking!.featureStatus).toBe('ARCHIVED')
  })

  it('handles both activation and archival in the same run', async () => {
    const currentWeek  = getCurrentIsoWeek()
    const previousWeek = addWeeks(currentWeek, -1)

    await seedBooking('author-c', currentWeek,  'CONFIRMED', 'booking-c', '2025-01-06', '2025-01-12')
    await seedBooking('author-d', previousWeek, 'ACTIVE',    'booking-d', '2024-12-30', '2025-01-05')

    await handler(makeEventBridgeEvent(WEEKLY_RULE) as any)

    const activated = await getBooking(currentWeek, 'author-c')
    const archived  = await getBooking(previousWeek, 'author-d')

    expect(activated!.featureStatus).toBe('ACTIVE')
    expect(archived!.featureStatus).toBe('ARCHIVED')
  })

  it('does not promote CANCELLED bookings for the current week', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedBooking('author-e', currentWeek, 'CANCELLED', 'booking-e', '2025-01-06', '2025-01-12')

    await handler(makeEventBridgeEvent(WEEKLY_RULE) as any)

    const booking = await getBooking(currentWeek, 'author-e')
    expect(booking!.featureStatus).toBe('CANCELLED')
  })

  it('does not affect bookings from weeks other than current and previous', async () => {
    const twoWeeksAgo = addWeeks(getCurrentIsoWeek(), -2)
    await seedBooking('author-f', twoWeeksAgo, 'ACTIVE', 'booking-f', '2024-12-23', '2024-12-29')

    await handler(makeEventBridgeEvent(WEEKLY_RULE) as any)

    const booking = await getBooking(twoWeeksAgo, 'author-f')
    expect(booking!.featureStatus).toBe('ACTIVE')
  })

  it('activates multiple CONFIRMED bookings for the current week', async () => {
    const currentWeek = getCurrentIsoWeek()
    await seedBooking('author-g1', currentWeek, 'CONFIRMED', 'booking-g1', '2025-01-06', '2025-01-12')
    await seedBooking('author-g2', currentWeek, 'CONFIRMED', 'booking-g2', '2025-01-06', '2025-01-12')
    await seedBooking('author-g3', currentWeek, 'CONFIRMED', 'booking-g3', '2025-01-06', '2025-01-12')

    await handler(makeEventBridgeEvent(WEEKLY_RULE) as any)

    const b1 = await getBooking(currentWeek, 'author-g1')
    const b2 = await getBooking(currentWeek, 'author-g2')
    const b3 = await getBooking(currentWeek, 'author-g3')

    expect(b1!.featureStatus).toBe('ACTIVE')
    expect(b2!.featureStatus).toBe('ACTIVE')
    expect(b3!.featureStatus).toBe('ACTIVE')
  })

  it('is a no-op when there are no bookings to process', async () => {
    // No seed — should complete without error
    await expect(
      handler(makeEventBridgeEvent(WEEKLY_RULE) as any)
    ).resolves.toBeUndefined()
  })
})
