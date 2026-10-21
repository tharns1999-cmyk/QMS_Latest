import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { sign, verify } from 'hono/jwt';
import { hashPassword, verifyPassword } from './password.js';
import { checkDecisionRights, getThresholds } from './approval.js';
import { newSecret, verifyCode, otpauthUri } from './totp.js';

const MAX_FAILED_LOGINS = 5;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const MAX_FAILED_LOGINS_PER_IP = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const INVALID_LOGIN = { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
const TOO_MANY_FAILURES = { error: 'พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' };
const TWO_FACTOR_PURPOSE = '2fa';
const TWO_FACTOR_ISSUER = 'QMS Portal';
const CHALLENGE_TTL_SECONDS = 5 * 60;
const RECOVERY_CODE_COUNT = 8;

const app = new Hono();

// This API only returns JSON and PDFs, so it needs no scripts, frames or subresources of its own.
app.use('*', secureHeaders({ xFrameOptions: 'DENY', contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }));

app.use('/api/*', (c, next) => cors({ origin: c.env.ALLOWED_ORIGIN.split(',') })(c, next));

const audit = (db, actorId, action, details) =>
  db.prepare('INSERT INTO audit_log (actor_id, action, details) VALUES (?, ?, ?)').bind(actorId, action, JSON.stringify(details));

// Who must use two-factor is read from the settings table (the DCC edits it), so nothing about levels or roles is fixed here.
const loadSecurityPolicy = async (db) => {
  const { results } = await db.prepare("SELECT key, value FROM settings WHERE key IN ('two_factor_min_level', 'two_factor_for_dcc')").all();
  const value = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return { twoFactorMinLevel: Number(value.two_factor_min_level) || 0, twoFactorForDcc: value.two_factor_for_dcc === '1' };
};
const twoFactorRequired = (row, policy) => (policy.twoFactorForDcc && row.is_dcc === 1) || (policy.twoFactorMinLevel > 0 && row.approval_level >= policy.twoFactorMinLevel);

const toPublicUser = (row, policy) => ({
  id: row.id,
  empId: row.emp_id,
  name: row.name,
  email: row.email,
  role: row.role,
  approval_level: row.approval_level,
  department: row.primary_department,
  depts: JSON.parse(row.departments),
  isDcc: row.is_dcc === 1,
  isQmr: row.is_qmr === 1,
  mustChangePassword: row.must_change_password === 1,
  twoFactorEnabled: Boolean(row.totp_confirmed_at),
  // Only known when the policy is passed; true until the person has finished setting it up.
  ...(policy && { twoFactorRequired: twoFactorRequired(row, policy), mustSetUpTwoFactor: twoFactorRequired(row, policy) && !row.totp_confirmed_at })
});

const issueChallenge = (secret, userId) => {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, purpose: TWO_FACTOR_PURPOSE, iat: now, exp: now + CHALLENGE_TTL_SECONDS }, secret, 'HS256');
};

// Recovery codes look like ABCDE-FGHJK; only a hash of the normalised form is stored.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRecoveryCode = () => {
  const chars = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
};
const recoveryHash = async (code) => {
  const bytes = new TextEncoder().encode(String(code).replace(/[\s-]/g, '').toUpperCase());
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
};

const issueToken = (secret, userId) => {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, iat: now, exp: now + TOKEN_TTL_SECONDS }, secret, 'HS256');
};

// Five bad passwords lock the account; the same count applies to a wrong "current password" on a change.
const recordFailedLogin = (db, user, details) => db.batch([
  db.prepare(`UPDATE users SET failed_logins = failed_logins + 1,
    status = CASE WHEN status = 'ACTIVE' AND failed_logins + 1 >= ? THEN 'LOCKED' ELSE status END
    WHERE id = ?`).bind(MAX_FAILED_LOGINS, user.id),
  audit(db, user.id, 'LOGIN_FAILED', { failed_logins: user.failed_logins + 1, ...details })
]);

// Cloudflare always sets the IP header; it is absent only in local dev and tests, where the limit is skipped.
const tooManyFailures = async (db, ip) => {
  if (!ip) return false;
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'LOGIN_FAILED' AND at > ? AND json_extract(details, '$.ip') = ?").bind(since, ip).first();
  return n >= MAX_FAILED_LOGINS_PER_IP;
};

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return c.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, 400);

  const db = c.env.DB;
  const ip = c.req.header('cf-connecting-ip');
  if (await tooManyFailures(db, ip)) return c.json(TOO_MANY_FAILURES, 429, { 'Retry-After': String(LOGIN_WINDOW_MS / 1000) });
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const passwordOk = await verifyPassword(password, user?.password_hash);

  if (!user) {
    await audit(db, null, 'LOGIN_FAILED', { email, ip }).run();
    return c.json(INVALID_LOGIN, 401);
  }
  if (!passwordOk) {
    await recordFailedLogin(db, user, { ip });
    return c.json(INVALID_LOGIN, 401);
  }
  if (user.status === 'LOCKED') return c.json({ error: 'บัญชีถูกล็อก กรุณาติดต่อ DCC' }, 423);
  if (user.status !== 'ACTIVE') return c.json({ error: 'บัญชีถูกปิดใช้งาน' }, 403);
  // Anyone who has set up two-factor is asked for the second step, whether or not the policy requires it of them.
  if (user.totp_confirmed_at) return c.json({ twoFactorRequired: true, challenge: await issueChallenge(c.env.JWT_SECRET, user.id) });

  await db.batch([
    db.prepare('UPDATE users SET failed_logins = 0 WHERE id = ?').bind(user.id),
    audit(db, user.id, 'LOGIN', {})
  ]);
  return c.json({ token: await issueToken(c.env.JWT_SECRET, user.id), user: toPublicUser(user, await loadSecurityPolicy(db)) });
});

const PASSWORD_CHANGE_PATHS = ['/api/auth/me', '/api/auth/change-password'];
// Someone who must use two-factor but has not set it up yet can do only this until they have.
const TWO_FACTOR_SETUP_PATHS = [...PASSWORD_CHANGE_PATHS, '/api/auth/2fa/setup', '/api/auth/2fa/confirm'];

// The token carries only the user id; role, level and status are re-read so a lock or demotion applies at once.
export const requireAuth = async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
  const payload = token && await verify(token, c.env.JWT_SECRET, 'HS256').catch(() => null);
  // A token made for the second sign-in step is not a session.
  const user = payload && !payload.purpose && await c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'").bind(payload.sub).first();
  // A password change signs out every token issued before it.
  if (!user || !(payload.iat >= user.password_changed_at)) return c.json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  if (user.must_change_password && !PASSWORD_CHANGE_PATHS.includes(c.req.path)) {
    return c.json({ error: 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน', code: 'PASSWORD_CHANGE_REQUIRED' }, 403);
  }
  const publicUser = toPublicUser(user, await loadSecurityPolicy(c.env.DB));
  if (publicUser.mustSetUpTwoFactor && !TWO_FACTOR_SETUP_PATHS.includes(c.req.path)) {
    return c.json({ error: 'กรุณาตั้งค่าการยืนยันตัวตนสองขั้นตอนก่อนใช้งาน', code: 'TWO_FACTOR_SETUP_REQUIRED' }, 403);
  }
  c.set('user', publicUser);
  await next();
};

app.get('/api/auth/me', requireAuth, (c) => c.json({ user: c.get('user') }));

app.post('/api/auth/change-password', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const current = typeof body.current_password === 'string' ? body.current_password : '';
  const next = typeof body.new_password === 'string' ? body.new_password : '';
  const db = c.env.DB;
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(c.get('user').id).first();

  if (!(await verifyPassword(current, user.password_hash))) {
    await recordFailedLogin(db, user, { via: 'change-password', ip: c.req.header('cf-connecting-ip') });
    return c.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, 400);
  }
  if (next.length < MIN_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH) {
    return c.json({ error: `รหัสผ่านใหม่ต้องยาว ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} ตัวอักษร` }, 400);
  }
  if (next === current) return c.json({ error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' }, 400);

  await db.batch([
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, failed_logins = 0, password_changed_at = ? WHERE id = ?')
      .bind(await hashPassword(next), Math.floor(Date.now() / 1000), user.id),
    audit(db, user.id, 'PASSWORD_CHANGED', {})
  ]);
  // The old token dies with the change, so the caller gets a fresh one.
  return c.json({ token: await issueToken(c.env.JWT_SECRET, user.id), user: toPublicUser({ ...user, must_change_password: 0 }, await loadSecurityPolicy(db)) });
});

// Directory for routing DARs and showing who signed, no credentials. Deactivated people stay so old records still show their names;
// the pages offer only status ACTIVE for new routing, and the server refuses anyone else.
app.get('/api/users', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM users WHERE status IN ('ACTIVE', 'INACTIVE') ORDER BY name").all();
  return c.json({ users: results.map((r) => ({ ...toPublicUser(r), status: r.status })) });
});

app.get('/api/approval-matrix', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM approval_matrix ORDER BY doc_type').all();
  return c.json({ matrix: results });
});

app.put('/api/approval-matrix/:docType', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user.isDcc) return c.json({ error: 'เฉพาะ DCC เท่านั้นที่แก้ไข Approval Matrix ได้' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const levels = ['min_requester_level', 'required_reviewer_level', 'required_approver_level'].map((k) => body[k]);
  if (!levels.every((l) => Number.isInteger(l) && l >= 1 && l <= 8)) return c.json({ error: 'ระดับต้องเป็นจำนวนเต็ม 1-8' }, 400);
  const [requester, reviewer, approver] = levels;
  if (approver < reviewer) return c.json({ error: 'ระดับผู้อนุมัติต้องไม่ต่ำกว่าผู้ทบทวน' }, 400);

  const db = c.env.DB;
  const docType = c.req.param('docType').toUpperCase();
  const before = await db.prepare('SELECT * FROM approval_matrix WHERE doc_type = ?').bind(docType).first();
  if (!before) return c.json({ error: 'ไม่พบประเภทเอกสารนี้' }, 404);
  // Optional higher approver level for retiring a document of this type: omitted keeps it, null clears it.
  const obsolete = body.obsolete_approver_level === undefined ? before.obsolete_approver_level : body.obsolete_approver_level;
  if (obsolete !== null && !(Number.isInteger(obsolete) && obsolete >= approver && obsolete <= 8)) return c.json({ error: 'ระดับผู้อนุมัติกรณียกเลิกเอกสารต้องไม่ต่ำกว่าผู้อนุมัติปกติ และไม่เกิน 8' }, 400);

  await db.batch([
    db.prepare(`UPDATE approval_matrix SET min_requester_level = ?, required_reviewer_level = ?, required_approver_level = ?, obsolete_approver_level = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by = ? WHERE doc_type = ?`).bind(requester, reviewer, approver, obsolete, user.id, docType),
    audit(db, user.id, 'APPROVAL_MATRIX_UPDATED', {
      doc_type: docType,
      before: { min_requester_level: before.min_requester_level, required_reviewer_level: before.required_reviewer_level, required_approver_level: before.required_approver_level, obsolete_approver_level: before.obsolete_approver_level },
      after: { min_requester_level: requester, required_reviewer_level: reviewer, required_approver_level: approver, obsolete_approver_level: obsolete }
    })
  ]);
  return c.json({ entry: await db.prepare('SELECT * FROM approval_matrix WHERE doc_type = ?').bind(docType).first() });
});

const DOC_STATUSES = ['EFFECTIVE', 'SUPERSEDED', 'OBSOLETE'];
// GENERAL documents are open to everyone; DEPT documents only to their department, DCC and QMR.
const VISIBLE_TO = `(access_scope = 'GENERAL' OR department IN (SELECT value FROM json_each(?)) OR ?)`;
const visibilityArgs = (user) => [JSON.stringify([...user.depts, user.department]), user.isDcc || user.isQmr ? 1 : 0];

