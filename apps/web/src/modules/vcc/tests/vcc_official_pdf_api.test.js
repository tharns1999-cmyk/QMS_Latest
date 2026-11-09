import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiBlob } = vi.hoisted(() => ({ apiBlob: vi.fn() }));
vi.mock('../../../api/client', () => ({
  isApiMode: true, apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiBlob
}));

const { fetchApprovedPlanPdf } = await import('../api/vccPlanApi');

describe('Official VCC plan PDF uses the connected API client', () => {
  beforeEach(() => apiBlob.mockReset());

  it('uses the shared authenticated file client and escapes the plan id', async () => {
    const pdf = new Blob(['%PDF-fixture'], { type: 'application/pdf' });
    apiBlob.mockResolvedValue(pdf);
    expect(await fetchApprovedPlanPdf('plan/id')).toBe(pdf);
    expect(apiBlob).toHaveBeenCalledWith('/api/vcc/plans/plan%2Fid/pdf', { purpose: 'view' });
  });

  it('passes the download purpose and preserves API errors', async () => {
    apiBlob.mockRejectedValueOnce(new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลของแผนกนี้'));
    await expect(fetchApprovedPlanPdf('plan', 'download')).rejects.toThrow('ไม่มีสิทธิ์เข้าถึงข้อมูลของแผนกนี้');
    expect(apiBlob).toHaveBeenCalledWith('/api/vcc/plans/plan/pdf', { purpose: 'download' });
  });
});
