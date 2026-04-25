# Test Infrastructure

> Reference document — not a spec. No Status or FR coverage fields.
> Describes how integration tests are structured, how MiniStack is used, and how test fixtures work.
> All integration tests across all lambdas follow this pattern. Deviating from it causes test isolation failures.

---

## Test Runner

**Vitest** — every Lambda and the shared package have their own `vitest.config.ts`.

```typescript
// lambdas/{name}/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 15000,          // integration tests hit real (MiniStack) services
    hookTimeout: 30000,
  },
});
```

---

## MiniStack — Local AWS Emulation

**MiniStack** (`nahuelnucera/ministack`) runs at `localhost:4566`. It emulates DynamoDB, S3, SQS, SES, SSM, Secrets Manager, and Cognito.

**Do NOT use `awslocal`** — use the standard `aws` CLI or SDK with `AWS_ENDPOINT_URL=http://localhost:4566`.

### Starting MiniStack for local dev

```bash
# From project root
npx ministack start
# or via docker-compose if configured
```

### SDK client configuration for tests

```typescript
// packages/shared/src/lib/dynamodb.ts (or similar)
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const isTest = process.env.NODE_ENV === 'test' || process.env.IS_LOCAL === 'true';

export const ddbClient = new DynamoDBClient({
  ...(isTest && {
    endpoint: 'http://localhost:4566',
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  }),
});

export const ddb = DynamoDBDocumentClient.from(ddbClient);
```

---

## Integration Test Setup Pattern

Every Lambda that has integration tests follows this pattern in `src/__tests__/setup.ts`:

```typescript
// lambdas/{name}/src/__tests__/setup.ts
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { beforeAll, afterAll, beforeEach } from 'vitest';

const ddbClient = new DynamoDBClient({
  endpoint: 'http://localhost:4566',
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

// Table names mirror production naming; in tests use a unique suffix to avoid conflicts
const MAIN_TABLE = process.env.DYNAMODB_TABLE_NAME ?? 'duseum-test-dynamodb-main';
const IDEMPOTENCY_TABLE = process.env.IDEMPOTENCY_TABLE_NAME ?? 'duseum-test-dynamodb-idempotency';

beforeAll(async () => {
  // Create main table with all required GSIs
  await ddbClient.send(new CreateTableCommand({
    TableName: MAIN_TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
      { AttributeName: 'GSI2PK', AttributeType: 'S' },
      { AttributeName: 'GSI2SK', AttributeType: 'S' },
      { AttributeName: 'GSI3PK', AttributeType: 'S' },
      { AttributeName: 'GSI3SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'GSI2',
        KeySchema: [
          { AttributeName: 'GSI2PK', KeyType: 'HASH' },
          { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'GSI3',
        KeySchema: [
          { AttributeName: 'GSI3PK', KeyType: 'HASH' },
          { AttributeName: 'GSI3SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  }));
});

afterAll(async () => {
  await ddbClient.send(new DeleteTableCommand({ TableName: MAIN_TABLE }));
});

beforeEach(async () => {
  // Scan and delete all items between tests for isolation
  // (For small test datasets — acceptable at test scale)
  // OR use a unique table suffix per test run (preferred for parallel test suites)
});
```

---

## Unit Test Pattern

Unit tests mock the DynamoDB client and external services. They do not require MiniStack.

```typescript
// lambdas/{name}/src/__tests__/some-route.unit.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the shared DynamoDB module
vi.mock('@packages/shared/lib/dynamodb', () => ({
  ddb: {
    send: vi.fn(),
  },
}));

// Mock Secrets Manager
vi.mock('@packages/shared/lib/secrets', () => ({
  getSecret: vi.fn().mockResolvedValue({ stripe_secret_key: 'sk_test_mock' }),
}));

import { ddb } from '@packages/shared/lib/dynamodb';

describe('createViewerProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes viewer profile with correct PK/SK', async () => {
    vi.mocked(ddb.send).mockResolvedValueOnce({});
    await createViewerProfile('user-123', 'test@example.com');
    expect(ddb.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Item: expect.objectContaining({
            PK: 'USER#user-123',
            SK: 'PROFILE#VIEWER',
            status: 'ACTIVE',
          }),
        }),
      }),
    );
  });
});
```

---

## Integration Test Pattern

