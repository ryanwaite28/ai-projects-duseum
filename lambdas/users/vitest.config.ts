import { defineConfig } from 'vitest/config'
import { htmlAsTextPlugin } from '../../vitest.html-plugin'

export default defineConfig({
  plugins: [htmlAsTextPlugin],
  test: {
    fileParallelism: false,
    env: {
      ENVIRONMENT:             'local',
      AWS_REGION:              'us-east-1',
      AWS_ENDPOINT_URL:        'http://localhost:4566',
      AWS_ACCESS_KEY_ID:       'test',
      AWS_SECRET_ACCESS_KEY:   'test',
      DYNAMODB_TABLE_NAME:     'duseum-test-users',
      CONFIG_TABLE_NAME:       'unused',
      IDEMPOTENCY_TABLE_NAME:  'unused',
      S3_MEDIA_BUCKET_NAME:    'duseum-test-users-media',
      CLOUDFRONT_MEDIA_DOMAIN: 'media.test.duseum.com',
      CLOUDFRONT_KEY_PAIR_ID:  'TESTKEYPAIRID',
      COGNITO_USER_POOL_ID:    'us-east-1_testpool',
    },
  },
})
