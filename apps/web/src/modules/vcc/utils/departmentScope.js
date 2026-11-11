// Mirrors the API read rule (apps/api/src/vccAuth.js): DCC, QMR, L6+ and MGT see every department, everyone else only their own.
// The API enforces it; this keeps the dropdowns from offering departments that would only come back empty or refused.
export const getUserDeptCodes = (user) => {
  if (!user) return [];
  const depts = new Set();
  if (user.department) depts.add(String(user.department).toUpperCase());
  if (user.dept) depts.add(String(user.dept).toUpperCase());
  if (user.dept_code) depts.add(String(user.dept_code).toUpperCase());
  if (user.primary_department) depts.add(String(user.primary_department).toUpperCase());
  if (user.primaryDepartment) depts.add(String(user.primaryDepartment).toUpperCase());

  const parseList = (val) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach((d) => d && depts.add(String(d).toUpperCase()));
    } else if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          parsed.forEach((d) => d && depts.add(String(d).toUpperCase()));
        } else if (parsed) {
          depts.add(String(parsed).toUpperCase());
        }
      } catch {
        val.split(',').forEach((d) => d.trim() && depts.add(d.trim().toUpperCase()));
      }
    }
  };

  parseList(user.departments);
  parseList(user.depts);
  parseList(user.secondaryDepartments);
  parseList(user.affiliated_departments);
  parseList(user.extra_departments);

  return Array.from(depts);
};

export const canReadAllVccDepartments = (user) => {
  if (!user) return false;
  if (user.isDcc || user.is_dcc || user.isQmr || user.is_qmr || user.role === 'DCC_ADMIN') return true;
  if (Number(user.approval_level ?? user.approvalLevel ?? user.level ?? 0) >= 6) return true;
  return getUserDeptCodes(user).includes('MGT');
};

export const filterReadableDepartments = (user, items, getCode = (d) => d) => {
  if (canReadAllVccDepartments(user)) return items;
  const own = getUserDeptCodes(user);
  return items.filter((d) => own.includes(String(getCode(d)).toUpperCase()));
};

// Mirrors the API write rule for the asset register (apps/api/src/vccAuth.js): DCC manages every department; L4+ manage only
// assets of a VCC department they belong to. L6+, QMR and MGT read access add nothing; the API enforces it, this only decides what is shown.
export const VCC_DEPARTMENTS = ['DC', 'QC', 'QA', 'MGT', 'LB'];
export const manageableVccDepartments = (user) => {
  if (!user || user.vccReadOnly) return [];
  if (user.isDcc) return [...(user.vccDepartments || VCC_DEPARTMENTS)];
  if (Number(user.approval_level ?? user.approvalLevel ?? user.level ?? 0) < 4) return [];
  return getUserDeptCodes(user).filter((d) => (user.vccDepartments || VCC_DEPARTMENTS).includes(d));
};
export const canManageVccAsset = (user, department) =>
  !user?.vccReadOnly && (Boolean(user?.isDcc) || manageableVccDepartments(user).includes(String(department || '').toUpperCase()));
