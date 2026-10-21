import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('external documents (doc_type ED) through the request pipeline', () => {
  let proxy;
  let env;
  const tokens = {};
  const request = async (method, path, who, body) => {
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };
  const post = (path, who, body = {}) => request('POST', path, who, body);
  const PDF = new TextEncoder().encode('%PDF-1.4 test');
  const run = async (body) => {
    const { dar } = (await post('/api/dars', 'E-REQ', { reason: 'ทดสอบ', reviewer_id: 'E-REV', approver_id: 'E-APP', ...body })).body;
    if (body.type !== 'OBSOLETE') await app.request(`/api/dars/${dar.id}/file`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens['E-REQ']}` }, body: PDF }, env);
    await post(`/api/dars/${dar.id}/decision`, 'E-REV', { decision: 'APPROVE' });
    return (await post(`/api/dars/${dar.id}/decision`, body.approver_id || 'E-APP', { decision: 'APPROVE' })).body.dar;
  };
  const doc = (code) => env.DB.prepare("SELECT * FROM documents WHERE doc_code = ? AND status = 'EFFECTIVE'").bind(code).first();

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('ext-pass');
    // Level 6 for the approver: the matrix asks for it on ED in a real deployment; a level above every threshold works either way.
    const users = [['E-REQ', 'EXT', 2], ['E-REV', 'EXT', 4], ['E-APP', 'EXT', 6], ['E-L5', 'EXT', 5]];
    await env.DB.batch(users.map(([id, dept, level]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments)
      VALUES (?, ?, ?, ?, 'USER', ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, level, dept, JSON.stringify([dept]))));
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'ext-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('keeps issuer, edition and review cycle, sets the next review date, and a revision inherits them', async () => {
    expect((await post('/api/dars', 'E-REQ', { type: 'NEW', doc_type: 'ED', department: 'EXT', name: 'x', reason: 'x', reviewer_id: 'E-REV', approver_id: 'E-APP', review_cycle_months: 0 })).status).toBe(400);
    const created = await run({ type: 'NEW', doc_type: 'ED', department: 'EXT', name: 'มาตรฐานภายนอก', effective_date: '2099-03-31', issuer: 'ISO', edition: '2015', review_cycle_months: 6 });
    expect(created.status).toBe('PENDING_DCC'); // approved, waiting for its date
    const code = created.doc_code;
    expect(code).toMatch(/^ED-EXT-\d\d$/);
    await env.DB.prepare('UPDATE dars SET effective_date = ? WHERE id = ?').bind(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), created.id).run();
    await request('GET', '/api/dars', 'E-REQ');
    const first = await doc(code);
    expect(first).toMatchObject({ doc_type: 'ED', ext_issuer: 'ISO', ext_edition: '2015', review_cycle_months: 6 });
    const month = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
    expect(first.next_review_date).toBe(month(first.effective_date, 6));

    const rev = await run({ type: 'REVISION', doc_code: code, edition: '2020' });
    expect(rev.status).toBe('COMPLETED');
    expect(await doc(code)).toMatchObject({ revision: '01', ext_issuer: 'ISO', ext_edition: '2020', review_cycle_months: 6 });
  });

  it('an external document is approved by the department head (L5), but retiring one needs L6', async () => {
    const created = await run({ type: 'NEW', doc_type: 'ED', department: 'EXT', name: 'กฎหมายภายนอก', approver_id: 'E-L5' });
    expect(created.status).toMatch(/PENDING_DCC|COMPLETED/); // an L5 approver was enough
    await env.DB.prepare('UPDATE dars SET effective_date = ? WHERE id = ?').bind(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), created.id).run();
    await request('GET', '/api/dars', 'E-REQ');
    const retire = (approver) => post('/api/dars', 'E-REQ', { type: 'OBSOLETE', doc_code: created.doc_code, reason: 'ยกเลิก', reviewer_id: 'E-REV', approver_id: approver });
    expect((await retire('E-L5')).body.error).toMatch('L6');
    expect((await retire('E-APP')).status).toBe(201);
  });

  it('leaves internal documents without external fields, on the default cycle for their type', async () => {
    const dar = await run({ type: 'NEW', doc_type: 'WI', department: 'EXT', name: 'ภายใน' });
    const wi = await doc(dar.doc_code);
    expect(wi).toMatchObject({ ext_issuer: null, ext_edition: null, review_cycle_months: 24 });
    expect(wi.next_review_date).toBe(`${Number(wi.effective_date.slice(0, 4)) + 2}${wi.effective_date.slice(4)}`);
  });
});
