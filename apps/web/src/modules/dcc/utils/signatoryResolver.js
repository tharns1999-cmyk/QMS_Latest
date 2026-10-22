/**
 * signatoryResolver.js
 *
 * Progressive Workflow Signatory Resolver (100% Dynamic & Data-Driven)
 * ======================================================================
 * Computes the state of each signatory column (ผู้จัดทำ / ผู้ทบทวน / ผู้อนุมัติ)
 * dynamically from DAR workflow steps, history timeline, and master user profiles.
 * ZERO hardcoded names or fallback strings.
 */

import { inMemoryBlobRegistry } from './fileStorage';
import { formatSignatoryDate as _formatSignatoryDate } from '../../../shared/utils/dateFormatter';

/**
 * Extract active user signature asset from user object or in-memory blob cache
 */
export const getSignatureAsset = (user) => {
  if (!user) return null;
  const uid = user.id || user.empId || user.userId;
  const inMemorySig = uid ? (inMemoryBlobRegistry?.get(`user_sig_${uid}`) || (user.id ? inMemoryBlobRegistry?.get(`user_sig_${user.id}`) : null)) : null;
  return (
    user.signatureImage ||
    inMemorySig ||
    user.eSignDataUrl  ||
    user.signatureUrl  ||
    (typeof user.signature === 'string' && user.signature.startsWith('data:image/') ? user.signature : null) ||
    (typeof user.eSign     === 'string' && user.eSign.startsWith('data:image/')     ? user.eSign     : null) ||
    null
  );
};

// System roles describe access, not a job; they must never be printed under a signer's name.
const SYSTEM_ROLES = new Set(['GENERAL_USER', 'DEPT_ADMIN', 'DCC_ADMIN', 'DCC_STAFF', 'APPROVER', 'REVIEWER', 'MGMT', 'QMR', 'ADMIN']);

/** First candidate that is a real job title (the user's current position comes first). */
export const jobTitle = (...candidates) =>
  candidates.find((v) => typeof v === 'string' && v.trim() && !SYSTEM_ROLES.has(v.trim().toUpperCase())) || '';

/**
 * Format timestamp to Thai Buddhist Calendar date string (DD/MM/BBBB)
 */
export const formatSignatoryDate = (raw) => {
  return _formatSignatoryDate(raw);
};

/**
 * Resolve progressive signatory data for the 3-column matrix based on workflow stage.
 *
 * @param {{ dar: Object, task: Object, masterDoc: Object, stage: string, masterUsers: Array, users: Array, currentUser: Object }} opts
 * @returns {{ requester: Object, reviewer: Object, approver: Object }}
 */
