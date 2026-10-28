import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadReviews, applyReviews, decideReviewOnApi, clearReviews } from './reviews';
import useStore from '../store/useStore';

const users = [{ id: 'rev', name: 'ผู้ทบทวน', department: 'QC' }, { id: 'app', name: 'ผู้อนุมัติ', department: 'QC' }];
const doc = { id: 'd1', doc_code: 'WI-QC-01', doc_type: 'WI', revision: '00', status: 'EFFECTIVE', department: 'QC', owner_id: 'rev', effective_date: '2026-01-01', next_review_date: '2026-11-01', review_cycle_months: 24, last_reviewed_at: null };
const review = { id: 3, document_id: 'd1', doc_code: 'WI-QC-01', revision: '00', doc_name: 'ล้างมือ', doc_type: 'WI', department: 'QC', outcome: 'NO_CHANGE', status: 'PENDING_APPROVAL', reason: 'ยังใช้ได้', details: '{"findings":"ไม่พบ"}', reviewer_id: 'rev', approver_id: 'app', fast_track: 0, due_date: '2026-11-01', new_next_review_date: null, decision_comment: null, submitted_at: '2026-10-21T01:00:00.000Z', decided_at: null };
const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));

const setup = async (reviews, me) => {
  vi.stubGlobal('fetch', vi.fn(() => json(200, { reviews })));
  useStore.setState({ currentUser: me, masterUsers: users, documents: [doc], externalDocuments: [], tasks: [], periodicReviewSchedules: [] });
  await loadReviews();
  applyReviews();
};

describe('periodic reviews laid over the documents', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearReviews();
  });

  it('marks a document waiting for approval and gives the approver the task', async () => {
    await setup([review], users[1]);
    expect(useStore.getState().documents[0]).toMatchObject({ review_status: 'PENDING_APPROVAL', pending_review_task_id: 'api-rev-3' });
    const task = useStore.getState().tasks.find((t) => t.type === 'PERIODIC_REVIEW_APPROVAL');
    expect(task).toMatchObject({ id: 'api-rev-3', reviewId: 3, docId: 'd1', assigneeId: 'app' });
    expect(task.payload).toMatchObject({ doc_code: 'WI-QC-01', reviewer_name: 'ผู้ทบทวน', details: { reason: 'ยังใช้ได้', findings: 'ไม่พบ' } });
  });

  it('gives the reviewer no approval task, and the waiting review does not come back as a new one', async () => {
    await setup([review], users[0]);
    const { tasks, periodicReviewSchedules } = useStore.getState();
    expect(tasks.some((t) => t.type === 'PERIODIC_REVIEW_APPROVAL')).toBe(false);
    expect(tasks.some((t) => t.type === 'PERIODIC_REVIEW')).toBe(false);
    expect(periodicReviewSchedules.find((s) => s.documentId === 'd1')).toMatchObject({ status: 'PENDING_APPROVAL' });
  });

  it('builds the history from approved reviews and shows why a rejected one came back', async () => {
    const approved = { ...review, id: 1, status: 'COMPLETED', approver_id: 'app', new_next_review_date: '2028-11-01', decided_at: '2026-10-22T01:00:00.000Z' };
    await setup([approved], users[0]);
    expect(useStore.getState().documents[0].review_history[0]).toMatchObject({ reviewer: 'ผู้ทบทวน', approver: 'ผู้อนุมัติ', outcome: 'NO_CHANGE', nextReviewDate: '2028-11-01', is_fast_track: false });

    const rejected = { ...review, id: 4, status: 'REJECTED', decision_comment: 'ขอข้อมูลเพิ่ม', decided_at: '2026-10-22T01:00:00.000Z' };
    await setup([rejected, approved], users[0]);
    expect(useStore.getState().documents[0]).toMatchObject({ rejection_remarks: 'ขอข้อมูลเพิ่ม' });
    expect(useStore.getState().tasks.find((t) => t.type === 'PERIODIC_REVIEW')).toMatchObject({ rejectionRemarks: 'ขอข้อมูลเพิ่ม' });
  });

  it('calls a withdrawal OBSOLETE_REQUIRED for the review pages', async () => {
    await setup([{ ...review, outcome: 'OBSOLETE', status: 'AWAITING_ACTION', approver_id: null }], users[0]);
    expect(useStore.getState().documents[0]).toMatchObject({ review_status: 'AWAITING_ACTION', periodic_review_outcome: 'OBSOLETE_REQUIRED' });
  });

  it('sends the decision and tells the user when there is nothing waiting', async () => {
    await setup([review], users[1]);
    const fetch = vi.fn((url) => (url.endsWith('/decision') ? json(200, { review: { ...review, status: 'COMPLETED' } }) : json(200, { reviews: [], documents: [], dars: [], copies: [] })));
    vi.stubGlobal('fetch', fetch);
    expect(await decideReviewOnApi({ reviewId: 3, decision: 'APPROVE', comment: 'ok' })).toBe(true);
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/periodic-reviews\/3\/decision$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ decision: 'APPROVE', comment: 'ok' });
    expect(await decideReviewOnApi({ docId: 'nope', decision: 'APPROVE' })).toBe(false);
  });
});
