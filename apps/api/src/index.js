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

export default app;
