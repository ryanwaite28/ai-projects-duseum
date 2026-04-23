// =============================================================================
// lambdas/maintenance/src/__tests__/setup.ts
// MiniStack table bootstrapping for maintenance-lambda integration tests.
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
export const TABLE        = 'duseum-test-maintenance'
export const CONFIG_TABLE = 'duseum-test-maintenance-config'

const creds = { accessKeyId: 'test', secretAccessKey: 'test' }

export const dynamo    = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT, credentials: creds })
export const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
})

beforeAll(async () => {
  process.env.ENVIRONMENT              = 'local'
  process.env.AWS_REGION               = REGION
  process.env.AWS_ENDPOINT_URL         = ENDPOINT
  process.env.DYNAMODB_TABLE_NAME      = TABLE
  process.env.CONFIG_TABLE_NAME        = CONFIG_TABLE
  process.env.IDEMPOTENCY_TABLE_NAME   = 'unused'
  process.env.CLOUDFRONT_MEDIA_DOMAIN  = 'media.test.duseum.com'
  process.env.COGNITO_USER_POOL_ID     = 'us-east-1_testpool'
  process.env.COGNITO_CLIENT_ID        = 'test-client-id'
  process.env.DAILY_FEATURE_RULE_NAME  = 'duseum-test-daily-featured-author'
  process.env.WEEKLY_ROTATION_RULE_NAME = 'duseum-test-weekly-feature-rotation'

  // ── Main table ───────────────────────────────────────────────────────────
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

  // ── Config table ─────────────────────────────────────────────────────────
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

  // Seed empty exclusions list
  await docClient.send(new PutCommand({
    TableName: CONFIG_TABLE,
    Item: { PK: 'DAILY_FEATURED_EXCLUSIONS', authorIds: [] },
  }))
})

afterAll(async () => {
  await dynamo.send(new DeleteTableCommand({ TableName: TABLE })).catch(() => {})
  await dynamo.send(new DeleteTableCommand({ TableName: CONFIG_TABLE })).catch(() => {})
})

afterEach(async () => {
  // Truncate main table
  const scan = await docClient.send(new ScanCommand({
    TableName: TABLE,
    ProjectionExpression: 'PK, SK',
  }))
  for (const item of scan.Items ?? []) {
    await docClient.send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK: item['PK'], SK: item['SK'] },
    }))
  }

  // Reset config table entries that tests may have written
  await docClient.send(new PutCommand({
    TableName: CONFIG_TABLE,
    Item: { PK: 'DAILY_FEATURED_EXCLUSIONS', authorIds: [] },
  }))
  // Delete DAILY_FEATURED_AUTHOR if present (ignore missing)
  await docClient.send(new DeleteCommand({
    TableName: CONFIG_TABLE,
    Key: { PK: 'DAILY_FEATURED_AUTHOR' },
  })).catch(() => {})
})

// ── Seed helpers ──────────────────────────────────────────────────────────────

export const seedItem = (item: Record<string, unknown>) =>
  docClient.send(new PutCommand({ TableName: TABLE, Item: item }))

export const seedConfig = (item: Record<string, unknown>) =>
  docClient.send(new PutCommand({ TableName: CONFIG_TABLE, Item: item }))

export const makeEventBridgeEvent = (ruleName: string) => ({
  version:     '0',
  id:          `test-${Date.now()}`,
  source:      'aws.events',
  account:     '123456789012',
  time:        new Date().toISOString(),
  region:      REGION,
  resources:   [`arn:aws:events:${REGION}:123456789012:rule/${ruleName}`],
  'detail-type': 'Scheduled Event',
  detail:      {},
})

// ── Domain seed helpers ───────────────────────────────────────────────────────

export const seedActiveAuthor = (
  authorId: string,
  createdAt = '2025-01-01T00:00:00.000Z'
) =>
  seedItem({
    PK:           `USER#${authorId}`,
    SK:           'PROFILE#AUTHOR',
    userId:       authorId,
    profileType:  'AUTHOR',
    status:       'ACTIVE',
    displayName:  `Author ${authorId.slice(-4)}`,
    bio:          'Test bio',
    createdAt,
    totalPiecesCount: 0,
    followerCount:    0,
    subscriberCount:  0,
    featuredPieceIds: [],
    profilePhotoS3Key:            null,
    coverPhotoS3Key:              null,
    stripeConnectAccountId:       null,
    authorSubscriptionPriceId:    null,
    authorSubscriptionMonthlyUsd: null,
  })

export const seedPublicPiece = (authorId: string, artworkId: string, createdAt: string) =>
  seedItem({
    PK:                     `ARTWORK#${artworkId}`,
    SK:                     'ARTWORK',
    artworkId,
    authorId,
    title:                  `Piece ${artworkId.slice(-4)}`,
    description:            '',
    tags:                   [],
    category:               'DIGITAL',
    visibility:             'PUBLIC',
    status:                 'ACTIVE',
    s3Key:                  `media/${artworkId}.jpg`,
    mimeType:               'image/jpeg',
    fileSizeBytes:          100_000,
    viewCount:              0,
    commentsEnabled:        true,
    notifiedCount:          0,
    createdAt,
    updatedAt:              createdAt,
    publishedAt:            createdAt,
    'visibility#createdAt': `PUBLIC#${createdAt}`,
  })

export const seedBooking = (
  authorId: string,
  isoWeek: string,
  featureStatus: string,
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
      featureStatus,
      stripePaymentIntentId: `pi_test_${bookingId}`,
      amountPaidUsd: 25,
      bookedAt:      '2025-01-01T00:00:00.000Z',
      activatedAt:   null,
      cancelledAt:   null,
      cancelledBy:   null,
    }),
    seedItem({
      PK: `AUTHOR#${authorId}`,
      SK: `FEATURE#WEEK#${isoWeek}`,
      bookingId,
      authorId,
      isoWeek,
      weekStartDate,
      weekEndDate,
      featureStatus,
      stripePaymentIntentId: `pi_test_${bookingId}`,
      amountPaidUsd: 25,
      bookedAt:      '2025-01-01T00:00:00.000Z',
      activatedAt:   null,
      cancelledAt:   null,
      cancelledBy:   null,
    }),
  ])
