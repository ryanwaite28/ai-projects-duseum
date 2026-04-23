// =============================================================================
// lambdas/subscriptions-webhook/src/__tests__/setup.ts
// MiniStack table bootstrapping for subscriptions-webhook integration tests.
// Section 15.3 — real DynamoDB (MiniStack), Stripe calls mocked via vi.mock.
// =============================================================================

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { afterAll, afterEach, beforeAll } from 'vitest'

export const ENDPOINT       = 'http://localhost:4566'
export const REGION         = 'us-east-1'
export const MAIN_TABLE     = 'duseum-test-webhook-main'
export const IDEM_TABLE     = 'duseum-test-webhook-idempotency'

const creds = { accessKeyId: 'test', secretAccessKey: 'test' }

export const dynamo = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT, credentials: creds })
export const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
})

beforeAll(async () => {
  process.env.ENVIRONMENT            = 'local'
  process.env.AWS_REGION             = REGION
  process.env.AWS_ENDPOINT_URL       = ENDPOINT
  process.env.DYNAMODB_TABLE_NAME    = MAIN_TABLE
  process.env.IDEMPOTENCY_TABLE_NAME = IDEM_TABLE
  process.env.CONFIG_TABLE_NAME      = 'unused'

  const keySchema = [
    { AttributeName: 'PK', KeyType: 'HASH' as const },
    { AttributeName: 'SK', KeyType: 'RANGE' as const },
  ]
  const attrDefs = [
    { AttributeName: 'PK', AttributeType: 'S' as const },
    { AttributeName: 'SK', AttributeType: 'S' as const },
  ]

  // Main table — with GSI-WeeklyFeatureByStatus
  try {
    await dynamo.send(new CreateTableCommand({
      TableName: MAIN_TABLE,
      KeySchema: keySchema,
      AttributeDefinitions: [
        ...attrDefs,
        { AttributeName: 'featureStatus', AttributeType: 'S' },
        { AttributeName: 'isoWeek',       AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [{
        IndexName: 'GSI-WeeklyFeatureByStatus',
        KeySchema: [
          { AttributeName: 'featureStatus', KeyType: 'HASH' },
          { AttributeName: 'isoWeek',       KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      }],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }

  // Idempotency table — PK-only (no SK)
  try {
    await dynamo.send(new CreateTableCommand({
      TableName: IDEM_TABLE,
      KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'PK', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err
  }
})

afterAll(async () => {
  await dynamo.send(new DeleteTableCommand({ TableName: MAIN_TABLE })).catch(() => {})
  await dynamo.send(new DeleteTableCommand({ TableName: IDEM_TABLE })).catch(() => {})
})

afterEach(async () => {
  for (const table of [MAIN_TABLE, IDEM_TABLE]) {
    const scan = await docClient.send(new ScanCommand({ TableName: table, ProjectionExpression: 'PK, SK' }))
    if (scan.Items?.length) {
      for (const item of scan.Items) {
        const key: Record<string, unknown> = { PK: item['PK'] }
        if (item['SK'] !== undefined) key['SK'] = item['SK']
        await docClient.send(new DeleteCommand({ TableName: table, Key: key }))
      }
    }
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

export const seedItem = (table: string, item: Record<string, unknown>) =>
  docClient.send(new PutCommand({ TableName: table, Item: item }))

export const getItem = async (table: string, key: Record<string, unknown>) => {
  const { GetCommand } = await import('@aws-sdk/lib-dynamodb')
  const result = await docClient.send(new GetCommand({ TableName: table, Key: key }))
  return result.Item ?? null
}

/** Build a minimal SQSEvent with one record whose body is { rawBody, stripeSignature }. */
export const makeSqsEvent = (rawBody: string, stripeSignature = 'sig_test') => ({
  Records: [{
    messageId: `msg-${Date.now()}`,
    body: JSON.stringify({ rawBody, stripeSignature }),
    receiptHandle: 'receipt',
    attributes: {} as never,
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:test-queue',
    awsRegion: 'us-east-1',
  }],
})

/** Build a serialised Stripe event payload string. */
export const makeStripeEvent = (
  id: string,
  type: string,
  dataObject: Record<string, unknown>
): string =>
  JSON.stringify({ id, type, data: { object: dataObject }, livemode: false })
