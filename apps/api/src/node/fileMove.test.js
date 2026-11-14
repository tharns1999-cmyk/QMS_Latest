import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BlobServiceClient } from '@azure/storage-blob';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBlobStore } from './blobStore.js';
import { createDiskStore } from './diskStore.js';
import { moveFiles, referencedFiles, sha256Of } from './fileMove.js';

const PDF = (text) => new TextEncoder().encode(`%PDF-1.4 ${text}`);
const BLOB = process.env.QMS_TEST_BLOB_CONNECTION_STRING;

// The same checks against a folder store always, and against Azure Blob Storage (Azurite) when one is given.
const targets = [
  [
    'folder store',
    async (dir) => {
      const store = createDiskStore(join(dir, 'target'));
      await store.head('warm-up'); // let the store finish creating its folders before a test can remove them
      return { store, cleanup: async () => {} };
    }
  ]
];
if (BLOB) {
  targets.push([
    'Azure Blob Storage',
    async () => {
      const service = BlobServiceClient.fromConnectionString(BLOB);
      const container = `qms-m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await service.getContainerClient(container).create();
      return { store: createBlobStore({ container, connectionString: BLOB }), cleanup: () => service.getContainerClient(container).deleteIfExists() };
    }
  ]);
}

describe.each(targets)('moving the files into the %s', (_name, open) => {
  let dir;
  let mirror;
  let target;
  const put = (key, bytes) => {
    mkdirSync(dirname(join(mirror, key)), { recursive: true });
    writeFileSync(join(mirror, key), bytes);
  };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'qms-files-'));
    mirror = join(dir, 'mirror');
    mkdirSync(mirror);
    target = await open(dir);
  });
  afterEach(async () => {
    await target.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  it('copies every file, reads each back by hash, and reports what the database refers to', async () => {
    put('dars/D1/a.pdf', PDF('a'));
    put('vcc/certificates/W1/c.pdf', PDF('cert'));
    put('vcc/audit-orphans/P1/x_uncommitted.json', new TextEncoder().encode('{"plan_id":"P1"}'));
    const cert = sha256Of(PDF('cert'));
    const result = await moveFiles({
      sourceDir: mirror,
      store: target.store,
      expected: [
        { key: 'dars/D1/a.pdf', source: 'dars.file_key' },
        { key: 'vcc/certificates/W1/c.pdf', source: 'certificates', sha256: cert.toUpperCase(), size: PDF('cert').byteLength }
      ]
    });
    expect(result.files.map((f) => [f.key, f.action])).toEqual([
      ['dars/D1/a.pdf', 'copied'],
      ['vcc/audit-orphans/P1/x_uncommitted.json', 'copied'],
      ['vcc/certificates/W1/c.pdf', 'copied']
    ]);
    expect(result.missing).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.unreferenced).toEqual(['vcc/audit-orphans/P1/x_uncommitted.json']);
    expect(new Uint8Array(await (await target.store.get('vcc/certificates/W1/c.pdf')).arrayBuffer())).toEqual(PDF('cert'));
    expect((await target.store.head('dars/D1/a.pdf')).httpMetadata.contentType).toBe('application/pdf');
  });

  it('can be run again: files already in place are checked and left alone', async () => {
    put('dars/D1/a.pdf', PDF('a'));
    await moveFiles({ sourceDir: mirror, store: target.store });
    put('dars/D2/b.pdf', PDF('b'));
    const again = await moveFiles({ sourceDir: mirror, store: target.store });
    expect(again.files.map((f) => f.action)).toEqual(['already there', 'copied']);
  });

  it('never overwrites a different file that is already under the same key', async () => {
    put('dars/D1/a.pdf', PDF('original'));
    await target.store.put('dars/D1/a.pdf', PDF('someone else'));
    await expect(moveFiles({ sourceDir: mirror, store: target.store })).rejects.toThrow(/different file/);
    expect(await (await target.store.get('dars/D1/a.pdf')).text()).toBe('%PDF-1.4 someone else');
  });

  it('names a file the database refers to that is not in the mirror, and a file that differs from its recorded hash', async () => {
    put('vcc/certificates/W1/c.pdf', PDF('changed after upload'));
    const result = await moveFiles({
      sourceDir: mirror,
      store: target.store,
      expected: [
        { key: 'vcc/certificates/W1/c.pdf', source: 'certificates', sha256: sha256Of(PDF('what was uploaded')) },
        { key: 'dars/D9/gone.pdf', source: 'dars.file_key' }
      ]
    });
    expect(result.missing).toEqual([{ key: 'dars/D9/gone.pdf', source: 'dars.file_key' }]);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({ key: 'vcc/certificates/W1/c.pdf', recorded: sha256Of(PDF('what was uploaded')), actual: sha256Of(PDF('changed after upload')) });
  });

  it('flags a size that differs from the recorded size', async () => {
    put('vcc/certificates/W1/c.pdf', PDF('abc'));
    const result = await moveFiles({ sourceDir: mirror, store: target.store, expected: [{ key: 'vcc/certificates/W1/c.pdf', source: 's', size: 5 }] });
    expect(result.changed).toHaveLength(1);
  });

  it('refuses an empty mirror, which would look like a finished move of nothing', async () => {
    await expect(moveFiles({ sourceDir: mirror, store: target.store })).rejects.toThrow(/No files found/);
  });
});

describe('what the database refers to', () => {
  it('asks for every column that points at a file, with the hash and size where the database kept them', async () => {
    const asked = [];
    const found = await referencedFiles(async (sql) => {
      asked.push(sql);
      if (sql.includes('FROM vcc_work_order_certificates')) return [{ key: 'vcc/certificates/W1/c.pdf', hash: 'abc', size: 12 }];
      return [{ key: `k${asked.length}` }];
    });
    expect(found).toHaveLength(5);
    expect(asked.join('\n')).toMatch(/documents[\s\S]*dars[\s\S]*vcc_annual_plans[\s\S]*vcc_work_orders[\s\S]*vcc_work_order_certificates/);
    expect(found.at(-1)).toEqual({ key: 'vcc/certificates/W1/c.pdf', source: 'vcc_work_order_certificates.file_key', sha256: 'abc', size: 12 });
    expect(asked.every((sql) => /^SELECT /.test(sql))).toBe(true);
  });
});
