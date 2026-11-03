// Authorization helpers for VCC (Verify and Calibration Center)
export const VCC_ALLOWED_DEPTS = ['DC', 'QC', 'QA', 'MGT', 'LB'];

/**
 * Checks whether the user is authorized to access the VCC module (DCC, QC, QA, or QMR).
 * @param {Object} user - Decoded user from requireAuth middleware
 * @returns {boolean}
 */
export const isVccAuthorized = (user) => {
  if (!user) return false;
  if (user.isDcc || user.isQmr || Number(user.approval_level || user.approvalLevel || 0) >= 6) return true;
  const userDepts = [
    user.department,
    user.dept,
    user.primary_department,
    ...(Array.isArray(user.depts) ? user.depts : []),
    ...(Array.isArray(user.departments) ? user.departments : []),
    ...(Array.isArray(user.secondaryDepartments) ? user.secondaryDepartments : []),
    ...(Array.isArray(user.affiliated_departments) ? user.affiliated_departments : [])
  ]
    .filter(Boolean)
    .map((d) => String(d).toUpperCase().trim());
  return userDepts.some((d) => VCC_ALLOWED_DEPTS.includes(d));
};

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
  if (user.isDcc || user.is_dcc || user.isQmr || user.is_qmr) return true;
  if (Number(user.approval_level ?? user.approvalLevel ?? 0) >= 6) return true;
  return getUserDepartments(user).includes('MGT');
};

export const canReadVccDepartment = (user, department) =>
  canReadAllVccDepartments(user) || getUserDepartments(user).includes(String(department || '').toUpperCase());

// SQL fragment limiting rows to the departments the user may read; null means no restriction.
export const vccDeptScopeSql = (user, column) => {
  if (canReadAllVccDepartments(user)) return null;
  const depts = getUserDepartments(user);
  if (depts.length === 0) return { sql: '1 = 0', args: [] };
  return { sql: `${column} IN (${depts.map(() => '?').join(',')})`, args: depts };
};

export const VCC_DEPT_FORBIDDEN = { error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลของแผนกนี้' };
export const VCC_FORBIDDEN = { error: 'เฉพาะผู้ใช้งานแผนก DCC, QC, QA, MGT และ LB เท่านั้นที่สามารถเข้าใช้งานส่วนนี้ได้' };
export const DCC_ONLY = { error: 'เฉพาะ DCC เท่านั้นที่สามารถตั้งค่าหรือจัดการข้อมูลส่วนนี้ได้' };

/**
 * Middleware ensuring user has VCC module access.
 */
export const requireVccAccess = async (c, next) => {
  const user = c.get('user');
  if (!isVccAuthorized(user)) {
    return c.json(VCC_FORBIDDEN, 403);
  }
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

