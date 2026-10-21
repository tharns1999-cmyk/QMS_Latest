import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { apiGet, apiPost, apiUpload } from './client';
import { loadDocuments } from './session';
import { resolveReviewer, resolveApprover } from '../modules/dcc/utils/workflowResolver';
import { isDarDraft } from '../modules/dcc/utils/darHelper';
import { calculateCopyAllocations } from '../modules/dcc/services/MasterDataService';
import { distributionsOf, loadCopies } from './copies';
import { isExternalRow, setExternalSources } from './external';
import { loadAcknowledgements } from './acknowledgements';

// The pages key their badges and handler logic on the demo status names.
const STATUS_FROM_API = { PENDING_REVIEW: 'UNDER_REVIEW', PENDING_DCC: 'APPROVED_WAITING_EFFECTIVE' };
const TYPE_TO_API = { NEW: 'NEW', NEW_DOCUMENT: 'NEW', REVISION: 'REVISION', REVISE: 'REVISION', OBSOLETE: 'OBSOLETE' };

const nameOf = (users, id) => users.find((u) => u.id === id)?.name || id;
// API timestamps are UTC; the pages show the plant's local date and time.
const localTime = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace('T', ' ');
};

// A rejection stamps the stage it happened at, so reviewed_at alone means rejected at review.
const stageStatus = (d, at, isApprover) => {
  if (!at) return 'PENDING';
  const rejectedHere = d.status === 'REJECTED' && (isApprover || !d.approved_at);
  return rejectedHere ? 'REJECTED' : 'COMPLETED';
};

export const toStoreDar = (d, users) => {
  const filePath = d.file_key ? `/api/dars/${d.id}/file` : null;
  const ackUserIds = JSON.parse(d.ack_user_ids || '[]');
  return {
    ...d,
    // The pages read a list; the server keeps it as JSON text.
    distributions: JSON.parse(d.distributions || '[]').map((x, i) => ({ departmentId: x.department, locationId: x.location_id, locationName: x.location_name, copyNo: String(i + 1).padStart(2, '0') })),
    ackUserIds,
    ackUserId: ackUserIds[0] || null,
    ackRequirement: ackUserIds.length ? 'REQUIRED' : 'NOT_REQUIRED',
    requireAck: ackUserIds.length > 0,
    id: String(d.id),
    apiId: d.id,
    apiStatus: d.status,
    // A returned DAR stays PENDING_REVIEW on the server (it keeps the document locked) with a flag; the pages know it as RETURNED_FOR_REVISION.
    status: d.awaiting_requester ? 'RETURNED_FOR_REVISION' : STATUS_FROM_API[d.status] || d.status,
    awaitingRequester: d.awaiting_requester === 1,
    returnReason: d.return_comment,
    returnedBy: d.returned_by ? nameOf(users, d.returned_by) : undefined,
    returnDate: d.returned_at ? localTime(d.returned_at) : undefined,
    darNumber: `DAR-${d.id}`,
    title: d.name,
    docCode: d.doc_code,
    docIdInput: d.doc_code,
    document_code: d.doc_code,
    docType: d.doc_type,
    rev: d.revision,
    newRev: d.revision,
    requesterId: d.requester_id,
    reviewerId: d.reviewer_id,
    approverId: d.approver_id,
    requesterName: nameOf(users, d.requester_id),
    reviewerName: nameOf(users, d.reviewer_id),
    approverName: nameOf(users, d.approver_id),
    reviewer: nameOf(users, d.reviewer_id),
    approver: nameOf(users, d.approver_id),
    requestReason: d.reason,
    effectiveDate: d.effective_date,
    date: localTime(d.created_at).slice(0, 10),
    createdAt: d.created_at,
    submittedAt: d.created_at,
    access_control: { scope: d.access_scope === 'DEPT' ? 'DEPT_ONLY' : d.access_scope },
    workflowSteps: [
      { step: 1, role: 'REQUESTER', userId: d.requester_id, userName: nameOf(users, d.requester_id), status: 'COMPLETED', timestamp: d.created_at },
      { step: 2, role: 'REVIEWER', userId: d.reviewer_id, userName: nameOf(users, d.reviewer_id), status: stageStatus(d, d.reviewed_at, false), timestamp: d.reviewed_at },
      { step: 3, role: 'APPROVER', userId: d.approver_id, userName: nameOf(users, d.approver_id), status: stageStatus(d, d.approved_at, true), timestamp: d.approved_at }
    ],
    apiFilePath: filePath,
    attachedFile: filePath ? { name: `${d.doc_code}_Rev${d.revision ?? ''}.pdf`, type: 'application/pdf', apiFilePath: filePath } : null
  };
};

