// =============================================================================
// lambdas/notifications/src/__tests__/setup.ts
// MiniStack table bootstrapping for notifications-lambda integration tests.
// Section 15.3 — real DynamoDB (MiniStack), SES mocked.
// =============================================================================

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { afterAll, afterEach, beforeAll } from 'vitest'

export const ENDPOINT = 'http://localhost:4566'
export const REGION   = 'us-east-1'
export const TABLE    = 'duseum-test-notifications'

const creds = { accessKeyId: 'test', secretAccessKey: 'test' }

export const dynamo = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT, credentials: creds })
export const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
})

beforeAll(async () => {
  process.env.ENVIRONMENT             = 'local'
  process.env.AWS_REGION              = REGION
  process.env.AWS_ENDPOINT_URL        = ENDPOINT
  process.env.DYNAMODB_TABLE_NAME     = TABLE
  process.env.CONFIG_TABLE_NAME       = 'unused-config'
  process.env.IDEMPOTENCY_TABLE_NAME  = 'unused-idempotency'
  process.env.S3_MEDIA_BUCKET_NAME    = 'unused-bucket'
  process.env.CLOUDFRONT_MEDIA_DOMAIN = 'media.test.duseum.com'
  process.env.CLOUDFRONT_KEY_PAIR_ID  = 'TESTKEYPAIRID'
  process.env.COGNITO_USER_POOL_ID    = 'us-east-1_testpool'
  process.env.COGNITO_CLIENT_ID       = 'test-client-id'
  process.env.FRONTEND_DOMAIN         = 'test.duseum.com'

  try {
    await dynamo.send(new CreateTableCommand({
      TableName: TABLE,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK',          AttributeType: 'S' },
        { AttributeName: 'SK',          AttributeType: 'S' },
        { AttributeName: 'authorId',    AttributeType: 'S' },
        { AttributeName: 'followedAt',  AttributeType: 'S' },
        { AttributeName: 'createdAt',   AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI-FollowersByAuthor',
          KeySchema: [
            { AttributeName: 'authorId',   KeyType: 'HASH' },
            { AttributeName: 'followedAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI-SubscribersByAuthor',
          KeySchema: [
            { AttributeName: 'authorId',  KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }
})

afterAll(async () => {
  await dynamo.send(new DeleteTableCommand({ TableName: TABLE })).catch(() => {})
})

afterEach(async () => {
  const scan = await docClient.send(new ScanCommand({ TableName: TABLE, ProjectionExpression: 'PK, SK' }))
  for (const item of scan.Items ?? []) {
    await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { PK: item['PK'], SK: item['SK'] } }))
  }
})

// ── Seed helpers ──────────────────────────────────────────────────────────────

export const seedItem = (item: Record<string, unknown>) =>
  docClient.send(new PutCommand({ TableName: TABLE, Item: item }))

/** Seeds an ArtPiece METADATA item. */
export const seedArtwork = (
  artworkId: string,
  authorId: string,
  opts: { visibility?: 'PUBLIC' | 'PRIVATE'; status?: string } = {}
) =>
  seedItem({
    PK:           `ARTWORK#${artworkId}`,
    SK:           'METADATA',
    artworkId,
    authorId,
    title:        'Test Piece',
    visibility:   opts.visibility ?? 'PUBLIC',
    status:       opts.status     ?? 'PUBLIC',
    notifiedCount: 0,
  })

/** Seeds an AuthorProfile PROFILE#AUTHOR item. */
export const seedAuthor = (authorId: string, opts: { status?: string } = {}) =>
  seedItem({
    PK:           `USER#${authorId}`,
    SK:           'PROFILE#AUTHOR',
    userId:       authorId,
    profileType:  'AUTHOR',
    status:       opts.status ?? 'ACTIVE',
    displayName:  `Author ${authorId}`,
    createdAt:    '2025-01-01T00:00:00.000Z',
  })

/** Seeds a ViewerProfile PROFILE#VIEWER item. */
export const seedViewerProfile = (
  viewerId: string,
  opts: {
    globalOptOut?: boolean
    defaultPref?: string
  } = {}
) =>
  seedItem({
    PK:                       `USER#${viewerId}`,
    SK:                       'PROFILE#VIEWER',
    userId:                   viewerId,
    profileType:              'VIEWER',
    status:                   'ACTIVE',
    displayName:              `Viewer ${viewerId}`,
    createdAt:                '2025-01-01T00:00:00.000Z',
    notificationGlobalOptOut: opts.globalOptOut ?? false,
    defaultNotificationPref:  opts.defaultPref  ?? 'ALL_NEW_PIECES',
  })

/** Seeds a UserAccount (email) item. */
export const seedUserAccount = (viewerId: string, email: string) =>
  seedItem({
    PK:     `USER#${viewerId}`,
    SK:     'ACCOUNT',
    userId: viewerId,
    email,
  })

/** Seeds a Follow item visible via GSI-FollowersByAuthor. */
export const seedFollow = (viewerId: string, authorId: string) =>
  seedItem({
    PK:         `USER#${viewerId}`,
    SK:         `FOLLOW#AUTHOR#${authorId}`,
    viewerId,
    authorId,
    followedAt: new Date().toISOString(),
  })

/**
 * Seeds an Author Subscription item visible via GSI-SubscribersByAuthor.
 * `authorId` is stored as a top-level attribute for the GSI hash key.
 */
export const seedAuthorSubscription = (
  userId: string,
  authorId: string,
  opts: { status?: string } = {}
) =>
  seedItem({
    PK:                   `USER#${userId}`,
    SK:                   `SUB#AUTHOR#${authorId}`,
    userId,
    targetId:             authorId,
    authorId,                              // GSI-SubscribersByAuthor hash key
    status:               opts.status ?? 'ACTIVE',
    stripeSubscriptionId: `sub_test_${userId}`,
    stripeCustomerId:     `cus_test_${userId}`,
    currentPeriodEnd:     '2026-12-31T00:00:00.000Z',
    createdAt:            '2025-01-01T00:00:00.000Z',
  })

/** Seeds a per-author NotificationPreference override. */
export const seedNotifPref = (viewerId: string, authorId: string, pref: string) =>
  seedItem({
    PK:       `USER#${viewerId}`,
    SK:       `NOTIF_PREF#AUTHOR#${authorId}`,
    viewerId,
    authorId,
    pref,
    updatedAt: new Date().toISOString(),
  })
