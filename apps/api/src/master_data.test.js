import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('master data: users, departments, locations', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'md-pass-123456';
  const call = async (method, path, who, body) => {
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };
  const login = (email, password) => app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }, env);
  const newUser = (extra = {}) => ({ name: 'พนักงานใหม่', email: 'new1@md.local', department: 'MDX', depts: ['MDX'], approval_level: 2, ...extra });

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);
    // Department MDX is this file's own; other test files share the local D1.
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th) VALUES ('MDX', 'แผนกทดสอบ'), ('MDY', 'แผนกทดสอบสอง')"),
      ...[['MD-DCC', 1], ['MD-DCC2', 1], ['MD-USER', 0]].map(([id, dcc]) => env.DB.prepare(
        `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
         VALUES (?, ?, ?, ?, 'USER', 3, 'MDX', '["MDX"]', ?)`).bind(id, id, `${id}@md.local`, hash, dcc))
    ]);
    for (const id of ['MD-DCC', 'MD-DCC2', 'MD-USER']) tokens[id] = (await (await login(`${id}@md.local`, PASSWORD)).json()).token;
  });

  afterAll(() => proxy?.dispose());

  it('only DCC manages master data, but everyone can read departments and places', async () => {
    expect((await call('GET', '/api/admin/users', 'MD-USER')).status).toBe(403);
    expect((await call('POST', '/api/users', 'MD-USER', newUser())).status).toBe(403);
    expect((await call('PATCH', '/api/users/MD-DCC', 'MD-USER', { approval_level: 8 })).status).toBe(403);
    expect((await call('POST', '/api/departments', 'MD-USER', { code: 'ZZ', name_th: 'x' })).status).toBe(403);
    expect((await call('POST', '/api/distribution-locations', 'MD-USER', { department: 'MDX', name: 'x' })).status).toBe(403);
    expect((await call('GET', '/api/departments', 'MD-USER')).body.departments.map((d) => d.code)).toContain('PD');
    expect((await call('GET', '/api/distribution-locations', 'MD-USER')).status).toBe(200);
  });

  it('creates a user with a one-time temporary password that must be changed, and audits it without the password', async () => {
    const { status, body } = await call('POST', '/api/users', 'MD-DCC', newUser({ empId: 'MD-001', isQmr: true }));
    expect(status).toBe(201);
    expect(body.user).toMatchObject({ name: 'พนักงานใหม่', email: 'new1@md.local', empId: 'MD-001', approval_level: 2, department: 'MDX', isQmr: true, isDcc: false, mustChangePassword: true });
    expect(body.temporaryPassword).toHaveLength(14);

    const first = await login('new1@md.local', body.temporaryPassword);
    expect(first.status).toBe(200);
    const { token, user } = await first.json();
    expect(user.mustChangePassword).toBe(true);
    const blocked = await app.request('/api/documents', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(blocked.status).toBe(403); // must change the password first

    const row = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'USER_CREATED' AND json_extract(details, '$.email') = 'new1@md.local'").first();
    expect(row.details).not.toContain(body.temporaryPassword);
    expect(JSON.parse(row.details)).toMatchObject({ level: 2, department: 'MDX', isQmr: true });
  });

  it('refuses a bad form, an unknown department and a duplicate email or employee id', async () => {
    const post = (extra) => call('POST', '/api/users', 'MD-DCC', newUser({ email: 'dup@md.local', ...extra }));
    expect((await post({ name: ' ' })).status).toBe(400);
    expect((await post({ email: 'not-an-email' })).status).toBe(400);
    expect((await post({ approval_level: 9 })).status).toBe(400);
    expect((await post({ approval_level: '3' })).status).toBe(400);
    expect((await post({ department: 'NOPE', depts: ['NOPE'] })).body.error).toMatch('NOPE');
    expect((await post({ depts: ['MDX', 'NOPE'] })).status).toBe(400);
    expect((await post({ empId: 'MD-DUP' })).status).toBe(201);
    expect((await post({ empId: 'MD-DUP2' })).status).toBe(409); // email taken
    expect((await post({ email: 'dup2@md.local', empId: 'MD-DUP' })).status).toBe(409); // employee id taken
    expect((await post({ email: 'DUP@md.local' })).status).toBe(409); // email is case-insensitive
  });

  it('edits a user, keeps what the form does not mention, and audits before and after', async () => {
    const { body: created } = await call('POST', '/api/users', 'MD-DCC', newUser({ email: 'edit@md.local', empId: 'MD-EDIT' }));
    const id = created.user.id;
    const patched = await call('PATCH', `/api/users/${id}`, 'MD-DCC', { approval_level: 5, depts: ['MDY'], isDcc: true });
    expect(patched.body.user).toMatchObject({ approval_level: 5, department: 'MDX', depts: ['MDX', 'MDY'], isDcc: true, role: 'DCC_ADMIN', empId: 'MD-EDIT', email: 'edit@md.local' });
    const row = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'USER_UPDATED' AND json_extract(details, '$.user_id') = ?").bind(id).first();
    expect(JSON.parse(row.details)).toMatchObject({ before: { approval_level: 2, isDcc: false }, after: { approval_level: 5, isDcc: true } });
    expect((await call('PATCH', `/api/users/${id}`, 'MD-DCC', { approval_level: 0 })).status).toBe(400);
    expect((await call('PATCH', '/api/users/nobody', 'MD-DCC', { approval_level: 3 })).status).toBe(404);
  });

  it('deactivating signs the person out at once, and reactivating lets them back', async () => {
    const { body: created } = await call('POST', '/api/users', 'MD-DCC', newUser({ email: 'off@md.local' }));
    const id = created.user.id;
    const { token } = await (await login('off@md.local', created.temporaryPassword)).json();
    const me = () => app.request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect((await me()).status).toBe(200);

    expect((await call('PATCH', `/api/users/${id}`, 'MD-DCC', { status: 'INACTIVE' })).body.user.status).toBe('INACTIVE');
    expect((await me()).status).toBe(401);
    expect((await login('off@md.local', created.temporaryPassword)).status).toBe(403);
    // Still named in the directory so old records keep showing who signed, marked inactive.
    expect((await call('GET', '/api/users', 'MD-USER')).body.users.find((u) => u.id === id)).toMatchObject({ status: 'INACTIVE' });

    await call('PATCH', `/api/users/${id}`, 'MD-DCC', { status: 'ACTIVE' });
    expect((await me()).status).toBe(200);
    expect((await call('PATCH', `/api/users/${id}`, 'MD-DCC', { status: 'LOCKED' })).status).toBe(400);
    expect((await call('PATCH', `/api/users/${id}`, 'MD-DCC', { status: 'BANNED' })).status).toBe(400);
  });

  it('an admin cannot deactivate or demote themself, but another admin can', async () => {
    expect((await call('PATCH', '/api/users/MD-DCC', 'MD-DCC', { status: 'INACTIVE' })).status).toBe(400);
    expect((await call('PATCH', '/api/users/MD-DCC', 'MD-DCC', { isDcc: false })).status).toBe(400);
    expect((await call('PATCH', '/api/users/MD-DCC', 'MD-DCC', { approval_level: 6 })).status).toBe(200);
  });

  it('reset password gives a new one-time password, kills the old password and sessions, and is audited', async () => {
    const { body: created } = await call('POST', '/api/users', 'MD-DCC', newUser({ email: 'reset@md.local' }));
    const id = created.user.id;
    const { token } = await (await login('reset@md.local', created.temporaryPassword)).json();
    await new Promise((r) => setTimeout(r, 1100)); // tokens are stamped to the second; a reset in the same second as the sign-in leaves it valid
    const reset = await call('POST', `/api/users/${id}/reset-password`, 'MD-DCC');
    expect(reset.body.temporaryPassword).toHaveLength(14);
    expect(reset.body.temporaryPassword).not.toBe(created.temporaryPassword);
    expect((await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }, env)).status).toBe(401);
    expect((await login('reset@md.local', created.temporaryPassword)).status).toBe(401);
    expect((await (await login('reset@md.local', reset.body.temporaryPassword)).json()).user.mustChangePassword).toBe(true);
    expect((await call('POST', '/api/users/nobody/reset-password', 'MD-DCC')).status).toBe(404);
    expect((await call('POST', `/api/users/${id}/reset-password`, 'MD-USER')).status).toBe(403);
    const row = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'USER_PASSWORD_RESET' AND json_extract(details, '$.user_id') = ?").bind(id).first();
    expect(row.details).not.toContain(reset.body.temporaryPassword);
  });

  it('lists every account for the admin page, including locked and inactive ones', async () => {
    await env.DB.prepare("INSERT OR REPLACE INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, status) VALUES ('MD-LOCK', 'MD-LOCK', 'MD-LOCK@md.local', 'x', 'USER', 1, 'MDX', '[\"MDX\"]', 'LOCKED')").run();
    const users = (await call('GET', '/api/admin/users', 'MD-DCC')).body.users;
    expect(users.find((u) => u.id === 'MD-LOCK')).toMatchObject({ status: 'LOCKED' });
    expect(JSON.stringify(users)).not.toMatch(/password_hash/);
    // The directory used by the pages hides locked accounts but not inactive ones.
    expect((await call('GET', '/api/users', 'MD-USER')).body.users.some((u) => u.id === 'MD-LOCK')).toBe(false);
    // A locked account is released by setting it ACTIVE, which also clears the failed-login count.
    expect((await call('PATCH', '/api/users/MD-LOCK', 'MD-DCC', { status: 'ACTIVE' })).body.user.status).toBe('ACTIVE');
  });

  it('adds and renames departments; the code cannot change and cannot repeat', async () => {
    expect((await call('POST', '/api/departments', 'MD-DCC', { code: 'bad code', name_th: 'x' })).status).toBe(400);
    expect((await call('POST', '/api/departments', 'MD-DCC', { code: 'MDZ', name_th: ' ' })).status).toBe(400);
    const created = await call('POST', '/api/departments', 'MD-DCC', { code: 'mdz', name_th: 'แผนกใหม่', name_en: 'New' });
    expect(created.status).toBe(201);
    expect(created.body.department).toMatchObject({ code: 'MDZ', name_th: 'แผนกใหม่', name_en: 'New', status: 'ACTIVE' });
    expect((await call('POST', '/api/departments', 'MD-DCC', { code: 'MDZ', name_th: 'ซ้ำ' })).status).toBe(409);
    expect((await call('PATCH', '/api/departments/MDZ', 'MD-DCC', { name_th: 'ชื่อใหม่' })).body.department).toMatchObject({ code: 'MDZ', name_th: 'ชื่อใหม่', name_en: 'New' });
    expect((await call('PATCH', '/api/departments/NOPE', 'MD-DCC', { name_th: 'x' })).status).toBe(404);
    expect((await call('PATCH', '/api/departments/MDZ', 'MD-DCC', { status: 'GONE' })).status).toBe(400);
  });

  it('will not close a department that still has people, and will not put a new person in a closed one', async () => {
    expect((await call('PATCH', '/api/departments/MDX', 'MD-DCC', { status: 'INACTIVE' })).status).toBe(409);
    await call('POST', '/api/departments', 'MD-DCC', { code: 'MDC', name_th: 'ปิดได้' });
    expect((await call('PATCH', '/api/departments/MDC', 'MD-DCC', { status: 'INACTIVE' })).body.department.status).toBe('INACTIVE');
    expect((await call('POST', '/api/users', 'MD-DCC', newUser({ email: 'closed@md.local', department: 'MDC', depts: ['MDC'] }))).status).toBe(400);
    expect((await call('POST', '/api/distribution-locations', 'MD-DCC', { department: 'MDC', name: 'x' })).status).toBe(400);
  });

  it('adds, renames and closes a distribution location, one name per department', async () => {
    expect((await call('POST', '/api/distribution-locations', 'MD-DCC', { department: 'MDX', name: ' ' })).status).toBe(400);
    expect((await call('POST', '/api/distribution-locations', 'MD-DCC', { department: 'NOPE', name: 'x' })).status).toBe(400);
    const created = await call('POST', '/api/distribution-locations', 'MD-DCC', { department: 'MDX', name: 'ไลน์ 1', description: 'ห้องผสม' });
    expect(created.status).toBe(201);
    const id = created.body.location.id;
    expect(created.body.location).toMatchObject({ department: 'MDX', name: 'ไลน์ 1', description: 'ห้องผสม', status: 'ACTIVE' });
    expect((await call('POST', '/api/distribution-locations', 'MD-DCC', { department: 'MDX', name: 'ไลน์ 1' })).status).toBe(409);
    expect((await call('POST', '/api/distribution-locations', 'MD-DCC', { department: 'MDY', name: 'ไลน์ 1' })).status).toBe(201); // other department
    expect((await call('PATCH', `/api/distribution-locations/${id}`, 'MD-DCC', { name: 'ไลน์ 1 (ใหม่)' })).body.location).toMatchObject({ name: 'ไลน์ 1 (ใหม่)', description: 'ห้องผสม' });
    expect((await call('PATCH', `/api/distribution-locations/${id}`, 'MD-DCC', { status: 'INACTIVE' })).body.location.status).toBe('INACTIVE');
    expect((await call('PATCH', '/api/distribution-locations/nope', 'MD-DCC', { name: 'x' })).status).toBe(404);
    expect((await call('GET', '/api/distribution-locations', 'MD-USER')).body.locations.some((l) => l.id === id)).toBe(true);
    const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('LOCATION_CREATED', 'LOCATION_UPDATED') AND details LIKE ?").bind(`%${id}%`).first();
    expect(audit.n).toBe(3);
  });
});
