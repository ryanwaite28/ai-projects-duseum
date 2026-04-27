// =============================================================================
// lambdas/users/src/__tests__/setup.ts
// MiniStack bootstrapping for users-lambda integration tests.
// Prerequisites: MiniStack running at localhost:4566
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
export const TABLE    = 'duseum-test-users'

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
  process.env.CONFIG_TABLE_NAME      = 'unused'
  process.env.IDEMPOTENCY_TABLE_NAME = 'unused'
  process.env.S3_MEDIA_BUCKET_NAME   = 'duseum-test-users-media'
  process.env.CLOUDFRONT_MEDIA_DOMAIN = 'media.test.duseum.com'
  process.env.CLOUDFRONT_KEY_PAIR_ID  = 'TESTKEYPAIRID'
  process.env.COGNITO_USER_POOL_ID   = 'us-east-1_testpool'
  process.env.COGNITO_CLIENT_ID      = 'test-client-id'

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
        { AttributeName: 'visibility#createdAt', AttributeType: 'S' },
        { AttributeName: 'profileType', AttributeType: 'S' },
        { AttributeName: 'createdAt',   AttributeType: 'S' },
        { AttributeName: 'status',      AttributeType: 'S' },
        { AttributeName: 'followedAt',  AttributeType: 'S' },
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
          IndexName: 'GSI-AuthorDirectory',
          KeySchema: [
            { AttributeName: 'profileType', KeyType: 'HASH' },
            { AttributeName: 'createdAt',   KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI-FollowersByAuthor',
          KeySchema: [
            { AttributeName: 'authorId',   KeyType: 'HASH' },
            { AttributeName: 'followedAt', KeyType: 'RANGE' },
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
})

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  headers: opts.userId ? { authorization: `Bearer ${makeToken(opts.userId)}` } : {},
  body: opts.body ? JSON.stringify(opts.body) : undefined,
  pathParameters:        opts.pathParameters ?? {},
  queryStringParameters: opts.queryStringParameters ?? {},
  requestContext: {
    http: { method, path },
    requestId: `test-${Date.now()}`,
  },
})

export const makeCtx = () => ({
  awsRequestId:             'test-aws-req-id',
  functionName:             'users-lambda',
  getRemainingTimeInMillis: () => 30_000,
}) as never
