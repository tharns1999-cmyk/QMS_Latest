// Authorization helpers for VCC (Verify and Calibration Center)
export const VCC_ALLOWED_DEPTS = ['DC', 'QC', 'QA'];

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

export const VCC_FORBIDDEN = { error: 'เฉพาะผู้ใช้งานแผนก DCC, QC และ QA เท่านั้นที่สามารถเข้าใช้งานส่วนนี้ได้' };
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

