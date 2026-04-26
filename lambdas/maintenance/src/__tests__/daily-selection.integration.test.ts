// =============================================================================
// lambdas/maintenance/src/__tests__/daily-selection.integration.test.ts
// Integration tests for the daily featured-author selection task.
// Section 15.3 — real DynamoDB via MiniStack, no AWS service mocks.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import {
  CONFIG_TABLE,
  TABLE,
  docClient,
  makeEventBridgeEvent,
  seedActiveAuthor,
  seedConfig,
  seedPublicPiece,
} from './setup.js'
import { handler } from '../index.js'

const DAILY_RULE = 'duseum-test-daily-featured-author'

const getDailyFeaturedAuthor = () =>
  docClient.send(new GetCommand({ TableName: CONFIG_TABLE, Key: { PK: 'DAILY_FEATURED_AUTHOR' } }))
    .then((r) => r.Item ?? null)

const getExclusions = () =>
  docClient.send(new GetCommand({ TableName: CONFIG_TABLE, Key: { PK: 'DAILY_FEATURED_EXCLUSIONS' } }))
    .then((r) => (r.Item?.authorIds as string[]) ?? [])

const getDailyLog = (date: string) =>
  docClient.send(new GetCommand({ TableName: TABLE, Key: { PK: 'FEATURE#DAILY', SK: `DATE#${date}` } }))
    .then((r) => r.Item ?? null)

describe('daily-selection task', () => {
  it('selects an ACTIVE Author with a PUBLIC piece', async () => {
    await seedActiveAuthor('author-001')
    await seedPublicPiece('author-001', 'artwork-001', '2025-06-01T00:00:00.000Z')

    await handler(makeEventBridgeEvent(DAILY_RULE) as any)

    const featured = await getDailyFeaturedAuthor()
    expect(featured).not.toBeNull()
    expect(featured!.authorId).toBe('author-001')
    expect(featured!.selectionMethod).toBe('RANDOM')
    expect(featured!.selectedAt).toBeDefined()
  })

  it('writes a DailyFeatureLog entry to the main table', async () => {
    await seedActiveAuthor('author-002')
    await seedPublicPiece('author-002', 'artwork-002', '2025-06-01T00:00:00.000Z')

    await handler(makeEventBridgeEvent(DAILY_RULE) as any)

    const todayIso = new Date().toISOString().split('T')[0]
    const log = await getDailyLog(todayIso)
    expect(log).not.toBeNull()
    expect(log!.authorId).toBe('author-002')
    expect(log!.selectionMethod).toBe('RANDOM')
  })

  it('updates the exclusions list with the newly selected author prepended', async () => {
    await seedActiveAuthor('author-003')
    await seedPublicPiece('author-003', 'artwork-003', '2025-06-01T00:00:00.000Z')

    await handler(makeEventBridgeEvent(DAILY_RULE) as any)

    const exclusions = await getExclusions()
    expect(exclusions[0]).toBe('author-003')
    expect(exclusions.length).toBe(1)
  })

  it('never selects an Author in the exclusion list', async () => {
    // author-excluded is in exclusions; author-eligible is not
    await seedConfig({ PK: 'DAILY_FEATURED_EXCLUSIONS', authorIds: ['author-excluded'] })
    await seedActiveAuthor('author-excluded')
    await seedPublicPiece('author-excluded', 'artwork-excl', '2025-06-01T00:00:00.000Z')
    await seedActiveAuthor('author-eligible')
    await seedPublicPiece('author-eligible', 'artwork-elig', '2025-06-01T00:00:00.000Z')

    await handler(makeEventBridgeEvent(DAILY_RULE) as any)

    const featured = await getDailyFeaturedAuthor()
    expect(featured!.authorId).toBe('author-eligible')
  })

  it('does not select an Author with no PUBLIC pieces', async () => {
    await seedActiveAuthor('author-no-pieces')
    // No artwork seeded

    await seedActiveAuthor('author-with-piece')
    await seedPublicPiece('author-with-piece', 'artwork-wp', '2025-06-01T00:00:00.000Z')

    await handler(makeEventBridgeEvent(DAILY_RULE) as any)

    const featured = await getDailyFeaturedAuthor()
    expect(featured!.authorId).toBe('author-with-piece')
  })

  it('caps the exclusion list at 7 entries (FIFO)', async () => {
    const existing = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']
    await seedConfig({ PK: 'DAILY_FEATURED_EXCLUSIONS', authorIds: existing })

    await seedActiveAuthor('author-new')
    await seedPublicPiece('author-new', 'artwork-new', '2025-06-01T00:00:00.000Z')

    await handler(makeEventBridgeEvent(DAILY_RULE) as any)

    const exclusions = await getExclusions()
    expect(exclusions.length).toBe(7)
    expect(exclusions[0]).toBe('author-new')
    expect(exclusions).toContain('e1')
    expect(exclusions).not.toContain('e7')
  })

  it('skips writing when no eligible candidates exist', async () => {
    // Seed author in exclusion list with a piece — no eligible candidates
    await seedConfig({ PK: 'DAILY_FEATURED_EXCLUSIONS', authorIds: ['author-only'] })
    await seedActiveAuthor('author-only')
    await seedPublicPiece('author-only', 'artwork-only', '2025-06-01T00:00:00.000Z')

    await handler(makeEventBridgeEvent(DAILY_RULE) as any)

    const featured = await getDailyFeaturedAuthor()
    expect(featured).toBeNull()
  })
})
