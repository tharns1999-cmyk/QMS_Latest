import { normalizeCanonicalDept } from './taskFilter';

const REASON_MAP = {
  'PROCESS_IMPROVEMENT': 'ปรับปรุงกระบวนการทำงานให้ดีขึ้น',
  'AUDIT_FINDING': 'แก้ไข/ยกเลิกตามข้อเสนอแนะจากการตรวจติดตาม (Audit Finding)',
  'MANAGEMENT_REVIEW': 'ทบทวนโดยฝ่ายบริหาร (Management Review)',
  'PROCESS_CHANGE': 'ปรับปรุงกระบวนการและควบรวมกับเอกสารอื่น',
  'PROCESS_REMOVED': 'ยกเลิกกระบวนการทำงานดังกล่าวแล้ว',
  'DUPLICATED': 'เอกสารซ้ำซ้อน',
  'OTHER': 'อื่นๆ'
};

export const getDarReason = (dar) => {
  if (!dar) return { title: 'เหตุผลในการร้องขอ', value: '-' };
  
  const mapReason = (val) => REASON_MAP[val] || val;

  if (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') {
    return {
      title: 'เหตุผลในการร้องขอ',
      value: dar.requestReason || dar.reason || dar.changeReason || '-'
    };
  } else if (dar.type === 'REVISION') {
    return {
      title: 'เหตุผลในการแก้ไข',
      value: dar.changeReason === 'OTHER' ? dar.otherReason : (mapReason(dar.changeReason) || dar.reason || dar.requestReason || '-')
    };
  } else if (dar.type === 'OBSOLETE') {
    return {
      title: 'เหตุผลในการยกเลิก',
      value: dar.obsoleteReason === 'OTHER' ? dar.otherReason : (mapReason(dar.obsoleteReason) || dar.reason || dar.obsolete_reason || '-')
    };
  }
  
  return { title: 'เหตุผลในการร้องขอ', value: dar.reason || dar.requestReason || dar.changeReason || '-' };
};

export const getDarDetail = (dar) => {
  if (!dar) return { title: 'รายละเอียดเพิ่มเติม', value: '-' };
  
  if (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') {
    return {
      title: 'รายละเอียดเพิ่มเติม',
      value: dar.requestDetail || dar.detail || dar.request_detail || '-'
    };
  } else if (dar.type === 'REVISION') {
    return {
      title: 'สรุปการเปลี่ยนแปลง',
      value: dar.changeSummary || dar.change_summary || dar.detail || dar.request_detail || '-'
    };
  } else if (dar.type === 'OBSOLETE') {
    return {
      title: 'รายละเอียดเพิ่มเติม/แผนรองรับ',
      value: dar.obsoleteDetail || dar.obsolete_detail || dar.recallPlan || dar.detail || '-'
    };
  }
  
  return { title: 'รายละเอียดเพิ่มเติม', value: dar.detail || dar.changeSummary || dar.change_summary || '-' };
};

export const getDarDocInfo = (dar, documents) => {
  if (!dar) return { docCode: '-', docType: '-', docRev: '-' };
  
  if (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') {
    return {
      docCode: dar.docIdInput || '-',
      docType: dar.docType || '-',
      docRev: dar.docRev || '00'
    };
  } else if (dar.type === 'REVISION' || dar.type === 'OBSOLETE') {
    const refDoc = documents?.find(d => 
      (dar.docIdRef && d.id === dar.docIdRef) ||
      (dar.targetDocumentId && d.id === dar.targetDocumentId) ||
      (dar.doc_id && d.id === dar.doc_id) ||
      (dar.docId && d.id === dar.docId) ||
      (dar.document_code && (d.code === dar.document_code || d.title === dar.document_code || d.document_code === dar.document_code))
    );
    if (refDoc) {
      const docType = refDoc.docType || refDoc.type || (refDoc.title ? refDoc.title.split('-')[0] : '-');
      return {
        docCode: refDoc.title || refDoc.code || refDoc.document_code || '-',
        docType: docType,
        docRev: refDoc.rev || refDoc.revision || '-'
      };
    }
    const fallbackCode = dar.document_code || dar.doc_code || dar.docCode || dar.docIdInput || '-';
    return {
      docCode: fallbackCode,
      docType: dar.docType || (fallbackCode !== '-' ? fallbackCode.split('-')[0] : '-'),
      docRev: dar.docRev || dar.rev || dar.revision || '-'
    };
  }
  
  return { docCode: '-', docType: '-', docRev: '-' };
};

/**
 * Standardizes DAR Document Code & Title Display (2-line layout)
 * Strips [OBSOLETE], [REVISION], [NEW], or [ยกเลิก] tags.
 * 
 * Line 1: docCode (e.g. SOP-QC-01)
 * Line 2: docTitle (e.g. ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง)
 * 
 * @param {Object} dar - DAR request object
 * @param {Array} documents - Documents collection from store
 * @returns {{ docCode: string, docTitle: string }}
 */
