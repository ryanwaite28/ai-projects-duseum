import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Set env vars before any module is imported so the shared docClient
    // and TABLE_NAME initialise correctly (vi.mock factory runs before beforeAll).
    env: {
      ENVIRONMENT:            'local',
      AWS_REGION:             'us-east-1',
      AWS_ENDPOINT_URL:       'http://localhost:4566',
      AWS_ACCESS_KEY_ID:      'test',
      AWS_SECRET_ACCESS_KEY:  'test',
      DYNAMODB_TABLE_NAME:    'duseum-test-webhook-main',
      IDEMPOTENCY_TABLE_NAME: 'duseum-test-webhook-idempotency',
      CONFIG_TABLE_NAME:      'unused',
    },
  },
})
