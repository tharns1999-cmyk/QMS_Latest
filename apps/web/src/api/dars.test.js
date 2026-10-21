import { describe, it, expect, vi, afterEach } from 'vitest';
import { toStoreDar, toTask, submitDarToApi, decideTask, loadDars, resubmitDarOnApi, withdrawDarOnApi } from './dars';
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
    expect(toStoreDar({ ...row, effective_date: '2027-01-01' }, users).effectiveDate).toBe('2027-01-01');
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

describe('API DAR tasks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('derives the pending task from the DAR status', () => {
    expect(toTask(row, users)).toMatchObject({ id: 'api-dar-7-review', type: 'Review', assigneeId: 'rev', darId: '7', requesterId: 'req' });
    expect(toTask({ ...row, status: 'PENDING_APPROVAL' }, users)).toMatchObject({ type: 'Approve', assigneeId: 'app' });
    // Publishing is any DCC member's job, so only a DCC viewer gets the task.
    expect(toTask({ ...row, status: 'PENDING_DCC' }, users, { id: 'dcc', isDcc: true })).toBeNull(); // waits for its date, no one's task
    expect(toTask({ ...row, status: 'PENDING_DCC' }, users, { id: 'req' })).toBeNull();
    expect(toTask({ ...row, status: 'COMPLETED' }, users, { id: 'dcc', isDcc: true })).toBeNull();
  });

  it('sends a send-back as RETURN and keeps the page open on refusal', async () => {
    useStore.setState({ currentUser: { id: 'rev' }, masterUsers: users, tasks: [toTask(row, users)] });
    const fetch = vi.fn((url, init) => (init?.method === 'POST' ? json(409, { error: 'คำขอนี้ถูกพิจารณาไปแล้ว' }) : json(200, { dars: [] })));
    vi.stubGlobal('fetch', fetch);
    await expect(decideTask('api-dar-7-review', 'RETURN', 'แก้ขั้นตอน')).rejects.toThrow('ถูกพิจารณาไปแล้ว');
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/dars\/7\/decision$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ decision: 'RETURN', comment: 'แก้ขั้นตอน' });
    expect(useStore.getState().tasks).toEqual([]); // reloaded, so the stale task is gone
  });
});

describe('a DAR sent back to its requester', () => {
  afterEach(() => vi.unstubAllGlobals());
  const returned = { ...row, awaiting_requester: 1, returned_at: '2026-10-22T02:00:00.000Z', returned_by: 'rev', return_comment: 'แก้ชื่อ', return_count: 1 };

  it("shows as RETURNED_FOR_REVISION with who and why, and is the requester's task, not the reviewer's", () => {
    expect(toStoreDar(returned, users)).toMatchObject({ status: 'RETURNED_FOR_REVISION', apiStatus: 'PENDING_REVIEW', returnReason: 'แก้ชื่อ', returnedBy: 'ผู้ทบทวน', awaitingRequester: true });
    expect(toStoreDar(row, users).status).toBe('UNDER_REVIEW');
    expect(toTask(returned, users)).toMatchObject({ id: 'api-dar-7-revise', type: 'Revise', assigneeId: 'req', returnReason: 'แก้ชื่อ', returnedBy: 'ผู้ทบทวน' });
    expect(toTask(row, users)).toMatchObject({ type: 'Review', assigneeId: 'rev' });
  });

  it('resubmits with the fixed details and the new file, and withdraws', async () => {
    const fetch = vi.fn((url, init) => (init?.method ? json(200, {}) : json(200, { dars: [] })));
    vi.stubGlobal('fetch', fetch);
    useStore.setState({ currentUser: { id: 'req' }, masterUsers: users, dars: [], tasks: [], timeline: [] });
    const file = new Blob(['%PDF-1.4']);
    expect(await resubmitDarOnApi({ apiId: 7 }, { name: 'ใหม่', reason: 'เหตุผล', effectiveDate: '2026-12-01', file })).toBe(true);
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/dars\/7\/file$/);
    expect(fetch.mock.calls[1][0]).toMatch(/\/api\/dars\/7\/resubmit$/);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ name: 'ใหม่', reason: 'เหตุผล', effective_date: '2026-12-01' });
    expect(await withdrawDarOnApi({ apiId: 7 })).toBe(true);
    expect(fetch.mock.calls.some(([url]) => /\/api\/dars\/7\/withdraw$/.test(url))).toBe(true);

    vi.stubGlobal('fetch', vi.fn(() => json(409, { error: 'คำขอนี้ไม่ได้ถูกส่งกลับ' })));
    expect(await resubmitDarOnApi({ apiId: 7 }, { reason: 'x' })).toBe(false);
  });

  it('puts the return on the DAR timeline', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { dars: [returned] })));
    useStore.setState({ currentUser: { id: 'req' }, masterUsers: users, dars: [], tasks: [], timeline: [] });
    await loadDars();
    expect(useStore.getState().timeline.map((t) => [t.action, t.user, t.comment])).toEqual([['Created', 'ผู้ขอ', undefined], ['Returned', 'ผู้ทบทวน', 'แก้ชื่อ']]);
  });
});

describe('loadDars', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the drafts saved in this browser when it reads the server list', async () => {
    useStore.setState({ currentUser: { id: 'req' }, masterUsers: users, dars: [{ id: 'draft_1', status: 'DRAFT', isDraft: true, requesterId: 'req' }, { id: '99', status: 'UNDER_REVIEW' }] });
    vi.stubGlobal('fetch', vi.fn(() => json(200, { dars: [row] })));
    await loadDars();
    expect(useStore.getState().dars.map((d) => d.id)).toEqual(['draft_1', '7']);
    expect(useStore.getState().darRequests).toHaveLength(2);
  });
});
