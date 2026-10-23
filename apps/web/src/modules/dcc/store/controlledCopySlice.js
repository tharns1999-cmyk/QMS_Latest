/**
 * Controlled Copy Management Zustand Slice
 * Extracted from useStore.js (Phase 4 Refactor)
 */
import { STANDARD_STATIONS } from '../services/MasterDataService';
import { isApiMode } from '../../../api/client';
// Loaded on use: api/copies imports the store, which imports this slice.
const apiCopies = {
  stepCopy: (...args) => import('../../../api/copies').then((m) => m.stepCopy(...args)),
  stepCopies: (...args) => import('../../../api/copies').then((m) => m.stepCopies(...args)),
  disposeCopies: (...args) => import('../../../api/copies').then((m) => m.disposeCopies(...args)),
  call: (name, ...args) => import('../../../api/copies').then((m) => m[name](...args))
};
import { canManageControlledCopy } from '../utils/accessControl';
import { 
  isSameDepartment, 
  userMatchesDepartment, 
  isLevel1To5, 
  isDccExclusiveTask,
  isDccOperationalTask,
  isReceiptTask
} from '../utils/taskFilter';
import { MASTER_DATA_USER } from '../../../store/fixtures/seedData';
import { resolveDccAdminUserId } from './externalDocSlice';

// ??? Domain Constants & Helper Functions ????????????????????????????????????
export const CONTROLLED_COPY_STATUS = {
  PENDING_ISSUE: 'PENDING_ISSUE',
  DISPATCHED_PENDING_RECEIPT: 'DISPATCHED_PENDING_RECEIPT',
  ISSUED_ACTIVE: 'ISSUED_ACTIVE',
  PENDING_RECALL: 'PENDING_RECALL',
  RECALLED_DESTROYED: 'RECALLED_DESTROYED',
  // Custody workflow statuses (ISO 9001 Clause 7.5.3)
  RELOCATION_PENDING_APPROVAL: 'RELOCATION_PENDING_APPROVAL',
  RETURN_PENDING_APPROVAL: 'RETURN_PENDING_APPROVAL',
  // Backward compatibility aliases
  ACTIVE: 'ACTIVE',
  PENDING_RECEIPT: 'PENDING_RECEIPT',
  REPLACEMENT_REQUESTED: 'REPLACEMENT_REQUESTED',
  RECALLED: 'RECALLED'
};

export const resolveDarDocumentCode = (dar, documents = [], fallbackId = null) => {
  if (!dar) return fallbackId || null;
  const isThai = (str) => typeof str === 'string' && /[\u0E00-\u0E7F]/.test(str);

  const directCandidates = [
    dar.docNo,
    dar.documentCode,
    dar.document_code,
    dar.docCode,
    dar.doc_code,
    dar.docIdInput,
    dar.doc_number,
    dar.code
  ];
  for (const c of directCandidates) {
    if (c && typeof c === 'string' && c.trim() && !isThai(c.trim())) {
      return c.trim();
    }
  }

  // Ref document match
  const refDocId = dar.docIdRef || dar.docId || dar.targetDocumentId;
  const refDoc = (documents || []).find(d => 
    (refDocId && String(d.id) === String(refDocId)) ||
    (dar.docIdInput && (d.title === dar.docIdInput || d.document_code === dar.docIdInput || d.code === dar.docIdInput))
  );
  if (refDoc) {
    const cand = refDoc.document_code || refDoc.doc_code || refDoc.code || refDoc.docCode || refDoc.docNo || refDoc.title;
    if (cand && typeof cand === 'string' && cand.trim() && !isThai(cand.trim())) {
      return cand.trim();
    }
  }

  if (dar.darNumber && /^DAR-\d{4}-\d+/.test(dar.darNumber)) return dar.darNumber;
  if (dar.darNo && /^DAR-\d{4}-\d+/.test(dar.darNo)) return dar.darNo;
  if (dar.id && typeof dar.id === 'string' && /^DAR-\d{4}-\d+/.test(dar.id)) return dar.id;

  if (dar.title && typeof dar.title === 'string' && !isThai(dar.title)) {
    return dar.title.trim();
  }

  return fallbackId || dar.darNumber || dar.darNo || dar.id || null;
};

/**
 * Strict Deterministic Controlled Copy Identifier (ISO 9001 Clause 7.5.3)
 * Pattern: COPY_${docCode}_REV${revision}_${copyNumber}
 */
export const buildControlledCopyId = (docCode, revision, copyNumber) => {
  const cleanCode = String(docCode || 'DOC').replace(/^\[.*?\]\s*/, '').trim().toUpperCase();
  const cleanRev = String(revision || '00').replace(/^rev\.?/i, '').trim().padStart(2, '0');
  const numOnly = parseInt(String(copyNumber || '1').replace(/\D/g, ''), 10) || 1;
  const cleanNo = String(numOnly).padStart(2, '0');
  return `COPY_${cleanCode}_REV${cleanRev}_${cleanNo}`;
};

/**
 * Deduplication Guard for Controlled Copies
 * Eliminates duplicate Copy records (e.g. duplicate Copy 01) by natural physical key.
 */
export const deduplicateControlledCopies = (copies = []) => {
  if (!Array.isArray(copies)) return [];
  const map = new Map();

  for (const c of copies) {
    if (!c) continue;
    const docCode = c.doc_code || c.document_code || c.docCode || c.docNo || c.title || '';
    const cleanCode = String(docCode).replace(/^\[.*?\]\s*/, '').trim().toUpperCase();
    const cleanRev = String(c.rev || c.revision || c.doc_version || '00').replace(/^rev\.?/i, '').trim().padStart(2, '0');
    const cleanNo = String(c.copy_no || c.copyNo || c.ccNumber || c.copy_number || '01').replace(/^copy\s*/i, '').replace(/^cc-?/i, '').replace(/\s+/g, '').padStart(2, '0');
    
    // Natural key represents physical identity of the copy in ISO 9001
    const naturalKey = `${cleanCode}_REV${cleanRev}_COPY${cleanNo}`;

    if (!map.has(naturalKey)) {
      map.set(naturalKey, c);
    } else {
      const existing = map.get(naturalKey);
      const isExistingActive = (existing.status === 'IN_USE' || existing.status === 'ISSUED_ACTIVE' || existing.status === 'ACTIVE') && existing.is_active_in_field === true;
      const isCurrentActive = (c.status === 'IN_USE' || c.status === 'ISSUED_ACTIVE' || c.status === 'ACTIVE') && c.is_active_in_field === true;

      if (!isExistingActive && isCurrentActive) {
        map.set(naturalKey, c);
      } else if (!isExistingActive && !isCurrentActive) {
        const statusRank = {
          'PENDING_ISSUE': 1,
          'PENDING_PRINT': 2,
          'DISPATCHED_PENDING_RECEIPT': 3,
          'DISPATCHED': 3,
          'SUPERSEDED_PENDING_RECALL': 4,
          'RECALLED_PENDING_DESTRUCTION': 5,
          'DESTROYED': 6
        };
        const rankExisting = statusRank[existing.status] || 0;
        const rankCurrent = statusRank[c.status] || 0;
        if (rankCurrent > rankExisting) {
          map.set(naturalKey, c);
        }
      }
    }
  }

  return Array.from(map.values());
};

/**
 * Sanitizes state / mock data for controlled copies:
 * - Purges corrupted phantom records (e.g. duplicate QM-QC-01 Rev.00 Copy 01)
 * - Ensures newly approved Rev.01 with unverified receipt does NOT claim receipt on 2026-10-06
 */
export const sanitizeControlledCopies = (copies = []) => {
  if (!Array.isArray(copies)) return [];
  
  // Detect if a newer revision of QM-QC-01 exists among the copies
  const hasQmQc01Rev01Plus = copies.some(c => {
    if (!c) return false;
    const docCode = String(c.doc_code || c.document_code || c.docCode || c.docNo || c.title || '').trim().toUpperCase();
    const rev = String(c.rev || c.revision || c.doc_version || '00').replace(/^rev\.?/i, '').trim();
    return docCode === 'QM-QC-01' && (rev === '01' || parseInt(rev, 10) >= 1);
  });

  const cleaned = copies.map(c => {
    if (!c) return c;
    const docCode = String(c.doc_code || c.document_code || c.docCode || c.docNo || c.title || '').trim().toUpperCase();
    const rev = String(c.rev || c.revision || c.doc_version || '00').replace(/^rev\.?/i, '').trim();

    // Specific sanitization for QM-QC-01
    if (docCode === 'QM-QC-01') {
      if (rev === '00' && hasQmQc01Rev01Plus) {
        return {
          ...c,
          status: 'PENDING_RECALL',
          is_superseded: true,
          is_active_in_field: false
        };
      }
      if (rev === '01') {
        const receiptDate = String(c.receipt_confirmed_at || c.received_at || '');
        if (receiptDate.includes('2026-10-06') || (!c.received_by && (c.status === 'ISSUED_ACTIVE' || c.status === 'IN_USE'))) {
          return {
            ...c,
            status: 'PENDING_ISSUE',
            received_by: null,
            received_at: null,
            receipt_confirmed_at: null,
            receipt_confirmed_by: null,
            receipt_confirmed_by_id: null,
            is_active_in_field: false
          };
        }
      }
    }
    return c;
  });

  return deduplicateControlledCopies(cleaned);
};


/**
 * Resolves recipient department for a controlled copy or receipt task.
 * Strict ISO 9001 Invariant:
 * 1. Physical station / location (e.g. 'EN Office (Master)') determines recipient department.
 * 2. NEVER falls back to docOwnerDept ('PD').
 */
export const resolveReceiptTaskDepartment = (copyOrTask, matchedCopy = null) => {
  if (!copyOrTask) return 'QC';

  const normalizeDeptResult = (d) => {
    if (!d) return 'QC';
    const str = String(d).trim().toUpperCase();
    if (str === 'QA') {
      return 'QA';
    }
    if (str === 'QA/QC' || str === 'QAQC' || str === 'QC' || str.startsWith('QA/QC') || str.startsWith('QC') || str.includes('ประกันและควบคุมคุณภาพ')) {
      return 'QC';
    }
    if (str === 'DCC' || str === 'DC') {
      return 'DC';
    }
    if (str === 'GA' || str === 'HR&GA') {
      return 'HR';
    }
    return d;
  };

  // 1. Explicit target/recipient department fields (Highest Priority)
  const explicitTargetDept = 
    copyOrTask.target_department || 
    copyOrTask.targetDepartment || 
    copyOrTask.recipientDepartment || 
    copyOrTask.recipient_department || 
    copyOrTask.destinationDept || 
    copyOrTask.destination_dept ||
    copyOrTask.holder_dept ||
    copyOrTask.holderDept ||
    matchedCopy?.targetDepartment || 
    matchedCopy?.target_department || 
    matchedCopy?.recipientDepartment || 
    matchedCopy?.recipient_department || 
    matchedCopy?.destinationDept || 
    matchedCopy?.destination_dept ||
    matchedCopy?.holder_dept ||
    matchedCopy?.holderDept;

  if (explicitTargetDept && explicitTargetDept !== 'DCC' && explicitTargetDept !== 'DC') {
    return normalizeDeptResult(explicitTargetDept);
  }

  // 2. Check station or location
  const loc = 
    matchedCopy?.station_id || 
    matchedCopy?.locationId || 
    matchedCopy?.location || 
    matchedCopy?.locationName || 
    matchedCopy?.location_name ||
    copyOrTask.station_id ||
    copyOrTask.locationId ||
    copyOrTask.location || 
    copyOrTask.locationName || 
    copyOrTask.location_name || '';

  const foundStation = STANDARD_STATIONS.find(s => 
    s.id === loc || 
    s.name === loc || 
    (loc && typeof loc === 'string' && (loc.includes(s.name) || (s.name && s.name.includes(loc))))
  );

  if (foundStation?.departmentId) {
    return normalizeDeptResult(foundStation.departmentId);
  }

  if (typeof loc === 'string') {
    if (loc.includes('EN Office') || loc.includes('EN-') || loc.includes('(EN)')) return 'EN';
    if (loc.includes('WH Office') || loc.includes('WH-') || loc.includes('(WH)') || loc.includes('คลังสินค้า')) return 'WH';
    if (loc.includes('QC Lab') || loc.includes('QA/QC') || loc.includes('QA Office') || loc.includes('ห้องแล็บ') || loc.includes('ประกันและควบคุมคุณภาพ')) return 'QC';
    if (loc.includes('PD') || loc.includes('Production') || loc.includes('ผลิต')) return 'PD';
  }

  // 3. Check document code or title prefix
  const code = copyOrTask.doc_code || copyOrTask.docCode || copyOrTask.code || copyOrTask.title || matchedCopy?.doc_code || matchedCopy?.docCode || '';
  if (typeof code === 'string') {
    if (code.includes('-QA-') || code.startsWith('WI-QA') || code.startsWith('SOP-QA')) return 'QC';
    if (code.includes('-QC-') || code.startsWith('WI-QC') || code.startsWith('SOP-QC')) return 'QC';
    if (code.includes('-PD-') || code.startsWith('SOP-PD') || code.startsWith('WI-PD')) return 'PD';
    if (code.includes('-WH-') || code.startsWith('SOP-WH') || code.startsWith('WI-WH')) return 'WH';
    if (code.includes('-EN-') || code.startsWith('SOP-EN') || code.startsWith('WI-EN')) return 'EN';
  }

  // 4. Fallback to copy department or task department if valid and non-DCC
  const fallbackDept = 
    copyOrTask.department || 
    copyOrTask.departmentId || 
    copyOrTask.dept_code || 
    copyOrTask.deptCode || 
    copyOrTask.dept || 
    matchedCopy?.department || 
    matchedCopy?.departmentId || 
    matchedCopy?.dept_code || 
    matchedCopy?.deptCode;

  if (fallbackDept && fallbackDept !== 'DCC' && fallbackDept !== 'DC') {
    return normalizeDeptResult(fallbackDept);
  }

  return 'QC';
};

