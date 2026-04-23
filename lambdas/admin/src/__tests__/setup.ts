// =============================================================================
// lambdas/admin/src/__tests__/setup.ts
// MiniStack table bootstrapping for admin-lambda integration tests.
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
import type { APIGatewayProxyEventV2 } from 'aws-lambda'

export const ENDPOINT     = 'http://localhost:4566'
export const REGION       = 'us-east-1'
export const TABLE        = 'duseum-test-admin'
export const CONFIG_TABLE = 'duseum-test-admin-config'

export const ADMIN_USER_ID = 'admin-user-001'
export const PLAIN_USER_ID = 'user-002'

const creds = { accessKeyId: 'test', secretAccessKey: 'test' }

export const dynamo    = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT, credentials: creds })
export const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
})

// ── JWT factory helpers ───────────────────────────────────────────────────────

const makeJwt = (payload: Record<string, unknown>): string => {
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const body    = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.fakesig`
}

export const makeAdminJwt = (userId = ADMIN_USER_ID): string =>
  makeJwt({ sub: userId, 'cognito:groups': ['ADMIN'] })

export const makeUserJwt = (userId = PLAIN_USER_ID): string =>
  makeJwt({ sub: userId, 'cognito:groups': [] })

// ── API GW event factory ──────────────────────────────────────────────────────

export const makeApiEvent = (
  method: string,
  path: string,
  opts: {
    body?: unknown
    pathParameters?: Record<string, string>
    queryStringParameters?: Record<string, string>
    jwt?: string
  } = {}
): APIGatewayProxyEventV2 =>
  ({
    version:    '2.0',
    routeKey:   `${method} ${path}`,
    rawPath:    path,
    rawQueryString: '',
    headers: {
      'content-type':  'application/json',
      authorization:   `Bearer ${opts.jwt ?? makeAdminJwt()}`,
    },
    queryStringParameters: opts.queryStringParameters ?? {},
    pathParameters:        opts.pathParameters ?? {},
    body:                  opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId:     'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: `test-${Date.now()}`,
      routeKey:  `${method} ${path}`,
      stage:     '$default',
      time:      new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  } as unknown as APIGatewayProxyEventV2)

// ── MiniStack table bootstrap ─────────────────────────────────────────────────

beforeAll(async () => {
  process.env.ENVIRONMENT               = 'local'
  process.env.AWS_REGION                = REGION
  process.env.AWS_ENDPOINT_URL          = ENDPOINT
  process.env.DYNAMODB_TABLE_NAME       = TABLE
  process.env.CONFIG_TABLE_NAME         = CONFIG_TABLE
  process.env.IDEMPOTENCY_TABLE_NAME    = 'unused'
  process.env.CLOUDFRONT_MEDIA_DOMAIN   = 'media.test.duseum.com'
  process.env.COGNITO_USER_POOL_ID      = 'us-east-1_testpool'
  process.env.COGNITO_CLIENT_ID         = 'test-client-id'
  process.env.DAILY_FEATURE_RULE_NAME   = 'duseum-test-daily-featured-author'
  process.env.WEEKLY_ROTATION_RULE_NAME = 'duseum-test-weekly-feature-rotation'
  process.env.MEDIA_BUCKET              = 'duseum-test-media'
  process.env.STRIPE_WEBHOOK_DLQ_URL    = 'http://localhost:4566/000000000000/duseum-test-stripe-dlq'
  process.env.NOTIFICATION_DLQ_URL      = 'http://localhost:4566/000000000000/duseum-test-notifications-dlq'

  // ── Main table ────────────────────────────────────────────────────────────
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

  // ── Config table ──────────────────────────────────────────────────────────
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

  // Reset config table
  await docClient.send(new PutCommand({
    TableName: CONFIG_TABLE,
    Item: { PK: 'DAILY_FEATURED_EXCLUSIONS', authorIds: [] },
  }))
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

export const makeCtx = () => ({
  awsRequestId:             'test-aws-req-id',
  functionName:             'admin-lambda',
  getRemainingTimeInMillis: () => 30_000,
} as never)

export const seedActiveAuthor = (authorId: string) =>
  seedItem({
    PK:           `USER#${authorId}`,
    SK:           'PROFILE#AUTHOR',
    userId:       authorId,
    profileType:  'AUTHOR',
    status:       'ACTIVE',
    displayName:  `Author ${authorId.slice(-4)}`,
    bio:          'Test bio',
    createdAt:    '2025-01-01T00:00:00.000Z',
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

export const seedUserAccount = (userId: string) =>
  seedItem({
    PK:            `USER#${userId}`,
    SK:            'PROFILE',
    userId,
    email:         `${userId}@test.duseum.com`,
    systemRole:    'USER',
    emailVerified: true,
    createdAt:     '2025-01-01T00:00:00.000Z',
    lastLoginAt:   '2025-01-01T00:00:00.000Z',
  })

export const seedViewerProfile = (userId: string, status = 'ACTIVE') =>
  seedItem({
    PK:                       `USER#${userId}`,
    SK:                       'PROFILE#VIEWER',
    userId,
    profileType:              'VIEWER',
    status,
    displayName:              `Viewer ${userId.slice(-4)}`,
    createdAt:                '2025-01-01T00:00:00.000Z',
    notificationGlobalOptOut: false,
    defaultNotificationPref:  'ALL_NEW_PIECES',
    updatedAt:                '2025-01-01T00:00:00.000Z',
  })

export const seedAuthorProfile = (authorId: string, status = 'ACTIVE') =>
  seedItem({
    PK:           `USER#${authorId}`,
    SK:           'PROFILE#AUTHOR',
    userId:       authorId,
    profileType:  'AUTHOR',
    status,
    displayName:  `Author ${authorId.slice(-4)}`,
    bio:          'Test bio',
    createdAt:    '2025-01-01T00:00:00.000Z',
    updatedAt:    '2025-01-01T00:00:00.000Z',
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

export const seedArtwork = (artworkId: string, authorId: string, s3Key = `media/${artworkId}.jpg`, status = 'PUBLIC') =>
  seedItem({
    PK:          `ARTWORK#${artworkId}`,
    SK:          'METADATA',
    artworkId,
    authorId,
    title:       `Artwork ${artworkId.slice(-4)}`,
    description: 'Test artwork',
    tags:        [],
    category:    'DIGITAL',
    visibility:  status === 'ARCHIVED' ? 'PUBLIC' : status,
    status,
    s3Key,
    mimeType:    'image/jpeg',
    fileSizeBytes: 100_000,
    viewCount:   0,
    commentsEnabled: true,
    notifiedCount:   0,
    createdAt:   '2025-01-01T00:00:00.000Z',
    updatedAt:   '2025-01-01T00:00:00.000Z',
    publishedAt: '2025-01-01T00:00:00.000Z',
    'visibility#createdAt': `${status}#2025-01-01T00:00:00.000Z`,
  })

/** Seeds a comment item + shadow lookup item (no commentCount increment). */
export const seedComment = (
  commentId: string,
  artworkId: string,
  authorId:  string,
  isDeleted = false
) => {
  const createdAt = '2025-01-01T00:00:00.000Z'
  const sk = `COMMENT#${createdAt}#${commentId}`
  return Promise.all([
    seedItem({
      PK:              `ARTWORK#${artworkId}`,
      SK:              sk,
      commentId,
      artworkId,
      authorId,
      body:            'Test comment body',
      parentCommentId: null,
      isPinned:        false,
      isDeleted,
      createdAt,
    }),
    seedItem({
      PK:              `COMMENT#${commentId}`,
      SK:              'METADATA',
      commentId,
      artworkId,
      artworkAuthorId: authorId,
      authorId,
      sk,
      createdAt,
    }),
  ])
}

/**
 * Seeds a booking with all three records:
 *   1. PK=FEATURE#WEEK#{isoWeek}  SK=AUTHOR#{authorId}
 *   2. PK=AUTHOR#{authorId}        SK=FEATURE#WEEK#{isoWeek}
 *   3. PK=BOOKING#{bookingId}      SK=METADATA  (pointer)
 */
export const seedBooking = (
  authorId: string,
  isoWeek: string,
  featureStatus: string,
  bookingId: string,
  weekStartDate: string,
  weekEndDate: string
) => {
  const base = {
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
    cancellationReason: null,
  }
  return Promise.all([
    seedItem({ PK: `FEATURE#WEEK#${isoWeek}`, SK: `AUTHOR#${authorId}`, ...base }),
    seedItem({ PK: `AUTHOR#${authorId}`, SK: `FEATURE#WEEK#${isoWeek}`, ...base }),
    seedItem({ PK: `BOOKING#${bookingId}`, SK: 'METADATA', bookingId, isoWeek, authorId }),
  ])
}