// One status per request: Active, Superseded and Obsolete lists are never mixed (ISO 9001 7.5.3).
// At most DOC_PAGE documents come back; `more` says to ask again with offset, so one request stays small however many documents there are.
const DOC_PAGE = 500;
app.get('/api/documents', requireAuth, async (c) => {
  await activateDue(c.env.DB);
  const status = (c.req.query('status') || 'EFFECTIVE').toUpperCase();
  if (!DOC_STATUSES.includes(status)) return c.json({ error: 'สถานะเอกสารไม่ถูกต้อง' }, 400);
  const offset = Math.max(0, Math.floor(Number(c.req.query('offset'))) || 0);
  const { results } = await c.env.DB.prepare(`SELECT * FROM documents WHERE status = ? AND ${VISIBLE_TO} ORDER BY doc_code, revision LIMIT ? OFFSET ?`)
    .bind(status, ...visibilityArgs(c.get('user')), DOC_PAGE + 1, offset).all();
  return c.json({ documents: results.slice(0, DOC_PAGE), more: results.length > DOC_PAGE });
});

app.get('/api/documents/:id', requireAuth, async (c) => {
  const doc = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND ${VISIBLE_TO}`)
    .bind(c.req.param('id'), ...visibilityArgs(c.get('user'))).first();
  // 404 rather than 403 so a hidden document's existence is not revealed.
  return doc ? c.json({ document: doc }) : c.json({ error: 'ไม่พบเอกสาร' }, 404);
});

const MAX_PDF_BYTES = 25 * 1024 * 1024; // matches the limit the upload forms state
// Every read of a file is audited, with why it was read. The web says which (default: looking at it on screen); the audit action is the one place a purpose is mapped.
const FILE_PURPOSE_ACTION = { view: 'DOCUMENT_VIEWED', download: 'DOCUMENT_DOWNLOADED' };
const DEFAULT_FILE_PURPOSE = 'view';

// `source` is where the file lives ('document' or 'dar'); the row is written before the file is handed over, so no read goes unrecorded.
const servePdf = async (c, key, filename, source) => {
  const purpose = c.req.query('purpose') || DEFAULT_FILE_PURPOSE;
  if (!Object.hasOwn(FILE_PURPOSE_ACTION, purpose)) return c.json({ error: 'วัตถุประสงค์ในการเปิดไฟล์ไม่ถูกต้อง' }, 400);
  const obj = key && await c.env.FILES.get(key);
  if (!obj) return c.json({ error: 'ไม่พบไฟล์' }, 404);
  await audit(c.env.DB, c.get('user').id, FILE_PURPOSE_ACTION[purpose], { source: source.kind, id: source.id, doc_code: source.doc_code, revision: source.revision, status: source.status }).run();
  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}.pdf"`, 'Cache-Control': 'private, no-store' }
  });
};

