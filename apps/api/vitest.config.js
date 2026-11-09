import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [{
    name: 'worker-font-data',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('.ttf')) {
        const base64 = readFileSync(id).toString('base64');
        return `export default Uint8Array.from(atob('${base64}'), c => c.charCodeAt(0)).buffer;`;
      }
    }
  }],
  test: {
    include: ['src/**/*.test.js'],
    globalSetup: './scripts/test-migrate.js',
    testTimeout: 30000,
    // All test files share one local D1 file, so run them one at a time.
    fileParallelism: false
  }
});
