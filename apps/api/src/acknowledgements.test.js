import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('acknowledgement', () => {
  let proxy;
  let env;
  const tokens = {};
  const request = async (method, path, who, body) => {
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };
  const post = (path, who, body = {}) => request('POST', path, who, body);
  const PDF = new TextEncoder().encode('%PDF-1.4 test');
  // Department ACK is this file's own; other test files share the local D1.
  const publish = async (body) => {
    const created = await post('/api/dars', 'K-REQ', { type: 'NEW', doc_type: 'SD', name: 'รับทราบ', reason: 'ทดสอบ', reviewer_id: 'K-HOD', approver_id: 'K-APP', department: 'ACK', ...body });
    if (!created.body.dar) return created;
    const { dar } = created.body;
    await app.request(`/api/dars/${dar.id}/file`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens['K-REQ']}` }, body: PDF }, env);
    await post(`/api/dars/${dar.id}/decision`, 'K-HOD', { decision: 'APPROVE' });
    await post(`/api/dars/${dar.id}/decision`, 'K-APP', { decision: 'APPROVE' });
    return { status: 201, body: { dar: (await request('GET', `/api/dars/${dar.id}`, 'K-REQ')).body.dar } };
  };
  const mine = async (who) => (await request('GET', '/api/acknowledgements', who)).body.acknowledgements;

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('ack-pass');
    const users = [['K-REQ', 'ACK', 2], ['K-HOD', 'ACK', 4], ['K-APP', 'ACK', 5], ['K-READ1', 'ACK', 2], ['K-READ2', 'OTH', 2], ['K-OTHER', 'OTH', 2]];
    await env.DB.batch(users.map(([id, dept, level]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments)
      VALUES (?, ?, ?, ?, 'USER', ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, level, dept, JSON.stringify([dept]))));
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'ack-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('rejects a bad list of people to acknowledge', async () => {
    expect((await publish({ ack_user_ids: ['nobody'] })).status).toBe(400);
    expect((await publish({ ack_user_ids: ['K-REQ'] })).status).toBe(400); // the requester cannot acknowledge their own request
    expect((await publish({ ack_user_ids: 'K-READ1' })).body.dar).toMatchObject({ ack_user_ids: null }); // not an array: ignored
  });

  it('opens one acknowledgement per named person when the document takes effect, and each sees only their own', async () => {
    const { body } = await publish({ ack_user_ids: ['K-READ1', 'K-READ2', 'K-READ1'] });
    const dar = body.dar;
    expect(dar.status).toBe('COMPLETED');
    const forDar = async (who) => (await mine(who)).filter((a) => a.dar_id === dar.id);
    expect((await forDar('K-READ1')).map((a) => [a.user_id, a.status, a.doc_code])).toEqual([['K-READ1', 'PENDING', dar.doc_code]]);
    expect((await forDar('K-READ2')).length).toBe(1);
    expect((await forDar('K-REQ')).length).toBe(2); // the requester follows everyone
    expect((await forDar('K-OTHER')).length).toBe(0);
  });

  it('waits for the effective date before asking anyone', async () => {
    const { body } = await publish({ ack_user_ids: ['K-READ1'], effective_date: '2999-01-01' });
    expect(body.dar.status).toBe('PENDING_DCC');
    expect((await mine('K-READ1')).filter((a) => a.dar_id === body.dar.id)).toEqual([]);
  });

  it('only the named person can acknowledge, once, and it is audited', async () => {
    const { body } = await publish({ ack_user_ids: ['K-READ1'] });
    const [ack] = (await mine('K-READ1')).filter((a) => a.dar_id === body.dar.id);
    expect((await post(`/api/acknowledgements/${ack.id}/acknowledge`, 'K-READ2')).status).toBe(403);
    expect((await post(`/api/acknowledgements/${ack.id}/acknowledge`, 'K-REQ')).status).toBe(403);
    expect((await post('/api/acknowledgements/999999/acknowledge', 'K-READ1')).status).toBe(404);
    const done = await post(`/api/acknowledgements/${ack.id}/acknowledge`, 'K-READ1');
    expect(done.body.acknowledgement).toMatchObject({ status: 'ACKNOWLEDGED', user_id: 'K-READ1' });
    expect(done.body.acknowledgement.acknowledged_at).toBeTruthy();
    expect((await post(`/api/acknowledgements/${ack.id}/acknowledge`, 'K-READ1')).status).toBe(409);
    const audited = await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'DOCUMENT_ACKNOWLEDGED' AND json_extract(details, '$.acknowledgement_id') = ?").bind(ack.id).first();
    expect(audited.n).toBe(1);
  });
});
