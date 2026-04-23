// =============================================================================
// packages/shared/src/db/client.ts
// DynamoDB Document Client — Section 16.2
//
// When AWS_ENDPOINT_URL is set (local dev / MiniStack), all SDK calls route to
// localhost:4566 instead of real AWS. No other code change is needed to support
// both environments.
// =============================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  // When AWS_ENDPOINT_URL is set (local dev), SDK routes to MiniStack.
  // In production Lambda this env var is absent → real AWS endpoint used.
  ...(process.env.AWS_ENDPOINT_URL
    ? { endpoint: process.env.AWS_ENDPOINT_URL }
    : {}),
})

export const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
})

// Table names injected by CDK at deploy time (Section 10.3).
// Asserted non-null: CDK guarantees these are always set.
export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!
export const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME!
export const CONFIG_TABLE_NAME = process.env.CONFIG_TABLE_NAME!