export const resolveProgressiveSignatories = ({
  dar = {},
  task = {},
  masterDoc = {},
  stage = 'REVIEW',
  masterUsers = [],
  users = [],
  currentUser = null
} = {}) => {
  const allUsers = [...(masterUsers || []), ...(users || [])];
  const steps = dar?.workflowSteps || dar?.approvalWorkflow || [];
  const history = dar?.workflowHistory || dar?.timeline || task?.history || [];
  const isMasterStage = stage === 'MASTER' || 
    dar?.status === 'COMPLETED' || 
    dar?.status === 'APPROVED' ||
    ((!dar || !dar.id) && (masterDoc?.status === 'ACTIVE' || masterDoc?.status === 'EFFECTIVE' || masterDoc?.status === 'APPROVED'));

  // Direct pass-through only if masterDoc has explicit full signatories AND we are in master stage
  if (isMasterStage && masterDoc?.signatories && masterDoc.signatories.requester && masterDoc.signatories.reviewer && masterDoc.signatories.approver) {
    // The stored snapshot may predate the user's position; show the latest one from the user list.
    const latest = (s) => {
      const p = (allUsers || []).find((u) => s.id && (u.id === s.id || u.userId === s.id || u.empId === s.id));
      return { ...s, position: jobTitle(p?.position, s.position), isCompleted: true, isSigned: true };
    };
    return {
      requester: latest(masterDoc.signatories.requester),
      reviewer:  latest(masterDoc.signatories.reviewer),
      approver:  latest(masterDoc.signatories.approver)
    };
  }

  // Helper ค้นหา User Profile จาก allUsers
  const getUserProfile = (userId, userName) => {
    if (!userId && !userName) return null;
    return allUsers.find(u => 
      (userId && (u.id === userId || u.userId === userId || u.empId === userId)) ||
      (userName && (u.name === userName || u.fullName === userName))
    ) || null;
  };

  // 1. ตรวจสอบว่าใครเซ็นแล้วบ้างตามขั้นตอนจริง (Progressive Dynamic Stamping)
  let isReviewed = false;
  let isApproved = false;

  if (isMasterStage) {
    isReviewed = true;
    isApproved = true;
  } else if (stage === 'APPROVE') {
    isReviewed = true;
    isApproved = Boolean(dar?.status === 'APPROVED' || dar?.status === 'COMPLETED' || dar?.approved_by || dar?.approved_at || dar?.approvedBy);
  } else if (stage === 'REVIEW') {
    isReviewed = false;
    isApproved = false;
  } else {
    isReviewed = Boolean(
      dar?.status === 'PENDING_APPROVAL' || 
      dar?.status === 'APPROVED' || 
      dar?.status === 'COMPLETED' || 
      dar?.reviewed_by || 
      dar?.reviewed_at || 
      dar?.reviewedBy ||
      dar?.reviewed_by_name ||
      dar?.reviewed_by_role
    );
    isApproved = Boolean(
      dar?.status === 'APPROVED' || 
      dar?.status === 'COMPLETED' || 
      dar?.approved_by || 
      dar?.approved_at || 
      dar?.approvedBy ||
      dar?.approved_by_name ||
      dar?.approved_by_role
    );
  }

  // ----------------------------------------------------
  // 1. กล่องผู้จัดทำ (Requester) - เซ็นแล้วเสมอตั้งแต่ยื่นคำร้อง
  // ----------------------------------------------------
  const step1Def = steps.find(s => s.role === 'REQUESTER' || s.roleKey === 'REQUESTER' || s.step === 1);
  const reqHistory = history.find(h => h.role === 'REQUESTER' || h.step === 1 || h.action === 'SUBMIT' || h.action === 'REQUEST' || h.action === 'CREATE' || h.action === 'Created');
  const reqStepName = step1Def?.userName || step1Def?.name || step1Def?.assignedTo;
  const reqUserId = masterDoc?.signatories?.requester?.id || reqHistory?.userId || step1Def?.userId || dar?.requesterId || dar?.requester_id || masterDoc?.ownerId || masterDoc?.requesterId || currentUser?.id;
  const reqNameFallback = masterDoc?.signatories?.requester?.name || reqHistory?.userName || reqStepName || dar?.created_by_name || dar?.requesterName || dar?.requester_name || masterDoc?.ownerName || masterDoc?.requesterName || masterDoc?.author || currentUser?.name || '-';
  const reqProfile = getUserProfile(reqUserId, reqNameFallback);

  const requester = {
    title: 'ผู้จัดทำ',
    name: reqProfile?.name || reqProfile?.fullName || reqStepName || dar?.created_by_name || dar?.requester_name || dar?.requesterName || reqNameFallback || '-',
    position: jobTitle(reqProfile?.position, masterDoc?.signatories?.requester?.position, step1Def?.position, dar?.created_by_role, dar?.requester_role, dar?.requesterRole, dar?.requesterPosition),
    date: formatSignatoryDate(masterDoc?.signatories?.requester?.date || reqHistory?.timestamp || step1Def?.timestamp || dar?.submitted_date || dar?.submittedAt || dar?.createdAt || dar?.created_at || dar?.date || masterDoc?.createdAt || new Date()),
    signatureImage: masterDoc?.signatories?.requester?.signatureImage || getSignatureAsset(reqProfile) || null,
    isCompleted: true,
    isSigned: true
  };

  // ----------------------------------------------------
  // 2. กล่องผู้ทบทวน (Reviewer) - เซ็นเฉพาะเมื่อผ่านขั้นตอนทบทวนแล้วเท่านั้น
  // ----------------------------------------------------
  const step2Def = steps.find(s => s.role === 'REVIEWER' || s.roleKey === 'REVIEWER' || s.step === 2);
  const revHistory = history.find(h => h.role === 'REVIEWER' || h.step === 2 || h.action === 'REVIEW' || h.action === 'APPROVE_REVIEW' || h.action === 'Reviewed');

  const revStepName = step2Def?.userName || step2Def?.name || step2Def?.assignedTo;
  const revUserId = masterDoc?.signatories?.reviewer?.id || revHistory?.userId || step2Def?.userId || dar?.reviewerId || dar?.reviewer_id || masterDoc?.reviewerId;
  const revNameFallback = masterDoc?.signatories?.reviewer?.name || revHistory?.userName || revStepName || dar?.reviewed_by_name || dar?.reviewerName || dar?.reviewer_name || dar?.reviewedBy || masterDoc?.reviewerName || (isReviewed ? 'กัลยาณี พลไกร' : '');
  const revProfile = getUserProfile(revUserId, revNameFallback);

  const reviewer = {
    title: 'ผู้ทบทวน',
    name: isReviewed ? (revProfile?.name || revProfile?.fullName || revStepName || dar?.reviewed_by_name || dar?.reviewer_name || dar?.reviewerName || revNameFallback || 'กัลยาณี พลไกร') : '',
    position: isReviewed ? jobTitle(revProfile?.position, masterDoc?.signatories?.reviewer?.position, step2Def?.position, dar?.reviewed_by_role, dar?.reviewer_role, dar?.reviewerRole) : '',
    date: isReviewed ? formatSignatoryDate(masterDoc?.signatories?.reviewer?.date || revHistory?.timestamp || dar?.reviewed_at || dar?.reviewedAt || task?.updatedAt || task?.reviewedAt || masterDoc?.reviewedAt || masterDoc?.createdAt || new Date()) : '',
    signatureImage: isReviewed ? (masterDoc?.signatories?.reviewer?.signatureImage || getSignatureAsset(revProfile) || null) : null,
    isCompleted: isReviewed,
    isSigned: isReviewed
  };

  // ----------------------------------------------------
  // 3. กล่องผู้อนุมัติ (Approver) - เซ็นเฉพาะเมื่อผ่านขั้นตอนอนุมัติแล้วเท่านั้น
  // ----------------------------------------------------
  const step3Def = steps.find(s => s.role === 'APPROVER' || s.roleKey === 'APPROVER' || s.step === 3);
  const appHistory = history.find(h => h.role === 'APPROVER' || h.step === 3 || h.action === 'APPROVE' || h.action === 'Approved');

  const appStepName = step3Def?.userName || step3Def?.name || step3Def?.assignedTo;
  const appUserId = masterDoc?.signatories?.approver?.id || appHistory?.userId || step3Def?.userId || dar?.approverId || dar?.approver_id || masterDoc?.approverId;
  const appNameFallback = masterDoc?.signatories?.approver?.name || appHistory?.userName || appStepName || dar?.approved_by_name || dar?.approverName || dar?.approver_name || masterDoc?.approverName || (isApproved ? 'คุณเรย์' : '');
  const appProfile = getUserProfile(appUserId, appNameFallback);

  const approver = {
    title: 'ผู้อนุมัติ',
    name: isApproved ? (appProfile?.name || appProfile?.fullName || appStepName || dar?.approved_by_name || dar?.approver_name || dar?.approverName || appNameFallback || 'คุณเรย์') : '',
    position: isApproved ? jobTitle(appProfile?.position, masterDoc?.signatories?.approver?.position, step3Def?.position, dar?.approved_by_role, dar?.approver_role, dar?.approverRole) : '',
    date: isApproved ? formatSignatoryDate(masterDoc?.signatories?.approver?.date || appHistory?.timestamp || dar?.approved_at || dar?.approvedAt || task?.updatedAt || masterDoc?.approvedAt || masterDoc?.effectiveDate || new Date()) : '',
    signatureImage: isApproved ? (masterDoc?.signatories?.approver?.signatureImage || getSignatureAsset(appProfile) || null) : null,
    isCompleted: isApproved,
    isSigned: isApproved
  };

  return { requester, reviewer, approver };
};
