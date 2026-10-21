/**
 * Document Access Control & Confidentiality Engine
 * 
 * Supports 4 Access Scopes:
 * - GENERAL: Open to all employees in the organization.
 * - DEPT_ONLY: Restricted strictly to the document owner department.
 * - TARGETED: Shared with specific authorized departments.
 * - RESTRICTED: Confidential to specific users or minimum position level.
 */

import { extractDeptCode } from '../services/darService';

export const ACCESS_SCOPES = {
  GENERAL: 'GENERAL',
  DEPT_ONLY: 'DEPT_ONLY',
  TARGETED: 'TARGETED',
  RESTRICTED: 'RESTRICTED'
};

export const ACCESS_SCOPE_METADATA = {
  GENERAL: {
    id: 'GENERAL',
    label: 'ทั่วไป (General)',
    description: 'เปิดให้พนักงานทุกคนในองค์กรเข้าถึงและค้นหาได้',
    icon: 'Globe',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    color: '#10B981'
  },
  DEPT_ONLY: {
    id: 'DEPT_ONLY',
    label: 'เฉพาะแผนกฉัน (Department Only)',
    description: 'ล็อกให้เห็นเฉพาะบุคลากรในแผนกเจ้าของเอกสารเท่านั้น',
    icon: 'Lock',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    color: '#F59E0B'
  },
  TARGETED: {
    id: 'TARGETED',
    label: 'เฉพาะบางแผนก (Targeted Departments)',
    description: 'อนุญาตให้เฉพาะกลุ่มแผนกที่ระบุเปิดดูร่วมกันได้',
    icon: 'Building2',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    color: '#0D99FF'
  },
  RESTRICTED: {
    id: 'RESTRICTED',
    label: 'ลับเฉพาะบุคคล/ตำแหน่ง (Restricted)',
    description: 'จำกัดสิทธิ์เฉพาะบุคคลที่ระบุ หรือตำแหน่งตามระดับขั้นต่ำ',
    icon: 'ShieldAlert',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    color: '#EF4444'
  }
};

/**
 * Check if the given user has permission to view the document
 * 
 * @param {Object} doc - Document or DAR object
 * @param {Object} user - Current active user
 * @returns {boolean} True if accessible, false if hidden/forbidden
 */
