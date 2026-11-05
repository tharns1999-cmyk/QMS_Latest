import { canManageVccAsset } from './departmentScope';

const levelOf = (user) => Number(user.approval_level ?? user.approvalLevel ?? user.level ?? 0);
const inDepartment = (user, workOrder) => {
  if (user.isDcc || user.isQmr || levelOf(user) >= 6) return true;
  const depts = [user.department, ...(user.depts || [])].filter(Boolean).map((d) => String(d).toUpperCase());
  return depts.includes(String(workOrder.department || '').toUpperCase());
};

// Mirrors the server rule for closing or sending back a work-order result, so the UI only offers buttons that can work.
// The server stays the authority: it still refuses anything this lets through.
export const canReviewWorkOrder = (user, workOrder, thresholds = {}) => {
  if (!user || !workOrder) return false;
  if (user.id === workOrder.performed_by) return false;
  if (levelOf(user) < Number(thresholds.required_reviewer_level ?? 4)) return false;
  return inDepartment(user, workOrder);
};

// Mirrors POST /release-hold: L5+ (approver level) of the department, on a reviewed (CLOSED) work order, not the performer.
export const canReleaseWorkOrderHold = (user, workOrder, thresholds = {}) => {
  if (!user || !workOrder || workOrder.nc_status !== 'OPEN' || workOrder.status !== 'CLOSED') return false;
  if (user.id === workOrder.performed_by) return false;
  if (levelOf(user) < Number(thresholds.required_approver_level ?? 5)) return false;
  return inDepartment(user, workOrder);
};

// Mirrors POST /cancel: DCC or L4+ of the owning department, only while the work order is open and has no open NC.
export const canCancelWorkOrder = (user, workOrder) =>
  Boolean(user && workOrder) &&
  !['CLOSED', 'CANCELLED'].includes(workOrder.status) &&
  workOrder.nc_status !== 'OPEN' &&
  canManageVccAsset(user, workOrder.department);

// Mirrors POST /request-reschedule: User authorized for department, WO is active, and no pending request
export const canRequestReschedule = (user, workOrder) => {
  if (!user || !workOrder) return false;
  if (['CLOSED', 'CANCELLED'].includes(workOrder.status)) return false;
  if (workOrder.reschedule_status === 'REQUESTED') return false;
  return inDepartment(user, workOrder);
};

// Mirrors POST /approve-reschedule & /reject-reschedule: L4+ in dept, DCC/QMR, or L6+
export const canApproveReschedule = (user, workOrder) => {
  if (!user || !workOrder) return false;
  if (['CLOSED', 'CANCELLED'].includes(workOrder.status)) return false;
  if (workOrder.reschedule_status !== 'REQUESTED') return false;
  const isDccUser = Boolean(user.isDcc || user.is_dcc);
  const isQmrUser = Boolean(user.isQmr || user.is_qmr);
  const userLevel = levelOf(user);
  return isDccUser || isQmrUser || userLevel >= 6 || (userLevel >= 4 && inDepartment(user, workOrder));
};
