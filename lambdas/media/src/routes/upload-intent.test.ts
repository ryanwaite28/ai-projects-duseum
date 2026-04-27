// =============================================================================
// lambdas/media/src/routes/upload-intent.test.ts
// Integration tests for POST /media/upload-intent — Section 4.3
//
// Prerequisites: MiniStack running at localhost:4566
//   docker-compose up -d   (starts nahuelnucera/ministack)
//
// These tests hit real DynamoDB and S3 endpoints via MiniStack — no mocks.
// ENVIRONMENT=local activates the cognitoAuthMiddleware JWT stub so we can
// pass hand-crafted tokens without Cognito.
// =============================================================================

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb'
import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  DeleteBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { handler } from './upload-intent.js'

// ── MiniStack config ──────────────────────────────────────────────────────────

const ENDPOINT = 'http://localhost:4566'
const REGION   = 'us-east-1'
const TABLE    = process.env['DYNAMODB_TABLE_NAME'] ?? 'duseum-test-media'
const BUCKET   = process.env['S3_MEDIA_BUCKET_NAME'] ?? 'duseum-test-media-uploads'

const dynamo = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})
const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
})
const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})

// ── JWT stub helpers (ENVIRONMENT=local) ──────────────────────────────────────

const makeToken = (sub: string): string => {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const p = Buffer.from(JSON.stringify({ sub })).toString('base64url')
  return `${h}.${p}.fakesig`
}

// ── Event factory ─────────────────────────────────────────────────────────────

const makeEvent = (
  userId: string,
  body: unknown
): APIGatewayProxyEventV2 =>
  ({
    headers: { authorization: `Bearer ${makeToken(userId)}` },
    body: JSON.stringify(body),
    requestContext: {
      http: { method: 'POST', path: '/media/upload-intent' },
      requestId: 'test-request-id',
    },
  }) as unknown as APIGatewayProxyEventV2

const makeCtx = () =>
  ({
    awsRequestId: 'test-aws-req',
    functionName: 'media-lambda',
    getRemainingTimeInMillis: () => 30_000,
  }) as never

// ── Test user IDs ─────────────────────────────────────────────────────────────

const AUTHOR_USER_ID  = 'author-user-001'
const VIEWER_USER_ID  = 'viewer-user-001'
const PENDING_AUTHOR_USER_ID = 'author-pending-001'

// ── DynamoDB key helpers ──────────────────────────────────────────────────────

const putItem = (item: Record<string, unknown>) =>
  docClient.send(new PutCommand({ TableName: TABLE, Item: item }))

// ── Suite setup/teardown ──────────────────────────────────────────────────────

