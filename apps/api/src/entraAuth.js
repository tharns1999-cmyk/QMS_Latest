// Sign-in with the company Microsoft account (Microsoft Entra ID, OpenID Connect authorization code flow with PKCE).
//
// The API does the whole exchange, so the browser never handles a Microsoft token:
//   1. GET /api/auth/entra/login      sends the browser to Microsoft, with a one-off state, nonce and PKCE challenge kept in a
//                                     short-lived signed cookie.
//   2. GET /api/auth/entra/callback   checks the cookie, swaps the code for an ID token (with the client secret), verifies the
//                                     token (signature, issuer, audience, tenant, expiry, nonce), finds the person in the users
//                                     table by company e-mail, and hands the browser OUR session token as before.
// Roles, levels, departments and status stay in our users table; Microsoft only proves who the person is. Nobody is created
// automatically: an e-mail that is not in the table, or whose account is not ACTIVE, is refused.
//
// AUTH_MODE=entra turns this on and turns the password, change-password and two-factor endpoints off. Anything else
// (the default) leaves the password sign-in exactly as it was. With AUTH_MODE=entra and incomplete settings every
// sign-in is refused: it never falls back to passwords.
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify, verifyWithJwks } from 'hono/jwt';

const FLOW_COOKIE = 'qms_entra_flow';
const FLOW_PURPOSE = 'entra_flow';
const FLOW_TTL_SECONDS = 10 * 60;
const KEYS_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isEntraMode = (env) => String(env.AUTH_MODE || '').trim().toLowerCase() === 'entra';

// The settings, and what is wrong with them. The tenant must be one specific directory (a GUID): "common" or "organizations"
// would accept accounts from any company.
export const entraSettings = (env) => {
  const text = (name) => String(env[name] ?? '').trim();
  const settings = {
    host: (text('ENTRA_AUTHORITY_HOST') || 'https://login.microsoftonline.com').replace(/\/$/, ''),
    tenant: text('ENTRA_TENANT_ID'),
    clientId: text('ENTRA_CLIENT_ID'),
    clientSecret: text('ENTRA_CLIENT_SECRET'),
    redirectUri: text('ENTRA_REDIRECT_URI'),
    // Where the browser goes after sign-in. Empty means this same address.
    appBase: text('ENTRA_POST_LOGIN_URL').replace(/\/$/, '')
  };
  const problems = [];
  if (!GUID.test(settings.tenant)) problems.push('ENTRA_TENANT_ID must be the directory (tenant) id, a GUID');
  if (!GUID.test(settings.clientId)) problems.push('ENTRA_CLIENT_ID must be the application (client) id, a GUID');
  if (!settings.clientSecret) problems.push('ENTRA_CLIENT_SECRET is not set');
  if (!/^https?:\/\/[^\s]+\/api\/auth\/entra\/callback$/.test(settings.redirectUri)) problems.push('ENTRA_REDIRECT_URI must be https://<address>/api/auth/entra/callback');
  return { settings, problems };
};

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const randomToken = (bytes) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256Url = async (text) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
const sameText = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const keyCache = new Map();
const signingKeys = async (uri, kid) => {
  const hit = keyCache.get(uri);
  // A key id we have not seen means Microsoft rolled its keys: fetch again once.
  if (hit && Date.now() - hit.at < KEYS_TTL_MS && hit.keys.some((k) => k.kid === kid)) return hit.keys;
  const res = await fetch(uri, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`signing keys request answered ${res.status}`);
  const { keys } = await res.json();
  if (!Array.isArray(keys)) throw new Error('signing keys answer has no keys');
  keyCache.set(uri, { keys, at: Date.now() });
  return keys;
};

const headerKid = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[0].replaceAll('-', '+').replaceAll('_', '/'))).kid;
  } catch {
    return undefined;
  }
};

// The claims of an ID token that Microsoft issued for this application, for this tenant, in answer to this sign-in.
export const verifyIdToken = async (idToken, { settings, nonce }) => {
  const keys = await signingKeys(`${settings.host}/${settings.tenant}/discovery/v2.0/keys`, headerKid(idToken));
  const claims = await verifyWithJwks(idToken, {
    keys,
    allowedAlgorithms: ['RS256'],
    verification: { iss: `${settings.host}/${settings.tenant}/v2.0`, aud: settings.clientId }
  });
  if (String(claims.tid || '').toLowerCase() !== settings.tenant.toLowerCase()) throw new Error('token is for another tenant');
  if (!sameText(claims.nonce, nonce)) throw new Error('nonce does not match this sign-in');
  if (typeof claims.exp !== 'number') throw new Error('token has no expiry');
  return claims;
};

// The company e-mail Microsoft vouches for, in the order of trust: the sign-in name (UPN), then the others.
const emailsOf = (claims) => [...new Set([claims.preferred_username, claims.upn, claims.email].filter((v) => typeof v === 'string' && v.includes('@')).map((v) => v.trim()))];

