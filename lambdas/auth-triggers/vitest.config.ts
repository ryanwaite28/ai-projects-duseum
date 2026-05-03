import { defineConfig } from 'vitest/config'
import { htmlAsTextPlugin } from '../../vitest.html-plugin'

export default defineConfig({
  plugins: [htmlAsTextPlugin],
  test: {
    fileParallelism: false,
    globals: false,
    environment: 'node',
    env: {
      AWS_ENDPOINT_URL:      'http://localhost:4566',
      AWS_REGION:            'us-east-1',
      AWS_ACCESS_KEY_ID:     'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      DYNAMODB_TABLE_NAME:   'duseum-test-auth-triggers',
      ENVIRONMENT:           'local',
    },
  },
})
