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
  const newDar = (over) => ({ type: 'NEW', doc_code: 'WI-PD-100', doc_type: 'FM', department: 'PD', name: 'วิธีล้างเครื่อง', reason: 'เริ่มใช้', reviewer_id: 'R-REV', approver_id: 'R-APP', ...over });

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('dar-pass');
    const users = [['R-REQ', 'PD', 2, 0], ['R-REV', 'PD', 4, 0], ['R-APP', 'PD', 5, 0], ['R-LOW', 'PD', 3, 0], ['R-DCC', 'DC', 4, 1]];
    await env.DB.batch(users.map(([id, dept, level, dcc]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
      VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, level, dept, JSON.stringify([dept]), dcc)));
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'dar-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('refuses a DAR routed to an ineligible reviewer or approver', async () => {
    expect((await post('/api/dars', 'R-REQ', newDar({ reviewer_id: 'R-LOW' }))).body.error).toMatch('L4');
    expect((await post('/api/dars', 'R-REQ', newDar({ reviewer_id: 'R-REQ' }))).body.error).toMatch('ผู้ขอ');
    expect((await post('/api/dars', 'R-REQ', newDar({ approver_id: 'R-REV' }))).body.error).toMatch('ผู้ทบทวน');
    expect((await post('/api/dars', 'R-DCC', newDar())).status).toBe(403);
    expect((await post('/api/dars', 'R-REQ', newDar({ reason: '' }))).status).toBe(400);
  });

  it('runs NEW -> review -> approve -> publish, then a REVISION supersedes it', async () => {
    const created = await post('/api/dars', 'R-REQ', newDar());
    expect(created.status).toBe(201);
    const id = created.body.dar.id;
    expect((await post('/api/dars', 'R-REQ', newDar())).status).toBe(409); // locked while in flight

    expect((await post(`/api/dars/${id}/decision`, 'R-APP', { decision: 'APPROVE' })).status).toBe(403); // not the reviewer
    expect((await post(`/api/dars/${id}/publish`, 'R-DCC')).status).toBe(409);
    expect((await post(`/api/dars/${id}/decision`, 'R-REV', { decision: 'APPROVE' })).body.dar.status).toBe('PENDING_APPROVAL');
    expect((await post(`/api/dars/${id}/decision`, 'R-REV', { decision: 'APPROVE' })).status).toBe(403);
    expect((await post(`/api/dars/${id}/decision`, 'R-APP', { decision: 'APPROVE' })).body.dar.status).toBe('PENDING_DCC');
    expect((await post(`/api/dars/${id}/publish`, 'R-REQ')).status).toBe(403);
    expect((await post(`/api/dars/${id}/publish`, 'R-DCC')).body.dar.status).toBe('COMPLETED');
    expect((await post(`/api/dars/${id}/publish`, 'R-DCC')).status).toBe(409);
    expect((await get('/api/documents', 'R-REQ')).body.documents.map((d) => `${d.doc_code}/${d.revision}`)).toContain('WI-PD-100/00');

    const rev = (await post('/api/dars', 'R-REQ', { type: 'REVISION', doc_code: 'wi-pd-100', reason: 'ปรับขั้นตอน', reviewer_id: 'R-REV', approver_id: 'R-APP' })).body.dar;
    expect(rev).toMatchObject({ revision: '01', department: 'PD', doc_type: 'FM' });
    await post(`/api/dars/${rev.id}/decision`, 'R-REV', { decision: 'APPROVE' });
    await post(`/api/dars/${rev.id}/decision`, 'R-APP', { decision: 'APPROVE' });
    expect((await post(`/api/dars/${rev.id}/publish`, 'R-DCC')).status).toBe(200);
    const list = async (s) => (await get(`/api/documents?status=${s}`, 'R-REQ')).body.documents.filter((d) => d.doc_code === 'WI-PD-100').map((d) => d.revision);
    expect(await list('EFFECTIVE')).toEqual(['01']);
    expect(await list('SUPERSEDED')).toEqual(['00']);

    const obs = (await post('/api/dars', 'R-REQ', { type: 'OBSOLETE', doc_code: 'WI-PD-100', reason: 'เลิกใช้', reviewer_id: 'R-REV', approver_id: 'R-APP' })).body.dar;
    await post(`/api/dars/${obs.id}/decision`, 'R-REV', { decision: 'APPROVE' });
    await post(`/api/dars/${obs.id}/decision`, 'R-APP', { decision: 'APPROVE' });
    expect((await post(`/api/dars/${obs.id}/publish`, 'R-DCC')).status).toBe(200);
    expect(await list('EFFECTIVE')).toEqual([]);
    expect(await list('OBSOLETE')).toEqual(['01']);

    const actions = (await env.DB.prepare("SELECT action FROM audit_log WHERE action LIKE 'DAR_%' OR action LIKE 'DOCUMENT_%'").all()).results.map((r) => r.action);
    expect(actions.filter((a) => a === 'DAR_REVIEWED')).toHaveLength(3);
    expect(actions).toContain('DOCUMENT_OBSOLETED');
  });

  it('rejects with a required comment and frees the document lock', async () => {
    const dar = (await post('/api/dars', 'R-REQ', newDar({ doc_code: 'WI-PD-200' }))).body.dar;
    expect((await post(`/api/dars/${dar.id}/decision`, 'R-REV', { decision: 'REJECT' })).status).toBe(400);
    expect((await post(`/api/dars/${dar.id}/decision`, 'R-REV', { decision: 'REJECT', comment: 'ขั้นตอนไม่ครบ' })).body.dar).toMatchObject({ status: 'REJECTED', reject_comment: 'ขั้นตอนไม่ครบ' });
    expect((await post('/api/dars', 'R-REQ', newDar({ doc_code: 'WI-PD-200' }))).status).toBe(201);
    expect((await get(`/api/dars/${dar.id}`, 'R-LOW')).status).toBe(404); // not named on the DAR
    expect((await get(`/api/dars/${dar.id}`, 'R-DCC')).status).toBe(200);
  });
});
