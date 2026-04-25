import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Set env vars before any module is imported so the shared docClient
    // initialises with MiniStack credentials and endpoint (Section 15.3).
    env: {
      ENVIRONMENT:           'local',
      AWS_REGION:            'us-east-1',
      AWS_ENDPOINT_URL:      'http://localhost:4566',
      AWS_ACCESS_KEY_ID:     'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      DYNAMODB_TABLE_NAME:   'duseum-test-artworks',
      CONFIG_TABLE_NAME:     'duseum-test-artworks-config',
      IDEMPOTENCY_TABLE_NAME:'duseum-test-artworks-idempotency',
      S3_MEDIA_BUCKET:       'duseum-test-artworks-media',
      NOTIFICATION_QUEUE_URL:'http://localhost:4566/000000000000/duseum-test-notifications',
    },
  },
})
