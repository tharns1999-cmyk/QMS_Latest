import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { apiPost, apiUpload } from './client';
import { calculateCopyAllocations } from '../modules/dcc/services/MasterDataService';
import { distributionsOf, loadCopies } from './copies';

// External documents (doc_type ED) travel through the same request pipeline as internal ones on the server;
// the external pages read the demo's externalDocuments / externalRequests / tasks, so they are rebuilt from both lists here.
export const isExternalRow = (row) => row.doc_type === 'ED';

const DOC_STATUS = { EFFECTIVE: 'ACTIVE', SUPERSEDED: 'SUPERSEDED', OBSOLETE: 'OBSOLETE_ARCHIVED' };
const REQUEST_STATUS = { PENDING_REVIEW: 'PENDING_EXT_REVIEW', PENDING_APPROVAL: 'PENDING_EXT_APPROVAL', PENDING_DCC: 'APPROVED_WAITING_EFFECTIVE', COMPLETED: 'ACTIVE', REJECTED: 'REJECTED' };
const nameOf = (users, id) => users.find((u) => u.id === id)?.name || null;

const edFields = (r) => ({
  code: r.doc_code, edCode: r.doc_code, doc_code: r.doc_code, docNo: r.doc_code,
  title: r.name, name: r.name,
  department: r.department, dept: r.department,
  source: r.ext_issuer || '', issuer: r.ext_issuer || '', officialIssuer: r.ext_issuer || '',
  sourceVersion: r.ext_edition || '', edition: r.ext_edition || '',
  reviewCycleMonths: r.review_cycle_months,
  accessScope: r.access_scope === 'GENERAL' ? 'General' : 'Department',
  is_external: true, doc_type: 'EXTERNAL', origin: 'EXTERNAL'
});

export const toStoreExternalDoc = (d) => ({
  ...edFields(d),
  id: d.id,
  status: DOC_STATUS[d.status] || d.status,
  rev: d.revision, revision: d.revision, doc_version: d.revision,
  ownerId: d.owner_id,
  effectiveDate: d.effective_date,
  nextReviewDate: d.next_review_date, next_review_date: d.next_review_date,
  review_status: 'UP_TO_DATE',
  apiFilePath: d.file_key ? `/api/documents/${d.id}/file` : null,
  attachedFile: d.file_key ? { name: `${d.doc_code}.pdf`, type: 'application/pdf', apiFilePath: `/api/documents/${d.id}/file` } : null,
  distributions: [], controlledCopies: []
});

// A NEW request has no register row yet; show it as a pending document so the lists and the task modal find it.
const toPendingDoc = (r, users) => ({
  ...edFields(r),
  id: `dar-${r.id}`,
  status: REQUEST_STATUS[r.status] || r.status,
  rev: r.revision, revision: r.revision,
  ownerId: r.requester_id, requesterName: nameOf(users, r.requester_id),
  reviewerId: r.reviewer_id, reviewerName: nameOf(users, r.reviewer_id),
  approverId: r.approver_id, approverName: nameOf(users, r.approver_id),
  effectiveDate: r.effective_date,
  requestId: `EDR-${r.id}`, edrNumber: `EDR-${r.id}`,
  createdAt: r.created_at,
  apiFilePath: r.file_key ? `/api/dars/${r.id}/file` : null,
  attachedFile: r.file_key ? { name: `${r.doc_code}.pdf`, type: 'application/pdf', apiFilePath: `/api/dars/${r.id}/file` } : null,
  distributions: [], controlledCopies: []
});

const signoff = (step, stepName, role, userId, users, status, date, comment) => ({ step, stepName, role, userId, userName: nameOf(users, userId) || '-', status, date, comment: comment || null });

export const toStoreExternalRequest = (r, docId, users) => {
  const review = r.reviewed_at ? 'COMPLETED' : r.status === 'REJECTED' && !r.approved_at ? 'REJECTED' : 'PENDING';
  const approve = r.approved_at ? 'COMPLETED' : r.status === 'REJECTED' && r.reviewed_at ? 'REJECTED' : 'WAITING';
  return {
    ...edFields(r),
    id: `EDR-${r.id}`, requestId: `EDR-${r.id}`, requestNo: `EDR-${r.id}`, edrNumber: `EDR-${r.id}`,
    docId, documentId: docId, externalDocId: docId, documentCode: r.doc_code, darId: String(r.id),
    requestType: r.type, rev: r.revision,
    effectiveDate: r.effective_date,
    requesterId: r.requester_id, requesterName: nameOf(users, r.requester_id), requesterDepartment: r.department,
    reviewerId: r.reviewer_id, reviewerName: nameOf(users, r.reviewer_id),
    approverId: r.approver_id, approverName: nameOf(users, r.approver_id),
    status: REQUEST_STATUS[r.status] === 'ACTIVE' && r.type === 'OBSOLETE' ? 'OBSOLETE_ARCHIVED' : REQUEST_STATUS[r.status] || r.status,
    returnReason: r.reject_comment, revisionComment: r.reject_comment,
    createdAt: r.created_at, updatedAt: r.completed_at || r.approved_at || r.reviewed_at || r.created_at,
    reason: r.reason, changeReason: r.reason,
    signoffs: [
      signoff('REQUEST', 'ยื่นคำร้อง', 'ผู้ยื่นคำร้อง', r.requester_id, users, 'COMPLETED', r.created_at, r.reason),
      signoff('REVIEW', 'ทบทวนเอกสาร', 'ผู้ทบทวน', r.reviewer_id, users, review, r.reviewed_at, review === 'REJECTED' ? r.reject_comment : null),
      signoff('APPROVE', 'อนุมัติเอกสาร', 'ผู้อนุมัติ', r.approver_id, users, approve, r.approved_at, approve === 'REJECTED' ? r.reject_comment : null)
    ],
    apiFilePath: r.file_key ? `/api/dars/${r.id}/file` : null
  };
};

