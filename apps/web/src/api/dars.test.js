import { describe, it, expect, vi, afterEach } from 'vitest';
import { toStoreDar, submitDarToApi } from './dars';
import useStore from '../store/useStore';

const users = [{ id: 'req', name: 'ผู้ขอ' }, { id: 'rev', name: 'ผู้ทบทวน' }, { id: 'app', name: 'ผู้อนุมัติ' }];
const row = {
  id: 7, type: 'NEW', doc_code: 'WI-QA-001', doc_type: 'WI', department: 'QA', revision: '00', name: 'ล้างมือ',
  access_scope: 'DEPT', reason: 'เริ่มใช้', status: 'PENDING_REVIEW', requester_id: 'req', reviewer_id: 'rev', approver_id: 'app',
  reviewed_at: null, approved_at: null, completed_at: null, reject_comment: null, file_key: null, created_at: '2026-10-21T01:02:03.000Z'
};
const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('API DAR mapping', () => {
  it('maps API rows to the demo shape the DAR pages read', () => {
    const dar = toStoreDar({ ...row, file_key: 'dars/7/a.pdf' }, users);
    expect(dar).toMatchObject({ id: '7', status: 'UNDER_REVIEW', darNumber: 'DAR-7', reviewerName: 'ผู้ทบทวน', date: '2026-10-21' });
    expect(dar.attachedFile.apiFilePath).toBe('/api/dars/7/file');
    expect(toStoreDar({ ...row, status: 'PENDING_DCC' }, users).status).toBe('APPROVED_WAITING_EFFECTIVE');
  });

  it('marks the stage a rejection happened at', () => {
    const atReview = toStoreDar({ ...row, status: 'REJECTED', reviewed_at: '2026-10-21T02:00:00Z' }, users).workflowSteps;
    expect(atReview.map((s) => s.status)).toEqual(['COMPLETED', 'REJECTED', 'PENDING']);
    const atApproval = toStoreDar({ ...row, status: 'REJECTED', reviewed_at: '2026-10-21T02:00:00Z', approved_at: '2026-10-21T03:00:00Z' }, users).workflowSteps;
    expect(atApproval.map((s) => s.status)).toEqual(['COMPLETED', 'COMPLETED', 'REJECTED']);
  });
});

describe('submitDarToApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the routed signers, uploads the PDF and reloads the list', async () => {
    useStore.setState({ currentUser: { id: 'req', department: 'QA' }, masterUsers: users });
    const fetch = vi.fn((url, init) => {
      if (init?.method === 'POST') return json(201, { dar: row });
      if (init?.method === 'PUT') return json(200, { dar: row });
      return json(200, { dars: [row] });
    });
    vi.stubGlobal('fetch', fetch);
    const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const steps = [{ role: 'REVIEWER', userId: 'rev' }, { role: 'APPROVER', userId: 'app' }];
    const result = await submitDarToApi({ type: 'NEW_DOCUMENT', docCode: 'WI-QA-001', docType: 'WI', department: 'QA', title: 'ล้างมือ', reason: 'เริ่มใช้', workflowSteps: steps, access_control: { scope: 'DEPT_ONLY' } }, file);

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ type: 'NEW', doc_code: 'WI-QA-001', reviewer_id: 'rev', approver_id: 'app', access_scope: 'DEPT' });
    expect(fetch.mock.calls[1][0]).toMatch(/\/api\/dars\/7\/file$/);
    expect(fetch.mock.calls[1][1].body).toBe(file);
    expect(result).toMatchObject({ id: '7', status: 'UNDER_REVIEW' });
  });

  it('returns null and uploads nothing when the server refuses', async () => {
    useStore.setState({ currentUser: { id: 'req', department: 'QA' }, masterUsers: users });
    const fetch = vi.fn(() => json(400, { error: 'ต้องมีระดับอนุมัติ L4 ขึ้นไป' }));
    vi.stubGlobal('fetch', fetch);
    expect(await submitDarToApi({ type: 'OBSOLETE', docCode: 'WI-QA-001', reason: 'เลิกใช้', workflowSteps: [{ role: 'REVIEWER', userId: 'rev' }, { role: 'APPROVER', userId: 'app' }] })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not call the API when no eligible approver exists', async () => {
    useStore.setState({ currentUser: { id: 'req', department: 'QA' }, masterUsers: users });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await submitDarToApi({ type: 'NEW', docCode: 'SOP-QA-009', docType: 'SOP', workflowSteps: [{ role: 'REVIEWER', userId: 'rev' }, { role: 'APPROVER', userId: null }] })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
