import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { apiGet, apiPost } from './client';
import { knownUsers } from './people';

// A damaged copy waits for recall under the same server status as a superseded one; the pages tell them apart.
// A recalled copy whose paper has been destroyed or archived is finished, so the recall tab lets go of it.
const pageStatus = (c) => {
  if (c.disposed_at) return /STAMP_AND_ARCHIVE/.test(c.disposition || '') ? 'ARCHIVED_OBSOLETE' : 'DESTROYED';
  return c.status === 'PENDING_RECALL' && c.report_kind === 'DAMAGED' ? 'DAMAGED_PENDING_RECALL' : c.status;
};

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
  status: pageStatus(c),
  disposed_at: c.disposed_at,
  recalled_at: c.recalled_at,
  recalled_by: c.recalled_by,
  is_active_in_field: c.status === 'ISSUED_ACTIVE',
  issue_no: String(c.issue_no || 1).padStart(2, '0'),
  issueNumber: `I${String(c.issue_no || 1).padStart(2, '0')}`,
  is_replacement: c.origin === 'REPLACEMENT',
  is_adhoc: c.origin === 'ADDITIONAL',
  replaced_copy_id: c.replaces_id,
  isDamaged: c.report_kind === 'DAMAGED',
  is_damaged: c.report_kind === 'DAMAGED',
  isLost: c.report_kind === 'LOST',
  is_lost: c.report_kind === 'LOST',
  reportType: c.report_kind,
  reportReason: c.status === 'PENDING_RECALL' || c.status === 'LOST' ? c.request_reason : undefined,
  request_reason: c.request_reason,
  requested_by: c.requested_by,
  requested_at: c.requested_at,
  pendingNewLocation: c.new_location_name,
  pendingNewDepartment: c.new_department,
  returnDate: c.return_date,
  dcc_notes: c.decision_note,
  dateIssued: c.issued_at.slice(0, 10),
  dispatched_at: c.dispatched_at,
  dispatched_by: c.dispatched_by,
  received_at: c.received_at,
  received_by: c.received_by
});

