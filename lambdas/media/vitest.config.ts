import { defineConfig } from 'vitest/config'
import { htmlAsTextPlugin } from '../../vitest.html-plugin'

export default defineConfig({
  plugins: [htmlAsTextPlugin],
  test: {
    fileParallelism: false,
    environment: 'node',
    env: {
      ENVIRONMENT:             'local',
      AWS_REGION:              'us-east-1',
      AWS_ENDPOINT_URL:        'http://localhost:4566',
      AWS_ACCESS_KEY_ID:       'test',
      AWS_SECRET_ACCESS_KEY:   'test',
      DYNAMODB_TABLE_NAME:     'duseum-test-media',
      IDEMPOTENCY_TABLE_NAME:  'unused',
      CONFIG_TABLE_NAME:       'unused',
      S3_MEDIA_BUCKET_NAME:    'duseum-test-media-uploads',
      CLOUDFRONT_MEDIA_DOMAIN: 'media.test.duseum.com',
      COGNITO_USER_POOL_ID:    'us-east-1_testpool',
      COGNITO_CLIENT_ID:       'test-client-id',
    },
  },
})
