import { BlobServiceClient } from '@azure/storage-blob';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { describeFileStore } from '../test/fileStoreContract.js';
import { createBlobStore } from './blobStore.js';

// Needs an Azure Blob endpoint: the Azurite emulator, or a storage account kept for tests. Without one the suite is
// reported as skipped, not passed.
//   QMS_TEST_BLOB_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=...;BlobEndpoint=http://127.0.0.1:10099/devstoreaccount1;"
const CONNECTION = process.env.QMS_TEST_BLOB_CONNECTION_STRING;

if (!CONNECTION) {
  describe.skip('file store contract: Azure Blob Storage (set QMS_TEST_BLOB_CONNECTION_STRING to run)', () => {
    it('is skipped', () => {});
  });
} else {
  const service = BlobServiceClient.fromConnectionString(CONNECTION);
  const newContainer = async () => {
    const name = `qms-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await service.getContainerClient(name).create();
    return name;
  };

  let sharedContainer;
  beforeAll(async () => {
    sharedContainer = await newContainer();
  });
  afterAll(async () => {
    await service.getContainerClient(sharedContainer).deleteIfExists();
  });

  describeFileStore('Azure Blob Storage', async () => ({
    files: createBlobStore({ container: sharedContainer, connectionString: CONNECTION }),
    close: async () => {}
  }));

  describe('Azure Blob Storage specifics', () => {
    let files;
    beforeAll(() => {
      files = createBlobStore({ container: sharedContainer, connectionString: CONNECTION });
    });

    it('keeps Thai text in metadata and a Thai file name in the content disposition', async () => {
      await files.put('thai/ใบรับรอง.pdf', new TextEncoder().encode('%PDF'), {
        httpMetadata: { contentType: 'application/pdf', contentDisposition: 'inline; filename="ใบรับรอง สอบเทียบ.pdf"' },
        customMetadata: { uploaded_by: 'สมชาย ใจดี', file_hash: 'ab12', percent: '100% a=b&c' }
      });
      const head = await files.head('thai/ใบรับรอง.pdf');
      expect(head.customMetadata).toEqual({ uploaded_by: 'สมชาย ใจดี', file_hash: 'ab12', percent: '100% a=b&c' });
      expect(head.httpMetadata.contentType).toBe('application/pdf');
      expect(head.httpMetadata.contentDisposition).toContain('filename=');
      expect((await files.list({ prefix: 'thai/' })).objects[0].customMetadata.uploaded_by).toBe('สมชาย ใจดี');
      await files.delete('thai/ใบรับรอง.pdf');
    });

    it('stores a 25 MB file (the upload limit) and returns every byte', async () => {
      const big = new Uint8Array(25 * 1024 * 1024).map((_, i) => (i * 31) % 251);
      await files.put('big/25mb.bin', big);
      const back = new Uint8Array(await (await files.get('big/25mb.bin')).arrayBuffer());
      expect(back.byteLength).toBe(big.byteLength);
      expect(Buffer.compare(Buffer.from(back), Buffer.from(big))).toBe(0);
      await files.delete('big/25mb.bin');
    });

    it('lists more than one page of blobs', async () => {
      const keys = Array.from({ length: 30 }, (_, i) => `many/${String(i).padStart(3, '0')}`);
      for (const key of keys) await files.put(key, 'x');
      expect((await files.list({ prefix: 'many/' })).objects.map((o) => o.key)).toEqual(keys);
      await files.delete(keys);
    });

    it('refuses a key or metadata name Azure would store under another name or reject', async () => {
      for (const key of ['', 'a/../b', 'a//b', 'a/', 'a.', './x']) await expect(files.put(key, 'x')).rejects.toThrow(/cannot be stored/);
      await expect(files.put('ok/key', 'x', { customMetadata: { 'bad-name': '1' } })).rejects.toThrow(/Metadata name/);
    });

    it('stops at start-up when the container is missing', async () => {
      await expect(createBlobStore({ container: 'qms-does-not-exist', connectionString: CONNECTION }).ready()).rejects.toThrow();
      await expect(files.ready()).resolves.toBeUndefined();
    });
  });
}
