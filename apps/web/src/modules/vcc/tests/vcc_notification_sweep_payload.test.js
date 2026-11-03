import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiPost = vi.fn();
vi.mock('../../../api/client', () => ({ isApiMode: true, apiGet: vi.fn(), apiPost, apiPut: vi.fn(), apiBlob: vi.fn(), apiUpload: vi.fn() }));

const { triggerVccNotificationSweep } = await import('../api/vccNotificationApi');

describe('VCC manual notification sweep request', () => {
  beforeEach(() => apiPost.mockReset().mockResolvedValue({ success: true }));

  it('sends the date as now_date, the name the API reads (a camelCase key is silently ignored)', async () => {
    await triggerVccNotificationSweep('2026-11-02');
    expect(apiPost).toHaveBeenCalledWith('/api/vcc/notifications/sweep', { now_date: '2026-11-02' });
  });

  it('sends no date by default so the server uses today in Bangkok', async () => {
    await triggerVccNotificationSweep();
    expect(apiPost).toHaveBeenCalledWith('/api/vcc/notifications/sweep', { now_date: null });
  });
});
