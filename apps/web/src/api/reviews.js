import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { apiGet, apiPost } from './client';

// Periodic reviews live on the server. The review pages read the demo's shapes (flags on the document, history lists,
// approval tasks, schedules), so the server rows are laid over the documents here and the schedules are rebuilt from them.
let reviews = [];
const OPEN = ['PENDING_APPROVAL', 'AWAITING_ACTION'];
const OUTCOME_LABELS = { NO_CHANGE: 'ยังคงใช้งานต่อได้', REVISION_REQUIRED: 'ต้องปรับปรุง/แก้ไข', OBSOLETE: 'ขอยกเลิกการใช้งาน' };
const RESULT = { NO_CHANGE: 'NO_CHANGE', REVISION_REQUIRED: 'REVISE', OBSOLETE: 'OBSOLETE' };
// The review pages call a withdrawal OBSOLETE_REQUIRED.
const pageOutcome = (o) => (o === 'OBSOLETE' ? 'OBSOLETE_REQUIRED' : o);
const apiOutcome = (o) => (o === 'OBSOLETE_REQUIRED' ? 'OBSOLETE' : o === 'CONFIRM_CONTINUE' ? 'NO_CHANGE' : o);

export const clearReviews = () => {
  reviews = [];
};

export const loadReviews = async () => {
  reviews = (await apiGet('/api/periodic-reviews')).reviews || [];
};

const personOf = (users, id) => {
  const u = users.find((p) => p.id === id);
  return { id: id || null, name: u?.name || '-', dept: u?.department || null, role: u?.role || null };
};

const detailsOf = (r) => {
  try { return JSON.parse(r.details || '{}'); } catch { return {}; }
};

const historyEntry = (r, doc, users) => {
  const d = detailsOf(r);
  const reviewer = personOf(users, r.reviewer_id);
  const approver = r.status === 'COMPLETED' ? personOf(users, r.approver_id) : null;
  const outcome = pageOutcome(r.outcome);
  return {
    id: `PRR-${r.id}`, history_id: `PRR-${r.id}`,
    reviewer: reviewer.name, reviewerId: reviewer.id, reviewerRole: reviewer.role,
    approver: approver?.name || null, approverRole: approver?.role || null,
    reviewDate: r.submitted_at.slice(0, 10), review_date: r.submitted_at.slice(0, 10),
    comment: r.reason, reason: r.reason, justification: r.reason,
    findings: d.findings || '', standard_clause: d.standard_clause || '', standards_referenced: d.standard_clause || '',
    evidence_reference: d.evidence_reference || '', additional_comment: d.additional_comment || '',
    outcome, outcome_code: r.outcome, outcome_label: OUTCOME_LABELS[r.outcome],
    nextReviewDate: r.new_next_review_date, extended_next_due_date: r.new_next_review_date, previous_due_date: r.due_date,
    edition: doc.sourceVersion || doc.edition || doc.rev || '-',
    reviewed_by: { id: reviewer.id, name: reviewer.name, dept: reviewer.dept },
    approved_by: approver ? { id: approver.id, name: approver.name, dept: approver.dept, role: approver.role } : null,
    is_fast_track: r.fast_track === 1,
    cycle_months: doc.review_cycle_months || 12,
    rejection_trail: []
  };
};

const auditEntry = (r, round, users) => {
  const d = detailsOf(r);
  const reviewer = personOf(users, r.reviewer_id);
  const approver = r.status === 'COMPLETED' ? personOf(users, r.approver_id) : null;
  return {
    id: `REV-HIST-${r.id}`, round, review_round: round,
    reviewed_at: r.submitted_at, reviewed_date: r.submitted_at.slice(0, 10),
    result: RESULT[r.outcome], outcome: pageOutcome(r.outcome),
    reason: r.reason, remarks: r.reason,
    findings: d.findings || '-', standard_clause: d.standard_clause || '-', check_source: d.standard_clause || '-',
    evidence_reference: d.evidence_reference || '-', additional_comment: d.additional_comment || '-',
    next_review_due: r.new_next_review_date,
    reviewer_id: reviewer.id, reviewer_name: reviewer.name, reviewer_role: reviewer.role,
    approver_id: approver?.id || null, approver_name: approver?.name || null, approver_role: approver?.role || null,
    approved_at: approver ? r.decided_at : null,
    approval_status: r.status === 'COMPLETED' ? 'APPROVED' : 'PENDING_APPROVAL',
    approval_remarks: r.decision_comment || '-'
  };
};

