import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('DAR sent back for revision', () => {
  let proxy;
  let env;
  const tokens = {};
  const request = async (method, path, who, body) => {
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };
  const post = (path, who, body = {}) => request('POST', path, who, body);
  const PDF = new TextEncoder().encode('%PDF-1.4 test');
  const attach = (id, who) => app.request(`/api/dars/${id}/file`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens[who]}` }, body: PDF }, env);
  // Department RTN is this file's own; other test files share the local D1.
  const submit = async (extra = {}) => {
    const { dar } = (await post('/api/dars', 'T-REQ', { type: 'NEW', doc_type: 'SD', department: 'RTN', name: 'ส่งกลับ', reason: 'ทดสอบ', reviewer_id: 'T-HOD', approver_id: 'T-APP', ...extra })).body;
    await attach(dar.id, 'T-REQ');
    return dar;
  };
  const get = async (id) => (await request('GET', `/api/dars/${id}`, 'T-REQ')).body.dar;

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('rt-pass');
    const users = [['T-REQ', 'RTN', 2], ['T-HOD', 'RTN', 4], ['T-APP', 'RTN', 5], ['T-OTHER', 'RTN', 2]];
    await env.DB.batch(users.map(([id, dept, level]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments)
      VALUES (?, ?, ?, ?, 'USER', ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, level, dept, JSON.stringify([dept]))));
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'rt-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('the reviewer returns it with a reason; nobody can decide until the requester resubmits', async () => {
    const dar = await submit();
    const url = `/api/dars/${dar.id}/decision`;
    expect((await post(url, 'T-HOD', { decision: 'RETURN' })).status).toBe(400); // needs a reason
    expect((await post(url, 'T-REQ', { decision: 'RETURN', comment: 'x' })).status).toBe(403); // not the reviewer
    const returned = (await post(url, 'T-HOD', { decision: 'RETURN', comment: 'แก้ชื่อเอกสาร' })).body.dar;
    expect(returned).toMatchObject({ status: 'PENDING_REVIEW', awaiting_requester: 1, return_comment: 'แก้ชื่อเอกสาร', returned_by: 'T-HOD', return_count: 1 });
    expect((await post(url, 'T-HOD', { decision: 'APPROVE' })).status).toBe(409);
    expect((await post(url, 'T-HOD', { decision: 'RETURN', comment: 'อีกที' })).status).toBe(409);
  });

  it('only the requester resubmits, can fix the details, and review starts again from the top', async () => {
    const dar = await submit();
    await post(`/api/dars/${dar.id}/decision`, 'T-HOD', { decision: 'APPROVE' });
    await post(`/api/dars/${dar.id}/decision`, 'T-APP', { decision: 'RETURN', comment: 'วันที่ไม่ถูกต้อง' }); // returned at the approval stage
    const waiting = await get(dar.id);
    expect(waiting).toMatchObject({ awaiting_requester: 1, reviewed_at: null, approved_at: null });

    const url = `/api/dars/${dar.id}/resubmit`;
    expect((await post(url, 'T-OTHER')).status).toBe(403);
    expect((await post(url, 'T-REQ', { effective_date: '31/12/2999' })).status).toBe(400);
    const resubmitted = (await post(url, 'T-REQ', { name: 'ชื่อใหม่', reason: 'เหตุผลใหม่', effective_date: '2999-01-01' })).body.dar;
    expect(resubmitted).toMatchObject({ status: 'PENDING_REVIEW', awaiting_requester: 0, name: 'ชื่อใหม่', reason: 'เหตุผลใหม่', effective_date: '2999-01-01', return_count: 1 });
    expect((await post(url, 'T-REQ')).status).toBe(409); // not returned any more

    // Back to the reviewer, then the approver, as a fresh review.
    expect((await post(`/api/dars/${dar.id}/decision`, 'T-APP', { decision: 'APPROVE' })).status).toBe(403);
    expect((await post(`/api/dars/${dar.id}/decision`, 'T-HOD', { decision: 'APPROVE' })).body.dar.status).toBe('PENDING_APPROVAL');
    expect((await post(`/api/dars/${dar.id}/decision`, 'T-APP', { decision: 'APPROVE' })).body.dar.status).toBe('PENDING_DCC');
  });

  it('will not resubmit without a PDF, and a replaced file is what the reviewer then sees', async () => {
    const { dar } = (await post('/api/dars', 'T-REQ', { type: 'NEW', doc_type: 'SD', department: 'RTN', name: 'ไม่มีไฟล์', reason: 'ทดสอบ', reviewer_id: 'T-HOD', approver_id: 'T-APP' })).body;
    await post(`/api/dars/${dar.id}/decision`, 'T-HOD', { decision: 'RETURN', comment: 'ลืมแนบไฟล์' });
    expect((await post(`/api/dars/${dar.id}/resubmit`, 'T-REQ')).status).toBe(409);
    expect((await attach(dar.id, 'T-REQ')).status).toBe(200); // the file route still works while it waits
    expect((await post(`/api/dars/${dar.id}/resubmit`, 'T-REQ')).body.dar.awaiting_requester).toBe(0);
  });

  it('keeps the document locked while it waits, and frees it on withdrawal', async () => {
    const first = await submit();
    await post(`/api/dars/${first.id}/decision`, 'T-HOD', { decision: 'APPROVE' });
    await post(`/api/dars/${first.id}/decision`, 'T-APP', { decision: 'APPROVE' });
    const code = first.doc_code;
    const revision = () => post('/api/dars', 'T-REQ', { type: 'REVISION', doc_code: code, reason: 'แก้ไข', reviewer_id: 'T-HOD', approver_id: 'T-APP' });
    const { dar } = (await revision()).body;
    await post(`/api/dars/${dar.id}/decision`, 'T-HOD', { decision: 'RETURN', comment: 'ปรับก่อน' });
    expect((await revision()).status).toBe(409);
    await post(`/api/dars/${dar.id}/withdraw`, 'T-REQ');
    expect((await revision()).status).toBe(201);
  });

  it('the requester can withdraw a returned DAR, which frees the document; a live one cannot be withdrawn', async () => {
    const dar = await submit();
    expect((await post(`/api/dars/${dar.id}/withdraw`, 'T-REQ')).status).toBe(409); // not returned
    await post(`/api/dars/${dar.id}/decision`, 'T-HOD', { decision: 'RETURN', comment: 'ไม่ชัดเจน' });
    expect((await post(`/api/dars/${dar.id}/withdraw`, 'T-OTHER')).status).toBe(403);
    expect((await post(`/api/dars/${dar.id}/withdraw`, 'T-REQ')).body.dar).toMatchObject({ status: 'REJECTED', awaiting_requester: 0, reject_comment: 'ผู้ขอยกเลิกคำขอ' });
    expect((await post(`/api/dars/${dar.id}/resubmit`, 'T-REQ')).status).toBe(409);
  });

  it('a return is audited with who, at which stage and why, and a plain rejection still ends the DAR', async () => {
    const dar = await submit();
    await post(`/api/dars/${dar.id}/decision`, 'T-HOD', { decision: 'RETURN', comment: 'เหตุผลส่งกลับ' });
    await post(`/api/dars/${dar.id}/resubmit`, 'T-REQ');
    expect((await post(`/api/dars/${dar.id}/decision`, 'T-HOD', { decision: 'REJECT', comment: 'ไม่ผ่าน' })).body.dar.status).toBe('REJECTED');
    const rows = (await env.DB.prepare("SELECT action, details FROM audit_log WHERE action LIKE 'DAR_%' AND json_extract(details, '$.dar_id') = ? ORDER BY id").bind(dar.id).all()).results;
    expect(rows.map((r) => r.action)).toEqual(['DAR_SUBMITTED', 'DAR_FILE_ATTACHED', 'DAR_RETURNED', 'DAR_RESUBMITTED', 'DAR_REJECTED']);
    expect(JSON.parse(rows[2].details)).toMatchObject({ stage: 'REVIEW', comment: 'เหตุผลส่งกลับ' });
  });
});
