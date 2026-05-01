// =============================================================================
// packages/shared/src/__tests__/list-authors.unit.test.ts
// Unit tests for listAuthors() repository function — FR-DISC-04, §15.2
//
// Tests the application-layer logic only (in-memory sort, passthrough).
// DynamoDB client is mocked — no MiniStack required.
// =============================================================================

import { describe, it, expect, vi } from 'vitest'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { listAuthors } from '../db/users.repository.js'
import type { AuthorProfile } from '../types/index.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeAuthor = (id: string, subscriberCount: number, createdAt?: string): AuthorProfile => ({
  userId: id,
  profileType: 'AUTHOR',
  status: 'ACTIVE',
  displayName: `Author ${id}`,
  bio: 'A test bio.',
  profilePhotoS3Key: null,
  coverPhotoS3Key: null,
  stripeConnectAccountId: null,
  connectChargesEnabled: null,
  authorSubscriptionPriceId: null,
  authorSubscriptionMonthlyUsd: null,
  featuredPieceIds: [],
  createdAt: createdAt ?? '2025-01-01T00:00:00.000Z',
  totalPiecesCount: 0,
  followerCount: 0,
  subscriberCount,
})

const makeMockClient = (
  items: AuthorProfile[],
  lastKey?: Record<string, unknown>,
): DynamoDBDocumentClient =>
  ({ send: vi.fn().mockResolvedValue({ Items: items, LastEvaluatedKey: lastKey }) }) as unknown as DynamoDBDocumentClient

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('listAuthors() — in-memory sort', () => {

  it('sort=subscriberCount returns items in descending subscriberCount order', async () => {
    const authors = [
      makeAuthor('a', 10),
      makeAuthor('b', 50),
      makeAuthor('c', 5),
      makeAuthor('d', 30),
    ]
    const client = makeMockClient(authors)

    const result = await listAuthors(client, { sort: 'subscriberCount', limit: 10 })

    const counts = result.items.map((a) => a.subscriberCount)
    expect(counts).toEqual([50, 30, 10, 5])
  })

  it('sort=subscriberCount treats null/missing subscriberCount as 0', async () => {
    const withNull = makeAuthor('x', 0)
    // @ts-expect-error — simulating a legacy item with no subscriberCount field
    delete withNull.subscriberCount

    const authors = [withNull, makeAuthor('y', 20), makeAuthor('z', 5)]
    const client = makeMockClient(authors)

    const result = await listAuthors(client, { sort: 'subscriberCount', limit: 10 })

    const ids = result.items.map((a) => a.userId)
    expect(ids).toEqual(['y', 'z', 'x'])
  })

  it('sort=newest does NOT reorder items (preserves DynamoDB createdAt-DESC order)', async () => {
    const authors = [
      makeAuthor('newest', 5,  '2025-03-01T00:00:00.000Z'),
      makeAuthor('middle', 99, '2025-02-01T00:00:00.000Z'),
      makeAuthor('oldest', 50, '2025-01-01T00:00:00.000Z'),
    ]
    const client = makeMockClient(authors)

    const result = await listAuthors(client, { sort: 'newest', limit: 10 })

    const ids = result.items.map((a) => a.userId)
    expect(ids).toEqual(['newest', 'middle', 'oldest'])
  })

  it('returns lastKey from DynamoDB response as-is', async () => {
    const cursor = { PK: 'USER#a', SK: 'PROFILE#AUTHOR', profileType: 'AUTHOR', createdAt: '2025-01-01T00:00:00.000Z' }
    const client = makeMockClient([makeAuthor('a', 10)], cursor)

    const result = await listAuthors(client, { sort: 'newest', limit: 1 })

    expect(result.lastKey).toEqual(cursor)
  })

  it('returns lastKey=undefined when DynamoDB returns no LastEvaluatedKey', async () => {
    const client = makeMockClient([makeAuthor('a', 10)])

    const result = await listAuthors(client, { sort: 'newest', limit: 10 })

    expect(result.lastKey).toBeUndefined()
  })

  it('returns empty items array when DynamoDB returns no Items', async () => {
    const client: DynamoDBDocumentClient = {
      send: vi.fn().mockResolvedValue({ Items: undefined }),
    } as unknown as DynamoDBDocumentClient

    const result = await listAuthors(client, { sort: 'newest', limit: 10 })

    expect(result.items).toEqual([])
    expect(result.lastKey).toBeUndefined()
  })
})