const pendingPayload = (r, doc, users, isExternal) => {
  const d = detailsOf(r);
  const reviewer = personOf(users, r.reviewer_id);
  return {
    id: `REV-REQ-${r.id}`, review_id: r.id,
    doc_id: doc.id, doc_code: r.doc_code, doc_title: r.doc_name, revision: r.revision, department: r.department,
    is_external: isExternal, outcome: 'NO_CHANGE',
    reviewer_id: reviewer.id, reviewer_name: reviewer.name, reviewer_role: reviewer.role || 'Staff', reviewer_department: reviewer.dept || r.department,
    submitted_at: r.submitted_at,
    details: { ...d, reason: r.reason, comment: r.reason, standards: d.standard_clause, references: d.evidence_reference }
  };
};

const approvalTask = (r, payload, isExternal, me) => ({
  id: `api-rev-${r.id}`, reviewId: r.id,
  type: 'PERIODIC_REVIEW_APPROVAL', taskType: 'PERIODIC_REVIEW_APPROVAL',
  title: `อนุมัติผลการทบทวนเอกสาร${isExternal ? 'ภายนอก' : ''}: ${r.doc_code} (ไม่มีการเปลี่ยนแปลง)`,
  document_code: r.doc_code, document_title: r.doc_name, docId: r.document_id, docCode: r.doc_code, docTitle: r.doc_name, revision: r.revision,
  department: r.department, target_department: r.department, targetDepartment: r.department, owner_dept: r.department, assignee_department: r.department,
  assigneeId: me.id, assignee_id: me.id, assigned_to: me.id, assignee_name: me.name,
  actionRequired: true, status: 'PENDING', is_completed: false,
  referenceType: isExternal ? 'EXTERNAL_DOC' : 'INTERNAL_DOC', origin: isExternal ? 'EXTERNAL' : 'INTERNAL',
  isExternal, is_external: isExternal, payload, created_at: r.submitted_at
});