app.get('/api/documents/:id/file', requireAuth, async (c) => {
  const user = c.get('user');
  const doc = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND ${VISIBLE_TO}`).bind(c.req.param('id'), ...visibilityArgs(user)).first();
  if (!doc) return c.json({ error: 'ไม่พบเอกสาร' }, 404);
  // Superseded and obsolete copies stay with DCC/QMR so they cannot be used by mistake (ISO 9001 7.5.3).
  if (doc.status !== 'EFFECTIVE' && !user.isDcc && !user.isQmr) return c.json({ error: 'เอกสารนี้ไม่มีผลบังคับใช้แล้ว' }, 403);
  return servePdf(c, doc.file_key, `${doc.doc_code}_Rev${doc.revision}`, { kind: 'document', id: doc.id, doc_code: doc.doc_code, revision: doc.revision, status: doc.status });
});

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
const DAR_TYPES = ['NEW', 'REVISION', 'OBSOLETE'];
const STAGE_BY_STATUS = { PENDING_REVIEW: 'REVIEW', PENDING_APPROVAL: 'APPROVE' };
const nextRevision = (rev) => String(Number(rev) + 1).padStart(rev.length, '0');
const isLockConflict = (err) => /UNIQUE/.test(String(err?.message));

// Visible to the people named on the DAR and to DCC.
const DAR_VISIBLE_TO = `(? IN (requester_id, reviewer_id, approver_id) OR ?)`;
const darVisibilityArgs = (user) => [user.id, user.isDcc ? 1 : 0];

app.post('/api/dars', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const str = (k) => (typeof body[k] === 'string' ? body[k].trim() : '');
  const type = str('type').toUpperCase();
  const docCode = str('doc_code').toUpperCase();
  if (!DAR_TYPES.includes(type)) return c.json({ error: 'ประเภทคำขอไม่ถูกต้อง' }, 400);
  if (!str('reason')) return c.json({ error: 'กรุณาระบุเหตุผลของคำขอ' }, 400);
  const effectiveDate = str('effective_date') || null;
  if (effectiveDate && !(/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && !Number.isNaN(Date.parse(effectiveDate)))) return c.json({ error: 'วันที่มีผลบังคับใช้ไม่ถูกต้อง' }, 400);
  // Printed copies only for NEW/REVISION; the web sends copy 01 (the owner's office) first.
  const text = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
  const rawDist = type !== 'OBSOLETE' && Array.isArray(body.distributions) ? body.distributions : [];
  const distributions = rawDist.map((d) => ({ department: text(d?.department, 20)?.toUpperCase(), location_id: text(d?.location_id, 100), location_name: text(d?.location_name, 200) }));
  if (distributions.length > 50 || distributions.some((d) => !d.department || !d.location_name)) return c.json({ error: 'จุดแจกจ่ายสำเนาไม่ถูกต้อง' }, 400);
  // Who must read and acknowledge the document once it is in force (any active user, not the requester).
  const ackIds = Array.isArray(body.ack_user_ids) ? [...new Set(body.ack_user_ids)] : [];
  if (ackIds.length > 50 || ackIds.some((id) => typeof id !== 'string' || !id || id === user.id)) return c.json({ error: 'รายชื่อผู้รับทราบไม่ถูกต้อง' }, 400);
  if (ackIds.length) {
    const found = await db.prepare(`SELECT count(*) AS n FROM users WHERE status = 'ACTIVE' AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ackIds)).first();
    if (found.n !== ackIds.length) return c.json({ error: 'ไม่พบผู้รับทราบบางรายในระบบ' }, 400);
  }

  // NEW takes its metadata from the request and its code from the server; REVISION/OBSOLETE take both from the effective document.
  let doc;
  if (type === 'NEW') {
    const scope = str('access_scope').toUpperCase() || 'DEPT';
    if (!str('name') || !str('doc_type') || !str('department')) return c.json({ error: 'กรุณากรอกชื่อ ประเภท และแผนกของเอกสาร' }, 400);
    if (!['GENERAL', 'DEPT'].includes(scope)) return c.json({ error: 'ขอบเขตการเข้าถึงไม่ถูกต้อง' }, 400);
    doc = { doc_type: str('doc_type').toUpperCase(), department: str('department').toUpperCase(), name: str('name'), access_scope: scope, revision: '00' };
    // They become the code prefix, which is matched with GLOB below.
    if (!/^[A-Z0-9]+$/.test(doc.doc_type) || !/^[A-Z0-9&]+$/.test(doc.department)) return c.json({ error: 'ประเภทหรือแผนกของเอกสารไม่ถูกต้อง' }, 400);
    // Once the DCC has edited the list, a new document must use a type that is still open.
    const types = await loadJsonSetting(db, 'document_types');
    if (types && !types.some((t) => t.code === doc.doc_type && t.status !== 'INACTIVE')) return c.json({ error: `ประเภทเอกสาร ${doc.doc_type} ถูกปิดหรือไม่มีในระบบ` }, 400);
  } else {
    if (!/^[A-Z0-9-]+$/.test(docCode)) return c.json({ error: 'รหัสเอกสารไม่ถูกต้อง' }, 400);
    const current = await db.prepare("SELECT * FROM documents WHERE doc_code = ? AND status = 'EFFECTIVE'").bind(docCode).first();
    if (!current) return c.json({ error: 'ไม่พบเอกสารฉบับที่มีผลบังคับใช้' }, 404);
    doc = { ...current, name: type === 'REVISION' && str('name') ? str('name') : current.name, revision: type === 'REVISION' ? nextRevision(current.revision) : null };
  }

  if (!user.depts.includes(doc.department) && user.department !== doc.department) return c.json({ error: 'ต้องเป็นสมาชิกแผนกเจ้าของเอกสาร' }, 403);
  // External documents: where it came from, which edition, how often to review. A revision inherits what it does not restate.
  const isExternal = doc.doc_type === 'ED';
  const cycle = Number(body.review_cycle_months);
  if (isExternal && body.review_cycle_months != null && !(Number.isInteger(cycle) && cycle >= 1 && cycle <= 120)) return c.json({ error: 'รอบการทบทวนต้องเป็นจำนวนเดือน 1-120' }, 400);
  const ext = isExternal ? {
    issuer: text(body.issuer, 200) ?? doc.ext_issuer ?? null,
    edition: text(body.edition, 100) ?? doc.ext_edition ?? null,
    cycle: body.review_cycle_months != null ? cycle : (doc.review_cycle_months ?? 12)
  } : { issuer: null, edition: null, cycle: null };
  const thresholds = await getThresholds(db, doc.doc_type, type);
  if (user.approval_level < thresholds.min_requester_level) return c.json({ error: `ผู้ขอต้องมีระดับ L${thresholds.min_requester_level} ขึ้นไป` }, 403);

  // Check the named reviewer and approver against the matrix now, so a DAR cannot be routed to someone who may not sign it.
  const reviewerId = str('reviewer_id');
  const approverId = str('approver_id');
  const { results } = await db.prepare("SELECT * FROM users WHERE id IN (?, ?) AND status = 'ACTIVE'").bind(reviewerId, approverId).all();
  const find = (id) => results.find((u) => u.id === id);
  if (!find(reviewerId) || !find(approverId)) return c.json({ error: 'ไม่พบผู้ทบทวนหรือผู้อนุมัติ' }, 400);
  const decision = { department: doc.department, requesterId: user.id, reviewerId };
  const problem = checkDecisionRights(toPublicUser(find(reviewerId)), { ...decision, stage: 'REVIEW' }, thresholds)
    ?? checkDecisionRights(toPublicUser(find(approverId)), { ...decision, stage: 'APPROVE' }, thresholds);
  if (problem) return c.json({ error: problem }, 400);

  // A NEW code is TYPE-DEPT-NN, one past the highest number ever issued (documents and DARs, rejected ones included),
  // so numbers are never reused. It is computed inside the INSERT, so concurrent requests cannot take the same number.
  const prefix = `${doc.doc_type}-${doc.department}-`;
  const [codeSql, codeArgs] = type === 'NEW'
    ? [`? || printf('%02d', 1 + (SELECT COALESCE(MAX(CAST(substr(doc_code, length(?) + 1) AS INTEGER)), 0)
        FROM (SELECT doc_code FROM documents UNION ALL SELECT doc_code FROM dars) WHERE doc_code GLOB ? || '[0-9]*'))`, [prefix, prefix, prefix]]
    : ['?', [docCode]];
  try {
    const [inserted] = await db.batch([
      db.prepare(`INSERT INTO dars (type, doc_code, doc_type, department, revision, name, access_scope, reason, requester_id, reviewer_id, approver_id, effective_date, distributions, ack_user_ids, ext_issuer, ext_edition, review_cycle_months)
        VALUES (?, ${codeSql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
        .bind(type, ...codeArgs, doc.doc_type, doc.department, doc.revision, doc.name, doc.access_scope, str('reason'), user.id, reviewerId, approverId, effectiveDate, JSON.stringify(distributions), ackIds.length ? JSON.stringify(ackIds) : null, ext.issuer, ext.edition, ext.cycle),
      db.prepare(`INSERT INTO audit_log (actor_id, action, details)
        SELECT ?, 'DAR_SUBMITTED', json_object('type', type, 'doc_code', doc_code, 'dar_id', id) FROM dars WHERE id = last_insert_rowid()`).bind(user.id)
    ]);
    return c.json({ dar: inserted.results[0] }, 201);
  } catch (err) {
    if (isLockConflict(err)) return c.json({ error: 'เอกสารนี้มีคำขอ DAR ที่ยังดำเนินการอยู่' }, 409);
    throw err;
  }
});

app.get('/api/dars', requireAuth, async (c) => {
  await activateDue(c.env.DB);
  const status = c.req.query('status')?.toUpperCase();
  const { results } = await c.env.DB.prepare(`SELECT * FROM dars WHERE (? IS NULL OR status = ?) AND ${DAR_VISIBLE_TO} ORDER BY id DESC`)
    .bind(status ?? null, status ?? null, ...darVisibilityArgs(c.get('user'))).all();
  return c.json({ dars: results });
});

app.get('/api/dars/:id', requireAuth, async (c) => {
  const dar = await c.env.DB.prepare(`SELECT * FROM dars WHERE id = ? AND ${DAR_VISIBLE_TO}`).bind(c.req.param('id'), ...darVisibilityArgs(c.get('user'))).first();
  return dar ? c.json({ dar }) : c.json({ error: 'ไม่พบคำขอ' }, 404);
});

app.get('/api/dars/:id/file', requireAuth, async (c) => {
  const dar = await c.env.DB.prepare(`SELECT * FROM dars WHERE id = ? AND ${DAR_VISIBLE_TO}`).bind(c.req.param('id'), ...darVisibilityArgs(c.get('user'))).first();
  if (!dar) return c.json({ error: 'ไม่พบคำขอ' }, 404);
  return servePdf(c, dar.file_key, `${dar.doc_code}_Rev${dar.revision}_DAR${dar.id}`, { kind: 'dar', id: dar.id, doc_code: dar.doc_code, revision: dar.revision, status: dar.status });
});

// The requester attaches the PDF before review, so reviewer and approver sign off on this exact file.
app.put('/api/dars/:id/file', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const dar = await db.prepare('SELECT * FROM dars WHERE id = ?').bind(c.req.param('id')).first();
  if (!dar) return c.json({ error: 'ไม่พบคำขอ' }, 404);
  if (dar.requester_id !== user.id) return c.json({ error: 'เฉพาะผู้ขอเท่านั้นที่แนบไฟล์ได้' }, 403);
  if (dar.type === 'OBSOLETE') return c.json({ error: 'คำขอยกเลิกเอกสารไม่ต้องแนบไฟล์' }, 400);
  if (dar.status !== 'PENDING_REVIEW') return c.json({ error: 'แนบไฟล์ได้เฉพาะก่อนการทบทวน' }, 409);
  if (Number(c.req.header('content-length')) > MAX_PDF_BYTES) return c.json({ error: 'ไฟล์ต้องไม่เกิน 25 MB' }, 413);
  const file = await c.req.arrayBuffer();
  if (file.byteLength > MAX_PDF_BYTES) return c.json({ error: 'ไฟล์ต้องไม่เกิน 25 MB' }, 413);
  if (new TextDecoder().decode(file.slice(0, 5)) !== '%PDF-') return c.json({ error: 'ไฟล์ต้องเป็น PDF' }, 400);

  // A fresh key per upload, so an object a reviewer may already have opened is never overwritten.
  const key = `dars/${dar.id}/${crypto.randomUUID()}.pdf`;
  await c.env.FILES.put(key, file, { httpMetadata: { contentType: 'application/pdf' } });
  const [updated] = await db.batch([
    db.prepare("UPDATE dars SET file_key = ? WHERE id = ? AND status = 'PENDING_REVIEW' RETURNING *").bind(key, dar.id),
    db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
      .bind(user.id, 'DAR_FILE_ATTACHED', JSON.stringify({ dar_id: dar.id, bytes: file.byteLength }))
  ]);
  if (!updated.results.length) {
    await c.env.FILES.delete(key);
    return c.json({ error: 'แนบไฟล์ได้เฉพาะก่อนการทบทวน' }, 409);
  }
  // The replaced file was never reviewed, so it is not a record worth keeping.
  if (dar.file_key) await c.env.FILES.delete(dar.file_key);
  return c.json({ dar: updated.results[0] });
});

// A returned DAR waits for its requester: they fix it (name, reason, date, or a new file through the file route) and resubmit,
// which starts review again, or withdraw it, which frees the document.
app.post('/api/dars/:id/resubmit', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const dar = await db.prepare('SELECT * FROM dars WHERE id = ?').bind(c.req.param('id')).first();
  if (!dar) return c.json({ error: 'ไม่พบคำขอ' }, 404);
  if (dar.requester_id !== user.id) return c.json({ error: 'เฉพาะผู้ขอเท่านั้นที่ยื่นคำขอใหม่ได้' }, 403);
  if (!dar.awaiting_requester) return c.json({ error: 'คำขอนี้ไม่ได้ถูกส่งกลับ' }, 409);
  const text = (k, max) => (typeof body[k] === 'string' && body[k].trim() && body[k].trim().length <= max ? body[k].trim() : null);
  const date = text('effective_date', 10);
  if (date && !(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)))) return c.json({ error: 'วันที่มีผลบังคับใช้ไม่ถูกต้อง' }, 400);
  if (dar.type !== 'OBSOLETE' && !dar.file_key) return c.json({ error: 'กรุณาแนบไฟล์ PDF ก่อนยื่นใหม่' }, 409);
  // The name of an existing document is not the requester's to change on a withdrawal.
  const name = dar.type === 'OBSOLETE' ? null : text('name', 300);
  const [updated] = await db.batch([
    db.prepare(`UPDATE dars SET awaiting_requester = 0, name = COALESCE(?, name), reason = COALESCE(?, reason), effective_date = COALESCE(?, effective_date)
      WHERE id = ? AND awaiting_requester = 1 RETURNING *`).bind(name, text('reason', 2000), date, dar.id),
    db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
      .bind(user.id, 'DAR_RESUBMITTED', JSON.stringify({ dar_id: dar.id, doc_code: dar.doc_code, return_count: dar.return_count }))
  ]);
  if (!updated.results.length) return c.json({ error: 'คำขอนี้ถูกยื่นใหม่ไปแล้ว กรุณาโหลดใหม่' }, 409);
  return c.json({ dar: updated.results[0] });
});

app.post('/api/dars/:id/withdraw', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const dar = await db.prepare('SELECT * FROM dars WHERE id = ?').bind(c.req.param('id')).first();
  if (!dar) return c.json({ error: 'ไม่พบคำขอ' }, 404);
  if (dar.requester_id !== user.id) return c.json({ error: 'เฉพาะผู้ขอเท่านั้นที่ยกเลิกคำขอได้' }, 403);
  if (!dar.awaiting_requester) return c.json({ error: 'ยกเลิกได้เฉพาะคำขอที่ถูกส่งกลับให้แก้ไข' }, 409);
  const [updated] = await db.batch([
    db.prepare(`UPDATE dars SET status = 'REJECTED', awaiting_requester = 0, reject_comment = 'ผู้ขอยกเลิกคำขอ' WHERE id = ? AND awaiting_requester = 1 RETURNING *`).bind(dar.id),
    db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
      .bind(user.id, 'DAR_WITHDRAWN', JSON.stringify({ dar_id: dar.id, doc_code: dar.doc_code })),
    // Same as a rejection: a periodic review that asked for this DAR is free to be redone.
    db.prepare(`UPDATE periodic_reviews SET status = 'CANCELLED', decided_at = ${NOW}, decision_comment = 'ผู้ขอยกเลิก DAR'
      WHERE doc_code = ? AND status = 'AWAITING_ACTION' AND (SELECT status FROM dars WHERE id = ?) = 'REJECTED'`).bind(dar.doc_code, dar.id)
  ]);
  if (!updated.results.length) return c.json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว กรุณาโหลดใหม่' }, 409);
  return c.json({ dar: updated.results[0] });
});

app.post('/api/dars/:id/decision', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  if (!['APPROVE', 'REJECT', 'RETURN'].includes(body.decision)) return c.json({ error: 'ผลการพิจารณาต้องเป็น APPROVE, REJECT หรือ RETURN' }, 400);
  if (body.decision !== 'APPROVE' && !comment) return c.json({ error: body.decision === 'RETURN' ? 'กรุณาระบุสิ่งที่ต้องแก้ไข' : 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' }, 400);

  const dar = await db.prepare('SELECT * FROM dars WHERE id = ?').bind(c.req.param('id')).first();
  if (!dar) return c.json({ error: 'ไม่พบคำขอ' }, 404);
  const stage = STAGE_BY_STATUS[dar.status];
  if (!stage) return c.json({ error: 'คำขอนี้ไม่อยู่ในขั้นตอนพิจารณา' }, 409);
  if (dar.awaiting_requester) return c.json({ error: 'คำขอนี้ถูกส่งกลับแล้ว รอผู้ขอแก้ไขและยื่นใหม่' }, 409);
  if (user.id !== (stage === 'REVIEW' ? dar.reviewer_id : dar.approver_id)) return c.json({ error: 'คุณไม่ได้รับมอบหมายให้พิจารณาคำขอนี้' }, 403);
  // Re-checked at decision time: the user's level or the matrix may have changed since submission.
  const problem = checkDecisionRights(user, { stage, department: dar.department, requesterId: dar.requester_id, reviewerId: dar.reviewer_id }, await getThresholds(db, dar.doc_type, dar.type));
  if (problem) return c.json({ error: problem }, 403);
  if (body.decision === 'APPROVE' && dar.type !== 'OBSOLETE' && !dar.file_key) return c.json({ error: 'ผู้ขอยังไม่ได้แนบไฟล์ PDF' }, 409);

  if (body.decision === 'RETURN') {
    const [returned] = await db.batch([
      db.prepare(`UPDATE dars SET status = 'PENDING_REVIEW', awaiting_requester = 1, returned_at = ${NOW}, returned_by = ?, return_comment = ?, return_count = return_count + 1, reviewed_at = NULL, approved_at = NULL
        WHERE id = ? AND status = ? AND awaiting_requester = 0 RETURNING *`).bind(user.id, comment, dar.id, dar.status),
      db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
        .bind(user.id, 'DAR_RETURNED', JSON.stringify({ dar_id: dar.id, doc_code: dar.doc_code, stage, comment }))
    ]);
    if (!returned.results.length) return c.json({ error: 'คำขอนี้ถูกพิจารณาไปแล้ว กรุณาโหลดใหม่' }, 409);
    return c.json({ dar: returned.results[0] });
  }

  const next = body.decision === 'REJECT' ? 'REJECTED' : stage === 'REVIEW' ? 'PENDING_APPROVAL' : 'PENDING_DCC';
  const stamp = stage === 'REVIEW' ? 'reviewed_at' : 'approved_at';
  // The status guard in WHERE makes a double click or a race a no-op instead of a second decision;
  // the file guard stops an approval landing on a PDF swapped in after it was read.
  const [updated] = await db.batch([
    db.prepare(`UPDATE dars SET status = ?, ${stamp} = ${NOW}, reject_comment = ? WHERE id = ? AND status = ? AND file_key IS ? RETURNING *`)
      .bind(next, comment || null, dar.id, dar.status, dar.file_key),
    db.prepare(`INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0`)
      .bind(user.id, body.decision === 'REJECT' ? 'DAR_REJECTED' : stage === 'REVIEW' ? 'DAR_REVIEWED' : 'DAR_APPROVED', JSON.stringify({ dar_id: dar.id, comment })),
    // A periodic review that asked for this revision or withdrawal is free to be redone.
    db.prepare(`UPDATE periodic_reviews SET status = 'CANCELLED', decided_at = ${NOW}, decision_comment = 'DAR ไม่ผ่านการพิจารณา'
      WHERE doc_code = ? AND status = 'AWAITING_ACTION' AND (SELECT status FROM dars WHERE id = ?) = 'REJECTED'`).bind(dar.doc_code, dar.id)
  ]);
  if (!updated.results.length) return c.json({ error: 'คำขอนี้ถูกพิจารณาหรือเปลี่ยนไฟล์ไปแล้ว กรุณาโหลดใหม่' }, 409);
  if (next === 'PENDING_DCC') {
    await activateDue(db);
    return c.json({ dar: await db.prepare('SELECT * FROM dars WHERE id = ?').bind(dar.id).first() });
  }
  // Uploads stop once the DAR leaves PENDING_REVIEW (a late one deletes its own object), so any other
  // object under this DAR is an orphan from concurrent uploads or a failed write: sweep it now.
  if (stage === 'REVIEW') {
    const { objects } = await c.env.FILES.list({ prefix: `dars/${dar.id}/` });
    const orphans = objects.map((o) => o.key).filter((key) => key !== dar.file_key);
    if (orphans.length) await c.env.FILES.delete(orphans);
  }
  return c.json({ dar: updated.results[0] });
});

// Documents take effect at 00:00 Thailand time on the date the requester chose (today when none was chosen).
const TODAY_TH = `date('now', '+7 hours')`;

// Puts every approved DAR whose effective date has come into force: the register changes and the DAR closes in one
// transaction per DAR. Runs from the daily cron, after a final approval, and before the DAR and document lists are
// read, so a missed cron run only delays nothing. A DAR another run already activated fails the status guard
// (OBSOLETE) or UNIQUE(doc_code, revision) (NEW/REVISION) and is skipped.
export const activateDue = async (db) => {
  const { results } = await db.prepare(`SELECT * FROM dars WHERE status = 'PENDING_DCC' AND COALESCE(effective_date, ${TODAY_TH}) <= ${TODAY_TH} ORDER BY id`).all();
  for (const dar of results) {
    const documentId = dar.type === 'OBSOLETE'
      ? (await db.prepare("SELECT id FROM documents WHERE doc_code = ? AND status = 'EFFECTIVE'").bind(dar.doc_code).first())?.id
      : crypto.randomUUID();
    if (!documentId) {
      console.error(`DAR ${dar.id}: no effective document ${dar.doc_code} to obsolete`);
      continue;
    }
    // WI and FM are reviewed every 24 months, everything else every 12, unless the request named a cycle (external documents).
    const cycle = dar.review_cycle_months ?? (['WI', 'FM'].includes(dar.doc_type) ? 24 : 12);
    const retire = (status) => db.prepare("UPDATE documents SET status = ? WHERE doc_code = ? AND status = 'EFFECTIVE'").bind(status, dar.doc_code);
    // Copies of the outgoing revision: those in the field must be recalled, an undispatched one is simply void.
    const recallOld = db.prepare(`UPDATE controlled_copies SET status = CASE status WHEN 'PENDING_ISSUE' THEN 'VOID' ELSE 'PENDING_RECALL' END
      WHERE doc_code = ? AND status IN ('PENDING_ISSUE', 'DISPATCHED_PENDING_RECEIPT', 'ISSUED_ACTIVE', 'RELOCATION_PENDING_APPROVAL', 'RETURN_PENDING_APPROVAL')`).bind(dar.doc_code);
    const copies = JSON.parse(dar.distributions || '[]').map((d, i) => db.prepare(`INSERT INTO controlled_copies (id, document_id, doc_code, revision, copy_no, department, location_id, location_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), documentId, dar.doc_code, dar.revision, String(i + 1).padStart(2, '0'), d.department, d.location_id, d.location_name));
    const statements = dar.type === 'OBSOLETE' ? [retire('OBSOLETE'), recallOld] : [
      ...(dar.type === 'REVISION' ? [retire('SUPERSEDED'), recallOld] : []),
      db.prepare(`INSERT INTO documents (id, doc_code, revision, name, doc_type, department, status, access_scope, owner_id, effective_date, file_key, ext_issuer, ext_edition, review_cycle_months, next_review_date)
        VALUES (?, ?, ?, ?, ?, ?, 'EFFECTIVE', ?, ?, max(${TODAY_TH}, COALESCE(date(?), ${TODAY_TH})), ?, ?, ?, ?,
          date(max(${TODAY_TH}, COALESCE(date(?), ${TODAY_TH})), '+' || ? || ' months'))`)
        .bind(documentId, dar.doc_code, dar.revision, dar.name, dar.doc_type, dar.department, dar.access_scope, dar.requester_id, dar.effective_date, dar.file_key,
          dar.ext_issuer, dar.ext_edition, cycle, dar.effective_date, cycle),
      // After the document: copies reference it.
      ...copies
    ];
    try {
      await db.batch([
        ...statements,
        // After the insert: document_id is a foreign key to the new row.
        db.prepare(`UPDATE dars SET status = 'COMPLETED', completed_at = ${NOW}, document_id = ? WHERE id = ? AND status = 'PENDING_DCC'`).bind(documentId, dar.id),
        // No actor: the system acts on the approver's decision and the chosen date.
        db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT NULL, ?, ? WHERE changes() > 0')
          .bind(dar.type === 'OBSOLETE' ? 'DOCUMENT_OBSOLETED' : 'DOCUMENT_PUBLISHED', JSON.stringify({ dar_id: dar.id, doc_code: dar.doc_code, revision: dar.revision, automatic: true, copies_issued: copies.length })),
        // After the audit row, which reads changes() of the UPDATE above. Re-running is a no-op (UNIQUE dar_id + user_id).
        ...JSON.parse(dar.ack_user_ids || '[]').map((userId) => db.prepare(`INSERT OR IGNORE INTO acknowledgements (dar_id, document_id, doc_code, revision, user_id)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM dars WHERE id = ? AND status = 'COMPLETED' AND document_id = ?)`)
          .bind(dar.id, documentId, dar.doc_code, dar.revision, userId, dar.id, documentId))
      ]);
    } catch (err) {
      if (!isLockConflict(err)) throw err;
    }
  }
};