const toTimeline = (d, users) => {
  const rejected = d.status === 'REJECTED';
  // Action names match the demo timeline: DarDetail looks signers up by 'Created', 'Reviewed' and 'Approved'.
  const events = [
    [d.created_at, 'Created', d.requester_id],
    [d.returned_at, 'Returned', d.returned_by],
    [d.reviewed_at, rejected && !d.approved_at ? 'Rejected' : 'Reviewed', d.reviewer_id],
    [d.approved_at, rejected ? 'Rejected' : 'Approved', d.approver_id],
    [d.completed_at, 'Published', null]
  ];
  return events.filter(([at]) => at).map(([at, action, userId], i, all) => ({
    id: Date.parse(at) + i,
    darId: String(d.id),
    action,
    user: userId ? nameOf(users, userId) : 'DCC',
    date: localTime(at),
    comment: action === 'Returned' ? d.return_comment : rejected && i === all.length - 1 ? d.reject_comment : undefined
  }));
};

// The inbox, DarList and the task pages read pending work from `tasks`; in API mode it is derived from DAR status.
const TASK_BY_STATUS = {
  PENDING_REVIEW: { kind: 'review', type: 'Review', taskType: 'DAR_REVIEW', label: 'ทบทวน', assignee: 'reviewer_id', since: 'created_at' },
  PENDING_APPROVAL: { kind: 'approve', type: 'Approve', taskType: 'DAR_APPROVE', label: 'อนุมัติ', assignee: 'approver_id', since: 'reviewed_at' }
  // PENDING_DCC (approved, waiting for its effective date) is nobody's task: the server puts it in force on that date.
};

const REVISE_TASK = { kind: 'revise', type: 'Revise', taskType: 'DAR_REVISE', label: 'ส่งกลับแก้ไข', assignee: 'requester_id', since: 'returned_at' };

export const toTask = (d, users) => {
  // A returned DAR is its requester's work, not the reviewer's.
  const t = d.awaiting_requester ? REVISE_TASK : TASK_BY_STATUS[d.status];
  if (!t) return null;
  const assigneeId = d[t.assignee];
  if (!assigneeId) return null;
  const darId = String(d.id);
  return {
    id: `api-dar-${darId}-${t.kind}`,
    darId,
    referenceType: 'INTERNAL_DAR',
    referenceId: darId,
    docCode: d.doc_code,
    doc_code: d.doc_code,
    docTitle: d.name,
    docName: d.name,
    title: `[DAR ${t.label}] ${d.name} (${d.doc_code})`,
    type: t.type,
    taskType: t.taskType,
    assigneeId,
    assignee_id: assigneeId,
    assigneeName: nameOf(users, assigneeId),
    requesterId: d.requester_id,
    department: d.department,
    status: 'PENDING',
    ...(t.kind === 'revise' && { returnReason: d.return_comment, returnedBy: nameOf(users, d.returned_by), returnDate: localTime(d.returned_at) }),
    createdAt: d[t.since] || d.created_at
  };
};

export const loadDars = async () => {
  const [{ dars: all }, acks] = await Promise.all([apiGet('/api/dars'), loadAcknowledgements()]);
  // External documents have their own pages; they read what api/external.js builds.
  const dars = all.filter((d) => !isExternalRow(d));
  const { masterUsers } = useStore.getState();
  const users = masterUsers || [];
  // Drafts exist only in this browser (the server has no draft status); keep them or opening the list would wipe them.
  const drafts = (useStore.getState().dars || []).filter(isDarDraft);
  const mapped = [...drafts, ...dars.map((d) => toStoreDar(d, users))];
  useStore.setState({
    dars: mapped,
    darRequests: mapped,
    timeline: [...dars.flatMap((d) => toTimeline(d, users)), ...acks.timeline(users)],
    tasks: [...dars.map((d) => toTask(d, users)).filter(Boolean), ...acks.tasks(), ...(useStore.getState().tasks || []).filter((t) => /^api-(cc|rev)-/.test(String(t.id)))]
  });
  setExternalSources({ darRows: all.filter(isExternalRow) });
};

// API-mode twin of darSlice.processWorkflow. Throws with the server's reason so the task page stays open.
export const decideTask = async (taskId, action, comment) => {
  const task = useStore.getState().tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('ไม่พบงานนี้ กรุณาโหลดหน้าใหม่');
  // RETURN sends it back to the requester to fix and resubmit; REJECT closes it.
  const decision = ['APPROVE', 'RETURN'].includes(action) ? action : 'REJECT';
  try {
    await apiPost(`/api/dars/${task.darId}/decision`, { decision, comment });
  } finally {
    // A final approval can put the document in force at once, so the register is re-read too.
    await Promise.all([loadDars(), loadDocuments(), loadCopies()]).catch(() => {});
  }
};