export const cleanupDccTasks = (tasks, instances, documents, dars = []) => {
  const safeInstances = instances || [];
  const safeDocs = documents || [];
  const safeDars = dars || [];

  const hasPendingDist = safeInstances.some(i => 
    i.status === 'PENDING_ISSUE' || 
    i.status === 'PENDING_PRINT' ||
    i.status === 'PENDING_DISPATCH'
  );

  return (tasks || []).map(t => {
    if (!t) return t;
    let updated = t;
    if (
      t.target_department === 'DCC' ||
      t.targetDepartment === 'DCC' ||
      t.department === 'DCC' ||
      t.dept === 'DCC' ||
      t.assignedToDept === 'DCC' ||
      t.destinationDept === 'DCC' ||
      t.currentHandlerDepartment === 'DCC'
    ) {
      updated = {
        ...updated,
        target_department: updated.target_department === 'DCC' ? 'DC' : updated.target_department,
        targetDepartment: updated.targetDepartment === 'DCC' ? 'DC' : updated.targetDepartment,
        department: updated.department === 'DCC' ? 'DC' : updated.department,
        dept: updated.dept === 'DCC' ? 'DC' : updated.dept,
        assignedToDept: updated.assignedToDept === 'DCC' ? 'DC' : updated.assignedToDept,
        destinationDept: updated.destinationDept === 'DCC' ? 'DC' : updated.destinationDept,
        currentHandlerDepartment: updated.currentHandlerDepartment === 'DCC' ? 'DC' : updated.currentHandlerDepartment
      };
    }

    // Ensure task has clear origin distinction (INTERNAL vs EXTERNAL)
    let origin = updated.origin;
    if (!origin) {
      if (
        updated.referenceType === 'EXTERNAL_DOC' ||
        (updated.type && String(updated.type).startsWith('EXT_')) ||
        (updated.taskType && String(updated.taskType).startsWith('EXT_')) ||
        updated.extAction ||
        updated.is_external ||
        updated.isExternal ||
        String(updated.doc_code || updated.docCode || '').startsWith('ED-') ||
        (updated.title && (updated.title.includes('เอกสารภายนอก') || updated.title.includes('External Doc')))
      ) {
        origin = 'EXTERNAL';
      } else {
        origin = 'INTERNAL';
      }
    }
    updated = { ...updated, origin };

    // Populate missing docTitle/docName and sanitize docCode (preventing Thai titles in docCode)
    const isThaiCode = typeof (updated.doc_code || updated.docCode || updated.docNo) === 'string' && /[\u0E00-\u0E7F]/.test(updated.doc_code || updated.docCode || updated.docNo);
    if (!updated.docName || !updated.docTitle || updated.docTitle === updated.doc_code || isThaiCode) {
      const docCode = updated.doc_code || updated.docCode || updated.document_code || updated.docNo;
      const docId = updated.docId || updated.doc_id;
      const matchedDar = safeDars.find(d => String(d.id) === String(updated.darId));
      const matchedInst = safeInstances.find(i => String(i.id) === String(updated.copyId || updated.copy_id));
      const refDocId = docId || matchedDar?.docIdRef || matchedDar?.docId;
      const matchedDoc = safeDocs.find(d => 
        (refDocId && String(d.id) === String(refDocId)) ||
        (docCode && !/[\u0E00-\u0E7F]/.test(docCode) && (d.title === docCode || d.document_code === docCode || d.code === docCode))
      );

      const officialName = 
        matchedDoc?.name || 
        matchedDoc?.document_name || 
        matchedDar?.name || 
        matchedDar?.document_name || 
        matchedInst?.docName || 
        matchedInst?.name ||
        (matchedDar?.title && !matchedDar.title.startsWith('DAR-') ? matchedDar.title : null);

      const validDocCode = resolveDarDocumentCode(matchedDar, safeDocs) ||
        (matchedDoc?.document_code || matchedDoc?.code || (!/[\u0E00-\u0E7F]/.test(matchedDoc?.title || '') ? matchedDoc?.title : null)) ||
        (!isThaiCode ? docCode : null);

      if (officialName || validDocCode) {
        updated = {
          ...updated,
          ...(officialName ? { docTitle: officialName, docName: officialName } : {}),
          ...(validDocCode ? { 
            docCode: validDocCode, 
            doc_code: validDocCode, 
            docNo: validDocCode, 
            documentCode: validDocCode 
          } : {})
        };
      }
    }

    // Contextual Revision Scoping Data Alignment:
    // Ensure task holds explicit sourceRevision and targetRevision from DAR or Document if not already set
    if (updated.darId) {
      const matchedDar = safeDars.find(d => String(d.id) === String(updated.darId));
      if (matchedDar) {
        const darSourceRev = matchedDar.sourceRevision || matchedDar.revisesRev || matchedDar.previousRev || (matchedDar.type === 'REVISION' ? (safeDocs.find(d => String(d.id) === String(matchedDar.docIdRef || matchedDar.docId))?.rev || '00') : null);
        const darTargetRev = matchedDar.targetRevision || matchedDar.rev || matchedDar.targetRev || matchedDar.proposedRev;
        if (!updated.sourceRevision && darSourceRev) {
          updated.sourceRevision = darSourceRev;
        }
        if (!updated.targetRevision && darTargetRev) {
          updated.targetRevision = darTargetRev;
        }
      }
    }

    // Strict Task Department Scoping:
    // Enforce that task.department is ALWAYS bound to the document or DAR owner department, NEVER the assignee's department!
    const effectiveDocCode = updated.doc_code || updated.docCode || updated.document_code || updated.title || '';
    const effectiveDocId = updated.docId || updated.doc_id;
    const taskDar = safeDars.find(d => String(d.id) === String(updated.darId));
    const taskDoc = safeDocs.find(d => 
      (effectiveDocId && String(d.id) === String(effectiveDocId)) ||
      (effectiveDocCode && (d.title === effectiveDocCode || d.document_code === effectiveDocCode || d.code === effectiveDocCode))
    );
    let ownerDept = taskDar?.department || taskDoc?.department;
    if (!ownerDept) {
      if (String(effectiveDocCode).includes('-PD-') || String(updated.title).includes('-PD-') || String(updated.darId).includes('-PD-')) {
        ownerDept = 'PD';
      }
    }

    const isDccTask = isDccExclusiveTask(updated) || isDccOperationalTask(updated);
    const isReceipt = isReceiptTask(updated);

    if (isDccTask) {
      updated = {
        ...updated,
        department: 'DC',
        target_department: 'DC',
        targetDepartment: 'DC',
        targetRole: 'DCC_ADMIN',
        target_role: 'DCC_ADMIN',
        assignedToRole: 'DCC_ADMIN'
      };
    } else if (isReceipt) {
      // 🛡️ Phase 1: Controlled Copy Receipt Task MUST be routed strictly to recipient department, NEVER ownerDept
      const targetCopyId = String(updated.copy_id || updated.copyId || updated.instanceId || '');
      const matchedCopy = safeInstances.find(i => String(i.id) === targetCopyId);
      const cleanRecipientDept = resolveReceiptTaskDepartment(updated, matchedCopy);

      updated = {
        ...updated,
        department: cleanRecipientDept,
        departmentName: cleanRecipientDept === 'QC' ? 'ฝ่ายประกันและควบคุมคุณภาพ' : (updated.departmentName || cleanRecipientDept),
        target_department: cleanRecipientDept,
        targetDepartment: cleanRecipientDept,
        destinationDept: cleanRecipientDept,
        destination_dept: cleanRecipientDept,
        recipientDepartment: cleanRecipientDept,
        recipient_department: cleanRecipientDept,
        currentHandlerDepartment: cleanRecipientDept,
        assignedToDept: cleanRecipientDept,
        dept_code: cleanRecipientDept
      };
    } else if (ownerDept) {
      const cleanDept = ownerDept === 'DCC' ? 'DC' : ownerDept;
      updated = {
        ...updated,
        department: cleanDept,
        target_department: cleanDept,
        owner_dept: cleanDept,
        currentHandlerDepartment: cleanDept
      };
    }

    // Auto-Sanitize QA/QC residue on any task
    const rawDeptStr = String(updated.department || '');
    if (rawDeptStr === 'QA/QC' || rawDeptStr === 'QAQC' || rawDeptStr.includes('QA/QC') || rawDeptStr.includes('ประกันและควบคุมคุณภาพ')) {
      updated.department = 'QC';
      updated.departmentName = 'ฝ่ายประกันและควบคุมคุณภาพ';
      if (updated.target_department === 'QA/QC' || updated.target_department === 'QA') updated.target_department = 'QC';
      if (updated.targetDepartment === 'QA/QC') updated.targetDepartment = 'QC';
      if (updated.destinationDept === 'QA/QC') updated.destinationDept = 'QC';
      if (updated.assignedToDept === 'QA/QC') updated.assignedToDept = 'QC';
    }

    return updated;
  }).filter(t => {
    // 1. Immediately drop tasks already completed/resolved (except active DISPATCHED_TRACKING or damaged recall tasks for DCC)
    if (t.status === 'COMPLETED' || t.status === 'RESOLVED' || t.is_completed === true) {
      if (t.delivery_status === 'DISPATCHED_TRACKING' || (t.type === 'DCC_RECALL' && (t.isDamaged || t.copyId || t.copy_id))) return true;
      return false;
    }

    // 2. Distribution Tasks (DCC_DISTRIBUTE, DCC_ISSUE, DISTRIBUTION)
    if (t.type === 'DCC_DISTRIBUTE' || t.type === 'DCC_ISSUE' || t.taskType === 'DCC_DISTRIBUTE' || t.taskType === 'DISTRIBUTION' || t.task_type === 'DISTRIBUTION') {
      if (t.delivery_status === 'DISPATCHED_TRACKING') return true;
      const targetRev = t.targetRevision || t.revision || t.doc_version || t.rev;
      const targetDocCode = t.doc_code || t.docTitle || t.document_code;
      const targetDocId = String(t.docId || t.doc_id || '');

      // Strict Decoupling: check if ANY copy of this document and this revision is in pending issue/print/dispatch
      const hasMatchingCopiesPendingIssue = safeInstances.some(i => {
        const isDocMatch = 
          (targetDocId && String(i.doc_id || i.docId) === targetDocId) ||
          (targetDocCode && (i.doc_code === targetDocCode || i.docTitle === targetDocCode || i.document_code === targetDocCode)) ||
          (t.darId && (String(i.darId || i.superseded_by_dar) === String(t.darId)));

        const isRevMatch = !targetRev || targetRev === 'ALL' || (i.rev === targetRev || i.doc_version === targetRev || i.revision === targetRev);

        const isPendingDist = i.status === 'PENDING_ISSUE' || i.status === 'PENDING_PRINT' || i.status === 'PENDING_DISPATCH';

        return isDocMatch && isRevMatch && isPendingDist;
      });

      if (targetDocId || targetDocCode || t.darId) {
        return hasMatchingCopiesPendingIssue;
      }
      return hasPendingDist;
    }

    // 3. Recall Tasks (DCC_RECALL, DCC_RECALL_WITH_CHECKLIST, RECALL, OBSOLETE_RECALL, RECALL_HARDCOPY)
    if (
      t.type === 'DCC_RECALL' || 
      t.type === 'DCC_RECALL_WITH_CHECKLIST' || 
      t.taskType === 'DCC_RECALL_WITH_CHECKLIST' || 
      t.type === 'RECALL' || 
      t.type === 'OBSOLETE_RECALL' ||
      t.type === 'RECALL_HARDCOPY' ||
      t.taskType === 'RECALL' ||
      t.task_type === 'RECALL'
    ) {
      const targetDocId = String(t.docId || t.doc_id || '');
      let targetDocCode = t.doc_code || t.docTitle || t.document_code || '';
      let targetRev = t.targetRevision || t.doc_version || t.rev || t.revision || '';

      // If not set directly on task, try extracting from title (e.g. "Obsolete: SOP-QA-003" or "Rev.00")
      if (!targetDocCode && t.title) {
        const matchObs = t.title.match(/Obsolete:\s*([A-Za-z0-9\-_]+)/i);
        if (matchObs) targetDocCode = matchObs[1].trim();
      }
      if (!targetRev && t.title) {
        const matchRev = t.title.match(/Rev\.?([0-9]+)/i);
        if (matchRev) targetRev = matchRev[1].trim();
      }

      // If darId is set, find DAR
      if (t.darId) {
        const dar = safeDars.find(d => String(d.id) === String(t.darId) || d.dar_no === t.darId);
        if (dar) {
          if (!targetDocCode) targetDocCode = dar.docIdRef || dar.docCode || dar.doc_code || dar.title;
        }
      }

      // Check matching master document status
      const matchingDoc = safeDocs.find(d => 
        (targetDocId && String(d.id) === targetDocId) ||
        (targetDocCode && (d.title === targetDocCode || d.name === targetDocCode || d.code === targetDocCode || d.document_code === targetDocCode))
      );

      // If task specifically targeted supersededCopyIds
      if (t.supersededCopyIds && Array.isArray(t.supersededCopyIds) && t.supersededCopyIds.length > 0) {
        const hasUnresolvedTargetCopies = safeInstances.some(i => 
          t.supersededCopyIds.includes(i.id) &&
          (i.status === 'SUPERSEDED_PENDING_RECALL' || i.status === 'PENDING_RECALL' || i.status === 'DAMAGED_PENDING_RECALL' || i.status === 'RECALLED' || i.status === 'OBSOLETE_PENDING_RECALL' || i.status === 'DAMAGED_PENDING_REPLACEMENT')
        );
        return hasUnresolvedTargetCopies;
      }

      // Find relevant copies for this recall task
      const relevantCopies = safeInstances.filter(i => {
        const isDocMatch = 
          (targetDocId && String(i.doc_id || i.docId) === targetDocId) ||
          (targetDocCode && (i.doc_code === targetDocCode || i.docTitle === targetDocCode || i.document_code === targetDocCode)) ||
          (matchingDoc && (String(i.doc_id || i.docId) === String(matchingDoc.id) || i.doc_code === matchingDoc.title || i.docTitle === matchingDoc.title));
        
        if (!isDocMatch) return false;

        // If specific revision was specified, match revision
        if (targetRev && targetRev !== 'ALL' && (i.rev || i.doc_version || i.revision)) {
          const copyRev = i.rev || i.doc_version || i.revision;
          if (copyRev !== targetRev && copyRev !== `0${targetRev}` && `0${copyRev}` !== targetRev) {
            return false;
          }
        }
        return true;
      });

      // If task is already completed, preserve it
      if (t.is_completed || t.status === 'COMPLETED') {
        return true;
      }

      // If task is specifically tied to a single copy (e.g. damaged copy recall)
      if (t.copyId || t.instanceId || t.copy_id || t.isDamaged || t.is_damaged) {
        const targetCopyId = String(t.copyId || t.instanceId || t.copy_id || '');
        const copy = targetCopyId ? safeInstances.find(i => String(i.id) === targetCopyId) : null;
        if (copy) {
          // Never drop recall task for damaged copy until copy is destroyed or archived
          const isNotYetDestroyed = copy.status !== 'DESTROYED' && copy.status !== 'RECALLED_DESTROYED' && copy.status !== 'ARCHIVED_OBSOLETE' && copy.status !== 'LOST' && copy.status !== 'LOST_RECORDED' && copy.status !== 'LOST_VOIDED' && copy.status !== 'DISPOSED_LOST';
          if ((copy.isDamaged || copy.is_damaged || t.isDamaged || t.is_damaged) && isNotYetDestroyed) {
            return true;
          }
          return copy.status === 'SUPERSEDED_PENDING_RECALL' || copy.status === 'PENDING_RECALL' || copy.status === 'DAMAGED_PENDING_RECALL' || copy.status === 'RECALLED' || copy.status === 'DAMAGED_PENDING_REPLACEMENT';
        }
        if (t.isDamaged || t.is_damaged) return true;
      }

      if (relevantCopies.length === 0) {
        // If no copies exist at all for this doc, check if global has any pending recalls
        return safeInstances.some(i => i.status === 'SUPERSEDED_PENDING_RECALL' || i.status === 'PENDING_RECALL' || i.status === 'DAMAGED_PENDING_RECALL' || i.status === 'RECALLED' || i.status === 'OBSOLETE_PENDING_RECALL' || i.status === 'DAMAGED_PENDING_REPLACEMENT');
      }

      // If ANY copy is still SUPERSEDED_PENDING_RECALL, PENDING_RECALL, DAMAGED_PENDING_RECALL, RECALLED, or OBSOLETE_PENDING_RECALL, or active under obsolete/superseded document, keep the task!
      const hasUnrecalledCopy = relevantCopies.some(i => 
        i.status === 'SUPERSEDED_PENDING_RECALL' ||
        i.status === 'PENDING_RECALL' ||
        i.status === 'DAMAGED_PENDING_RECALL' ||
        i.status === 'RECALLED' ||
        i.status === 'OBSOLETE_PENDING_RECALL' ||
        i.status === 'DAMAGED_PENDING_REPLACEMENT' ||
        (matchingDoc && (matchingDoc.status === 'SUPERSEDED' || matchingDoc.status === 'SUPERSEDED_ARCHIVED' || matchingDoc.status === 'OBSOLETE' || matchingDoc.status === 'OBSOLETE_ARCHIVED') && (i.status === 'ACTIVE' || i.status === 'ISSUED_ACTIVE' || i.status === 'RECEIVED'))
      );

      return hasUnrecalledCopy;
    }

    // 4. Replacement Tasks (DCC_REPLACEMENT)
    if (t.type === 'DCC_REPLACEMENT') {
      if (t.requestId) {
        const inst = safeInstances.find(i => String(i.id) === String(t.requestId));
        if (inst) return inst.status === 'REPLACEMENT_REQUESTED';
      }
      return safeInstances.some(i => i.status === 'REPLACEMENT_REQUESTED');
    }

    // 5. Hardcopy Receipt Confirmation Tasks (DEPT_CONFIRM_HARDCOPY_RECEIPT, CONFIRM_RECEIPT)
    if (
      t.type === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' || 
      t.taskType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' || 
      t.type === 'CONFIRM_RECEIPT' ||
      t.task_type === 'CONFIRM_RECEIPT'
    ) {
      const targetCopyId = String(t.copy_id || t.copyId || t.instanceId);
      const inst = safeInstances.find(i => String(i.id) === targetCopyId);
      if (inst && (inst.status === 'ISSUED_ACTIVE' || inst.status === 'ACTIVE' || inst.receipt_confirmed_at)) {
        return false; // Loop guard eliminates completed receipt tasks
      }
      return true;
    }

    return true;
  });
};

export const reconcileAndResolveTasks = (tasks, instances, documents, dars = []) => {
  return cleanupDccTasks(tasks, instances, documents, dars);
};

/**
 * Creates a receipt task for a controlled copy instance.
 * Strict Invariants:
 * 1. task.department is ALWAYS bound to the recipient department (copy.department or copy.targetDepartment), NEVER docOwnerDept (PD).
 * 2. Assignee is strictly restricted to Level 1-5 personnel. Level 6+ executives (GM, QMR, PM) are excluded.
 */
export const createReceiptTask = (copy, relatedDoc = null, relatedDar = null, masterUsers = MASTER_DATA_USER) => {
  if (!copy) return null;
  const targetId = String(copy.id || '');
  const destinationDept = resolveReceiptTaskDepartment(copy, copy);

  let requesterId = null;
  let requesterName = null;

  // L1-L5 only: never assign to Level 6+
  if (copy.requester_id || copy.requesterId || copy.holderId) {
    const candidateId = copy.requester_id || copy.requesterId || copy.holderId;
    const candidateUser = (masterUsers || []).find(u => u.id === candidateId || u.empId === candidateId);
    if (candidateUser && userMatchesDepartment(candidateUser, destinationDept) && isLevel1To5(candidateUser)) {
      requesterId = candidateUser.id;
      requesterName = candidateUser.name;
    }
  }

  if (!requesterId && relatedDar) {
    const darReqId = relatedDar.requester_id || relatedDar.requesterId || relatedDar.userId || relatedDar.requester?.id || relatedDar.created_by || relatedDar.createdBy;
    const darReqUser = (masterUsers || []).find(u => u.id === darReqId || u.empId === darReqId);
    if (darReqUser && userMatchesDepartment(darReqUser, destinationDept) && isLevel1To5(darReqUser)) {
      requesterId = darReqId;
      requesterName = darReqUser.name || relatedDar.requester_name || relatedDar.requesterName || relatedDar.requester;
    }
  }

  if (!requesterId) {
    const deptUsers = (masterUsers || []).filter(u => userMatchesDepartment(u, destinationDept) && isLevel1To5(u));
    const nonDccDeptUsers = deptUsers.filter(u => !u.isDcc && u.role !== 'DCC_ADMIN');
    const candidatePool = nonDccDeptUsers.length > 0 ? nonDccDeptUsers : deptUsers;

    const primaryDeptUsers = candidatePool.filter(u => isSameDepartment(u.primary_department || u.department || u.dept, destinationDept));
    const finalCandidates = primaryDeptUsers.length > 0 ? primaryDeptUsers : candidatePool;

    const supervisorUser = finalCandidates.find(u => u.level === 5 || u.level === 4 || u.role === 'DEPT_ADMIN' || u.role === 'SUPERVISOR') || finalCandidates[0];
    if (supervisorUser) {
      requesterId = supervisorUser.id;
      requesterName = supervisorUser.name;
    } else {
      requesterId = null;
      requesterName = `${destinationDept} Controller`;
    }
  }

  const docOfficialTitle = copy.docName || copy.name || copy.documentName || relatedDoc?.name || relatedDoc?.document_name || relatedDar?.name || copy.doc_code || copy.docTitle || 'เอกสารควบคุม';
  const docCode = copy.doc_code || copy.docTitle || copy.title || relatedDoc?.title || '';
  const dispatchedAt = new Date().toISOString();

  return {
    id: `task-receipt-${targetId}-${Date.now()}`,
    type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
    taskType: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
    task_type: 'CONFIRM_RECEIPT',
    category: 'RECEIPT',
    title: `ตรวจรับเอกสารควบคุมฉบับพิมพ์: ${docOfficialTitle} (${docCode}) (Copy ${copy.copy_no || copy.ccNumber || '01'})`,
    description: `กรุณาตรวจสอบเอกสารฉบับพิมพ์จริงที่จุดใช้งาน ${copy.location || copy.locationName || destinationDept} (${destinationDept}) และยืนยันการรับเอกสาร`,
    copy_id: targetId,
    copyId: targetId,
    instanceId: targetId,
    doc_id: String(copy.doc_id || copy.docId || relatedDoc?.id || relatedDar?.id || ''),
    darId: relatedDar ? String(relatedDar.id) : (copy.dar_id || String(relatedDoc?.id || '')),
    doc_code: docCode,
    docCode: docCode,
    docTitle: docOfficialTitle,
    docName: docOfficialTitle,
    doc_version: copy.doc_version || copy.rev || '01',
    copy_no: copy.copy_no || copy.ccNumber || '01',
    location: copy.location || copy.locationName || destinationDept || '',
    location_name: copy.location || copy.locationName || destinationDept || '',
    target_department: destinationDept,
    targetDepartment: destinationDept,
    recipientDepartment: destinationDept,
    recipient_department: destinationDept,
    destinationDept: destinationDept,
    destination_dept: destinationDept,
    department: destinationDept,
    departmentName: destinationDept === 'QC' ? 'ฝ่ายประกันและควบคุมคุณภาพ' : (copy.departmentName || destinationDept),
    dept_code: destinationDept,
    currentHandlerDepartment: destinationDept,
    isDepartmentPool: true,
    isSharedTask: true,
    shared_pool: true,
    is_shared_task: true,
    assignee_id: requesterId,
    assigneeId: requesterId,
    assignee_name: requesterName,
    assigneeName: requesterName,
    assignee_dept: destinationDept,
    assignedToDept: destinationDept,
    assignedToRole: 'DEPARTMENT_CONTROLLER',
    origin: (
      copy.is_external ||
      copy.isExternal ||
      copy.doc_type === 'ED' ||
      copy.doc_type === 'EXTERNAL' ||
      copy.docType === 'ED' ||
      copy.docType === 'EXTERNAL' ||
      String(docCode).startsWith('ED-') ||
      Boolean(copy.external_doc_id || copy.externalDocId)
    ) ? 'EXTERNAL' : 'INTERNAL',
    status: 'PENDING',
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    createdAt: dispatchedAt,
    priority: 'HIGH'
  };
};


/**
 * Deduplicates and returns only genuine active physical copies for a given document.
 * Filters out retired, destroyed, voided, or superseded copies, and deduplicates by copy number.
 * Ensures the physical copy count and sequential numbering reflect reality.
 */
export const getActivePhysicalCopies = (copies = [], doc = null) => {
  if (!doc) return [];
  const docId = String(doc.id || '');
  const docCode = String(doc.code || doc.edCode || doc.doc_code || doc.docCode || doc.docNo || doc.document_code || doc.title || '');
  const docTitle = String(doc.title || '');

  // 1. Raw matches by doc id or title/code, plus embedded distributionList/controlledCopies on external docs
  const instanceMatches = (copies || []).filter(c => {
    if (!c) return false;
    const cDocId = String(c.doc_id || c.docId || c.documentId || c.external_doc_id || c.externalDocId || '');
    const cDocCode = String(c.doc_code || c.docCode || c.document_code || c.documentCode || c.edCode || '');
    const cDocTitle = String(c.doc_title || c.docTitle || '');
    return (
      (docId && cDocId === docId) ||
      (docCode && (cDocCode === docCode || cDocTitle === docCode)) ||
      (docTitle && (cDocCode === docTitle || cDocTitle === docTitle))
    );
  });

  const embeddedList = [
    ...(Array.isArray(doc.distributionList) ? doc.distributionList : []),
    ...(Array.isArray(doc.controlledCopies) ? doc.controlledCopies : [])
  ].filter(c => c && (c.copyCode || c.copy_no || c.copyNo || c.ccNumber || c.copy_number || c.copyNumber));

  const rawMatches = [...instanceMatches, ...embeddedList];

  // 2. Filter out non-physical or decommissioned copies
  const inactiveStatuses = new Set([
    'RETIRED',
    'DESTROYED',
    'RECALLED_DESTROYED',
    'REPLACED_VOID',
    'VOID',
    'SUPERSEDED_ARCHIVED',
    'RECALLED',
    'LOST'
  ]);

  const physicalCandidates = rawMatches.filter(c => {
    const status = (c.status || '').toUpperCase();
    return !inactiveStatuses.has(status);
  });

  // Helper to extract numeric copy number (handles -C01, CC-001, Copy 01, and numeric strings)
  const getCopyNumberInt = (c) => {
    if (typeof c.copy_number === 'number' && !isNaN(c.copy_number)) return c.copy_number;
    if (typeof c.copyNumber === 'number' && !isNaN(c.copyNumber)) return c.copyNumber;
    const codeStr = String(c.copyCode || c.copy_code || c.copy_no || c.copyNo || c.ccNumber || '');
    const cMatch = codeStr.match(/-C(\d+)$/i) || codeStr.match(/^CC-(\d+)$/i) || codeStr.match(/^Copy\s*(\d+)$/i);
    if (cMatch) return parseInt(cMatch[1], 10) || 0;
    const raw = c.copy_number ?? c.copyNumber ?? c.copy_no ?? c.copyNo ?? (c.ccNumber ? String(c.ccNumber).replace(/\D/g, '') : null) ?? c.copy_id;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 0 : parsed;
  };

  // 3. Deduplicate by unique copy number
  const deduplicated = physicalCandidates.reduce((acc, current) => {
    const copyNum = getCopyNumberInt(current);
    const existingIndex = acc.findIndex(item => getCopyNumberInt(item) === copyNum);
    if (existingIndex === -1) {
      acc.push(current);
    } else {
      // If a duplicate copy number is found, prioritize the active/issued instance over a pending or unconfirmed one
      const existing = acc[existingIndex];
      const isCurrentActive = current.status === 'ISSUED_ACTIVE' || current.status === 'ACTIVE';
      const isExistingActive = existing.status === 'ISSUED_ACTIVE' || existing.status === 'ACTIVE';
      if (isCurrentActive && !isExistingActive) {
        acc[existingIndex] = { ...existing, ...current };
      }
    }
    return acc;
  }, []);

  // Sort ascending by copy number
  return deduplicated.sort((a, b) => getCopyNumberInt(a) - getCopyNumberInt(b));
};

// ================= STORE ================= //

