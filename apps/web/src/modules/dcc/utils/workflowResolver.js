/**
 * workflowResolver.js
 *
 * Multi-Stage Linear Approval Pipeline & Candidate Eligibility Resolver
 * Enforces ISO 9001 / FSSC 22000 Segregation of Duties (SoD / 4-Eyes Principle)
 * and Minimum Level Thresholds (L...+ Thresholds).
 *
 * Department Alignment Rule (ISO 9001 SoD):
 * - Reviewer and Approver must belong to the same department as the document (via
 *   primary_department or affiliated_departments) OR be part of cross-organizational
 *   authority departments (MGMT, EXEC, QMR) that have governance over all documents.
 * - Personnel from unrelated operational departments (e.g., Engineering approving QA
 *   documents) are strictly prohibited from entering the approval chain.
 *
 * Phase 2 Refactor: approval matrix & cross-org dept codes are now sourced
 * exclusively from QMS_CONFIG registry (modules/dcc/config/qmsRegistry.js).
 * The local DEFAULT_APPROVAL_MATRIX constant has been removed to prevent drift.
 */

import {
  CROSS_ORG_DEPTS as _REGISTRY_CROSS_ORG_DEPTS,
  getApprovalThresholdsFromRegistry,
} from '../config/qmsRegistry';

/**
 * Departments with cross-organizational authority — sourced from registry.
 * Re-exported for backward compatibility with consumers that import from here.
 */
export const CROSS_ORG_DEPTS = _REGISTRY_CROSS_ORG_DEPTS;

/**
 * Resolve approval level thresholds for a given document type.
 * Accepts an optional local approvalMatrix override (e.g. from admin config);
 * falls back to the QMS_CONFIG registry matrix.
 *
 * @param {string} docType
 * @param {Array|null} approvalMatrix  - optional override matrix
 * @returns {{ minRequesterLevel: number, minReviewerLevel: number, minApproverLevel: number }}
 */
export const getApprovalThresholds = (docType, approvalMatrix) => {
  // If an explicit override matrix is provided, use it; otherwise use registry.
  if (approvalMatrix && approvalMatrix.length > 0) {
    const normDocType = String(docType || '').toUpperCase().trim();
    const entry = approvalMatrix.find(
      (m) => String(m.docType || m.doc_type || '').toUpperCase().trim() === normDocType
    );
    return {
      minRequesterLevel: entry?.minRequesterLevel ?? entry?.min_requester_level ?? 1,
      minReviewerLevel: entry?.requiredReviewerLevel ?? entry?.required_reviewer_level ?? 4,
      minApproverLevel: entry?.requiredApproverLevel ?? entry?.required_approver_level ?? 5,
    };
  }
  // Default: delegate to registry helper (single source of truth)
  return getApprovalThresholdsFromRegistry(docType);
};

/**
 * Creates a route result object that behaves as an object with { id, level, dept }
 * while safely coercing to id string when used in comparisons or string contexts.
 */
const createRouteResult = (user, level, dept) => {
  return {
    id: user.id,
    level,
    dept,
    name: user.name || user.fullName || '',
    toString() { return this.id; },
    valueOf() { return this.id; }
  };
};

/**
 * Checks if a user has cross-organizational authority, meaning they can
 * participate in the approval chain of ANY department's documents.
 * This applies to MGMT, EXEC, and QMR roles.
 */
const isCrossOrgAuthority = (user) => {
  if (!user) return false;
  if (user.isQmr || user.department === 'MGMT' || user.role === 'QMR' || user.level >= 6) return true;
  
  const userDepts = [
    user.department, user.dept, user.primaryDepartment, user.primary_department,
    ...(Array.isArray(user.secondaryDepartments) ? user.secondaryDepartments : []),
    ...(Array.isArray(user.departments) ? user.departments : []),
    ...(Array.isArray(user.affiliated_departments) ? user.affiliated_departments : []),
    ...(Array.isArray(user.depts) ? user.depts : [])
  ].filter(Boolean);

  return CROSS_ORG_DEPTS.some(d => userDepts.includes(d));
};

