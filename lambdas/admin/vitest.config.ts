import { defineConfig } from 'vitest/config'
import { htmlAsTextPlugin } from '../../vitest.html-plugin'

export default defineConfig({
  plugins: [htmlAsTextPlugin],
  test: {
    fileParallelism: false,
    globals: false,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    env: {
      ENVIRONMENT:               'local',
      AWS_REGION:                'us-east-1',
      AWS_ENDPOINT_URL:          'http://localhost:4566',
      AWS_ACCESS_KEY_ID:         'test',
      AWS_SECRET_ACCESS_KEY:     'test',
      DYNAMODB_TABLE_NAME:       'duseum-test-admin',
      CONFIG_TABLE_NAME:         'duseum-test-admin-config',
      IDEMPOTENCY_TABLE_NAME:    'unused',
      CLOUDFRONT_MEDIA_DOMAIN:   'media.test.duseum.com',
      COGNITO_USER_POOL_ID:      'us-east-1_testpool',
      COGNITO_CLIENT_ID:         'test-client-id',
      DAILY_FEATURE_RULE_NAME:   'duseum-test-daily-featured-author',
      WEEKLY_ROTATION_RULE_NAME: 'duseum-test-weekly-feature-rotation',
      MEDIA_BUCKET:              'duseum-test-media',
      STRIPE_WEBHOOK_DLQ_URL:    'http://localhost:4566/000000000000/duseum-test-stripe-dlq',
      NOTIFICATION_DLQ_URL:      'http://localhost:4566/000000000000/duseum-test-notifications-dlq',
    },
  },
})