export const hasDocumentAccess = (doc, user) => {
  if (!doc) return false;
  if (!user) return false;

  // Helper to match user ID or Employee ID safely
  const userMatchesId = (targetId) => {
    if (!targetId) return false;
    const targetStr = String(targetId).trim().toLowerCase();
    const userIdStr = user.id ? String(user.id).trim().toLowerCase() : '';
    const userEmpIdStr = user.empId ? String(user.empId).trim().toLowerCase() : '';
    return targetStr === userIdStr || (userEmpIdStr && targetStr === userEmpIdStr);
  };

  // 1. Super/DCC Admin Bypass (Always has full access)
  if (
    user.role === 'DCC_ADMIN' ||
    user.role === 'SUPER_ADMIN' ||
    user.isDcc ||
    user.isSuperAdmin ||
    (user.permissions && (user.permissions.includes('DCC_ADMIN') || user.permissions.includes('ADMIN')))
  ) {
    return true;
  }

  // 2. Auto-Whitelisting for Workflow Participants (Immune to Restricted Scope settings):
  // 2.1 Requester / Document Creator / Owner / Author
  const requesterIds = [
    doc.created_by,
    doc.createdBy,
    doc.requester_id,
    doc.requesterId,
    doc.ownerId,
    doc.owner_id,
    doc.author_id,
    doc.authorId,
    doc.requester?.id,
    doc.requester?.empId
  ].filter(Boolean);

  if (requesterIds.some(userMatchesId)) {
    return true;
  }

  // 2.2 Reviewer(s) in Workflow (Individual or Steps)
  const reviewerIds = [];
  if (doc.reviewerId) reviewerIds.push(doc.reviewerId);
  if (doc.reviewer_id) reviewerIds.push(doc.reviewer_id);
  if (doc.reviewer?.id) reviewerIds.push(doc.reviewer.id);
  if (doc.reviewer?.empId) reviewerIds.push(doc.reviewer.empId);
  if (Array.isArray(doc.reviewers)) {
    doc.reviewers.forEach(r => reviewerIds.push(typeof r === 'object' ? r?.id || r?.userId || r?.empId : r));
  }
  if (Array.isArray(doc.workflow?.review_steps)) {
    doc.workflow.review_steps.forEach(s => reviewerIds.push(typeof s === 'object' ? s?.id || s?.userId || s?.assigneeId || s?.empId : s));
  }
  if (Array.isArray(doc.workflow?.reviewers)) {
    doc.workflow.reviewers.forEach(r => reviewerIds.push(typeof r === 'object' ? r?.id || r?.userId || r?.empId : r));
  }

  if (reviewerIds.filter(Boolean).some(userMatchesId)) {
    return true;
  }

  // 2.3 Approver(s) in Workflow (Individual or Steps)
  const approverIds = [];
  if (doc.approverId) approverIds.push(doc.approverId);
  if (doc.approver_id) approverIds.push(doc.approver_id);
  if (doc.approver?.id) approverIds.push(doc.approver.id);
  if (doc.approver?.empId) approverIds.push(doc.approver.empId);
  if (Array.isArray(doc.approvers)) {
    doc.approvers.forEach(a => approverIds.push(typeof a === 'object' ? a?.id || a?.userId || a?.empId : a));
  }
  if (Array.isArray(doc.workflow?.approve_steps)) {
    doc.workflow.approve_steps.forEach(s => approverIds.push(typeof s === 'object' ? s?.id || s?.userId || s?.assigneeId || s?.empId : s));
  }
  if (Array.isArray(doc.workflow?.approvers)) {
    doc.workflow.approvers.forEach(a => approverIds.push(typeof a === 'object' ? a?.id || a?.userId || a?.empId : a));
  }

  if (approverIds.filter(Boolean).some(userMatchesId)) {
    return true;
  }

  const rawUserDepts = [
    user.primary_department,
    user.department,
    user.dept,
    user.dept_code,
    ...(Array.isArray(user.departments) ? user.departments : []),
    ...(Array.isArray(user.secondaryDepartments) ? user.secondaryDepartments : []),
    ...(Array.isArray(user.affiliated_departments) ? user.affiliated_departments : []),
    ...(Array.isArray(user.depts) ? user.depts : [])
  ];
  const userDepts = Array.from(new Set(rawUserDepts.map(d => (typeof d === 'object' ? (d.id || d.code || d.dept || d.department) : d)?.toString().trim().toUpperCase()).filter(Boolean)));
  const docDept = (
    doc.owner_dept ||
    doc.department ||
    doc.dept ||
    extractDeptCode(doc.code || doc.doc_code || doc.document_code || doc.docNo || doc.title) ||
    ''
  ).toString().trim().toUpperCase();
  const isSameDept = (dept) => {
    if (!dept) return false;
    const cleanDept = String(dept).trim().toUpperCase();
    return userDepts.some(
      (u) =>
        u === cleanDept ||
        ((u === 'QA/QC' || u === 'QAQC' || u === 'QC') && (cleanDept === 'QA/QC' || cleanDept === 'QAQC' || cleanDept === 'QC'))
    );
  };

  // 3. Resolve Scope
  const accessControl = doc.access_control || { scope: doc.access_scope || 'GENERAL' };
  const scope = accessControl.scope || 'GENERAL';

  switch (scope) {
    case 'GENERAL':
      return true;

    case 'DEPT_ONLY':
      return isSameDept(docDept);

    case 'TARGETED': {
      const authDepts = accessControl.authorized_depts || [];
      const targetDepts = doc.target_depts || [];
      const distDepts = (doc.distributions || []).map((d) => d.departmentId || d.dept);

      return (
        isSameDept(docDept) ||
        authDepts.some((d) => isSameDept(d)) ||
        targetDepts.some((d) => isSameDept(d)) ||
        distDepts.some((d) => isSameDept(d))
      );
    }

    case 'RESTRICTED': {
      const authUsers = accessControl.authorized_users || [];
      const minLevel = Number(accessControl.min_access_level) || 0;
      const userLevel = Number(user.level) || 0;

      const isNamedUser = authUsers.includes(user.id);
      // WHITELIST mode = named individuals only; the stored min level must not widen access
      const isLevelQualified = accessControl.restricted_mode !== 'WHITELIST' && minLevel > 0 && userLevel >= minLevel;

      return isNamedUser || isLevelQualified;
    }

    default:
      return true;
  }
};

/**
 * Check if the current user has permission to manage (e.g. report damaged/lost/request replacement) a specific controlled copy.
 * 
 * Rules:
 * 1. DCC Admin / Super Admin can manage all copies across all departments.
 */
export { canManageControlledCopy } from './rbac';

/**
 * Alias for hasDocumentAccess to support canUserAccessDocument naming convention
 */
export const canUserAccessDocument = hasDocumentAccess;

