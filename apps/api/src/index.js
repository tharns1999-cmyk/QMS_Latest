import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { sign, verify } from 'hono/jwt';
import { hashPassword, verifyPassword } from './password.js';
import { checkDecisionRights, getThresholds } from './approval.js';

const MAX_FAILED_LOGINS = 5;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const MAX_FAILED_LOGINS_PER_IP = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const INVALID_LOGIN = { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };

const app = new Hono();

// This API only returns JSON and PDFs, so it needs no scripts, frames or subresources of its own.
app.use('*', secureHeaders({ xFrameOptions: 'DENY', contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }));

app.use('/api/*', (c, next) => cors({ origin: c.env.ALLOWED_ORIGIN.split(',') })(c, next));

const audit = (db, actorId, action, details) =>
  db.prepare('INSERT INTO audit_log (actor_id, action, details) VALUES (?, ?, ?)').bind(actorId, action, JSON.stringify(details));

const toPublicUser = (row) => ({
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
  mustChangePassword: row.must_change_password === 1
});

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

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return c.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, 400);

  const db = c.env.DB;
  // Cloudflare always sets this header; it is absent only in local dev and tests, where the limit is skipped.
  const ip = c.req.header('cf-connecting-ip');
  if (ip) {
    const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'LOGIN_FAILED' AND at > ? AND json_extract(details, '$.ip') = ?").bind(since, ip).first();
    if (n >= MAX_FAILED_LOGINS_PER_IP) return c.json({ error: 'พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' }, 429, { 'Retry-After': String(LOGIN_WINDOW_MS / 1000) });
  }
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

  await db.batch([
    db.prepare('UPDATE users SET failed_logins = 0 WHERE id = ?').bind(user.id),
    audit(db, user.id, 'LOGIN', {})
  ]);
  return c.json({ token: await issueToken(c.env.JWT_SECRET, user.id), user: toPublicUser(user) });
});

const PASSWORD_CHANGE_PATHS = ['/api/auth/me', '/api/auth/change-password'];

// The token carries only the user id; role, level and status are re-read so a lock or demotion applies at once.
export const requireAuth = async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
  const payload = token && await verify(token, c.env.JWT_SECRET, 'HS256').catch(() => null);
  const user = payload && await c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'").bind(payload.sub).first();
  // A password change signs out every token issued before it.
  if (!user || !(payload.iat >= user.password_changed_at)) return c.json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  if (user.must_change_password && !PASSWORD_CHANGE_PATHS.includes(c.req.path)) {
    return c.json({ error: 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน', code: 'PASSWORD_CHANGE_REQUIRED' }, 403);
  }
  c.set('user', toPublicUser(user));
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
  return c.json({ token: await issueToken(c.env.JWT_SECRET, user.id), user: toPublicUser({ ...user, must_change_password: 0 }) });
});

// Directory for routing DARs and showing who signed: active users, no credentials.
app.get('/api/users', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM users WHERE status = 'ACTIVE' ORDER BY name").all();
  return c.json({ users: results.map(toPublicUser) });
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

  await db.batch([
    db.prepare(`UPDATE approval_matrix SET min_requester_level = ?, required_reviewer_level = ?, required_approver_level = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by = ? WHERE doc_type = ?`).bind(requester, reviewer, approver, user.id, docType),
    audit(db, user.id, 'APPROVAL_MATRIX_UPDATED', {
      doc_type: docType,
      before: { min_requester_level: before.min_requester_level, required_reviewer_level: before.required_reviewer_level, required_approver_level: before.required_approver_level },
      after: { min_requester_level: requester, required_reviewer_level: reviewer, required_approver_level: approver }
    })
  ]);
  return c.json({ entry: await db.prepare('SELECT * FROM approval_matrix WHERE doc_type = ?').bind(docType).first() });
});

const DOC_STATUSES = ['EFFECTIVE', 'SUPERSEDED', 'OBSOLETE'];
// GENERAL documents are open to everyone; DEPT documents only to their department, DCC and QMR.
const VISIBLE_TO = `(access_scope = 'GENERAL' OR department IN (SELECT value FROM json_each(?)) OR ?)`;
const visibilityArgs = (user) => [JSON.stringify([...user.depts, user.department]), user.isDcc || user.isQmr ? 1 : 0];

// One status per request: Active, Superseded and Obsolete lists are never mixed (ISO 9001 7.5.3).
app.get('/api/documents', requireAuth, async (c) => {
  const status = (c.req.query('status') || 'EFFECTIVE').toUpperCase();
  if (!DOC_STATUSES.includes(status)) return c.json({ error: 'สถานะเอกสารไม่ถูกต้อง' }, 400);
  const { results } = await c.env.DB.prepare(`SELECT * FROM documents WHERE status = ? AND ${VISIBLE_TO} ORDER BY doc_code, revision`)
    .bind(status, ...visibilityArgs(c.get('user'))).all();
  return c.json({ documents: results });
});

