import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { sign } from 'hono/jwt';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';

// A stand-in for Microsoft Entra ID: the signing keys, and the token endpoint that swaps a code for an ID token.
const TENANT = '11111111-2222-4333-8444-555555555555';
const CLIENT_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const SECRET = 'client-secret-from-azure';
const REDIRECT = 'https://qms.example.com/api/auth/entra/callback';
const KID = 'key-1';

const makeKeys = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { priv: { ...privateKey.export({ format: 'jwk' }), alg: 'RS256', kid: KID }, pub: { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' } };
};

const startIdp = async () => {
  const good = makeKeys();
  const other = makeKeys(); // a key Microsoft does not publish
  const codes = new Map();
  const seen = { tokenRequests: 0, lastForm: null };
  const server = createServer((req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === `/${TENANT}/discovery/v2.0/keys`) return send(200, { keys: [good.pub] });
    if (req.method === 'POST' && req.url === `/${TENANT}/oauth2/v2.0/token`) {
      let raw = '';
      req.on('data', (d) => { raw += d; });
      req.on('end', async () => {
        seen.tokenRequests += 1;
        const form = Object.fromEntries(new URLSearchParams(raw));
        seen.lastForm = form;
        const entry = codes.get(form.code);
        const challenge = entry && createHash('sha256').update(form.code_verifier || '').digest('base64url');
        if (!entry || form.client_id !== CLIENT_ID || form.client_secret !== SECRET || form.grant_type !== 'authorization_code' || form.redirect_uri !== REDIRECT || challenge !== entry.challenge) {
          return send(400, { error: 'invalid_grant' });
        }
        codes.delete(form.code); // a code works once
        if (entry.noIdToken) return send(200, { access_token: 'x' });
        const now = Math.floor(Date.now() / 1000);
        const claims = { iss: `${idp.url}/${TENANT}/v2.0`, aud: CLIENT_ID, tid: TENANT, sub: 'sub-1', oid: 'oid-1', nonce: entry.nonce, iat: now, nbf: now, exp: now + 3600, preferred_username: 'someone@company.example', ...entry.claims };
        return send(200, { id_token: entry.rawToken ?? await sign(claims, entry.wrongKey ? other.priv : good.priv) });
      });
      return undefined;
    }
    return send(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const idp = {
    url: `http://127.0.0.1:${server.address().port}`,
    seen,
    // The sign-in the browser started, as Microsoft would remember it.
    expect: (code, flow, extra = {}) => codes.set(code, { nonce: flow.nonce, challenge: flow.challenge, ...extra }),
    close: () => new Promise((r) => server.close(r))
  };
  return idp;
};

let proxy;
let idp;
let env;
const call = (path, init = {}, e = env) => app.request(path, { redirect: 'manual', ...init }, e);
const me = (token) => app.request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }, env);

// Starts a sign-in the way the browser does and returns what Microsoft would have seen.
const start = async () => {
  const res = await call('/api/auth/entra/login');
  const location = new URL(res.headers.get('location'));
  return {
    res,
    location,
    state: location.searchParams.get('state'),
    nonce: location.searchParams.get('nonce'),
    challenge: location.searchParams.get('code_challenge'),
    cookie: res.headers.get('set-cookie').split(';')[0]
  };
};
const finish = (flow, { code = 'code-1', state = flow.state, cookie = flow.cookie, query = '' } = {}) =>
  call(`/api/auth/entra/callback?code=${code}&state=${encodeURIComponent(state)}${query}`, { headers: cookie ? { Cookie: cookie } : {} });
const outcome = (res) => {
  const location = res.headers.get('location') || '';
  const fragment = location.includes('#entra_token=') ? location.split('#entra_token=')[1] : null;
  return { status: res.status, token: fragment, error: new URL(location, 'http://x').searchParams.get('login_error') };
};
const as = async (claims) => {
  const flow = await start();
  idp.expect('code-1', flow, { claims });
  return outcome(await finish(flow));
};

beforeAll(async () => {
  proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
  idp = await startIdp();
  env = { ...proxy.env, JWT_SECRET: 'entra-test-secret-entra-test-secret', AUTH_MODE: 'entra', ENTRA_TENANT_ID: TENANT, ENTRA_CLIENT_ID: CLIENT_ID, ENTRA_CLIENT_SECRET: SECRET, ENTRA_REDIRECT_URI: REDIRECT, ENTRA_AUTHORITY_HOST: idp.url };
  const insert = (id, email, status = 'ACTIVE', extra = '') => env.DB.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, status, must_change_password ${extra ? ', totp_confirmed_at' : ''})
     VALUES (?, ?, ?, 'x', 'GENERAL_USER', 3, 'QA', '["QA","QC"]', 0, ?, ${extra ? '1, 12345' : '0'})`
  ).bind(id, `[ข้อมูลทดสอบ] ${id}`, email, status);
  await env.DB.batch([
    insert('ENT-OK', 'someone@company.example'),
    insert('ENT-MIXED', 'Mixed.Case@Company.Example'),
    insert('ENT-OFF', 'off@company.example', 'INACTIVE'),
    insert('ENT-LOCKED', 'locked@company.example', 'LOCKED'),
    insert('ENT-OLDPW', 'oldpw@company.example', 'ACTIVE', 'seeded-with-password-and-2fa')
  ]);
});

afterAll(async () => {
  await idp?.close();
  await proxy?.dispose();
});

beforeEach(() => { idp.seen.tokenRequests = 0; });

describe('which sign-in the system offers', () => {
  it('says which mode it is in, and keeps the password sign-in untouched when the mode is not Microsoft', async () => {
    const plain = { ...proxy.env, JWT_SECRET: 'x'.repeat(40) };
    expect(await (await call('/api/auth/mode', {}, plain)).json()).toEqual({ mode: 'password' });
    expect((await call('/api/auth/entra/login', {}, plain)).status).toBe(404);
    expect((await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.c', password: 'nope' }) }, plain)).status).toBe(401);
    expect(await (await call('/api/auth/mode')).json()).toEqual({ mode: 'entra', configured: true });
  });

  it('switches off password sign-in, password change and two-factor in Microsoft mode', async () => {
    const post = (path) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    for (const path of ['/api/auth/login', '/api/auth/change-password', '/api/auth/2fa/verify', '/api/auth/2fa/setup', '/api/auth/2fa/confirm']) {
      const res = await post(path);
      expect([path, res.status]).toEqual([path, 403]);
      expect((await res.json()).code).toBe('ENTRA_ONLY');
    }
  });

  it('refuses every sign-in, and never falls back to passwords, when the Microsoft settings are incomplete', async () => {
    const broken = { ...env, ENTRA_CLIENT_SECRET: '' };
    expect(await (await call('/api/auth/mode', {}, broken)).json()).toEqual({ mode: 'entra', configured: false });
    const res = await call('/api/auth/entra/login', {}, broken);
    expect(new URL(res.headers.get('location'), 'http://x').searchParams.get('login_error')).toBe('entra_not_configured');
    expect((await call('/api/auth/login', { method: 'POST', body: '{}' }, broken)).status).toBe(403);
    // "common" would accept accounts from any company.
    expect(await (await call('/api/auth/mode', {}, { ...env, ENTRA_TENANT_ID: 'common' })).json()).toEqual({ mode: 'entra', configured: false });
  });
});

describe('starting a sign-in', () => {
  it('sends the browser to this tenant with a one-off state, nonce and PKCE challenge, and keeps the secrets in a cookie', async () => {
    const flow = await start();
    expect(flow.res.status).toBe(302);
    expect(flow.location.origin + flow.location.pathname).toBe(`${idp.url}/${TENANT}/oauth2/v2.0/authorize`);
    const q = flow.location.searchParams;
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('redirect_uri')).toBe(REDIRECT);
    expect(q.get('scope')).toBe('openid profile email');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(flow.state.length).toBeGreaterThan(20);
    expect(flow.nonce.length).toBeGreaterThan(20);
    expect(flow.challenge.length).toBeGreaterThan(30);
    expect(flow.location.search).not.toContain(SECRET);
    const cookie = flow.res.headers.get('set-cookie');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/entra/);
    expect((await start()).state).not.toBe(flow.state);
  });
});

describe('finishing a sign-in', () => {
  it('signs in the person whose company e-mail is in the users table, with their own role, level and departments', async () => {
    const result = await as({});
    expect(result.status).toBe(302);
    expect(result.error).toBeNull();
    const res = await me(result.token);
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user).toMatchObject({ id: 'ENT-OK', approval_level: 3, department: 'QA', depts: ['QA', 'QC'], isDcc: false });
    const audit = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'LOGIN' AND actor_id = 'ENT-OK' ORDER BY id DESC LIMIT 1").first();
    expect(JSON.parse(audit.details)).toMatchObject({ via: 'entra', oid: 'oid-1' });
  });

  it('sends Microsoft the secret, the PKCE verifier and the redirect address, and the code works only once', async () => {
    const flow = await start();
    idp.expect('code-once', flow);
    expect(outcome(await finish(flow, { code: 'code-once' })).token).toBeTruthy();
    expect(idp.seen.lastForm).toMatchObject({ client_id: CLIENT_ID, client_secret: SECRET, grant_type: 'authorization_code', redirect_uri: REDIRECT });
    expect(idp.seen.lastForm.code_verifier.length).toBeGreaterThan(30);
    const again = await start();
    expect(outcome(await finish(again, { code: 'code-once' })).error).toBe('entra_failed');
  });

  it('matches the e-mail without regard to capital letters, and also by the other name claims', async () => {
    expect((await me((await as({ preferred_username: 'MIXED.case@company.example' })).token)).status).toBe(200);
    const viaEmail = await as({ preferred_username: undefined, email: 'someone@company.example' });
    expect((await (await me(viaEmail.token)).json()).user.id).toBe('ENT-OK');
  });

  it('refuses an e-mail that is not in the users table, creates nobody, and records it', async () => {
    const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
    const result = await as({ preferred_username: 'stranger@company.example' });
    expect(result).toMatchObject({ token: null, error: 'entra_no_user' });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n).toBe(before);
    const row = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'LOGIN_FAILED' AND details LIKE '%stranger@company.example%' ORDER BY id DESC LIMIT 1").first();
    expect(JSON.parse(row.details)).toMatchObject({ via: 'entra', reason: 'NO_SUCH_USER' });
  });

  it('refuses a person whose account is inactive or locked', async () => {
    expect(await as({ preferred_username: 'off@company.example' })).toMatchObject({ token: null, error: 'entra_inactive' });
    expect(await as({ preferred_username: 'locked@company.example' })).toMatchObject({ token: null, error: 'entra_inactive' });
  });

  it('does not ask a Microsoft user to change a password or set up an authenticator they do not have', async () => {
    const result = await as({ preferred_username: 'oldpw@company.example' });
    const res = await me(result.token);
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ mustChangePassword: false, mustSetUpTwoFactor: false, microsoftSignIn: true });
    expect((await app.request('/api/documents', { headers: { Authorization: `Bearer ${result.token}` } }, env)).status).toBe(200);
  });

  it('refuses an ID token that is not exactly for this application, this tenant and this sign-in', async () => {
    const bad = [
      ['another application', { aud: 'ffffffff-0000-4000-8000-000000000000' }],
      ['another issuer', { iss: 'https://evil.example/v2.0' }],
      ['another tenant', { tid: 'ffffffff-0000-4000-8000-000000000000', iss: `${idp.url}/${TENANT}/v2.0` }],
      ['an expired token', { exp: Math.floor(Date.now() / 1000) - 60 }],
      ['not valid yet', { nbf: Math.floor(Date.now() / 1000) + 3600 }],
      ['another sign-in (nonce)', { nonce: 'a-nonce-from-someone-else' }]
    ];
    for (const [label, claims] of bad) expect([label, await as(claims)]).toEqual([label, expect.objectContaining({ token: null, error: 'entra_failed' })]);
  });

  it('refuses a token signed with a key Microsoft does not publish, an unsigned token, and a symmetric-key trick', async () => {
    const flow = async (extra) => { const f = await start(); idp.expect('code-1', f, extra); return outcome(await finish(f)); };
    expect(await flow({ wrongKey: true })).toMatchObject({ token: null, error: 'entra_failed' });
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const payload = { iss: `${idp.url}/${TENANT}/v2.0`, aud: CLIENT_ID, tid: TENANT, exp: Math.floor(Date.now() / 1000) + 600, preferred_username: 'someone@company.example' };
    expect(await flow({ rawToken: `${b64({ alg: 'none', typ: 'JWT', kid: KID })}.${b64(payload)}.` })).toMatchObject({ token: null, error: 'entra_failed' });
    expect(await flow({ rawToken: `${b64({ alg: 'HS256', typ: 'JWT', kid: KID })}.${b64(payload)}.${Buffer.from('x').toString('base64url')}` })).toMatchObject({ token: null, error: 'entra_failed' });
  });

  it('refuses when Microsoft answers without an ID token, or refuses the code', async () => {
    const a = await start();
    idp.expect('code-1', a, { noIdToken: true });
    expect(outcome(await finish(a)).error).toBe('entra_failed');
    const b = await start();
    expect(outcome(await finish(b, { code: 'never-issued' })).error).toBe('entra_failed');
  });

  it('refuses a callback that this browser did not start, and does not even contact Microsoft', async () => {
    const flow = await start();
    idp.expect('code-1', flow);
    const noCookie = outcome(await finish(flow, { cookie: '' }));
    const wrongState = outcome(await finish(flow, { state: 'someone-elses-state' }));
    const foreignCookie = outcome(await finish(flow, { cookie: 'qms_entra_flow=not.a.token' }));
    const noCode = outcome(await call('/api/auth/entra/callback', { headers: { Cookie: flow.cookie } }));
    for (const r of [noCookie, wrongState, foreignCookie, noCode]) expect(r).toMatchObject({ token: null, error: 'entra_failed' });
    expect(idp.seen.tokenRequests).toBe(0);
  });

  it('refuses a flow cookie that has expired', async () => {
    const flow = await start();
    idp.expect('code-1', flow);
    const old = await sign({ purpose: 'entra_flow', state: flow.state, nonce: flow.nonce, verifier: 'v'.repeat(43), iat: 1, exp: 2 }, env.JWT_SECRET, 'HS256');
    expect(outcome(await finish(flow, { cookie: `qms_entra_flow=${old}` })).error).toBe('entra_failed');
    expect(idp.seen.tokenRequests).toBe(0);
  });

  it('does not accept the flow cookie, or any token that is not a session, as a session', async () => {
    const flow = await start();
    expect((await me(flow.cookie.split('=')[1])).status).toBe(401);
  });

  it('reports a refusal at Microsoft (for example the person declined) without contacting it again', async () => {
    const flow = await start();
    const res = await call(`/api/auth/entra/callback?error=access_denied&error_description=secret+details&state=${flow.state}`, { headers: { Cookie: flow.cookie } });
    expect(outcome(res)).toMatchObject({ token: null, error: 'entra_denied' });
    expect(res.headers.get('location')).not.toContain('secret');
    expect(idp.seen.tokenRequests).toBe(0);
  });

  it('uses the flow cookie once: it is cleared on the way back', async () => {
    const flow = await start();
    idp.expect('code-1', flow);
    expect((await finish(flow)).headers.get('set-cookie')).toMatch(/qms_entra_flow=;/);
  });

  it('keeps a returned token valid only while the person stays active', async () => {
    const result = await as({ preferred_username: randomUUID().slice(0, 0) + 'someone@company.example' });
    expect((await me(result.token)).status).toBe(200);
    await env.DB.prepare("UPDATE users SET status = 'INACTIVE' WHERE id = 'ENT-OK'").run();
    expect((await me(result.token)).status).toBe(401);
    await env.DB.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = 'ENT-OK'").run();
  });
});