Integration tests invoke the actual handler function with a seeded DynamoDB state.

```typescript
// lambdas/{name}/src/__tests__/some-route.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../routes/some-route';

// The handler reads DYNAMODB_TABLE_NAME from process.env
// setup.ts sets this to the test table name

describe('POST /artworks — integration', () => {
  beforeEach(async () => {
    // Seed required state (author profile must exist)
    await ddb.send(new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME!,
      Item: {
        PK: 'USER#author-001',
        SK: 'PROFILE#AUTHOR',
        status: 'ACTIVE',
        displayName: 'Test Author',
        connectChargesEnabled: false,
        followerCount: 0,
        subscriberCount: 0,
        pinnedPieceIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        GSI1PK: 'ENTITY#AUTHOR',
        GSI1SK: 'USER#' + new Date().toISOString(),
      },
    }));
  });

  it('creates art piece with correct DynamoDB record', async () => {
    const result = await handler(buildAPIGatewayEvent({
      method: 'POST',
      path: '/artworks',
      body: { title: 'Test Piece', visibility: 'PUBLIC', mimeType: 'image/jpeg' },
      userId: 'author-001',
    }), buildContext(), () => {});

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);

    // Verify DynamoDB record created
    const record = await ddb.send(new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME!,
      Key: { PK: `ART#${body.pieceId}`, SK: 'META' },
    }));
    expect(record.Item).toMatchObject({
      PK: `ART#${body.pieceId}`,
      SK: 'META',
      authorId: 'author-001',
      status: 'DRAFT',
      visibility: 'PUBLIC',
    });
  });
});
```

---

## Test Helper Utilities

```typescript
// packages/shared/src/test-utils/builders.ts (create this if it doesn't exist)

import { APIGatewayProxyEventV2, Context } from 'aws-lambda';

export function buildAPIGatewayEvent(opts: {
  method: string;
  path: string;
  body?: unknown;
  userId?: string;        // injected as requestContext.authorizer.jwt.claims.sub
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${opts.method} ${opts.path}`,
    rawPath: opts.path,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      http: { method: opts.method, path: opts.path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: 'test',
      apiId: 'test',
      authorizer: opts.userId ? {
        jwt: { claims: { sub: opts.userId }, scopes: [] },
      } : undefined,
      domainName: 'localhost',
      domainPrefix: 'localhost',
      requestId: 'test-request-id',
      routeKey: `${opts.method} ${opts.path}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    } as any,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    isBase64Encoded: false,
    pathParameters: opts.pathParameters,
    queryStringParameters: opts.queryStringParameters,
  } as APIGatewayProxyEventV2;
}

export function buildContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:000000000000:function:test',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test',
    logStreamName: '2026/01/01/[$LATEST]test',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}
```

---

## Stripe Webhook Test Pattern

```typescript
// Construct a valid Stripe webhook event for integration tests
import Stripe from 'stripe';

export function buildStripeWebhookEvent(
  type: string,
  data: object,
  secretKey: string = 'whsec_test_secret',
): { body: string; signature: string } {
  const payload = JSON.stringify({
    id: `evt_test_${Date.now()}`,
    object: 'event',
    type,
    data: { object: data },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    api_version: '2022-11-15',
  });

  const stripe = new Stripe(secretKey);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: secretKey,
    timestamp,
  });

  return { body: payload, signature };
}
```

---

## Environment Variables for Tests

Set these in `vitest.config.ts` or `.env.test`:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      IS_LOCAL: 'true',
      AWS_ENDPOINT_URL: 'http://localhost:4566',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      DYNAMODB_TABLE_NAME: 'duseum-test-dynamodb-main',
      IDEMPOTENCY_TABLE_NAME: 'duseum-test-dynamodb-idempotency',
      CONFIG_TABLE_NAME: 'duseum-test-dynamodb-config',
      S3_MEDIA_BUCKET_NAME: 'duseum-test-s3-media',
      CLOUDFRONT_MEDIA_DOMAIN: 'media.test.duseum.com',
      CLOUDFRONT_KEY_PAIR_ID: 'TEST_KEY_PAIR_ID',
      COGNITO_USER_POOL_ID: 'us-east-1_TEST',
      COGNITO_CLIENT_ID: 'test-client-id',
      APP_BASE_URL: 'http://localhost:5173',
    },
  },
});
```
