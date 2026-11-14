// LOCAL TRYOUT ONLY. A pretend Microsoft sign-in, so the "Sign in with Microsoft" button can be tried on this machine
// before the company has an Azure subscription. It shows a list of the people in the users table; picking one signs
// in as that person, the way Microsoft would after a real password and MFA. It accepts any redirect only if it matches
// the one configured, and it is never started by the real API host (src/node/main.js).
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { sign } from 'hono/jwt';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const startFakeMicrosoft = async ({ port, tenant, clientId, clientSecret, redirectUri, people }) => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'local-tryout-key';
  const priv = { ...privateKey.export({ format: 'jwk' }), alg: 'RS256', kid };
  const pub = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', kid, use: 'sig' };
  const codes = new Map();
  let host = '';

  const html = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Microsoft (จำลอง)</title>
<style>body{font-family:Segoe UI,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#222}li{margin:6px 0}a{color:#0067b8}.box{border:1px solid #ccc;padding:12px 16px;border-radius:8px;background:#fff8e1}</style>${body}`);
  };
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, host);
    const base = `/${tenant}`;
    if (req.method === 'GET' && url.pathname === `${base}/discovery/v2.0/keys`) return json(res, 200, { keys: [pub] });

    if (req.method === 'GET' && url.pathname === `${base}/oauth2/v2.0/authorize`) {
      const q = url.searchParams;
      if (q.get('client_id') !== clientId || q.get('redirect_uri') !== redirectUri || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256') {
        return html(res, 400, '<h1>Request refused</h1><p>The sign-in request does not match the registered application.</p>');
      }
      const keep = (extra) => new URLSearchParams({ state: q.get('state'), nonce: q.get('nonce'), challenge: q.get('code_challenge'), ...extra }).toString();
      const items = people.map((p) => `<li><a href="${base}/oauth2/v2.0/approve?${escapeHtml(keep({ email: p.email }))}">${escapeHtml(p.name)} — ${escapeHtml(p.email)}</a></li>`).join('');
      return html(res, 200, `<h1>Microsoft (จำลอง สำหรับทดลองในเครื่องเท่านั้น)</h1>
<div class="box">ของจริงจะให้กรอกอีเมลบริษัท รหัสผ่าน และยืนยันตัวตนสองขั้นตอน หน้านี้ให้เลือกคนที่จะเข้าสู่ระบบแทน</div>
<h3>เลือกบัญชี</h3><ul>${items}
<li><a href="${base}/oauth2/v2.0/approve?${escapeHtml(keep({ email: 'stranger@not-in-qms.example' }))}">คนนอก (อีเมลที่ไม่อยู่ในระบบ QMS)</a></li></ul>
<p><a href="${base}/oauth2/v2.0/decline?${escapeHtml(keep({}))}">ยกเลิกการเข้าสู่ระบบ</a></p>`);
    }

    if (req.method === 'GET' && (url.pathname === `${base}/oauth2/v2.0/approve` || url.pathname === `${base}/oauth2/v2.0/decline`)) {
      const q = url.searchParams;
      const back = new URL(redirectUri);
      if (url.pathname.endsWith('/decline')) back.searchParams.set('error', 'access_denied');
      else {
        const code = randomBytes(24).toString('base64url');
        codes.set(code, { email: q.get('email'), nonce: q.get('nonce'), challenge: q.get('challenge') });
        back.searchParams.set('code', code);
      }
      back.searchParams.set('state', q.get('state'));
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }

    if (req.method === 'POST' && url.pathname === `${base}/oauth2/v2.0/token`) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const form = Object.fromEntries(new URLSearchParams(raw));
      const entry = codes.get(form.code);
      codes.delete(form.code); // a code works once
      const challenge = createHash('sha256').update(form.code_verifier || '').digest('base64url');
      if (!entry || form.client_id !== clientId || form.client_secret !== clientSecret || form.redirect_uri !== redirectUri || challenge !== entry.challenge) {
        return json(res, 400, { error: 'invalid_grant' });
      }
      const now = Math.floor(Date.now() / 1000);
      const idToken = await sign({ iss: `${host}/${tenant}/v2.0`, aud: clientId, tid: tenant, sub: `sub-${entry.email}`, oid: `oid-${entry.email}`, nonce: entry.nonce, iat: now, nbf: now, exp: now + 3600, preferred_username: entry.email }, priv);
      return json(res, 200, { id_token: idToken, token_type: 'Bearer' });
    }

    return json(res, 404, { error: 'not found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  host = `http://localhost:${server.address().port}`;
  return { host, close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }) };
};
