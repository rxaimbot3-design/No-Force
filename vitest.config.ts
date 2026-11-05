import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    globals: false,
    setupFiles: ['./tests/setup.ts']
  }
})