export const formatDarDocumentDisplay = (dar, documents = []) => {
  if (!dar) return { docCode: '-', docTitle: '-' };

  let rawCode = dar.document_code || dar.doc_code || dar.docCode || dar.docIdInput || dar.docNo || dar.code || '';
  let rawTitle = dar.document_title || dar.name || dar.title || '';

  // Clean tags like [OBSOLETE], [REVISION], [NEW], [ยกเลิก]
  let cleanCode = String(rawCode || '').replace(/^\[(OBSOLETE|REVISION|NEW|ยกเลิก)\]\s*/i, '').trim();
  let cleanTitle = String(rawTitle || '').replace(/^\[(OBSOLETE|REVISION|NEW|ยกเลิก)\]\s*/i, '').trim();

  // If code is empty but cleanTitle looks like an alphanumeric document code (e.g. SOP-QC-01)
  if (!cleanCode && /^[A-Z]{2,4}-[A-Z0-9]+(-[A-Z0-9]+)?$/i.test(cleanTitle)) {
    cleanCode = cleanTitle;
  }

  let docCode = cleanCode || '-';
  let docTitle = cleanTitle || '-';

  // Cross-reference with documents library to enrich title or code
  if (Array.isArray(documents) && documents.length > 0) {
    const matched = documents.find(d => 
      (dar.targetDocumentId && String(d.id) === String(dar.targetDocumentId)) ||
      (dar.docIdRef && String(d.id) === String(dar.docIdRef)) ||
      (dar.doc_id && String(d.id) === String(dar.doc_id)) ||
      (dar.docId && String(d.id) === String(dar.docId)) ||
      (docCode !== '-' && (
        d.code === docCode || 
        d.document_code === docCode || 
        d.doc_code === docCode || 
        d.title === docCode
      ))
    );
    if (matched) {
      if (docCode === '-' && (matched.code || matched.document_code || matched.doc_code || matched.title)) {
        docCode = matched.code || matched.document_code || matched.doc_code || matched.title;
      }
      if ((docTitle === '-' || docTitle === docCode) && (matched.name || matched.document_title || matched.docName)) {
        docTitle = matched.name || matched.document_title || matched.docName;
      }
    }
  }

  return { docCode, docTitle };
};

/**
 * Unified DAR status badge metadata for consistent localization & styling.
 * 
 * @param {string} status - Workflow status string
 * @returns {{ label: string, className: string }}
 */
export const getDarStatusBadgeMeta = (status) => {
  const normStatus = String(status || '').trim().toUpperCase();
  switch (normStatus) {
    case 'DRAFT':
    case 'ฉบับร่าง':
      return { label: 'ฉบับร่าง', className: 'badge-draft' };
    case 'UNDER_REVIEW':
    case 'PENDING_REVIEW':
    case 'WAITING_DCC_REVIEW':
    case 'WAITING_REVIEW':
    case 'รอการทบทวน':
      return { label: 'รอการทบทวน', className: 'badge-pending' };
    case 'PENDING_APPROVAL':
    case 'UNDER_APPROVAL':
    case 'รอการอนุมัติ':
      return { label: 'รอการอนุมัติ', className: 'badge-pending' };
    case 'APPROVED':
    case 'อนุมัติแล้ว':
      return { label: 'อนุมัติแล้ว', className: 'badge-active' };
    case 'APPROVED_WAITING_EFFECTIVE':
    case 'WAITING_EFFECTIVE':
    case 'รอประกาศใช้':
      return { label: 'รอประกาศใช้', className: 'badge-pending' };
    case 'EFFECTIVE':
    case 'มีผลบังคับใช้':
      return { label: 'มีผลบังคับใช้', className: 'badge-active' };
    case 'COMPLETED':
    case 'เสร็จสมบูรณ์':
      return { label: 'เสร็จสมบูรณ์', className: 'badge-active' };
    case 'CANCELLED':
    case 'ยกเลิก':
      return { label: 'ยกเลิก', className: 'badge-rejected' };
    case 'CANCELLED_OVERDUE':
    case 'ยกเลิก (เกินกำหนด)':
      return { label: 'ยกเลิก (เกินกำหนด)', className: 'badge-rejected' };
    case 'REJECTED':
    case 'ไม่อนุมัติ':
      return { label: 'ไม่อนุมัติ', className: 'badge-rejected' };
    case 'RETURNED_FOR_REVISION':
    case 'ส่งกลับแก้ไข':
      return { label: 'ส่งกลับแก้ไข', className: 'badge-rejected' };
    case 'OBSOLETE':
    case 'ยกเลิก / ตกรุ่น':
      return { label: 'ยกเลิก / ตกรุ่น', className: 'badge-draft' };
    default:
      return { label: status ? String(status).replace(/_/g, ' ') : '-', className: 'badge-active' };
  }
};

