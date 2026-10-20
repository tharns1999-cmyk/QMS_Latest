import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { verifyPassword } from './password.js';

const MAX_FAILED_LOGINS = 5;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const INVALID_LOGIN = { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };

const app = new Hono();

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
  isQmr: row.is_qmr === 1
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return c.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, 400);

  const db = c.env.DB;
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const passwordOk = await verifyPassword(password, user?.password_hash);

  if (!user) {
    await audit(db, null, 'LOGIN_FAILED', { email }).run();
    return c.json(INVALID_LOGIN, 401);
  }
  if (!passwordOk) {
    await db.batch([
      db.prepare(`UPDATE users SET failed_logins = failed_logins + 1,
        status = CASE WHEN status = 'ACTIVE' AND failed_logins + 1 >= ? THEN 'LOCKED' ELSE status END
        WHERE id = ?`).bind(MAX_FAILED_LOGINS, user.id),
      audit(db, user.id, 'LOGIN_FAILED', { failed_logins: user.failed_logins + 1 })
    ]);
    return c.json(INVALID_LOGIN, 401);
  }
  if (user.status === 'LOCKED') return c.json({ error: 'บัญชีถูกล็อก กรุณาติดต่อ DCC' }, 423);
  if (user.status !== 'ACTIVE') return c.json({ error: 'บัญชีถูกปิดใช้งาน' }, 403);

  await db.batch([
    db.prepare('UPDATE users SET failed_logins = 0 WHERE id = ?').bind(user.id),
    audit(db, user.id, 'LOGIN', {})
  ]);
  const token = await sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }, c.env.JWT_SECRET, 'HS256');
  return c.json({ token, user: toPublicUser(user) });
});

// The token carries only the user id; role, level and status are re-read so a lock or demotion applies at once.
export const requireAuth = async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '');
  const payload = token && await verify(token, c.env.JWT_SECRET, 'HS256').catch(() => null);
  const user = payload && await c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'").bind(payload.sub).first();
  if (!user) return c.json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  c.set('user', toPublicUser(user));
  await next();
};

app.get('/api/auth/me', requireAuth, (c) => c.json({ user: c.get('user') }));

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

export default app;
