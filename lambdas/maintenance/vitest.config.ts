import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      ENVIRONMENT:            'local',
      AWS_REGION:             'us-east-1',
      AWS_ENDPOINT_URL:       'http://localhost:4566',
      AWS_ACCESS_KEY_ID:      'test',
      AWS_SECRET_ACCESS_KEY:  'test',
      DYNAMODB_TABLE_NAME:    'duseum-test-maintenance',
      CONFIG_TABLE_NAME:      'duseum-test-maintenance-config',
      IDEMPOTENCY_TABLE_NAME: 'unused',
      COGNITO_USER_POOL_ID:   'us-east-1_testpool',
      DAILY_FEATURE_RULE_NAME:'duseum-test-daily-featured-author',
    },
  },
})