app.get('/api/documents/:id', requireAuth, async (c) => {
  const doc = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND ${VISIBLE_TO}`)
    .bind(c.req.param('id'), ...visibilityArgs(c.get('user'))).first();
  // 404 rather than 403 so a hidden document's existence is not revealed.
  return doc ? c.json({ document: doc }) : c.json({ error: 'ไม่พบเอกสาร' }, 404);
});

const MAX_PDF_BYTES = 25 * 1024 * 1024; // matches the limit the upload forms state
const servePdf = async (c, key, filename) => {
  const obj = key && await c.env.FILES.get(key);
  if (!obj) return c.json({ error: 'ไม่พบไฟล์' }, 404);
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
  return servePdf(c, doc.file_key, `${doc.doc_code}_Rev${doc.revision}`);
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
  if (!/^[A-Z0-9-]+$/.test(docCode)) return c.json({ error: 'รหัสเอกสารไม่ถูกต้อง' }, 400);
  if (!str('reason')) return c.json({ error: 'กรุณาระบุเหตุผลของคำขอ' }, 400);

  // NEW takes its metadata from the request; REVISION/OBSOLETE take it from the effective document.
  const current = await db.prepare("SELECT * FROM documents WHERE doc_code = ? AND status = 'EFFECTIVE'").bind(docCode).first();
  let doc;
  if (type === 'NEW') {
    if (await db.prepare('SELECT 1 FROM documents WHERE doc_code = ?').bind(docCode).first()) return c.json({ error: 'รหัสเอกสารนี้มีอยู่แล้ว' }, 409);
    const scope = str('access_scope').toUpperCase() || 'DEPT';
    if (!str('name') || !str('doc_type') || !str('department')) return c.json({ error: 'กรุณากรอกชื่อ ประเภท และแผนกของเอกสาร' }, 400);
    if (!['GENERAL', 'DEPT'].includes(scope)) return c.json({ error: 'ขอบเขตการเข้าถึงไม่ถูกต้อง' }, 400);
    doc = { doc_type: str('doc_type').toUpperCase(), department: str('department').toUpperCase(), name: str('name'), access_scope: scope, revision: '00' };
  } else {
    if (!current) return c.json({ error: 'ไม่พบเอกสารฉบับที่มีผลบังคับใช้' }, 404);
    doc = { ...current, name: type === 'REVISION' && str('name') ? str('name') : current.name, revision: type === 'REVISION' ? nextRevision(current.revision) : null };
  }

  if (!user.depts.includes(doc.department) && user.department !== doc.department) return c.json({ error: 'ต้องเป็นสมาชิกแผนกเจ้าของเอกสาร' }, 403);
  const thresholds = await getThresholds(db, doc.doc_type);
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

  try {
    const [inserted] = await db.batch([
      db.prepare(`INSERT INTO dars (type, doc_code, doc_type, department, revision, name, access_scope, reason, requester_id, reviewer_id, approver_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
        .bind(type, docCode, doc.doc_type, doc.department, doc.revision, doc.name, doc.access_scope, str('reason'), user.id, reviewerId, approverId),
      audit(db, user.id, 'DAR_SUBMITTED', { type, doc_code: docCode })
    ]);
    return c.json({ dar: inserted.results[0] }, 201);
  } catch (err) {
    if (isLockConflict(err)) return c.json({ error: 'เอกสารนี้มีคำขอ DAR ที่ยังดำเนินการอยู่' }, 409);
    throw err;
  }
});

