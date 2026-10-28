import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('controlled copies API', () => {
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
  const post = (path, who, body = {}) => request('POST', path, who, body);
  const PDF = new TextEncoder().encode('%PDF-1.4 test');
  // Departments CCT/CCW are this file's own; other test files share the local D1.
  const dist = [{ department: 'CCT', location_id: 'CCT-OFFICE', location_name: 'CCT Office' }, { department: 'CCW', location_name: 'คลัง 1' }];
  const runDar = async (body) => {
    const { dar } = (await post('/api/dars', 'C-REQ', { reason: 'ทดสอบ', reviewer_id: 'C-REV', approver_id: 'C-APP', ...body })).body;
    if (body.type !== 'OBSOLETE') await app.request(`/api/dars/${dar.id}/file`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens['C-REQ']}` }, body: PDF }, env);
    await post(`/api/dars/${dar.id}/decision`, 'C-REV', { decision: 'APPROVE' });
    expect((await post(`/api/dars/${dar.id}/decision`, 'C-APP', { decision: 'APPROVE' })).body.dar.status).toBe('COMPLETED');
    return dar;
  };
  const copiesOf = async (who, code) => (await request('GET', '/api/controlled-copies', who)).body.copies.filter((c) => c.doc_code === code);
  const state = async (code) => Object.fromEntries((await copiesOf('C-DCC', code)).map((c) => [`${c.revision}/${c.copy_no}`, c.status]));

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('copy-pass');
    const users = [['C-REQ', 'CCT', 2, 0], ['C-REV', 'CCT', 4, 0], ['C-APP', 'CCT', 5, 0], ['C-DCC', 'DC', 4, 1], ['C-WH', 'CCW', 4, 0], ['C-WH3', 'CCW', 3, 0]];
    await env.DB.batch(users.map(([id, dept, level, dcc]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
      VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, level, dept, JSON.stringify([dept]), dcc)));
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'copy-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('refuses a malformed distribution list', async () => {
    const res = await post('/api/dars', 'C-REQ', { type: 'NEW', doc_type: 'FM', department: 'CCT', name: 'x', reason: 'x', reviewer_id: 'C-REV', approver_id: 'C-APP', distributions: [{ department: 'CCT' }] });
    expect(res.status).toBe(400);
  });

  it('issues copies when a revision takes effect, then dispatch, receipt and recall', async () => {
    const { doc_code: code } = await runDar({ type: 'NEW', doc_type: 'FM', department: 'CCT', name: 'สำเนาทดสอบ', distributions: dist });
    expect(await state(code)).toEqual({ '00/01': 'PENDING_ISSUE', '00/02': 'PENDING_ISSUE' });
    const [own, wh] = (await copiesOf('C-DCC', code)).sort((a, b) => a.copy_no.localeCompare(b.copy_no));
    expect(own).toMatchObject({ department: 'CCT', location_name: 'CCT Office', doc_name: 'สำเนาทดสอบ' });

    // Each department sees only its own copies.
    expect((await copiesOf('C-WH', code)).map((c) => c.copy_no)).toEqual(['02']);

    expect((await post(`/api/controlled-copies/${wh.id}/dispatch`, 'C-REQ')).status).toBe(403);
    expect((await post(`/api/controlled-copies/${wh.id}/receive`, 'C-WH')).status).toBe(409); // not dispatched yet
    expect((await post(`/api/controlled-copies/${wh.id}/dispatch`, 'C-DCC')).body.copy.status).toBe('DISPATCHED_PENDING_RECEIPT');
    expect((await post(`/api/controlled-copies/${wh.id}/dispatch`, 'C-DCC')).status).toBe(409);
    expect((await post(`/api/controlled-copies/${wh.id}/receive`, 'C-WH3')).status).toBe(403); // below L4
    expect((await post(`/api/controlled-copies/${wh.id}/receive`, 'C-REV')).status).toBe(403); // other department
    expect((await post(`/api/controlled-copies/${wh.id}/receive`, 'C-WH')).body.copy).toMatchObject({ status: 'ISSUED_ACTIVE', received_by: 'C-WH' });
    expect((await post(`/api/controlled-copies/${wh.id}/bogus`, 'C-DCC')).status).toBe(404);

    // A revision recalls the copy in the field, voids the one never dispatched, and issues its own.
    await runDar({ type: 'REVISION', doc_code: code, distributions: [dist[0]] });
    expect(await state(code)).toEqual({ '00/01': 'VOID', '00/02': 'PENDING_RECALL', '01/01': 'PENDING_ISSUE' });
    expect((await post(`/api/controlled-copies/${wh.id}/recall`, 'C-WH')).status).toBe(403);
    expect((await post(`/api/controlled-copies/${wh.id}/recall`, 'C-DCC', { note: 'ทำลายแล้ว' })).body.copy.status).toBe('RECALLED');

    // Obsoleting the document leaves no copy live.
    await runDar({ type: 'OBSOLETE', doc_code: code });
    expect(await state(code)).toEqual({ '00/01': 'VOID', '00/02': 'RECALLED', '01/01': 'VOID' });

    const actions = (await env.DB.prepare("SELECT action FROM audit_log WHERE action LIKE 'CC_%' AND CASE WHEN json_valid(details) THEN json_extract(details, '$.doc_code') END = ?").bind(code).all()).results.map((r) => r.action);
    expect(actions.sort()).toEqual(['CC_DISPATCHED', 'CC_RECALLED', 'CC_RECEIVED']);
  });
});