// API-mode twin of darSlice.submitDar: returns the stored DAR, or null after showing the server's reason.
export const submitDarToApi = async (dar, file) => {
  const { currentUser: user, masterUsers, reviewUsers, approveUsers } = useStore.getState();
  const type = TYPE_TO_API[String(dar.type).toUpperCase()] || dar.type;
  const docCode = dar.document_code || dar.docCode || dar.doc_code;
  const docType = dar.docType || String(docCode || '').split('-')[0];
  const idOf = (r) => r?.id ?? r;
  // Same routing the form previewed: the New form passes its steps, the others preview with workflowResolver.
  const hasSteps = dar.workflowSteps?.length > 0;
  const stepUser = (role) => dar.workflowSteps.find((s) => s.role === role)?.userId;
  const reviewerId = hasSteps ? stepUser('REVIEWER') : idOf(resolveReviewer(user.id, user.department, masterUsers, reviewUsers || masterUsers, docType));
  const approverId = hasSteps ? stepUser('APPROVER') : idOf(resolveApprover(user.id, reviewerId, user.department, masterUsers, approveUsers || masterUsers, docType));

  if (!reviewerId || !approverId) {
    toast.error(`ไม่พบ${reviewerId ? 'ผู้อนุมัติ' : 'ผู้ทบทวน'}ที่มีสิทธิ์ตาม Approval Matrix สำหรับเอกสารประเภท ${docType} กรุณาติดต่อ DCC`);
    return null;
  }

  let created;
  try {
    ({ dar: created } = await apiPost('/api/dars', {
      type,
      doc_code: docCode,
      doc_type: docType,
      department: dar.department,
      name: dar.title,
      access_scope: dar.access_control?.scope === 'GENERAL' ? 'GENERAL' : 'DEPT',
      reason: dar.reason || dar.requestReason,
      effective_date: dar.effectiveDate || dar.effective_date,
      distributions: distributionsOf({ type, docType }, calculateCopyAllocations(dar.department, dar.distributions || []).allAllocations),
      ack_user_ids: dar.ackRequirement === 'REQUIRED' ? dar.ackUserIds || [] : [],
      reviewer_id: reviewerId,
      approver_id: approverId
    }));
  } catch (err) {
    toast.error(err.message, { duration: 8000 });
    return null;
  }
  // The server numbers NEW documents; the form's preview can be overtaken by another request.
  if (type === 'NEW' && created.doc_code !== docCode) toast(`ระบบออกรหัสเอกสารให้เป็น ${created.doc_code}`, { icon: 'ℹ️' });
  if (file && type !== 'OBSOLETE') {
    try {
      await apiUpload(`/api/dars/${created.id}/file`, file);
    } catch (err) {
      toast.error(`ยื่นคำร้องแล้ว แต่แนบไฟล์ไม่สำเร็จ (${err.message}) กรุณาแนบใหม่ที่หน้ารายละเอียดคำร้อง`);
    }
  }
  await loadDars().catch(() => {});
  return useStore.getState().dars.find((d) => d.apiId === created.id) || toStoreDar(created, masterUsers || []);
};

export const replaceDarFile = async (dar, file) => {
  try {
    await apiUpload(`/api/dars/${dar.apiId}/file`, file);
    await loadDars();
    toast.success('แนบไฟล์เรียบร้อย');
  } catch (err) {
    toast.error(err.message);
  }
};

// The requester's side of a send-back: fix the details (and the file), then start review again; or withdraw it to free the document.
// Returns true once the server took it, otherwise shows its reason.
export const resubmitDarOnApi = async (dar, { name, reason, effectiveDate, file } = {}) => {
  try {
    if (file) await apiUpload(`/api/dars/${dar.apiId}/file`, file);
    await apiPost(`/api/dars/${dar.apiId}/resubmit`, { name, reason, effective_date: effectiveDate });
    return true;
  } catch (err) {
    toast.error(err.message, { duration: 8000 });
    return false;
  } finally {
    await loadDars().catch(() => {});
  }
};

export const withdrawDarOnApi = async (dar) => {
  try {
    await apiPost(`/api/dars/${dar.apiId}/withdraw`);
    return true;
  } catch (err) {
    toast.error(err.message);
    return false;
  } finally {
    await Promise.all([loadDars(), loadDocuments()]).catch(() => {});
  }
};
