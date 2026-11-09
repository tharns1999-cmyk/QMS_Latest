import { getVccAccess } from './moduleAccess.js';
// Authorization helpers for VCC (Verify and Calibration Center)
export const getUserDepartments = (user) => {
  if (!user) return [];
  const depts = [];
  if (user.department) depts.push(user.department);
  if (user.primary_department) depts.push(user.primary_department);
  if (user.dept) depts.push(user.dept);
  if (user.dept_code) depts.push(user.dept_code);
  let parsedDepts = user.departments;
  if (typeof parsedDepts === 'string' && parsedDepts.startsWith('[')) {
    try { parsedDepts = JSON.parse(parsedDepts); } catch {}
  }
  if (Array.isArray(parsedDepts)) depts.push(...parsedDepts);
  if (Array.isArray(user.secondaryDepartments)) depts.push(...user.secondaryDepartments);
  if (Array.isArray(user.depts)) depts.push(...user.depts);
  if (Array.isArray(user.affiliated_departments)) depts.push(...user.affiliated_departments);
  return [...new Set(depts.filter(Boolean).map((d) => String(d).toUpperCase()))];
};

// READ scope: DCC, QMR, L6+ (existing policy) and MGT see every department; everyone else only their own department(s).
// Writes and approvals keep their own rule (isUserAuthorizedForPlanDept in vccPlans.js).
export const canReadAllVccDepartments = (user) => {
  if (!user) return false;
  if (user.vccTaskOnly) return false;
  if (user.isDcc || user.is_dcc || user.isQmr || user.is_qmr) return true;
  if (Number(user.approval_level ?? user.approvalLevel ?? 0) >= 6) return true;
  return getUserDepartments(user).includes('MGT');
};

export const canReadVccDepartment = (user, department) =>
  !user?.vccTaskOnly && (canReadAllVccDepartments(user) || getUserDepartments(user).includes(String(department || '').toUpperCase()));

// SQL fragment limiting rows to the departments the user may read; null means no restriction.
export const vccDeptScopeSql = (user, column) => {
  if (user?.vccTaskOnly) return { sql: '1 = 0', args: [] };
  if (canReadAllVccDepartments(user)) return null;
  const depts = getUserDepartments(user);
  if (depts.length === 0) return { sql: '1 = 0', args: [] };
  return { sql: `${column} IN (${depts.map(() => '?').join(',')})`, args: depts };
};

// WRITE scope for the asset register: DCC manages every department; L4+ may manage only assets of a VCC department they belong to.
// Seniority (L6+, QMR) and MGT read access do not widen this; moving an asset to another department stays DCC-only.
export const VCC_ASSET_MANAGE_MIN_LEVEL = 4;
export const manageableVccDepartments = (user) => {
  if (!user) return [];
  if (user.isDcc) return [...(user.vccDepartments || [])];
  if (Number(user.approval_level ?? user.approvalLevel ?? 0) < VCC_ASSET_MANAGE_MIN_LEVEL) return [];
  return getUserDepartments(user).filter((d) => (user.vccDepartments || []).includes(d));
};
export const canManageVccAsset = (user, department) => {
  if (!user) return false;
  if (user.isDcc) return true;
  return manageableVccDepartments(user).includes(String(department || '').toUpperCase());
};
export const VCC_ASSET_MANAGE_FORBIDDEN = {
  error: 'จัดการได้เฉพาะเครื่องมือของแผนกตนเอง (หัวหน้าแผนกระดับ L4 ขึ้นไป) หรือ DCC เท่านั้น'
};
export const VCC_ASSET_TRANSFER_FORBIDDEN = { error: 'การโอนเครื่องมือข้ามแผนกทำได้เฉพาะ DCC เท่านั้น' };

export const VCC_DEPT_FORBIDDEN = { error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลของแผนกนี้' };
export const VCC_FORBIDDEN = { error: 'เฉพาะผู้ใช้งานแผนก DCC, QC, QA, MGT และ LB เท่านั้นที่สามารถเข้าใช้งานส่วนนี้ได้' };
export const DCC_ONLY = { error: 'เฉพาะ DCC เท่านั้นที่สามารถตั้งค่าหรือจัดการข้อมูลส่วนนี้ได้' };

/**
 * Middleware ensuring user has VCC module access.
 */
export const requireVccAccess = async (c, next) => {
  const access = await getVccAccess(c.env.DB, c.get('user'));
  if (!access.allowed) return c.json(VCC_FORBIDDEN, 403);
  c.get('user').vccDepartments = access.departments.map((d) => d.department);
  c.get('user').vccTaskOnly = access.taskOnly;
  await next();
};

/**
 * Middleware ensuring user is DCC (admin/supervisor for Master Data and global settings).
 */
export const requireDccOnly = async (c, next) => {
  const user = c.get('user');
  if (!user?.isDcc) {
    return c.json(DCC_ONLY, 403);
  }
  await next();
};