export const isUserInDepartment = (user, department) => {
  if (!user || !department) return false;

  if (Array.isArray(user.managedDepartments)) {
    if (user.managedDepartments.includes('*') || user.managedDepartments.includes(department)) return true;
  }

  // 1. Primary department
  if (user.department === department || user.dept === department || user.primaryDepartment === department || user.primary_department === department) {
    return true;
  }

  // 2. Secondary / array departments
  if (Array.isArray(user.secondaryDepartments) && user.secondaryDepartments.includes(department)) return true;
  if (Array.isArray(user.departments) && user.departments.includes(department)) return true;
  if (Array.isArray(user.affiliated_departments) && user.affiliated_departments.includes(department)) return true;
  if (Array.isArray(user.depts) && user.depts.includes(department)) return true;

  // 3. Central admin roles that have access to all
  if (user.department === 'MGMT' || user.role === 'QMR' || user.level >= 6) {
    return true;
  }

  return false;
};

// Keep old alias for backward compatibility
const isAffiliatedWithDept = isUserInDepartment;

/**
 * Resolves the appropriate Reviewer based on Document Type minimum threshold (L4+)
 * and Segregation of Duties (Reviewer !== Requester).
 * 
 * Pipeline rules:
 * 1. Filter candidates where candidate.id !== requesterId and candidate.level >= minReviewerLevel.
 * 2. Exclude DCC Admin unless department is DC.
 * 3. Department scope: candidates must either be affiliated with the document's department
 *    OR belong to a cross-organizational authority (MGMT, EXEC, QMR).
 * 4. Search within same-department candidates first. If multiple candidates exist, prioritize
 *    candidates with level >= requester.level, then pick nearest level (ascending).
 * 5. If no eligible same-dept candidate, escalate ONLY to cross-org authority (MGMT/QMR/EXEC).
 * 6. Emergency fallback (last resort): any eligible user company-wide.
 */
export const resolveReviewer = (
  requesterId, 
  department, 
  masterUsers = [], 
  reviewUsers = [], 
  docType = null, 
  approvalMatrix = null
) => {
  const masters = masterUsers || [];
  const requester = masters.find(u => u && u.id === requesterId);
  const reqLevel = requester ? (requester.approval_level || requester.level || 0) : 0;
  const { minReviewerLevel } = getApprovalThresholds(docType, approvalMatrix);

  const pool = (reviewUsers && reviewUsers.length > 0) ? reviewUsers : masters;

  // Base eligibility: level threshold + SoD + DCC exclusion
  const isBaseEligible = (u) => {
    if (!u || !u.id) return false;
    if (u.id === requesterId) return false; // SoD: cannot review own request
    const m = masters.find(mu => mu && mu.id === u.id) || u;
    if ((m.isDcc || m.role === 'DCC_ADMIN') && department !== 'DC') return false; // DCC exclusion
    const candidateLevel = m.approval_level || m.level || 0;
    return candidateLevel >= minReviewerLevel; // Minimum candidate eligibility threshold
  };

  const eligibleCandidates = pool.filter(isBaseEligible);

  // --- Strict Department Alignment (ISO 9001 SoD) ---
  // Priority 1: Same-department candidates (primary or affiliated)
  const deptCandidates = eligibleCandidates.filter(u => {
    const m = masters.find(mu => mu && mu.id === u.id) || u;
    return isAffiliatedWithDept(m, department);
  });

  // Priority 2: Cross-org authority candidates (MGMT/EXEC/QMR) when dept has no eligible candidates
  const crossOrgCandidates = eligibleCandidates.filter(u => {
    const m = masters.find(mu => mu && mu.id === u.id) || u;
    return isCrossOrgAuthority(m);
  });

  // Determine candidate pool: dept-first, then cross-org, then emergency fallback
  let candidatesToConsider;
  if (deptCandidates.length > 0) {
    candidatesToConsider = deptCandidates;
  } else if (crossOrgCandidates.length > 0) {
    // No same-dept candidate found — escalate to cross-org authority only
    candidatesToConsider = crossOrgCandidates;
  } else {
    // Emergency fallback escalation: find any management/QMR authority
    const fallback = masters.find(m => 
      m && 
      m.id !== requesterId && 
      (!m.isDcc || department === 'DC') && 
      ((m.approval_level || m.level || 0) >= minReviewerLevel || m.isQmr || m.role === 'DEPT_ADMIN')
    );
    if (fallback) {
      const fLevel = fallback.approval_level || fallback.level || minReviewerLevel;
      const fDept = fallback.primary_department || fallback.department || department;
      return createRouteResult(fallback, fLevel, fDept);
    }
    return null;
  }

  // Sort ascending: prefer level >= reqLevel, then nearest level
  candidatesToConsider.sort((a, b) => {
    const mA = masters.find(mu => mu && mu.id === a.id) || a;
    const mB = masters.find(mu => mu && mu.id === b.id) || b;
    const lA = mA.approval_level || mA.level || 0;
    const lB = mB.approval_level || mB.level || 0;

    const aGeReq = lA >= reqLevel ? 1 : 0;
    const bGeReq = lB >= reqLevel ? 1 : 0;
    if (aGeReq !== bGeReq) return bGeReq - aGeReq;

    return lA - lB;
  });

  const selected = candidatesToConsider[0];
  const sMaster = masters.find(mu => mu && mu.id === selected.id) || selected;
  const sLevel = sMaster.approval_level || sMaster.level || minReviewerLevel;
  const sDept = sMaster.primary_department || sMaster.department || department;

  return createRouteResult(selected, sLevel, sDept);
};

