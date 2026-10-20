/**
 * Universal Draft State Normalization Engine
 * 
 * Maps and normalizes draft data between Store/API payloads (camelCase/snake_case)
 * and React Form States across all DAR request workflows (New, Revision, Obsolete).
 * Prevents field data loss during Draft save, resume, and edit lifecycles.
 */

export const normalizeDraftToFormState = (draft = {}, defaultState = {}) => {
  if (!draft || typeof draft !== 'object' || Object.keys(draft).length === 0) {
    return defaultState;
  }

  // 1. Identification & Type
  const id = draft.id || draft.dar_no || draft.darNo || defaultState.id;
  const darNo = draft.darNumber || draft.dar_no || draft.darNo || draft.id || defaultState.darNo;
  const darType = draft.dar_type || draft.darType || draft.type || defaultState.darType || 'NEW';

  // 2. Document Attributes
  const docCode = draft.document_code || draft.doc_code || draft.docCode || draft.docIdInput || draft.doc_id || draft.docId || draft.docIdRef || defaultState.docCode || '';
  const docId = draft.doc_id || draft.docId || draft.docIdRef || draft.targetDocumentId || defaultState.docId || '';
  const rawTitle = draft.title || draft.name || draft.document_title || draft.doc_title || draft.docTitle || defaultState.title || '';
  const title = rawTitle === 'Untitled Draft' ? '' : rawTitle;
  const docType = draft.doc_type || draft.docType || (docCode ? docCode.split('-')[0] : defaultState.docType) || 'SOP';
  const department = draft.department || draft.owner_dept || draft.ownerDept || draft.dept_code || draft.dept || defaultState.department || 'QA';
  const standard = draft.standard || draft.iso_standard || defaultState.standard || 'ISO 9001';
  
  // Format Date to YYYY-MM-DD for HTML input type="date"
  const rawEffectiveDate = draft.effective_date || draft.effectiveDate || defaultState.effectiveDate || '';
  const effectiveDate = rawEffectiveDate ? String(rawEffectiveDate).split('T')[0] : '';
  
  const currentRevision = draft.current_revision || draft.currentRevision || draft.revision || draft.rev || defaultState.currentRevision || '00';
  const newRevision = draft.new_revision || draft.newRevision || defaultState.newRevision || '01';

  // 3. Access Control & Confidentiality Scope
  const rawAccessScope = draft.access_control?.scope || draft.accessScope || draft.access_scope || defaultState.accessScope || 'GENERAL';
  const rawAuthorizedDepts = draft.access_control?.authorized_depts || draft.authorizedDepts || draft.authorized_depts || draft.authorizedDepartments || [];
  const rawAuthorizedUsers = draft.access_control?.authorized_users || draft.authorizedUsers || draft.authorized_users || [];
  const minAccessLevel = draft.access_control?.min_access_level || draft.minAccessLevel || draft.min_access_level || 4;

  const access_control = {
    authorized_depts: Array.isArray(rawAuthorizedDepts) ? rawAuthorizedDepts : [],
    authorized_users: Array.isArray(rawAuthorizedUsers) ? rawAuthorizedUsers : [],
    min_access_level: minAccessLevel,
    ...(draft.access_control || {}),
    scope: draft.access_control?.scope || rawAccessScope
  };

  // 4. Distribution & Digital Form Scope
  const distributions = Array.isArray(draft.distributions) && draft.distributions.length > 0 
    ? draft.distributions 
    : (Array.isArray(draft.controlled_copies) && draft.controlled_copies.length > 0 
      ? draft.controlled_copies 
      : (Array.isArray(draft.controlledCopies) ? draft.controlledCopies : (defaultState.distributions || [])));

  const rawDistDepts = draft.distributed_departments || draft.distributed_depts || draft.distributedDepartments;
  const distributedDepartments = Array.isArray(rawDistDepts) && rawDistDepts.length > 0
    ? rawDistDepts
    : (Array.isArray(distributions) ? distributions.map(d => d.departmentId || d.department || d.dept || d.dept_code).filter(Boolean) : (defaultState.distributedDepartments || []));

  const formDistributionMode = draft.form_distribution_mode || draft.formDistributionMode || (distributedDepartments.length > 0 ? 'SPECIFIC_DEPTS' : 'ALL_DEPTS');
  const controlledCopies = Array.isArray(draft.controlled_copies) ? draft.controlled_copies : (Array.isArray(draft.controlledCopies) ? draft.controlledCopies : distributions);
  const totalCopies = draft.total_copies || draft.totalCopies || controlledCopies.length || 0;

  // 5. Reasons & Details (Universal cross-form mapping)
  const requestDetail = draft.request_detail || draft.requestDetail || draft.reason_details || draft.reasonDetails || draft.details || draft.detail || draft.description || defaultState.requestDetail || '';
  const requestReason = draft.request_reason || draft.requestReason || draft.reason_category || draft.reasonCategory || draft.reason || defaultState.requestReason || '';
  
  const changeSummary = draft.change_summary || draft.changeSummary || draft.request_detail || draft.requestDetail || draft.details || draft.detail || defaultState.changeSummary || '';
  const changeReason = draft.change_reason || draft.changeReason || draft.request_reason || draft.requestReason || draft.reason || defaultState.changeReason || '';
  
  const obsoleteReason = draft.obsolete_reason || draft.obsoleteReason || draft.change_reason || draft.changeReason || draft.reason_category || draft.reasonCategory || draft.reason || defaultState.obsoleteReason || '';
  const obsoleteDetail = draft.obsolete_detail || draft.obsoleteDetail || draft.request_detail || draft.requestDetail || draft.change_summary || draft.changeSummary || draft.details || defaultState.obsoleteDetail || '';
  const recallPlan = draft.recall_plan || draft.recallPlan || defaultState.recallPlan || '';
  const otherReason = draft.other_reason || draft.otherReason || draft.other_standard_detail || draft.otherStandardDetail || defaultState.otherReason || '';

  // 6. Approval Routing & Acknowledgement
  const reviewerId = draft.manualReviewerId || draft.manual_reviewer_id || draft.reviewer_id || draft.reviewerId || defaultState.manualReviewerId || defaultState.reviewerId || '';
  const approverId = draft.manualApproverId || draft.manual_approver_id || draft.approver_id || draft.approverId || defaultState.manualApproverId || defaultState.approverId || '';
  
  const isAckReqStr = draft.ackRequirement !== undefined ? (draft.ackRequirement === 'REQUIRED') : undefined;
  let requireAck = draft.require_ack ?? draft.requireAck ?? isAckReqStr ?? defaultState.require_ack ?? defaultState.requireAck ?? false;
  if (typeof requireAck === 'string') requireAck = requireAck === 'true';
  requireAck = Boolean(requireAck);
  
  const ackRequirement = draft.ackRequirement ?? (requireAck ? 'REQUIRED' : 'NOT_REQUIRED');
  const ackUserId = draft.ack_user_id || draft.ackUserId || (Array.isArray(draft.ackUserIds) ? draft.ackUserIds[0] : (Array.isArray(draft.ack_user_ids) ? draft.ack_user_ids[0] : (defaultState.ackUserId || '')));

  // 7. Standards & Attachments
  const relatedStandards = Array.isArray(draft.related_standards) ? draft.related_standards : (Array.isArray(draft.relatedStandards) ? draft.relatedStandards : (defaultState.relatedStandards || []));
  const otherStandardDetail = draft.other_standard_detail || draft.otherStandardDetail || defaultState.otherStandardDetail || '';
  const attachmentName = draft.attachment_name || draft.attachmentName || defaultState.attachmentName || '';
  const fileUrl = draft.file_url || draft.fileUrl || defaultState.fileUrl || null;

  return {
    ...defaultState,
    id,
    darNo,
    darType,
    docCode,
    docId: docId || docCode,
    docIdInput: docCode,
    title,
    docType,
    department,
    standard,
    effectiveDate,
    currentRevision,
    newRevision,
    accessScope: rawAccessScope,
    authorizedDepartments: Array.isArray(rawAuthorizedDepts) ? rawAuthorizedDepts : [],
    access_control,
    formDistributionMode,
    distributedDepartments,
    distributions,
    controlledCopies,
    totalCopies,
    requestDetail,
    requestReason,
    changeSummary,
    changeReason,
    obsoleteReason,
    obsoleteDetail,
    recallPlan,
    otherReason,
    reviewerId,
    manualReviewerId: reviewerId,
    approverId,
    manualApproverId: approverId,
    requireAck,
    ackRequirement,
    ackUserId,
    ackUserIds: ackUserId ? [ackUserId] : [],
    relatedStandards,
    otherStandardDetail,
    attachmentName,
    fileUrl,
    file: null,
    isDraft: true,
    status: 'DRAFT'
  };
};

export default normalizeDraftToFormState;
