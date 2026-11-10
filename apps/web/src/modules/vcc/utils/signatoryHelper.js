/**
 * signatoryHelper.js
 *
 * Utility for resolving digital signatures and signatory information
 * for VCC documents (e.g. Annual Verification & Calibration Plan).
 * Reads safely from master users and signatures without cross-module violations.
 */

import { formatVccDate } from './vccDateUtils';

/**
 * Extracts a valid base64 or URL signature asset from a user object
 * @param {Object} user 
 * @returns {string|null}
 */
export const getSignatureAsset = (user) => {
  if (!user) return null;
  return (
    user.signatureImage ||
    user.eSignDataUrl ||
    user.signatureUrl ||
    (typeof user.signature === 'string' && user.signature.startsWith('data:image/') ? user.signature : null) ||
    (typeof user.eSign === 'string' && user.eSign.startsWith('data:image/') ? user.eSign : null) ||
    null
  );
};

/**
 * Resolves job position for printing, filtering out purely system roles
 * @param  {...string} candidates 
 * @returns {string}
 */
const SYSTEM_ROLES = new Set(['GENERAL_USER', 'DEPT_ADMIN', 'DCC_ADMIN', 'DCC_STAFF', 'APPROVER', 'REVIEWER', 'MGMT', 'QMR', 'ADMIN']);

export const resolveJobTitle = (...candidates) => {
  return candidates.find((v) => typeof v === 'string' && v.trim() && !SYSTEM_ROLES.has(v.trim().toUpperCase())) || '';
};

/**
 * Resolves 3-column signatory details (Preparer, Reviewer, Approver) for a plan
 * @param {Object} plan - VCC Plan object
 * @param {Array} masterUsers - List of all users in master data
 * @returns {{ preparer: Object, reviewer: Object, approver: Object }}
 */
export const resolvePlanSignatories = (plan = {}, masterUsers = []) => {
  const users = masterUsers || [];

  const findUser = (idOrName) => {
    if (!idOrName) return null;
    const key = String(idOrName).trim();
    return users.find((u) =>
      u.id === key ||
      u.empId === key ||
      u.userId === key ||
      u.name === key ||
      u.fullName === key
    ) || null;
  };

  const isApproved = plan.status === 'APPROVED';

  // 1. Preparer (ผู้จัดทำ)
  const prepUser = findUser(plan.prepared_by_id || plan.created_by || plan.prepared_by);
  const preparer = {
    id: plan.prepared_by_id || plan.created_by,
    name: plan.prepared_by_name || prepUser?.name || plan.prepared_by || 'ผู้จัดทำ',
    position: resolveJobTitle(plan.prepared_by_position, prepUser?.position, 'เจ้าหน้าที่ประกันคุณภาพ / ผู้รับผิดชอบ'),
    date: plan.prepared_at ? formatVccDate(plan.prepared_at) : (plan.created_at ? formatVccDate(plan.created_at) : '-'),
    signatureAsset: isApproved ? getSignatureAsset(prepUser) : null,
    isSigned: Boolean(plan.prepared_at || plan.created_at)
  };

  // 2. Reviewer (ผู้ทบทวน)
  const revUser = findUser(plan.reviewed_by_id || plan.assigned_reviewer_id || plan.reviewed_by);
  const reviewer = {
    id: plan.reviewed_by_id || plan.assigned_reviewer_id,
    name: plan.reviewed_by_name || revUser?.name || plan.reviewed_by || (plan.status === 'PENDING_REVIEW' ? 'รอการทบทวน' : '-'),
    position: resolveJobTitle(plan.reviewed_by_position, revUser?.position, 'หัวหน้างาน / ผู้ทบทวน (L4)'),
    date: plan.reviewed_at ? formatVccDate(plan.reviewed_at) : '-',
    signatureAsset: isApproved ? getSignatureAsset(revUser) : null,
    isSigned: Boolean(plan.reviewed_at)
  };

  // 3. Approver (ผู้อนุมัติ)
  const appUser = findUser(plan.approved_by_id || plan.assigned_approver_id || plan.approved_by);
  const approver = {
    id: plan.approved_by_id || plan.assigned_approver_id,
    name: plan.approved_by_name || appUser?.name || plan.approved_by || (plan.status === 'PENDING_APPROVAL' ? 'รอการอนุมัติ' : '-'),
    position: resolveJobTitle(plan.approved_by_position, appUser?.position, 'ผู้จัดการฝ่าย / QMR (L5+)'),
    date: plan.approved_at ? formatVccDate(plan.approved_at) : '-',
    signatureAsset: isApproved ? getSignatureAsset(appUser) : null,
    isSigned: isApproved && Boolean(plan.approved_at)
  };

  return { preparer, reviewer, approver, isApproved };
};