/**
 * Resolves the appropriate Approver based on Document Type minimum threshold (L5+ / L6+ / L8+)
 * and Segregation of Duties (Approver !== Requester && Approver !== Reviewer).
 * 
 * Pipeline rules:
 * 1. Filter candidates where candidate.id !== requesterId AND candidate.id !== reviewerId.
 * 2. Candidate level must satisfy candidate.level >= minApproverLevel.
 * 3. Exclude DCC Admin unless department is DC.
 * 4. Department scope: candidates must either be affiliated with the document's department
 *    OR belong to a cross-organizational authority (MGMT, EXEC, QMR).
 * 5. Search within same-department candidates first. If an eligible candidate with
 *    level >= reviewerLevel exists in department, select them.
 * 6. If no suitable same-dept candidate, escalate ONLY to cross-org authority (MGMT/QMR/EXEC).
 * 7. Emergency fallback (last resort): any eligible management authority company-wide.
 */
export const resolveApprover = (
  requesterId, 
  reviewerId, 
  department, 
  masterUsers = [], 
  approveUsers = [], 
  docType = null, 
  approvalMatrix = null
) => {
  const masters = masterUsers || [];
  const reviewer = masters.find(u => u && u.id === reviewerId);
  const revLevel = reviewer ? (reviewer.approval_level || reviewer.level || 0) : 0;
  const { minApproverLevel } = getApprovalThresholds(docType, approvalMatrix);

  const pool = (approveUsers && approveUsers.length > 0) ? approveUsers : masters;

  // Base eligibility: level threshold + SoD + DCC exclusion
  const isBaseEligible = (u) => {
    if (!u || !u.id) return false;
    if (u.id === requesterId) return false; // SoD: cannot approve own request
    if (u.id === reviewerId) return false;  // 4-Eyes: cannot approve own review
    const m = masters.find(mu => mu && mu.id === u.id) || u;
    if ((m.isDcc || m.role === 'DCC_ADMIN') && department !== 'DC') return false; // DCC exclusion
    const candidateLevel = m.approval_level || m.level || 0;
    return candidateLevel >= minApproverLevel; // Minimum candidate eligibility threshold
  };

  const eligibleCandidates = pool.filter(isBaseEligible);

  // --- Strict Department Alignment (ISO 9001 SoD) ---
  // Priority 1: Same-department candidates (primary or affiliated)
  const deptCandidates = eligibleCandidates.filter(u => {
    const m = masters.find(mu => mu && mu.id === u.id) || u;
    return isAffiliatedWithDept(m, department);
  });

  // Check if any dept candidate has level >= reviewer's level (required for upward authority)
  const deptHasHigherOrEqual = deptCandidates.some(u => {
    const m = masters.find(mu => mu && mu.id === u.id) || u;
    return (m.approval_level || m.level || 0) >= revLevel;
  });

  // Priority 2: Cross-org authority candidates (MGMT/EXEC/QMR)
  const crossOrgCandidates = eligibleCandidates.filter(u => {
    const m = masters.find(mu => mu && mu.id === u.id) || u;
    return isCrossOrgAuthority(m);
  });

  // Determine candidate pool:
  // - Use dept candidates if they have someone with >= reviewer's level
  // - Otherwise, escalate to cross-org authority (NOT to all company dept heads)
  // - Emergency fallback as last resort
  let candidatesToConsider;
  if (deptCandidates.length > 0 && deptHasHigherOrEqual) {
    candidatesToConsider = deptCandidates;
  } else if (crossOrgCandidates.length > 0) {
    // Escalate to cross-org authority only (prevents ชัยวัฒน์ EN from approving QA docs)
    candidatesToConsider = crossOrgCandidates;
  } else if (deptCandidates.length > 0) {
    // Use dept candidates even if none exceed reviewer level (better than cross-dept)
    candidatesToConsider = deptCandidates;
  } else {
    // Emergency escalation: find any management authority not requester and not reviewer
    const fallback = masters.find(m => 
      m && 
      m.id !== requesterId && 
      m.id !== reviewerId && 
      (!m.isDcc || department === 'DC') && 
      ((m.approval_level || m.level || 0) >= minApproverLevel || m.isQmr || m.role === 'DEPT_ADMIN')
    );
    if (fallback) {
      const fLevel = fallback.approval_level || fallback.level || minApproverLevel;
      const fDept = fallback.primary_department || fallback.department || department;
      return createRouteResult(fallback, fLevel, fDept);
    }
    return null;
  }

  // Sort: prefer candidates with level >= revLevel, then nearest level (ascending)
  // Also prefer QMR / Executive role when level is equal
  candidatesToConsider.sort((a, b) => {
    const mA = masters.find(mu => mu && mu.id === a.id) || a;
    const mB = masters.find(mu => mu && mu.id === b.id) || b;
    const lA = mA.approval_level || mA.level || 0;
    const lB = mB.approval_level || mB.level || 0;

    const aGeRev = lA >= revLevel ? 1 : 0;
    const bGeRev = lB >= revLevel ? 1 : 0;
    if (aGeRev !== bGeRev) return bGeRev - aGeRev;

    // Prefer QMR / Executive role when level is equal
    const aExec = (mA.isQmr || mA.role === 'DEPT_ADMIN' || (mA.position || '').includes('Manager') || (mA.position || '').includes('Director')) ? 1 : 0;
    const bExec = (mB.isQmr || mB.role === 'DEPT_ADMIN' || (mB.position || '').includes('Manager') || (mB.position || '').includes('Director')) ? 1 : 0;
    if (aExec !== bExec) return bExec - aExec;

    return lA - lB;
  });

  const selected = candidatesToConsider[0];
  const sMaster = masters.find(mu => mu && mu.id === selected.id) || selected;
  const sLevel = sMaster.approval_level || sMaster.level || minApproverLevel;
  const sDept = sMaster.primary_department || sMaster.department || department;

  return createRouteResult(selected, sLevel, sDept);
};
