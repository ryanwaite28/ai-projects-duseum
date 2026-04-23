import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Environment variables injected for all tests.
    // Integration tests require MiniStack at localhost:4566.
    env: {
      AWS_ENDPOINT_URL: 'http://localhost:4566',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      DYNAMODB_TABLE_NAME: 'duseum-dev-dynamodb-main',
      ENVIRONMENT: 'local',
    },
  },
})
