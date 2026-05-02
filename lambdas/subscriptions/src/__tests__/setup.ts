// =============================================================================
// lambdas/subscriptions/src/__tests__/setup.ts
// MiniStack table bootstrapping for subscriptions integration tests.
// Section 15.3 — real DynamoDB, Stripe calls mocked via vi.mock.
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
export const TABLE        = 'duseum-test-subscriptions'
export const CONFIG_TABLE = 'duseum-test-subscriptions-config'

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
  process.env.COGNITO_USER_POOL_ID   = 'us-east-1_testpool'
  process.env.COGNITO_CLIENT_ID      = 'test-client-id'
  process.env.APP_BASE_URL           = 'https://test.duseum.com'

  // Create main table
  try {
    await dynamo.send(new CreateTableCommand({
      TableName: TABLE,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK',       AttributeType: 'S' },
        { AttributeName: 'SK',       AttributeType: 'S' },
        { AttributeName: 'authorId', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
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

  // Create config table — PK-only, matching production StorageStack (no SK)
  try {
    await dynamo.send(new CreateTableCommand({
      TableName: CONFIG_TABLE,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }

  // Seed platform config — { PK: key, value } matching setConfigValue / getConfigValue pattern
  await docClient.send(new PutCommand({
    TableName: CONFIG_TABLE,
    Item: { PK: 'PLATFORM_SUB_PRICE_ID', value: 'price_platform_test_123' },
  }))

  await docClient.send(new PutCommand({
    TableName: CONFIG_TABLE,
    Item: { PK: 'PLATFORM_CUT_PERCENT', value: 20 },
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
  if (scan.Items?.length) {
    for (const item of scan.Items) {
      await docClient.send(
        new DeleteCommand({ TableName: TABLE, Key: { PK: item['PK'], SK: item['SK'] } })
      )
    }
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
  } = {}
) => ({
  headers: opts.userId
    ? { authorization: `Bearer ${makeToken(opts.userId)}` }
    : {},
  body:           opts.body ? JSON.stringify(opts.body) : undefined,
  pathParameters: opts.pathParameters ?? {},
  requestContext: {
    http: { method, path },
    requestId: `test-${Date.now()}`,
  },
})

export const makeCtx = () => ({
  awsRequestId:             'test-aws-req-id',
  functionName:             'subscriptions-lambda',
  getRemainingTimeInMillis: () => 30_000,
}) as never
