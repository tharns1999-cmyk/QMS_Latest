import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword, verifyPassword } from './password.js';

let proxy;
let env;
const PASSWORD = 'correct-horse';

const login = (email, password) => app.request('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
}, env);
const me = (token) => app.request('/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} }, env);

beforeAll(async () => {
  proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
  env = { ...proxy.env, JWT_SECRET: 'test-secret' };
  const hash = await hashPassword(PASSWORD);
  const insert = (id, email, status = 'ACTIVE') => env.DB.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, status)
     VALUES (?, ?, ?, ?, 'DCC_ADMIN', 4, 'DC', '["DC","QA"]', 1, ?)`
  ).bind(id, `User ${id}`, email, hash, status);
  await env.DB.batch([insert('U1', 'dcc@test.local'), insert('U2', 'lockme@test.local'), insert('U3', 'off@test.local', 'INACTIVE')]);
});

afterAll(() => proxy?.dispose());

describe('password hashing', () => {
  it('verifies only the original password and never a missing hash', async () => {
    const hash = await hashPassword('secret-123');
    expect(await verifyPassword('secret-123', hash)).toBe(true);
    expect(await verifyPassword('secret-124', hash)).toBe(false);
    expect(await verifyPassword('anything', undefined)).toBe(false);
  });
});

describe('auth API', () => {
  it('logs in, then /me returns the user without secrets', async () => {
    const res = await login('DCC@test.local', PASSWORD);
    expect(res.status).toBe(200);
    const { token } = await res.json();
    const meRes = await me(token);
    expect(meRes.status).toBe(200);
    const { user } = await meRes.json();
    expect(user).toMatchObject({ id: 'U1', role: 'DCC_ADMIN', approval_level: 4, department: 'DC', depts: ['DC', 'QA'], isDcc: true });
    expect(user).not.toHaveProperty('password_hash');
  });

  it('gives the same answer for an unknown email and a wrong password, and audits both', async () => {
    const unknown = await login('nobody@test.local', PASSWORD);
    const wrong = await login('dcc@test.local', 'wrong-pass');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
    const { count } = await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'LOGIN_FAILED'").first();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('locks the account after 5 wrong passwords, even for the right password afterwards', async () => {
    for (let i = 0; i < 5; i++) expect((await login('lockme@test.local', 'wrong-pass')).status).toBe(401);
    expect((await login('lockme@test.local', PASSWORD)).status).toBe(423);
  });

  it('refuses inactive accounts', async () => {
    expect((await login('off@test.local', PASSWORD)).status).toBe(403);
  });

  it('rejects missing, tampered and foreign-secret tokens', async () => {
    const { token } = await (await login('dcc@test.local', PASSWORD)).json();
    expect((await me()).status).toBe(401);
    expect((await me(`${token}x`)).status).toBe(401);
    env.JWT_SECRET = 'other-secret';
    expect((await me(token)).status).toBe(401);
    env.JWT_SECRET = 'test-secret';
  });

  it('cuts off a token as soon as the account is locked', async () => {
    const { token } = await (await login('dcc@test.local', PASSWORD)).json();
    await env.DB.prepare("UPDATE users SET status = 'LOCKED' WHERE id = 'U1'").run();
    expect((await me(token)).status).toBe(401);
  });
});
