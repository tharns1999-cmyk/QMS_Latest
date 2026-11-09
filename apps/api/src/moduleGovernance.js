import { MODULE_STATES, canManageModule, hasModulePermission, getVccAccess, loadModuleState } from './moduleAccess.js';
import { loadVccProfiles, controlledVccForm, vccProfileReadiness, vccProfileThresholds } from './vccConfiguration.js';
import { getUserDepartments } from './vccAuth.js';

const denied = { error: 'ต้องได้รับมอบหมายสิทธิ์จัดการระบบย่อยนี้', code: 'MODULE_MANAGE_REQUIRED' };
const reasonOf = (body) => typeof body.reason === 'string' && body.reason.trim().length <= 1000 ? body.reason.trim() : '';
const catalog = [{ moduleId: 'dcc', name: 'ระบบควบคุมเอกสาร (DCC)' }, { moduleId: 'vcc', name: 'ศูนย์ทวนสอบและสอบเทียบ (VCC)' }];

export const moduleImpact = async (db, department = null) => {
  const plans = await db.prepare(`SELECT status, count(*) AS count FROM vcc_annual_plans WHERE (? IS NULL OR department = ?) GROUP BY status`).bind(department, department).all();
  const orders = await db.prepare(`SELECT w.status, count(*) AS count FROM vcc_work_orders w JOIN vcc_assets a ON a.id = w.asset_id
    WHERE (? IS NULL OR a.department = ?) GROUP BY w.status`).bind(department, department).all();
  const { count: pendingAlerts } = await db.prepare(`SELECT count(*) AS count FROM vcc_notifications n
    JOIN vcc_assets a ON a.id = n.asset_id WHERE n.status IN ('PENDING','ACKNOWLEDGED') AND (? IS NULL OR a.department = ?)`).bind(department, department).first();
  return { plans: plans.results, workOrders: orders.results, pendingAlerts };
};

const versionStatement = (db, version, userId) => db.prepare(`UPDATE module_configuration SET version = version + 1,
  updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE module_id = 'vcc' AND version = ?`).bind(userId, version);
const changed = (db) => db.prepare("SELECT json(CASE WHEN changes()=0 THEN 'stale' ELSE '1' END)");

export const governanceBatch = async (c, statements) => {
  try { await c.env.DB.batch(statements); return null; }
  catch (err) {
    if (/malformed JSON/.test(String(err.message))) return c.json({ code: 'STATE_CHANGED', error: 'ค่าตั้งค่าถูกเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก' }, 409);
    if (/LAST_PLATFORM_ADMIN/.test(String(err.message))) return c.json({ error: 'ไม่สามารถถอนสิทธิ์ผู้ดูแลแพลตฟอร์มคนสุดท้ายได้' }, 409);
    throw err;
  }
};

