import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('DAR workflow API', () => {
  let proxy;
  let env;
  const tokens = {};
  const request = async (method, path, who, body) => {
    const res = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
      body: body && JSON.stringify(body)
    }, env);
    return { status: res.status, body: await res.json() };
  };
  const get = (path, who) => request('GET', path, who);
  const post = (path, who, body = {}) => request('POST', path, who, body);
  const PDF = new TextEncoder().encode('%PDF-1.4 test');
  const upload = async (id, who, body = PDF) => {
    const res = await app.request(`/api/dars/${id}/file`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens[who]}` }, body }, env);
    return { status: res.status, body: await res.json() };
  };
  const download = (path, who) => app.request(path, { headers: { Authorization: `Bearer ${tokens[who]}` } }, env);
  const newDar = (over) => ({ type: 'NEW', doc_type: 'FM', department: 'PD', name: 'วิธีล้างเครื่อง', reason: 'เริ่มใช้', reviewer_id: 'R-REV', approver_id: 'R-APP', ...over });

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('dar-pass');
    const users = [['R-REQ', 'PD', 2, 0], ['R-REV', 'PD', 4, 0], ['R-APP', 'PD', 5, 0], ['R-LOW', 'PD', 3, 0], ['R-DCC', 'DC', 4, 1], ['R-HRQ', 'HR&GA', 2, 0], ['R-HRV', 'HR&GA', 4, 0], ['R-HRA', 'HR&GA', 5, 0]];
    await env.DB.batch(users.map(([id, dept, level, dcc]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
      VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, level, dept, JSON.stringify([dept]), dcc)));
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'dar-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('lists active users for routing without credentials', async () => {
    const { users } = (await get('/api/users', 'R-REQ')).body;
    expect(users.find((u) => u.id === 'R-REV')).toMatchObject({ approval_level: 4, department: 'PD' });
    expect(JSON.stringify(users)).not.toMatch(/password|failed_logins/);
  });

  it('numbers a document in a department whose code has an ampersand, like HR&GA', async () => {
    const hr = { department: 'HR&GA', reviewer_id: 'R-HRV', approver_id: 'R-HRA' };
    const { status, body } = await post('/api/dars', 'R-HRQ', newDar(hr));
    expect(status).toBe(201);
    expect(body.dar.doc_code).toMatch(/^FM-HR&GA-\d\d$/);
    expect((await post('/api/dars', 'R-HRQ', newDar({ ...hr, department: 'HR-GA' }))).status).toBe(400);
  });

  it('refuses a DAR routed to an ineligible reviewer or approver', async () => {
    expect((await post('/api/dars', 'R-REQ', newDar({ reviewer_id: 'R-LOW' }))).body.error).toMatch('L4');
    expect((await post('/api/dars', 'R-REQ', newDar({ reviewer_id: 'R-REQ' }))).body.error).toMatch('ผู้ขอ');
    expect((await post('/api/dars', 'R-REQ', newDar({ approver_id: 'R-REV' }))).body.error).toMatch('ผู้ทบทวน');
    expect((await post('/api/dars', 'R-DCC', newDar())).status).toBe(403);
    expect((await post('/api/dars', 'R-REQ', newDar({ reason: '' }))).status).toBe(400);
  });

  it('runs NEW -> review -> approve (in force at once without a date), then a REVISION supersedes it', async () => {
    const created = await post('/api/dars', 'R-REQ', newDar());
    expect(created.status).toBe(201);
    const { id, doc_code: code } = created.body.dar;

    expect((await post(`/api/dars/${id}/decision`, 'R-APP', { decision: 'APPROVE' })).status).toBe(403); // not the reviewer
    expect((await post(`/api/dars/${id}/decision`, 'R-REV', { decision: 'APPROVE' })).status).toBe(409); // no PDF yet
    expect((await upload(id, 'R-REQ')).status).toBe(200);
    expect((await post(`/api/dars/${id}/decision`, 'R-REV', { decision: 'APPROVE' })).body.dar.status).toBe('PENDING_APPROVAL');
    expect((await post(`/api/dars/${id}/decision`, 'R-REV', { decision: 'APPROVE' })).status).toBe(403);
    expect((await post(`/api/dars/${id}/decision`, 'R-APP', { decision: 'APPROVE' })).body.dar.status).toBe('COMPLETED');
    expect((await get('/api/documents', 'R-REQ')).body.documents.map((d) => `${d.doc_code}/${d.revision}`)).toContain(`${code}/00`);

    const rev = (await post('/api/dars', 'R-REQ', { type: 'REVISION', doc_code: code.toLowerCase(), reason: 'ปรับขั้นตอน', reviewer_id: 'R-REV', approver_id: 'R-APP' })).body.dar;
    expect(rev).toMatchObject({ revision: '01', department: 'PD', doc_type: 'FM' });
    expect((await post('/api/dars', 'R-REQ', { type: 'REVISION', doc_code: code, reason: 'ซ้ำ', reviewer_id: 'R-REV', approver_id: 'R-APP' })).status).toBe(409); // locked while in flight
    await upload(rev.id, 'R-REQ');
    await post(`/api/dars/${rev.id}/decision`, 'R-REV', { decision: 'APPROVE' });
    await post(`/api/dars/${rev.id}/decision`, 'R-APP', { decision: 'APPROVE' });
    const list = async (s) => (await get(`/api/documents?status=${s}`, 'R-REQ')).body.documents.filter((d) => d.doc_code === code).map((d) => d.revision);
    expect(await list('EFFECTIVE')).toEqual(['01']);
    expect(await list('SUPERSEDED')).toEqual(['00']);
    const docId = async (s) => (await get(`/api/documents?status=${s}`, 'R-REQ')).body.documents.find((d) => d.doc_code === code).id;
    const file = await download(`/api/documents/${await docId('EFFECTIVE')}/file`, 'R-REQ');
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(await file.text()).toBe('%PDF-1.4 test');
    expect((await download(`/api/documents/${await docId('SUPERSEDED')}/file`, 'R-REQ')).status).toBe(403);
    expect((await download(`/api/documents/${await docId('SUPERSEDED')}/file`, 'R-DCC')).status).toBe(200);

    const obs = (await post('/api/dars', 'R-REQ', { type: 'OBSOLETE', doc_code: code, reason: 'เลิกใช้', reviewer_id: 'R-REV', approver_id: 'R-APP' })).body.dar;
    await post(`/api/dars/${obs.id}/decision`, 'R-REV', { decision: 'APPROVE' });
    await post(`/api/dars/${obs.id}/decision`, 'R-APP', { decision: 'APPROVE' });
    expect(await list('EFFECTIVE')).toEqual([]);
    expect(await list('OBSOLETE')).toEqual(['01']);

    // Only this test's own requests: other test files share the database.
    const ids = [id, rev.id, obs.id];
    const actions = (await env.DB.prepare(`SELECT action FROM audit_log WHERE (action LIKE 'DAR_%' OR action LIKE 'DOCUMENT_%')
      AND CASE WHEN json_valid(details) THEN COALESCE(json_extract(details, '$.dar_id') IN (${ids.map(() => '?').join(',')}), 0) END`).bind(...ids).all()).results.map((r) => r.action);
    expect(actions.filter((a) => a === 'DAR_REVIEWED')).toHaveLength(3);
    expect(actions).toContain('DOCUMENT_OBSOLETED');
  });

  it('puts a document in force on the requested date, never earlier than approval', async () => {
    expect((await post('/api/dars', 'R-REQ', newDar({ effective_date: '31/12/2027' }))).status).toBe(400);
    const todayTh = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const approve = async (asked) => {
      const { id, doc_code: code } = (await post('/api/dars', 'R-REQ', newDar({ effective_date: asked }))).body.dar;
      await upload(id, 'R-REQ');
      await post(`/api/dars/${id}/decision`, 'R-REV', { decision: 'APPROVE' });
      const dar = (await post(`/api/dars/${id}/decision`, 'R-APP', { decision: 'APPROVE' })).body.dar;
      const doc = () => env.DB.prepare('SELECT effective_date FROM documents WHERE doc_code = ?').bind(code).first();
      return { id, dar, doc };
    };

    const past = await approve('2001-01-01');
    expect(past.dar.status).toBe('COMPLETED');
    expect((await past.doc()).effective_date).toBe(todayTh);

    const future = await approve('2099-01-01');
    expect(future.dar.status).toBe('PENDING_DCC'); // approved, waiting for its date
    expect(await future.doc()).toBeNull();
    await get('/api/dars', 'R-REQ');
    expect(await future.doc()).toBeNull();
    // The date arrives: the next read (or the daily cron) puts it in force.
    await env.DB.prepare('UPDATE dars SET effective_date = ? WHERE id = ?').bind(todayTh, future.id).run();
    expect((await get('/api/dars', 'R-REQ')).body.dars.find((d) => d.id === future.id).status).toBe('COMPLETED');
    expect((await future.doc()).effective_date).toBe(todayTh);
    const audit = await env.DB.prepare("SELECT actor_id, details FROM audit_log WHERE action = 'DOCUMENT_PUBLISHED' AND json_extract(details, '$.dar_id') = ?").bind(future.id).all();
    expect(audit.results).toHaveLength(1);
    expect(audit.results[0].actor_id).toBeNull();
  });

  it('numbers NEW documents on the server, without collisions or reuse', async () => {
    const codes = (await Promise.all([1, 2, 3].map(() => post('/api/dars', 'R-REQ', newDar({ doc_type: 'SD', doc_code: 'SD-PD-01' })))))
      .map((r) => r.body.dar.doc_code);
    expect(codes.sort()).toEqual(['SD-PD-01', 'SD-PD-02', 'SD-PD-03']); // the client's code is ignored
    const last = (await env.DB.prepare("SELECT id FROM dars WHERE doc_code = 'SD-PD-03'").first()).id;
    await post(`/api/dars/${last}/decision`, 'R-REV', { decision: 'REJECT', comment: 'ไม่จำเป็น' });
    expect((await post('/api/dars', 'R-REQ', newDar({ doc_type: 'SD' }))).body.dar.doc_code).toBe('SD-PD-04'); // a rejected number is not reissued
    expect((await post('/api/dars', 'R-REQ', newDar({ department: 'P*' }))).status).toBe(400);
    const audit = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'DAR_SUBMITTED' AND details LIKE '%SD-PD-04%'").first();
    expect(JSON.parse(audit.details)).toMatchObject({ type: 'NEW', doc_code: 'SD-PD-04' });
  });

  it('rejects with a required comment', async () => {
    const dar = (await post('/api/dars', 'R-REQ', newDar())).body.dar;
    expect((await post(`/api/dars/${dar.id}/decision`, 'R-REV', { decision: 'REJECT' })).status).toBe(400);
    expect((await post(`/api/dars/${dar.id}/decision`, 'R-REV', { decision: 'REJECT', comment: 'ขั้นตอนไม่ครบ' })).body.dar).toMatchObject({ status: 'REJECTED', reject_comment: 'ขั้นตอนไม่ครบ' });
    expect((await get(`/api/dars/${dar.id}`, 'R-LOW')).status).toBe(404); // not named on the DAR
    expect((await get(`/api/dars/${dar.id}`, 'R-DCC')).status).toBe(200);
  });

  it('takes a PDF only from the requester and only before review', async () => {
    const dar = (await post('/api/dars', 'R-REQ', newDar())).body.dar;
    expect((await upload(dar.id, 'R-REV')).status).toBe(403);
    expect((await upload(dar.id, 'R-REQ', new TextEncoder().encode('not a pdf'))).status).toBe(400);
    const first = (await upload(dar.id, 'R-REQ')).body.dar.file_key;
    const second = (await upload(dar.id, 'R-REQ')).body.dar.file_key;
    expect(second).not.toBe(first);
    expect(await env.FILES.get(first)).toBeNull(); // the unreviewed file it replaced is gone
    expect((await download(`/api/dars/${dar.id}/file`, 'R-REV')).status).toBe(200);
    expect((await download(`/api/dars/${dar.id}/file`, 'R-LOW')).status).toBe(404);
    await env.FILES.put(`dars/${dar.id}/orphan.pdf`, PDF); // as left by a concurrent upload
    await post(`/api/dars/${dar.id}/decision`, 'R-REV', { decision: 'APPROVE' });
    expect(await env.FILES.get(`dars/${dar.id}/orphan.pdf`)).toBeNull();
    expect(await env.FILES.get(second)).not.toBeNull();
    expect((await upload(dar.id, 'R-REQ')).status).toBe(409);
  });
});
