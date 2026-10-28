import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiBlob, FILE_PURPOSE } from './client';

describe('apiBlob', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tells the server why a file is read, only when asked', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('%PDF', { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    await apiBlob('/api/documents/d1/file');
    await apiBlob('/api/documents/d1/file', { purpose: FILE_PURPOSE.DOWNLOAD });
    await apiBlob('/api/documents/d1/file?x=1', { purpose: FILE_PURPOSE.VIEW });
    expect(fetch.mock.calls.map(([url]) => url.replace(/^.*(?=\/api)/, ''))).toEqual([
      '/api/documents/d1/file',
      '/api/documents/d1/file?purpose=download',
      '/api/documents/d1/file?x=1&purpose=view'
    ]);
  });
});
