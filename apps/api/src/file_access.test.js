import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('who opened or downloaded a file is audited', () => {
  let proxy;
  let env;
  const tokens = {};
  const PDF = new TextEncoder().encode('%PDF-1.4 access');
  const open = (path, who) => app.request(path, { headers: { Authorization: `Bearer ${tokens[who]}` } }, env);
  const rows = async (action, id) => (await env.DB.prepare('SELECT actor_id, details FROM audit_log WHERE action = ? AND json_extract(details, \'$.id\') = ? ORDER BY id').bind(action, id).all()).results
    .map((r) => ({ actor: r.actor_id, ...JSON.parse(r.details) }));

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('fa-pass');
    // Department FAX is this file's own; other test files share the local D1.
    const users = [['FA-OWN', 'FAX', 0], ['FA-OUT', 'FAY', 0], ['FA-DCC', 'DC', 1]];
    await env.DB.batch([
      ...users.map(([id, dept, dcc]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES (?, ?, ?, ?, 'USER', 3, ?, ?, ?)`).bind(id, id, `${id}@test.local`, hash, dept, JSON.stringify([dept]), dcc)),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th) VALUES ('FAX', 'x'), ('FAY', 'y')"),
      env.DB.prepare(`INSERT INTO documents (id, doc_code, revision, name, doc_type, department, status, access_scope, file_key) VALUES
        ('fa-doc', 'WI-FAX-01', '00', 'x', 'WI', 'FAX', 'EFFECTIVE', 'DEPT', 'files/fa-doc.pdf'),
        ('fa-nofile', 'WI-FAX-02', '00', 'x', 'WI', 'FAX', 'EFFECTIVE', 'DEPT', 'files/missing.pdf')`)
    ]);
    await env.FILES.put('files/fa-doc.pdf', PDF);
    for (const [id] of users) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@test.local`, password: 'fa-pass' }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('records a view by default and a download when the web says so, each with who and which revision', async () => {
    expect((await open('/api/documents/fa-doc/file', 'FA-OWN')).status).toBe(200);
    expect((await open('/api/documents/fa-doc/file?purpose=download', 'FA-OWN')).status).toBe(200);
    expect((await open('/api/documents/fa-doc/file?purpose=view', 'FA-DCC')).status).toBe(200);
    expect(await rows('DOCUMENT_VIEWED', 'fa-doc')).toEqual([
      { actor: 'FA-OWN', source: 'document', id: 'fa-doc', doc_code: 'WI-FAX-01', revision: '00', status: 'EFFECTIVE' },
      { actor: 'FA-DCC', source: 'document', id: 'fa-doc', doc_code: 'WI-FAX-01', revision: '00', status: 'EFFECTIVE' }
    ]);
    expect(await rows('DOCUMENT_DOWNLOADED', 'fa-doc')).toEqual([expect.objectContaining({ actor: 'FA-OWN', doc_code: 'WI-FAX-01' })]);
  });

  it('refuses an unknown purpose without serving or logging, and logs nothing for a hidden or missing file', async () => {
    const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('DOCUMENT_VIEWED', 'DOCUMENT_DOWNLOADED')").first()).n;
    expect((await open('/api/documents/fa-doc/file?purpose=copy', 'FA-OWN')).status).toBe(400);
    expect((await open('/api/documents/fa-doc/file', 'FA-OUT')).status).toBe(404); // another department cannot see it
    expect((await open('/api/documents/fa-nofile/file', 'FA-OWN')).status).toBe(404); // file missing from storage
    expect((await open('/api/documents/fa-doc/file', 'nobody')).status).toBe(401);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('DOCUMENT_VIEWED', 'DOCUMENT_DOWNLOADED')").first()).n).toBe(before);
  });

  it('the audit export for the DCC shows the opens', async () => {
    const csv = await (await open('/api/audit-log?format=csv&action=DOCUMENT_DOWNLOADED', 'FA-DCC')).text();
    expect(csv).toContain('DOCUMENT_DOWNLOADED');
    expect(csv).toContain('WI-FAX-01');
  });
});
