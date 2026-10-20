import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    globalSetup: './scripts/test-migrate.js',
    testTimeout: 30000
  }
});
