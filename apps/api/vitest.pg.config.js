import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The same test files as vitest.config.js, run against PostgreSQL instead of local D1.
export default defineConfig({
  resolve: { alias: [{ find: /^wrangler$/, replacement: fileURLToPath(new URL('./src/test/pgPlatformProxy.js', import.meta.url)) }] },
  test: {
    include: ['src/**/*.test.js'],
    globalSetup: './scripts/test-migrate-pg.js',
    testTimeout: 30000,
    fileParallelism: false
  }
});