// Work the API derives from copy status: DCC prints and hands out, a department head confirms receipt, DCC takes old copies back.
export const toCopyTasks = (copies, me) => {
  const tasks = [];
  const nameOf = (id) => knownUsers().find((u) => u.id === id)?.name || id;
  const pick = (status) => copies.filter((c) => c.status === status);
  const byRevision = (list) => [...Map.groupBy(list, (c) => `${c.doc_code}-${c.revision}-${c.reportType || ''}`).values()];
  const dcc = (kind, type, taskType, label, list) => byRevision(list).map((group) => {
    const c = group[0];
    return {
      id: `api-cc-${kind}-${c.doc_code}-${c.revision}${c.reportType ? `-${c.reportType}` : ''}`, referenceType: 'CONTROLLED_COPY', referenceId: c.doc_id, docId: c.doc_id,
      docCode: c.doc_code, doc_code: c.doc_code, docTitle: c.docName, docName: c.docName, targetRevision: c.revision, revision: c.revision,
      title: `${c.reportType === 'DAMAGED' ? 'เรียกคืนสำเนาชำรุด' : label}: ${c.docName} (${c.doc_code} Rev.${c.revision}) จำนวน ${group.length} เล่ม`,
      type, taskType, assigneeId: me.id, assignee_id: me.id, assigneeName: me.name,
      department: 'DC', target_department: 'DC', assignee_department: 'DC', status: 'PENDING', createdAt: c.dateIssued
    };
  });
  if (me?.isDcc) {
    tasks.push(...dcc('dispatch', 'DCC_DISTRIBUTE', 'DISTRIBUTION', 'แจกจ่ายเอกสาร Controlled Copy', pick('PENDING_ISSUE')));
    tasks.push(...dcc('recall', 'DCC_RECALL', 'RECALL', 'เรียกคืนสำเนาควบคุมของเอกสารที่ถูกแทนที่', [...pick('PENDING_RECALL'), ...pick('DAMAGED_PENDING_RECALL')]));
  }
  // Relocation and return wait for DCC to check the physical copy; the modal reads these fields.
  if (me?.isDcc) {
    const custody = (status, type, label) => pick(status).map((c) => ({
      id: `api-cc-${type === 'DCC_RELOCATE' ? 'relocate' : 'return'}-${c.id}`, referenceType: 'CONTROLLED_COPY', referenceId: c.doc_id, docId: c.doc_id, copyId: c.id, copy_id: c.id, copy_no: c.copy_no,
      docCode: c.doc_code, doc_code: c.doc_code, docTitle: c.docName, docName: c.docName, revision: c.revision,
      title: `${label}: ${c.docName} (${c.doc_code} Copy ${c.copy_no})`,
      type, taskType: type, reason: c.request_reason, requesterId: c.requested_by, requesterName: nameOf(c.requested_by), requesterDept: c.department,
      currentLocation: c.location, currentDepartment: c.department, newLocation: c.pendingNewLocation, newDepartment: c.pendingNewDepartment, returnDate: c.returnDate,
      assigneeId: me.id, assignee_id: me.id, assigneeName: me.name, department: 'DC', target_department: 'DC', assignee_department: 'DC', status: 'PENDING', createdAt: c.requested_at
    }));
    tasks.push(...custody('RELOCATION_PENDING_APPROVAL', 'DCC_RELOCATE', 'ขอย้ายจุดติดตั้งสำเนาควบคุม'), ...custody('RETURN_PENDING_APPROVAL', 'DCC_RETURN', 'ขอส่งคืนสำเนาควบคุม'));
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

const ACTION_TH = {
  CC_DISPATCHED: 'ส่งมอบสำเนาควบคุม', CC_RECEIVED: 'ตรวจรับสำเนาควบคุม', CC_RECALLED: 'บันทึกการเรียกคืนสำเนา', CC_DISPOSED: 'ทำลาย/จัดเก็บสำเนา',
  CC_ADDITIONAL_REQUESTED: 'ขอสำเนาเพิ่ม', CC_DAMAGED_REPORTED: 'แจ้งสำเนาชำรุด', CC_LOST_REPORTED: 'แจ้งสำเนาสูญหาย',
  CC_RELOCATE_REQUESTED: 'ขอย้ายจุดติดตั้ง', CC_RELOCATE_APPROVED: 'อนุมัติย้ายจุดติดตั้ง', CC_RELOCATE_REJECTED: 'ไม่อนุมัติย้ายจุดติดตั้ง',
  CC_RETURN_REQUESTED: 'ขอส่งคืนสำเนา', CC_RETURN_APPROVED: 'อนุมัติรับคืนสำเนา', CC_RETURN_REJECTED: 'ไม่อนุมัติรับคืนสำเนา'
};
const DISPOSITION_TH = { DESTROY: 'ทำลาย (Shred/Destroy)', DESTROY_SCRAP: 'ทำลาย (Shred/Destroy)', STAMP_AND_ARCHIVE: 'ประทับตรา OBSOLETE และเก็บเข้าคลังประวัติ' };

// The history tabs read the server's audit trail (DCC and QMR only): one Thai line per event, and the destruction register from CC_DISPOSED.
const loadCopyTrail = async (copies) => {
  try {
    const { entries } = await apiGet('/api/controlled-copies/audit');
    const parse = (e) => { try { return JSON.parse(e.details) || {}; } catch { return {}; } };
    const copyById = new Map(copies.map((c) => [c.id, c]));
    const trailRows = entries.map((e) => {
      const d = parse(e);
      const parts = [d.department && `แผนก ${d.department}`, d.method && `วิธี: ${DISPOSITION_TH[d.method] || d.method}`, d.witness && `พยาน: ${d.witness}`,
        d.reference_no && `อ้างอิง: ${d.reference_no}`, (d.notes || d.reason || d.note) && `หมายเหตุ: ${d.notes || d.reason || d.note}`].filter(Boolean);
      return { id: `srv-${e.id}`, timestamp: e.at.includes('T') ? e.at : `${e.at.replace(' ', 'T')}Z`, action: ACTION_TH[e.action] || e.action, document_code: d.doc_code || '-',
        revision: d.revision, copy_number: d.copy_no, user: e.actor_name || 'System', details: parts.join(' | ') || '-', _raw: e.action, _d: d };
    });
    const disposed = trailRows.filter((r) => r._raw === 'CC_DISPOSED').map((r) => {
      const c = copyById.get(r._d.copy_id);
      const method = r._d.method || (/STAMP_AND_ARCHIVE/.test(r._d.note || '') ? 'STAMP_AND_ARCHIVE' : 'DESTROY');
      return { id: r.id, copyId: r._d.copy_id, docCode: r.document_code, docTitle: c?.docName || '', revision: r._d.revision, copyNumber: `Copy ${r._d.copy_no}`, copy_no: r._d.copy_no,
        department: r._d.department || '', location: c?.location || '', dispositionMethod: method, disposedBy: r.user, disposed_by_name: r.user, disposedAt: r.timestamp,
        witnessName: r._d.witness || '', referenceNo: r._d.reference_no || '', notes: r._d.notes || (r._d.method ? '' : r._d.note) || '' };
    });
    return { controlledCopyAuditTrail: trailRows.map(({ _raw, _d, ...row }) => row), copyDispositionRecords: disposed };
  } catch {
    return {};
  }
};

export const loadCopies = async () => {
  const { copies } = await apiGet('/api/controlled-copies');
  // VOID copies were never printed; they have no place in the register.
  const { currentUser, tasks, controlledCopyInstances } = useStore.getState();
  // shortcut: printing is remembered in this browser only (the server has no print record); add a print step when audits need it.
  const printed = new Set((controlledCopyInstances || []).filter((c) => c.is_printed).map((c) => c.id));
  const mapped = copies.filter((c) => c.status !== 'VOID').map((c) => ({ ...toStoreCopy(c), is_printed: printed.has(c.id) }));
  const trail = await loadCopyTrail(mapped);
  useStore.setState({
    ...trail,
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

// The last recall step: how the paper was disposed of and who witnessed it travel as their own fields for the audit trail.
export const disposeCopies = async (copyIds, { method, witness, referenceNo, notes }) => {
  const note = [method, witness, referenceNo, notes].filter(Boolean).join(' | ');
  const results = [];
  for (const id of copyIds) {
    try {
      await apiPost(`/api/controlled-copies/${id}/dispose`, { note, method, witness, reference_no: referenceNo, notes });
      results.push(true);
    } catch (err) {
      toast.error(err.message);
      results.push(false);
    }
  }
  await loadCopies().catch(() => {});
  return results.every(Boolean);
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

// Requests the department or DCC make about a copy they hold. Each returns true once the server took it, or false after showing
// its reason, so the form can stay open; the register is re-read either way.
const ask = async (path, body) => {
  try {
    await apiPost(path, body);
    return true;
  } catch (err) {
    toast.error(err.message);
    return false;
  } finally {
    await loadCopies().catch(() => {});
  }
};

// Another printed copy for places the department names (each: department, location id and name, as the form builds them).
export const requestAdditionalCopies = (documentId, locations, reason) => ask(`/api/documents/${documentId}/additional-copies`, {
  reason,
  locations: locations.map((l) => ({
    department: l.target_department || l.targetDepartment || l.departmentId || l.department || l.dept || l.dept_code,
    location_id: l.station_id || l.location_id || l.locationId || l.id,
    location_name: l.workstationLocation || l.station_name || l.locationName || l.location_name || l.name || l.location
  }))
});

export const reportCopyDamagedOrLost = (copyId, type, reason) => ask(`/api/controlled-copies/${copyId}/report`, { type, reason });
export const requestCopyRelocation = (copyId, { newLocation, newDepartment, reason }) => ask(`/api/controlled-copies/${copyId}/relocate`, { reason, new_location_name: newLocation, new_department: newDepartment });
export const requestCopyReturn = (copyId, { reason, returnDate }) => ask(`/api/controlled-copies/${copyId}/return`, { reason, return_date: returnDate });

// DCC's answer on the task the register derived (it knows which copy the task is about).
export const decideCopyRequest = (taskId, decision, { notes, rejectReason, dispositionMethod, witnessName } = {}) => {
  const task = useStore.getState().tasks.find((t) => t.id === taskId);
  if (!task?.copyId) {
    toast.error('ไม่พบคำขอนี้ กรุณาโหลดหน้าใหม่');
    return false;
  }
  return ask(`/api/controlled-copies/${task.copyId}/decide`, { decision, note: decision === 'REJECT' ? rejectReason : notes, disposition: dispositionMethod, witness: witnessName });
};