// Lays the server's reviews over the documents and rebuilds the demo's schedules and review tasks from them.
export const applyReviews = () => {
  const { documents, externalDocuments, masterUsers, currentUser } = useStore.getState();
  const users = masterUsers || [];
  const byDoc = Map.groupBy([...reviews].reverse(), (r) => r.document_id);
  const approvalTasks = [];
  const rejections = new Map();
  const overlay = (isExternal) => (doc) => {
    const list = byDoc.get(doc.id);
    if (!list) return doc;
    const open = list.find((r) => OPEN.includes(r.status));
    const history = list.filter((r) => r.status === 'COMPLETED' || r.status === 'AWAITING_ACTION');
    const next = {
      ...doc,
      lastReviewedDate: doc.last_reviewed_at,
      review_history: history.map((r) => historyEntry(r, doc, users)),
      periodic_reviews: history.map((r, i) => auditEntry(r, i + 1, users))
    };
    if (open?.status === 'PENDING_APPROVAL') {
      const payload = pendingPayload(open, doc, users, isExternal);
      Object.assign(next, { review_status: 'PENDING_APPROVAL', pending_periodic_review: payload, pendingReview: payload, pending_review_details: payload, pending_review_task_id: `api-rev-${open.id}` });
      if (open.approver_id === currentUser?.id) approvalTasks.push(approvalTask(open, payload, isExternal, currentUser));
    } else if (open) {
      Object.assign(next, { review_status: 'AWAITING_ACTION', periodic_review_outcome: pageOutcome(open.outcome), is_reviewed_this_cycle: false });
    } else if (list.at(-1).status === 'REJECTED') {
      // Sent back: the reviewer sees why on the dashboard and on the new review task.
      const rejected = list.at(-1);
      Object.assign(next, { rejection_remarks: rejected.decision_comment, rejectionRemarks: rejected.decision_comment, rejected_at: rejected.decided_at });
      rejections.set(doc.id, rejected.decision_comment);
    }
    return next;
  };

  const { tasks, initializePeriodicReviews, syncPeriodicReviewSchedulesAndTasks } = useStore.getState();
  const derived = (t) => String(t.id).startsWith('api-rev-') || ['PERIODIC_REVIEW', 'EXTERNAL_VERIFICATION', 'PERIODIC_REVIEW_APPROVAL'].includes(t.type);
  useStore.setState({
    documents: (documents || []).map(overlay(false)),
    externalDocuments: (externalDocuments || []).map(overlay(true)),
    // Schedules and their tasks are derived from the documents, so they start over whenever the documents change.
    periodicReviewSchedules: [],
    periodicReviewTasks: [],
    tasks: [...approvalTasks, ...(tasks || []).filter((t) => !derived(t))]
  });
  initializePeriodicReviews?.();
  syncPeriodicReviewSchedulesAndTasks?.();
  if (rejections.size) {
    useStore.setState((state) => ({
      tasks: state.tasks.map((t) => (rejections.has(t.docId) && ['PERIODIC_REVIEW', 'EXTERNAL_VERIFICATION'].includes(t.type) ? { ...t, rejectionRemarks: rejections.get(t.docId) } : t))
    }));
  }
};

const refresh = async () => {
  const { loadDocuments } = await import('./session');
  await loadDocuments();
};

const failed = (err) => {
  toast.error(err.message, { duration: 8000 });
  return false;
};

// Returns the saved review, or false after showing the server's reason.
export const submitReviewToApi = async ({ docId, outcome, comment, details }) => {
  try {
    const { review } = await apiPost(`/api/documents/${docId}/periodic-review`, {
      outcome: apiOutcome(outcome),
      reason: comment,
      details: { findings: details?.findings, standard_clause: details?.standard_clause || details?.standards, evidence_reference: details?.evidence_reference || details?.references, additional_comment: details?.additional_comment || details?.additionalComments }
    });
    await refresh().catch(() => {});
    return review;
  } catch (err) {
    return failed(err);
  }
};

// Approve or reject the review waiting on a document (or by review id). Returns true on success.
export const decideReviewOnApi = async ({ reviewId, docId, decision, comment }) => {
  const id = reviewId ?? reviews.find((r) => r.document_id === docId && r.status === 'PENDING_APPROVAL')?.id;
  if (!id) return failed(new Error('ไม่พบผลการทบทวนที่รออนุมัติ กรุณาโหลดหน้าใหม่'));
  try {
    await apiPost(`/api/periodic-reviews/${id}/decision`, { decision, comment });
    await refresh().catch(() => {});
    return true;
  } catch (err) {
    await refresh().catch(() => {});
    return failed(err);
  }
};

// Drops the open review of a document (by id or code) so the department can review it again.
export const cancelOpenReview = async (docKey) => {
  const { documents, externalDocuments } = useStore.getState();
  const doc = [...(documents || []), ...(externalDocuments || [])].find((d) => [d.id, d.doc_code, d.code, d.edCode].includes(docKey));
  const open = doc && reviews.find((r) => r.document_id === doc.id && OPEN.includes(r.status));
  if (!open) return;
  try {
    await apiPost(`/api/periodic-reviews/${open.id}/cancel`, {});
  } catch (err) {
    toast.error(err.message);
  }
  await refresh().catch(() => {});
};
