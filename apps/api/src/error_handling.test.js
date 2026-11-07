import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app, { redactSecrets } from './index.js';
import { hashPassword } from './password.js';

let proxy;
let env;
let token;
const PASSWORD = 'error-handling-pass';
const ORIGIN = 'https://qms-web.qms-api.workers.dev';

const loggedLines = (spy) => spy.mock.calls.map(([line]) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);

beforeAll(async () => {
  proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
  env = { ...proxy.env, JWT_SECRET: 'test-secret', ALLOWED_ORIGIN: ORIGIN };
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, status)
     VALUES ('EH1', 'Error Handling User', 'error-handling@test.local', ?, 'GENERAL_USER', 2, 'QA', '["QA"]', 0, 'ACTIVE')`
  ).bind(await hashPassword(PASSWORD)).run();
  const res = await app.request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'error-handling@test.local', password: PASSWORD })
  }, env);
  token = (await res.json()).token;
});

afterAll(async () => {
  await proxy.dispose();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request id (correlation id)', () => {
  it('returns X-Request-Id on ordinary responses, including errors the handlers answer themselves', async () => {
    const res = await app.request('/api/auth/me', {}, env);
    expect(res.status).toBe(401);
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses Cloudflare's cf-ray when it is present and well formed", async () => {
    const res = await app.request('/api/auth/me', { headers: { 'cf-ray': '8f1d2c3b4a596877-SIN' } }, env);
    expect(res.headers.get('X-Request-Id')).toBe('8f1d2c3b4a596877-SIN');
  });

  it('ignores a malformed cf-ray instead of echoing it', async () => {
    const res = await app.request('/api/auth/me', { headers: { 'cf-ray': 'bad value<script>' } }, env);
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lets the browser read the id across origins (CORS exposes the header)', async () => {
    const res = await app.request('/api/auth/me', { headers: { Origin: ORIGIN } }, env);
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Request-Id');
  });
});

describe('unexpected errors', () => {
  it('answers 500 with a reference id and no internals, and logs one structured line with the same id', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // No DB binding: the login handler throws a TypeError it did not expect.
    const res = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@test.local', password: 'whatever' })
    }, { ...env, DB: undefined });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.requestId).toBe(res.headers.get('X-Request-Id'));
    expect(body.error).toContain(body.requestId);
    expect(JSON.stringify(body)).not.toMatch(/TypeError|prepare|at\s/);

    const [line] = loggedLines(spy).filter((l) => l.msg === 'unhandled_error');
    expect(line).toMatchObject({ level: 'error', request_id: body.requestId, method: 'POST', path: '/api/auth/login' });
    expect(line.error).toBeTruthy();
  });

  it('sends CORS headers on the 500 too, so a browser on another origin can read the message and the reference id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email: 'x@test.local', password: 'whatever' })
    }, { ...env, DB: undefined });
    expect(res.status).toBe(500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Request-Id');
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('keeps the messages of errors that handlers already answer (no change to 4xx)', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    }, env);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('กรุณากรอกอีเมลและรหัสผ่าน');
  });
});

describe('POST /api/client-errors (web error tracking)', () => {
  const report = (body, headers = {}) => app.request('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }, env);

  it('requires sign-in', async () => {
    const res = await app.request('/api/client-errors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'error', message: 'x' })
    }, env);
    expect(res.status).toBe(401);
  });

  it('logs a valid report with the user id and answers 204 without touching the audit log', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log').first();
    const res = await report({ kind: 'render', message: 'Cannot read properties of undefined', stack: 'at Page', page: '/vcc/work-orders', requestId: 'abc-123' });
    expect(res.status).toBe(204);
    const [line] = loggedLines(spy).filter((l) => l.msg === 'client_error');
    expect(line).toMatchObject({ level: 'error', user_id: 'EH1', kind: 'render', page: '/vcc/work-orders', client_request_id: 'abc-123' });
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM audit_log').first();
    expect(after.n).toBe(before.n);
  });

  it('rejects unknown kinds and empty messages', async () => {
    expect((await report({ kind: 'other', message: 'x' })).status).toBe(400);
    expect((await report({ kind: 'error', message: '   ' })).status).toBe(400);
    expect((await report('not json')).status).toBe(400);
  });

  it('rejects oversized reports', async () => {
    const res = await report({ kind: 'error', message: 'x', stack: 'y'.repeat(9000) });
    expect(res.status).toBe(413);
  });
});

describe('log redaction (no secrets in logs)', () => {
  it('masks JWTs, Bearer values and secret-named fields but keeps the rest of the message', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJVMSJ9.c2lnbmF0dXJlLXBhcnQ';
    const out = redactSecrets(`invalid JWT token: ${jwt}; Authorization: Bearer abc.def password=hunter2 {"new_password":"S3cret!","token":"t-1"} otp=123456 at Page`);
    expect(out).not.toContain(jwt);
    for (const secret of ['abc.def', 'hunter2', 'S3cret!', 't-1', '123456']) expect(out).not.toContain(secret);
    expect(out).toContain('invalid JWT token');
    expect(out).toContain('at Page');
  });

  it('leaves ordinary error text untouched', () => {
    const msg = "Cannot read properties of undefined (reading 'doc_code') at /vcc/work-orders";
    expect(redactSecrets(msg)).toBe(msg);
  });

  it('a client report carrying a token and a password is logged masked', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: 'error', message: `request failed with ${token}`, stack: 'body {"password":"error-handling-pass"}' })
    }, env);
    expect(res.status).toBe(204);
    const raw = spy.mock.calls.map(([line]) => String(line)).join(' ');
    expect(raw).toContain('client_error');
    expect(raw).not.toContain(token);
    expect(raw).not.toContain(PASSWORD);
  });

  it('an unexpected server error never logs the token or password of the caller', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A database that fails with a message quoting the secrets: the worst case for what reaches the log.
    const failingDb = { prepare: () => { throw new Error(`boom with ${token} and password=${PASSWORD}`); } };
    const res = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'error-handling@test.local', password: PASSWORD })
    }, { ...env, DB: failingDb });
    expect(res.status).toBe(500);
    const raw = spy.mock.calls.map(([line]) => String(line)).join(' ');
    expect(raw).toContain('unhandled_error');
    expect(raw).not.toContain(token);
    expect(raw).not.toContain(PASSWORD);
  });
});