export const getRequesterName = (dar, masterUsers) => {
  if (!dar) return '-';
  const u = masterUsers?.find(u => u.id === dar.requesterId);
  return u ? u.name : (dar.requester || '-');
};

export const getReviewerName = (dar, timeline) => {
  if (!dar || !timeline) return '-';
  const tl = timeline.slice().reverse().find(t => t.darId === dar.id && (t.action === 'Reviewed' || t.action === 'Review'));
  return tl ? tl.user : (dar.reviewer || '-');
};

export const getApproverName = (dar, timeline) => {
  if (!dar || !timeline) return '-';
  const tl = timeline.slice().reverse().find(t => t.darId === dar.id && (t.action === 'Approved' || t.action === 'Approve'));
  return tl ? tl.user : (dar.approver || '-');
};

export const getAckNames = (dar, timeline) => {
  if (!dar || !timeline) return '-';
  const acks = timeline.filter(t => t.darId === dar.id && (t.action === 'Acknowledged' || t.action === 'Ack'));
  if (acks.length > 0) {
    return [...new Set(acks.map(a => a.user))].join(', ');
  }
  return '-';
};

/**
 * Universal Draft check
 * Returns true if the DAR is a draft (unsubmitted)
 */
export const isDarDraft = (dar) => {
  if (!dar) return false;
  const statusStr = String(dar.status || '').trim().toUpperCase();
  return Boolean(
    dar.isDraft || 
    statusStr === 'DRAFT' || 
    dar.status === 'ฉบับร่าง' ||
    String(dar.id || '').startsWith('draft_') ||
    String(dar.darNumber || dar.dar_no || dar.darNo || '').startsWith('draft_')
  );
};

/**
 * Checks if currentUser is the creator / requester of the DAR
 */
export const isDarRequester = (dar, currentUser) => {
  if (!dar || !currentUser) return false;
  const userIds = [currentUser.id, currentUser.empId, currentUser.userId].filter(Boolean).map(String);
  const userNames = [currentUser.name, currentUser.fullName].filter(Boolean).map(n => n.trim().toLowerCase());

  const darRequesterIds = [
    dar.requesterId, 
    dar.requester_id, 
    dar.createdBy, 
    dar.created_by,
    dar.userId,
    dar.user_id
  ].filter(Boolean).map(String);
  if (darRequesterIds.some(id => userIds.includes(id))) return true;

  const darNames = [
    dar.requester,
    dar.requesterName,
    dar.requester_name,
    dar.createdByName,
    dar.created_by_name,
    dar.userName,
    dar.user_name
  ].filter(Boolean).map(n => typeof n === 'string' ? n.trim().toLowerCase() : '');
  if (darNames.some(name => userNames.includes(name) || userIds.some(id => id.toLowerCase() === name))) return true;

  if (dar.requester && typeof dar.requester === 'string') {
    const rLower = dar.requester.trim().toLowerCase();
    if (userIds.some(id => id.toLowerCase() === rLower) || userNames.includes(rLower)) return true;
  }

  return false;
};

/**
 * Universal Draft Privacy Guard:
 * Drafts can ONLY be viewed by their creator/requester, regardless of user role.
 */
export const canViewDar = (dar, currentUser) => {
  if (!dar || !currentUser) return false;
  if (isDarDraft(dar)) {
    return isDarRequester(dar, currentUser);
  }
  return true;
};

export const normalizeDept = normalizeCanonicalDept;

/**
 * Standardize Department Codes (e.g. QA, QA/QC, QAQC -> QA/QC)
 */
export const normalizeDeptCode = (d) => {
  if (!d) return '';
  const val = typeof d === 'object' ? (d.id || d.code || d.dept || d.department || d.dept_code) : d;
  if (typeof val !== 'string') return '';
  const clean = val.trim().toUpperCase();
  if (clean === 'QA' || clean === 'QA/QC' || clean === 'QAQC' || clean === 'QC') {
    return 'QA/QC';
  }
  return clean;
};

export const deptMatches = (d1, d2) => {
  const s1 = normalizeDeptCode(d1);
  const s2 = normalizeDeptCode(d2);
  if (!s1 || !s2) return false;
  return s1 === s2;
};

/**
 * Check if the user is authorized to create/revise documents for the given department.
 * Supports DCC/QMR/EXEC/MGMT wildcards and multi-department scoping (affiliated_departments).
 */
