export const MODULE_STATES = ['ACTIVE', 'READ_ONLY', 'MAINTENANCE', 'DISABLED'];

export const hasModulePermission = async (db, user, permission, moduleId = '*') => Boolean(user?.id && await db.prepare(`
  SELECT 1 FROM module_permission_grants g JOIN users u ON u.id = g.user_id
  WHERE g.user_id = ? AND g.permission = ? AND g.module_id = ? AND u.status = 'ACTIVE'
`).bind(user.id, permission, moduleId).first());

export const canManageModule = async (db, user, moduleId) =>
  await hasModulePermission(db, user, 'PLATFORM_ADMIN') || await hasModulePermission(db, user, 'MODULE_MANAGE', moduleId);

export const protectGovernanceAccount = async (c, userId) => {
  const protectedAccount = await c.env.DB.prepare('SELECT 1 FROM module_permission_grants WHERE user_id=? LIMIT 1').bind(userId).first();
  if (protectedAccount && !await hasModulePermission(c.env.DB, c.get('user'), 'PLATFORM_ADMIN')) {
    return c.json({ error: 'บัญชีผู้ดูแลระบบย่อยต้องให้ผู้ดูแลแพลตฟอร์มจัดการ เพื่อป้องกันการยึดสิทธิ์' }, 403);
  }
  return null;
};

export const loadModuleState = (db, moduleId = 'vcc') => db.prepare('SELECT * FROM module_configuration WHERE module_id = ?').bind(moduleId).first();

export const getVccAccess = async (db, user) => {
  if (!user) return { allowed: false, departments: [] };
  const depts = [...new Set([user.department, ...(user.depts || [])].filter(Boolean))];
  const { results: departments } = await db.prepare(`SELECT md.*, d.name_th, d.status AS department_status
    FROM module_departments md JOIN departments d ON d.code = md.department WHERE md.module_id = 'vcc' ORDER BY d.code`).all();
  const own = departments.filter((d) => depts.includes(d.department));
  const assigned = await db.prepare(`SELECT 1 FROM vcc_annual_plans WHERE assigned_reviewer_id = ? OR assigned_approver_id = ? LIMIT 1`).bind(user.id, user.id).first();
  const profileRow = await db.prepare("SELECT value FROM settings WHERE key = 'vcc_document_profiles'").first();
  const profiles = profileRow ? JSON.parse(profileRow.value) : {};
  const profileAssigned = Object.values(profiles).some((p) => p.assigned_reviewer_id === user.id || p.assigned_approver_id === user.id);
  const privileged = user.isDcc || user.isQmr || Number(user.approval_level || 0) >= 6;
  return { allowed: Boolean(privileged || own.length || assigned || profileAssigned), taskOnly: !privileged && !own.length && Boolean(assigned || profileAssigned), departments, ownDepartments: own };
};

export const canCreateVccDepartment = async (db, department) => Boolean(await db.prepare(`
  SELECT 1 FROM module_departments md JOIN departments d ON d.code = md.department
  WHERE md.module_id = 'vcc' AND md.department = ? AND md.enabled = 1 AND d.status = 'ACTIVE'
`).bind(department).first());

export const MODULE_LOCKED = { code: 'MODULE_LOCKED', error: 'VCC ไม่เปิดให้เปลี่ยนแปลงข้อมูลในขณะนี้ กรุณาตรวจสอบสถานะระบบ' };

export const requireVccModuleState = async (c, next) => {
  const state = await loadModuleState(c.env.DB);
  if (!state) return c.json({ code: 'CONFIGURATION_INCOMPLETE', error: 'ยังไม่ได้ตั้งค่าการควบคุม VCC' }, 503);
  if (state.status === 'MAINTENANCE' || state.status === 'DISABLED') {
    return c.json({ ...MODULE_LOCKED, status: state.status, error: state.maintenance_message || MODULE_LOCKED.error }, 503);
  }
  if (state.status === 'READ_ONLY' && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return c.json(MODULE_LOCKED, 403);
  await next();
};
