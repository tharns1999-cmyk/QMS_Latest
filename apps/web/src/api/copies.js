import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { apiGet, apiPost } from './client';

// The register and the receipt page read the demo's copy shape; this maps the API row onto it.
export const toStoreCopy = (c) => ({
  id: c.id,
  doc_id: c.document_id,
  docId: c.document_id,
  doc_code: c.doc_code,
  docCode: c.doc_code,
  document_code: c.doc_code,
  docTitle: c.doc_code,
  docName: c.doc_name,
  document_title: c.doc_name,
  doc_type: c.doc_type,
  doc_version: c.revision,
  rev: c.revision,
  revision: c.revision,
  copy_no: c.copy_no,
  copyNo: c.copy_no,
  ccNumber: `CC-${c.copy_no}`,
  holder_dept: c.department,
  department: c.department,
  departmentId: c.department,
  dept_code: c.department,
  target_department: c.department,
  recipientDepartment: c.department,
  owner_dept: c.owner_department,
  holder_name: `${c.department} (${c.location_name})`,
  location: c.location_name,
  locationName: c.location_name,
  locationId: c.location_id,
  station_id: c.location_id,
  station_name: c.location_name,
  is_master: false,
  copy_type: 'CONTROLLED',
  status: c.status,
  is_active_in_field: c.status === 'ISSUED_ACTIVE',
  dateIssued: c.issued_at.slice(0, 10),
  dispatched_at: c.dispatched_at,
  dispatched_by: c.dispatched_by,
  received_at: c.received_at,
  received_by: c.received_by
});

// Work the API derives from copy status: DCC prints and hands out, a department head confirms receipt, DCC takes old copies back.
export const toCopyTasks = (copies, me) => {
  const tasks = [];
  const pick = (status) => copies.filter((c) => c.status === status);
  const byRevision = (list) => [...Map.groupBy(list, (c) => `${c.doc_code}-${c.revision}`).values()];
  const dcc = (kind, type, taskType, label, list) => byRevision(list).map((group) => {
    const c = group[0];
    return {
      id: `api-cc-${kind}-${c.doc_code}-${c.revision}`, referenceType: 'CONTROLLED_COPY', referenceId: c.doc_id, docId: c.doc_id,
      docCode: c.doc_code, doc_code: c.doc_code, docTitle: c.docName, docName: c.docName, targetRevision: c.revision, revision: c.revision,
      title: `${label}: ${c.docName} (${c.doc_code} Rev.${c.revision}) จำนวน ${group.length} เล่ม`,
      type, taskType, assigneeId: me.id, assignee_id: me.id, assigneeName: me.name,
      department: 'DC', target_department: 'DC', assignee_department: 'DC', status: 'PENDING', createdAt: c.dateIssued
    };
  });
  if (me?.isDcc) {
    tasks.push(...dcc('dispatch', 'DCC_DISTRIBUTE', 'DISTRIBUTION', 'แจกจ่ายเอกสาร Controlled Copy', pick('PENDING_ISSUE')));
    tasks.push(...dcc('recall', 'DCC_RECALL', 'RECALL', 'เรียกคืนสำเนาควบคุมของเอกสารที่ถูกแทนที่', pick('PENDING_RECALL')));
  }
  for (const c of pick('DISPATCHED_PENDING_RECEIPT')) {
    // Same rule as the server: L4 or above of the receiving department.
    if (!(me?.approval_level >= 4 && [...(me.depts || []), me.department].includes(c.department))) continue;
    tasks.push({
      id: `api-cc-receipt-${c.id}`, referenceType: 'CONTROLLED_COPY', referenceId: c.doc_id, docId: c.doc_id, copy_id: c.id, copy_no: c.copy_no, location: c.location,
      docCode: c.doc_code, doc_code: c.doc_code, docTitle: c.docName, docName: c.docName, doc_version: c.revision,
      title: `ตรวจรับสำเนาควบคุม: ${c.docName} (${c.doc_code} Rev.${c.revision} Copy ${c.copy_no})`,
      type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT', taskType: 'DEPT_CONFIRM_HARDCOPY_RECEIPT', category: 'RECEIPT',
      assigneeId: me.id, assignee_id: me.id, assigneeName: me.name,
      department: c.department, target_department: c.department, assignee_department: c.department, status: 'PENDING', createdAt: c.dispatched_at
    });
  }
  return tasks;
};

export const loadCopies = async () => {
  const { copies } = await apiGet('/api/controlled-copies');
  // VOID copies were never printed; they have no place in the register.
  const { currentUser, tasks, controlledCopyInstances } = useStore.getState();
  // shortcut: printing is remembered in this browser only (the server has no print record); add a print step when audits need it.
  const printed = new Set((controlledCopyInstances || []).filter((c) => c.is_printed).map((c) => c.id));
  const mapped = copies.filter((c) => c.status !== 'VOID').map((c) => ({ ...toStoreCopy(c), is_printed: printed.has(c.id) }));
  useStore.setState({
    controlledCopyInstances: mapped,
    documentControlledCopies: mapped,
    tasks: [...(tasks || []).filter((t) => !String(t.id).startsWith('api-cc-')), ...toCopyTasks(mapped, currentUser)]
  });
};

// One step on one copy. Returns false after showing the server's reason, so callers can keep their page open.
export const stepCopy = async (step, copyId, note) => {
  try {
    await apiPost(`/api/controlled-copies/${copyId}/${step}`, { note });
    return true;
  } catch (err) {
    toast.error(err.message);
    return false;
  } finally {
    await loadCopies().catch(() => {});
  }
};

export const stepCopies = async (step, copyIds, note) => {
  const results = [];
  for (const id of copyIds) results.push(await stepCopy(step, id, note));
  return results.every(Boolean);
};

// The copies a new or revised DAR asks for: copy 01 is the owner's office, then the chosen locations.
export const distributionsOf = (dar, allocations) => (['NEW', 'REVISION'].includes(dar.type) && dar.docType !== 'FM'
  ? allocations.map((a) => ({ department: a.department || a.dept, location_id: a.locationId || a.station_id, location_name: a.locationName || a.station_name || a.name }))
  : []);