// Controlled copies: DCC and QMR see all; others see the copies held by their departments.
app.get('/api/controlled-copies', requireAuth, async (c) => {
  await activateDue(c.env.DB);
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`SELECT cc.*, d.name AS doc_name, d.doc_type, d.department AS owner_department
    FROM controlled_copies cc JOIN documents d ON d.id = cc.document_id
    WHERE ? OR cc.department IN (SELECT value FROM json_each(?)) ORDER BY cc.issued_at DESC, cc.copy_no`)
    .bind(user.isDcc || user.isQmr ? 1 : 0, JSON.stringify([...user.depts, user.department])).all();
  return c.json({ copies: results });
});

// What the people who hold copies can ask for. DCC and the holding department take part; the rest is DCC's to approve.
const holdsCopy = (user, copy) => user.isDcc || user.depts.includes(copy.department) || user.department === copy.department;
const copyReason = (body) => (typeof body.reason === 'string' ? body.reason.trim() : '');
const COPY_REASON_PROBLEM = 'กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)';
const loadCopy = (db, id) => db.prepare('SELECT * FROM controlled_copies WHERE id = ?').bind(id).first();

// Another printed copy for a document in force, at places the department names. DCC prints and hands it out like any other.
app.post('/api/documents/:id/additional-copies', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const reason = copyReason(body);
  if (!reason || reason.length > 500) return c.json({ error: COPY_REASON_PROBLEM }, 400);
  const text = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
  const places = (Array.isArray(body.locations) ? body.locations : []).map((l) => ({ department: text(l?.department, 20)?.toUpperCase(), location_id: text(l?.location_id, 100), location_name: text(l?.location_name, 200) }));
  if (!places.length || places.length > 20 || places.some((l) => !l.department || !l.location_name)) return c.json({ error: 'จุดแจกจ่ายสำเนาไม่ถูกต้อง (ระบุได้ 1-20 จุด)' }, 400);

  const doc = await db.prepare(`SELECT * FROM documents WHERE id = ? AND ${VISIBLE_TO}`).bind(c.req.param('id'), ...visibilityArgs(user)).first();
  if (!doc) return c.json({ error: 'ไม่พบเอกสาร' }, 404);
  if (doc.status !== 'EFFECTIVE') return c.json({ error: 'ขอสำเนาเพิ่มได้เฉพาะเอกสารที่มีผลบังคับใช้' }, 409);
  if (doc.doc_type === 'FM') return c.json({ error: 'แบบฟอร์ม (FM) ไม่มีสำเนาควบคุมแบบกระดาษ' }, 400);
  const mine = (d) => user.depts.includes(d) || user.department === d;
  if (!user.isDcc && !mine(doc.department) && !places.every((l) => mine(l.department))) return c.json({ error: 'ต้องเป็นสมาชิกแผนกเจ้าของเอกสารหรือแผนกที่จะรับสำเนา' }, 403);

  // The next number is worked out inside each INSERT, so two requests cannot take the same one.
  const results = await db.batch([
    ...places.map((l) => db.prepare(`INSERT INTO controlled_copies (id, document_id, doc_code, revision, copy_no, department, location_id, location_name, origin, request_reason, requested_by, requested_at)
      VALUES (?, ?, ?, ?, (SELECT printf('%02d', 1 + COALESCE(MAX(CAST(copy_no AS INTEGER)), 0)) FROM controlled_copies WHERE doc_code = ? AND revision = ?), ?, ?, ?, 'ADDITIONAL', ?, ?, ${NOW}) RETURNING *`)
      .bind(crypto.randomUUID(), doc.id, doc.doc_code, doc.revision, doc.doc_code, doc.revision, l.department, l.location_id, l.location_name, reason, user.id)),
    audit(db, user.id, 'CC_ADDITIONAL_REQUESTED', { doc_code: doc.doc_code, revision: doc.revision, copies: places.length, reason })
  ]);
  return c.json({ copies: results.slice(0, places.length).map((r) => r.results[0]) }, 201);
});

// Damaged or lost: the copy leaves service (a damaged one goes back to DCC for recall) and a replacement with the next issue
// number waits for DCC to print. Only a copy in the field of a revision still in force is replaced.
app.post('/api/controlled-copies/:id/report', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const reason = copyReason(body);
  if (!['DAMAGED', 'LOST'].includes(body.type)) return c.json({ error: 'ประเภทต้องเป็น DAMAGED หรือ LOST' }, 400);
  if (!reason || reason.length > 500) return c.json({ error: COPY_REASON_PROBLEM }, 400);
  const copy = await loadCopy(db, c.req.param('id'));
  if (!copy) return c.json({ error: 'ไม่พบสำเนา' }, 404);
  if (!holdsCopy(user, copy)) return c.json({ error: `เฉพาะ DCC หรือแผนก ${copy.department} ที่ถือสำเนาเท่านั้นที่แจ้งได้` }, 403);
  if (copy.status !== 'ISSUED_ACTIVE') return c.json({ error: 'แจ้งชำรุด/สูญหายได้เฉพาะสำเนาที่ใช้งานอยู่' }, 409);
  if (!await db.prepare("SELECT 1 FROM documents WHERE doc_code = ? AND revision = ? AND status = 'EFFECTIVE'").bind(copy.doc_code, copy.revision).first()) {
    return c.json({ error: 'เอกสารฉบับนี้ไม่มีผลบังคับใช้แล้ว ไม่ต้องออกสำเนาทดแทน' }, 409);
  }
  const [updated, replacement] = await db.batch([
    db.prepare(`UPDATE controlled_copies SET status = ?, report_kind = ?, request_reason = ?, requested_by = ?, requested_at = ${NOW}
      WHERE id = ? AND status = 'ISSUED_ACTIVE' RETURNING *`).bind(body.type === 'DAMAGED' ? 'PENDING_RECALL' : 'LOST', body.type, reason, user.id, copy.id),
    // Only when the report above took: changes() is that UPDATE's.
    db.prepare(`INSERT INTO controlled_copies (id, document_id, doc_code, revision, copy_no, issue_no, department, location_id, location_name, origin, replaces_id, request_reason, requested_by, requested_at)
      SELECT ?, document_id, doc_code, revision, copy_no, issue_no + 1, department, location_id, location_name, 'REPLACEMENT', id, ?, ?, ${NOW} FROM controlled_copies
      WHERE id = ? AND changes() > 0 RETURNING *`).bind(crypto.randomUUID(), reason, user.id, copy.id),
    db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
      .bind(user.id, body.type === 'DAMAGED' ? 'CC_DAMAGED_REPORTED' : 'CC_LOST_REPORTED', JSON.stringify({ copy_id: copy.id, doc_code: copy.doc_code, revision: copy.revision, copy_no: copy.copy_no, department: copy.department, reason }))
  ]);
  if (!updated.results.length) return c.json({ error: 'สถานะสำเนาเปลี่ยนไปแล้ว กรุณาโหลดใหม่' }, 409);
  return c.json({ copy: updated.results[0], replacement: replacement.results[0] }, 201);
});

