// =============================================================================
// lambdas/artworks/src/__tests__/publish-piece.integration.test.ts
// Integration tests for POST /artworks — Section 15.3
//
// Prerequisites: MiniStack running at localhost:4566
// =============================================================================

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import { describe, expect, it } from 'vitest'
import { handler } from '../index.js'
import {
  BUCKET,
  TABLE,
  docClient,
  makeCtx,
  makeEvent,
  queueUrl,
  s3,
  seedItem,
  sqs,
} from './setup.js'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

// ── Seed helpers ──────────────────────────────────────────────────────────────

const AUTHOR_ID  = 'author-post-test-001'
const VIEWER_ID  = 'viewer-post-test-001'
const OTHER_AUTHOR_ID = 'author-post-other-001'

const seedAuthorProfile = (userId = AUTHOR_ID) =>
  seedItem({
    PK: `USER#${userId}`,
    SK: 'PROFILE#AUTHOR',
    userId,
    profileType:  'AUTHOR',
    status:       'ACTIVE',
    displayName:  'Test Author',
    bio:          '',
    profilePhotoS3Key:             null,
    coverPhotoS3Key:               null,
    stripeConnectAccountId:        null,
    authorSubscriptionPriceId:     null,
    authorSubscriptionMonthlyUsd:  null,
    featuredPieceIds:              [],
    createdAt:                     new Date().toISOString(),
    totalPiecesCount:              0,
    followerCount:                 0,
  })

const seedViewerProfile = (userId = VIEWER_ID) =>
  seedItem({
    PK: `USER#${userId}`,
    SK: 'PROFILE#VIEWER',
    userId,
    profileType:              'VIEWER',
    status:                   'ACTIVE',
    displayName:              'Test Viewer',
    createdAt:                new Date().toISOString(),
    notificationGlobalOptOut: false,
    defaultNotificationPref:  'ALL_NEW_PIECES',
  })

const seedUploadIntent = (intentId: string, uploaderId = AUTHOR_ID) =>
  seedItem({
    PK: `UPLOAD#${intentId}`,
    SK: 'METADATA',
    intentId,
    uploaderId,
    s3Key:            intentId,
    mimeType:         'image/jpeg',
    declaredSizeBytes: 1_024_000,
    status:           'PENDING',
    expiresAt:        new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    createdAt:        new Date().toISOString(),
  })

const seedS3Object = (key: string) =>
  s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from('fake-image') }))

const validBody = (s3Key: string, visibility: 'PUBLIC' | 'PRIVATE' | 'DRAFT' = 'PUBLIC') => ({
  s3Key,
  title:       'My New Artwork',
  description: 'A beautiful piece',
  category:    'PAINTING',
  tags:        ['abstract', 'oil'],
  visibility,
  commentsEnabled: true,
})

