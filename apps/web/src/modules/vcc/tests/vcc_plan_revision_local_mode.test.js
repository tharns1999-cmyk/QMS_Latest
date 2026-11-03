import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/client', () => ({ isApiMode: false, apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiBlob: vi.fn(), apiUpload: vi.fn() }));

const { createVccPlanRevision } = await import('../api/vccPlanApi');

describe('VCC plan revision in demo mode', () => {
  it('says plainly that a server is needed instead of faking a revision', async () => {
    await expect(createVccPlanRevision('p1', { revision_reason: 'x' })).rejects.toThrow('เชื่อมต่อเซิร์ฟเวอร์');
  });
});