// Relocation and return wait for DCC to check the physical copy. Copy 01 is the owner's own office and stays where it is.
const custodyRequest = (kind) => async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const reason = copyReason(body);
  if (!reason || reason.length > 500) return c.json({ error: COPY_REASON_PROBLEM }, 400);
  const copy = await loadCopy(db, c.req.param('id'));
  if (!copy) return c.json({ error: 'ไม่พบสำเนา' }, 404);
  if (!holdsCopy(user, copy)) return c.json({ error: `เฉพาะ DCC หรือแผนก ${copy.department} ที่ถือสำเนาเท่านั้นที่ขอได้` }, 403);
  if (copy.copy_no === '01') return c.json({ error: 'สำเนาต้นทาง (Copy 01) ย้ายหรือส่งคืนไม่ได้' }, 400);
  if (copy.status !== 'ISSUED_ACTIVE') return c.json({ error: 'ทำได้เฉพาะสำเนาที่ใช้งานอยู่ และยังไม่มีคำขออื่นค้างอยู่' }, 409);

  const text = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
  let set;
  if (kind === 'RELOCATION') {
    const name = text(body.new_location_name, 200);
    if (!name) return c.json({ error: 'กรุณาระบุจุดติดตั้งใหม่' }, 400);
    set = { sql: "status = 'RELOCATION_PENDING_APPROVAL', new_department = ?, new_location_id = ?, new_location_name = ?", args: [text(body.new_department, 20)?.toUpperCase() ?? copy.department, text(body.new_location_id, 100), name] };
  } else {
    const date = text(body.return_date, 10);
    if (date && !(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)))) return c.json({ error: 'วันที่ส่งคืนไม่ถูกต้อง' }, 400);
    set = { sql: "status = 'RETURN_PENDING_APPROVAL', return_date = ?", args: [date] };
  }
  const [updated] = await db.batch([
    db.prepare(`UPDATE controlled_copies SET ${set.sql}, request_reason = ?, requested_by = ?, requested_at = ${NOW} WHERE id = ? AND status = 'ISSUED_ACTIVE' RETURNING *`)
      .bind(...set.args, reason, user.id, copy.id),
    db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
      .bind(user.id, `CC_${kind}_REQUESTED`, JSON.stringify({ copy_id: copy.id, doc_code: copy.doc_code, revision: copy.revision, copy_no: copy.copy_no, department: copy.department, reason }))
  ]);
  if (!updated.results.length) return c.json({ error: 'สถานะสำเนาเปลี่ยนไปแล้ว กรุณาโหลดใหม่' }, 409);
  return c.json({ copy: updated.results[0] }, 201);
};
app.post('/api/controlled-copies/:id/relocate', requireAuth, custodyRequest('RELOCATION'));
app.post('/api/controlled-copies/:id/return', requireAuth, custodyRequest('RETURN'));

// DCC's answer to a relocation or return. Approving a relocation moves the copy; approving a return takes it out of service.
app.post('/api/controlled-copies/:id/decide', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  if (!user.isDcc) return c.json({ error: 'เฉพาะ DCC เท่านั้นที่พิจารณาคำขอได้' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const str = (k) => (typeof body[k] === 'string' ? body[k].trim().slice(0, 500) : '');
  if (body.decision !== 'APPROVE' && body.decision !== 'REJECT') return c.json({ error: 'ผลการพิจารณาต้องเป็น APPROVE หรือ REJECT' }, 400);
  if (body.decision === 'REJECT' && !str('note')) return c.json({ error: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' }, 400);
  const copy = await loadCopy(db, c.req.param('id'));
  if (!copy) return c.json({ error: 'ไม่พบสำเนา' }, 404);
  const kind = { RELOCATION_PENDING_APPROVAL: 'RELOCATION', RETURN_PENDING_APPROVAL: 'RETURN' }[copy.status];
  if (!kind) return c.json({ error: 'สำเนานี้ไม่มีคำขอที่รอพิจารณา' }, 409);

  const note = body.decision === 'APPROVE' && kind === 'RETURN' ? [str('disposition'), str('witness') && `พยาน: ${str('witness')}`, str('note')].filter(Boolean).join(' | ') : str('note');
  const approve = body.decision === 'APPROVE';
  const outcome = !approve ? "status = 'ISSUED_ACTIVE'"
    : kind === 'RELOCATION' ? "status = 'ISSUED_ACTIVE', department = new_department, location_id = new_location_id, location_name = new_location_name"
      : `status = 'RECALLED', recalled_at = ${NOW}, recalled_by = ?`;
  const [updated] = await db.batch([
    db.prepare(`UPDATE controlled_copies SET ${outcome}, new_department = NULL, new_location_id = NULL, new_location_name = NULL, return_date = NULL,
      decision_note = ?, decided_by = ?, decided_at = ${NOW} WHERE id = ? AND status = ? RETURNING *`)
      .bind(...(approve && kind === 'RETURN' ? [user.id] : []), note || null, user.id, copy.id, copy.status),
    db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
      .bind(user.id, `CC_${kind}_${approve ? 'APPROVED' : 'REJECTED'}`, JSON.stringify({ copy_id: copy.id, doc_code: copy.doc_code, revision: copy.revision, copy_no: copy.copy_no, note }))
  ]);
  if (!updated.results.length) return c.json({ error: 'คำขอนี้ถูกพิจารณาไปแล้ว กรุณาโหลดใหม่' }, 409);
  return c.json({ copy: updated.results[0] });
});

// One step in a copy's life: who may take it, and the status it must be in (so a double click is a no-op).
const COPY_STEPS = {
  dispatch: { to: 'DISPATCHED_PENDING_RECEIPT', from: 'PENDING_ISSUE', stamp: 'dispatched', action: 'CC_DISPATCHED',
    refuse: (user) => (user.isDcc ? null : 'เฉพาะ DCC เท่านั้นที่แจกจ่ายสำเนาได้') },
  receive: { to: 'ISSUED_ACTIVE', from: 'DISPATCHED_PENDING_RECEIPT', stamp: 'received', action: 'CC_RECEIVED',
    refuse: (user, copy) => (user.approval_level >= 4 && (user.depts.includes(copy.department) || user.department === copy.department)
      ? null : `เฉพาะระดับ L4 ขึ้นไปของแผนก ${copy.department} เท่านั้นที่ยืนยันรับสำเนาได้`) },
  recall: { to: 'RECALLED', from: 'PENDING_RECALL', stamp: 'recalled', action: 'CC_RECALLED',
    refuse: (user) => (user.isDcc ? null : 'เฉพาะ DCC เท่านั้นที่บันทึกการเรียกคืนได้') }
};

app.post('/api/controlled-copies/:id/:step', requireAuth, async (c) => {
  const step = Object.hasOwn(COPY_STEPS, c.req.param('step')) ? COPY_STEPS[c.req.param('step')] : null;
  if (!step) return c.json({ error: 'ไม่พบขั้นตอนนี้' }, 404);
  const user = c.get('user');
  const db = c.env.DB;
  const copy = await db.prepare('SELECT * FROM controlled_copies WHERE id = ?').bind(c.req.param('id')).first();
  if (!copy) return c.json({ error: 'ไม่พบสำเนา' }, 404);
  const refused = step.refuse(user, copy);
  if (refused) return c.json({ error: refused }, 403);
  const body = await c.req.json().catch(() => ({}));
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const [updated] = await db.batch([
    db.prepare(`UPDATE controlled_copies SET status = ?, ${step.stamp}_at = ${NOW}, ${step.stamp}_by = ? WHERE id = ? AND status = ? RETURNING *`)
      .bind(step.to, user.id, copy.id, step.from),
    db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
      .bind(user.id, step.action, JSON.stringify({ copy_id: copy.id, doc_code: copy.doc_code, revision: copy.revision, copy_no: copy.copy_no, department: copy.department, note }))
  ]);
  if (!updated.results.length) return c.json({ error: 'สถานะสำเนาเปลี่ยนไปแล้ว กรุณาโหลดใหม่' }, 409);
  return c.json({ copy: updated.results[0] });
});

// Acknowledgement: the people the requester named read the published document and confirm. Each sees their own; DCC, QMR
// and the requester see everyone's.
app.get('/api/acknowledgements', requireAuth, async (c) => {
  await activateDue(c.env.DB);
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`SELECT a.*, d.name AS doc_name, d.doc_type, d.department, d.requester_id, d.effective_date FROM acknowledgements a JOIN dars d ON d.id = a.dar_id
    WHERE ? OR a.user_id = ? OR d.requester_id = ? ORDER BY a.id DESC`).bind(user.isDcc || user.isQmr ? 1 : 0, user.id, user.id).all();
  return c.json({ acknowledgements: results });
});

app.post('/api/acknowledgements/:id/acknowledge', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const ack = await db.prepare('SELECT * FROM acknowledgements WHERE id = ?').bind(c.req.param('id')).first();
  if (!ack) return c.json({ error: 'ไม่พบรายการรับทราบ' }, 404);
  if (ack.user_id !== user.id) return c.json({ error: 'เฉพาะผู้ที่ได้รับมอบหมายเท่านั้นที่รับทราบได้' }, 403);
  const [updated] = await db.batch([
    db.prepare(`UPDATE acknowledgements SET status = 'ACKNOWLEDGED', acknowledged_at = ${NOW} WHERE id = ? AND status = 'PENDING' RETURNING *`).bind(ack.id),
    db.prepare('INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0')
      .bind(user.id, 'DOCUMENT_ACKNOWLEDGED', JSON.stringify({ acknowledgement_id: ack.id, dar_id: ack.dar_id, doc_code: ack.doc_code, revision: ack.revision }))
  ]);
  if (!updated.results.length) return c.json({ error: 'รับทราบเอกสารนี้ไปแล้ว' }, 409);
  return c.json({ acknowledgement: updated.results[0] });
});

// Periodic review: a member of the owner department confirms the document is still right (NO_CHANGE) or asks to revise or
// withdraw it. NO_CHANGE moves the next review date only once someone with approver rights signs it, and the reviewer
// signs it too when they hold those rights already.
const REVIEW_OUTCOMES = ['NO_CHANGE', 'REVISION_REQUIRED', 'OBSOLETE'];
const OPEN_DAR_STATUSES = `('PENDING_REVIEW', 'PENDING_APPROVAL', 'PENDING_DCC')`;
const isCrossOrg = (user) => user.isQmr || user.approval_level >= 6 || user.depts.some((d) => ['MGT', 'EXEC', 'QMR'].includes(d));
// New date = the later of the date it was due and today, plus one cycle (so a late review does not leave it overdue again).
const NEXT_REVIEW_SQL = `date(max(COALESCE(next_review_date, ${TODAY_TH}), ${TODAY_TH}), '+' || COALESCE(review_cycle_months, CASE WHEN doc_type IN ('WI', 'FM') THEN 24 ELSE 12 END) || ' months')`;

app.get('/api/periodic-reviews', requireAuth, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`SELECT pr.*, d.name AS doc_name, d.doc_type, d.department FROM periodic_reviews pr JOIN documents d ON d.id = pr.document_id
    WHERE ? OR pr.reviewer_id = ? OR pr.approver_id = ? OR d.department IN (SELECT value FROM json_each(?)) ORDER BY pr.id DESC`)
    .bind(user.isDcc || user.isQmr ? 1 : 0, user.id, user.id, JSON.stringify([...user.depts, user.department])).all();
  return c.json({ reviews: results });
});

