import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiGet, apiPost } from './client';

describe('API client when the server cannot be reached', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('turns the browser-level "Failed to fetch" into a Thai message users can act on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiGet('/api/vcc/assets')).rejects.toThrow('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    await expect(apiPost('/api/vcc/assets', {})).rejects.toThrow('ลองใหม่');
  });

  it('keeps the server message for real HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'ไม่มีสิทธิ์' }), { status: 403 })));
    await expect(apiGet('/api/vcc/assets')).rejects.toThrow('ไม่มีสิทธิ์');
  });
});
