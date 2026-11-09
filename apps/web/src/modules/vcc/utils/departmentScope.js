// Mirrors the API read rule (apps/api/src/vccAuth.js): DCC, QMR, L6+ and MGT see every department, everyone else only their own.
// The API enforces it; this keeps the dropdowns from offering departments that would only come back empty or refused.
export const getUserDeptCodes = (user) =>
  [...new Set(
    [user?.department, user?.primary_department, ...(user?.depts || []), ...(user?.departments || [])]
      .filter(Boolean)
      .map((d) => String(d).toUpperCase())
  )];

export const canReadAllVccDepartments = (user) => {
  if (!user) return false;
  if (user.isDcc || user.isQmr) return true;
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
