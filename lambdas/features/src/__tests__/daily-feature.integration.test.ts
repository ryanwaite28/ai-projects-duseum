// =============================================================================
// lambdas/features/src/__tests__/daily-feature.integration.test.ts
// Integration tests for GET /features/daily — Section 15.3
// =============================================================================

import { describe, expect, it } from 'vitest'
import { handler } from '../index.js'
import {
  docClient,
  makeCtx,
  makeEvent,
  seedAuthorProfile,
  seedConfig,
  seedPublicPiece,
} from './setup.js'

describe('GET /features/daily', () => {
  it('returns 200 with author profile and spotlight pieces when config entry exists', async () => {
    const authorId = 'author-daily-001'
    const pieceId1 = 'piece-daily-001'
    const pieceId2 = 'piece-daily-002'
    const now = new Date().toISOString()

    await seedAuthorProfile(authorId, { displayName: 'Daily Artist', bio: 'Great artist.' })
    await seedPublicPiece(authorId, pieceId1, now)
    await seedPublicPiece(authorId, pieceId2, new Date(Date.now() - 1000).toISOString())

    await seedConfig({
      PK: 'DAILY_FEATURED_AUTHOR',
      authorId,
      selectedAt:      now,
      selectionMethod: 'RANDOM',
    })

    const event = makeEvent('GET', '/features/daily')
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body!)
    expect(body.author.authorId).toBe(authorId)
    expect(body.author.displayName).toBe('Daily Artist')
    expect(body.selectionMethod).toBe('RANDOM')
    expect(body.spotlightPieces).toHaveLength(2)
    expect(body.spotlightPieces[0].thumbnailUrl).toMatch(/^https:\/\/media\.test\.duseum\.com\//)
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns 404 when DAILY_FEATURED_AUTHOR config entry is missing', async () => {
    // No config seeded
    const event = makeEvent('GET', '/features/daily')
    const result = await handler(event as never, makeCtx())

    expect(result.statusCode).toBe(404)
    const body = JSON.parse(result.body!)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
