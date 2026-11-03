// Mirrors the server rule for closing or sending back a work-order result, so the UI only offers buttons that can work.
// The server stays the authority: it still refuses anything this lets through.
export const canReviewWorkOrder = (user, workOrder, thresholds = {}) => {
  if (!user || !workOrder) return false;
  if (user.id === workOrder.performed_by) return false;
  const level = Number(user.approval_level ?? user.approvalLevel ?? user.level ?? 0);
  if (level < Number(thresholds.required_reviewer_level ?? 4)) return false;
  if (user.isDcc || user.isQmr || level >= 6) return true;
  const depts = [user.department, ...(user.depts || [])].filter(Boolean).map((d) => String(d).toUpperCase());
  return depts.includes(String(workOrder.department || '').toUpperCase());
};