export const registerModuleGovernanceRoutes = (app, { requireAuth, audit }) => {
  app.get('/api/modules', requireAuth, async (c) => {
    const db = c.env.DB, user = c.get('user');
    const state = await loadModuleState(db);
    const access = await getVccAccess(db, user);
    return c.json({ platformAdmin: await hasModulePermission(db, user, 'PLATFORM_ADMIN'), modules: [
      { ...catalog[0], status: 'ACTIVE', allowed: true, canManage: false },
      { ...catalog[1], ...state, allowed: access.allowed, canManage: await canManageModule(db, user, 'vcc'),
        canEnter: access.allowed && ['ACTIVE','READ_ONLY'].includes(state?.status), taskOnly: access.taskOnly, departments: access.departments }
    ] });
  });

  app.use('/api/module-governance/*', requireAuth, async (c, next) => {
    if (!await canManageModule(c.env.DB, c.get('user'), 'vcc')) return c.json(denied, 403);
    await next();
  });

  app.get('/api/module-governance/vcc', async (c) => {
    const db = c.env.DB;
    const profiles = await loadVccProfiles(db);
    const { results: departments } = await db.prepare(`SELECT d.*, COALESCE(md.enabled,0) AS enabled FROM departments d
      LEFT JOIN module_departments md ON md.department=d.code AND md.module_id='vcc' ORDER BY d.code`).all();
    const { results: users } = await db.prepare("SELECT id,name,primary_department,departments,approval_level FROM users WHERE status='ACTIVE' ORDER BY name").all();
    const { results: forms } = await db.prepare(`SELECT id,doc_code,revision,name,department,effective_date FROM documents
      WHERE doc_type='FM' AND status='EFFECTIVE' AND effective_date IS NOT NULL AND date(effective_date)<=date('now','+7 hours') ORDER BY doc_code,revision`).all();
    const readiness = {};
    for (const dept of departments) readiness[dept.code] = await vccProfileReadiness(db, profiles[dept.code]);
    return c.json({ module: await loadModuleState(db), departments, profiles, readiness, users: users.map((u) => ({ ...u, departments: getUserDepartments(u) })), forms,
      policy: await vccProfileThresholds(db), impact: await moduleImpact(db), platformAdmin: await hasModulePermission(db, c.get('user'), 'PLATFORM_ADMIN') });
  });

  app.get('/api/module-governance/vcc/impact', async (c) => c.json(await moduleImpact(c.env.DB, c.req.query('department') || null)));

  app.put('/api/module-governance/:moduleId/status', async (c) => {
    const db = c.env.DB, user = c.get('user');
    if (c.req.param('moduleId') !== 'vcc') {
      if (!await hasModulePermission(db, user, 'PLATFORM_ADMIN')) return c.json({ error: 'การควบคุม DCC ต้องใช้สิทธิ์ผู้ดูแลแพลตฟอร์ม' }, 403);
      return c.json({ error: 'การควบคุมสถานะ DCC ยังไม่เปิดใช้งานในงานนี้ เพื่อรักษาการทำงานเดิม' }, 409);
    }
    const body = await c.req.json().catch(() => ({}));
    const reason = reasonOf(body);
    if (!reason || !MODULE_STATES.includes(body.status) || !Number.isInteger(body.version)) return c.json({ error: 'กรุณาระบุสถานะ เหตุผล และรุ่นค่าตั้งค่าให้ครบถ้วน' }, 400);
    const message = typeof body.maintenance_message === 'string' ? body.maintenance_message.trim() : '';
    if (message.length > 1000 || body.status === 'MAINTENANCE' && !message) return c.json({ error: 'กรุณาระบุข้อความแจ้งปรับปรุงระบบ ไม่เกิน 1,000 ตัวอักษร' }, 400);
    const before = await loadModuleState(db);
    if (before.status === body.status && before.maintenance_message === message) return c.json({ module: before });
    const impact = await moduleImpact(db);
    const conflict = await governanceBatch(c, [
      db.prepare(`UPDATE module_configuration SET status=?, maintenance_message=?, version=version+1,
        updated_by=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE module_id='vcc' AND version=?`).bind(body.status, message, user.id, body.version),
      changed(db), audit(db, user.id, 'MODULE_STATUS_CHANGED', { module_id: 'vcc', before, after: { status: body.status, maintenance_message: message }, reason, impact })
    ]);
    return conflict || c.json({ module: await loadModuleState(db) });
  });

  app.put('/api/module-governance/vcc/departments/:dept', async (c) => {
    const db = c.env.DB, user = c.get('user'), department = c.req.param('dept');
    const body = await c.req.json().catch(() => ({})), reason = reasonOf(body);
    if (!reason || typeof body.enabled !== 'boolean' || !Number.isInteger(body.version)) return c.json({ error: 'กรุณาระบุการเปิดใช้งาน เหตุผล และรุ่นค่าตั้งค่า' }, 400);
    const dept = await db.prepare('SELECT * FROM departments WHERE code=?').bind(department).first();
    if (!dept) return c.json({ error: 'ไม่พบแผนกในข้อมูลกลาง' }, 404);
    if (body.enabled && dept.status !== 'ACTIVE') return c.json({ error: 'แผนกนี้ปิดใช้งานในข้อมูลกลางแล้ว' }, 422);
    const before = await db.prepare("SELECT * FROM module_departments WHERE module_id='vcc' AND department=?").bind(department).first();
    if (body.enabled && !before?.enabled) {
      const readiness = await vccProfileReadiness(db, (await loadVccProfiles(db))[department]);
      if (readiness.status !== 'READY') return c.json({ error: readiness.issues.join(' / '), code: readiness.status }, 422);
    }
    if (before && Boolean(before.enabled) === body.enabled) return c.json({ department: before });
    const impact = await moduleImpact(db, department);
    const conflict = await governanceBatch(c, [versionStatement(db, body.version, user.id), changed(db),
      db.prepare(`INSERT INTO module_departments(module_id,department,enabled) VALUES('vcc',?,?)
        ON CONFLICT(module_id,department) DO UPDATE SET enabled=excluded.enabled`).bind(department, Number(body.enabled)),
      audit(db, user.id, 'MODULE_DEPARTMENT_CHANGED', { module_id: 'vcc', department, before, after: { enabled: body.enabled }, reason, impact })]);
    return conflict || c.json({ success: true });
  });

  app.put('/api/module-governance/vcc/profiles/:dept', async (c) => {
    const db = c.env.DB, user = c.get('user'), department = c.req.param('dept');
    const body = await c.req.json().catch(() => ({})), reason = reasonOf(body);
    if (!reason || !Number.isInteger(body.version)) return c.json({ error: 'กรุณาระบุเหตุผลและรุ่นค่าตั้งค่า' }, 400);
    if (!await db.prepare("SELECT 1 FROM departments WHERE code=? AND status='ACTIVE'").bind(department).first()) return c.json({ error: 'ไม่พบแผนกที่เปิดใช้งานในข้อมูลกลาง' }, 404);
    const profiles = await loadVccProfiles(db), before = profiles[department] || null;
    const profile = {};
    for (const field of ['document_code','revision','reviewer_dept','approver_dept']) {
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > 100) return c.json({ error: 'กรุณาระบุแบบฟอร์ม ฉบับ และแผนกของผู้รับผิดชอบให้ครบถ้วน' }, 400);
      profile[field] = body[field].trim();
    }
    for (const stage of ['reviewer','approver']) {
      if (!await db.prepare("SELECT 1 FROM departments WHERE code=? AND status='ACTIVE'").bind(profile[`${stage}_dept`]).first()) return c.json({ error: 'แผนกผู้รับผิดชอบไม่พร้อมใช้งาน' }, 422);
    }
    const floor = await vccProfileThresholds(db, before || {});
    for (const [field, min] of [['min_preparer_level',floor.min_requester_level],['required_reviewer_level',floor.required_reviewer_level],['required_approver_level',floor.required_approver_level]]) {
      if (!Number.isInteger(body[field]) || body[field] < min || body[field] > 8) return c.json({ error: `ระดับอนุมัติต้องไม่ต่ำกว่า L${min} และไม่เกิน L8` }, 422);
      profile[field] = body[field];
    }
    profile.assigned_reviewer_id = typeof body.assigned_reviewer_id === 'string' ? body.assigned_reviewer_id : null;
    profile.assigned_approver_id = typeof body.assigned_approver_id === 'string' ? body.assigned_approver_id : null;
    const form = await controlledVccForm(db, profile);
    if (!form) return c.json({ code: 'CONFIGURATION_INCOMPLETE', error: 'กรุณาเลือกแบบฟอร์ม DCC ที่มีผลบังคับใช้จริง' }, 422);
    profile.document_id = form.id;
    profile.title_th = form.name;
    profile.form_issue_date = form.effective_date;
    const readiness = await vccProfileReadiness(db, profile);
    if (readiness.status !== 'READY') return c.json({ error: readiness.issues.join(' / '), code: readiness.status }, 422);
    const conflict = await governanceBatch(c, [versionStatement(db, body.version, user.id), changed(db),
      db.prepare(`UPDATE settings SET value=?,updated_by=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='vcc_document_profiles'`).bind(JSON.stringify({ ...profiles, [department]: profile }), user.id),
      audit(db, user.id, 'VCC_DOCUMENT_PROFILE_UPDATED', { department, before, after: profile, reason })]);
    return conflict || c.json({ profile });
  });

  app.get('/api/module-governance/vcc/history', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT a.id,a.actor_id,u.name AS actor_name,a.action,a.details,a.at AS created_at FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
      WHERE a.action IN ('MODULE_STATUS_CHANGED','MODULE_DEPARTMENT_CHANGED','MODULE_PERMISSION_GRANTED','MODULE_PERMISSION_REVOKED','VCC_DOCUMENT_PROFILE_UPDATED')
      ORDER BY a.id DESC LIMIT 100`).all();
    return c.json({ history: results });
  });

  app.get('/api/module-governance/vcc/alerts', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT n.id,n.notification_type,n.title,n.message,n.status,n.escalation_level,n.due_date,a.asset_code,a.department
      FROM vcc_notifications n JOIN vcc_assets a ON a.id=n.asset_id WHERE n.status IN ('PENDING','ACKNOWLEDGED') ORDER BY n.escalation_level DESC,n.created_at DESC LIMIT 200`).all();
    return c.json({ alerts: results });
  });

  app.get('/api/module-governance/permissions', async (c) => {
    if (!await hasModulePermission(c.env.DB, c.get('user'), 'PLATFORM_ADMIN')) return c.json(denied, 403);
    const { results } = await c.env.DB.prepare(`SELECT g.*,u.name FROM module_permission_grants g JOIN users u ON u.id=g.user_id ORDER BY u.name`).all();
    return c.json({ grants: results });
  });

  for (const method of ['post','delete']) app[method]('/api/module-governance/permissions', async (c) => {
    const db = c.env.DB, user = c.get('user');
    if (!await hasModulePermission(db, user, 'PLATFORM_ADMIN')) return c.json(denied, 403);
    const body = await c.req.json().catch(() => ({})), reason = reasonOf(body);
    if (!reason || !['MODULE_MANAGE','PLATFORM_ADMIN'].includes(body.permission) || body.module_id !== (body.permission === 'PLATFORM_ADMIN' ? '*' : 'vcc')) return c.json({ error: 'กรุณาระบุสิทธิ์ ขอบเขต และเหตุผลให้ถูกต้อง' }, 400);
    if (!await db.prepare("SELECT 1 FROM users WHERE id=? AND status='ACTIVE'").bind(body.user_id || '').first()) return c.json({ error: 'ไม่พบบัญชีผู้ใช้ที่เปิดใช้งาน' }, 404);
    const before = await db.prepare('SELECT * FROM module_permission_grants WHERE user_id=? AND permission=? AND module_id=?').bind(body.user_id, body.permission, body.module_id).first();
    if (method === 'post' && before || method === 'delete' && !before) return c.json({ success: true });
    const statement = method === 'post'
      ? db.prepare('INSERT INTO module_permission_grants(user_id,permission,module_id,granted_by) VALUES(?,?,?,?)').bind(body.user_id,body.permission,body.module_id,user.id)
      : db.prepare('DELETE FROM module_permission_grants WHERE user_id=? AND permission=? AND module_id=?').bind(body.user_id,body.permission,body.module_id);
    const conflict = await governanceBatch(c, [statement, audit(db,user.id,method === 'post' ? 'MODULE_PERMISSION_GRANTED' : 'MODULE_PERMISSION_REVOKED',
      { user_id:body.user_id, permission:body.permission, module_id:body.module_id, before, after:method === 'post' ? { granted:true } : null, reason })]);
    return conflict || c.json({ success:true });
  });
};