app.post('/api/documents/:id/periodic-review', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  if (!REVIEW_OUTCOMES.includes(body.outcome)) return c.json({ error: 'ผลการทบทวนไม่ถูกต้อง' }, 400);
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';
  if (reason.length < 5) return c.json({ error: 'กรุณาระบุเหตุผล/รายละเอียดการทบทวน' }, 400);
  // Free-text fields the review form collects (findings, clause, evidence...), kept for the audit record.
  const details = Object.fromEntries(['findings', 'standard_clause', 'evidence_reference', 'additional_comment']
    .map((k) => [k, typeof body.details?.[k] === 'string' ? body.details[k].trim().slice(0, 2000) : '']));

  const doc = await db.prepare(`SELECT * FROM documents WHERE id = ? AND ${VISIBLE_TO}`).bind(c.req.param('id'), ...visibilityArgs(user)).first();
  if (!doc) return c.json({ error: 'ไม่พบเอกสาร' }, 404);
  if (doc.status !== 'EFFECTIVE') return c.json({ error: 'ทบทวนได้เฉพาะเอกสารที่มีผลบังคับใช้' }, 409);
  const isMember = user.depts.includes(doc.department) || user.department === doc.department;
  // External documents are checked by DCC for their owner department.
  if (!isMember && !isCrossOrg(user) && !(doc.doc_type === 'ED' && user.isDcc)) return c.json({ error: 'ต้องเป็นสมาชิกแผนกเจ้าของเอกสาร' }, 403);
  if (await db.prepare(`SELECT 1 FROM dars WHERE doc_code = ? AND status IN ${OPEN_DAR_STATUSES}`).bind(doc.doc_code).first()) {
    return c.json({ error: 'เอกสารนี้มีคำขอ DAR ที่ยังดำเนินการอยู่ จึงทบทวนตามรอบไม่ได้' }, 409);
  }

  const thresholds = await getThresholds(db, doc.doc_type);
  const rights = (u, requesterId = null) => checkDecisionRights(u, { stage: 'APPROVE', department: doc.department, requesterId, reviewerId: null }, thresholds);
  let status = 'AWAITING_ACTION';
  let approverId = null;
  let fastTrack = 0;
  if (body.outcome === 'NO_CHANGE') {
    if (!rights(user)) {
      [status, approverId, fastTrack] = ['COMPLETED', user.id, 1];
    } else {
      // The signer: a qualified member of the owner department first, then QMR and other cross-department signers.
      const { results: people } = await db.prepare("SELECT * FROM users WHERE status = 'ACTIVE' AND id != ? ORDER BY approval_level, name").bind(user.id).all();
      const eligible = people.map(toPublicUser).filter((u) => !rights(u, user.id));
      const approver = eligible.find((u) => u.depts.includes(doc.department) || u.department === doc.department) ?? eligible[0];
      if (!approver) return c.json({ error: 'ไม่พบผู้อนุมัติที่มีสิทธิ์ในระบบ กรุณาติดต่อผู้ดูแลระบบ' }, 400);
      [status, approverId] = ['PENDING_APPROVAL', approver.id];
    }
  }

  try {
    const [inserted] = await db.batch([
      db.prepare(`INSERT INTO periodic_reviews (document_id, doc_code, revision, outcome, status, reason, details, reviewer_id, approver_id, fast_track, due_date, new_next_review_date, decided_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'COMPLETED' THEN (SELECT ${NEXT_REVIEW_SQL} FROM documents WHERE id = ?) END,
          CASE WHEN ? = 'COMPLETED' THEN ${NOW} END) RETURNING *`)
        .bind(doc.id, doc.doc_code, doc.revision, body.outcome, status, reason, JSON.stringify(details), user.id, approverId, fastTrack, doc.next_review_date,
          status, doc.id, status),
      db.prepare(`INSERT INTO audit_log (actor_id, action, details) SELECT ?, 'PERIODIC_REVIEW_SUBMITTED', json_object('review_id', id, 'doc_code', doc_code, 'outcome', outcome, 'status', status) FROM periodic_reviews WHERE id = last_insert_rowid()`).bind(user.id),
      // Fast track: the date moves in the same transaction as the review that earned it.
      db.prepare(`UPDATE documents SET next_review_date = (SELECT new_next_review_date FROM periodic_reviews WHERE document_id = ? AND status = 'COMPLETED' ORDER BY id DESC LIMIT 1),
        last_reviewed_at = ${TODAY_TH} WHERE id = ? AND ? = 'COMPLETED'`).bind(doc.id, doc.id, status)
    ]);
    return c.json({ review: inserted.results[0] }, 201);
  } catch (err) {
    if (isLockConflict(err)) return c.json({ error: 'เอกสารนี้มีผลการทบทวนที่ยังรอดำเนินการอยู่' }, 409);
    throw err;
  }
});

app.post('/api/periodic-reviews/:id/decision', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
  if (body.decision !== 'APPROVE' && body.decision !== 'REJECT') return c.json({ error: 'ผลการพิจารณาต้องเป็น APPROVE หรือ REJECT' }, 400);
  if (body.decision === 'REJECT' && !comment) return c.json({ error: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' }, 400);

  const review = await db.prepare('SELECT pr.*, d.department, d.doc_type FROM periodic_reviews pr JOIN documents d ON d.id = pr.document_id WHERE pr.id = ?').bind(c.req.param('id')).first();
  if (!review) return c.json({ error: 'ไม่พบผลการทบทวน' }, 404);
  if (review.status !== 'PENDING_APPROVAL') return c.json({ error: 'ผลการทบทวนนี้ไม่อยู่ในขั้นตอนรออนุมัติ' }, 409);
  const problem = checkDecisionRights(user, { stage: 'APPROVE', department: review.department, requesterId: review.reviewer_id, reviewerId: null }, await getThresholds(db, review.doc_type));
  if (problem) return c.json({ error: problem }, 403);

  const approve = body.decision === 'APPROVE';
  // The status guard makes a double click or a race a no-op instead of a second decision.
  const [updated] = await db.batch([
    db.prepare(`UPDATE periodic_reviews SET status = ?, approver_id = ?, decision_comment = ?, decided_at = ${NOW},
      new_next_review_date = CASE WHEN ? THEN (SELECT ${NEXT_REVIEW_SQL} FROM documents WHERE id = periodic_reviews.document_id) END
      WHERE id = ? AND status = 'PENDING_APPROVAL' RETURNING *`).bind(approve ? 'COMPLETED' : 'REJECTED', user.id, comment || null, approve ? 1 : 0, review.id),
    db.prepare(`INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0`)
      .bind(user.id, approve ? 'PERIODIC_REVIEW_APPROVED' : 'PERIODIC_REVIEW_REJECTED', JSON.stringify({ review_id: review.id, doc_code: review.doc_code, comment })),
    db.prepare(`UPDATE documents SET next_review_date = (SELECT new_next_review_date FROM periodic_reviews WHERE id = ? AND status = 'COMPLETED'), last_reviewed_at = ${TODAY_TH}
      WHERE id = ? AND (SELECT status FROM periodic_reviews WHERE id = ?) = 'COMPLETED'`).bind(review.id, review.document_id, review.id)
  ]);
  if (!updated.results.length) return c.json({ error: 'ผลการทบทวนนี้ถูกพิจารณาไปแล้ว กรุณาโหลดใหม่' }, 409);
  return c.json({ review: updated.results[0] });
});

// Lets the department start over when the DAR it asked for was dropped or the approval is stuck.
app.post('/api/periodic-reviews/:id/cancel', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const review = await db.prepare('SELECT pr.*, d.department FROM periodic_reviews pr JOIN documents d ON d.id = pr.document_id WHERE pr.id = ?').bind(c.req.param('id')).first();
  if (!review) return c.json({ error: 'ไม่พบผลการทบทวน' }, 404);
  const isMember = user.depts.includes(review.department) || user.department === review.department;
  if (user.id !== review.reviewer_id && !user.isDcc && !(isMember && user.approval_level >= 4)) return c.json({ error: 'เฉพาะผู้ทบทวน หัวหน้าแผนก หรือ DCC เท่านั้นที่ยกเลิกได้' }, 403);
  const [updated] = await db.batch([
    db.prepare(`UPDATE periodic_reviews SET status = 'CANCELLED', decided_at = ${NOW} WHERE id = ? AND status IN ('PENDING_APPROVAL', 'AWAITING_ACTION') RETURNING *`).bind(review.id),
    db.prepare(`INSERT INTO audit_log (actor_id, action, details) SELECT ?, 'PERIODIC_REVIEW_CANCELLED', ? WHERE changes() > 0`)
      .bind(user.id, JSON.stringify({ review_id: review.id, doc_code: review.doc_code }))
  ]);
  if (!updated.results.length) return c.json({ error: 'ผลการทบทวนนี้ปิดไปแล้ว' }, 409);
  return c.json({ review: updated.results[0] });
});

// Locked accounts are hidden from the directory above, so DCC lists them here to unlock.
app.get('/api/users/locked', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json({ error: 'เฉพาะ DCC เท่านั้นที่ดูบัญชีที่ถูกล็อกได้' }, 403);
  const { results } = await c.env.DB.prepare("SELECT id, name, email, primary_department FROM users WHERE status = 'LOCKED' ORDER BY name").all();
  return c.json({ users: results });
});

app.post('/api/users/:id/unlock', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user.isDcc) return c.json({ error: 'เฉพาะ DCC เท่านั้นที่ปลดล็อกบัญชีได้' }, 403);
  const db = c.env.DB;
  const targetId = c.req.param('id');
  const [updated] = await db.batch([
    db.prepare("UPDATE users SET status = 'ACTIVE', failed_logins = 0 WHERE id = ? AND status = 'LOCKED' RETURNING id").bind(targetId),
    db.prepare("INSERT INTO audit_log (actor_id, action, details) SELECT ?, 'USER_UNLOCKED', ? WHERE changes() > 0").bind(user.id, JSON.stringify({ user_id: targetId }))
  ]);
  if (!updated.results.length) return c.json({ error: 'ไม่พบบัญชีที่ถูกล็อกนี้' }, 404);
  return c.json({ ok: true });
});

// --- Master data: users, departments and distribution locations. DCC only; every change is audited in the same batch. ---
const DCC_ONLY = { error: 'เฉพาะ DCC เท่านั้นที่จัดการข้อมูลหลักได้' };
const readBody = (c) => c.req.json().catch(() => ({}));
const clean = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
const isUnique = (err) => /UNIQUE/.test(String(err?.message));
// No look-alike characters (0/O, 1/l/I); 14 characters clears the 12-character minimum.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const tempPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
const roleOf = (isDccUser) => (isDccUser ? 'DCC_ADMIN' : 'GENERAL_USER');

// Checks the fields of a user form (a PATCH keeps what it does not mention); returns the clean values or the Thai reason.
const userFields = async (db, body, current = {}) => {
  const name = body.name === undefined ? current.name : clean(body.name, 200);
  const email = body.email === undefined ? current.email : clean(body.email, 200)?.toLowerCase();
  if (!name) return { error: 'กรุณาระบุชื่อ' };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'อีเมลไม่ถูกต้อง' };
  const level = body.approval_level === undefined ? current.approval_level : body.approval_level;
  if (!(Number.isInteger(level) && level >= 1 && level <= 8)) return { error: 'ระดับต้องเป็นจำนวนเต็ม 1-8' };
  const primary = body.department === undefined ? current.primary_department : clean(body.department, 12);
  const extra = body.depts === undefined ? JSON.parse(current.departments || '[]') : body.depts;
  if (!primary || !Array.isArray(extra)) return { error: 'กรุณาระบุแผนก' };
  const depts = [...new Set([primary, ...extra])];
  const { results } = await db.prepare("SELECT code FROM departments WHERE status = 'ACTIVE' AND code IN (SELECT value FROM json_each(?))").bind(JSON.stringify(depts)).all();
  const missing = depts.filter((d) => !results.some((r) => r.code === d));
  if (missing.length) return { error: `ไม่พบแผนกที่ใช้งานอยู่: ${missing.join(', ')}` };
  const empId = body.empId === undefined ? current.emp_id ?? null : clean(body.empId, 50);
  const dcc = body.isDcc === undefined ? current.is_dcc === 1 : Boolean(body.isDcc);
  const qmr = body.isQmr === undefined ? current.is_qmr === 1 : Boolean(body.isQmr);
  return { name, email, level, primary, depts, empId, dcc, qmr };
};

// Everyone, including deactivated and locked accounts, for the management page.
app.get('/api/admin/users', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const { results } = await c.env.DB.prepare('SELECT * FROM users ORDER BY name').all();
  const policy = await loadSecurityPolicy(c.env.DB);
  return c.json({ users: results.map((r) => ({ ...toPublicUser(r, policy), status: r.status })) });
});