beforeAll(async () => {
  // Create DynamoDB test table — table name comes from vitest.config.ts env
  try {
    await dynamo.send(new CreateTableCommand({
      TableName: TABLE,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }

  // Create S3 test bucket — handle already-exists from previous run
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
  } catch (err) {
    if (!(err instanceof BucketAlreadyOwnedByYou)) throw err
  }

  // Seed test profiles
  await putItem({
    PK: `USER#${AUTHOR_USER_ID}`,
    SK: 'PROFILE#AUTHOR',
    userId: AUTHOR_USER_ID,
    profileType: 'AUTHOR',
    status: 'ACTIVE',
    displayName: 'Test Author',
    bio: '',
    profilePhotoS3Key: null,
    coverPhotoS3Key: null,
    stripeConnectAccountId: null,
    authorSubscriptionPriceId: null,
    authorSubscriptionMonthlyUsd: null,
    featuredPieceIds: [],
    createdAt: new Date().toISOString(),
    totalPiecesCount: 0,
    followerCount: 0,
  })

  await putItem({
    PK: `USER#${VIEWER_USER_ID}`,
    SK: 'PROFILE#VIEWER',
    userId: VIEWER_USER_ID,
    profileType: 'VIEWER',
    status: 'ACTIVE',
    displayName: 'Test Viewer',
    createdAt: new Date().toISOString(),
    notificationGlobalOptOut: false,
    defaultNotificationPref: 'ALL_NEW_PIECES',
  })

  await putItem({
    PK: `USER#${PENDING_AUTHOR_USER_ID}`,
    SK: 'PROFILE#AUTHOR',
    userId: PENDING_AUTHOR_USER_ID,
    profileType: 'AUTHOR',
    status: 'PENDING_SETUP',
    displayName: 'Pending Author',
    bio: '',
    profilePhotoS3Key: null,
    coverPhotoS3Key: null,
    stripeConnectAccountId: null,
    authorSubscriptionPriceId: null,
    authorSubscriptionMonthlyUsd: null,
    featuredPieceIds: [],
    createdAt: new Date().toISOString(),
    totalPiecesCount: 0,
    followerCount: 0,
  })
})

afterAll(async () => {
  await dynamo.send(new DeleteTableCommand({ TableName: TABLE })).catch(() => {})
  await s3.send(new DeleteBucketCommand({ Bucket: BUCKET })).catch(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /media/upload-intent', () => {
  const validBody = {
    fileName: 'painting.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 4_096_000,
  }

  // ── 403: caller has no Author profile ───────────────────────────────────────

  it('returns 403 when caller has only a Viewer profile (not Author)', async () => {
    const event = makeEvent(VIEWER_USER_ID, validBody)
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(403)
    const body = JSON.parse(response.body ?? '{}')
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 403 when caller has no profile at all', async () => {
    const event = makeEvent('unknown-user-999', validBody)
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(403)
  })

  it('returns 403 when Author profile status is PENDING_SETUP', async () => {
    const event = makeEvent(PENDING_AUTHOR_USER_ID, validBody)
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(403)
    const body = JSON.parse(response.body ?? '{}')
    expect(body.error.code).toBe('FORBIDDEN')
  })

  // ── 400: invalid mimeType ────────────────────────────────────────────────────

  it('returns 400 for disallowed mimeType application/pdf', async () => {
    const event = makeEvent(AUTHOR_USER_ID, { ...validBody, mimeType: 'application/pdf' })
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body ?? '{}')
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for disallowed mimeType video/mp4', async () => {
    const event = makeEvent(AUTHOR_USER_ID, { ...validBody, mimeType: 'video/mp4' })
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(400)
  })

  // ── 400: sizeBytes exceeds 20 MB ─────────────────────────────────────────────

  it('returns 400 when sizeBytes is 1 byte over 20 MB limit', async () => {
    const event = makeEvent(AUTHOR_USER_ID, {
      ...validBody,
      sizeBytes: 20 * 1024 * 1024 + 1,
    })
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body ?? '{}')
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when sizeBytes is missing', async () => {
    const { sizeBytes: _, ...noSize } = validBody
    const event = makeEvent(AUTHOR_USER_ID, noSize)
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(400)
  })

  // ── 200: valid Author request ─────────────────────────────────────────────────

  it('returns 200 with intentId, uploadUrl, s3Key, expiresAt for valid Author', async () => {
    const event = makeEvent(AUTHOR_USER_ID, validBody)
    const response = await handler(event, makeCtx())

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body ?? '{}')

    expect(body).toHaveProperty('intentId')
    expect(body).toHaveProperty('uploadUrl')
    expect(body).toHaveProperty('s3Key')
    expect(body).toHaveProperty('expiresAt')

    // s3Key equals intentId
    expect(body.s3Key).toBe(body.intentId)

    // uploadUrl is a valid URL
    expect(() => new URL(body.uploadUrl)).not.toThrow()

    // expiresAt is approximately 10 minutes from now
    const expiresAt = new Date(body.expiresAt).getTime()
    const now = Date.now()
    expect(expiresAt).toBeGreaterThan(now + 9 * 60 * 1000)
    expect(expiresAt).toBeLessThan(now + 11 * 60 * 1000)
  })

  it('writes a PENDING UploadIntent record to DynamoDB', async () => {
    const event = makeEvent(AUTHOR_USER_ID, {
      ...validBody,
      mimeType: 'image/png',
    })
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(200)

    const body = JSON.parse(response.body ?? '{}')
    const { intentId } = body

    // Read back from DynamoDB
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb')
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `UPLOAD#${intentId}`, SK: 'METADATA' },
      })
    )

    expect(result.Item).toBeDefined()
    expect(result.Item?.status).toBe('PENDING')
    expect(result.Item?.mimeType).toBe('image/png')
    expect(result.Item?.uploaderId).toBe(AUTHOR_USER_ID)
    expect(result.Item?.s3Key).toBe(intentId)
  })

  it('accepts all allowed MIME types', async () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      const event = makeEvent(AUTHOR_USER_ID, { ...validBody, mimeType })
      const response = await handler(event, makeCtx())
      expect(response.statusCode, `Expected 200 for ${mimeType}`).toBe(200)
    }
  })

  it('accepts sizeBytes exactly at the 20 MB limit', async () => {
    const event = makeEvent(AUTHOR_USER_ID, {
      ...validBody,
      sizeBytes: 20 * 1024 * 1024,
    })
    const response = await handler(event, makeCtx())
    expect(response.statusCode).toBe(200)
  })
})
