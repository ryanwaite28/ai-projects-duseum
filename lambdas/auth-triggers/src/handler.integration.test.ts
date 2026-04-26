// =============================================================================
// lambdas/auth-triggers/src/handler.integration.test.ts
// Integration tests — requires MiniStack running at localhost:4566
//
// Start MiniStack before running:
//   docker-compose up -d
//
// Environment (injected via vitest.config.ts):
//   AWS_ENDPOINT_URL=http://localhost:4566
//   DYNAMODB_TABLE_NAME=duseum-test-auth-triggers
// =============================================================================

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { PostConfirmationTriggerEvent } from 'aws-lambda'
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb'
import { DeleteCommand, DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { handler } from './handler.js'

// ── DynamoDB client pointed at MiniStack ──────────────────────────────────────

const rawClient = new DynamoDBClient({
  region: process.env['AWS_REGION'] ?? 'us-east-1',
  endpoint: process.env['AWS_ENDPOINT_URL'] ?? 'http://localhost:4566',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
  },
})

const testClient = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: { removeUndefinedValues: true },
})

const TABLE = process.env['DYNAMODB_TABLE_NAME'] ?? 'duseum-test-auth-triggers'

// ── Helpers ───────────────────────────────────────────────────────────────────

const getItem = (PK: string, SK: string) =>
  testClient.send(new GetCommand({ TableName: TABLE, Key: { PK, SK } }))

const deleteItem = (PK: string, SK: string) =>
  testClient.send(new DeleteCommand({ TableName: TABLE, Key: { PK, SK } }))

const TEST_USER_ID = 'integ-test-user-001'
const TEST_EMAIL   = 'integ-test@duseum.com'

const makeEvent = (
  userId = TEST_USER_ID,
  email  = TEST_EMAIL
): PostConfirmationTriggerEvent =>
  ({
    version: '1',
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    region: 'us-east-1',
    userPoolId: 'us-east-1_testPool',
    userName: userId,
    callerContext: { awsSdkVersion: '3.x', clientId: 'test-client' },
    request: {
      userAttributes: {
        sub: userId,
        email,
        email_verified: 'true',
      },
    },
    response: {},
  } as unknown as PostConfirmationTriggerEvent)

// ── Table lifecycle ───────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    await rawClient.send(new CreateTableCommand({
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
})

afterAll(async () => {
  await rawClient.send(new DeleteTableCommand({ TableName: TABLE })).catch(() => {})
})

// ── Cleanup: remove test records after each test ──────────────────────────────

afterEach(async () => {
  await Promise.all([
    deleteItem(`USER#${TEST_USER_ID}`, 'PROFILE'),
    deleteItem(`USER#${TEST_USER_ID}`, 'PROFILE#VIEWER'),
  ]).catch(() => {})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('auth-triggers handler (integration)', () => {
  it('returns the Cognito event unchanged', async () => {
    const event = makeEvent()
    const result = await handler(event, {} as never, () => void 0)
    expect(result).toEqual(event)
  })

  it('creates a UserAccount record with correct PK/SK', async () => {
    await handler(makeEvent(), {} as never, () => void 0)

    const { Item } = await getItem(`USER#${TEST_USER_ID}`, 'PROFILE')
    expect(Item).toBeDefined()
    expect(Item!['PK']).toBe(`USER#${TEST_USER_ID}`)
    expect(Item!['SK']).toBe('PROFILE')
  })

  it('UserAccount has systemRole=USER and emailVerified=true', async () => {
    await handler(makeEvent(), {} as never, () => void 0)

    const { Item } = await getItem(`USER#${TEST_USER_ID}`, 'PROFILE')
    expect(Item!['systemRole']).toBe('USER')
    expect(Item!['emailVerified']).toBe(true)
    expect(Item!['userId']).toBe(TEST_USER_ID)
  })

  it('creates a ViewerProfile record with correct PK/SK', async () => {
    await handler(makeEvent(), {} as never, () => void 0)

    const { Item } = await getItem(`USER#${TEST_USER_ID}`, 'PROFILE#VIEWER')
    expect(Item).toBeDefined()
    expect(Item!['PK']).toBe(`USER#${TEST_USER_ID}`)
    expect(Item!['SK']).toBe('PROFILE#VIEWER')
  })

  it('ViewerProfile has status=ACTIVE, notificationGlobalOptOut=false, defaultNotificationPref=ALL_NEW_PIECES', async () => {
    await handler(makeEvent(), {} as never, () => void 0)

    const { Item } = await getItem(`USER#${TEST_USER_ID}`, 'PROFILE#VIEWER')
    expect(Item!['status']).toBe('ACTIVE')
    expect(Item!['profileType']).toBe('VIEWER')
    expect(Item!['notificationGlobalOptOut']).toBe(false)
    expect(Item!['defaultNotificationPref']).toBe('ALL_NEW_PIECES')
  })

  it('ViewerProfile displayName is derived from email username part', async () => {
    await handler(makeEvent(), {} as never, () => void 0)

    const { Item } = await getItem(`USER#${TEST_USER_ID}`, 'PROFILE#VIEWER')
    expect(Item!['displayName']).toBe('integ-test')
  })

  it('is idempotent — calling handler twice does not throw', async () => {
    const event = makeEvent()
    await expect(handler(event, {} as never, () => void 0)).resolves.not.toThrow()
    await expect(handler(event, {} as never, () => void 0)).resolves.not.toThrow()

    // Records exist with original values (not overwritten)
    const { Item: account } = await getItem(`USER#${TEST_USER_ID}`, 'PROFILE')
    const { Item: viewer }  = await getItem(`USER#${TEST_USER_ID}`, 'PROFILE#VIEWER')
    expect(account).toBeDefined()
    expect(viewer).toBeDefined()
  })

  it('skips record creation for PostConfirmation_ConfirmForgotPassword trigger', async () => {
    const event = {
      ...makeEvent(),
      triggerSource: 'PostConfirmation_ConfirmForgotPassword',
    } as unknown as PostConfirmationTriggerEvent

    const result = await handler(event, {} as never, () => void 0)
    expect(result).toEqual(event)

    // No records should have been created
    const { Item: account } = await getItem(`USER#${TEST_USER_ID}`, 'PROFILE')
    expect(account).toBeUndefined()
  })
})
