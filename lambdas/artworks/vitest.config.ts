import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
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
      S3_MEDIA_BUCKET_NAME:       'duseum-test-artworks-media',
      CLOUDFRONT_MEDIA_DOMAIN:    'media.test.duseum.com',
      CLOUDFRONT_KEY_PAIR_ID:     'TESTKEYPAIRID',
      COGNITO_USER_POOL_ID:       'us-east-1_testpool',
      COGNITO_CLIENT_ID:          'test-client-id',
      NOTIFICATION_QUEUE_URL:     'http://localhost:4566/000000000000/duseum-test-notifications',
    },
  },
})
