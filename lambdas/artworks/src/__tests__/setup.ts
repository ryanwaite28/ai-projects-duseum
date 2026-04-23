// =============================================================================
// lambdas/artworks/src/__tests__/setup.ts
// MiniStack table + bucket bootstrapping for artworks integration tests.
// Section 15.3 — real DynamoDB + S3, no AWS service mocks.
// =============================================================================

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb'
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
  PurgeQueueCommand,
} from '@aws-sdk/client-sqs'
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { afterAll, afterEach, beforeAll } from 'vitest'

export const ENDPOINT = 'http://localhost:4566'
export const REGION   = 'us-east-1'
export const TABLE    = 'duseum-test-artworks'
export const BUCKET   = 'duseum-test-artworks-media'
export const CONFIG_TABLE = 'duseum-test-artworks-config'
export const QUEUE_NAME   = 'duseum-test-notifications'

const creds = { accessKeyId: 'test', secretAccessKey: 'test' }

export const dynamo = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT, credentials: creds })
export const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
})
export const s3  = new S3Client({ region: REGION, endpoint: ENDPOINT, forcePathStyle: true, credentials: creds })
export const sqs = new SQSClient({ region: REGION, endpoint: ENDPOINT, credentials: creds })

export let queueUrl = ''

beforeAll(async () => {
  // Set env vars before any module-level code in the handler runs
  process.env.ENVIRONMENT              = 'local'
  process.env.AWS_REGION               = REGION
  process.env.AWS_ENDPOINT_URL         = ENDPOINT
  process.env.DYNAMODB_TABLE_NAME      = TABLE
  process.env.CONFIG_TABLE_NAME        = CONFIG_TABLE
  process.env.IDEMPOTENCY_TABLE_NAME   = 'unused'
  process.env.S3_MEDIA_BUCKET_NAME     = BUCKET
  process.env.CLOUDFRONT_MEDIA_DOMAIN  = 'media.test.duseum.com'
  process.env.CLOUDFRONT_KEY_PAIR_ID   = 'TESTKEYPAIRID'
  process.env.COGNITO_USER_POOL_ID     = 'us-east-1_testpool'
  process.env.COGNITO_CLIENT_ID        = 'test-client-id'

  // Create main table
  try {
    await dynamo.send(new CreateTableCommand({
      TableName: TABLE,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK',                 AttributeType: 'S' },
        { AttributeName: 'SK',                 AttributeType: 'S' },
        { AttributeName: 'authorId',           AttributeType: 'S' },
        { AttributeName: 'visibility#createdAt', AttributeType: 'S' },
        { AttributeName: 'status',             AttributeType: 'S' },
        { AttributeName: 'createdAt',          AttributeType: 'S' },
        { AttributeName: 'tag',                AttributeType: 'S' },
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
          IndexName: 'GSI-AllPublicPieces',
          KeySchema: [
            { AttributeName: 'status',    KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI-TagIndex',
          KeySchema: [
            { AttributeName: 'tag',       KeyType: 'HASH' },
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

  // Create config table
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

  // Seed FREE_TIER_LIMIT = 3 (low value makes tests tractable)
  await docClient.send(new PutCommand({
    TableName: CONFIG_TABLE,
    Item: { PK: 'FREE_TIER_LIMIT', value: 3 },
  }))

  // Create media bucket
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
  } catch { /* already exists */ }

  // Create notification SQS queue
  try {
    await sqs.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }))
  } catch { /* already exists */ }
  const urlResult = await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }))
  queueUrl = urlResult.QueueUrl!
  process.env.NOTIFICATION_QUEUE_URL = queueUrl
})

afterAll(async () => {
  await dynamo.send(new DeleteTableCommand({ TableName: TABLE })).catch(() => {})
  await dynamo.send(new DeleteTableCommand({ TableName: CONFIG_TABLE })).catch(() => {})
  await s3.send(new DeleteBucketCommand({ Bucket: BUCKET })).catch(() => {})
})

afterEach(async () => {
  // Truncate main table between tests
  const scan = await docClient.send(new ScanCommand({ TableName: TABLE, ProjectionExpression: 'PK, SK' }))
  if (scan.Items?.length) {
    // DynamoDB batch delete in chunks of 25
    for (let i = 0; i < scan.Items.length; i += 25) {
      const chunk = scan.Items.slice(i, i + 25)
      await Promise.all(
        chunk.map((item) =>
          docClient.send(new PutCommand({ TableName: TABLE, Item: item })) // no-op rewrite trick
        )
      )
    }
    // Actual delete via scan+delete loop
    for (const item of scan.Items) {
      const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb')
      await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { PK: item['PK'], SK: item['SK'] } }))
    }
  }

  // Purge SQS queue
  await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl })).catch(() => {})

  // Empty S3 bucket
  const objects = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET }))
  if (objects.Contents?.length) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key! })) },
    }))
  }
})

// ── Test data helpers ─────────────────────────────────────────────────────────

export const seedItem = (item: Record<string, unknown>) =>
  docClient.send(new PutCommand({ TableName: TABLE, Item: item }))

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
    pathParameters?: Record<string, string>
    queryStringParameters?: Record<string, string>
  } = {}
) => ({
  headers: opts.userId
    ? { authorization: `Bearer ${makeToken(opts.userId)}` }
    : {},
  body:                   opts.body ? JSON.stringify(opts.body) : undefined,
  pathParameters:         opts.pathParameters ?? {},
  queryStringParameters:  opts.queryStringParameters ?? {},
  requestContext: {
    http: { method, path },
    requestId: `test-${Date.now()}`,
  },
})

export const makeCtx = () => ({
  awsRequestId:              'test-aws-req-id',
  functionName:              'artworks-lambda',
  getRemainingTimeInMillis:  () => 30_000,
}) as never
