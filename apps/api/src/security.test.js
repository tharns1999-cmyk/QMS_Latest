import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('security hardening', () => {
  let proxy;
  let env;
  const PASSWORD = 'sec-pass-12345';
  const json = { 'Content-Type': 'application/json' };
  const login = (email, password = PASSWORD, ip) => app.request('/api/auth/login', {
    method: 'POST', headers: { ...json, ...(ip && { 'cf-connecting-ip': ip }) }, body: JSON.stringify({ email, password })
  }, env);
  const call = (method, path, token, body) => app.request(path, {
    method, headers: { ...json, Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body)
  }, env);
  const tokenOf = async (email) => (await (await login(email)).json()).token;

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);
    // id, dcc, qmr, must_change, status
    const users = [['S-DCC', 1, 0, 0, 'ACTIVE'], ['S-QMR', 0, 1, 0, 'ACTIVE'], ['S-USER', 0, 0, 0, 'ACTIVE'], ['S-NEW', 0, 0, 1, 'ACTIVE'], ['S-LOCK', 0, 0, 0, 'LOCKED'], ['S-PW', 0, 0, 0, 'ACTIVE']];
    await env.DB.batch(users.map(([id, dcc, qmr, must, status]) => env.DB.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, is_qmr, must_change_password, status)
       VALUES (?, ?, ?, ?, 'USER', 3, 'PD', '["PD"]', ?, ?, ?, ?)`
    ).bind(id, id, `${id}@sec.local`, hash, dcc, qmr, must, status)));
  });
  afterAll(() => proxy?.dispose());

  it('sends security headers on every response', async () => {
    const res = await app.request('/api/auth/me', {}, env);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
  });

  it('rate-limits failed logins per IP, and a good login from another IP still works', async () => {
    for (let i = 0; i < 10; i++) expect((await login(`nobody${i}@sec.local`, 'x', '203.0.113.9')).status).toBe(401);
    const blocked = await login('S-USER@sec.local', PASSWORD, '203.0.113.9');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('900');
    expect((await login('S-USER@sec.local', PASSWORD, '203.0.113.10')).status).toBe(200);
  });

  it('forces a password change, then signs out the old token', async () => {
    const first = await tokenOf('S-NEW@sec.local');
    const blocked = await call('GET', '/api/users', first);
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await call('GET', '/api/auth/me', first)).status).toBe(200);

    const change = (current, next) => call('POST', '/api/auth/change-password', first, { current_password: current, new_password: next });
    expect((await change('wrong-password', 'a-new-password-1')).status).toBe(400);
    expect((await change(PASSWORD, 'short')).status).toBe(400);
    expect((await change(PASSWORD, PASSWORD)).status).toBe(400);
    await new Promise((r) => setTimeout(r, 1100));
    const ok = await change(PASSWORD, 'a-new-password-1');
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.user.mustChangePassword).toBe(false);

    expect((await call('GET', '/api/users', first)).status).toBe(401);
    expect((await call('GET', '/api/users', body.token)).status).toBe(200);
    expect((await login('S-NEW@sec.local', PASSWORD)).status).toBe(401);
    expect((await login('S-NEW@sec.local', 'a-new-password-1')).status).toBe(200);
  });

  it('counts a wrong current password toward the lockout', async () => {
    const token = await tokenOf('S-PW@sec.local');
    for (let i = 0; i < 5; i++) await call('POST', '/api/auth/change-password', token, { current_password: 'nope', new_password: 'a-new-password-1' });
    expect((await call('GET', '/api/users', token)).status).toBe(401);
    expect((await login('S-PW@sec.local')).status).toBe(423);
  });

  it('lets only DCC list and unlock locked accounts, and audits it', async () => {
    const dcc = await tokenOf('S-DCC@sec.local');
    const user = await tokenOf('S-USER@sec.local');
    expect((await call('GET', '/api/users/locked', user)).status).toBe(403);
    expect((await call('POST', '/api/users/S-LOCK/unlock', user)).status).toBe(403);

    const list = await (await call('GET', '/api/users/locked', dcc)).json();
    expect(list.users.map((u) => u.id)).toContain('S-LOCK');
    expect((await call('POST', '/api/users/S-LOCK/unlock', dcc)).status).toBe(200);
    expect((await call('POST', '/api/users/S-LOCK/unlock', dcc)).status).toBe(404);
    expect((await login('S-LOCK@sec.local')).status).toBe(200);
    const row = await env.DB.prepare("SELECT actor_id, details FROM audit_log WHERE action = 'USER_UNLOCKED' AND details LIKE '%S-LOCK%'").first();
    expect(row.actor_id).toBe('S-DCC');
  });

  it('keeps the audit log append-only in the database', async () => {
    await expect(env.DB.prepare("UPDATE audit_log SET action = 'X' WHERE id = (SELECT MIN(id) FROM audit_log)").run()).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare('DELETE FROM audit_log').run()).rejects.toThrow(/append-only/);
  });

  it('lets only rows older than 365 days leave the audit log (for scripts/audit-archive.js)', async () => {
    const at = (days) => new Date(Date.now() - days * 864e5).toISOString();
    await env.DB.batch([364, 366].map((d) => env.DB.prepare("INSERT INTO audit_log (at, action) VALUES (?, 'RETENTION_TEST')").bind(at(d))));
    await expect(env.DB.prepare("DELETE FROM audit_log WHERE action = 'RETENTION_TEST'").run()).rejects.toThrow(/365 days/);
    await env.DB.prepare("DELETE FROM audit_log WHERE action = 'RETENTION_TEST' AND at < ?").bind(at(365)).run();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'RETENTION_TEST'").first()).n).toBe(1);
    await expect(env.DB.prepare("UPDATE audit_log SET action = 'X' WHERE action = 'RETENTION_TEST'").run()).rejects.toThrow(/append-only/);
  });

  it('exports the audit log to DCC and QMR only, filtered, as JSON or safe CSV', async () => {
    const dcc = await tokenOf('S-DCC@sec.local');
    expect((await call('GET', '/api/audit-log', await tokenOf('S-USER@sec.local'))).status).toBe(403);
    expect((await call('GET', '/api/audit-log?from=yesterday', dcc)).status).toBe(400);

    const logins = await (await call('GET', '/api/audit-log?action=LOGIN&limit=2', dcc)).json();
    expect(logins.entries).toHaveLength(2);
    expect(logins.entries.every((e) => e.action === 'LOGIN')).toBe(true);
    expect(logins.entries[0].actor_name).toBeTruthy();
    const page2 = await (await call('GET', `/api/audit-log?action=LOGIN&limit=2&before_id=${logins.next_before_id}`, dcc)).json();
    expect(page2.entries.every((e) => e.id < logins.next_before_id)).toBe(true);

    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // a Thailand day, like the filter
    const inRange = await (await call('GET', `/api/audit-log?from=${today}&to=${today}&action=LOGIN&limit=1`, dcc)).json();
    expect(inRange.entries).toHaveLength(1);
    // 17:00 UTC is already the next Thailand day: a row stamped then belongs to tomorrow's filter, not today's.
    await env.DB.prepare("INSERT INTO audit_log (at, actor_id, action, details) VALUES ('2030-01-01T17:30:00.000Z', NULL, 'TZ_PROBE', '{}')").run();
    const probe = (d) => call('GET', `/api/audit-log?from=${d}&to=${d}&action=TZ_PROBE`, dcc).then((r) => r.json());
    expect((await probe('2030-01-01')).entries).toHaveLength(0);
    expect((await probe('2030-01-02')).entries).toHaveLength(1);
    expect((await (await call('GET', '/api/audit-log?to=2000-01-01', dcc)).json()).entries).toHaveLength(0);

    await env.DB.prepare("INSERT INTO audit_log (actor_id, action, details) VALUES (NULL, 'LOGIN_FAILED', ?)").bind('=HYPERLINK("http://evil")').run();
    const csv = await call('GET', '/api/audit-log?format=csv&action=LOGIN_FAILED', await tokenOf('S-QMR@sec.local'));
    expect(csv.headers.get('content-type')).toContain('text/csv');
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('id,at,actor_id');
    expect(text).toContain('"\'=HYPERLINK(""http://evil"")"');

    const exported = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'AUDIT_LOG_EXPORTED' ORDER BY id DESC LIMIT 1").first();
    expect(JSON.parse(exported.details).format).toBe('csv');
  });
});