const drainQueue = async () => {
  const res = await sqs.send(new ReceiveMessageCommand({
    QueueUrl:            queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds:     1,
  }))
  return res.Messages ?? []
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /artworks', () => {

  it('returns 403 when caller has only a Viewer profile (not Author)', async () => {
    await seedViewerProfile()
    const event = makeEvent('POST', '/artworks', {
      userId: VIEWER_ID,
      body:   validBody('any-key'),
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(403)
  })

  it('returns 403 when the upload intent belongs to a different user', async () => {
    await seedAuthorProfile()
    await seedAuthorProfile(OTHER_AUTHOR_ID)
    const intentId = 'intent-other-001'
    // Intent was created by OTHER_AUTHOR_ID
    await seedUploadIntent(intentId, OTHER_AUTHOR_ID)
    await seedS3Object(intentId)
    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,                // AUTHOR_ID tries to claim another's intent
      body:   validBody(intentId),
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 when s3Key does not exist in DynamoDB (no UploadIntent)', async () => {
    await seedAuthorProfile()
    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody('nonexistent-key'),
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when S3 object does not exist (intent present, upload not done)', async () => {
    await seedAuthorProfile()
    const intentId = 'intent-no-s3-001'
    await seedUploadIntent(intentId)
    // Do NOT upload to S3
    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody(intentId),
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body!)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when the UploadIntent is already CONSUMED', async () => {
    await seedAuthorProfile()
    const intentId = 'intent-consumed-001'
    await seedItem({
      PK: `UPLOAD#${intentId}`,
      SK: 'METADATA',
      intentId,
      uploaderId:       AUTHOR_ID,
      s3Key:            intentId,
      mimeType:         'image/jpeg',
      declaredSizeBytes: 1_024_000,
      status:           'CONSUMED',
      expiresAt:        new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt:        new Date().toISOString(),
    })
    await seedS3Object(intentId)
    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody(intentId),
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(400)
  })

  it('returns 201 and creates ArtPiece with status=PUBLIC for PUBLIC visibility', async () => {
    await seedAuthorProfile()
    const intentId = 'intent-public-001'
    await seedUploadIntent(intentId)
    await seedS3Object(intentId)

    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody(intentId, 'PUBLIC'),
    })
    const res  = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(201)

    const body = JSON.parse(res.body!)
    expect(body.artworkId).toBeDefined()
    expect(body.imageUrl).toContain('media.test.duseum.com')

    // Verify DynamoDB record
    const item = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `ARTWORK#${body.artworkId}`, SK: 'METADATA' },
    }))
    expect(item.Item).toBeDefined()
    expect(item.Item!['status']).toBe('PUBLIC')
    expect(item.Item!['visibility']).toBe('PUBLIC')
    expect(item.Item!['publishedAt']).toBeDefined()
    expect(item.Item!['authorId']).toBe(AUTHOR_ID)
    // Tags normalized to lowercase
    expect(item.Item!['tags']).toEqual(['abstract', 'oil'])
  })

  it('enqueues NEW_PIECE_PUBLISHED SQS message for PUBLIC piece', async () => {
    await seedAuthorProfile()
    const intentId = 'intent-sqs-public-001'
    await seedUploadIntent(intentId)
    await seedS3Object(intentId)

    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody(intentId, 'PUBLIC'),
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(201)

    // Give the fire-and-forget SQS send a brief moment to complete
    await new Promise((r) => setTimeout(r, 200))

    const messages = await drainQueue()
    expect(messages.length).toBeGreaterThanOrEqual(1)

    const payload = JSON.parse(messages[0]!.Body!)
    const artworkId = JSON.parse(res.body!).artworkId

    expect(payload.eventType).toBe('NEW_PIECE_PUBLISHED')
    expect(payload.artworkId).toBe(artworkId)
    expect(payload.authorId).toBe(AUTHOR_ID)
    expect(payload.visibility).toBe('PUBLIC')
    expect(payload.title).toBe('My New Artwork')
    expect(payload.thumbnailS3Key).toBe(intentId)
    expect(payload.publishedAt).toBeDefined()
  })

  it('enqueues NEW_PIECE_PUBLISHED SQS message for PRIVATE piece', async () => {
    await seedAuthorProfile()
    const intentId = 'intent-sqs-private-001'
    await seedUploadIntent(intentId)
    await seedS3Object(intentId)

    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody(intentId, 'PRIVATE'),
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(201)

    await new Promise((r) => setTimeout(r, 200))

    const messages = await drainQueue()
    expect(messages.length).toBeGreaterThanOrEqual(1)
    const payload = JSON.parse(messages[0]!.Body!)
    expect(payload.visibility).toBe('PRIVATE')
  })

  it('does NOT enqueue SQS message for DRAFT piece', async () => {
    await seedAuthorProfile()
    const intentId = 'intent-draft-001'
    await seedUploadIntent(intentId)
    await seedS3Object(intentId)

    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody(intentId, 'DRAFT'),
    })
    const res = await handler(event as never, makeCtx())
    expect(res.statusCode).toBe(201)

    // Verify no SQS message
    await new Promise((r) => setTimeout(r, 200))
    const messages = await drainQueue()
    expect(messages.length).toBe(0)

    // Verify ArtPiece status=DRAFT, publishedAt=null
    const body = JSON.parse(res.body!)
    const item = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `ARTWORK#${body.artworkId}`, SK: 'METADATA' },
    }))
    expect(item.Item!['status']).toBe('DRAFT')
    expect(item.Item!['publishedAt']).toBeNull()
  })

  it('marks the UploadIntent as CONSUMED after successful creation', async () => {
    await seedAuthorProfile()
    const intentId = 'intent-consume-check-001'
    await seedUploadIntent(intentId)
    await seedS3Object(intentId)

    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody(intentId, 'PUBLIC'),
    })
    await handler(event as never, makeCtx())

    const intentItem = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `UPLOAD#${intentId}`, SK: 'METADATA' },
    }))
    expect(intentItem.Item!['status']).toBe('CONSUMED')
  })

  it('HTTP 201 response is returned synchronously before SQS processing completes', async () => {
    await seedAuthorProfile()
    const intentId = 'intent-sync-001'
    await seedUploadIntent(intentId)
    await seedS3Object(intentId)

    const start = Date.now()
    const event = makeEvent('POST', '/artworks', {
      userId: AUTHOR_ID,
      body:   validBody(intentId, 'PUBLIC'),
    })
    const res = await handler(event as never, makeCtx())
    const elapsed = Date.now() - start

    // Response must arrive quickly — the SQS fire-and-forget must not block
    expect(res.statusCode).toBe(201)
    // Sanity: should complete in well under 5 seconds even with MiniStack
    expect(elapsed).toBeLessThan(5000)
  })
})
