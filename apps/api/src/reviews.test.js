import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('periodic review', () => {
  let proxy;
  let env;
  const tokens = {};
  const request = async (method, path, who, body) => {
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };
  const post = (path, who, body = {}) => request('POST', path, who, body);
  const PDF = new TextEncoder().encode('%PDF-1.4 test');
  // Department RVW is this file's own; other test files share the local D1.
  const publish = async (body) => {
    const created = (await post('/api/dars', 'V-REQ', { reason: 'ทดสอบ', reviewer_id: 'V-HOD', approver_id: 'V-APP', department: 'RVW', ...body })).body;
    if (!created.dar) throw new Error(JSON.stringify(created));
    const { dar } = created;
    if (body.type !== 'OBSOLETE') await app.request(`/api/dars/${dar.id}/file`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens['V-REQ']}` }, body: PDF }, env);
    await post(`/api/dars/${dar.id}/decision`, 'V-HOD', { decision: 'APPROVE' });
    return (await post(`/api/dars/${dar.id}/decision`, 'V-APP', { decision: 'APPROVE' })).body.dar;
  };
  const doc = (code) => env.DB.prepare("SELECT * FROM documents WHERE doc_code = ? AND status = 'EFFECTIVE'").bind(code).first();
  const review = (docId, who, body) => post(`/api/documents/${docId}/periodic-review`, who, { outcome: 'NO_CHANGE', reason: 'ยังใช้งานได้ตามเดิม', ...body });
  const newDoc = async (docType) => doc((await publish({ type: 'NEW', doc_type: docType, name: `ทบทวน ${docType}` })).doc_code);

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('rev-pass');
    const users = [['V-REQ', 'RVW', 2], ['V-STAFF', 'RVW', 3], ['V-HOD', 'RVW', 4], ['V-APP', 'RVW', 5], ['V-OTHER', 'OTH', 5]];
    await env.DB.batch(users.map(([id, dept, level]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments)
      VALUES (?, ?, ?, ?, 'USER', ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, level, dept, JSON.stringify([dept]))));
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'rev-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('gives every published document a review cycle by type: 12 months, or 24 for WI and FM', async () => {
    const sop = await newDoc('SD');
    const wi = await newDoc('WI');
    expect(sop.review_cycle_months).toBe(12);
    expect(wi.review_cycle_months).toBe(24);
    const years = (d) => Number(d.next_review_date.slice(0, 4)) - Number(d.effective_date.slice(0, 4));
    expect([years(sop), years(wi)]).toEqual([1, 2]);
  });

  it('NO_CHANGE by a staff member goes to a qualified approver, and the date moves only when it is approved', async () => {
    const d = await newDoc('SD');
    expect((await review(d.id, 'V-OTHER')).status).toBe(404); // a department-only document is hidden from other departments
    expect((await review(d.id, 'V-STAFF', { reason: 'ok' })).status).toBe(400); // reason too short
    const { status, body } = await review(d.id, 'V-STAFF');
    expect(status).toBe(201);
    expect(body.review).toMatchObject({ status: 'PENDING_APPROVAL', reviewer_id: 'V-STAFF', fast_track: 0 });
    // Level 5 of the department, not the level 4 head: the SD matrix asks L5 to approve.
    expect(body.review.approver_id).toBe('V-APP');
    expect((await doc(d.doc_code)).next_review_date).toBe(d.next_review_date);

    expect((await review(d.id, 'V-STAFF')).status).toBe(409); // one open review per document
    const id = body.review.id;
    expect((await post(`/api/periodic-reviews/${id}/decision`, 'V-STAFF', { decision: 'APPROVE' })).status).toBe(403); // below L5 and the submitter
    expect((await post(`/api/periodic-reviews/${id}/decision`, 'V-OTHER', { decision: 'APPROVE' })).status).toBe(403); // other department
    expect((await post(`/api/periodic-reviews/${id}/decision`, 'V-APP', { decision: 'REJECT' })).status).toBe(400); // reason required

    const done = (await post(`/api/periodic-reviews/${id}/decision`, 'V-APP', { decision: 'APPROVE', comment: 'รับทราบ' })).body.review;
    expect(done).toMatchObject({ status: 'COMPLETED', approver_id: 'V-APP' });
    const after = await doc(d.doc_code);
    // One cycle after the date it was due.
    expect(after.next_review_date).toBe(`${Number(d.next_review_date.slice(0, 4)) + 1}${d.next_review_date.slice(4)}`);
    expect(after.last_reviewed_at).toBeTruthy();
    expect((await post(`/api/periodic-reviews/${id}/decision`, 'V-APP', { decision: 'APPROVE' })).status).toBe(409); // already decided
  });

  it('is signed on the spot when the reviewer already holds approver rights', async () => {
    const d = await newDoc('SD');
    const { body } = await review(d.id, 'V-APP');
    expect(body.review).toMatchObject({ status: 'COMPLETED', fast_track: 1, approver_id: 'V-APP' });
    expect((await doc(d.doc_code)).next_review_date).toBe(body.review.new_next_review_date);
    expect(body.review.new_next_review_date).not.toBe(d.next_review_date);
  });

  it('a rejected review can be submitted again; a late review counts one cycle from today', async () => {
    const d = await newDoc('SD');
    await env.DB.prepare("UPDATE documents SET next_review_date = '2020-01-01' WHERE id = ?").bind(d.id).run();
    const { review: first } = (await review(d.id, 'V-STAFF')).body;
    expect((await post(`/api/periodic-reviews/${first.id}/decision`, 'V-APP', { decision: 'REJECT', comment: 'ขอข้อมูลเพิ่ม' })).body.review.status).toBe('REJECTED');
    expect((await doc(d.doc_code)).next_review_date).toBe('2020-01-01');
    const { review: second } = (await review(d.id, 'V-STAFF')).body;
    await post(`/api/periodic-reviews/${second.id}/decision`, 'V-APP', { decision: 'APPROVE' });
    const today = (await env.DB.prepare("SELECT date('now', '+7 hours') AS d").first()).d;
    expect((await doc(d.doc_code)).next_review_date).toBe(`${Number(today.slice(0, 4)) + 1}${today.slice(4)}`);
  });

  it('REVISION_REQUIRED waits for the DAR, locks out a second review, and is released when that DAR is rejected', async () => {
    const d = await newDoc('SD');
    const { review: r } = (await review(d.id, 'V-STAFF', { outcome: 'REVISION_REQUIRED', reason: 'ต้องปรับขั้นตอน' })).body;
    expect(r).toMatchObject({ status: 'AWAITING_ACTION', approver_id: null });
    expect((await doc(d.doc_code)).next_review_date).toBe(d.next_review_date);
    expect((await review(d.id, 'V-STAFF')).status).toBe(409);

    const { dar } = (await post('/api/dars', 'V-REQ', { type: 'REVISION', doc_code: d.doc_code, reason: 'ตามผลทบทวน', reviewer_id: 'V-HOD', approver_id: 'V-APP' })).body;
    expect((await review(d.id, 'V-APP')).status).toBe(409); // the document is locked by the open DAR
    await post(`/api/dars/${dar.id}/decision`, 'V-HOD', { decision: 'REJECT', comment: 'ยังไม่พร้อม' });
    const list = (await request('GET', '/api/periodic-reviews', 'V-STAFF')).body.reviews.filter((x) => x.doc_code === d.doc_code);
    expect(list.map((x) => x.status)).toEqual(['CANCELLED']);
    expect((await review(d.id, 'V-APP')).status).toBe(201);
  });

  it('the department can cancel a review that is stuck; outsiders cannot', async () => {
    const d = await newDoc('SD');
    const { review: r } = (await review(d.id, 'V-STAFF', { outcome: 'OBSOLETE', reason: 'ไม่ใช้แล้ว' })).body;
    expect((await post(`/api/periodic-reviews/${r.id}/cancel`, 'V-OTHER')).status).toBe(403);
    expect((await post(`/api/periodic-reviews/${r.id}/cancel`, 'V-STAFF')).body.review.status).toBe('CANCELLED');
    expect((await post(`/api/periodic-reviews/${r.id}/cancel`, 'V-STAFF')).status).toBe(409);
  });

  it('shows reviews to the department and the people involved only, and audits each step', async () => {
    const d = await newDoc('SD');
    const { review: r } = (await review(d.id, 'V-STAFF')).body;
    const seen = async (who) => (await request('GET', '/api/periodic-reviews', who)).body.reviews.some((x) => x.id === r.id);
    expect([await seen('V-HOD'), await seen('V-OTHER')]).toEqual([true, false]);
    await post(`/api/periodic-reviews/${r.id}/decision`, 'V-APP', { decision: 'APPROVE' });
    const actions = (await env.DB.prepare("SELECT action FROM audit_log WHERE action LIKE 'PERIODIC_REVIEW_%' AND CASE WHEN json_valid(details) THEN json_extract(details, '$.doc_code') END = ?").bind(d.doc_code).all()).results.map((x) => x.action);
    expect(actions.sort()).toEqual(['PERIODIC_REVIEW_APPROVED', 'PERIODIC_REVIEW_SUBMITTED']);
  });
});
