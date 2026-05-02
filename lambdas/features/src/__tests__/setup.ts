// =============================================================================
// lambdas/features/src/__tests__/setup.ts
// MiniStack table bootstrapping for features-lambda integration tests.
// Section 15.3 — real DynamoDB, no AWS service mocks.
// =============================================================================

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { afterAll, afterEach, beforeAll } from 'vitest'

export const ENDPOINT     = 'http://localhost:4566'
export const REGION       = 'us-east-1'
export const TABLE        = 'duseum-test-features'
export const CONFIG_TABLE = 'duseum-test-features-config'

const creds = { accessKeyId: 'test', secretAccessKey: 'test' }

export const dynamo = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT, credentials: creds })
export const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
})

beforeAll(async () => {
  process.env.ENVIRONMENT            = 'local'
  process.env.AWS_REGION             = REGION
  process.env.AWS_ENDPOINT_URL       = ENDPOINT
  process.env.DYNAMODB_TABLE_NAME    = TABLE
  process.env.CONFIG_TABLE_NAME      = CONFIG_TABLE
  process.env.IDEMPOTENCY_TABLE_NAME = 'unused'
  process.env.CLOUDFRONT_MEDIA_DOMAIN = 'media.test.duseum.com'
  process.env.COGNITO_USER_POOL_ID   = 'us-east-1_testpool'
  process.env.COGNITO_CLIENT_ID      = 'test-client-id'

  // ── Main table with all required GSIs ──────────────────────────────────────
  try {
    await dynamo.send(new CreateTableCommand({
      TableName: TABLE,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK',                   AttributeType: 'S' },
        { AttributeName: 'SK',                   AttributeType: 'S' },
        { AttributeName: 'authorId',             AttributeType: 'S' },
        { AttributeName: 'visibility#createdAt', AttributeType: 'S' },
        { AttributeName: 'featureStatus',        AttributeType: 'S' },
        { AttributeName: 'isoWeek',              AttributeType: 'S' },
        { AttributeName: 'profileType',          AttributeType: 'S' },
        { AttributeName: 'createdAt',            AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI-AuthorPublic',
          KeySchema: [
            { AttributeName: 'authorId',             KeyType: 'HASH' },
            { AttributeName: 'visibility#createdAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI-WeeklyFeatureByStatus',
          KeySchema: [
            { AttributeName: 'featureStatus', KeyType: 'HASH' },
            { AttributeName: 'isoWeek',       KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI-AuthorDirectory',
          KeySchema: [
            { AttributeName: 'profileType', KeyType: 'HASH' },
            { AttributeName: 'createdAt',   KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }

  // ── Config table ───────────────────────────────────────────────────────────
  try {
    await dynamo.send(new CreateTableCommand({
      TableName: CONFIG_TABLE,
      KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'PK', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }

  // Seed feature config values
  await Promise.all([
    docClient.send(new PutCommand({
      TableName: CONFIG_TABLE,
      Item: { PK: 'WEEKLY_FEATURE_FEE_USD', value: 25 },
    })),
    docClient.send(new PutCommand({
      TableName: CONFIG_TABLE,
      Item: { PK: 'WEEKLY_FEATURE_SLOT_COUNT', value: 10 },
    })),
    docClient.send(new PutCommand({
      TableName: CONFIG_TABLE,
      Item: { PK: 'WEEKLY_FEATURE_ADVANCE_WEEKS', value: 8 },
    })),
  ])
})

afterAll(async () => {
  await dynamo.send(new DeleteTableCommand({ TableName: TABLE })).catch(() => {})
  await dynamo.send(new DeleteTableCommand({ TableName: CONFIG_TABLE })).catch(() => {})
})

afterEach(async () => {
  // Truncate main table between tests
  const scan = await docClient.send(new ScanCommand({
    TableName: TABLE,
    ProjectionExpression: 'PK, SK',
  }))
  if (scan.Items?.length) {
    for (const item of scan.Items) {
      await docClient.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: item['PK'], SK: item['SK'] },
      }))
    }
  }

  // Re-seed config values after each test (they're in a separate table not truncated)
})

// ── Test data helpers ──────────────────────────────────────────────────────────

export const seedItem = (item: Record<string, unknown>) =>
  docClient.send(new PutCommand({ TableName: TABLE, Item: item }))

export const seedConfig = (item: Record<string, unknown>) =>
  docClient.send(new PutCommand({ TableName: CONFIG_TABLE, Item: item }))

export const makeToken = (sub: string): string => {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const p = Buffer.from(JSON.stringify({ sub })).toString('base64url')
  return `${h}.${p}.fakesig`
}

export const makeEvent = (
  method: string,
  path: string,
  opts: {
    userId?: string
    body?: unknown
    queryStringParameters?: Record<string, string>
  } = {}
) => ({
  headers: opts.userId
    ? { authorization: `Bearer ${makeToken(opts.userId)}` }
    : {},
  body:                  opts.body ? JSON.stringify(opts.body) : undefined,
  queryStringParameters: opts.queryStringParameters ?? {},
  pathParameters:        {},
  requestContext: {
    http: { method, path },
    requestId: `test-${Date.now()}`,
  },
})

export const makeCtx = () => ({
  awsRequestId:             'test-aws-req-id',
  functionName:             'features-lambda',
  getRemainingTimeInMillis: () => 30_000,
}) as never

// ── Domain seed helpers ────────────────────────────────────────────────────────

export const seedAuthorProfile = (authorId: string, overrides: Record<string, unknown> = {}) =>
  seedItem({
    PK: `USER#${authorId}`,
    SK: 'PROFILE#AUTHOR',
    userId:       authorId,
    profileType:  'AUTHOR',
    status:       'ACTIVE',
    displayName:  `Author ${authorId.slice(0, 4)}`,
    bio:          'Test bio.',
    profilePhotoS3Key:             null,
    coverPhotoS3Key:               null,
    stripeConnectAccountId:        'acct_test_mock',
    connectChargesEnabled:         true,
    authorSubscriptionPriceId:     null,
    authorSubscriptionMonthlyUsd:  null,
    featuredPieceIds:              [],
    createdAt:     '2025-01-01T00:00:00.000Z',
    totalPiecesCount: 0,
    followerCount:    0,
    subscriberCount:  0,
    ...overrides,
  })

export const seedPublicPiece = (authorId: string, artworkId: string, createdAt: string) =>
  seedItem({
    PK:                   `ARTWORK#${artworkId}`,
    SK:                   `ARTWORK`,
    artworkId,
    authorId,
    title:                `Piece ${artworkId.slice(0, 4)}`,
    description:          '',
    tags:                 [],
    category:             'DIGITAL',
    visibility:           'PUBLIC',
    status:               'ACTIVE',
    s3Key:                `media/${artworkId}.jpg`,
    mimeType:             'image/jpeg',
    fileSizeBytes:        100_000,
    viewCount:            0,
    commentsEnabled:      true,
    notifiedCount:        0,
    createdAt,
    updatedAt:            createdAt,
    publishedAt:          createdAt,
    // GSI-AuthorPublic keys
    'visibility#createdAt': `PUBLIC#${createdAt}`,
  })

export const seedConfirmedBooking = (
  authorId: string,
  isoWeek: string,
  bookingId: string,
  weekStartDate: string,
  weekEndDate: string
) =>
  Promise.all([
    seedItem({
      PK: `FEATURE#WEEK#${isoWeek}`,
      SK: `AUTHOR#${authorId}`,
      bookingId,
      authorId,
      isoWeek,
      weekStartDate,
      weekEndDate,
      featureStatus:         'CONFIRMED',
      stripePaymentIntentId: `pi_test_${bookingId}`,
      amountPaidUsd:         25,
      bookedAt:              '2025-01-01T00:00:00.000Z',
      activatedAt:           null,
      cancelledAt:           null,
      cancelledBy:           null,
    }),
    seedItem({
      PK: `AUTHOR#${authorId}`,
      SK: `FEATURE#WEEK#${isoWeek}`,
      bookingId,
      authorId,
      isoWeek,
      weekStartDate,
      weekEndDate,
      featureStatus:         'CONFIRMED',
      stripePaymentIntentId: `pi_test_${bookingId}`,
      amountPaidUsd:         25,
      bookedAt:              '2025-01-01T00:00:00.000Z',
      activatedAt:           null,
      cancelledAt:           null,
      cancelledBy:           null,
    }),
  ])
