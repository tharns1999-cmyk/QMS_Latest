import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('documents API', () => {
  let proxy;
  let env;
  const tokens = {};
  const get = async (path, token) => {
    const res = await app.request(path, { headers: { Authorization: `Bearer ${token}` } }, env);
    return { status: res.status, body: await res.json() };
  };
  // Only this file's rows: other test files share the same local D1 and may run first.
  const codes = (body) => body.documents.filter((d) => /^d\d$/.test(d.id)).map((d) => `${d.doc_code}/${d.revision}`);

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('docs-pass');
    const addUser = (id, dept, isDcc = 0) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
      VALUES (?, ?, ?, ?, 'USER', 3, ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, dept, JSON.stringify([dept]), isDcc);
    const addDoc = (id, code, rev, status, dept, scope) => env.DB.prepare(`INSERT INTO documents (id, doc_code, revision, name, doc_type, department, status, access_scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, code, rev, code, code.split('-')[0], dept, status, scope);
    await env.DB.batch([
      addUser('D-QA', 'QA'), addUser('D-PD', 'PD'), addUser('D-DCC', 'DC', 1),
      addDoc('d1', 'SOP-QA-001', '00', 'SUPERSEDED', 'QA', 'DEPT'),
      addDoc('d2', 'SOP-QA-001', '01', 'EFFECTIVE', 'QA', 'DEPT'),
      addDoc('d3', 'FM-QA-001', '00', 'EFFECTIVE', 'QA', 'GENERAL'),
      addDoc('d4', 'WI-PD-001', '00', 'OBSOLETE', 'PD', 'DEPT')
    ]);
    for (const id of ['D-QA', 'D-PD', 'D-DCC']) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'docs-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('lists one status at a time, Active by default', async () => {
    expect(codes((await get('/api/documents', tokens['D-QA'])).body)).toEqual(['FM-QA-001/00', 'SOP-QA-001/01']);
    expect(codes((await get('/api/documents?status=superseded', tokens['D-QA'])).body)).toEqual(['SOP-QA-001/00']);
    expect((await get('/api/documents?status=ALL', tokens['D-QA'])).status).toBe(400);
  });

  it('hides DEPT documents from other departments but not from DCC', async () => {
    expect(codes((await get('/api/documents', tokens['D-PD'])).body)).toEqual(['FM-QA-001/00']);
    expect((await get('/api/documents/d2', tokens['D-PD'])).status).toBe(404);
    expect((await get('/api/documents/d3', tokens['D-PD'])).body.document).toMatchObject({ doc_code: 'FM-QA-001' });
    expect(codes((await get('/api/documents?status=OBSOLETE', tokens['D-DCC'])).body)).toEqual(['WI-PD-001/00']);
    expect((await get('/api/documents', 'bad-token')).status).toBe(401);
  });

  it('sends a long list in pages of 500 and loses none', async () => {
    const insert = env.DB.prepare(`INSERT INTO documents (id, doc_code, revision, name, doc_type, department, status, access_scope)
      VALUES (?, ?, '00', 'x', 'SOP', 'QA', 'OBSOLETE', 'GENERAL')`);
    await env.DB.batch(Array.from({ length: 1001 }, (_, i) => insert.bind(`pg-${i}`, `PG-${String(i).padStart(4, '0')}`)));
    try {
      const ids = [];
      for (let more = true; more; ) {
        const { body } = await get(`/api/documents?status=OBSOLETE&offset=${ids.length}`, tokens['D-DCC']);
        expect(body.documents.length).toBeLessThanOrEqual(500);
        ids.push(...body.documents.map((d) => d.id));
        more = body.more;
      }
      expect(ids.filter((id) => id.startsWith('pg-'))).toHaveLength(1001);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      await env.DB.prepare("DELETE FROM documents WHERE id LIKE 'pg-%'").run();
    }
  });

  it('refuses a second effective revision of the same document', async () => {
    const insert = env.DB.prepare(`INSERT INTO documents (id, doc_code, revision, name, doc_type, department, status)
      VALUES ('d5', 'SOP-QA-001', '02', 'x', 'SOP', 'QA', 'EFFECTIVE')`);
    await expect(insert.run()).rejects.toThrow(/UNIQUE/);
  });
});