export const createControlledCopySlice = (set, get) => ({
  // State
  copyRequests: [],
  documentControlledCopies: [],
  controlledCopies: [],
  controlledCopyInstances: [],
  controlledCopyAuditTrail: [],
  copyDispositionRecords: [],
  dispositionHistory: [],

  // Convenience Aliases (Backward Compatibility)
  requestAdditionalCopy: (...args) => get().requestAdditionalControlledCopies(...args),
  confirmControlledCopyReceipt: (...args) => get().confirmHardcopyReceipt(...args),
  markCopyDamagedOrLost: (...args) => get().reportCcDamagedLost(...args),
  replaceControlledCopy: (...args) => get().approveCcReplacement(...args),
  trackControlledCopyPrint: (copyId) => get().markCopyPrinted(copyId),

  // Print Tracking
  // API mode: the server does not record printing; the guard before dispatch uses this browser's flag.
  markCopyPrinted: (copyId) => isApiMode ? set((state) => {
    const mark = (list) => (list || []).map((c) => (String(c.id) === String(copyId) ? { ...c, is_printed: true } : c));
    return { controlledCopyInstances: mark(state.controlledCopyInstances), documentControlledCopies: mark(state.documentControlledCopies) };
  }) : set(state => {
    const now = new Date().toISOString();
    let targetCopy = null;

    const updateCopy = (c) => {
      if (c && c.id === copyId) {
        targetCopy = c;
        const currentCount = typeof c.print_count === 'number' ? c.print_count : 0;
        return {
          ...c,
          is_printed: true,
          printed_at: now,
          print_count: currentCount + 1
        };
      }
      return c;
    };

    const newInstances = (state.controlledCopyInstances || []).map(updateCopy);
    const newDocCopies = (state.documentControlledCopies || []).map(updateCopy);
    const newCopies = (state.controlledCopies || []).map(updateCopy);

    const auditEntry = {
      id: "audit-print-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      action: "PRINT_COPY",
      copyId: copyId,
      docCode: targetCopy?.document_code || targetCopy?.docCode || "",
      copyNo: targetCopy?.copy_no || targetCopy?.copyNo || "",
      actor: state.currentUser?.name || "System",
      actorId: state.currentUser?.id || "SYSTEM",
      timestamp: now,
      note: "พิมพ์สำเนาควบคุม ครั้งที่ " + ((targetCopy?.print_count || 0) + 1)
    };

    return {
      controlledCopyInstances: newInstances,
      documentControlledCopies: newDocCopies,
      controlledCopies: newCopies,
      controlledCopyAuditTrail: [auditEntry, ...(state.controlledCopyAuditTrail || [])]
    };
  }),

  // Copy Requests
  submitCopyRequest: (docId, reason, qty, dept) => set((state) => {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return state;

    const request = {
      id: `CR-${Date.now()}`,
      docId,
      docTitle: doc.title,
      requesterId: state.currentUser.id,
      department: dept,
      reason,
      qty,
      status: 'PENDING_MANAGER_APPROVAL',
      dateRequested: new Date().toISOString().split('T')[0]
    };

    const managerObj = state.masterUsers.find(u => u.department === state.currentUser.department && u.level > state.currentUser.level) ||
      state.masterUsers.find(u => u.level > state.currentUser.level);

    let newTasks = [...state.tasks];
    let newNotifications = [...state.notifications];

    if (managerObj) {
      const newTaskId = `t-${Date.now()}-cra`;
      const copyDept = doc.department || dept || state.currentUser.department || 'PD';
      newTasks.push({
        id: newTaskId,
        title: `อนุมัติเบิกสำเนาเพิ่มเติม (${doc.title})`,
        type: 'CC_REPLACEMENT_APPROVAL',
        assigneeId: managerObj.id,
        department: copyDept,
        target_department: copyDept,
        owner_dept: copyDept,
        status: 'PENDING',
        requestId: request.id
      });
      newNotifications.push({ id: Date.now() + Math.random(), userId: managerObj.id, title: 'อนุมัติเบิกสำเนา', message: `คำขอเบิกสำเนา ${doc.title} รอการอนุมัติ`, isRead: false, link: '/tasks', timestamp: new Date().toISOString(), relatedTaskId: newTaskId });
    } else {
      request.status = 'PENDING_DCC_DISTRIBUTION';
      const newTaskId = `t-${Date.now()}-ccd`;
      const dccAdminId = resolveDccAdminUserId(state.masterUsers);
      newTasks.push({
        id: newTaskId,
        title: `แจกจ่ายสำเนาเพิ่มเติม (${doc.title})`,
        type: 'DCC_REPLACEMENT',
        assigneeId: dccAdminId,
        department: 'DC',
        target_department: 'DC',
        owner_dept: 'DC',
        status: 'PENDING',
        requestId: request.id
      });
      newNotifications.push({ id: Date.now() + Math.random(), userId: dccAdminId, title: 'คำขอเบิกสำเนา', message: `มีคำขอเบิกสำเนา ${doc.title} ที่ผ่านการอนุมัติแล้ว`, isRead: false, link: '/tasks', timestamp: new Date().toISOString(), relatedTaskId: newTaskId });
    }

    return {
      copyRequests: [request, ...state.copyRequests],
      tasks: newTasks,
      notifications: newNotifications,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: `COPY_REQUEST_SUBMIT`,
        details: `Requested ${qty} copies of ${doc.title}`,
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        actorRole: state.currentUser.role || state.currentUser.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  approveCopyRequest: (taskId, action) => set((state) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return state;

    const request = state.copyRequests.find(r => r.id === task.requestId);
    if (!request) return state;

    const newTasks = state.tasks.filter(t => t.id !== taskId);
    let newNotifications = state.notifications.map(n => n.relatedTaskId === taskId ? { ...n, isRead: true } : n);
    let newCopyRequests = [...state.copyRequests];

    if (action === 'APPROVE') {
      const updatedReq = { ...request, status: 'PENDING_DCC_DISTRIBUTION' };
      newCopyRequests = newCopyRequests.map(r => r.id === request.id ? updatedReq : r);

      const newTaskId = `t-${Date.now()}-ccd`;
      const dccAdminId = resolveDccAdminUserId(state.masterUsers);
      newTasks.push({
        id: newTaskId,
        title: `แจกจ่ายสำเนาเพิ่มเติม (${request.docTitle})`,
        type: 'DCC_REPLACEMENT',
        assigneeId: dccAdminId,
        department: 'DC',
        target_department: 'DC',
        owner_dept: 'DC',
        status: 'PENDING',
        requestId: request.id
      });
      newNotifications.push({ id: Date.now() + Math.random(), userId: dccAdminId, title: 'คำขอเบิกสำเนา', message: `มีคำขอเบิกสำเนา ${request.docTitle} ที่ผ่านการอนุมัติแล้ว`, isRead: false, link: '/tasks', timestamp: new Date().toISOString(), relatedTaskId: newTaskId });
      newNotifications.push({ id: Date.now() + Math.random(), userId: request.requesterId, title: 'คำขอเบิกสำเนาได้รับการอนุมัติ', message: `คำขอเบิกสำเนา ${request.docTitle} ได้รับการอนุมัติแล้ว รอ DCC แจกจ่าย`, isRead: false, link: '/tasks', timestamp: new Date().toISOString() });
    } else {
      const updatedReq = { ...request, status: 'REJECTED' };
      newCopyRequests = newCopyRequests.map(r => r.id === request.id ? updatedReq : r);
      newNotifications.push({ id: Date.now() + Math.random(), userId: request.requesterId, title: 'คำขอเบิกสำเนาถูกปฏิเสธ', message: `คำขอเบิกสำเนา ${request.docTitle} ไม่ได้รับการอนุมัติ`, isRead: false, link: '/tasks', timestamp: new Date().toISOString() });
    }

    return {
      tasks: newTasks,
      notifications: newNotifications,
      copyRequests: newCopyRequests,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: `COPY_REQUEST_${action}`,
        details: `Processed Copy Request ${request.id} for ${request.docTitle}`,
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        actorRole: state.currentUser.role || state.currentUser.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  // Dispatch & Fulfillment
  createReceiptTask: (copy, relatedDoc, relatedDar) => {
    return createReceiptTask(copy, relatedDoc, relatedDar, get().masterUsers);
  },
  distributeCopies: (docIdOrCopyIds, copiesToDispatch) => {
    return get().dispatchControlledCopies(docIdOrCopyIds, copiesToDispatch);
  },
  dispatchControlledCopy: (copyId) => isApiMode ? apiCopies.stepCopy('dispatch', typeof copyId === 'object' ? (copyId?.copyId || copyId?.id) : copyId) : set((state) => {
    const targetId = String(typeof copyId === 'object' ? (copyId?.copyId || copyId?.id || '') : copyId);
    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies && state.documentControlledCopies.length > 0 ? state.documentControlledCopies : (state.controlledCopyInstances || []));
    const copy = copies.find(c => String(c.id) === targetId || (c.copyCode && String(c.copyCode) === targetId));
    if (!copy) return state;
    const resolvedCopyId = String(copy.id);

    const dispatchedAt = new Date().toISOString();
    const dispatchedBy = state.currentUser ? state.currentUser.name : 'DCC Admin';

    // 1. Resolve DAR & Doc details (Internal & External)
    const allDars = [...(state.dars || []), ...(state.darRequests || [])];
    const copyDocCode = copy.doc_code || copy.docCode || copy.documentCode || copy.docTitle || copy.title;
    const copyDocId = String(copy.doc_id || copy.docId || copy.documentId || copy.external_doc_id || copy.externalDocId || copy.dar_id || copy.darId || '');

    const relatedDar = allDars.find(d => 
      (copyDocId && String(d.id) === copyDocId) ||
      (copyDocCode && (d.title === copyDocCode || d.doc_code === copyDocCode || d.code === copyDocCode)) ||
      (copy.dar_id && String(d.id) === String(copy.dar_id))
    );

    const relatedInternalDoc = (state.documents || []).find(d => 
      String(d.id) === copyDocId || (copyDocCode && (d.title === copyDocCode || d.code === copyDocCode || d.doc_code === copyDocCode))
    );
    const relatedExternalDoc = (state.externalDocuments || []).find(d =>
      (String(d.id) === copyDocId || (copyDocCode && (d.code === copyDocCode || d.edCode === copyDocCode || d.doc_code === copyDocCode || d.docNo === copyDocCode || d.title === copyDocCode))) &&
      (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded
    ) || (state.externalDocuments || []).find(d =>
      String(d.id) === copyDocId || (copyDocCode && (d.code === copyDocCode || d.edCode === copyDocCode || d.doc_code === copyDocCode || d.docNo === copyDocCode || d.title === copyDocCode))
    );
    const relatedDoc = relatedInternalDoc || relatedExternalDoc;
    const isExternalCopy = Boolean(
      copy.is_external ||
      copy.isExternal ||
      copy.doc_type === 'EXTERNAL' ||
      copy.doc_type === 'ED' ||
      copy.docType === 'ED' ||
      copy.external_doc_id ||
      copy.externalDocId ||
      relatedExternalDoc ||
      String(copyDocCode || '').startsWith('ED-')
    );

    // 2. Resolve Target Department (Recipient department MUST ALWAYS take precedence over docOwnerDept)
    // Cross-department routing: Recipient department of this copy MUST ALWAYS take precedence over docOwnerDept!
    const destinationDept = resolveReceiptTaskDepartment(copy, copy);

    // 4. Resolve strictly targeted recipient/requester for this department (Level 1-5 ONLY; exclude Level 6+)
    let requesterId = null;
    let requesterName = null;

    // Check if the copy itself already specified a valid holder in destinationDept (must be L1-L5)
    if (copy.requester_id || copy.requesterId || copy.holderId) {
      const candidateId = copy.requester_id || copy.requesterId || copy.holderId;
      const candidateUser = (state.masterUsers || []).find(u => u.id === candidateId || u.empId === candidateId);
      if (candidateUser && userMatchesDepartment(candidateUser, destinationDept) && isLevel1To5(candidateUser)) {
        requesterId = candidateUser.id;
        requesterName = candidateUser.name;
      }
    }

    // If DAR requester belongs to destinationDept, prioritize DAR requester if L1-L5
    if (!requesterId && relatedDar) {
      const darReqId = relatedDar.requester_id || relatedDar.requesterId || relatedDar.userId || relatedDar.requester?.id || relatedDar.created_by || relatedDar.createdBy;
      const darReqUser = (state.masterUsers || []).find(u => u.id === darReqId || u.empId === darReqId);

      if (darReqUser && userMatchesDepartment(darReqUser, destinationDept) && isLevel1To5(darReqUser)) {
        requesterId = darReqId;
        requesterName = darReqUser.name || relatedDar.requester_name || relatedDar.requesterName || relatedDar.requester;
      }
    }

    // If no assignee or candidate not in destinationDept or is Level 6+, select L1-L5 employee in destinationDept
    if (!requesterId) {
      const deptUsers = (state.masterUsers || []).filter(u => userMatchesDepartment(u, destinationDept) && isLevel1To5(u));
      const nonDccDeptUsers = deptUsers.filter(u => !u.isDcc && u.role !== 'DCC_ADMIN');
      const candidatePool = nonDccDeptUsers.length > 0 ? nonDccDeptUsers : deptUsers;

      const primaryDeptUsers = candidatePool.filter(u => isSameDepartment(u.primary_department || u.department || u.dept, destinationDept));
      const finalCandidates = primaryDeptUsers.length > 0 ? primaryDeptUsers : candidatePool;

      const supervisorUser = finalCandidates.find(u => u.level === 5 || u.level === 4 || u.role === 'DEPT_ADMIN' || u.role === 'SUPERVISOR') || finalCandidates[0];
      if (supervisorUser) {
        requesterId = supervisorUser.id;
        requesterName = supervisorUser.name;
      } else {
        requesterId = null;
        requesterName = `${destinationDept} Controller`;
      }
    }

    const copyNoStr = String(copy.copy_no || copy.copyNo || '01').padStart(2, '0');
    const ensuredCopyCode = copy.copyCode || (copyDocCode ? `${copyDocCode}-C${copyNoStr}` : `CC-${copyNoStr}`);
    const todayStr = dispatchedAt.split('T')[0];
    const holderLabel = copy.holder || copy.custodianName || copy.holder_name || requesterName || `${destinationDept} (${copy.location || copy.locationName || destinationDept})`;

    const updatedCopy = {
      ...copy,
      copyCode: ensuredCopyCode,
      copy_code: ensuredCopyCode,
      status: 'DISPATCHED_PENDING_RECEIPT',
      dispatched_at: dispatchedAt,
      dispatched_by: dispatchedBy,
      dispatched_to_dept: destinationDept,
      holder_dept: destinationDept,
      department: destinationDept,
      dept_code: destinationDept,
      target_department: destinationDept,
      targetDepartment: destinationDept,
      recipientDepartment: destinationDept,
      recipient_department: destinationDept,
      holder: holderLabel,
      custodianName: holderLabel,
      requester_id: requesterId,
      requester_name: requesterName,
      distributedDate: todayStr,
      dateIssued: todayStr
    };

    const newCopies = copies.map(c => {
      if (String(c.id) === resolvedCopyId) {
        return updatedCopy;
      }
      if (copy.is_replacement && copy.replaced_copy_id && String(c.id) === String(copy.replaced_copy_id)) {
        // 🛡️ Strict ISO 9001 Invariant: If original copy is awaiting recall/destruction (DAMAGED/SUPERSEDED),
        // do NOT wipe its status to REPLACED_VOID on dispatch. It MUST remain DAMAGED_PENDING_RECALL or RECALLED
        // until physical retrieval and destruction in Tab 3 (Recall Checklist).
        const isAwaitingPhysicalRecall = c.isDamaged || c.status === 'DAMAGED_PENDING_RECALL' || c.status === 'PENDING_RECALL' || c.status === 'RECALLED' || c.status === 'DAMAGED_PENDING_REPLACEMENT';
        return {
          ...c,
          status: isAwaitingPhysicalRecall ? c.status : 'REPLACED_VOID',
          replaced_at: dispatchedAt,
          replaced_by: dispatchedBy,
          replacement_dispatched_at: dispatchedAt
        };
      }
      return c;
    });

    // Sync externalDocuments distributionList & controlledCopies if this is an External Document copy
    let updatedExternalDocs = state.externalDocuments;
    if (isExternalCopy && Array.isArray(state.externalDocuments)) {
      updatedExternalDocs = state.externalDocuments.map(d => {
        const isTargetExtDoc = (copyDocId && String(d.id) === copyDocId) ||
          (copyDocCode && (d.code === copyDocCode || d.edCode === copyDocCode || d.doc_code === copyDocCode || d.docNo === copyDocCode) && (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded);
        if (!isTargetExtDoc) return d;

        const syncList = (list = []) => {
          let found = false;
          const mapped = list.map(item => {
            if (
              String(item.id || item.copyId || '') === resolvedCopyId ||
              (item.copyCode && item.copyCode === ensuredCopyCode) ||
              (item.copy_no && String(item.copy_no) === String(copy.copy_no))
            ) {
              found = true;
              return {
                ...item,
                copyCode: ensuredCopyCode,
                status: 'DISPATCHED_PENDING_RECEIPT',
                distributedDate: todayStr,
                dateIssued: todayStr,
                dispatched_at: dispatchedAt,
                dispatched_by: dispatchedBy
              };
            }
            return item;
          });
          if (!found) {
            mapped.push({
              id: updatedCopy.id,
              copyId: updatedCopy.id,
              copyCode: ensuredCopyCode,
              copy_no: copyNoStr,
              copyNo: copyNoStr,
              department: destinationDept,
              targetDepartment: destinationDept,
              holder: holderLabel,
              custodianName: holderLabel,
              location: updatedCopy.location || updatedCopy.locationName || destinationDept,
              workstationLocation: updatedCopy.location || updatedCopy.locationName || destinationDept,
              distributedDate: todayStr,
              dateIssued: todayStr,
              status: 'DISPATCHED_PENDING_RECEIPT',
              is_external: true,
              doc_type: 'EXTERNAL',
              edition: updatedCopy.edition || d.edition || d.sourceVersion || updatedCopy.rev || '01'
            });
          }
          return mapped;
        };

        return {
          ...d,
          distributionList: syncList(d.distributionList || []),
          controlledCopies: syncList(d.controlledCopies || [])
        };
      });
    }

    // Create DEPT_CONFIRM_HARDCOPY_RECEIPT Task strictly targeted to destination department and assignee
    const newTaskId = `task-receipt-${resolvedCopyId}-${Date.now()}`;
    const docOfficialTitle = copy.docName || copy.name || copy.documentName || relatedDoc?.name || relatedDoc?.document_name || relatedDoc?.title || relatedDar?.name || copy.doc_code || copy.docTitle || 'เอกสารควบคุม';
    const docCode = copy.doc_code || copy.docCode || copy.docTitle || copy.title || relatedDoc?.edCode || relatedDoc?.doc_code || relatedDoc?.title || '';
    const newTask = {
      id: newTaskId,
      type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
      taskType: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
      task_type: 'CONFIRM_RECEIPT',
      category: 'RECEIPT',
      title: `ตรวจรับเอกสารควบคุมฉบับพิมพ์: ${docCode || docOfficialTitle} (Copy ${copy.copy_no || copy.ccNumber || '01'})`,
      description: `กรุณาตรวจสอบเอกสารฉบับพิมพ์จริงที่จุดใช้งาน ${copy.location || copy.locationName || destinationDept} (${destinationDept}) และยืนยันการรับเอกสาร`,
      copy_id: resolvedCopyId,
      copyId: resolvedCopyId,
      copyCode: ensuredCopyCode,
      instanceId: resolvedCopyId,
      doc_id: copyDocId,
      docId: copyDocId,
      externalDocId: isExternalCopy ? (relatedExternalDoc?.id || copyDocId) : null,
      darId: relatedDar ? String(relatedDar.id) : copyDocId,
      doc_code: docCode,
      docCode: docCode,
      is_external: isExternalCopy,
      doc_type: isExternalCopy ? 'EXTERNAL' : (copy.doc_type || 'SOP'),
      edition: copy.edition || relatedExternalDoc?.edition || relatedExternalDoc?.sourceVersion || copy.doc_version || copy.rev || '01',
      docTitle: docOfficialTitle,
      docName: docOfficialTitle,
      doc_version: copy.doc_version || copy.rev || '01',
      copy_no: copy.copy_no || copy.ccNumber || '01',
      location: copy.location || copy.locationName || destinationDept || '',
      location_name: copy.location || copy.locationName || destinationDept || '',
      target_department: destinationDept,
      targetDepartment: destinationDept,
      recipientDepartment: destinationDept,
      recipient_department: destinationDept,
      destinationDept: destinationDept,
      destination_dept: destinationDept,
      department: destinationDept,
      departmentName: destinationDept === 'QC' ? 'ฝ่ายประกันและควบคุมคุณภาพ' : (copy.departmentName || destinationDept),
      dept_code: destinationDept,
      currentHandlerDepartment: destinationDept,
      isDepartmentPool: true,
      isSharedTask: true,
      shared_pool: true,
      is_shared_task: true,
      assignee_id: requesterId,
      assigneeId: requesterId,
      assignee_name: requesterName,
      assigneeName: requesterName,
      assignee_dept: destinationDept,
      assignedToDept: destinationDept,
      assignedToRole: 'DEPARTMENT_CONTROLLER',
      origin: isExternalCopy ? 'EXTERNAL' : 'INTERNAL',
      status: 'PENDING',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: dispatchedAt,
      priority: 'HIGH'
    };

    const auditLog = {
      id: `audit-${Date.now()}`,
      timestamp: dispatchedAt,
      user: dispatchedBy,
      action: 'DISPATCH_COPY',
      docTitle: copy.doc_code || copy.docTitle,
      docRev: copy.doc_version || copy.rev,
      ccNumber: copy.copy_no || copy.ccNumber,
      copyCode: ensuredCopyCode,
      oldStatus: copy.status,
      newStatus: 'DISPATCHED_PENDING_RECEIPT',
      remarks: `Dispatched controlled copy to ${destinationDept} (${copy.location || copy.locationName}) - Assigned to recipient ${requesterName || destinationDept} (${requesterId || 'Dept Pool'})`
    };

    const notif = {
      id: `notif-receipt-${Date.now()}`,
      userId: requesterId || 'U002',
      title: 'เอกสารควบคุมฉบับพิมพ์จัดส่งถึงแผนกแล้ว',
      message: `กรุณาตรวจรับเอกสาร ${copy.doc_code || copy.docTitle} (Copy ${copy.copy_no || copy.ccNumber}) ประจำจุด ${copy.location || copy.locationName}`,
      isRead: false,
      link: '/tasks',
      timestamp: dispatchedAt
    };

    // Check remaining pending copies for this document in newCopies
    const relatedDocId = String(copyDocId || copy.doc_id || copy.docId || copy.external_doc_id || copy.externalDocId || '');
    const relatedDocCode = copy.doc_code || copy.docCode || copy.docTitle || copy.title || '';
    const relatedDarId = relatedDar ? String(relatedDar.id) : (copy.dar_id ? String(copy.dar_id) : '');

    const docCopies = newCopies.filter(c => {
      return (relatedDocId && String(c.doc_id || c.docId || c.documentId || c.external_doc_id || c.externalDocId) === relatedDocId) ||
             (relatedDocCode && (c.doc_code === relatedDocCode || c.docCode === relatedDocCode || c.docTitle === relatedDocCode));
    });

    const pendingDocCopies = docCopies.filter(c => 
      c.status === 'PENDING_ISSUE' || 
      c.status === 'PENDING_PRINT' || 
      c.status === 'PENDING_DISPATCH'
    );

    const isAllDispatched = docCopies.length > 0 && pendingDocCopies.length === 0;

    // Update existing distribution tasks for this document/DAR
    // 🛡️ Strict Isolation Guard: Never touch, complete, or dismiss DCC_RECALL tasks!
    const updatedTasks = state.tasks.map(t => {
      // Strict Invariant: Ignore all recall task types completely
      const isRecallTask = t.type === 'DCC_RECALL' || 
                           t.type === 'DCC_RECALL_WITH_CHECKLIST' || 
                           t.type === 'RECALL' || 
                           t.type === 'OBSOLETE_RECALL' ||
                           t.type === 'RECALL_HARDCOPY' ||
                           t.taskType === 'RECALL' || 
                           t.taskType === 'DCC_RECALL_WITH_CHECKLIST' ||
                           t.task_type === 'RECALL' ||
                           t.isDamaged === true ||
                           t.is_damaged === true;
      if (isRecallTask) return t;

      const isDistTask = t.type === 'DCC_DISTRIBUTE' || 
                         t.type === 'DCC_ISSUE' || 
                         t.taskType === 'DCC_DISTRIBUTE' ||
                         t.taskType === 'DISTRIBUTION' ||
                         t.task_type === 'DISTRIBUTION' ||
                         t.taskType === 'DCC_ISSUE_CONTROLLED_COPIES';
      if (!isDistTask) return t;

      // For replacement copy tasks tied specifically to this dispatched copy
      if (t.copyId || t.copy_id || t.instanceId) {
        const taskCopyId = String(t.copyId || t.copy_id || t.instanceId);
        if (taskCopyId === resolvedCopyId) {
          return {
            ...t,
            status: 'COMPLETED',
            is_completed: true,
            completedAt: dispatchedAt,
            actionRequired: false,
            isUrgent: false,
            priority: 'NORMAL',
            delivery_status: 'DISPATCHED_TRACKING',
            tracking_status: 'WAITING_RECEIPT',
            status_label: 'ติดตามการส่งมอบ (รอปลายทางตรวจรับ)',
            title: `ติดตามการส่งมอบ: ${relatedDocCode || t.doc_code || t.title} (รอปลายทางตรวจรับ)`,
            description: `DCC ได้บันทึกส่งมอบสำเนาทดแทนแล้ว (${dispatchedAt.split('T')[0]}) อยู่ระหว่างรอแผนกปลายทางตรวจรับเล่มสำเนาทางกายภาพ`
          };
        }
        // If tied to another copy ID, do not modify
        return t;
      }

      const isMatch = (relatedDarId && String(t.darId) === relatedDarId) ||
                      (relatedDocId && (String(t.docId) === relatedDocId || String(t.doc_id) === relatedDocId || String(t.externalDocId) === relatedDocId)) ||
                      (relatedDocCode && (t.doc_code === relatedDocCode || t.docCode === relatedDocCode || t.docTitle === relatedDocCode || t.title?.includes(relatedDocCode)));
      if (!isMatch) return t;

      if (isAllDispatched) {
        return {
          ...t,
          status: 'COMPLETED',
          is_completed: true,
          completedAt: dispatchedAt,
          actionRequired: false,
          isUrgent: false,
          priority: 'NORMAL',
          delivery_status: 'DISPATCHED_TRACKING',
          tracking_status: 'WAITING_RECEIPT',
          status_label: 'ติดตามการส่งมอบ (รอปลายทางตรวจรับ)',
          title: `ติดตามการส่งมอบ: ${relatedDocCode || t.doc_code || t.title} (รอปลายทางตรวจรับ)`,
          description: `DCC ได้บันทึกส่งมอบสำเนาครบทุกฉบับแล้ว (${dispatchedAt.split('T')[0]}) อยู่ระหว่างรอแผนกปลายทางตรวจรับเล่มสำเนาทางกายภาพ`
        };
      } else {
        const dispatchedCount = docCopies.length - pendingDocCopies.length;
        return {
          ...t,
          title: `แจกจ่ายสำเนาควบคุม: ${relatedDocCode || t.doc_code || t.title} (ส่งมอบแล้ว ${dispatchedCount}/${docCopies.length})`,
          description: `อยู่ระหว่างส่งมอบสำเนา (ส่งมอบแล้ว ${dispatchedCount}/${docCopies.length} ฉบับ) ยังคงเหลือสำเนาที่ต้องพิมพ์/ส่งมอบอีก ${pendingDocCopies.length} ฉบับ`
        };
      }
    });

    return {
      externalDocuments: updatedExternalDocs,
      documentControlledCopies: newCopies,
      controlledCopyInstances: newCopies,
      tasks: [newTask, ...updatedTasks.filter(t => t.id !== newTaskId)],
      controlledCopyAuditTrail: [auditLog, ...state.controlledCopyAuditTrail],
      notifications: [notif, ...state.notifications],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_DISPATCH',
        actor: dispatchedBy,
        details: `Dispatched controlled copy ${resolvedCopyId} to ${destinationDept}`,
        timestamp: dispatchedAt
      }, ...(state.actionLog || [])]
    };
  }),

  // Batch dispatch helper & aliases
  dispatchControlledCopies: (docIdOrCopyIds, copiesToDispatch) => {
    if (Array.isArray(docIdOrCopyIds)) {
      docIdOrCopyIds.forEach(id => {
        get().dispatchControlledCopy(typeof id === 'object' ? (id.id || id.copyId) : id);
      });
      return;
    }
    if (Array.isArray(copiesToDispatch)) {
      copiesToDispatch.forEach(copy => {
        get().dispatchControlledCopy(copy.id || copy.copyId || copy);
      });
      return;
    }
    if (typeof docIdOrCopyIds === 'string') {
      const state = get();
      const allCopies = state.controlledCopyInstances || state.documentControlledCopies || [];
      // Check if it's a single copy ID / copyCode first
      const exactCopy = allCopies.find(c => String(c.id) === docIdOrCopyIds || c.copyCode === docIdOrCopyIds);
      if (exactCopy) {
        get().dispatchControlledCopy(exactCopy.id);
        return;
      }
      // Check if it's a task ID
      const matchedTask = (state.tasks || []).find(t => String(t.id) === docIdOrCopyIds);
      const targetKey = matchedTask ? (matchedTask.docId || matchedTask.externalDocId || matchedTask.doc_code || matchedTask.docCode) : docIdOrCopyIds;
      const copies = allCopies.filter(c => 
        (c.doc_id === targetKey || c.docId === targetKey || c.documentId === targetKey || c.external_doc_id === targetKey || c.externalDocId === targetKey || c.doc_code === targetKey || c.docCode === targetKey || c.docTitle === targetKey) && 
        (c.status === 'PENDING_ISSUE' || c.status === 'PENDING_PRINT' || c.status === 'PENDING_DISPATCH')
      );
      copies.forEach(c => {
        get().dispatchControlledCopy(c.id);
      });
    }
  },

  fulfillControlledCopyRequest: (copyIdOrTaskId, copiesToDispatch) => {
    return get().dispatchControlledCopies(copyIdOrTaskId, copiesToDispatch);
  },

  // Receipt & Recall Checklist
  confirmHardcopyReceipt: (copyId, taskId, recipientData = {}) => isApiMode ? apiCopies.stepCopy('receive', typeof copyId === 'object' ? (copyId?.copyId || copyId?.id) : copyId, recipientData.remarks) : set((state) => {
    // Strict Type Coercion to prevent comparison bugs
    const targetCopyId = String(typeof copyId === 'object' ? (copyId?.copyId || copyId?.id || '') : copyId);
    const targetTaskId = taskId ? String(taskId) : null;
    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies && state.documentControlledCopies.length > 0 ? state.documentControlledCopies : (state.controlledCopyInstances || []));
    const copy = copies.find(c => String(c.id) === targetCopyId || (c.copyCode && String(c.copyCode) === targetCopyId));
    if (!copy) return state;
    const resolvedCopyId = String(copy.id);

    const user = state.currentUser;
    const isWildcard = user?.isDcc || user?.role === 'DCC_ADMIN' || user?.role === 'QMR' || user?.isQmr;
    const _userDepts = user?.affiliated_departments || user?.depts || (user?.primary_department ? [user.primary_department] : (user?.department ? [user.department] : []));
    
    const targetDept = copy.holder_dept || copy.department || copy.target_department || copy.dept_code;
    
    // 🛡️ Strict Authorization Guard with DCC Admin / QMR Wildcard Bypass:
    if (!isWildcard && targetDept && !userMatchesDepartment(user, targetDept)) {
      console.warn(`[Guard] Unauthorized confirmHardcopyReceipt: User ${user?.name} (${user?.primary_department || user?.department}) cannot confirm receipt for copy ${resolvedCopyId} (${targetDept})`);
      return state;
    }

    const confirmedAt = recipientData.timestamp || new Date().toISOString();
    const confirmedBy = recipientData.actor_name || recipientData.name || (state.currentUser ? state.currentUser.name : 'Recipient User');
    const actorUserId = recipientData.receiver_user_id || recipientData.actor_user_id || user?.id || user?.empId || 'UNKNOWN_USER';
    const remarks = recipientData.remarks || 'Confirmed hardcopy receipt and physical verification at point of use';
    const clientIp = recipientData.client_ip || '127.0.0.1';
    const sessionId = recipientData.session_id || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const docId = copy.doc_code || copy.docCode || copy.docTitle || copy.document_id || recipientData.document_id || 'UNKNOWN_DOC';
    const revision = copy.doc_version || copy.rev || recipientData.revision || '01';
    const copyIdentifier = copy.copy_no ? `Copy ${copy.copy_no}` : (copy.ccNumber || `Copy ${resolvedCopyId}`);
    const copyNoStr = String(copy.copy_no || copy.copyNo || '01').padStart(2, '0');
    const ensuredCopyCode = copy.copyCode || (docId !== 'UNKNOWN_DOC' ? `${docId}-C${copyNoStr}` : `CC-${copyNoStr}`);

    const updatedCopy = {
      ...copy,
      copyCode: ensuredCopyCode,
      copy_code: ensuredCopyCode,
      status: 'ISSUED_ACTIVE',
      copy_status: 'ACTIVE',
      display_status: 'ACTIVE',
      receipt_status: 'ACTIVE',
      isActive: true,
      is_active_in_field: true,
      received_by: confirmedBy,
      received_by_id: actorUserId,
      received_by_name: confirmedBy,
      received_at: confirmedAt,
      holder: confirmedBy,
      custodianName: confirmedBy,
      holder_id: actorUserId,
      holderId: actorUserId,
      holder_name: confirmedBy,
      holderName: confirmedBy,
      receipt_confirmed_at: confirmedAt,
      receipt_confirmed_by: confirmedBy,
      receipt_confirmed_by_id: actorUserId,
      receipt_remarks: remarks
    };

    const newCopies = copies.map(c => {
      if (String(c.id) === resolvedCopyId) {
        return updatedCopy;
      }
      if (copy.is_replacement && copy.replaced_copy_id && String(c.id) === String(copy.replaced_copy_id)) {
        return {
          ...c,
          status: 'REPLACED_VOID',
          previous_status: c.status,
          replaced_at: confirmedAt,
          replaced_by: confirmedBy
        };
      }
      return c;
    });

    // Sync externalDocuments distributionList & controlledCopies when confirming receipt for an External Document copy
    const copyDocId = String(copy.doc_id || copy.docId || copy.documentId || copy.external_doc_id || copy.externalDocId || '');
    const isExternalCopy = Boolean(
      copy.is_external ||
      copy.isExternal ||
      copy.doc_type === 'EXTERNAL' ||
      copy.doc_type === 'ED' ||
      copy.docType === 'ED' ||
      copy.external_doc_id ||
      copy.externalDocId ||
      String(docId || '').startsWith('ED-')
    );
    let updatedExternalDocs = state.externalDocuments;
    if (isExternalCopy && Array.isArray(state.externalDocuments)) {
      updatedExternalDocs = state.externalDocuments.map(d => {
        const isTargetExtDoc = (copyDocId && String(d.id) === copyDocId) ||
          (docId && (d.code === docId || d.edCode === docId || d.doc_code === docId || d.docNo === docId) && (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded);
        if (!isTargetExtDoc) return d;

        const syncList = (list = []) => list.map(item => {
          if (
            String(item.id || item.copyId || '') === resolvedCopyId ||
            (item.copyCode && item.copyCode === ensuredCopyCode) ||
            (item.copy_no && String(item.copy_no) === String(copy.copy_no))
          ) {
            return {
              ...item,
              copyCode: ensuredCopyCode,
              status: 'ACTIVE',
              copy_status: 'ISSUED_ACTIVE',
              holder: confirmedBy,
              custodianName: confirmedBy,
              received_by: confirmedBy,
              received_at: confirmedAt,
              receipt_confirmed_at: confirmedAt,
              receipt_confirmed_by: confirmedBy
            };
          }
          return item;
        });

        return {
          ...d,
          distributionList: syncList(d.distributionList || []),
          controlledCopies: syncList(d.controlledCopies || [])
        };
      });
    }

    // Department-Pooled Task Dismissal: Immediately remove task for ALL users in the target department
    const updatedTasks = state.tasks.filter(t => {
      if (targetTaskId && String(t.id) === targetTaskId) return false;
      if (
        (t.type === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' || t.taskType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' || t.task_type === 'CONFIRM_RECEIPT' || t.type === 'CONFIRM_RECEIPT' || t.category === 'RECEIPT') &&
        (String(t.copy_id) === resolvedCopyId || String(t.copyId) === resolvedCopyId || String(t.instanceId) === resolvedCopyId)
      ) {
        return false;
      }
      return true;
    });

    // 11 Mandatory Audit Trail Fields + Multi-Department Tracking
    const auditLog = {
      id: `audit-${Date.now()}`,
      log_id: `LOG-REC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      copy_id: resolvedCopyId,
      copyCode: ensuredCopyCode,
      document_id: docId,
      revision: revision,
      copy_identifier: copyIdentifier,
      target_department: targetDept || 'PD',
      task_department: targetDept || 'PD',
      action: 'PHYSICAL_COPY_RECEIVED',
      actor_user_id: actorUserId,
      actor_name: confirmedBy,
      actor_primary_department: user?.primary_department || user?.department || recipientData.actor_primary_department || 'UNKNOWN',
      timestamp: confirmedAt,
      remarks: remarks,
      client_ip: clientIp,
      session_id: sessionId,
      // Backward compatibility fields
      user: confirmedBy,
      docTitle: docId,
      docRev: revision,
      ccNumber: copy.copy_no || copy.ccNumber || '01',
      oldStatus: copy.status,
      newStatus: 'ISSUED_ACTIVE'
    };

    const notif = {
      id: `notif-confirmed-${Date.now()}`,
      userId: state.currentUser ? state.currentUser.id : 'U002',
      title: 'ยืนยันการรับเอกสารควบคุมสำเร็จ',
      message: `คุณได้ยืนยันการรับเอกสาร ${copy.doc_code || copy.docTitle} (Copy ${copy.copy_no || copy.ccNumber}) เรียบร้อยแล้ว`,
      isRead: false,
      link: '/controlled-copy',
      timestamp: confirmedAt
    };

    // If all copies of this document are now active/confirmed, mark tracking distribution task complete
    const remainingUnconfirmedCopies = newCopies.filter(c => {
      const isSameDoc = (docId && (c.doc_code === docId || c.docCode === docId || c.docTitle === docId || String(c.doc_id || c.docId || c.documentId) === String(copy.doc_id || copy.docId || copy.documentId)));
      return isSameDoc && c.status !== 'ISSUED_ACTIVE' && c.status !== 'ACTIVE' && c.status !== 'VOID' && c.status !== 'REPLACED_VOID';
    });
    const isAllConfirmed = remainingUnconfirmedCopies.length === 0;

    const finalTasks = updatedTasks.map(t => {
      if (t.delivery_status === 'DISPATCHED_TRACKING' && isAllConfirmed) {
        const isMatch = (copy.doc_code && (t.doc_code === copy.doc_code || t.docCode === copy.doc_code || t.title?.includes(copy.doc_code)));
        if (isMatch) {
          return {
            ...t,
            delivery_status: 'ALL_RECEIPTS_CONFIRMED',
            tracking_status: 'DONE',
            status: 'COMPLETED',
            is_completed: true,
            title: `การแจกจ่ายเสร็จสมบูรณ์: ${copy.doc_code || t.title}`,
            description: `ทุกแผนกได้ตรวจรับเล่มสำเนาควบคุมครบถ้วนแล้ว ณ ${confirmedAt.split('T')[0]}`
          };
        }
      }
      return t;
    });

    return {
      externalDocuments: updatedExternalDocs,
      documentControlledCopies: newCopies,
      controlledCopyInstances: newCopies,
      tasks: cleanupDccTasks(finalTasks, newCopies, [...(state.documents || []), ...(updatedExternalDocs || [])]),
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      physicalCopyAuditLogs: [auditLog, ...(state.physicalCopyAuditLogs || [])],
      notifications: [notif, ...state.notifications]
    };
  }),

  // Backward compatibility aliases for confirmCcReceipt / acknowledgeCopyReceipt
  confirmCcReceipt: (instId, taskId, recipientData) => {
    return get().confirmHardcopyReceipt(instId, taskId, recipientData);
  },
  acknowledgeCopyReceipt: (instId, taskId, recipientData) => {
    return get().confirmHardcopyReceipt(instId, taskId, recipientData);
  },

  completeRecallChecklist: (taskId, checkedCopyIds = [], outcome = 'RECALLED_DESTROYED') => isApiMode ? apiCopies.stepCopies('recall', checkedCopyIds, outcome) : set((state) => {
    const targetTaskId = String(taskId);
    const checkedSet = new Set((checkedCopyIds || []).map(id => String(id)));
    const recalledAt = new Date().toISOString();
    const recalledBy = state.currentUser ? state.currentUser.name : 'DCC Admin';
    const finalStatus = (outcome === 'RECALLED_OBSOLETE' || outcome === 'ARCHIVED_OBSOLETE') ? 'RECALLED_OBSOLETE' : 'RECALLED_DESTROYED';

    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies && state.documentControlledCopies.length > 0 ? state.documentControlledCopies : (state.controlledCopyInstances || []));
    const newCopies = copies.map(copy => {
      if (checkedSet.has(String(copy.id))) {
        return {
          ...copy,
          status: finalStatus,
          recalled_at: recalledAt,
          recalled_by: recalledBy,
          dateRecalled: recalledAt.split('T')[0]
        };
      }
      return copy;
    });

    // Hard Delete: Eliminate the recall task from array
    const updatedTasks = state.tasks.filter(t => String(t.id) !== targetTaskId);

    // 🛡️ Dedicated Disposition Ledger Entries (Append-Only)
    const newDispositionRecords = copies
      .filter(copy => checkedSet.has(String(copy.id)))
      .map(copy => ({
        id: `DISP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        copyId: copy.id,
        copy_id: copy.id,
        docCode: copy.doc_code || copy.docTitle || '',
        docTitle: copy.docName || copy.doc_title || copy.docTitle || '',
        revision: copy.doc_version || copy.rev || '01',
        copyNumber: copy.copy_no ? (String(copy.copy_no).startsWith('Copy') ? copy.copy_no : `Copy ${copy.copy_no}`) : (copy.ccNumber || 'Copy 01'),
        copy_no: copy.copy_no || copy.ccNumber || '01',
        department: copy.holder_dept || copy.department || '',
        location: copy.location || copy.locationName || copy.station_name || '',
        dispositionType: finalStatus.includes('OBSOLETE') ? 'ARCHIVED_OBSOLETE' : 'DESTROYED',
        dispositionMethod: finalStatus.includes('OBSOLETE') ? 'STAMP_AND_ARCHIVE' : 'SHRED',
        disposedBy: state.currentUser ? `${state.currentUser.name} (${state.currentUser.empId || state.currentUser.role || 'DCC'})` : `${recalledBy} (DCC)`,
        disposed_by_name: recalledBy,
        disposed_by_id: state.currentUser?.id || '',
        disposedAt: recalledAt,
        witnessName: '',
        referenceNo: targetTaskId,
        notes: `Recall Checklist completion: ${outcome}`
      }));

    const auditLog = {
      id: `audit-recall-${Date.now()}`,
      timestamp: recalledAt,
      user: recalledBy,
      action: 'COMPLETE_RECALL_CHECKLIST',
      oldStatus: 'PENDING_RECALL',
      newStatus: finalStatus,
      remarks: `DCC completed physical recall checklist for ${checkedSet.size} copies (${finalStatus})`
    };

    return {
      documentControlledCopies: newCopies,
      controlledCopyInstances: newCopies,
      copyDispositionRecords: [...newDispositionRecords, ...(state.copyDispositionRecords || [])],
      dispositionHistory: [...newDispositionRecords, ...(state.dispositionHistory || [])],
      tasks: cleanupDccTasks(updatedTasks, newCopies, state.documents),
      controlledCopyAuditTrail: [auditLog, ...state.controlledCopyAuditTrail],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_RECALL_COMPLETE',
        actor: recalledBy,
        details: `Completed recall checklist for task ${targetTaskId} (${checkedSet.size} copies) -> ${finalStatus}`,
        timestamp: recalledAt
      }, ...(state.actionLog || [])]
    };
  }),

  // Recall, Disposition & Reconciliation
  confirmCopiesRecalled: (taskId, destructionDetails = {}) => set((state) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return state;

    const targetDocCode = task.document_code || task.doc_code || task.docTitle;
    const recalledAt = new Date().toISOString();
    const finalStatus = destructionDetails.finalStatus || 'DESTROYED';
    const method = destructionDetails.method || 'SHREDDING';
    const actor = state.currentUser ? state.currentUser.name : 'DCC Officer';

    // 1. Mark recalled copies as DESTROYED
    const copies = state.controlledCopyInstances || state.documentControlledCopies || [];
    const updatedCopies = copies.map(c => {
      const matchDoc = (c.document_code || c.doc_code || c.docTitle) === targetDocCode ||
                       (task.copyId && String(task.copyId) === String(c.id)) ||
                       (task.instanceId && String(task.instanceId) === String(c.id)) ||
                       (task.copies_to_recall && task.copies_to_recall.some(rc => rc.id === c.id)) ||
                       (task.supersededCopyIds && task.supersededCopyIds.some(sid => sid === c.id));
      const isPending = c.status === 'PENDING_RECALL' || c.status === 'DAMAGED_PENDING_RECALL' || c.status === 'OBSOLETE_PENDING_RECALL' || c.status === 'SUPERSEDED_PENDING_RECALL';
      if (matchDoc && isPending) {
        return {
          ...c,
          status: finalStatus,
          destroyed_at: recalledAt,
          recalled_at: recalledAt,
          destruction_method: method,
          destruction_notes: destructionDetails.notes || 'ทำลายตามระเบียบควบคุมเอกสาร'
        };
      }
      return c;
    });

    // 2. Mark recall task as RESOLVED
    const updatedTasks = state.tasks.map(t => t.id === taskId ? {
      ...t,
      status: 'RESOLVED',
      is_completed: true,
      resolved_at: recalledAt,
      resolved_by: actor
    } : t);

    // 3. Audit trail
    const auditLog = {
      id: `audit-recall-close-${Date.now()}`,
      timestamp: recalledAt,
      user: actor,
      action: 'RECALL_COMPLETED_DESTROYED',
      docTitle: targetDocCode,
      remarks: `DCC ยืนยันการเรียกคืนและทำลายเล่มสำเนา (${method}) สำหรับเอกสาร ${targetDocCode} เรียบร้อยแล้ว`
    };

    return {
      tasks: cleanupDccTasks(updatedTasks, updatedCopies, state.documents, state.dars),
      controlledCopyInstances: updatedCopies,
      documentControlledCopies: updatedCopies,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-RECALL-CLOSE-${Date.now()}`,
        actionType: 'RECALL_COMPLETED_DESTROYED',
        actor,
        details: `Closed Recall Task ${taskId} for ${targetDocCode} -> ${finalStatus}`,
        timestamp: recalledAt
      }, ...(state.actionLog || [])]
    };
  }),

  completeCopyRecallAndArchive: ({ documentCode, collectedCopyIds, dispositionMethod, notes, witnessName, referenceNo, taskId }) => isApiMode ? apiCopies.disposeCopies(collectedCopyIds || [], { method: dispositionMethod, witness: witnessName, referenceNo, notes }) : set((state) => {
    const isLostVoided = dispositionMethod === 'LOST_VOIDED';
    const collectedSet = new Set((collectedCopyIds || []).map(id => String(id)));
    const recalledAt = new Date().toISOString();
    const recalledBy = state.currentUser ? state.currentUser.name : 'DCC Officer';
    const finalStatus = isLostVoided 
      ? 'LOST_VOIDED' 
      : (dispositionMethod === 'STAMP_AND_ARCHIVE' ? 'ARCHIVED_OBSOLETE' : 'DESTROYED');

    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);

    const updatedCopies = copies.map(copy => {
      if (collectedSet.has(String(copy.id))) {
        return {
          ...copy,
          status: finalStatus,
          disposition_method: dispositionMethod,
          dispositionMethod: dispositionMethod,
          disposition_type: finalStatus,
          dispositionType: finalStatus,
          recalled_at: recalledAt,
          recalled_by: recalledBy,
          disposed_at: recalledAt,
          disposedAt: recalledAt,
          disposed_by: state.currentUser?.name || recalledBy,
          disposedBy: state.currentUser?.name || recalledBy,
          dcc_notes: notes || '',
          witness_name: witnessName || '',
          reference_no: referenceNo || '',
          dateRecalled: recalledAt.split('T')[0],
          dateDestroyed: finalStatus === 'DESTROYED' ? recalledAt.split('T')[0] : copy.dateDestroyed,
          dateVoided: isLostVoided ? recalledAt.split('T')[0] : undefined
        };
      }
      return copy;
    });

    // 🛡️ Dedicated Disposition Ledger Entries (Append-Only for ISO 9001 Compliance)
    const newDispositionRecords = copies
      .filter(copy => collectedSet.has(String(copy.id)))
      .map(copy => ({
        id: `DISP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        copyId: copy.id,
        copy_id: copy.id,
        docCode: copy.doc_code || copy.docTitle || documentCode || '',
        docTitle: copy.docName || copy.doc_title || copy.docTitle || '',
        revision: copy.doc_version || copy.rev || '01',
        copyNumber: copy.copy_no ? (String(copy.copy_no).startsWith('Copy') ? copy.copy_no : `Copy ${copy.copy_no}`) : (copy.ccNumber || 'Copy 01'),
        copy_no: copy.copy_no || copy.ccNumber || '01',
        department: copy.holder_dept || copy.department || '',
        location: copy.location || copy.locationName || copy.station_name || '',
        dispositionType: finalStatus,
        dispositionMethod: dispositionMethod || (finalStatus === 'ARCHIVED_OBSOLETE' ? 'STAMP_AND_ARCHIVE' : (isLostVoided ? 'LOST_VOIDED' : 'DESTROY_SCRAP')),
        disposedBy: state.currentUser ? `${state.currentUser.name} (${state.currentUser.empId || state.currentUser.role || 'DCC'})` : `${recalledBy} (DCC)`,
        disposed_by_name: recalledBy,
        disposed_by_id: state.currentUser?.id || '',
        disposedAt: recalledAt,
        witnessName: witnessName || '',
        witness_name: witnessName || '',
        referenceNo: referenceNo || '',
        reference_no: referenceNo || '',
        notes: notes || ''
      }));

    // Resolve Recall Task
    let updatedTasks = (state.tasks || []).map(t => {
      // STRICT ISOLATION GUARD: Never touch distribution tasks!
      if (t.type === 'DCC_DISTRIBUTE' || t.taskType === 'DISTRIBUTION' || t.task_type === 'DISTRIBUTION') return t;

      const isTargetTask = (taskId && String(t.id) === String(taskId)) ||
        (documentCode && (t.doc_code === documentCode || t.docTitle === documentCode || t.title?.includes(documentCode))) ||
        (t.darId && state.dars.some(d => d.id === t.darId && (d.docIdRef === documentCode || d.title === documentCode || d.doc_code === documentCode)));

      if (isTargetTask && (t.type === 'DCC_RECALL' || t.type === 'DCC_RECALL_WITH_CHECKLIST' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST' || t.taskType === 'RECALL' || t.task_type === 'RECALL' || t.type === 'RECALL' || t.type === 'OBSOLETE_RECALL' || t.type === 'RECALL_HARDCOPY')) {
        // If task has supersededCopyIds, check if all superseded copies are resolved
        if (t.supersededCopyIds && Array.isArray(t.supersededCopyIds) && t.supersededCopyIds.length > 0) {
          const allResolved = t.supersededCopyIds.every(id => {
            const c = updatedCopies.find(copy => String(copy.id) === String(id));
            return !c || c.status === 'DESTROYED' || c.status === 'ARCHIVED_OBSOLETE' || c.status === 'OBSOLETE' || c.status === 'RECALLED' || c.status === 'LOST_VOIDED' || c.status === 'DISPOSED_LOST';
          });
          if (allResolved) {
            return {
              ...t,
              status: 'COMPLETED',
              is_completed: true,
              completed_at: recalledAt
            };
          }
          return t;
        }

        // Check if there are any remaining copies with PENDING_RECALL / SUPERSEDED_PENDING_RECALL / OBSOLETE_PENDING_RECALL for this doc
        const remainingPending = updatedCopies.some(c => 
          (c.doc_code === documentCode || c.docTitle === documentCode || (c.doc_id && state.documents.some(d => String(d.id) === String(c.doc_id) && d.title === documentCode))) &&
          (c.status === 'PENDING_RECALL' || c.status === 'DAMAGED_PENDING_RECALL' || c.status === 'SUPERSEDED_PENDING_RECALL' || c.status === 'OBSOLETE_PENDING_RECALL')
        );

        if (!remainingPending || collectedSet.size >= (copies.filter(c => c.doc_code === documentCode || c.docTitle === documentCode).length || 1)) {
          return {
            ...t,
            status: 'COMPLETED',
            is_completed: true,
            completed_at: recalledAt
          };
        }
      }
      return t;
    });

    const cleanedTasks = cleanupDccTasks(updatedTasks, updatedCopies, state.documents, state.dars);

    const dispLabel = isLostVoided
      ? 'บันทึกจำหน่ายสูญหาย (Lost / Voided)'
      : (dispositionMethod === 'STAMP_AND_ARCHIVE'
        ? 'ประทับตรา OBSOLETE และเก็บเข้าคลังประวัติ'
        : 'ทำลาย (Shred/Destroy)');

    const auditAction = isLostVoided ? 'DISPOSE_CONTROLLED_COPY_LOST' : 'CONTROLLED_COPY_DISPOSITION';

    const auditLog = {
      id: `audit-disp-${Date.now()}`,
      timestamp: recalledAt,
      user: recalledBy,
      action: auditAction,
      docTitle: documentCode,
      remarks: `DCC ทำการ ${dispLabel} สำหรับเอกสาร ${documentCode} จำนวน ${collectedSet.size} ชุด${witnessName ? ` | พยาน: ${witnessName}` : ''}${referenceNo ? ` | อ้างอิง: ${referenceNo}` : ''}${notes ? ` | หมายเหตุ: ${notes}` : ''}`
    };

    const actionLogEntry = {
      id: `LOG-DISP-${Date.now()}`,
      actionType: auditAction,
      action: auditAction,
      actor: recalledBy,
      details: `DCC ดำเนินการ ${dispLabel} สำหรับ ${documentCode} (${collectedSet.size} ชุด): ${notes || 'เรียบร้อย'}`,
      timestamp: recalledAt
    };

    return {
      controlledCopyInstances: updatedCopies,
      documentControlledCopies: updatedCopies,
      copyDispositionRecords: [...newDispositionRecords, ...(state.copyDispositionRecords || [])],
      dispositionHistory: [...newDispositionRecords, ...(state.dispositionHistory || [])],
      tasks: cleanedTasks,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [actionLogEntry, ...(state.actionLog || [])]
    };
  }),

  reconcileAndResolveTasks: () => set((state) => {
    const instances = state.controlledCopyInstances || state.documentControlledCopies || [];
    return {
      tasks: cleanupDccTasks(state.tasks, instances, state.documents, state.dars)
    };
  }),

  // Custody, Relocation, Return & Replacement Lifecycle
  issueControlledCopy: (docTitle, dept, location = null, locationId = null) => set((state) => {
    const doc = (state.documents || []).find(d => (d.title === docTitle || String(d.id) === String(docTitle) || d.code === docTitle) && (d.status === 'EFFECTIVE' || d.status === 'ACTIVE'))
      || (state.externalDocuments || []).find(d => (String(d.id) === String(docTitle) || d.code === docTitle || d.edCode === docTitle || d.doc_code === docTitle || d.docNo === docTitle || d.title === docTitle) && (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded);
    if (!doc) return state;

    const isExternal = !(state.documents || []).some(d => d.id === doc.id);
    const docCode = doc.code || doc.edCode || doc.document_code || doc.doc_code || doc.docNo || doc.title;
    const docOfficialTitle = doc.document_title || doc.doc_title || doc.docName || doc.name || doc.title || docCode;
    const docEdition = doc.edition || doc.sourceVersion || doc.rev || '01';

    const copies = state.documentControlledCopies || state.controlledCopyInstances || [];
    const activeCopies = getActivePhysicalCopies(copies, doc);
    const nextNum = activeCopies.length + 1;
    const nextCcNum = `CC-${String(nextNum).padStart(3, '0')}`;
    const copyNo = String(nextNum).padStart(2, '0');
    const copyCode = `${docCode}-C${copyNo}`;
    const locName = location || `${dept} Head Office`;
    const locId = locationId || `${dept}-LOC-${nextNum}`;
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const holderName = `${dept} (${locName})`;

    const newInst = {
      id: `inst-${Date.now()}`,
      copyCode,
      copy_code: copyCode,
      doc_id: doc.id,
      docId: doc.id,
      documentId: doc.id,
      external_doc_id: isExternal ? doc.id : null,
      externalDocId: isExternal ? doc.id : null,
      document_code: docCode,
      documentCode: docCode,
      doc_code: docCode,
      docCode: docCode,
      document_title: docOfficialTitle,
      doc_title: docOfficialTitle,
      docName: docOfficialTitle,
      docTitle: isExternal ? docOfficialTitle : docCode,
      doc_type: isExternal ? 'EXTERNAL' : (doc.type || 'SOP'),
      docType: isExternal ? 'ED' : (doc.type || 'SOP'),
      edition: docEdition,
      doc_version: doc.rev || docEdition,
      rev: doc.rev || docEdition,
      copy_no: copyNo,
      copyNo: copyNo,
      copy_number: nextNum,
      copyNumber: nextNum,
      ccNumber: nextCcNum,
      issue_no: '01',
      issueNumber: 'I01',
      holder_dept: dept,
      department: dept,
      targetDepartment: dept,
      target_department: dept,
      departmentId: dept,
      dept_code: dept,
      holder: holderName,
      custodianName: holderName,
      holder_name: holderName,
      location: locName,
      locationName: locName,
      workstationLocation: locName,
      locationId: locId,
      station_id: locId,
      station_name: locName,
      status: 'PENDING_ISSUE',
      is_replacement: false,
      is_external: isExternal,
      isExternal: isExternal,
      dispatched_at: null,
      dispatched_by: null,
      createdAt: nowIso,
      distributedDate: todayStr,
      dateIssued: todayStr,
      receipt_confirmed_at: null,
      receipt_confirmed_by: null,
      receipt_remarks: null,
      recall_task_id: null
    };

    const auditLog = {
      id: `audit-${Date.now()}`,
      timestamp: nowIso,
      user: state.currentUser?.name || 'DCC Admin',
      action: 'ISSUE_COPY',
      docTitle: docCode,
      docRev: newInst.rev,
      ccNumber: newInst.ccNumber,
      copyCode,
      oldStatus: '-',
      newStatus: newInst.status,
      remarks: `Issued new controlled copy to ${dept} (${locName})`
    };

    const finalCopies = [...copies, newInst];
    const updatedExternalDocs = isExternal
      ? (state.externalDocuments || []).map(d => d.id === doc.id ? {
          ...d,
          distributionList: [...(d.distributionList || []), newInst],
          controlledCopies: [...(d.controlledCopies || []), newInst]
        } : d)
      : state.externalDocuments;

    return {
      externalDocuments: updatedExternalDocs,
      documentControlledCopies: finalCopies,
      controlledCopyInstances: finalCopies,
      controlledCopyAuditTrail: [auditLog, ...state.controlledCopyAuditTrail],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_ISSUE',
        actor: state.currentUser?.name || 'DCC Admin',
        details: `Issued controlled copy for ${docCode} at ${locName}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  requestAdditionalControlledCopies: (docId, newLocationsList = [], reason = '') => isApiMode ? apiCopies.call('requestAdditionalCopies', typeof docId === 'object' && docId ? (docId.documentId || docId.docId || docId.id) : docId, newLocationsList, reason) : set((state) => {
    // Support both positional (docId, newLocationsList, reason) and object payload ({ documentId, docCode, locations, ... })
    let targetId = docId;
    let targetCode = typeof docId === 'string' ? docId : '';
    let locationsList = newLocationsList;
    let requestReason = reason;

    if (docId && typeof docId === 'object' && !Array.isArray(docId)) {
      targetId = docId.documentId || docId.docId || docId.externalDocId || docId.id || '';
      targetCode = docId.docCode || docId.edCode || docId.doc_code || docId.code || docId.docNo || docId.title || '';
      if (!Array.isArray(locationsList) || locationsList.length === 0) {
        if (Array.isArray(docId.locations)) locationsList = docId.locations;
        else if (Array.isArray(docId.newLocationsList)) locationsList = docId.newLocationsList;
        else if (Array.isArray(docId.copies)) locationsList = docId.copies;
        else if (docId.department || docId.departmentId || docId.location || docId.locationName) locationsList = [docId];
      }
      if (!requestReason && (docId.reason || docId.requestReason)) {
        requestReason = docId.reason || docId.requestReason;
      }
    }

    if (!Array.isArray(locationsList)) {
      locationsList = locationsList ? [locationsList] : [];
    }

    const matchDoc = (d) => {
      if (!d) return false;
      const idMatch = targetId && String(d.id) === String(targetId);
      const dCodes = [d.code, d.edCode, d.doc_code, d.docCode, d.docNo, d.document_code, d.title].filter(Boolean).map(v => String(v).trim());
      const codeMatch = (targetCode && dCodes.includes(String(targetCode).trim())) || (targetId && dCodes.includes(String(targetId).trim()));
      return Boolean(idMatch || codeMatch);
    };

    const internalDoc = (state.documents || []).find(d => matchDoc(d) && (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded)
      || (state.documents || []).find(matchDoc);
    const externalDoc = (state.externalDocuments || []).find(d => matchDoc(d) && (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded && !d.is_obsolete)
      || (state.externalDocuments || []).find(matchDoc);

    const doc = internalDoc || externalDoc;
    if (!doc) return state;

    const isInternal = Boolean(internalDoc);
    const isExternal = !isInternal;
    const docCode = doc.code || doc.edCode || doc.doc_code || doc.docCode || doc.docNo || doc.document_code || doc.title;
    const docTitle = doc.title;
    const docName = doc.name || doc.title;
    const docEdition = doc.edition || doc.sourceVersion || doc.rev || '01';
    const docVersion = doc.rev || doc.sourceVersion || doc.edition || '01';

    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies && state.documentControlledCopies.length > 0 ? state.documentControlledCopies : (state.controlledCopyInstances || []));

    // Deduplicate & filter active physical copies using getActivePhysicalCopies
    const activeDocCopies = getActivePhysicalCopies(copies, doc);

    // Helper to extract sequence number from -C01, CC-001, Copy 01, or numeric fields
    const extractCopySeq = (c) => {
      if (!c) return 0;
      if (typeof c.copy_number === 'number' && !isNaN(c.copy_number)) return c.copy_number;
      if (typeof c.copyNumber === 'number' && !isNaN(c.copyNumber)) return c.copyNumber;
      const codeStr = String(c.copyCode || c.copy_code || c.copy_no || c.copyNo || c.ccNumber || '');
      const cMatch = codeStr.match(/-C(\d+)$/i) || codeStr.match(/^CC-(\d+)$/i) || codeStr.match(/^Copy\s*(\d+)$/i);
      if (cMatch) return parseInt(cMatch[1], 10) || 0;
      const rawNum = c.copy_number ?? c.copyNumber ?? c.copy_no ?? c.copyNo ?? (c.ccNumber ? String(c.ccNumber).replace(/\D/g, '') : null);
      const parsed = parseInt(rawNum, 10);
      return isNaN(parsed) ? 0 : parsed;
    };

    // Scan activeDocCopies AND doc.distributionList / doc.controlledCopies / doc.distributions for this docCode
    const copyPoolForSeq = [
      ...activeDocCopies,
      ...(Array.isArray(doc.distributionList) ? doc.distributionList : []),
      ...(Array.isArray(doc.controlledCopies) ? doc.controlledCopies : []),
      ...(Array.isArray(doc.distributions) ? doc.distributions : []),
      ...(Array.isArray(doc.distribution) ? doc.distribution : [])
    ];
    const copyNumbers = copyPoolForSeq.map(extractCopySeq);
    const distListLength = Array.isArray(doc.distributionList)
      ? doc.distributionList.filter(d => d && d.status !== 'RETIRED' && d.status !== 'DESTROYED' && d.status !== 'VOID').length
      : 0;
    let maxCopyNo = Math.max(...copyNumbers, distListLength, 0);

    const requesterName = state.currentUser ? state.currentUser.name : 'Owner Department';
    const requesterDept = state.currentUser ? (state.currentUser.department || state.currentUser.dept) : (doc.department || 'PD');
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    const newCreatedCopies = [];
    const newDistributionListEntries = [];
    const newAuditLogs = [];
    const newTargetDepts = new Set((doc.distributions || []).map(d => d.departmentId || d.dept));
    if (doc.department) newTargetDepts.add(doc.department);

    locationsList.forEach((loc, idx) => {
      maxCopyNo += 1;
      const copyNoStr = String(maxCopyNo).padStart(2, '0');
      const ccNumStr = `CC-${String(maxCopyNo).padStart(3, '0')}`;
      const copyCode = `${docCode}-C${copyNoStr}`;
      
      // Target Department of this station: MUST be strictly preserved, NEVER falling back to doc.department
      const targetDept = loc.target_department || loc.targetDepartment || loc.departmentId || loc.department || loc.dept || loc.dept_code;
      const dept = targetDept || (loc.locationId && state.distributionLocations?.find(s => s.id === loc.locationId)?.departmentId) || requesterDept;
      newTargetDepts.add(dept);

      const locName = loc.workstationLocation || loc.station_name || loc.locationName || loc.location_name || loc.name || loc.location || `${dept} Head Office`;
      const locId = loc.station_id || loc.location_id || loc.locationId || loc.id || `${dept}-LOC-${idx + 1}`;
      const holderName = loc.holder || loc.custodianName || loc.holder_name || loc.holderName || `${dept} (${locName})`;

      const newCopy = {
        id: `cc-adhoc-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        copyCode,
        copy_code: copyCode,
        doc_id: doc.id,
        docId: doc.id,
        documentId: doc.id,
        external_doc_id: isExternal ? doc.id : null,
        externalDocId: isExternal ? doc.id : null,
        document_code: docCode,
        documentCode: docCode,
        doc_code: docCode,
        docCode: docCode,
        document_title: docName,
        doc_title: docName,
        docTitle: docTitle,
        doc_type: isExternal ? 'EXTERNAL' : (doc.type || 'SOP'),
        docType: isExternal ? 'ED' : (doc.type || 'SOP'),
        docName: docName,
        edition: docEdition,
        sourceVersion: docEdition,
        doc_version: docVersion,
        rev: docVersion,
        copy_no: copyNoStr,
        copyNo: copyNoStr,
        copy_number: maxCopyNo,
        copyNumber: maxCopyNo,
        ccNumber: ccNumStr,
        issue_no: '01',
        issueNumber: 'I01',
        owner_dept: doc.department || 'PD',
        target_department: dept,       // << MANDATORY field for cross-department routing
        targetDepartment: dept,
        destination_dept: dept,
        destinationDept: dept,
        holder_dept: dept,
        department: dept,
        departmentId: dept,
        dept_code: dept,
        holder: holderName,
        custodianName: holderName,
        holder_name: holderName,
        holderName: holderName,
        location: locName,
        locationName: locName,
        location_name: locName,
        workstationLocation: locName,
        locationId: locId,
        location_id: locId,
        station_id: locId,
        station_name: locName,
        status: loc.status || 'PENDING_ISSUE',
        is_replacement: false,
        is_adhoc: true,
        is_external: isExternal,
        isExternal: isExternal,
        request_reason: requestReason,
        requested_by: requesterName,
        requested_at: nowIso,
        createdAt: nowIso,
        distributedDate: todayStr,
        dispatched_at: null,
        dispatched_by: null,
        receipt_confirmed_at: null,
        receipt_confirmed_by: null,
        receipt_remarks: null,
        recall_task_id: null,
        dateIssued: todayStr
      };

      newCreatedCopies.push(newCopy);
      newDistributionListEntries.push({
        id: newCopy.id,
        copyId: newCopy.id,
        copyCode,
        copy_no: copyNoStr,
        copyNo: copyNoStr,
        copy_number: maxCopyNo,
        copyNumber: maxCopyNo,
        ccNumber: ccNumStr,
        documentId: doc.id,
        docId: doc.id,
        externalDocId: isExternal ? doc.id : null,
        docCode: docCode,
        doc_code: docCode,
        documentCode: docCode,
        department: dept,
        targetDepartment: dept,
        target_department: dept,
        holder_dept: dept,
        departmentId: dept,
        holder: holderName,
        custodianName: holderName,
        holder_name: holderName,
        location: locName,
        locationName: locName,
        workstationLocation: locName,
        locationId: locId,
        station_id: locId,
        station_name: locName,
        distributedDate: todayStr,
        dateIssued: todayStr,
        createdAt: nowIso,
        status: newCopy.status,
        is_external: isExternal,
        isExternal: isExternal,
        doc_type: isExternal ? 'EXTERNAL' : (doc.type || 'SOP'),
        docType: isExternal ? 'ED' : (doc.type || 'SOP'),
        edition: docEdition,
        rev: docVersion
      });

      newAuditLogs.push({
        id: `audit-adhoc-${Date.now()}-${idx}`,
        timestamp: nowIso,
        user: requesterName,
        action: 'REQUEST_ADDITIONAL_COPIES',
        docTitle: docCode,
        docRev: docVersion,
        ccNumber: ccNumStr,
        copyCode,
        oldStatus: '-',
        newStatus: 'PENDING_ISSUE',
        remarks: `Requested ad-hoc copy for ${dept} (${locName}). Reason: ${requestReason}`
      });
    });

    // Update Document distributions
    const updatedDistributions = [...(doc.distributions || [])];
    locationsList.forEach(loc => {
      const dept = loc.target_department || loc.targetDepartment || loc.departmentId || loc.department || loc.dept || loc.dept_code || requesterDept;
      const locName = loc.workstationLocation || loc.station_name || loc.locationName || loc.name || loc.location || `${dept} Head Office`;
      const locId = loc.station_id || loc.locationId || loc.id;
      if (!updatedDistributions.some(d => (d.departmentId === dept || d.dept === dept || d.dept_code === dept) && (d.locationId === locId || d.station_id === locId))) {
        updatedDistributions.push({
          departmentId: dept,
          dept: dept,
          dept_code: dept,
          locationId: locId,
          station_id: locId,
          locationName: locName,
          station_name: locName,
          location: locName,
          name: locName,
          isCustom: !!(loc.isCustom || loc.is_custom)
        });
      }
    });

    const updatedDocuments = isInternal
      ? state.documents.map(d => d.id === doc.id ? { ...d, distributions: updatedDistributions, target_depts: Array.from(newTargetDepts) } : d)
      : state.documents;

    const updatedExternalDocs = isExternal
      ? (state.externalDocuments || []).map(d => {
          const isTargetExt = String(d.id) === String(doc.id) ||
            ((d.code === docCode || d.edCode === docCode || d.doc_code === docCode || d.docNo === docCode) && (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && !d.is_superseded);
          if (!isTargetExt) return d;
          return {
            ...d,
            distributions: updatedDistributions,
            distributionList: [...(d.distributionList || []), ...newDistributionListEntries],
            controlledCopies: [...(d.controlledCopies || []), ...newDistributionListEntries]
          };
        })
      : state.externalDocuments;

    // Create DCC task for issuing copies
    const taskId = `task-dcc-issue-${doc.id}-${Date.now()}`;
    const docOfficialTitle = doc.name || doc.document_name || doc.docName || doc.title || docCode;
    const dccTask = {
      id: taskId,
      referenceType: isExternal ? 'EXTERNAL_DOC' : 'INTERNAL_DOC',
      type: 'DCC_DISTRIBUTE',
      assignee_department: 'DC',
      document_department: doc.department || 'QC',
      taskType: 'DCC_ISSUE_CONTROLLED_COPIES',
      title: `ขอออกสำเนาควบคุมเพิ่มเติม: ${docOfficialTitle} (${docCode}) (${locationsList.length} จุด)`,
      description: `แผนก ${requesterDept} โดยคุณ ${requesterName} ขอรับสำเนาควบคุมเพิ่มเติมสำหรับ ${docCode} (${docOfficialTitle}) (Rev.${docVersion}) จำนวน ${locationsList.length} เล่ม เหตุผล: ${requestReason}`,
      docId: doc.id,
      documentId: doc.id,
      darId: isInternal ? doc.id : null,
      externalDocId: isExternal ? doc.id : null,
      doc_code: docCode,
      docCode: docCode,
      documentCode: docCode,
      is_external: isExternal,
      isExternal: isExternal,
      doc_type: isExternal ? 'EXTERNAL' : (doc.type || 'SOP'),
      docType: isExternal ? 'ED' : (doc.type || 'SOP'),
      edition: docEdition,
      copyCodes: newCreatedCopies.map(c => c.copyCode),
      docTitle: docOfficialTitle,
      docName: docOfficialTitle,
      doc_version: docVersion,
      assigneeId: resolveDccAdminUserId(state.masterUsers),
      assignedToRole: 'DCC_ADMIN',
      targetRole: 'DCC_ADMIN',
      target_role: 'DCC_ADMIN',
      department: 'DC',
      target_department: 'DC',
      targetDepartment: 'DC',
      origin: isExternal ? 'EXTERNAL' : 'INTERNAL',
      status: 'PENDING',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: nowIso
    };

    const finalCopies = [...copies, ...newCreatedCopies];

    return {
      documents: updatedDocuments,
      externalDocuments: updatedExternalDocs,
      documentControlledCopies: finalCopies,
      controlledCopyInstances: finalCopies,
      tasks: [dccTask, ...state.tasks],
      controlledCopyAuditTrail: [...newAuditLogs, ...state.controlledCopyAuditTrail],
      notifications: [{
        id: `notif-adhoc-${Date.now()}`,
        userId: resolveDccAdminUserId(state.masterUsers),
        title: 'มีคำขอออกสำเนาควบคุมเพิ่มเติม',
        message: `แผนก ${requesterDept} ขอรับสำเนาควบคุมสำหรับ ${docCode} เพิ่มเติม ${locationsList.length} จุด`,
        isRead: false,
        link: '/controlled-copy?tab=PENDING_ISSUE',
        timestamp: nowIso
      }, ...state.notifications],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'REQUEST_ADDITIONAL_COPIES',
        actor: requesterName,
        details: `Requested ${locationsList.length} additional copies for ${docCode}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  reportCcDamagedLost: (instId, type, reason) => isApiMode ? apiCopies.call('reportCopyDamagedOrLost', instId, type, reason) : set((state) => {
    const targetId = String(instId || '').trim();
    if (!targetId) return state;

    // 1. Comprehensive Copy Resolution across all controlled copy stores
    const copiesPool = [
      ...(state.controlledCopyInstances || []),
      ...(state.documentControlledCopies || [])
    ];
    let inst = copiesPool.find(i => String(i.id) === targetId || String(i.copyId || i.ccNumber) === targetId);

    // Fallback: search in nested document.controlledCopies
    if (!inst && Array.isArray(state.documents)) {
      for (const d of state.documents) {
        if (Array.isArray(d.controlledCopies)) {
          const found = d.controlledCopies.find(c => String(c.id) === targetId || String(c.copyId || c.ccNumber) === targetId);
          if (found) {
            inst = {
              ...found,
              docId: found.docId || d.id,
              doc_id: found.doc_id || d.id,
              docTitle: found.docTitle || d.title,
              doc_code: found.doc_code || d.title,
              holder_dept: found.holder_dept || found.department || d.department
            };
            break;
          }
        }
      }
    }

    if (!inst) {
      console.warn(`[reportCcDamagedLost] Controlled copy instance with ID ${targetId} not found in state.`);
      return state;
    }

    // 🛡️ Idempotency Guard: prevent duplicate reporting on copy already in terminal or pending state
    const invalidStatuses = [
      'PENDING_RECALL', 'DAMAGED_PENDING_RECALL', 'LOST', 'LOST_RECORDED',
      'DECLARED_LOST', 'RECALLED', 'DESTROYED', 'RECALLED_DESTROYED',
      'REPLACED_VOID', 'DAMAGED_PENDING_REPLACEMENT'
    ];
    if (invalidStatuses.includes(inst.status) || (type === 'DAMAGED' && (inst.isDamaged || inst.status === 'DAMAGED_PENDING_RECALL' || inst.status === 'PENDING_RECALL'))) {
      console.warn(`[reportCcDamagedLost] Copy ${targetId} is already in state ${inst.status}. Skipping duplicate request.`);
      return state;
    }

    // 🛡️ Dynamic RBAC & Department Custodianship Guard
    const user = state.currentUser;
    const copyDept = (inst.holder_dept || inst.department || inst.departmentId || inst.dept_code || inst.target_department || '').toString().trim();

    if (user && !canManageControlledCopy(user, inst)) {
      console.warn(`[Security Guard] Unauthorized reportCcDamagedLost: User ${user?.name} (${user?.department}) cannot manage copy for department ${copyDept}`);
      throw new Error(`ปฏิเสธการทำรายการ: คุณไม่มีสิทธิ์จัดการสำเนาควบคุมของแผนก ${copyDept}`);
    }

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const reporterName = user?.name || user?.fullName || 'Authorized User';

    // 2. Safe Issue Number Calculation (Guarded against non-string types)
    const rawIssue = String(inst.issue_no || inst.issueNumber || '1');
    const currentIssue = parseInt(rawIssue.replace(/\D/g, ''), 10) || 1;
    const nextIssueNo = String(currentIssue + 1).padStart(2, '0');
    const nextIssue = `I${nextIssueNo}`;

    const isDamaged = type === 'DAMAGED';
    const newStatus = isDamaged ? 'DAMAGED_PENDING_RECALL' : 'LOST';

    const relatedDoc = (state.documents || []).find(d => 
      String(d.id) === String(inst.doc_id || inst.docId) || 
      d.title === (inst.doc_code || inst.docTitle) || 
      d.document_code === (inst.doc_code || inst.docTitle)
    );
    const docOfficialTitle = inst.docName || inst.name || relatedDoc?.name || relatedDoc?.document_name || inst.doc_code || inst.docTitle || 'เอกสารควบคุม';
    const docCode = inst.doc_code || inst.docTitle || relatedDoc?.title || relatedDoc?.document_code || 'DOC';
    const dccAdminId = resolveDccAdminUserId(state.masterUsers);

    // 3. Audit log entry
    const auditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: nowIso,
      user: reporterName,
      action: isDamaged ? 'REPORT_DAMAGED' : 'REPORT_LOST',
      docTitle: docCode,
      docRev: inst.doc_version || inst.rev || '01',
      ccNumber: inst.copy_no || inst.ccNumber || '01',
      oldStatus: inst.status,
      newStatus: newStatus,
      remarks: isDamaged 
        ? `สำเนาชุดที่ ${inst.copy_no || inst.ccNumber || '01'} ได้รับการแจ้งชำรุดโดย ${reporterName} (${copyDept || inst.department}) -> สร้างงานเรียกคืนเล่มเดิมและตั้งเรื่องออกสำเนาทดแทน (เหตุผล: ${reason})`
        : `สำเนาชุดที่ ${inst.copy_no || inst.ccNumber || '01'} ได้รับการแจ้งสูญหายโดย ${reporterName} (${copyDept || inst.department}) -> ปลดออกจากทะเบียนสำเนาใช้งาน (LOST) และตั้งเรื่องออกสำเนาทดแทน (เหตุผล: ${reason})`
    };

    // 4. Replacement Copy Instance (Enqueued to PENDING_ISSUE for DCC)
    const replacementCopy = {
      id: `cc-rep-${inst.id}-${Date.now()}`,
      doc_id: inst.doc_id || inst.docId,
      docId: inst.doc_id || inst.docId,
      external_doc_id: inst.external_doc_id || inst.externalDocId,
      externalDocId: inst.external_doc_id || inst.externalDocId,
      document_code: docCode,
      doc_code: docCode,
      docCode: docCode,
      document_title: docOfficialTitle,
      doc_title: docOfficialTitle,
      docTitle: docOfficialTitle,
      docName: docOfficialTitle,
      doc_type: inst.doc_type || inst.docType,
      docType: inst.doc_type || inst.docType,
      doc_version: inst.doc_version || inst.rev || '01',
      rev: inst.doc_version || inst.rev || '01',
      copy_no: inst.copy_no || inst.ccNumber || '01',
      copyNo: inst.copy_no || inst.ccNumber || '01',
      ccNumber: inst.ccNumber || (inst.copy_no ? (inst.copy_no.startsWith('CC-') || inst.copy_no.startsWith('Copy') ? inst.copy_no : `Copy ${inst.copy_no}`) : 'Copy 01'),
      issue_no: nextIssueNo,
      issueNumber: nextIssue,
      holder_dept: copyDept || inst.department,
      department: copyDept || inst.department,
      departmentId: copyDept || inst.department,
      dept_code: copyDept || inst.department,
      holder_name: inst.holder_name || `${copyDept || inst.department} (${inst.location || inst.locationName || 'Main Station'})`,
      location: inst.location || inst.locationName || `${copyDept || 'Station'} Point-of-Use`,
      locationName: inst.location || inst.locationName || `${copyDept || 'Station'} Point-of-Use`,
      locationId: inst.locationId || inst.station_id || `${copyDept}-STATION`,
      station_id: inst.locationId || inst.station_id || `${copyDept}-STATION`,
      station_name: inst.location || inst.locationName || `${copyDept || 'Station'} Point-of-Use`,
      status: 'PENDING_ISSUE',
      is_replacement: true,
      is_adhoc: false,
      isDamaged: false,
      is_damaged: false,
      replaced_copy_id: inst.id,
      replacement_reason: `${type}: ${reason}`,
      requested_by: reporterName,
      requested_at: nowIso,
      dateIssued: todayStr,
      dispatched_at: null,
      dispatched_by: null,
      receipt_confirmed_at: null,
      receipt_confirmed_by: null,
      receipt_remarks: null,
      recall_task_id: null
    };

    // 5. Task for DCC to Issue Replacement Copy
    const dccIssueTask = {
      id: `task-dcc-replacement-${inst.id}-${Date.now()}`,
      type: 'DCC_DISTRIBUTE',
            assignee_department: 'DC',
            document_department: 'QC',
      taskType: 'DCC_ISSUE_CONTROLLED_COPIES',
      task_type: 'DISTRIBUTION',
      title: `ออกสำเนาควบคุมทดแทน (Issue ${nextIssueNo}): ${docOfficialTitle} (${docCode}) (${inst.copy_no || inst.ccNumber || '01'})`,
      description: `แผนก ${copyDept || inst.department} แจ้ง${isDamaged ? 'ชำรุด' : 'สูญหาย'} ประจำจุด ${inst.location || inst.locationName || 'สถานีใช้งาน'} เหตุผล: ${reason}`,
      docId: inst.doc_id || inst.docId,
      doc_id: inst.doc_id || inst.docId,
      doc_code: docCode,
      docCode: docCode,
      docTitle: docOfficialTitle,
      docName: docOfficialTitle,
      doc_version: inst.doc_version || inst.rev || '01',
      copyId: replacementCopy.id,
      copy_id: replacementCopy.id,
      instanceId: replacementCopy.id,
      copy_no: inst.copy_no || inst.ccNumber || '01',
      issue_no: nextIssueNo,
      issueNumber: nextIssue,
      assigneeId: dccAdminId,
      assignedToRole: 'DCC_ADMIN',
      targetRole: 'DCC_ADMIN',
      target_role: 'DCC_ADMIN',
      department: 'DC',
      target_department: 'DC',
      targetDepartment: 'DC',
      status: 'PENDING',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: nowIso
    };

    // 6. Recall Task for DCC (ONLY for DAMAGED, NEVER for LOST)
    let dccRecallTask = null;
    if (isDamaged) {
      dccRecallTask = {
        id: `task-dcc-recall-${inst.id}-${Date.now()}`,
        type: 'DCC_RECALL',
            assignee_department: 'DC',
            document_department: 'QC',
        taskType: 'RECALL',
        task_type: 'RECALL',
        title: `เรียกคืนสำเนาชำรุด: ${docCode}${docOfficialTitle && docOfficialTitle !== docCode ? ` (${docOfficialTitle})` : ''} (${inst.copy_no ? (inst.copy_no.startsWith('Copy') ? inst.copy_no : `Copy ${inst.copy_no}`) : (inst.ccNumber || 'Copy 01')})`,
        description: `แผนก ${copyDept || inst.department} แจ้งชำรุด ประจำจุด ${inst.location || inst.locationName || copyDept} เหตุผล: ${reason} (กรุณาเรียกคืนเล่มชำรุดมาทำลายตามระเบียบ ISO 9001)`,
        docId: inst.doc_id || inst.docId,
        doc_id: inst.doc_id || inst.docId,
        doc_code: docCode,
        docCode: docCode,
        docTitle: docOfficialTitle,
        docName: docOfficialTitle,
        doc_version: inst.doc_version || inst.rev || '01',
        copyId: inst.id,
        copy_id: inst.id,
        instanceId: inst.id,
        copy_no: inst.copy_no || inst.ccNumber || '01',
        location: inst.location || inst.locationName || copyDept,
        department: copyDept || inst.department || 'PD',
        holder_dept: copyDept || inst.department,
        target_department: 'DC',
        targetDepartment: 'DC',
        targetRole: 'DCC_ADMIN',
        target_role: 'DCC_ADMIN',
        assignedToRole: 'DCC_ADMIN',
        assigneeId: dccAdminId,
        status: 'PENDING',
        priority: 'HIGH',
        isDamaged: true,
        is_damaged: true,
        reason: 'DAMAGED',
        actionRequired: true,
        is_completed: false,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        createdAt: nowIso
      };
    }

    // 7. Dynamic Notifications
    const newNotifications = [...(state.notifications || [])];
    newNotifications.push({
      id: `notif-rep-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: dccAdminId,
      targetUserIds: dccAdminId ? [dccAdminId] : [],
      targetRole: 'DCC_ADMIN',
      targetDepartment: 'DC',
      title: `มีคำขอออกสำเนาทดแทน (${isDamaged ? 'ชำรุด' : 'สูญหาย'})`,
      message: `แผนก ${copyDept || inst.department} แจ้งออกสำเนาทดแทน ${docCode} (${inst.copy_no || inst.ccNumber || '01'}) จุด ${inst.location || inst.locationName || 'สถานีใช้งาน'}`,
      type: 'TASK_ASSIGNED',
      category: 'CONTROLLED_COPY',
      isRead: false,
      read: false,
      readBy: [],
      link: isDamaged ? '/controlled-copy?tab=RECALL_CHECKLIST' : '/controlled-copy?tab=PENDING_ISSUE',
      timestamp: nowIso,
      docCode: docCode
    });

    if (user?.id) {
      newNotifications.push({
        id: `notif-rep-req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: user.id,
        targetUserIds: [user.id],
        title: 'ยื่นคำร้องขอสำเนาทดแทนสำเร็จ',
        message: `แจ้ง${isDamaged ? 'ชำรุด' : 'สูญหาย'} สำหรับสำเนา ${docCode} (${inst.copy_no || inst.ccNumber || '01'}) เรียบร้อยแล้ว (รอ DCC จัดพิมพ์ Issue ${nextIssueNo})`,
        type: 'SUCCESS',
        category: 'CONTROLLED_COPY',
        isRead: false,
        read: false,
        readBy: [],
        link: '/library',
        timestamp: nowIso,
        docCode: docCode
      });
    }

    // 8. Unified Update across Controlled Copy Instances and Documents
    const existingCopies = [
      ...(state.controlledCopyInstances || []),
      ...(state.documentControlledCopies || [])
    ];
    const seenIds = new Set();
    const updatedCopies = [];

    existingCopies.forEach(c => {
      const cId = String(c.id);
      if (seenIds.has(cId)) return;
      seenIds.add(cId);

      if (cId === targetId) {
        updatedCopies.push({
          ...c,
          status: newStatus,
          isDamaged: isDamaged,
          is_damaged: isDamaged,
          isLost: !isDamaged,
          is_lost: !isDamaged,
          replacementReason: type,
          replacement_reason: type,
          reportType: type,
          reportReason: reason,
          reportRequesterName: reporterName,
          reportRequesterId: user ? user.id : null,
          reportedAt: nowIso,
          reported_at: nowIso
        });
      } else {
        updatedCopies.push(c);
      }
    });

    updatedCopies.push(replacementCopy);

    // Also update document.controlledCopies in state.documents if present
    const updatedDocs = (state.documents || []).map(d => {
      if (Array.isArray(d.controlledCopies) && d.controlledCopies.some(c => String(c.id) === targetId)) {
        return {
          ...d,
          controlledCopies: [
            ...d.controlledCopies.map(c => String(c.id) === targetId ? {
              ...c,
              status: newStatus,
              isDamaged: isDamaged,
              is_damaged: isDamaged,
              isLost: !isDamaged,
              is_lost: !isDamaged,
              reportedAt: nowIso
            } : c),
            replacementCopy
          ]
        };
      }
      return d;
    });

    const tasksToAdd = dccRecallTask ? [dccRecallTask, dccIssueTask] : [dccIssueTask];

    return {
      documents: updatedDocs,
      documentControlledCopies: updatedCopies,
      controlledCopyInstances: updatedCopies,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      tasks: [...tasksToAdd, ...(state.tasks || [])],
      notifications: newNotifications,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_REPORT_REPLACEMENT',
        actor: reporterName,
        details: `Reported copy ${targetId} as ${type} and auto-enqueued replacement copy ${replacementCopy.id}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  // Record physical receipt of recalled copy by DCC
  recordCopyRecalled: (copyId, notes = '') => isApiMode ? apiCopies.stepCopy('recall', copyId, notes) : set((state) => {
    const targetId = String(copyId);
    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);
    const inst = copies.find(i => String(i.id) === targetId);
    if (!inst) return state;

    const nowIso = new Date().toISOString();
    const userName = state.currentUser ? state.currentUser.name : 'DCC Officer';

    const updatedCopies = copies.map(i => {
      if (String(i.id) === targetId) {
        return {
          ...i,
          status: 'RECALLED',
          recalled_at: nowIso,
          recalled_by: userName,
          dcc_notes: notes || i.dcc_notes || '',
          dateRecalled: nowIso.split('T')[0]
        };
      }
      return i;
    });

    const auditLog = {
      id: `audit-recall-${Date.now()}`,
      timestamp: nowIso,
      user: userName,
      action: 'CC_RECALL_RECEIVED',
      docTitle: inst.doc_code || inst.docTitle,
      docRev: inst.doc_version || inst.rev,
      ccNumber: inst.copy_no || inst.ccNumber,
      oldStatus: inst.status,
      newStatus: 'RECALLED',
      remarks: `DCC บันทึกรับคืนเล่มชำรุด Copy ${inst.copy_no || inst.ccNumber} จากแผนก ${inst.holder_dept || inst.department} เรียบร้อยแล้ว (รอทำลาย)`
    };

    return {
      controlledCopyInstances: updatedCopies,
      documentControlledCopies: updatedCopies,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_RECALL_RECEIVED',
        actor: userName,
        details: `Recorded physical receipt of recalled copy ${targetId}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // ISO 9001 Clause 7.5.3 – Controlled Copy Custody Workflow
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * requestCcRelocation
   * Dept custodian requests to move a controlled copy to a new physical station.
   * Enforces: Origin Invariant (Copy 01 may NOT be relocated).
   * Creates: DCC task type DCC_RELOCATE, sets copy status → RELOCATION_PENDING_APPROVAL.
   */
  requestCcRelocation: (copyId, { newLocation, newDepartment, reason } = {}) => isApiMode ? apiCopies.call('requestCopyRelocation', copyId, { newLocation, newDepartment, reason }) : set((state) => {
    if (!copyId || !reason) return state;
    const targetId = String(copyId).trim();

    // 1. Resolve copy instance across both stores
    const copiesPool = [
      ...(state.controlledCopyInstances || []),
      ...(state.documentControlledCopies || [])
    ];
    let inst = copiesPool.find(i => String(i.id) === targetId);
    if (!inst && Array.isArray(state.documents)) {
      for (const d of state.documents) {
        if (Array.isArray(d.controlledCopies)) {
          const found = d.controlledCopies.find(c => String(c.id) === targetId);
          if (found) {
            inst = { ...found, docId: found.docId || d.id, doc_id: found.doc_id || d.id, docTitle: found.docTitle || d.title, doc_code: found.doc_code || d.title, holder_dept: found.holder_dept || found.department || d.department };
            break;
          }
        }
      }
    }
    if (!inst) { console.warn(`[requestCcRelocation] Copy ${targetId} not found.`); return state; }

    // 2. Custodianship RBAC Invariant Guard
    const user = state.currentUser;
    if (user && !canManageControlledCopy(user, inst)) {
      const copyDept = (inst.holder_dept || inst.department || inst.recipient_department || 'ผู้ครอบครอง').toString().trim();
      console.warn(`[Security Guard] Unauthorized requestCcRelocation: User ${user?.name} (${user?.department}) cannot relocate copy for department ${copyDept}`);
      throw new Error(`ปฏิเสธการทำรายการ: คุณไม่มีสิทธิ์จัดการสำเนาควบคุมของแผนก ${copyDept}`);
    }

    // 3. Origin Invariant Guard: Copy 01 (จุดต้นทาง) cannot be relocated
    const rawNo = String(inst.copy_no || inst.ccNumber || '01');
    const copyNum = parseInt(rawNo.replace(/\D/g, ''), 10) || 1;
    const isOriginCopy = inst.is_owner || inst.isOwner || copyNum === 1;
    if (isOriginCopy) {
      console.warn(`[requestCcRelocation] Origin copy (Copy 01) cannot be relocated.`);
      return state;
    }

    // 4. Idempotency Guard
    if (inst.status === 'RELOCATION_PENDING_APPROVAL') {
      console.warn(`[requestCcRelocation] Copy ${targetId} already has a pending relocation.`);
      return state;
    }

    const nowIso = new Date().toISOString();
    const reporterName = user?.name || user?.fullName || 'Authorized User';
    const copyDept = (inst.holder_dept || inst.department || '').toString().trim();
    const docCode = inst.doc_code || inst.docTitle || 'DOC';
    const docOfficialTitle = inst.docName || inst.name || inst.doc_code || inst.docTitle || 'เอกสารควบคุม';
    const dccAdminId = resolveDccAdminUserId(state.masterUsers);
    const taskId = `task-cc-relocate-${targetId}-${Date.now()}`;

    // 4. Audit log
    const auditLog = {
      id: `audit-relocate-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: nowIso,
      user: reporterName,
      action: 'REQUEST_RELOCATION',
      docTitle: docCode,
      docRev: inst.doc_version || inst.rev || '01',
      ccNumber: inst.copy_no || inst.ccNumber || '01',
      oldStatus: inst.status,
      newStatus: 'RELOCATION_PENDING_APPROVAL',
      remarks: `สำเนาชุดที่ ${rawNo} แจ้งขอย้ายจุดติดตั้งจาก ${inst.location || inst.locationName || copyDept} → ${newLocation || newDepartment || 'ตำแหน่งใหม่'} (เหตุผล: ${reason})`
    };

    // 5. DCC custody task
    const dccTask = {
      id: taskId,
      type: 'DCC_RELOCATE',
      taskType: 'DCC_RELOCATE',
      task_type: 'DCC_RELOCATE',
      title: `ขอย้ายจุดติดตั้งสำเนาควบคุม: ${docOfficialTitle} (${docCode}) Copy ${rawNo}`,
      description: `${reporterName} (${copyDept}) แจ้งขอย้ายสำเนา Copy ${rawNo} จาก "${inst.location || inst.locationName || copyDept}" ไปยัง "${newLocation || newDepartment || 'ตำแหน่งใหม่'}" เหตุผล: ${reason}`,
      docId: inst.doc_id || inst.docId,
      doc_id: inst.doc_id || inst.docId,
      doc_code: docCode,
      docCode: docCode,
      docTitle: docOfficialTitle,
      copyId: targetId,
      copy_id: targetId,
      instanceId: targetId,
      copy_no: rawNo,
      currentLocation: inst.location || inst.locationName || copyDept,
      currentDepartment: copyDept,
      newLocation: newLocation || '',
      newDepartment: newDepartment || copyDept,
      reason,
      requesterId: user?.id,
      requesterName: reporterName,
      requesterDept: copyDept,
      assigneeId: dccAdminId,
      assignedToRole: 'DCC_ADMIN',
      targetRole: 'DCC_ADMIN',
      target_role: 'DCC_ADMIN',
      department: 'DC',
      target_department: 'DC',
      targetDepartment: 'DC',
      status: 'PENDING',
      priority: 'NORMAL',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: nowIso
    };

    // 6. Update copy status in both pools
    const updateCopy = (c) =>
      String(c.id) === targetId
        ? { ...c, status: 'RELOCATION_PENDING_APPROVAL', pendingRelocationTaskId: taskId, pendingNewLocation: newLocation, pendingNewDepartment: newDepartment }
        : c;
    const updatedInstances = (state.controlledCopyInstances || []).map(updateCopy);
    const updatedDcc = (state.documentControlledCopies || []).map(updateCopy);
    const updatedDocs = (state.documents || []).map(d =>
      Array.isArray(d.controlledCopies) && d.controlledCopies.some(c => String(c.id) === targetId)
        ? { ...d, controlledCopies: d.controlledCopies.map(updateCopy) }
        : d
    );

    // 7. Notifications
    const newNotifications = [...(state.notifications || [])];
    newNotifications.push({
      id: `notif-relocate-dcc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: dccAdminId,
      targetUserIds: [dccAdminId],
      targetRole: 'DCC_ADMIN',
      targetDepartment: 'DC',
      title: 'คำขอย้ายจุดติดตั้งสำเนาควบคุม',
      message: `${reporterName} (${copyDept}) ขอย้าย ${docCode} Copy ${rawNo} → ${newLocation || newDepartment || 'ตำแหน่งใหม่'}`,
      type: 'TASK_ASSIGNED',
      category: 'CONTROLLED_COPY',
      isRead: false,
      read: false,
      readBy: [],
      link: '/tasks',
      timestamp: nowIso,
      relatedTaskId: taskId,
      docCode: docCode
    });
    if (user?.id) {
      newNotifications.push({
        id: `notif-relocate-req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: user.id,
        targetUserIds: [user.id],
        title: 'ยื่นคำร้องขอย้ายจุดติดตั้งสำเร็จ',
        message: `คำขอย้ายสำเนา ${docCode} Copy ${rawNo} ส่งถึง DCC แล้ว (รอดำเนินการ)`,
        type: 'SUCCESS',
        category: 'CONTROLLED_COPY',
        isRead: false,
        read: false,
        readBy: [],
        link: '/library',
        timestamp: nowIso,
        docCode: docCode
      });
    }

    return {
      documents: updatedDocs,
      controlledCopyInstances: updatedInstances,
      documentControlledCopies: updatedDcc,
      tasks: [dccTask, ...(state.tasks || [])],
      notifications: newNotifications,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_REQUEST_RELOCATION',
        actor: reporterName,
        details: `Requested relocation of copy ${targetId} → ${newLocation || newDepartment}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  /**
   * requestCcReturn
   * Dept custodian requests to return/decommission a distributed controlled copy.
   * Enforces: Origin Invariant (Copy 01 may NOT be returned).
   * Creates: DCC task type DCC_RETURN, sets copy status → RETURN_PENDING_APPROVAL.
   */
  requestCcReturn: (copyId, { reason, returnDate } = {}) => isApiMode ? apiCopies.call('requestCopyReturn', copyId, { reason, returnDate }) : set((state) => {
    if (!copyId || !reason) return state;
    const targetId = String(copyId).trim();

    // 1. Resolve copy instance
    const copiesPool = [
      ...(state.controlledCopyInstances || []),
      ...(state.documentControlledCopies || [])
    ];
    let inst = copiesPool.find(i => String(i.id) === targetId);
    if (!inst && Array.isArray(state.documents)) {
      for (const d of state.documents) {
        if (Array.isArray(d.controlledCopies)) {
          const found = d.controlledCopies.find(c => String(c.id) === targetId);
          if (found) {
            inst = { ...found, docId: found.docId || d.id, doc_id: found.doc_id || d.id, docTitle: found.docTitle || d.title, doc_code: found.doc_code || d.title, holder_dept: found.holder_dept || found.department || d.department };
            break;
          }
        }
      }
    }
    if (!inst) { console.warn(`[requestCcReturn] Copy ${targetId} not found.`); return state; }

    // 2. Custodianship RBAC Invariant Guard
    const user = state.currentUser;
    if (user && !canManageControlledCopy(user, inst)) {
      const copyDept = (inst.holder_dept || inst.department || inst.recipient_department || 'ผู้ครอบครอง').toString().trim();
      console.warn(`[Security Guard] Unauthorized requestCcReturn: User ${user?.name} (${user?.department}) cannot return copy for department ${copyDept}`);
      throw new Error(`ปฏิเสธการทำรายการ: คุณไม่มีสิทธิ์จัดการสำเนาควบคุมของแผนก ${copyDept}`);
    }

    // 3. Origin Invariant Guard
    const rawNo = String(inst.copy_no || inst.ccNumber || '01');
    const copyNum = parseInt(rawNo.replace(/\D/g, ''), 10) || 1;
    const isOriginCopy = inst.is_owner || inst.isOwner || copyNum === 1;
    if (isOriginCopy) {
      console.warn(`[requestCcReturn] Origin copy (Copy 01) cannot be returned.`);
      return state;
    }

    // 4. Idempotency Guard
    if (inst.status === 'RETURN_PENDING_APPROVAL') {
      console.warn(`[requestCcReturn] Copy ${targetId} already has a pending return.`);
      return state;
    }

    const nowIso = new Date().toISOString();
    const reporterName = user?.name || user?.fullName || 'Authorized User';
    const copyDept = (inst.holder_dept || inst.department || '').toString().trim();
    const docCode = inst.doc_code || inst.docTitle || 'DOC';
    const docOfficialTitle = inst.docName || inst.name || inst.doc_code || inst.docTitle || 'เอกสารควบคุม';
    const dccAdminId = resolveDccAdminUserId(state.masterUsers);
    const taskId = `task-cc-return-${targetId}-${Date.now()}`;

    // 4. Audit log
    const auditLog = {
      id: `audit-return-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: nowIso,
      user: reporterName,
      action: 'REQUEST_RETURN',
      docTitle: docCode,
      docRev: inst.doc_version || inst.rev || '01',
      ccNumber: inst.copy_no || inst.ccNumber || '01',
      oldStatus: inst.status,
      newStatus: 'RETURN_PENDING_APPROVAL',
      remarks: `สำเนาชุดที่ ${rawNo} แจ้งขอส่งคืน / ยกเลิกสำเนาโดย ${reporterName} (${copyDept}) เหตุผล: ${reason}`
    };

    // 5. DCC custody task
    const dccTask = {
      id: taskId,
      type: 'DCC_RETURN',
      taskType: 'DCC_RETURN',
      task_type: 'DCC_RETURN',
      title: `ขอส่งคืน / ยกเลิกสำเนาควบคุม: ${docOfficialTitle} (${docCode}) Copy ${rawNo}`,
      description: `${reporterName} (${copyDept}) แจ้งส่งคืนสำเนา Copy ${rawNo} จุด "${inst.location || inst.locationName || copyDept}" เหตุผล: ${reason}`,
      docId: inst.doc_id || inst.docId,
      doc_id: inst.doc_id || inst.docId,
      doc_code: docCode,
      docCode: docCode,
      docTitle: docOfficialTitle,
      copyId: targetId,
      copy_id: targetId,
      instanceId: targetId,
      copy_no: rawNo,
      currentLocation: inst.location || inst.locationName || copyDept,
      currentDepartment: copyDept,
      reason,
      returnDate: returnDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      requesterId: user?.id,
      requesterName: reporterName,
      requesterDept: copyDept,
      assigneeId: dccAdminId,
      assignedToRole: 'DCC_ADMIN',
      targetRole: 'DCC_ADMIN',
      target_role: 'DCC_ADMIN',
      department: 'DC',
      target_department: 'DC',
      targetDepartment: 'DC',
      status: 'PENDING',
      priority: 'NORMAL',
      dueDate: returnDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: nowIso
    };

    // 6. Update copy status
    const updateCopy = (c) =>
      String(c.id) === targetId
        ? { ...c, status: 'RETURN_PENDING_APPROVAL', pendingReturnTaskId: taskId }
        : c;
    const updatedInstances = (state.controlledCopyInstances || []).map(updateCopy);
    const updatedDcc = (state.documentControlledCopies || []).map(updateCopy);
    const updatedDocs = (state.documents || []).map(d =>
      Array.isArray(d.controlledCopies) && d.controlledCopies.some(c => String(c.id) === targetId)
        ? { ...d, controlledCopies: d.controlledCopies.map(updateCopy) }
        : d
    );

    // 7. Notifications
    const newNotifications = [...(state.notifications || [])];
    newNotifications.push({
      id: `notif-return-dcc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: dccAdminId,
      targetUserIds: [dccAdminId],
      targetRole: 'DCC_ADMIN',
      targetDepartment: 'DC',
      title: 'คำขอส่งคืน / ยกเลิกสำเนาควบคุม',
      message: `${reporterName} (${copyDept}) ขอส่งคืน ${docCode} Copy ${rawNo} (${inst.location || inst.locationName || copyDept})`,
      type: 'TASK_ASSIGNED',
      category: 'CONTROLLED_COPY',
      isRead: false,
      read: false,
      readBy: [],
      link: '/tasks',
      timestamp: nowIso,
      relatedTaskId: taskId,
      docCode: docCode
    });
    if (user?.id) {
      newNotifications.push({
        id: `notif-return-req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: user.id,
        targetUserIds: [user.id],
        title: 'ยื่นคำร้องขอส่งคืนสำเร็จ',
        message: `คำขอส่งคืนสำเนา ${docCode} Copy ${rawNo} ส่งถึง DCC แล้ว (รอดำเนินการ)`,
        type: 'SUCCESS',
        category: 'CONTROLLED_COPY',
        isRead: false,
        read: false,
        readBy: [],
        link: '/library',
        timestamp: nowIso,
        docCode: docCode
      });
    }

    return {
      documents: updatedDocs,
      controlledCopyInstances: updatedInstances,
      documentControlledCopies: updatedDcc,
      tasks: [dccTask, ...(state.tasks || [])],
      notifications: newNotifications,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_REQUEST_RETURN',
        actor: reporterName,
        details: `Requested return/decommission of copy ${targetId}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  /**
   * approveCcRelocation
   * DCC Admin approves a relocation request. Requires checklistVerified === true (ISO 9001 Clause 7.5.3).
   * Updates copy location, department, and reverts status to ISSUED_ACTIVE.
   */
  approveCcRelocation: (taskId, { notes = '', checklistVerified = false } = {}) => isApiMode ? (checklistVerified && apiCopies.call('decideCopyRequest', taskId, 'APPROVE', { notes })) : set((state) => {
    if (!checklistVerified) {
      console.warn('[approveCcRelocation] Cannot approve without checklist verification (ISO 9001 Clause 7.5.3).');
      return state;
    }
    const task = (state.tasks || []).find(t => t.id === taskId);
    if (!task) { console.warn(`[approveCcRelocation] Task ${taskId} not found.`); return state; }

    const nowIso = new Date().toISOString();
    const user = state.currentUser;
    const approverName = user?.name || user?.fullName || 'DCC Officer';
    const targetId = String(task.copyId || task.copy_id || task.instanceId || '').trim();

    const updateCopy = (c) => {
      if (String(c.id) !== targetId) return c;
      return {
        ...c,
        status: 'ISSUED_ACTIVE',
        location: task.newLocation || c.location,
        locationName: task.newLocation || c.locationName,
        station_name: task.newLocation || c.station_name,
        department: task.newDepartment || c.department,
        holder_dept: task.newDepartment || c.holder_dept,
        pendingRelocationTaskId: null,
        pendingNewLocation: null,
        pendingNewDepartment: null,
        lastRelocatedAt: nowIso,
        lastRelocatedBy: approverName
      };
    };

    const auditLog = {
      id: `audit-relocate-approve-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: nowIso,
      user: approverName,
      action: 'APPROVE_RELOCATION',
      docTitle: task.docCode || task.doc_code || 'DOC',
      ccNumber: task.copy_no || '01',
      oldStatus: 'RELOCATION_PENDING_APPROVAL',
      newStatus: 'ISSUED_ACTIVE',
      remarks: `DCC อนุมัติย้ายจุดติดตั้งสำเนา Copy ${task.copy_no} → "${task.newLocation || task.newDepartment || 'ตำแหน่งใหม่'}" (ตรวจสอบสถานีจริงแล้ว) หมายเหตุ: ${notes}`
    };

    const newNotifications = [...(state.notifications || [])];
    if (task.requesterId) {
      newNotifications.push({
        id: `notif-relocate-approved-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: task.requesterId,
        targetUserIds: [task.requesterId],
        title: 'คำขอย้ายจุดติดตั้งได้รับการอนุมัติ',
        message: `DCC อนุมัติย้าย ${task.docCode || task.doc_code || 'สำเนา'} Copy ${task.copy_no} ไปยัง "${task.newLocation || task.newDepartment || 'ตำแหน่งใหม่'}" แล้ว`,
        type: 'SUCCESS',
        category: 'CONTROLLED_COPY',
        isRead: false,
        read: false,
        readBy: [],
        link: '/library',
        timestamp: nowIso,
        docCode: task.docCode || task.doc_code
      });
    }

    return {
      tasks: (state.tasks || []).map(t => t.id === taskId ? { ...t, status: 'COMPLETED', is_completed: true, completedAt: nowIso, completedBy: approverName, dccNotes: notes } : t),
      controlledCopyInstances: (state.controlledCopyInstances || []).map(updateCopy),
      documentControlledCopies: (state.documentControlledCopies || []).map(updateCopy),
      documents: (state.documents || []).map(d =>
        Array.isArray(d.controlledCopies) && d.controlledCopies.some(c => String(c.id) === targetId)
          ? { ...d, controlledCopies: d.controlledCopies.map(updateCopy) }
          : d
      ),
      notifications: newNotifications,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_APPROVE_RELOCATION',
        actor: approverName,
        details: `Approved relocation of copy ${targetId} → ${task.newLocation || task.newDepartment}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  /**
   * rejectCcRelocation
   * DCC Admin rejects a relocation request. Reverts copy status to ISSUED_ACTIVE.
   */
  rejectCcRelocation: (taskId, { rejectReason = '' } = {}) => isApiMode ? apiCopies.call('decideCopyRequest', taskId, 'REJECT', { rejectReason }) : set((state) => {
    const task = (state.tasks || []).find(t => t.id === taskId);
    if (!task) { console.warn(`[rejectCcRelocation] Task ${taskId} not found.`); return state; }

    const nowIso = new Date().toISOString();
    const user = state.currentUser;
    const rejecterName = user?.name || user?.fullName || 'DCC Officer';
    const targetId = String(task.copyId || task.copy_id || task.instanceId || '').trim();

    const revertCopy = (c) =>
      String(c.id) === targetId
        ? { ...c, status: 'ISSUED_ACTIVE', pendingRelocationTaskId: null, pendingNewLocation: null, pendingNewDepartment: null }
        : c;

    const auditLog = {
      id: `audit-relocate-reject-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: nowIso,
      user: rejecterName,
      action: 'REJECT_RELOCATION',
      docTitle: task.docCode || task.doc_code || 'DOC',
      ccNumber: task.copy_no || '01',
      oldStatus: 'RELOCATION_PENDING_APPROVAL',
      newStatus: 'ISSUED_ACTIVE',
      remarks: `DCC ปฏิเสธคำขอย้ายจุดติดตั้งสำเนา Copy ${task.copy_no} เหตุผล: ${rejectReason}`
    };

    const newNotifications = [...(state.notifications || [])];
    if (task.requesterId) {
      newNotifications.push({
        id: `notif-relocate-rejected-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: task.requesterId,
        targetUserIds: [task.requesterId],
        title: 'คำขอย้ายจุดติดตั้งถูกปฏิเสธ',
        message: `DCC ปฏิเสธคำขอย้าย ${task.docCode || task.doc_code || 'สำเนา'} Copy ${task.copy_no} เหตุผล: ${rejectReason}`,
        type: 'WARNING',
        category: 'CONTROLLED_COPY',
        isRead: false,
        read: false,
        readBy: [],
        link: '/library',
        timestamp: nowIso,
        docCode: task.docCode || task.doc_code
      });
    }

    return {
      tasks: (state.tasks || []).map(t => t.id === taskId ? { ...t, status: 'COMPLETED', is_completed: true, completedAt: nowIso, completedBy: rejecterName, rejectReason, outcome: 'REJECTED' } : t),
      controlledCopyInstances: (state.controlledCopyInstances || []).map(revertCopy),
      documentControlledCopies: (state.documentControlledCopies || []).map(revertCopy),
      documents: (state.documents || []).map(d =>
        Array.isArray(d.controlledCopies) && d.controlledCopies.some(c => String(c.id) === targetId)
          ? { ...d, controlledCopies: d.controlledCopies.map(revertCopy) }
          : d
      ),
      notifications: newNotifications,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_REJECT_RELOCATION',
        actor: rejecterName,
        details: `Rejected relocation request for copy ${targetId}. Reason: ${rejectReason}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  /**
   * approveCcReturn
   * DCC Admin approves a return/decommission request. Requires checklistVerified === true.
   * Sets copy status to RECALLED (archived, removed from active station inventory).
   */
  approveCcReturn: (taskId, { dispositionMethod = 'ARCHIVE', witnessName = '', notes = '', checklistVerified = false } = {}) => isApiMode ? (checklistVerified && apiCopies.call('decideCopyRequest', taskId, 'APPROVE', { notes, dispositionMethod, witnessName })) : set((state) => {
    if (!checklistVerified) {
      console.warn('[approveCcReturn] Cannot approve without checklist verification (ISO 9001 Clause 7.5.3).');
      return state;
    }
    const task = (state.tasks || []).find(t => t.id === taskId);
    if (!task) { console.warn(`[approveCcReturn] Task ${taskId} not found.`); return state; }

    const nowIso = new Date().toISOString();
    const user = state.currentUser;
    const approverName = user?.name || user?.fullName || 'DCC Officer';
    const targetId = String(task.copyId || task.copy_id || task.instanceId || '').trim();
    const finalStatus = dispositionMethod === 'DESTROY' ? 'RECALLED_DESTROYED' : 'RECALLED';

    const updateCopy = (c) =>
      String(c.id) === targetId
        ? {
            ...c,
            status: finalStatus,
            pendingReturnTaskId: null,
            recalled_at: nowIso,
            recalled_by: approverName,
            recall_disposition: dispositionMethod,
            recall_witness: witnessName,
            dcc_notes: notes
          }
        : c;

    const auditLog = {
      id: `audit-return-approve-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: nowIso,
      user: approverName,
      action: 'APPROVE_RETURN',
      docTitle: task.docCode || task.doc_code || 'DOC',
      ccNumber: task.copy_no || '01',
      oldStatus: 'RETURN_PENDING_APPROVAL',
      newStatus: finalStatus,
      remarks: `DCC อนุมัติรับคืน / ยกเลิกสำเนา Copy ${task.copy_no} วิธีจัดการ: ${dispositionMethod} พยาน: ${witnessName || '-'} หมายเหตุ: ${notes}`
    };

    const newNotifications = [...(state.notifications || [])];
    if (task.requesterId) {
      newNotifications.push({
        id: `notif-return-approved-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: task.requesterId,
        targetUserIds: [task.requesterId],
        title: 'คำขอส่งคืนได้รับการอนุมัติ',
        message: `DCC อนุมัติรับคืน ${task.docCode || task.doc_code || 'สำเนา'} Copy ${task.copy_no} เรียบร้อยแล้ว`,
        type: 'SUCCESS',
        category: 'CONTROLLED_COPY',
        isRead: false,
        read: false,
        readBy: [],
        link: '/library',
        timestamp: nowIso,
        docCode: task.docCode || task.doc_code
      });
    }

    return {
      tasks: (state.tasks || []).map(t => t.id === taskId ? { ...t, status: 'COMPLETED', is_completed: true, completedAt: nowIso, completedBy: approverName, dccNotes: notes } : t),
      controlledCopyInstances: (state.controlledCopyInstances || []).map(updateCopy),
      documentControlledCopies: (state.documentControlledCopies || []).map(updateCopy),
      documents: (state.documents || []).map(d =>
        Array.isArray(d.controlledCopies) && d.controlledCopies.some(c => String(c.id) === targetId)
          ? { ...d, controlledCopies: d.controlledCopies.map(updateCopy) }
          : d
      ),
      notifications: newNotifications,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_APPROVE_RETURN',
        actor: approverName,
        details: `Approved return/decommission of copy ${targetId}. Disposition: ${dispositionMethod}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  /**
   * rejectCcReturn
   * DCC Admin rejects a return request. Reverts copy status to ISSUED_ACTIVE.
   */
  rejectCcReturn: (taskId, { rejectReason = '' } = {}) => isApiMode ? apiCopies.call('decideCopyRequest', taskId, 'REJECT', { rejectReason }) : set((state) => {
    const task = (state.tasks || []).find(t => t.id === taskId);
    if (!task) { console.warn(`[rejectCcReturn] Task ${taskId} not found.`); return state; }

    const nowIso = new Date().toISOString();
    const user = state.currentUser;
    const rejecterName = user?.name || user?.fullName || 'DCC Officer';
    const targetId = String(task.copyId || task.copy_id || task.instanceId || '').trim();

    const revertCopy = (c) =>
      String(c.id) === targetId
        ? { ...c, status: 'ISSUED_ACTIVE', pendingReturnTaskId: null }
        : c;

    const auditLog = {
      id: `audit-return-reject-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: nowIso,
      user: rejecterName,
      action: 'REJECT_RETURN',
      docTitle: task.docCode || task.doc_code || 'DOC',
      ccNumber: task.copy_no || '01',
      oldStatus: 'RETURN_PENDING_APPROVAL',
      newStatus: 'ISSUED_ACTIVE',
      remarks: `DCC ปฏิเสธคำขอส่งคืนสำเนา Copy ${task.copy_no} เหตุผล: ${rejectReason}`
    };

    const newNotifications = [...(state.notifications || [])];
    if (task.requesterId) {
      newNotifications.push({
        id: `notif-return-rejected-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: task.requesterId,
        targetUserIds: [task.requesterId],
        title: 'คำขอส่งคืนถูกปฏิเสธ',
        message: `DCC ปฏิเสธคำขอส่งคืน ${task.docCode || task.doc_code || 'สำเนา'} Copy ${task.copy_no} เหตุผล: ${rejectReason}`,
        type: 'WARNING',
        category: 'CONTROLLED_COPY',
        isRead: false,
        read: false,
        readBy: [],
        link: '/library',
        timestamp: nowIso,
        docCode: task.docCode || task.doc_code
      });
    }

    return {
      tasks: (state.tasks || []).map(t => t.id === taskId ? { ...t, status: 'COMPLETED', is_completed: true, completedAt: nowIso, completedBy: rejecterName, rejectReason, outcome: 'REJECTED' } : t),
      controlledCopyInstances: (state.controlledCopyInstances || []).map(revertCopy),
      documentControlledCopies: (state.documentControlledCopies || []).map(revertCopy),
      documents: (state.documents || []).map(d =>
        Array.isArray(d.controlledCopies) && d.controlledCopies.some(c => String(c.id) === targetId)
          ? { ...d, controlledCopies: d.controlledCopies.map(revertCopy) }
          : d
      ),
      notifications: newNotifications,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_REJECT_RETURN',
        actor: rejecterName,
        details: `Rejected return/decommission request for copy ${targetId}. Reason: ${rejectReason}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  // Quick-toggle physical receipt of recalled copy (Step 1 <-> Step 2)
  toggleCopyRecallReceived: (copyId) => set((state) => {
    const targetId = String(copyId);
    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);
    const inst = copies.find(i => String(i.id) === targetId);
    if (!inst) return state;

    const isCurrentlyReceived = inst.status === 'RECALLED' || inst.status === 'RECEIVED_AT_DCC' || inst.status === 'RECALLED_HELD_AT_DCC';
    const nowIso = new Date().toISOString();
    const userName = state.currentUser ? state.currentUser.name : 'DCC Officer';

    let newStatus;
    let recalledAt;
    let recalledBy;

    if (isCurrentlyReceived) {
      // Revert to Step 1 (Waiting for collection)
      newStatus = inst.previous_recall_status || 
                  (inst.isDamaged || inst.is_damaged ? 'DAMAGED_PENDING_RECALL' : 'SUPERSEDED_PENDING_RECALL');
      recalledAt = null;
      recalledBy = null;
    } else {
      // Advance to Step 2 (Held at DCC awaiting disposition/destruction)
      newStatus = 'RECALLED';
      recalledAt = nowIso;
      recalledBy = userName;
    }

    const updatedCopies = copies.map(c => {
      if (String(c.id) === targetId) {
        return {
          ...c,
          status: newStatus,
          previous_recall_status: isCurrentlyReceived ? null : (c.status || 'PENDING_RECALL'),
          recalled_at: recalledAt,
          recalled_by: recalledBy,
          dateRecalled: recalledAt ? recalledAt.split('T')[0] : null
        };
      }
      return c;
    });

    const auditLog = {
      id: `audit-toggle-recall-${Date.now()}`,
      timestamp: nowIso,
      user: userName,
      action: isCurrentlyReceived ? 'CC_RECALL_RECEIPT_REVERTED' : 'CC_RECALL_RECEIVED',
      docTitle: inst.doc_code || inst.docTitle,
      docRev: inst.doc_version || inst.rev,
      ccNumber: inst.copy_no || inst.ccNumber,
      oldStatus: inst.status,
      newStatus: newStatus,
      remarks: isCurrentlyReceived
        ? `DCC ยกเลิกการบันทึกรับคืนเล่ม Copy ${inst.copy_no || inst.ccNumber} (กลับสู่สถานะรอเก็บเล่มจากหน้างาน)`
        : `DCC บันทึกตรวจรับเล่มจริง Copy ${inst.copy_no || inst.ccNumber} ประจำจุด ${inst.location || inst.locationName} กลับสู่ DCC เรียบร้อยแล้ว (รอการจัดการ/ทำลาย)`
    };

    return {
      controlledCopyInstances: updatedCopies,
      documentControlledCopies: updatedCopies,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: isCurrentlyReceived ? 'CC_RECALL_REVERT' : 'CC_RECALL_RECEIVED',
        actor: userName,
        details: `${isCurrentlyReceived ? 'Reverted' : 'Recorded'} physical receipt of copy ${targetId}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  // Destroy recalled physical copy and resolve DCC_RECALL tasks
  destroyControlledCopy: (copyId, dispositionMethod = 'SHRED', notes = '', witnessName = '', referenceNo = '') => set((state) => {
    const targetId = String(copyId);
    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);
    const inst = copies.find(i => String(i.id) === targetId);
    if (!inst) return state;

    const isLostVoided = dispositionMethod === 'LOST_VOIDED';
    const finalStatus = isLostVoided ? 'LOST_VOIDED' : 'DESTROYED';
    const nowIso = new Date().toISOString();
    const userName = state.currentUser ? state.currentUser.name : 'DCC Officer';

    const updatedCopies = copies.map(i => {
      if (String(i.id) === targetId) {
        return {
          ...i,
          status: finalStatus,
          disposition_type: finalStatus,
          dispositionType: finalStatus,
          disposition_method: dispositionMethod,
          dispositionMethod: dispositionMethod,
          destroyed_at: nowIso,
          destroyed_by: userName,
          recalled_at: i.recalled_at || nowIso,
          recalled_by: i.recalled_by || userName,
          disposed_at: nowIso,
          disposedAt: nowIso,
          disposed_by: userName,
          disposedBy: userName,
          dcc_notes: notes || i.dcc_notes || '',
          witness_name: witnessName || i.witness_name || '',
          reference_no: referenceNo || i.reference_no || '',
          dateDestroyed: finalStatus === 'DESTROYED' ? nowIso.split('T')[0] : i.dateDestroyed,
          dateVoided: isLostVoided ? nowIso.split('T')[0] : undefined
        };
      }
      return i;
    });

    // 🛡️ Dedicated Disposition Ledger Entry (Append-Only)
    const dispRecord = {
      id: `DISP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      copyId: inst.id,
      copy_id: inst.id,
      docCode: inst.doc_code || inst.docTitle || '',
      docTitle: inst.docName || inst.doc_title || inst.docTitle || '',
      revision: inst.doc_version || inst.rev || '01',
      copyNumber: inst.copy_no ? (String(inst.copy_no).startsWith('Copy') ? inst.copy_no : `Copy ${inst.copy_no}`) : (inst.ccNumber || 'Copy 01'),
      copy_no: inst.copy_no || inst.ccNumber || '01',
      department: inst.holder_dept || inst.department || '',
      location: inst.location || inst.locationName || inst.station_name || '',
      dispositionType: finalStatus,
      dispositionMethod: dispositionMethod,
      disposedBy: state.currentUser ? `${state.currentUser.name} (${state.currentUser.empId || state.currentUser.role || 'DCC'})` : `${userName} (DCC)`,
      disposed_by_name: userName,
      disposed_by_id: state.currentUser?.id || '',
      disposedAt: nowIso,
      witnessName: witnessName || '',
      witness_name: witnessName || '',
      referenceNo: referenceNo || '',
      reference_no: referenceNo || '',
      notes: notes || ''
    };

    // Check and resolve any DCC_RECALL task associated with this copy or document
    const updatedTasks = (state.tasks || []).map(t => {
      // STRICT ISOLATION GUARD: Never touch distribution tasks!
      if (t.type === 'DCC_DISTRIBUTE' || t.taskType === 'DISTRIBUTION' || t.task_type === 'DISTRIBUTION') return t;

      const isRecallTask = t.type === 'DCC_RECALL' || t.taskType === 'RECALL' || t.task_type === 'RECALL' || t.type === 'RECALL';
      if (!isRecallTask) return t;

      const isMatch = (t.copyId && String(t.copyId) === targetId) ||
                      (t.instanceId && String(t.instanceId) === targetId) ||
                      (t.copy_id && String(t.copy_id) === targetId) ||
                      (t.supersededCopyIds && Array.isArray(t.supersededCopyIds) && t.supersededCopyIds.some(sid => String(sid) === targetId));

      if (isMatch) {
        if (t.supersededCopyIds && Array.isArray(t.supersededCopyIds) && t.supersededCopyIds.length > 0) {
          const allResolved = t.supersededCopyIds.every(id => {
            const c = updatedCopies.find(copy => String(copy.id) === String(id));
            return !c || c.status === 'DESTROYED' || c.status === 'ARCHIVED_OBSOLETE' || c.status === 'OBSOLETE' || c.status === 'RECALLED' || c.status === 'LOST_VOIDED' || c.status === 'DISPOSED_LOST';
          });
          if (allResolved) {
            return {
              ...t,
              status: 'COMPLETED',
              is_completed: true,
              actionRequired: false,
              completedAt: nowIso,
              completed_at: nowIso
            };
          }
          return t;
        }

        return {
          ...t,
          status: 'COMPLETED',
          is_completed: true,
          actionRequired: false,
          completedAt: nowIso,
          completed_at: nowIso
        };
      }
      return t;
    });

    const cleanedTasks = cleanupDccTasks(updatedTasks, updatedCopies, state.documents, state.dars);

    const auditAction = isLostVoided ? 'DISPOSE_CONTROLLED_COPY_LOST' : 'CONTROLLED_COPY_DISPOSITION';
    const auditLog = {
      id: `audit-destroy-${Date.now()}`,
      timestamp: nowIso,
      user: userName,
      action: auditAction,
      docTitle: inst.doc_code || inst.docTitle,
      docRev: inst.doc_version || inst.rev,
      ccNumber: inst.copy_no || inst.ccNumber,
      oldStatus: inst.status,
      newStatus: finalStatus,
      remarks: isLostVoided
        ? `DCC บันทึกจำหน่ายสูญหาย (Lost / Voided) สำหรับสำเนา Copy ${inst.copy_no || inst.ccNumber} ของ ${inst.doc_code || inst.docTitle} เรียบร้อยแล้ว`
        : `DCC บันทึกการทำลาย (${dispositionMethod}) สำหรับสำเนา Copy ${inst.copy_no || inst.ccNumber} ของ ${inst.doc_code || inst.docTitle} เรียบร้อยแล้ว`
    };

    return {
      controlledCopyInstances: updatedCopies,
      documentControlledCopies: updatedCopies,
      copyDispositionRecords: [dispRecord, ...(state.copyDispositionRecords || [])],
      dispositionHistory: [dispRecord, ...(state.dispositionHistory || [])],
      tasks: cleanedTasks,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: isLostVoided ? 'DISPOSE_CONTROLLED_COPY_LOST' : 'CC_DESTROYED',
        action: isLostVoided ? 'DISPOSE_CONTROLLED_COPY_LOST' : 'CC_DESTROYED',
        actor: userName,
        details: isLostVoided
          ? `Disposed lost copy ${targetId} via LOST_VOIDED`
          : `Destroyed copy ${targetId} via ${dispositionMethod}`,
        timestamp: nowIso
      }, ...(state.actionLog || [])]
    };
  }),

  approveCcReplacement: (taskId) => set((state) => {
    const task = state.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return state;

    const instId = String(task.instanceId);
    const copies = state.documentControlledCopies || state.controlledCopyInstances || [];
    const oldInst = copies.find(i => String(i.id) === instId);
    if (!oldInst) return state;

    const updatedInstances = copies.map(inst =>
      String(inst.id) === instId ? { ...inst, status: oldInst.reportType } : inst
    );

    const currentIssue = parseInt((oldInst.issue_no || oldInst.issueNumber || '1').replace('I', '')) || 1;
    const nextIssue = `I${String(currentIssue + 1).padStart(2, '0')}`;
    const nextIssueNo = String(currentIssue + 1).padStart(2, '0');

    const newInst = {
      ...oldInst,
      id: `inst-${Date.now()}`,
      document_code: oldInst.document_code || oldInst.doc_code || oldInst.code || oldInst.docNo,
      doc_code: oldInst.document_code || oldInst.doc_code || oldInst.code || oldInst.docNo,
      docCode: oldInst.document_code || oldInst.doc_code || oldInst.code || oldInst.docNo,
      document_title: oldInst.document_title || oldInst.doc_title || oldInst.docName || oldInst.name,
      doc_title: oldInst.document_title || oldInst.doc_title || oldInst.docName || oldInst.name,
      docName: oldInst.document_title || oldInst.doc_title || oldInst.docName || oldInst.name,
      copy_no: oldInst.copy_no || oldInst.ccNumber,
      ccNumber: oldInst.copy_no || oldInst.ccNumber,
      issue_no: nextIssueNo,
      issueNumber: nextIssue,
      status: 'PENDING_ISSUE',
      is_replacement: true,
      dispatched_at: null,
      dispatched_by: null,
      dateIssued: new Date().toISOString().split('T')[0],
      receipt_confirmed_at: null,
      receipt_confirmed_by: null,
      receipt_remarks: null,
      reportType: undefined,
      reportReason: undefined,
      reportRequesterName: undefined,
      reportRequesterId: undefined
    };

    const auditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: state.currentUser.name,
      action: 'APPROVE_REPLACEMENT',
      docTitle: oldInst.doc_code || oldInst.docTitle,
      docRev: oldInst.doc_version || oldInst.rev,
      ccNumber: oldInst.copy_no || oldInst.ccNumber,
      oldStatus: oldInst.status,
      newStatus: oldInst.reportType,
      remarks: `Manager approved replacement for ${oldInst.reportType}. New Issue: ${nextIssue}`
    };

    const newTasks = state.tasks.filter(t => String(t.id) !== String(taskId));
    let newNotifs = state.notifications.map(n => String(n.relatedTaskId) === String(taskId) ? { ...n, isRead: true } : n);

    newNotifs.push({
      id: `notif-dcc-${Date.now()}`,
      userId: resolveDccAdminUserId(state.masterUsers),
      title: 'จัดพิมพ์เอกสารทดแทน',
      message: `ผู้จัดการได้อนุมัติเอกสารทดแทนสำหรับ ${oldInst.copy_no || oldInst.ccNumber} กรุณาจัดพิมพ์และแจกจ่าย`,
      isRead: false,
      link: '/controlled-copy',
      timestamp: new Date().toISOString()
    });

    const finalInstances = [...updatedInstances, newInst];
    return { 
      documentControlledCopies: finalInstances,
      controlledCopyInstances: finalInstances,
      controlledCopyAuditTrail: [auditLog, ...state.controlledCopyAuditTrail],
      tasks: cleanupDccTasks(newTasks, finalInstances, state.documents),
      notifications: newNotifs,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_REPLACE_APPROVE',
        actor: state.currentUser.name,
        details: `Approved replacement for task ${taskId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  rejectCcReplacement: (taskId, reason) => set((state) => {
    const task = state.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return state;

    const instId = String(task.instanceId);
    const copies = state.documentControlledCopies || state.controlledCopyInstances || [];
    const inst = copies.find(i => String(i.id) === instId);
    if (!inst) return state;

    const auditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: state.currentUser.name,
      action: 'REJECT_REPLACEMENT',
      docTitle: inst.doc_code || inst.docTitle,
      docRev: inst.doc_version || inst.rev,
      ccNumber: inst.copy_no || inst.ccNumber,
      oldStatus: inst.status,
      newStatus: 'ISSUED_ACTIVE',
      remarks: `Manager rejected replacement request. Reason: ${reason}`
    };

    const newTasks = state.tasks.filter(t => String(t.id) !== String(taskId));
    let newNotifs = state.notifications.map(n => String(n.relatedTaskId) === String(taskId) ? { ...n, isRead: true } : n);

    newNotifs.push({
      id: `notif-rej-${Date.now()}`,
      userId: inst.reportRequesterId,
      title: 'ปฏิเสธคำขอทดแทนเอกสาร',
      message: `คำขอทดแทนเอกสาร ${inst.copy_no || inst.ccNumber} ถูกปฏิเสธ: ${reason}`,
      isRead: false,
      link: '/dashboard',
      timestamp: new Date().toISOString()
    });

    const updatedCopies = copies.map(i =>
      String(i.id) === instId ? { ...i, status: 'ISSUED_ACTIVE', reportType: undefined, reportReason: undefined, reportRequesterName: undefined, reportRequesterId: undefined } : i
    );

    return {
      documentControlledCopies: updatedCopies,
      controlledCopyInstances: updatedCopies,
      controlledCopyAuditTrail: [auditLog, ...state.controlledCopyAuditTrail],
      tasks: newTasks,
      notifications: newNotifs,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_REPLACE_REJECT',
        actor: state.currentUser.name,
        details: `Rejected replacement for task ${taskId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  recallControlledCopy: (instId) => set((state) => {
    const targetId = String(instId);
    const copies = state.documentControlledCopies || state.controlledCopyInstances || [];
    const inst = copies.find(i => String(i.id) === targetId);
    if (!inst) return state;

    const auditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: state.currentUser.name,
      action: 'RECALL_COPY',
      docTitle: inst.doc_code || inst.docTitle,
      docRev: inst.doc_version || inst.rev,
      ccNumber: inst.copy_no || inst.ccNumber,
      oldStatus: inst.status,
      newStatus: 'RECALLED_DESTROYED',
      remarks: `Recalled copy due to obsolescence or new revision`
    };

    const newInstances = copies.map(i => 
      String(i.id) === targetId ? { ...i, status: 'RECALLED_DESTROYED', dateRecalled: new Date().toISOString().split('T')[0], recalled_at: new Date().toISOString(), recalled_by: state.currentUser.name } : i
    );
    return {
      documentControlledCopies: newInstances,
      controlledCopyInstances: newInstances,
      controlledCopyAuditTrail: [auditLog, ...state.controlledCopyAuditTrail],
      tasks: cleanupDccTasks(state.tasks, newInstances, state.documents),
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'CC_RECALL',
        actor: state.currentUser.name,
        details: `Recalled copy ${targetId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  distributeDocument: (docId, deptId) => set((state) => {
    let updatedDocs = [...state.documents];
    const docIndex = updatedDocs.findIndex(d => d.id === docId);

    if (docIndex > -1) {
      const doc = updatedDocs[docIndex];
      const updatedDistributions = (doc.distributions || []).map(dist => {
        const dId = dist.departmentId || dist.dept;
        if (dId === deptId) {
          return { ...dist, isDistributed: true, distributedAt: new Date().toISOString() };
        }
        return dist;
      });
      updatedDocs[docIndex] = { ...doc, distributions: updatedDistributions };
    }
    
    return { 
      documents: updatedDocs,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'DOC_DISTRIBUTE',
        actor: state.currentUser.name,
        details: `Distributed document ${docId} to ${deptId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  distributeAllDocument: (docId) => set((state) => {
    let updatedDocs = [...state.documents];
    const docIndex = updatedDocs.findIndex(d => d.id === docId);

    if (docIndex > -1) {
      const doc = updatedDocs[docIndex];
      const updatedDistributions = (doc.distributions || []).map(dist => {
        return { ...dist, isDistributed: true, distributedAt: new Date().toISOString() };
      });
      updatedDocs[docIndex] = { ...doc, distributions: updatedDistributions };
    }
    
    return { 
      documents: updatedDocs,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'DOC_DISTRIBUTE_ALL',
        actor: state.currentUser.name,
        details: `Distributed document ${docId} to all departments`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),
});