export const isUserAuthorizedForDocDept = (docDeptRaw, currentUser) => {
  if (!currentUser) return false;

  const cleanUserDept = normalizeDeptCode(currentUser.department);
  const cleanUserPrimaryDept = normalizeDeptCode(currentUser.primary_department);

  // Wildcard roles: DCC Admin, QMR, Executive / Management, DC
  const isWildcard = 
    Boolean(currentUser.isDcc) || 
    Boolean(currentUser.isQmr) || 
    Boolean(currentUser.isSuperAdmin) ||
    currentUser.role === 'DCC_ADMIN' || 
    currentUser.role === 'SUPER_ADMIN' ||
    currentUser.role === 'QMR' ||
    currentUser.role === 'EXEC' ||
    currentUser.role === 'MGMT' ||
    ['DC', 'DCC', 'QMR', 'EXEC', 'MGMT'].includes(cleanUserDept) ||
    ['DC', 'DCC', 'QMR', 'EXEC', 'MGMT'].includes(cleanUserPrimaryDept);

  if (isWildcard) return true;

  const docDept = normalizeDeptCode(docDeptRaw);
  if (!docDept) return false;

  const userDepts = [
    currentUser.department,
    currentUser.dept,
    currentUser.primary_department,
    currentUser.dept_code,
    ...(Array.isArray(currentUser.departments) ? currentUser.departments : []),
    ...(Array.isArray(currentUser.secondaryDepartments) ? currentUser.secondaryDepartments : []),
    ...(Array.isArray(currentUser.affiliated_departments) ? currentUser.affiliated_departments : []),
    ...(Array.isArray(currentUser.depts) ? currentUser.depts : [])
  ].map(normalizeDeptCode).filter(Boolean);

  return userDepts.includes(docDept);
};

export { IN_FLIGHT_DAR_STATUSES, TERMINAL_DAR_STATUSES, getActiveDarForDocument } from './workflowHelpers';

/**
 * Checks if a document has any concurrent DAR currently in-flight.
 * Completed, rejected, or cancelled DARs must NEVER lock the document.
 */
export const isDocumentLockedByInFlightDar = (doc, dars = [], currentDraftId = null) => {
  if (!doc) return false;
  
  return (dars || []).some(dar => {
    if (!dar) return false;
    // Exclude the draft currently being edited
    if (currentDraftId && (String(dar.id) === String(currentDraftId) || String(dar.dar_no) === String(currentDraftId) || String(dar.darNo) === String(currentDraftId))) {
      return false;
    }

    const isDocMatch = 
      (dar.docId && String(dar.docId) === String(doc.id)) ||
      (dar.docIdRef && String(dar.docIdRef) === String(doc.id)) ||
      (dar.targetDocumentId && String(dar.targetDocumentId) === String(doc.id)) ||
      (dar.document_code && (dar.document_code === doc.code || dar.document_code === doc.title || dar.document_code === doc.document_code)) ||
      (dar.doc_code && (dar.doc_code === doc.code || dar.doc_code === doc.title || dar.doc_code === doc.document_code)) ||
      (dar.docCode && (dar.docCode === doc.code || dar.docCode === doc.title || dar.docCode === doc.document_code)) ||
      (dar.docTitle && (dar.docTitle === doc.code || dar.docTitle === doc.title || dar.docTitle === doc.name));

    if (!isDocMatch) return false;

    const darStatus = String(dar.status || '').trim().toUpperCase();
    
    // Terminal statuses never lock
    if (TERMINAL_DAR_STATUSES.includes(darStatus)) return false;

    // Must be in-flight
    return IN_FLIGHT_DAR_STATUSES.includes(darStatus) || Boolean(dar.isDraft);
  });
};

/**
 * Predicate to determine if a document is eligible for revision in DarRevisionForm.
 */
export const isDocumentEligibleForRevision = (doc, currentUser, dars = [], currentDraftId = null) => {
  if (!doc) return false;

  // 1. Status must be ACTIVE or EFFECTIVE (case-insensitive)
  const status = String(doc.status || (doc.is_active ? 'ACTIVE' : '')).trim().toUpperCase();
  if (status !== 'EFFECTIVE' && status !== 'ACTIVE') return false;
  if (doc.is_obsolete || doc.is_superseded || status === 'OBSOLETE' || status === 'SUPERSEDED') return false;

  // 2. Department authorization (Canonical scoping with normalizeDeptCode & wildcards)
  const docDept = doc.department || doc.dept || doc.owner_dept || doc.ownerDepartmentId;
  if (!isUserAuthorizedForDocDept(docDept, currentUser)) return false;

  // 3. In-flight DAR check: No concurrent in-flight DARs
  if (isDocumentLockedByInFlightDar(doc, dars, currentDraftId)) return false;

  return true;
};


