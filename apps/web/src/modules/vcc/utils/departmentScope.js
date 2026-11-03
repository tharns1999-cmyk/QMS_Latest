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
