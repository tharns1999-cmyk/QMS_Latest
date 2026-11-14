import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createDiskStore } from './diskStore.js';
import { describeFileStore } from '../test/fileStoreContract.js';

describeFileStore('folder on disk', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qms-files-'));
  return { files: createDiskStore(root), close: () => rmSync(root, { recursive: true, force: true }) };
});

describe('folder on disk: keys cannot leave the folder', () => {
  it('stores a key that looks like a path as an ordinary key', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qms-files-'));
    try {
      const files = createDiskStore(root);
      await files.put('../../escape.txt', 'inside');
      await files.put('/etc/passwd', 'inside too');
      expect(await (await files.get('../../escape.txt')).text()).toBe('inside');
      expect((await files.list({ prefix: '../' })).objects.map((o) => o.key)).toEqual(['../../escape.txt']);
      expect(await files.get('escape.txt')).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
