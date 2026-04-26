import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    globals: false,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
