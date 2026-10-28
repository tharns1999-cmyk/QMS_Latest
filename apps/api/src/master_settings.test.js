import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('master data kept as settings: document types, SLA, signatures', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'ms-pass-123456';
  const call = async (method, path, who, body) => {
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const types = [
    { code: 'ZQ', nameTh: 'ประเภทปิด', status: 'INACTIVE' },
    { code: 'ZO', nameTh: 'ประเภทเปิด', status: 'ACTIVE' }
  ];

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th) VALUES ('MSX', 'แผนกทดสอบ')"),
      ...[['MS-DCC', 1], ['MS-USER', 0]].map(([id, dcc]) => env.DB.prepare(
        `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
         VALUES (?, ?, ?, ?, 'USER', 3, 'MSX', '["MSX"]', ?)`).bind(id, id, `${id}@ms.local`, hash, dcc))
    ]);
    for (const id of ['MS-DCC', 'MS-USER']) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@ms.local`, password: PASSWORD }) }, env);
      tokens[id] = (await res.json()).token;
    }
  });

  // The settings and matrix rows are shared with the other test files, so put them back.
  afterAll(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM settings WHERE key IN ('document_types', 'sla_settings')"),
      env.DB.prepare("DELETE FROM approval_matrix WHERE doc_type IN ('ZQ', 'ZO')")
    ]);
    await proxy?.dispose();
  });

  it('only DCC edits the document-type list; a new type gets a matrix row; a closed type cannot start a new document', async () => {
    expect((await call('GET', '/api/settings/document-types', 'MS-USER')).body.documentTypes).toBeNull();
    expect((await call('PUT', '/api/settings/document-types', 'MS-USER', { documentTypes: types })).status).toBe(403);
    expect((await call('PUT', '/api/settings/document-types', 'MS-DCC', { documentTypes: [{ code: 'bad code', nameTh: 'x' }] })).status).toBe(400);
    expect((await call('PUT', '/api/settings/document-types', 'MS-DCC', { documentTypes: [types[1], types[1]] })).status).toBe(400);

    expect((await call('PUT', '/api/settings/document-types', 'MS-DCC', { documentTypes: types })).status).toBe(200);
    expect((await call('GET', '/api/settings/document-types', 'MS-USER')).body.documentTypes).toHaveLength(2);
    expect((await call('GET', '/api/approval-matrix', 'MS-USER')).body.matrix.map((m) => m.doc_type)).toEqual(expect.arrayContaining(['ZQ', 'ZO']));

    const dar = (docType) => call('POST', '/api/dars', 'MS-USER', { type: 'NEW', reason: 'ทดสอบ', name: 'เอกสาร', doc_type: docType, department: 'MSX' });
    const closed = await dar('ZQ');
    expect(closed.status).toBe(400);
    expect(closed.body.error).toContain('ถูกปิด');
    expect((await dar('NOTLISTED')).body.error).toContain('ถูกปิด');
    expect((await dar('ZO')).body.error ?? '').not.toContain('ถูกปิด');
  });

  it('SLA days are validated and kept by the server', async () => {
    expect((await call('GET', '/api/settings/sla', 'MS-USER')).body.sla).toBeNull();
    const sla = { reviewSlaDays: 2, approvalSlaDays: 4, hardcopyReceiptSlaDays: 6, recallSlaDays: 8 };
    expect((await call('PUT', '/api/settings/sla', 'MS-USER', sla)).status).toBe(403);
    expect((await call('PUT', '/api/settings/sla', 'MS-DCC', { ...sla, recallSlaDays: 0 })).status).toBe(400);
    expect((await call('PUT', '/api/settings/sla', 'MS-DCC', sla)).status).toBe(200);
    expect((await call('GET', '/api/settings/sla', 'MS-USER')).body.sla).toEqual(sla);
  });

  it('a signature can be set by the owner or DCC, only as a small PNG/JPEG, and is readable by everyone signed in', async () => {
    const body = { signature_type: 'DRAWN', image: PNG, initials: 'MS' };
    expect((await call('PUT', '/api/users/MS-DCC/signature', 'MS-USER', body)).status).toBe(403);
    expect((await call('PUT', '/api/users/MS-USER/signature', 'MS-USER', { ...body, image: 'data:text/html;base64,AAAA' })).status).toBe(400);
    expect((await call('PUT', '/api/users/MS-USER/signature', 'MS-USER', { ...body, image: `data:image/png;base64,${'A'.repeat(700001)}` })).status).toBe(400);
    expect((await call('PUT', '/api/users/MS-USER/signature', 'MS-USER', body)).status).toBe(200);
    expect((await call('PUT', '/api/users/MS-USER/signature', 'MS-DCC', { ...body, signature_type: 'IMAGE' })).status).toBe(200);
    const mine = (await call('GET', '/api/signatures', 'MS-DCC')).body.signatures.find((s) => s.user_id === 'MS-USER');
    expect(mine).toMatchObject({ signature_type: 'IMAGE', initials: 'MS', image: PNG });
    expect((await env.DB.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'SIGNATURE_UPDATED'").first()).n).toBeGreaterThanOrEqual(2);
  });
});

describe('main place of a department', () => {
  const PASSWORD = 'ms-pass-123456';
  let proxy;
  let env;
  let token;
  const call = async (method, path, body) => {
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th) VALUES ('MSM', 'แผนกจุดหลัก')"),
      env.DB.prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc) VALUES ('MS-DCC3', 'MS-DCC3', 'ms-dcc3@ms.local', ?, 'USER', 3, 'MSM', '[\"MSM\"]', 1)").bind(hash)
    ]);
    const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ms-dcc3@ms.local', password: PASSWORD }) }, env);
    token = (await res.json()).token;
  });

  afterAll(async () => {
    await env.DB.prepare("DELETE FROM distribution_locations WHERE department = 'MSM'").run();
    await proxy?.dispose();
  });

  it('the first place is the main one, DCC can move it, and a closed place is never main', async () => {
    const first = (await call('POST', '/api/distribution-locations', { department: 'MSM', name: 'สำนักงาน' })).body.location;
    const second = (await call('POST', '/api/distribution-locations', { department: 'MSM', name: 'หน้างาน' })).body.location;
    expect([first.is_master, second.is_master]).toEqual([1, 0]);
    expect((await call('PATCH', `/api/distribution-locations/${second.id}`, { is_master: true })).body.location.is_master).toBe(1);
    const list = (await call('GET', '/api/distribution-locations')).body.locations.filter((l) => l.department === 'MSM');
    expect(list.filter((l) => l.is_master).map((l) => l.name)).toEqual(['หน้างาน']);
    expect((await call('PATCH', `/api/distribution-locations/${second.id}`, { status: 'INACTIVE' })).body.location.is_master).toBe(0);
  });
});
