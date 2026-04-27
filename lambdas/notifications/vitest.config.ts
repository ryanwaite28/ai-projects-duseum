import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    env: {
      ENVIRONMENT:             'local',
      AWS_REGION:              'us-east-1',
      AWS_ENDPOINT_URL:        'http://localhost:4566',
      AWS_ACCESS_KEY_ID:       'test',
      AWS_SECRET_ACCESS_KEY:   'test',
      DYNAMODB_TABLE_NAME:     'duseum-test-notifications',
      CONFIG_TABLE_NAME:       'unused-config',
      IDEMPOTENCY_TABLE_NAME:  'unused-idempotency',
      S3_MEDIA_BUCKET_NAME:    'unused-bucket',
      CLOUDFRONT_MEDIA_DOMAIN: 'media.test.duseum.com',
      CLOUDFRONT_KEY_PAIR_ID:  'TESTKEYPAIRID',
      COGNITO_USER_POOL_ID:    'us-east-1_testpool',
    },
  },
})