const TASK = {
  PENDING_REVIEW: { type: 'EXT_REVIEW', label: 'ทบทวนเอกสารภายนอก', assignee: 'reviewer_id', since: 'created_at' },
  PENDING_APPROVAL: { type: 'EXT_APPROVAL', label: 'อนุมัติเอกสารภายนอก', assignee: 'approver_id', since: 'reviewed_at' }
};

export const toExternalTask = (r, docId, users) => {
  const t = TASK[r.status];
  if (!t) return null;
  const assigneeId = r[t.assignee];
  return {
    id: `api-dar-${r.id}-${t.type}`, darId: String(r.id), referenceType: 'EXTERNAL_DOC', referenceId: docId, docId, origin: 'EXTERNAL',
    docCode: r.doc_code, doc_code: r.doc_code, docTitle: r.name, docName: r.name, title: `${r.doc_code}: ${r.name}`,
    type: t.type, taskType: t.type, assigneeId, assignee_id: assigneeId, assigneeName: nameOf(users, assigneeId),
    requesterId: r.requester_id, requestType: r.type, department: r.department, status: 'PENDING', createdAt: r[t.since] || r.created_at
  };
};

// Latest server lists; either loader calls sync() after it stores its half.
let documents = [];
let dars = [];
export const setExternalSources = ({ docs, darRows }) => {
  if (docs) documents = docs;
  if (darRows) dars = darRows;
  const { masterUsers } = useStore.getState();
  const users = masterUsers || [];
  const docIdFor = (r) => (r.type === 'NEW' ? `dar-${r.id}` : documents.find((d) => d.doc_code === r.doc_code && d.status === 'EFFECTIVE')?.id) || `dar-${r.id}`;
  const inFlight = dars.filter((r) => r.type === 'NEW' && ['PENDING_REVIEW', 'PENDING_APPROVAL', 'PENDING_DCC'].includes(r.status));
  const { tasks } = useStore.getState();
  useStore.setState({
    externalDocuments: [...inFlight.map((r) => toPendingDoc(r, users)), ...documents.map(toStoreExternalDoc)],
    externalRequests: dars.map((r) => toStoreExternalRequest(r, docIdFor(r), users)),
    tasks: [...(tasks || []).filter((t) => t.referenceType !== 'EXTERNAL_DOC'), ...dars.map((r) => toExternalTask(r, docIdFor(r), users)).filter(Boolean)]
  });
};

export const clearExternal = () => {
  documents = [];
  dars = [];
  useStore.setState({ externalDocuments: [], externalRequests: [] });
};

// Submits a new registration, a new edition, or (with isObsolete) a withdrawal. Returns false after showing the server's reason.
export const submitExternalToApi = async ({ payload, fileBlob, documentToEdit, isObsolete = false }) => {
  const { currentUser: user } = useStore.getState();
  const hasCurrent = Boolean(documentToEdit?.apiFilePath || documentToEdit?.status === 'ACTIVE');
  const type = isObsolete ? 'OBSOLETE' : documentToEdit && hasCurrent ? 'REVISION' : 'NEW';
  const department = payload.department || documentToEdit?.department || user.department;
  const body = {
    type,
    doc_code: documentToEdit?.edCode || documentToEdit?.doc_code,
    doc_type: 'ED',
    department,
    name: payload.title || documentToEdit?.title,
    reason: payload.reason || payload.changeReason || (type === 'NEW' ? 'ขึ้นทะเบียนเอกสารภายนอกใหม่' : 'ปรับปรุงเอกสารภายนอก'),
    reviewer_id: payload.reviewerId,
    approver_id: payload.approverId,
    access_scope: String(payload.accessScope || 'General').toUpperCase() === 'GENERAL' ? 'GENERAL' : 'DEPT',
    effective_date: payload.effectiveDate,
    issuer: payload.issuer || payload.source,
    edition: payload.sourceVersion || payload.edition,
    review_cycle_months: payload.reviewCycleMonths,
    distributions: payload.is_physical_copy ? distributionsOf({ type, docType: 'ED' }, calculateCopyAllocations(department, payload.distributions || []).allAllocations) : []
  };
  if (type !== 'NEW') delete body.access_scope;
  try {
    const { dar } = await apiPost('/api/dars', body);
    if (fileBlob && type !== 'OBSOLETE') {
      try {
        await apiUpload(`/api/dars/${dar.id}/file`, fileBlob);
      } catch (err) {
        toast.error(`ยื่นคำร้องแล้ว แต่แนบไฟล์ไม่สำเร็จ (${err.message}) กรุณาแนบใหม่ที่หน้ารายละเอียดคำร้อง`);
      }
    }
    const { loadDars } = await import('./dars');
    const { loadDocuments } = await import('./session');
    await Promise.all([loadDars(), loadDocuments(), loadCopies()]).catch(() => {});
    return { ...dar, requestNo: `EDR-${dar.id}` };
  } catch (err) {
    toast.error(err.message, { duration: 8000 });
    return false;
  }
};