app.post('/api/users', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const db = c.env.DB;
  const f = await userFields(db, await readBody(c));
  if (f.error) return c.json({ error: f.error }, 400);
  const id = crypto.randomUUID();
  const password = tempPassword();
  try {
    await db.batch([
      db.prepare(`INSERT INTO users (id, emp_id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, is_qmr, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
        .bind(id, f.empId, f.name, f.email, await hashPassword(password), roleOf(f.dcc), f.level, f.primary, JSON.stringify(f.depts), f.dcc ? 1 : 0, f.qmr ? 1 : 0),
      audit(db, c.get('user').id, 'USER_CREATED', { user_id: id, email: f.email, level: f.level, department: f.primary, depts: f.depts, isDcc: f.dcc, isQmr: f.qmr })
    ]);
  } catch (err) {
    if (isUnique(err)) return c.json({ error: 'อีเมลหรือรหัสพนักงานนี้มีอยู่แล้ว' }, 409);
    throw err;
  }
  // The temporary password is shown once; the person must change it at first sign-in.
  return c.json({ user: toPublicUser(await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()), temporaryPassword: password }, 201);
});

app.patch('/api/users/:id', requireAuth, async (c) => {
  const actor = c.get('user');
  if (!actor.isDcc) return c.json(DCC_ONLY, 403);
  const db = c.env.DB;
  const body = await readBody(c);
  const before = await db.prepare('SELECT * FROM users WHERE id = ?').bind(c.req.param('id')).first();
  if (!before) return c.json({ error: 'ไม่พบผู้ใช้' }, 404);
  const f = await userFields(db, body, before);
  if (f.error) return c.json({ error: f.error }, 400);
  const status = body.status === undefined ? before.status : body.status;
  if (!['ACTIVE', 'INACTIVE', 'LOCKED'].includes(status)) return c.json({ error: 'สถานะไม่ถูกต้อง' }, 400);
  // LOCKED comes only from failed logins; an admin moves an account between ACTIVE and INACTIVE.
  if (status === 'LOCKED' && before.status !== 'LOCKED') return c.json({ error: 'ไม่สามารถตั้งสถานะล็อกด้วยตนเองได้' }, 400);
  // An admin cannot lock themselves out of the admin pages.
  if (before.id === actor.id && (!f.dcc || status !== 'ACTIVE')) return c.json({ error: 'ไม่สามารถปิดบัญชีหรือถอนสิทธิ์ DCC ของตนเองได้' }, 400);
  const after = { name: f.name, email: f.email, emp_id: f.empId, approval_level: f.level, department: f.primary, depts: f.depts, isDcc: f.dcc, isQmr: f.qmr, status };
  try {
    await db.batch([
      db.prepare(`UPDATE users SET name = ?, email = ?, emp_id = ?, approval_level = ?, primary_department = ?, departments = ?, is_dcc = ?, is_qmr = ?, role = ?,
        status = ?, failed_logins = CASE WHEN ? = 'ACTIVE' THEN 0 ELSE failed_logins END WHERE id = ?`)
        .bind(f.name, f.email, f.empId, f.level, f.primary, JSON.stringify(f.depts), f.dcc ? 1 : 0, f.qmr ? 1 : 0, roleOf(f.dcc), status, status, before.id),
      audit(db, actor.id, 'USER_UPDATED', {
        user_id: before.id,
        before: { name: before.name, email: before.email, emp_id: before.emp_id, approval_level: before.approval_level, department: before.primary_department, depts: JSON.parse(before.departments), isDcc: before.is_dcc === 1, isQmr: before.is_qmr === 1, status: before.status },
        after
      })
    ]);
  } catch (err) {
    if (isUnique(err)) return c.json({ error: 'อีเมลหรือรหัสพนักงานนี้มีอยู่แล้ว' }, 409);
    throw err;
  }
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(before.id).first();
  return c.json({ user: { ...toPublicUser(row), status: row.status } });
});

// A new temporary password; the old one and every signed-in session of that person stop working.
app.post('/api/users/:id/reset-password', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const db = c.env.DB;
  const password = tempPassword();
  const [updated] = await db.batch([
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, password_changed_at = ? WHERE id = ? RETURNING id')
      .bind(await hashPassword(password), Math.floor(Date.now() / 1000), c.req.param('id')),
    db.prepare("INSERT INTO audit_log (actor_id, action, details) SELECT ?, 'USER_PASSWORD_RESET', ? WHERE changes() > 0").bind(c.get('user').id, JSON.stringify({ user_id: c.req.param('id') }))
  ]);
  if (!updated.results.length) return c.json({ error: 'ไม่พบผู้ใช้' }, 404);
  return c.json({ temporaryPassword: password });
});

app.get('/api/departments', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM departments ORDER BY code').all();
  return c.json({ departments: results });
});

app.post('/api/departments', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const body = await readBody(c);
  const code = clean(body.code, 12)?.toUpperCase();
  const nameTh = clean(body.name_th, 200);
  // The code is part of every document number (TYPE-DEPT-NN), so it cannot hold a dash; & is allowed for HR&GA.
  if (!code || !/^[A-Z0-9&]+$/.test(code)) return c.json({ error: 'รหัสแผนกใช้ได้เฉพาะ A-Z 0-9 & ไม่เกิน 12 ตัว' }, 400);
  if (!nameTh) return c.json({ error: 'กรุณาระบุชื่อแผนก' }, 400);
  const db = c.env.DB;
  try {
    await db.batch([
      db.prepare('INSERT INTO departments (code, name_th, name_en) VALUES (?, ?, ?)').bind(code, nameTh, clean(body.name_en, 200) ?? ''),
      audit(db, c.get('user').id, 'DEPARTMENT_CREATED', { code, name_th: nameTh })
    ]);
  } catch (err) {
    if (isUnique(err)) return c.json({ error: `รหัสแผนก ${code} มีอยู่แล้ว` }, 409);
    throw err;
  }
  return c.json({ department: await db.prepare('SELECT * FROM departments WHERE code = ?').bind(code).first() }, 201);
});

// The code is what users and documents point to, so only names and status change.
app.patch('/api/departments/:code', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const db = c.env.DB;
  const body = await readBody(c);
  const before = await db.prepare('SELECT * FROM departments WHERE code = ?').bind(c.req.param('code')).first();
  if (!before) return c.json({ error: 'ไม่พบแผนก' }, 404);
  const nameTh = body.name_th === undefined ? before.name_th : clean(body.name_th, 200);
  const nameEn = body.name_en === undefined ? before.name_en : (clean(body.name_en, 200) ?? '');
  const status = body.status === undefined ? before.status : body.status;
  if (!nameTh) return c.json({ error: 'กรุณาระบุชื่อแผนก' }, 400);
  if (!['ACTIVE', 'INACTIVE'].includes(status)) return c.json({ error: 'สถานะไม่ถูกต้อง' }, 400);
  if (status === 'INACTIVE' && before.status === 'ACTIVE') {
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE status != 'INACTIVE' AND ? IN (SELECT value FROM json_each(users.departments))").bind(before.code).first();
    if (n) return c.json({ error: `ปิดแผนกไม่ได้ ยังมีผู้ใช้ ${n} คนสังกัดแผนกนี้ กรุณาย้ายหรือปิดบัญชีก่อน` }, 409);
  }
  await db.batch([
    db.prepare('UPDATE departments SET name_th = ?, name_en = ?, status = ? WHERE code = ?').bind(nameTh, nameEn, status, before.code),
    audit(db, c.get('user').id, 'DEPARTMENT_UPDATED', { code: before.code, before: { name_th: before.name_th, name_en: before.name_en, status: before.status }, after: { name_th: nameTh, name_en: nameEn, status } })
  ]);
  return c.json({ department: await db.prepare('SELECT * FROM departments WHERE code = ?').bind(before.code).first() });
});

app.get('/api/distribution-locations', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM distribution_locations ORDER BY department, name').all();
  return c.json({ locations: results });
});

app.post('/api/distribution-locations', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const body = await readBody(c);
  const name = clean(body.name, 200);
  const department = clean(body.department, 12);
  if (!name || !department) return c.json({ error: 'กรุณาระบุชื่อสถานที่และแผนก' }, 400);
  const db = c.env.DB;
  if (!(await db.prepare("SELECT 1 FROM departments WHERE code = ? AND status = 'ACTIVE'").bind(department).first())) return c.json({ error: 'ไม่พบแผนกที่ใช้งานอยู่' }, 400);
  const id = crypto.randomUUID();
  // A department's first place becomes its main place; after that the DCC picks one with is_master.
  const hasMaster = await db.prepare("SELECT 1 FROM distribution_locations WHERE department = ? AND is_master = 1 AND status = 'ACTIVE'").bind(department).first();
  const master = body.is_master === true || !hasMaster ? 1 : 0;
  try {
    await db.batch([
      ...(master ? [db.prepare('UPDATE distribution_locations SET is_master = 0 WHERE department = ?').bind(department)] : []),
      db.prepare('INSERT INTO distribution_locations (id, department, name, description, is_master) VALUES (?, ?, ?, ?, ?)').bind(id, department, name, clean(body.description, 500) ?? '', master),
      audit(db, c.get('user').id, 'LOCATION_CREATED', { id, department, name, is_master: master })
    ]);
  } catch (err) {
    if (isUnique(err)) return c.json({ error: 'แผนกนี้มีสถานที่ชื่อนี้อยู่แล้ว' }, 409);
    throw err;
  }
  return c.json({ location: await db.prepare('SELECT * FROM distribution_locations WHERE id = ?').bind(id).first() }, 201);
});

// Copies already issued keep the place they were sent to, so a place is closed rather than deleted.
app.patch('/api/distribution-locations/:id', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const db = c.env.DB;
  const body = await readBody(c);
  const before = await db.prepare('SELECT * FROM distribution_locations WHERE id = ?').bind(c.req.param('id')).first();
  if (!before) return c.json({ error: 'ไม่พบสถานที่' }, 404);
  const name = body.name === undefined ? before.name : clean(body.name, 200);
  const description = body.description === undefined ? before.description : (clean(body.description, 500) ?? '');
  const status = body.status === undefined ? before.status : body.status;
  if (!name) return c.json({ error: 'กรุณาระบุชื่อสถานที่' }, 400);
  if (!['ACTIVE', 'INACTIVE'].includes(status)) return c.json({ error: 'สถานะไม่ถูกต้อง' }, 400);
  if (body.is_master !== undefined && typeof body.is_master !== 'boolean') return c.json({ error: 'ค่าจุดหลักไม่ถูกต้อง' }, 400);
  // A closed place cannot be the main one; choosing a new main place un-marks the old one.
  const master = status === 'INACTIVE' ? 0 : body.is_master === undefined ? before.is_master : body.is_master ? 1 : 0;
  try {
    await db.batch([
      ...(master && !before.is_master ? [db.prepare('UPDATE distribution_locations SET is_master = 0 WHERE department = ?').bind(before.department)] : []),
      db.prepare('UPDATE distribution_locations SET name = ?, description = ?, status = ?, is_master = ? WHERE id = ?').bind(name, description, status, master, before.id),
      audit(db, c.get('user').id, 'LOCATION_UPDATED', { id: before.id, before: { name: before.name, description: before.description, status: before.status, is_master: before.is_master }, after: { name, description, status, is_master: master } })
    ]);
  } catch (err) {
    if (isUnique(err)) return c.json({ error: 'แผนกนี้มีสถานที่ชื่อนี้อยู่แล้ว' }, 409);
    throw err;
  }
  return c.json({ location: await db.prepare('SELECT * FROM distribution_locations WHERE id = ?').bind(before.id).first() });
});

// --- Two-factor sign-in (authenticator app). Who needs it comes from the settings table, never from a constant here. ---
// Sign-in with a correct password answers { twoFactorRequired, challenge } for anyone who has set it up; this finishes the sign-in.
app.post('/api/auth/2fa/verify', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = typeof body.challenge === 'string' ? await verify(body.challenge, c.env.JWT_SECRET, 'HS256').catch(() => null) : null;
  if (payload?.purpose !== TWO_FACTOR_PURPOSE) return c.json({ error: 'หมดเวลายืนยันตัวตน กรุณาเข้าสู่ระบบใหม่' }, 401);
  const db = c.env.DB;
  const ip = c.req.header('cf-connecting-ip');
  if (await tooManyFailures(db, ip)) return c.json(TOO_MANY_FAILURES, 429, { 'Retry-After': String(LOGIN_WINDOW_MS / 1000) });
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user || user.status !== 'ACTIVE' || !user.totp_confirmed_at) return c.json({ error: 'หมดเวลายืนยันตัวตน กรุณาเข้าสู่ระบบใหม่' }, 401);

  // One guarded statement per kind of proof, so the same code cannot be spent twice even by two requests at once.
  const recovery = typeof body.recovery_code === 'string' ? await recoveryHash(body.recovery_code) : null;
  const step = recovery ? null : await verifyCode(user.totp_secret, body.code, user.totp_last_step);
  const [spent] = recovery
    ? await db.batch([db.prepare(`UPDATE recovery_codes SET used_at = ${NOW} WHERE user_id = ? AND code_hash = ? AND used_at IS NULL RETURNING code_hash`).bind(user.id, recovery)])
    : step === null ? [{ results: [] }]
      : await db.batch([db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ? RETURNING id').bind(step, user.id, step)]);
  if (!spent.results.length) {
    await recordFailedLogin(db, user, { ip, via: '2fa' });
    return c.json({ error: 'รหัสยืนยันไม่ถูกต้อง' }, 401);
  }
  await db.batch([
    db.prepare('UPDATE users SET failed_logins = 0 WHERE id = ?').bind(user.id),
    audit(db, user.id, 'LOGIN', { twoFactor: recovery ? 'recovery_code' : 'app' })
  ]);
  return c.json({ token: await issueToken(c.env.JWT_SECRET, user.id), user: toPublicUser(user, await loadSecurityPolicy(db)) });
});

// Setting up: the person gets a secret to add to their app, then proves it works by typing a code.
app.post('/api/auth/2fa/setup', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const secret = newSecret();
  const [saved] = await db.batch([db.prepare('UPDATE users SET totp_secret = ? WHERE id = ? AND totp_confirmed_at IS NULL RETURNING id').bind(secret, user.id)]);
  if (!saved.results.length) return c.json({ error: 'เปิดใช้งานการยืนยันสองขั้นตอนไว้แล้ว หากต้องตั้งค่าใหม่ ให้ DCC รีเซ็ตให้' }, 409);
  return c.json({ secret, otpauthUri: otpauthUri(secret, user.email, TWO_FACTOR_ISSUER) });
});

app.post('/api/auth/2fa/confirm', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  if (row.totp_confirmed_at) return c.json({ error: 'เปิดใช้งานการยืนยันสองขั้นตอนไว้แล้ว' }, 409);
  if (!row.totp_secret) return c.json({ error: 'กรุณาเริ่มตั้งค่าใหม่' }, 409);
  const step = await verifyCode(row.totp_secret, body.code, 0);
  if (step === null) {
    await recordFailedLogin(db, row, { ip: c.req.header('cf-connecting-ip'), via: '2fa-setup' });
    return c.json({ error: 'รหัสไม่ถูกต้อง ตรวจสอบว่านาฬิกาเครื่องตรงและลองใหม่' }, 400);
  }
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  const hashes = await Promise.all(codes.map(recoveryHash));
  const [confirmed] = await db.batch([
    db.prepare(`UPDATE users SET totp_confirmed_at = ${NOW}, totp_last_step = ? WHERE id = ? AND totp_confirmed_at IS NULL RETURNING id`).bind(step, user.id),
    ...hashes.map((h) => db.prepare('INSERT INTO recovery_codes (user_id, code_hash) SELECT ?, ? WHERE changes() > 0').bind(user.id, h)),
    db.prepare("INSERT INTO audit_log (actor_id, action, details) SELECT ?, 'TWO_FACTOR_ENABLED', '{}' WHERE changes() > 0").bind(user.id)
  ]);
  if (!confirmed.results.length) return c.json({ error: 'เปิดใช้งานการยืนยันสองขั้นตอนไว้แล้ว' }, 409);
  // Shown once; only hashes are kept.
  return c.json({ recoveryCodes: codes });
});

// A lost phone and lost recovery codes: the DCC clears the setup, the person signs in again and sets it up afresh.
app.post('/api/users/:id/two-factor/reset', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const db = c.env.DB;
  const id = c.req.param('id');
  const [cleared] = await db.batch([
    db.prepare('UPDATE users SET totp_secret = NULL, totp_confirmed_at = NULL, totp_last_step = 0, password_changed_at = ? WHERE id = ? RETURNING id').bind(Math.floor(Date.now() / 1000), id),
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(id),
    db.prepare("INSERT INTO audit_log (actor_id, action, details) SELECT ?, 'TWO_FACTOR_RESET', ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)").bind(c.get('user').id, JSON.stringify({ user_id: id }), id)
  ]);
  if (!cleared.results.length) return c.json({ error: 'ไม่พบผู้ใช้' }, 404);
  return c.json({ ok: true });
});

// The policy itself: who must use two-factor.
app.get('/api/settings/security', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  return c.json(await loadSecurityPolicy(c.env.DB));
});

app.put('/api/settings/security', requireAuth, async (c) => {
  if (!c.get('user').isDcc) return c.json(DCC_ONLY, 403);
  const body = await c.req.json().catch(() => ({}));
  const level = body.twoFactorMinLevel;
  if (!(Number.isInteger(level) && level >= 0 && level <= 8)) return c.json({ error: 'ระดับต้องเป็นจำนวนเต็ม 0-8 (0 = ไม่บังคับตามระดับ)' }, 400);
  if (typeof body.twoFactorForDcc !== 'boolean') return c.json({ error: 'กรุณาระบุว่าบังคับ DCC หรือไม่' }, 400);
  const db = c.env.DB;
  const before = await loadSecurityPolicy(db);
  const save = (key, value) => db.prepare(`INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}, updated_by = excluded.updated_by`).bind(key, value, c.get('user').id);
  await db.batch([
    save('two_factor_min_level', String(level)),
    save('two_factor_for_dcc', body.twoFactorForDcc ? '1' : '0'),
    audit(db, c.get('user').id, 'SECURITY_SETTINGS_UPDATED', { before, after: { twoFactorMinLevel: level, twoFactorForDcc: body.twoFactorForDcc } })
  ]);
  return c.json(await loadSecurityPolicy(db));
});

// --- Master data kept as JSON in settings: document types and SLA days. null means "never edited", so the pages use their built-in starting list. ---
const loadJsonSetting = async (db, key) => {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : null;
};
const saveJsonSetting = (db, key, value, userId) => db.prepare(`INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}, updated_by = excluded.updated_by`).bind(key, JSON.stringify(value), userId);

app.get('/api/settings/document-types', requireAuth, async (c) => c.json({ documentTypes: await loadJsonSetting(c.env.DB, 'document_types') }));

app.put('/api/settings/document-types', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user.isDcc) return c.json(DCC_ONLY, 403);
  const { documentTypes } = await c.req.json().catch(() => ({}));
  const codes = Array.isArray(documentTypes) ? documentTypes.map((t) => String(t?.code ?? '')) : [];
  if (!codes.length || codes.length > 50 || codes.some((code) => !/^[A-Z0-9]{1,10}$/.test(code)) || new Set(codes).size !== codes.length) return c.json({ error: 'รหัสประเภทเอกสารต้องเป็น A-Z 0-9 ไม่เกิน 10 ตัว และห้ามซ้ำ' }, 400);
  if (documentTypes.some((t) => typeof t.nameTh !== 'string' || !t.nameTh.trim())) return c.json({ error: 'กรุณากรอกชื่อประเภทเอกสาร' }, 400);
  if (JSON.stringify(documentTypes).length > 100000) return c.json({ error: 'ข้อมูลประเภทเอกสารใหญ่เกินไป' }, 400);
  const db = c.env.DB;
  // A new type needs approval levels to route by; it starts like the common ones and the DCC adjusts it in the matrix.
  await db.batch([
    saveJsonSetting(db, 'document_types', documentTypes, user.id),
    ...documentTypes.map((t) => db.prepare('INSERT OR IGNORE INTO approval_matrix (doc_type, name_th, min_requester_level, required_reviewer_level, required_approver_level, updated_by) VALUES (?, ?, 1, 4, 5, ?)').bind(t.code, t.nameTh.slice(0, 200), user.id)),
    audit(db, user.id, 'DOCUMENT_TYPES_UPDATED', { codes, inactive: documentTypes.filter((t) => t.status === 'INACTIVE').map((t) => t.code) })
  ]);
  return c.json({ documentTypes });
});

const SLA_KEYS = ['reviewSlaDays', 'approvalSlaDays', 'hardcopyReceiptSlaDays', 'recallSlaDays'];
app.get('/api/settings/sla', requireAuth, async (c) => c.json({ sla: await loadJsonSetting(c.env.DB, 'sla_settings') }));

app.put('/api/settings/sla', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user.isDcc) return c.json(DCC_ONLY, 403);
  const body = await c.req.json().catch(() => ({}));
  if (!SLA_KEYS.every((k) => Number.isInteger(body[k]) && body[k] >= 1 && body[k] <= 365)) return c.json({ error: 'จำนวนวัน SLA ต้องเป็นจำนวนเต็ม 1-365' }, 400);
  const db = c.env.DB;
  const sla = Object.fromEntries(SLA_KEYS.map((k) => [k, body[k]]));
  await db.batch([saveJsonSetting(db, 'sla_settings', sla, user.id), audit(db, user.id, 'SLA_SETTINGS_UPDATED', { before: await loadJsonSetting(db, 'sla_settings'), after: sla })]);
  return c.json({ sla });
});

// Signatures are stamped onto PDFs in the browser, so every signed-in person can read them; only DCC (or the owner) can change one.
const MAX_SIGNATURE_CHARS = 700000;
const short = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null);
app.get('/api/signatures', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT user_id, signature_type, signature_style, initials, image, updated_at FROM user_signatures').all();
  return c.json({ signatures: results });
});

app.put('/api/users/:id/signature', requireAuth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user.isDcc && user.id !== id) return c.json({ error: 'แก้ได้เฉพาะลายเซ็นของตัวเอง หรือเป็น DCC' }, 403);
  const body = await c.req.json().catch(() => ({}));
  if (!['DRAWN', 'IMAGE', 'TYPOGRAPHIC'].includes(body.signature_type)) return c.json({ error: 'ชนิดลายเซ็นไม่ถูกต้อง' }, 400);
  if (typeof body.image !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(body.image) || body.image.length > MAX_SIGNATURE_CHARS) return c.json({ error: 'ภาพลายเซ็นต้องเป็น PNG หรือ JPEG ขนาดไม่เกินประมาณ 500 KB' }, 400);
  const db = c.env.DB;
  if (!(await db.prepare('SELECT 1 FROM users WHERE id = ?').bind(id).first())) return c.json({ error: 'ไม่พบผู้ใช้' }, 404);
  await db.batch([
    db.prepare(`INSERT INTO user_signatures (user_id, signature_type, signature_style, initials, image, updated_by) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET signature_type = excluded.signature_type, signature_style = excluded.signature_style, initials = excluded.initials,
      image = excluded.image, updated_at = ${NOW}, updated_by = excluded.updated_by`)
      .bind(id, body.signature_type, short(body.signature_style), short(body.initials), body.image, user.id),
    audit(db, user.id, 'SIGNATURE_UPDATED', { user_id: id, type: body.signature_type })
  ]);
  return c.json({ ok: true });
});

const MAX_AUDIT_ROWS = 50000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// A cell starting with = + - @ would run as a formula when the CSV is opened in Excel.
const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};

// For auditors: the whole trail, filtered by date (inclusive) and action, as JSON pages or one CSV.
app.get('/api/audit-log', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user.isDcc && !user.isQmr) return c.json({ error: 'เฉพาะ DCC และ QMR เท่านั้นที่ดู Audit Log ได้' }, 403);
  const { from, to, action, before_id: beforeId, format } = c.req.query();
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return c.json({ error: 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD' }, 400);
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 1000, 1), MAX_AUDIT_ROWS);

  const filters = [[from, 'a.at >= ?'], [to, "a.at < date(?, '+1 day')"], [action, 'a.action = ?'], [beforeId, 'a.id < ?']].filter(([value]) => value);
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.at, a.actor_id, u.name AS actor_name, u.email AS actor_email, a.action, a.details
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     ${filters.length ? `WHERE ${filters.map(([, sql]) => sql).join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT ?`
  ).bind(...filters.map(([value]) => value), limit).all();
  await audit(c.env.DB, user.id, 'AUDIT_LOG_EXPORTED', { from, to, action, format: format || 'json', rows: results.length }).run();

  if (format === 'csv') {
    const columns = ['id', 'at', 'actor_id', 'actor_name', 'actor_email', 'action', 'details'];
    const lines = [columns.join(','), ...results.map((row) => columns.map((k) => csvCell(row[k])).join(','))];
    // The BOM makes Excel read the Thai names as UTF-8.
    return new Response(`﻿${lines.join('\r\n')}\r\n`, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="audit-log.csv"', 'Cache-Control': 'private, no-store' }
    });
  }
  return c.json({ entries: results, next_before_id: results.length === limit ? results.at(-1).id : null });
});

// Workers calls scheduled() from the cron in wrangler.jsonc; tests call request() directly.
export default {
  fetch: app.fetch,
  request: app.request,
  scheduled: (event, env, ctx) => ctx.waitUntil(activateDue(env.DB))
};
