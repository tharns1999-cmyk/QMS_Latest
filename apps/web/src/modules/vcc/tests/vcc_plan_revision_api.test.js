import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiPost = vi.fn();
vi.mock('../../../api/client', () => ({ isApiMode: true, apiGet: vi.fn().mockResolvedValue({ tasks: [] }), apiPost, apiPut: vi.fn(), apiBlob: vi.fn(), apiUpload: vi.fn() }));

const { createVccPlanRevision } = await import('../api/vccPlanApi');

describe('VCC plan revision request (connected mode)', () => {
  beforeEach(() => apiPost.mockReset().mockResolvedValue({ plan: { id: 'p2', revision: '02' } }));

  it('posts the reason to the revisions endpoint and returns the new draft plan', async () => {
    const plan = await createVccPlanRevision('plan 1', { revision_reason: 'เพิ่มเครื่องมือ' });
    expect(apiPost).toHaveBeenCalledWith('/api/vcc/plans/plan%201/revisions', { revision_reason: 'เพิ่มเครื่องมือ', title: undefined });
    expect(plan).toEqual({ id: 'p2', revision: '02' });
  });

  it('passes the server refusal through (for example a revision already in progress)', async () => {
    apiPost.mockImplementation((path) => (String(path).endsWith('/revisions') ? Promise.reject(new Error('มีแผนอยู่ในสถานะ DRAFT แล้ว')) : Promise.resolve({})));
    const err = await createVccPlanRevision('p1', { revision_reason: 'x' }).catch((e) => e);
    expect(err.message).toContain('DRAFT');
  });
});