export const registerEntraRoutes = (app, { audit, issueToken, logEvent, clientIp }) => {
  // Password sign-in, password change and two-factor do not exist in this mode, whatever the request says.
  app.use('/api/auth/*', async (c, next) => {
    if (isEntraMode(c.env)) {
      const path = c.req.path;
      if (path === '/api/auth/login' || path === '/api/auth/change-password' || path.startsWith('/api/auth/2fa/')) {
        return c.json({ code: 'ENTRA_ONLY', error: 'ระบบนี้เข้าสู่ระบบด้วยบัญชี Microsoft ของบริษัทเท่านั้น' }, 403);
      }
    }
    await next();
  });

  // The sign-in page asks this to know which form to show.
  app.get('/api/auth/mode', (c) => {
    if (!isEntraMode(c.env)) return c.json({ mode: 'password' });
    return c.json({ mode: 'entra', configured: entraSettings(c.env).problems.length === 0 });
  });

  const backToApp = (c, settings, hashOrQuery) => c.redirect(`${settings.appBase}/${hashOrQuery}`, 302);

  app.get('/api/auth/entra/login', async (c) => {
    const { settings, problems } = entraSettings(c.env);
    if (!isEntraMode(c.env)) return c.json({ error: 'ไม่พบหน้านี้' }, 404);
    if (problems.length) {
      logEvent('error', 'entra_not_configured', { problems: problems.join('; ') });
      return backToApp(c, settings, '?login_error=entra_not_configured');
    }
    const state = randomToken(16);
    const nonce = randomToken(16);
    const verifier = randomToken(32);
    const now = Math.floor(Date.now() / 1000);
    const flow = await sign({ purpose: FLOW_PURPOSE, state, nonce, verifier, iat: now, exp: now + FLOW_TTL_SECONDS }, c.env.JWT_SECRET, 'HS256');
    setCookie(c, FLOW_COOKIE, flow, {
      path: '/api/auth/entra', httpOnly: true, sameSite: 'Lax', maxAge: FLOW_TTL_SECONDS, secure: settings.redirectUri.startsWith('https://')
    });
    const url = new URL(`${settings.host}/${settings.tenant}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: settings.clientId,
      response_type: 'code',
      redirect_uri: settings.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: await sha256Url(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account'
    }).toString();
    return c.redirect(url.toString(), 302);
  });

  app.get('/api/auth/entra/callback', async (c) => {
    if (!isEntraMode(c.env)) return c.json({ error: 'ไม่พบหน้านี้' }, 404);
    const { settings, problems } = entraSettings(c.env);
    const refuse = (code, why) => {
      logEvent('warn', 'entra_sign_in_refused', { reason: code, detail: why });
      return backToApp(c, settings, `?login_error=${code}`);
    };
    const cookie = getCookie(c, FLOW_COOKIE);
    deleteCookie(c, FLOW_COOKIE, { path: '/api/auth/entra' }); // one sign-in per cookie
    if (problems.length) return refuse('entra_not_configured', problems.join('; '));

    const query = c.req.query();
    if (query.error) return refuse('entra_denied', String(query.error).slice(0, 60));
    const { code, state } = query;
    if (typeof code !== 'string' || typeof state !== 'string' || !code || code.length > 4096 || state.length > 200) return refuse('entra_failed', 'no code or state');

    const flow = cookie && await verify(cookie, c.env.JWT_SECRET, 'HS256').catch(() => null);
    if (!flow || flow.purpose !== FLOW_PURPOSE || !sameText(flow.state, state)) return refuse('entra_failed', 'sign-in was not started here or has expired');

    let claims;
    try {
      const res = await fetch(`${settings.host}/${settings.tenant}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: settings.redirectUri,
          code_verifier: flow.verifier
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok || typeof answer.id_token !== 'string') return refuse('entra_failed', `token request answered ${res.status} ${String(answer.error || '').slice(0, 60)}`);
      claims = await verifyIdToken(answer.id_token, { settings, nonce: flow.nonce });
    } catch (err) {
      return refuse('entra_failed', String(err?.message ?? err).slice(0, 200));
    }

    const db = c.env.DB;
    const ip = clientIp(c);
    const candidates = emailsOf(claims);
    let user = null;
    for (const email of candidates) {
      user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (user) break;
    }
    if (!user) {
      await audit(db, null, 'LOGIN_FAILED', { via: 'entra', reason: 'NO_SUCH_USER', email: candidates[0] ?? null, oid: claims.oid ?? null, ip }).run();
      return backToApp(c, settings, '?login_error=entra_no_user');
    }
    if (user.status !== 'ACTIVE') {
      await audit(db, user.id, 'LOGIN_FAILED', { via: 'entra', reason: `ACCOUNT_${user.status}`, oid: claims.oid ?? null, ip }).run();
      return backToApp(c, settings, '?login_error=entra_inactive');
    }

    await audit(db, user.id, 'LOGIN', { via: 'entra', oid: claims.oid ?? null, ip }).run();
    // The token goes in the fragment: a fragment is never sent to any server or written to a log, and the page removes it at once.
    return backToApp(c, settings, `#entra_token=${await issueToken(c.env.JWT_SECRET, user.id)}`);
  });
};
