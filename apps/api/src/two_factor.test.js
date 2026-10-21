import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';
import { base32Decode, codeFor, stepAt } from './totp.js';

describe('two-factor sign-in', () => {
  let proxy;
  let env;
  const PASSWORD = 'tf-pass-1234567';
  const json = { 'Content-Type': 'application/json' };
  const send = async (method, path, token, body) => {
    const res = await app.request(path, { method, headers: { ...json, ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const login = (id) => send('POST', '/api/auth/login', null, { email: `${id}@tf.local`, password: PASSWORD });
  const tokenOf = async (id) => (await login(id)).body.token;
  // The code an authenticator app would show right now, `ahead` steps from now.
  const codeNow = async (secret, ahead = 0) => codeFor(base32Decode(secret), stepAt(Date.now()) + ahead);
  const enroll = async (id) => {
    const token = await tokenOf(id);
    const { secret } = (await send('POST', '/api/auth/2fa/setup', token)).body;
    const { recoveryCodes } = (await send('POST', '/api/auth/2fa/confirm', token, { code: await codeNow(secret) })).body;
    return { secret, recoveryCodes, token };
  };
  const dccToken = () => tokenOf('TF-DCC');

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);
    // Department TFX is this file's own. id, level, dcc
    const users = [['TF-DCC', 3, 1], ['TF-L5', 5, 0], ['TF-L3', 3, 0], ['TF-E1', 2, 0], ['TF-E2', 2, 0], ['TF-E3', 2, 0], ['TF-E4', 2, 0], ['TF-E5', 2, 0]];
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th) VALUES ('TFX', 'x')"),
      ...users.map(([id, level, dcc]) => env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES (?, ?, ?, ?, 'USER', ?, 'TFX', '["TFX"]', ?)`).bind(id, id, `${id}@tf.local`, hash, level, dcc))
    ]);
  });

  afterAll(async () => {
    // The shared test database starts with the policy off; put it back for whichever file runs next.
    await env.DB.prepare("UPDATE settings SET value = '0' WHERE key IN ('two_factor_min_level', 'two_factor_for_dcc')").run();
    await proxy?.dispose();
  });

  it('only DCC reads or sets the policy; it is validated, saved and audited', async () => {
    const dcc = await dccToken();
    const user = await tokenOf('TF-L3');
    expect((await send('GET', '/api/settings/security', user)).status).toBe(403);
    expect((await send('PUT', '/api/settings/security', user, { twoFactorMinLevel: 5, twoFactorForDcc: true })).status).toBe(403);
    expect((await send('PUT', '/api/settings/security', dcc, { twoFactorMinLevel: 9, twoFactorForDcc: true })).status).toBe(400);
    expect((await send('PUT', '/api/settings/security', dcc, { twoFactorMinLevel: '5', twoFactorForDcc: true })).status).toBe(400);
    expect((await send('PUT', '/api/settings/security', dcc, { twoFactorMinLevel: 5 })).status).toBe(400);
    expect((await send('GET', '/api/settings/security', dcc)).body).toEqual({ twoFactorMinLevel: 0, twoFactorForDcc: false });

    const saved = await send('PUT', '/api/settings/security', dcc, { twoFactorMinLevel: 5, twoFactorForDcc: true });
    expect(saved.body).toEqual({ twoFactorMinLevel: 5, twoFactorForDcc: true });
    const row = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'SECURITY_SETTINGS_UPDATED' ORDER BY id DESC").first();
    expect(JSON.parse(row.details)).toEqual({ before: { twoFactorMinLevel: 0, twoFactorForDcc: false }, after: { twoFactorMinLevel: 5, twoFactorForDcc: true } });
  });

  it('whoever the policy names must set it up first, and can do nothing else until they have', async () => {
    // Policy from the previous test: level 5 and up, and every DCC.
    const l5 = await login('TF-L5');
    expect(l5.body.user).toMatchObject({ twoFactorRequired: true, mustSetUpTwoFactor: true, twoFactorEnabled: false });
    const blocked = await send('GET', '/api/documents', l5.body.token);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
    expect((await send('GET', '/api/auth/me', l5.body.token)).status).toBe(200);
    expect((await send('POST', '/api/auth/2fa/setup', l5.body.token)).status).toBe(200);

    expect((await login('TF-DCC')).body.user).toMatchObject({ mustSetUpTwoFactor: true }); // a DCC at level 3, by the DCC setting
    const l3 = await login('TF-L3');
    expect(l3.body.user).toMatchObject({ twoFactorRequired: false, mustSetUpTwoFactor: false });
    expect((await send('GET', '/api/documents', l3.body.token)).status).toBe(200);
  });

  it('changing the policy changes who is asked, without touching code', async () => {
    const dcc = await dccToken();
    // The DCC cannot change settings while their own setup is pending, so a second admin step is done directly here.
    await env.DB.prepare("UPDATE settings SET value = '3' WHERE key = 'two_factor_min_level'").run();
    expect((await login('TF-L3')).body.user.mustSetUpTwoFactor).toBe(true);
    await env.DB.prepare("UPDATE settings SET value = '0' WHERE key = 'two_factor_min_level'").run();
    await env.DB.prepare("UPDATE settings SET value = '0' WHERE key = 'two_factor_for_dcc'").run();
    expect((await login('TF-L5')).body.user.mustSetUpTwoFactor).toBe(false);
    expect((await login('TF-DCC')).body.user.mustSetUpTwoFactor).toBe(false);
    expect((await send('GET', '/api/settings/security', dcc)).status).toBe(200);
    await env.DB.prepare("UPDATE settings SET value = '5' WHERE key = 'two_factor_min_level'").run();
    await env.DB.prepare("UPDATE settings SET value = '1' WHERE key = 'two_factor_for_dcc'").run();
  });

  it('setup needs a correct code from the app, then hands out single-use recovery codes once', async () => {
    const token = await tokenOf('TF-E1');
    expect((await send('POST', '/api/auth/2fa/confirm', token, { code: '123456' })).status).toBe(409); // not started
    const { secret, otpauthUri } = (await send('POST', '/api/auth/2fa/setup', token)).body;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri).toContain(`secret=${secret}`);
    expect(otpauthUri).toContain('TF-E1%40tf.local');

    expect((await send('POST', '/api/auth/2fa/confirm', token, { code: '000000' })).status).toBe(400);
    const confirmed = await send('POST', '/api/auth/2fa/confirm', token, { code: await codeNow(secret) });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.recoveryCodes).toHaveLength(8);
    for (const code of confirmed.body.recoveryCodes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    const stored = await env.DB.prepare('SELECT code_hash FROM recovery_codes WHERE user_id = ?').bind('TF-E1').all();
    expect(stored.results).toHaveLength(8);
    expect(JSON.stringify(stored.results)).not.toContain(confirmed.body.recoveryCodes[0].replace('-', ''));
    expect((await send('POST', '/api/auth/2fa/setup', token)).status).toBe(409); // already on
    expect((await send('POST', '/api/auth/2fa/confirm', token, { code: await codeNow(secret, 1) })).status).toBe(409);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'TWO_FACTOR_ENABLED' AND actor_id = 'TF-E1'").first()).n).toBe(1);
  });

  it('once set up, a password alone gives no session; a code from the app finishes the sign-in, once', async () => {
    const { secret } = await enroll('TF-E2');
    const first = await login('TF-E2');
    expect(first.body.twoFactorRequired).toBe(true);
    expect(first.body.token).toBeUndefined();
    const { challenge } = first.body;

    expect((await send('GET', '/api/auth/me', challenge)).status).toBe(401); // the challenge is not a session
    expect((await send('POST', '/api/auth/2fa/verify', null, { challenge: 'nonsense', code: '123456' })).status).toBe(401);
    const sessionToken = await send('POST', '/api/auth/2fa/verify', null, { challenge: await tokenOf('TF-L3'), code: '123456' });
    expect(sessionToken.status).toBe(401); // a session is not a challenge

    expect((await send('POST', '/api/auth/2fa/verify', null, { challenge, code: '000000' })).status).toBe(401);
    // The code the app showed at setup is already spent, so this is the next one.
    const done = await send('POST', '/api/auth/2fa/verify', null, { challenge, code: await codeNow(secret, 1) });
    expect(done.status).toBe(200);
    expect(done.body.user).toMatchObject({ id: 'TF-E2', twoFactorEnabled: true });
    expect((await send('GET', '/api/documents', done.body.token)).status).toBe(200);
    // The same code cannot be used again, even with a fresh challenge.
    const again = await login('TF-E2');
    expect((await send('POST', '/api/auth/2fa/verify', null, { challenge: again.body.challenge, code: await codeNow(secret, 1) })).status).toBe(401);
    const row = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'LOGIN' AND actor_id = 'TF-E2' ORDER BY id DESC").first();
    expect(JSON.parse(row.details)).toEqual({ twoFactor: 'app' });
  });

  it('a recovery code works once, in any case and with or without the dash', async () => {
    const { recoveryCodes } = await enroll('TF-E3');
    const useCode = async (code) => send('POST', '/api/auth/2fa/verify', null, { challenge: (await login('TF-E3')).body.challenge, recovery_code: code });
    const ok = await useCode(recoveryCodes[0].toLowerCase().replace('-', ' '));
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect((await useCode(recoveryCodes[0])).status).toBe(401); // spent
    expect((await useCode(recoveryCodes[1])).status).toBe(200); // another one still works
    expect((await useCode('AAAAA-AAAAA')).status).toBe(401);
  });

  it('wrong codes count toward the lockout like wrong passwords', async () => {
    const { secret } = await enroll('TF-E4');
    const { challenge } = (await login('TF-E4')).body;
    for (let i = 0; i < 5; i++) expect((await send('POST', '/api/auth/2fa/verify', null, { challenge, code: '000000' })).status).toBe(401);
    expect((await env.DB.prepare("SELECT status FROM users WHERE id = 'TF-E4'").first()).status).toBe('LOCKED');
    // Even the right code now fails, and a locked account cannot start a new sign-in.
    expect((await send('POST', '/api/auth/2fa/verify', null, { challenge, code: await codeNow(secret, 1) })).status).toBe(401);
    expect((await login('TF-E4')).status).toBe(423);
  });

  it('the DCC resets a lost setup: the person is signed out, asked to set it up again, and old recovery codes die', async () => {
    const { secret, recoveryCodes, token } = await enroll('TF-E5');
    const dcc = await dccToken();
    // Policy is on and the DCC is not set up, so use the same shortcut as above for the DCC's own gate.
    await env.DB.prepare("UPDATE settings SET value = '0' WHERE key = 'two_factor_for_dcc'").run();
    expect((await send('POST', '/api/users/TF-E5/two-factor/reset', await tokenOf('TF-L3'))).status).toBe(403);
    expect((await send('POST', '/api/users/nobody/two-factor/reset', dcc)).status).toBe(404);
    await new Promise((r) => setTimeout(r, 1100)); // tokens are stamped to the second
    expect((await send('POST', '/api/users/TF-E5/two-factor/reset', dcc)).status).toBe(200);
    await env.DB.prepare("UPDATE settings SET value = '1' WHERE key = 'two_factor_for_dcc'").run();

    expect((await send('GET', '/api/auth/me', token)).status).toBe(401);
    const back = await login('TF-E5');
    expect(back.body.token).toBeTruthy(); // password alone again
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ?').bind('TF-E5').first()).n).toBe(0);
    expect(await env.DB.prepare("SELECT totp_secret, totp_confirmed_at FROM users WHERE id = 'TF-E5'").first()).toEqual({ totp_secret: null, totp_confirmed_at: null });
    const fresh = (await send('POST', '/api/auth/2fa/setup', back.body.token)).body.secret;
    expect(fresh).not.toBe(secret);
    expect(recoveryCodes).toHaveLength(8);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'TWO_FACTOR_RESET' AND json_extract(details, '$.user_id') = 'TF-E5'").first()).n).toBe(1);
  });
});