app.get('/api/dars', requireAuth, async (c) => {
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
  return servePdf(c, dar.file_key, `${dar.doc_code}_Rev${dar.revision}_DAR${dar.id}`);
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

app.post('/api/dars/:id/decision', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  if (body.decision !== 'APPROVE' && body.decision !== 'REJECT') return c.json({ error: 'ผลการพิจารณาต้องเป็น APPROVE หรือ REJECT' }, 400);
  if (body.decision === 'REJECT' && !comment) return c.json({ error: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' }, 400);

  const dar = await db.prepare('SELECT * FROM dars WHERE id = ?').bind(c.req.param('id')).first();
  if (!dar) return c.json({ error: 'ไม่พบคำขอ' }, 404);
  const stage = STAGE_BY_STATUS[dar.status];
  if (!stage) return c.json({ error: 'คำขอนี้ไม่อยู่ในขั้นตอนพิจารณา' }, 409);
  if (user.id !== (stage === 'REVIEW' ? dar.reviewer_id : dar.approver_id)) return c.json({ error: 'คุณไม่ได้รับมอบหมายให้พิจารณาคำขอนี้' }, 403);
  // Re-checked at decision time: the user's level or the matrix may have changed since submission.
  const problem = checkDecisionRights(user, { stage, department: dar.department, requesterId: dar.requester_id, reviewerId: dar.reviewer_id }, await getThresholds(db, dar.doc_type));
  if (problem) return c.json({ error: problem }, 403);
  if (body.decision === 'APPROVE' && dar.type !== 'OBSOLETE' && !dar.file_key) return c.json({ error: 'ผู้ขอยังไม่ได้แนบไฟล์ PDF' }, 409);

  const next = body.decision === 'REJECT' ? 'REJECTED' : stage === 'REVIEW' ? 'PENDING_APPROVAL' : 'PENDING_DCC';
  const stamp = stage === 'REVIEW' ? 'reviewed_at' : 'approved_at';
  // The status guard in WHERE makes a double click or a race a no-op instead of a second decision;
  // the file guard stops an approval landing on a PDF swapped in after it was read.
  const [updated] = await db.batch([
    db.prepare(`UPDATE dars SET status = ?, ${stamp} = ${NOW}, reject_comment = ? WHERE id = ? AND status = ? AND file_key IS ? RETURNING *`)
      .bind(next, comment || null, dar.id, dar.status, dar.file_key),
    db.prepare(`INSERT INTO audit_log (actor_id, action, details) SELECT ?, ?, ? WHERE changes() > 0`)
      .bind(user.id, body.decision === 'REJECT' ? 'DAR_REJECTED' : stage === 'REVIEW' ? 'DAR_REVIEWED' : 'DAR_APPROVED', JSON.stringify({ dar_id: dar.id, comment }))
  ]);
  if (!updated.results.length) return c.json({ error: 'คำขอนี้ถูกพิจารณาหรือเปลี่ยนไฟล์ไปแล้ว กรุณาโหลดใหม่' }, 409);
  // Uploads stop once the DAR leaves PENDING_REVIEW (a late one deletes its own object), so any other
  // object under this DAR is an orphan from concurrent uploads or a failed write: sweep it now.
  if (stage === 'REVIEW') {
    const { objects } = await c.env.FILES.list({ prefix: `dars/${dar.id}/` });
    const orphans = objects.map((o) => o.key).filter((key) => key !== dar.file_key);
    if (orphans.length) await c.env.FILES.delete(orphans);
  }
  return c.json({ dar: updated.results[0] });
});

// DCC puts an approved DAR into force: the register changes and the DAR closes in one transaction.
app.post('/api/dars/:id/publish', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user.isDcc) return c.json({ error: 'เฉพาะ DCC เท่านั้นที่ประกาศใช้เอกสารได้' }, 403);
  const db = c.env.DB;
  const dar = await db.prepare('SELECT * FROM dars WHERE id = ?').bind(c.req.param('id')).first();
  if (!dar) return c.json({ error: 'ไม่พบคำขอ' }, 404);
  if (dar.status !== 'PENDING_DCC') return c.json({ error: 'คำขอนี้ยังไม่พร้อมประกาศใช้' }, 409);

  const documentId = dar.type === 'OBSOLETE'
    ? (await db.prepare("SELECT id FROM documents WHERE doc_code = ? AND status = 'EFFECTIVE'").bind(dar.doc_code).first())?.id
    : crypto.randomUUID();
  if (!documentId) return c.json({ error: 'ไม่พบเอกสารฉบับที่มีผลบังคับใช้' }, 409);
  const retire = (status) => db.prepare("UPDATE documents SET status = ? WHERE doc_code = ? AND status = 'EFFECTIVE'").bind(status, dar.doc_code);
  const statements = dar.type === 'OBSOLETE' ? [retire('OBSOLETE')] : [
    ...(dar.type === 'REVISION' ? [retire('SUPERSEDED')] : []),
    db.prepare(`INSERT INTO documents (id, doc_code, revision, name, doc_type, department, status, access_scope, owner_id, effective_date, file_key)
      VALUES (?, ?, ?, ?, ?, ?, 'EFFECTIVE', ?, ?, date('now'), ?)`)
      .bind(documentId, dar.doc_code, dar.revision, dar.name, dar.doc_type, dar.department, dar.access_scope, dar.requester_id, dar.file_key)
  ];

  try {
    // A racing second publish of NEW/REVISION hits UNIQUE(doc_code, revision) and the whole batch rolls back.
    await db.batch([
      ...statements,
      // After the insert: document_id is a foreign key to the new row.
      db.prepare(`UPDATE dars SET status = 'COMPLETED', completed_at = ${NOW}, document_id = ? WHERE id = ? AND status = 'PENDING_DCC'`).bind(documentId, dar.id),
      audit(db, user.id, dar.type === 'OBSOLETE' ? 'DOCUMENT_OBSOLETED' : 'DOCUMENT_PUBLISHED', { dar_id: dar.id, doc_code: dar.doc_code, revision: dar.revision })
    ]);
  } catch (err) {
    if (isLockConflict(err)) return c.json({ error: 'คำขอนี้ถูกประกาศใช้ไปแล้ว' }, 409);
    throw err;
  }
  return c.json({ dar: await db.prepare('SELECT * FROM dars WHERE id = ?').bind(dar.id).first() });
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

export default app;
