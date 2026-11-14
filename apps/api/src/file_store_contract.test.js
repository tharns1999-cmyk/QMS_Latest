import { getPlatformProxy } from 'wrangler';
import { describeFileStore } from './test/fileStoreContract.js';

// Cloudflare R2 under vitest.config.js; the in-memory stand-in under vitest.pg.config.js.
describeFileStore('bucket bound to the Worker', async () => {
  const proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
  return { files: proxy.env.FILES, close: () => proxy.dispose() };
});
