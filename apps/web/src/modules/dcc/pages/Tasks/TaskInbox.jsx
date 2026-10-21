import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore, { resolveReceiptTaskDepartment } from '../../../../store/useStore';
import {
  Clock,
  CheckCircle,
  Search,
  ChevronRight,
  FileEdit,
  Eye,
  AlertCircle,
  AlertTriangle,
  FilterX,
  Layers,
  CheckSquare,
  Bell,
  ShieldCheck,
  Send,
  Building2,
  MapPin,
  Zap,
  User,
  ArrowRight,
  FileText,
  Globe,
  Star,
  RotateCcw
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import ExternalDocActionModal from './ExternalDocActionModal';
import PeriodicReviewApprovalModal from './PeriodicReviewApprovalModal';
import ExternalDocFormModal from '../ExternalDocs/ExternalDocFormModal';
import TaskConfirmHardcopyReceiptModal from '../../components/workflow/TaskConfirmHardcopyReceiptModal';
import { isApiMode } from '../../../../api/client';
import DccCustodyActionModal from '../../components/modals/DccCustodyActionModal';
import { ErrorBoundary } from '../../../../shared/components/ErrorBoundary';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import { isActionableTask, isSameDepartment, isDccAdmin, isDccExclusiveTask, isLevel6Plus, isReceiptTask, userMatchesDepartment, normalizeCanonicalDept } from '../../utils/taskFilter';
import { getDeptNameTh } from '../../config/qmsRegistry';
import { getDeptBadgeStyle } from '../../../../shared/utils/departmentColors';

// ─────────────────────────────────────────────────────────────────────────────
// Date Formatter (null-safe)
// ─────────────────────────────────────────────────────────────────────────────
const formatThaiDateTime = (dateInput) => {
  if (!dateInput) return null;
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const thaiMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    const day = d.getDate();
    const month = thaiMonths[d.getMonth()];
    const year = d.getFullYear();
    const dateStr = String(dateInput);
    const hasTime = dateStr.includes('T') || dateStr.match(/\d{2}:\d{2}/);
    if (hasTime) {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day} ${month} ${year}, ${hours}:${minutes} น.`;
    }
    return `${day} ${month} ${year}`;
  } catch {
    return String(dateInput);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper 1: Extract official document code — returns null if none found
// NEVER returns raw task.id / UUIDs / timestamps
// ─────────────────────────────────────────────────────────────────────────────
const isThaiText = (str) => typeof str === 'string' && /[\u0E00-\u0E7F]/.test(str);

export const getDocumentIdentifier = (task, storeContext = {}, matchedDar = null, matchedDoc = null) => {
  if (!task) return null;

  // 1. Direct explicit code fields on task
  const directCandidates = [
    task.docNo,
    task.documentCode,
    task.darData?.docNo,
    task.darData?.documentCode,
    task.documentNumber,
    task.docCode,
    task.doc_code,
    task.doc_number,
    task.docNumber,
    task.document_code,
    task.edCode
  ];

  for (const c of directCandidates) {
    if (c && typeof c === 'string' && c.trim()) {
      const trimmed = c.trim();
      // Guard against title erroneously assigned to docCode (Thai characters)
      if (!isThaiText(trimmed)) {
        return trimmed;
      }
    }
  }

  // 2. Query matched DAR (or dars from storeContext)
  const safeDars = storeContext?.dars || [];
  const dar = matchedDar || safeDars.find(d => 
    (task.darId && (String(d.id) === String(task.darId) || d.darNo === task.darId || d.darNumber === task.darId)) ||
    (task.referenceType === 'INTERNAL_DAR' && String(d.id) === String(task.referenceId))
  );

  if (dar) {
    const darCandidates = [
      dar.docNo,
      dar.documentCode,
      dar.document_code,
      dar.docCode,
      dar.doc_code,
      dar.docIdInput,
      dar.doc_number,
      dar.code
    ];
    for (const dc of darCandidates) {
      if (dc && typeof dc === 'string' && dc.trim() && !isThaiText(dc.trim())) {
        return dc.trim();
      }
    }
  }

  // 3. Query matched Document (or documents from storeContext)
  const safeDocs = storeContext?.documents || [];
  const targetDocId = task.docId || task.doc_id || dar?.docIdRef || dar?.docId || dar?.targetDocumentId;
  const doc = matchedDoc || safeDocs.find(d => 
    (targetDocId && String(d.id) === String(targetDocId)) ||
    (task.docCode && !isThaiText(task.docCode) && (d.title === task.docCode || d.document_code === task.docCode || d.code === task.docCode))
  );

  if (doc) {
    const docCandidates = [
      doc.code,
      doc.document_code,
      doc.doc_code,
      doc.doc_number,
      doc.docNo,
      doc.documentCode,
      doc.title
    ];
    for (const dcc of docCandidates) {
      if (dcc && typeof dcc === 'string' && dcc.trim() && !isThaiText(dcc.trim())) {
        return dcc.trim();
      }
    }
  }

  // 4. Extract standard doc code pattern from title (e.g. SOP-PD-01, WI-WH-002)
  const titleMatch = String(task.title || '').match(
    /\b([A-Z]{1,5}-[A-Z&]{1,6}-\d{2,4}(?:-\d{1,3})?)\b/
  );
  if (titleMatch) return titleMatch[1];

  // 5. Formal DAR number (DAR-YYYY-XXX)
  if (task.darId && /^DAR-\d{4}-\d+/.test(task.darId)) return task.darId;
  if (task.darNumber && /^DAR-\d{4}-\d+/.test(task.darNumber)) return task.darNumber;

  // 6. Alphanumeric docId fallback (ignoring system IDs like t-xxx or DOC-MOCK-xxx)
  if (task.docId && typeof task.docId === 'string' && !isThaiText(task.docId) && !task.docId.startsWith('t-') && !task.docId.startsWith('DOC-MOCK-')) {
    return task.docId;
  }

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper 2: Extract/clean the real document title with Multi-Source Fallback Resolver
// ─────────────────────────────────────────────────────────────────────────────
const TITLE_PREFIX_PATTERNS = [
  /^\[.*?\]\s*/,                                            // [Any bracket prefix]
  /^ตรวจรับเอกสารควบคุมฉบับพิมพ์:\s*/,
  /^แจกจ่ายเอกสาร Controlled Copy \(NEW\):\s*/,
  /^แจกจ่ายสำเนาควบคุม:\s*/,
  /^จัดพิมพ์และส่งมอบสำเนาควบคุมเอกสาร(?:ภายนอก)?:\s*/,
  /^เรียกคืนและทำลายเอกสาร(?:ภายนอก)?(?:ที่ถูกยกเลิก)?:\s*/,
  /^เรียกคืนสำเนาเอกสาร(?:ที่ถูก)?ยกเลิก:\s*/,
  /^เรียกคืนสำเนาตกรุ่น:\s*/,
  /^เรียกคืนสำเนาชำรุด:\s*/,
  /^ออกสำเนาควบคุมทดแทน\s*\(.*?\):\s*/,
  /^ขอออกสำเนาควบคุมเพิ่มเติม:\s*/,
  /^ส่งคืนสำเนาควบคุม:\s*/,
];

const stripTitlePrefixes = (raw) => {
  if (!raw) return '';
  let result = raw.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TITLE_PREFIX_PATTERNS) {
      const next = result.replace(pattern, '');
      if (next !== result) { result = next.trim(); changed = true; }
    }
  }
  return result;
};

export const getDocumentTitle = (task, storeContext = {}) => {
  if (!task) return '';
  const { documents = [], externalDocuments = [], dars = [], controlledCopyInstances = [] } = storeContext;

  const docCode = getDocumentIdentifier(task, storeContext);

  // 1. Explicit name fields on task if present and distinct from the code
  const explicit =
    task.docName ||
    task.doc_name ||
    task.documentName ||
    task.document_name ||
    task.doc_title;
  if (explicit && explicit !== docCode && !explicit.startsWith('Copy ')) {
    return explicit;
  }

  // 2. Query documents store by id or code
  const docId = task.docId || task.doc_id;
  if (docId || docCode) {
    const matchedDoc = (documents || []).find(d => 
      (docId && String(d.id) === String(docId)) ||
      (docCode && (d.title === docCode || d.document_code === docCode || d.code === docCode || d.doc_number === docCode))
    );
    if (matchedDoc && (matchedDoc.name || matchedDoc.document_name || matchedDoc.docName)) {
      return matchedDoc.name || matchedDoc.document_name || matchedDoc.docName;
    }
  }

  // 3. Query externalDocuments store
  const extId = task.externalDocId || task.referenceId || docId;
  if (extId || docCode) {
    const matchedExt = (externalDocuments || []).find(d => 
      (extId && String(d.id) === String(extId)) ||
      (docCode && (d.edCode === docCode || d.doc_code === docCode || d.docNo === docCode))
    );
    if (matchedExt && (matchedExt.title || matchedExt.name || matchedExt.documentName)) {
      return matchedExt.title || matchedExt.name || matchedExt.documentName;
    }
  }

  // 4. Query dars store
  const darId = task.darId || (task.referenceType === 'INTERNAL_DAR' ? task.referenceId : null);
  if (darId) {
    const matchedDar = (dars || []).find(d => String(d.id) === String(darId) || d.darNo === darId || d.dar_no === darId);
    if (matchedDar && (matchedDar.name || matchedDar.document_name || matchedDar.docName || matchedDar.title)) {
      const darTitle = matchedDar.name || matchedDar.document_name || matchedDar.docName || matchedDar.title;
      if (darTitle && darTitle !== docCode) return darTitle;
    }
  }

  // 5. Query controlledCopyInstances store
  const copyId = task.copyId || task.copy_id || task.instanceId;
  if (copyId) {
    const matchedCopy = (controlledCopyInstances || []).find(c => String(c.id) === String(copyId));
    if (matchedCopy && (matchedCopy.docName || matchedCopy.name || matchedCopy.documentName)) {
      return matchedCopy.docName || matchedCopy.name || matchedCopy.documentName;
    }
  }

  // 6. Check task.docTitle if distinct from docCode
  if (task.docTitle && task.docTitle !== docCode && !task.docTitle.startsWith('Copy ')) {
    return task.docTitle;
  }

  // 7. Extract cleaned title from task.title
  const stripped = stripTitlePrefixes(task.title || '');
  if (stripped) {
    return stripped;
  }

  // 8. Safe fallback — never return empty or undefined
  return task.title || docCode || 'เอกสารควบคุม';
};


// ─────────────────────────────────────────────────────────────────────────────
// Helper 3: Extract copy number chip label
// ─────────────────────────────────────────────────────────────────────────────
const getCopyChip = (task) => {
  const raw =
    task.copy_no ||
    task.copyNo ||
    task.copyNumber ||
    task.copy_number;
  if (raw) return `Copy ${String(raw).padStart(2, '0')}`;

  // Try to pull "Copy 03" from title
  const m = String(task.title || '').match(/\bCopy\s+(\d+)\b/i);
  if (m) return `Copy ${m[1].padStart(2, '0')}`;

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Resolve effective task department strictly bound to document / DAR owner
// For RECEIPT tasks, strictly binds to recipient department (e.g. EN Office -> EN)
// ─────────────────────────────────────────────────────────────────────────────
export const resolveTaskDepartment = (task, storeContext) => {
  if (!task) return '';

  if (isReceiptTask(task)) {
    const safeCopies = storeContext?.controlledCopyInstances || storeContext?.documentControlledCopies || [];
    const targetCopyId = String(task.copy_id || task.copyId || task.instanceId || '');
    const matchedCopy = safeCopies.find(c => String(c.id) === targetCopyId);
    return resolveReceiptTaskDepartment(task, matchedCopy);
  }

  const safeDars = storeContext?.dars || [];
  const safeDocs = storeContext?.documents || [];
  const safeExtDocs = storeContext?.externalDocuments || [];

  const matchedDar = safeDars.find(d => String(d.id) === String(task.darId));
  const docCode = task.doc_code || task.docCode || task.document_code || task.title || '';
  const docId = task.docId || task.doc_id;
  const extId = task.externalDocId || task.referenceId || docId;

  const matchedDoc = safeDocs.find(d => 
    (docId && String(d.id) === String(docId)) ||
    (docCode && (d.title === docCode || d.document_code === docCode || d.code === docCode))
  );

  const matchedExtDoc = safeExtDocs.find(d => 
    (extId && String(d.id) === String(extId)) ||
    (docCode && (d.title === docCode || d.edCode === docCode || d.doc_code === docCode || d.docNo === docCode))
  );

  let dept = matchedDar?.department || matchedDoc?.department || matchedExtDoc?.department;
  if (!dept) {
    if (task.document_department) {
      dept = task.document_department;
    } else if (task.department && task.department !== 'DCC') {
      dept = task.department;
    } else if (task.dept && task.dept !== 'DCC') {
      dept = task.dept;
    } else {
      dept = task.target_department || task.targetDepartment || task.destinationDept || task.assignedToDept || task.holder_dept || '';
    }

    if (!dept) {
      // Dynamic pattern extraction from document/DAR code e.g. "SOP-QA-001", "DAR-PD-2026", "FM-QC-002"
      const codeStr = String(docCode || task.darId || task.title || '');
      const match = codeStr.match(/(?:^|[A-Za-z]+-)([A-Za-z0-9]{2,10})-(?:\d|[A-Za-z0-9]+)/);
      if (match && match[1]) {
        dept = match[1].toUpperCase();
      }
    }
  }
  return normalizeCanonicalDept(dept);
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Resolve Document Origin (INTERNAL vs EXTERNAL)
// ─────────────────────────────────────────────────────────────────────────────
export const getTaskOrigin = (task) => {
  if (!task) return 'INTERNAL';
  if (task.origin === 'EXTERNAL') return 'EXTERNAL';
  if (task.origin === 'INTERNAL') return 'INTERNAL';
  if (
    task.referenceType === 'EXTERNAL_DOC' ||
    (task.type && String(task.type).startsWith('EXT_')) ||
    (task.taskType && String(task.taskType).startsWith('EXT_')) ||
    task.extAction ||
    task.is_external ||
    task.isExternal ||
    String(task.doc_code || task.docCode || '').startsWith('ED-') ||
    (task.title && (task.title.includes('เอกสารภายนอก') || task.title.includes('External Doc')))
  ) {
    return 'EXTERNAL';
  }
  return 'INTERNAL';
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Visual Revision Transition (e.g. Rev.00 ➔ 01)
// ─────────────────────────────────────────────────────────────────────────────
export const getRevisionTransition = (task, matchedDar, matchedDoc) => {
  if (!task) return null;
  // ISO 9001 Clause 7.5.3.2: External documents must NOT inherit internal revision logic
  if (getTaskOrigin(task) === 'EXTERNAL') return null;
  const prevRev = 
    task.sourceRevision ||
    task.source_revision ||
    matchedDar?.sourceRevision ||
    matchedDar?.source_revision ||
    matchedDar?.revisesRev || 
    matchedDar?.previousRev || 
    (matchedDar?.type === 'REVISION' ? (matchedDoc?.rev || '00') : null);

  const newRev = 
    task.targetRevision ||
    task.target_revision ||
    task.doc_version || 
    task.revision || 
    task.rev ||
    matchedDar?.targetRevision ||
    matchedDar?.target_revision ||
    matchedDar?.rev || 
    matchedDar?.targetRev || 
    matchedDar?.proposedRev || 
    matchedDoc?.rev;

  const cleanPrev = prevRev && prevRev !== 'ALL' ? String(prevRev).replace(/^rev\.?/i, '').trim() : null;
  const cleanNew = newRev && newRev !== 'ALL' ? String(newRev).replace(/^rev\.?/i, '').trim() : null;

  const normType = (task.type || task.taskType || task.task_type || '').toUpperCase();

  // 2. Action-Specific Revision Scoping (ISO 9001 Clause 7.5.3)

  // 2.1 งานเรียกคืนสำเนา (RECALL / DCC_RECALL / OBSOLETE_RECALL)
  // บริบท: เจ้าหน้าที่ DCC ต้องไปตามเก็บ "ฉบับเดิมที่ตกรุ่น" เท่านั้น
  const isRecall = 
    normType === 'RECALL' || 
    normType === 'DCC_RECALL' || 
    normType === 'DCC_RECALL_WITH_CHECKLIST' ||
    normType === 'RECALL_HARDCOPY' ||
    normType === 'OBSOLETE_RECALL' ||
    task.category === 'RECALL';

  if (isRecall) {
    // ฉบับเดิมที่สิ้นสภาพ / ถูกเรียกคืน (ถ้าเป็นเอกสารยกเลิก ALL หรือหา cleanPrev ให้ใช้ prevRev หรือ targetRevision)
    const effectiveOldRev = cleanPrev || (cleanNew && cleanNew !== 'ALL' ? cleanNew : null);
    const displayRev = effectiveOldRev ? `Rev.${effectiveOldRev.padStart(2, '0')}` : (task.targetRevision === 'ALL' || task.doc_version === 'ALL' ? 'ทุกฉบับ' : 'ฉบับเดิม');
    return {
      type: 'RECALL',
      rev: effectiveOldRev ? effectiveOldRev.padStart(2, '0') : null,
      label: `${displayRev} (ฉบับเดิม/เรียกคืน)`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-300/40 font-semibold'
    };
  }

  // 2.2 งานแจกจ่ายสำเนา (DISTRIBUTION / DCC_DISTRIBUTE / ISSUE)
  // บริบท: นำ "ฉบับใหม่ที่บังคับใช้" ไปแจกจ่าย
  const isDistribute = 
    normType === 'DISTRIBUTION' || 
    normType === 'DCC_DISTRIBUTE' || 
    normType === 'DCC_ISSUE' || 
    normType === 'ISSUE' || 
    normType === 'DISTRIBUTE' ||
    task.category === 'DISTRIBUTION';

  if (isDistribute) {
    const effectiveNewRev = cleanNew || (matchedDoc?.rev ? String(matchedDoc.rev).replace(/^rev\.?/i, '').trim() : '00');
    const displayRev = effectiveNewRev ? `Rev.${effectiveNewRev.padStart(2, '0')}` : 'Rev.01';
    return {
      type: 'DISTRIBUTION',
      rev: effectiveNewRev ? effectiveNewRev.padStart(2, '0') : '01',
      label: `${displayRev} (ฉบับใหม่)`,
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-300 ring-1 ring-sky-300/40 font-semibold'
    };
  }

  // 2.3 งานรับทราบเอกสาร (ACKNOWLEDGE / ACK)
  // บริบท: ผู้ถือครองรับทราบฉบับใหม่ที่มีผลบังคับใช้
  const isAck = 
    normType === 'ACK' || 
    normType === 'ACKNOWLEDGE' || 
    normType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' ||
    normType === 'CONFIRM_RECEIPT' ||
    normType === 'RECEIPT';

  if (isAck) {
    const effectiveNewRev = cleanNew || (matchedDoc?.rev ? String(matchedDoc.rev).replace(/^rev\.?/i, '').trim() : '00');
    const displayRev = effectiveNewRev ? `Rev.${effectiveNewRev.padStart(2, '0')}` : 'Rev.01';
    return {
      type: 'ACKNOWLEDGE',
      rev: effectiveNewRev ? effectiveNewRev.padStart(2, '0') : '01',
      label: `${displayRev} (ฉบับใหม่)`,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-300/40 font-semibold'
    };
  }

  // 2.4 งานทบทวนและอนุมัติคำร้อง (REVIEW / APPROVE / DAR_REVIEW / DAR_APPROVE)
  // บริบท: พิจารณาการเปลี่ยนผ่าน จึงแสดง Transition: Rev.00 ➔ 01
  if (cleanPrev && cleanNew && cleanPrev !== cleanNew) {
    return {
      type: 'TRANSITION',
      prev: cleanPrev.padStart(2, '0'),
      next: cleanNew.padStart(2, '0'),
      label: `Rev.${cleanPrev.padStart(2, '0')} ➔ ${cleanNew.padStart(2, '0')}`,
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
    };
  }

  // 2.5 Fallback ทั่วไป (Single Rev)
  if (cleanNew && cleanNew !== 'ALL') {
    return {
      type: 'SINGLE',
      rev: cleanNew.padStart(2, '0'),
      label: `Rev.${cleanNew.padStart(2, '0')}`,
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
    };
  }
  if (cleanPrev && cleanPrev !== 'ALL') {
    return {
      type: 'SINGLE',
      rev: cleanPrev.padStart(2, '0'),
      label: `Rev.${cleanPrev.padStart(2, '0')}`,
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
    };
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Format Department Badge (e.g. 🏢 PD - ฝ่ายผลิต)
// ─────────────────────────────────────────────────────────────────────────────
export const formatDepartmentBadge = (deptCode, masterDepartments) => {
  if (!deptCode) return '';
  const clean = normalizeCanonicalDept(deptCode);
  const deptObj = (masterDepartments || []).find(d => isSameDepartment(d.id, clean) || isSameDepartment(d.code, clean));
  if (deptObj) {
    const rawTh = deptObj.nameTh || deptObj.name || '';
    const thaiName = rawTh.replace(/^.*?\((.*?)\)/, '$1').replace(new RegExp(`^${clean}\\s*[-:]*\\s*`, 'i'), '').trim();
    return `${clean} - ${thaiName || deptObj.name || clean}`;
  }
  const registryName = getDeptNameTh(clean);
  if (registryName && registryName !== clean) {
    return `${clean} - ${registryName}`;
  }
  return clean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Resolve Requester Full Name
// ─────────────────────────────────────────────────────────────────────────────
export const resolveRequesterName = (task, matchedDar, matchedDoc, masterUsers) => {
  if (matchedDar?.requesterName) return matchedDar.requesterName;
  if (task?.requesterName) return task.requesterName;
  if (task?.metadata?.requesterName) return task.metadata.requesterName;
  const reqId = matchedDar?.requesterId || task?.requesterId;
  if (reqId) {
    const u = (masterUsers || []).find(user => user.id === reqId || user.empId === reqId);
    if (u) return u.fullName || u.name;
  }
  if (matchedDoc?.ownerName) return matchedDoc.ownerName;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Resolve Reason Snippet
// ─────────────────────────────────────────────────────────────────────────────
export const resolveReasonSnippet = (task, matchedDar) => {
  const reason = matchedDar?.reason || matchedDar?.changeReason || task?.reason || task?.description || task?.metadata?.reason || '';
  return reason ? reason.trim() : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Resolve Monospace DAR ID
// ─────────────────────────────────────────────────────────────────────────────
export const resolveDarIdentifier = (task, matchedDar) => {
  if (matchedDar?.darNo) return matchedDar.darNo;
  if (matchedDar?.darNumber) return matchedDar.darNumber;
  if (task?.darNo) return task.darNo;
  if (task?.darId && String(task.darId).startsWith('DAR-')) return task.darId;
  if (task?.referenceType === 'INTERNAL_DAR' && task.referenceId && String(task.referenceId).startsWith('DAR-')) return task.referenceId;
  if (task?.metadata?.darNo) return task.metadata.darNo;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Task Type Badge & Action Configuration
// ─────────────────────────────────────────────────────────────────────────────
export const getTaskTypeBadgeConfig = (normType, task) => {
  if (normType === 'PERIODIC_REVIEW_REVISE' || task?.type === 'PERIODIC_REVIEW_REVISE') {
    return {
      label: '⚠️ ส่งกลับแก้ไข (Revision Required)',
      actionLabel: 'ดำเนินการทบทวนใหม่',
      icon: <RotateCcw size={13} className="text-orange-600" />,
      badgeClass: 'bg-orange-50 text-orange-800 border-orange-200'
    };
  }
  if (normType === 'REVIEW' || normType === 'EXT_REVIEW' || normType === 'EXTERNAL_REVIEW') {
    return {
      label: 'ทบทวนคำร้อง',
      actionLabel: 'พิจารณาตรวจทาน',
      icon: <Eye size={13} className="text-indigo-600" />,
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200'
    };
  }
  if (normType === 'PERIODIC_REVIEW_APPROVAL' || task?.type === 'PERIODIC_REVIEW_APPROVAL') {
    return {
      label: 'อนุมัติผลทบทวนตามรอบ (HOD)',
      actionLabel: 'พิจารณาอนุมัติผลทบทวน',
      icon: <ShieldCheck size={13} className="text-indigo-600" />,
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200'
    };
  }
  if (normType === 'PERIODIC_REVIEW' || task?.type === 'PERIODIC_REVIEW' || task?.taskType === 'PERIODIC_REVIEW' || normType === 'EXTERNAL_VERIFICATION') {
    return {
      label: 'ทบทวนเอกสารตามรอบ',
      actionLabel: 'จัดการงาน',
      icon: <RotateCcw size={13} className="text-sky-600" />,
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200'
    };
  }
  if (normType === 'APPROVE' || normType === 'APPROVAL' || normType === 'EXT_APPROVAL' || normType === 'EXTERNAL_APPROVAL' || normType === 'CC_REPLACEMENT_APPROVAL') {
    return {
      label: 'อนุมัติคำร้อง',
      actionLabel: 'พิจารณาอนุมัติ',
      icon: <ShieldCheck size={13} className="text-emerald-600" />,
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200'
    };
  }
  if (normType === 'ACK' || normType === 'ACKNOWLEDGE') {
    return {
      label: 'รับทราบเอกสาร',
      actionLabel: 'ยืนยันรับทราบ',
      icon: <Bell size={13} className="text-sky-600" />,
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200'
    };
  }
  if (normType === 'EXTERNAL_REVISE') {
    return {
      label: 'แก้ไขคำร้องเอกสารภายนอก (Revise)',
      actionLabel: 'แก้ไขและส่งคำร้องอีกครั้ง',
      icon: <FileEdit size={13} className="text-rose-600" />,
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
    };
  }
  if (normType === 'REVISE') {
    return {
      label: 'ส่งกลับแก้ไข (Revise)',
      actionLabel: 'แก้ไขคำร้อง',
      icon: <FileEdit size={13} className="text-rose-600" />,
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
    };
  }
  if (
    normType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' ||
    normType === 'CONFIRM_RECEIPT' ||
    normType === 'RECEIPT' ||
    task?.taskType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' ||
    task?.category === 'RECEIPT'
  ) {
    return {
      label: 'ตรวจรับเล่มสำเนา (Receipt)',
      actionLabel: 'ตรวจรับสำเนา',
      icon: <Layers size={13} className="text-violet-600" />,
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200'
    };
  }
  if (normType === 'DCC_DISTRIBUTE' || normType === 'DCC_ISSUE') {
    if (task?.delivery_status === 'DISPATCHED_TRACKING' || task?.status === 'COMPLETED') {
      return {
        label: task?.status_label || 'ติดตามการส่งมอบ (รอปลายทางตรวจรับ)',
        actionLabel: 'ติดตามการส่งมอบ',
        icon: <Clock size={13} className="text-amber-600" />,
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    }
    return {
      label: 'แจกจ่ายสำเนา (Distribute)',
      actionLabel: 'ดำเนินการแจกจ่าย',
      icon: <Send size={13} className="text-sky-600" />,
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200'
    };
  }
  if (
    normType === 'DCC_RECALL' ||
    normType === 'DCC_RECALL_WITH_CHECKLIST' ||
    normType === 'RECALL_HARDCOPY' ||
    normType === 'RECALL' ||
    normType === 'OBSOLETE_RECALL' ||
    task?.taskType === 'RECALL' ||
    task?.taskType === 'DCC_RECALL_WITH_CHECKLIST'
  ) {
    const isDamaged = task?.isDamaged || task?.reason === 'DAMAGED' || task?.title?.includes('ชำรุด') || task?.description?.includes('ชำรุด');
    if (isDamaged) {
      return {
        label: 'เรียกคืนชำรุด (Damaged Recall)',
        actionLabel: 'ดำเนินการเรียกคืน',
        icon: <AlertTriangle size={13} className="text-rose-600" />,
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
      };
    }
    return {
      label: 'เรียกคืนเอกสาร Controlled Copy (Recall)',
      actionLabel: 'ดำเนินการเรียกคืน',
      icon: <AlertTriangle size={13} className="text-orange-600" />,
      badgeClass: 'bg-orange-50 text-orange-700 border-orange-200'
    };
  }
  return {
    label: 'งานในระบบ (Task)',
    actionLabel: 'จัดการงาน',
    icon: <CheckSquare size={13} className="text-slate-600" />,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
  };
};


// ─────────────────────────────────────────────────────────────────────────────
// Helper 6: SLA / Priority badge
// ─────────────────────────────────────────────────────────────────────────────
const getSLABadge = (task, mockDateOffset) => {
  // Damaged recall — highest priority visual
  if (task.isDamaged || task.reason === 'DAMAGED' || task.title?.includes('ชำรุด') || task.description?.includes('ชำรุด')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <AlertTriangle size={10} /> เล่มชำรุด
      </span>
    );
  }

  // Delivery tracking
  if (task.delivery_status === 'DISPATCHED_TRACKING' || task.tracking_status === 'WAITING_RECEIPT') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <Clock size={10} /> รอปลายทางรับ
      </span>
    );
  }

  if (!task.dueDate) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
        <CheckCircle size={10} /> ปกติ
      </span>
    );
  }

  const today = new Date();
  today.setDate(today.getDate() + (mockDateOffset || 0));
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  const isUrgent = task.isUrgent || task.priority === 'URGENT' || task.slaType === 'FAST_TRACK';

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <AlertCircle size={10} /> เกินกำหนด {Math.abs(diffDays)} วัน
      </span>
    );
  }
  if (diffDays === 0) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${isUrgent ? 'bg-amber-100 text-amber-900 border-amber-400 animate-pulse' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>
        <Clock size={10} /> ครบกำหนดวันนี้{isUrgent ? ' ⚡' : ''}
      </span>
    );
  }
  if (diffDays <= 2) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${isUrgent ? 'bg-amber-100 text-amber-900 border-amber-400 font-bold' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
        <Clock size={10} /> {isUrgent ? '⚡ งานด่วน' : 'ใกล้ครบกำหนด'} (อีก {diffDays} วัน)
      </span>
    );
  }
  if (isUrgent) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
        <Zap size={10} className="fill-amber-500" /> งานด่วน (อีก {diffDays} วัน)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
      <CheckCircle size={10} /> ปกติ
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper 7: Normalize Task Category for Filtering and Tabs (Pure Utility Function)
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeTaskCategory(task) {
  if (!task) return '';
  const rawType = (task.type || task.taskType || task.task_type || task.category || '').toUpperCase();
  if (rawType === 'REVIEW' || rawType === 'EXT_REVIEW' || rawType === 'EXTERNAL_REVIEW' || rawType === 'PERIODIC_REVIEW' || rawType === 'EXTERNAL_VERIFICATION') return 'REVIEW';
  if (rawType === 'APPROVE' || rawType === 'APPROVAL' || rawType === 'EXT_APPROVAL' || rawType === 'EXTERNAL_APPROVAL' || rawType === 'CC_REPLACEMENT_APPROVAL' || rawType === 'PERIODIC_REVIEW_APPROVAL') return 'APPROVE';
  if (rawType === 'ACK' || rawType === 'ACKNOWLEDGE') return 'ACK';
  if (rawType === 'REVISE' || rawType === 'EXTERNAL_REVISE' || rawType === 'EXT_REVISE' || rawType === 'PERIODIC_REVIEW_REVISE') return 'REVISE';
  if (
    rawType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' ||
    task.taskType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' ||
    rawType === 'CONFIRM_RECEIPT' ||
    rawType === 'RECEIPT' ||
    task.category === 'RECEIPT' ||
    task.id?.includes('doc-') ||
    task.id?.includes('task-receipt-') ||
    task.title?.includes('ตรวจรับเล่ม') ||
    task.title?.includes('ตรวจรับเอกสาร')
  ) return 'RECEIPT';
  if (rawType === 'DCC_DISTRIBUTE' || rawType === 'DCC_ISSUE' || rawType === 'DISTRIBUTION') return 'DCC_DISTRIBUTE';
  if (rawType === 'DCC_RECALL' || rawType === 'DCC_RECALL_WITH_CHECKLIST' || rawType === 'RECALL' || rawType === 'RECALL_HARDCOPY' || rawType === 'OBSOLETE_RECALL' || task.taskType === 'RECALL' || task.taskType === 'DCC_RECALL_WITH_CHECKLIST') return 'DCC_RECALL';
  if (rawType.startsWith('DCC_')) return 'DCC_ACTION';
  return rawType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Inbox Component
// ─────────────────────────────────────────────────────────────────────────────
const TaskInbox = () => {
  const navigate = useNavigate();
  const { currentUser, tasks, dars, documents, externalDocuments, externalRequests, controlledCopyInstances, documentControlledCopies, mockDateOffset, simulatedSystemDate, checkSLA, masterDepartments, masterUsers } = useStore();
  const [activeTab, setActiveTab] = useState('ALL');
  const [originFilter, setOriginFilter] = useState('ALL'); // 'ALL' | 'INTERNAL' | 'EXTERNAL'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExtTask, setSelectedExtTask] = useState(null);
  const [selectedReceiptTask, setSelectedReceiptTask] = useState(null);
  const [selectedCustodyTask, setSelectedCustodyTask] = useState(null);
  const [selectedPeriodicReviewApprovalTask, setSelectedPeriodicReviewApprovalTask] = useState(null);
  const [editingExternalDoc, setEditingExternalDoc] = useState(null);
  const [resubmitTaskId, setResubmitTaskId] = useState(null);
  const [isExternalDocModalOpen, setIsExternalDocModalOpen] = useState(false);

  useEffect(() => {
    if (checkSLA) checkSLA();
  }, [mockDateOffset, simulatedSystemDate, checkSLA]);

  const storeContext = useMemo(() => ({
    documents: documents || [],
    externalDocuments: externalDocuments || [],
    dars: dars || [],
    controlledCopyInstances: controlledCopyInstances || documentControlledCopies || []
  }), [documents, externalDocuments, dars, controlledCopyInstances, documentControlledCopies]);

  const dccAdmin = isDccAdmin(currentUser);

  const isLevel6Executive = useMemo(() => isLevel6Plus(currentUser), [currentUser]);

  // Auto-reset active tab if non-DCC Admin user had previously selected DCC exclusive tabs
  // or if Level 6+ executive user had selected RECEIPT tab
  useEffect(() => {
    if (!dccAdmin && (activeTab === 'DCC_DISTRIBUTE' || activeTab === 'DCC_RECALL')) {
      setActiveTab('ALL');
    }
    if (isLevel6Executive && activeTab === 'RECEIPT') {
      setActiveTab('ALL');
    }
  }, [dccAdmin, isLevel6Executive, activeTab]);

  const userDepts = useMemo(() => {
    const raw = currentUser?.affiliated_departments || currentUser?.depts || (currentUser?.primary_department ? [currentUser.primary_department] : (currentUser?.department ? [currentUser.department] : []));
    return Array.from(new Set(raw.map(d => normalizeCanonicalDept(d)).filter(Boolean)));
  }, [currentUser]);

  const primaryDept = useMemo(() => {
    const raw = currentUser?.primary_department || currentUser?.department || '';
    return normalizeCanonicalDept(raw);
  }, [currentUser]);

  const defaultUserDept = useMemo(() => {
    const raw = currentUser?.primary_department || currentUser?.department || 'DC';
    return normalizeCanonicalDept(raw) || 'DC';
  }, [currentUser]);

  const [deptFilter, setDeptFilter] = useState('ALL');

  useEffect(() => {
    setDeptFilter('ALL');
  }, [currentUser?.id]);

  const resolveTaskDept = useCallback((task) => {
    if (!task) return '';
    const isReceipt = isReceiptTask(task) || normalizeTaskCategory(task) === 'RECEIPT';
    let dept = '';
    if (isReceipt) {
      dept = resolveReceiptTaskDepartment(task, null) || resolveTaskDepartment(task, storeContext) || task.target_department || task.targetDepartment || task.destinationDept || task.destination_dept || task.department || '';
    } else {
      dept = task.assignee_department || resolveTaskDepartment(task, storeContext) || task.department || task.dept || task.target_department || task.targetDepartment || task.destinationDept || '';
    }
    return normalizeCanonicalDept(dept);
  }, [storeContext]);

  const isTaskMatchingDept = useCallback((task, targetDept) => {
    if (!task) return false;

    const taskAssigneeId = task.assigneeId || task.assignee_id || task.assignedToUserId || task.target_user_id;
    const isDirectAssignee = Boolean(taskAssigneeId && (taskAssigneeId === currentUser?.id || taskAssigneeId === currentUser?.empId || task.assigneeName === currentUser?.name));
    
    const tDept = resolveTaskDept(task);

    if (!targetDept || targetDept === 'ALL') return true;
    if (isSameDepartment(tDept, targetDept)) return true;
    // A task with no department of its own falls under the assignee's department, so it is not lost.
    // One that has a department is counted there only: a QMR's QC tasks are not also MGMT tasks.
    return isDirectAssignee && !tDept && (isSameDepartment(currentUser?.department, targetDept) || isSameDepartment(currentUser?.primary_department, targetDept));
  }, [resolveTaskDept, currentUser]);

  const effectiveToday = useMemo(() => {
    return simulatedSystemDate ? new Date(simulatedSystemDate) : new Date();
  }, [simulatedSystemDate]);

  const allDocs = useMemo(() => [...(documents || []), ...(externalDocuments || [])], [documents, externalDocuments]);

  // Master Task Filtering: Distribution & Recall tasks are strictly exclusive to DCC Admin.
  // Receipt tasks are strictly hidden for Level 6+ executives and pooled for all Level < 6 department members.
  // Strict Department Isolation: Non-DCC users see ONLY tasks matching their department or directly assigned to them.
  const userTasks = useMemo(() => {
    return (tasks || [])
      .filter(task => {
        // 1. ถ้าเป็น Task ที่เสร็จสิ้นหรือยกเลิกแล้ว ไม่แสดงในกล่องงานค้าง
        if (task.status === 'COMPLETED' || task.status === 'REJECTED' || task.status === 'RESOLVED' || task.is_completed === true) {
          return false;
        }

        // 2. ถ้าเป็น Task ประเภท PERIODIC_REVIEW (งานบันทึกผลการทบทวน)
        if (task.type === 'PERIODIC_REVIEW' || task.taskType === 'PERIODIC_REVIEW') {
          const docCode = task.document_code || task.doc_code || task.docCode || task.documentNumber;
          const docId = task.doc_id || task.docId || task.documentId;
          const targetDoc = allDocs.find(d => 
            (docId && (d.id === docId || d.doc_id === docId)) ||
            (docCode && (d.code === docCode || d.doc_code === docCode || d.document_code === docCode || d.title === docCode))
          );
          
          const nextReviewDate = targetDoc?.next_review_date || targetDoc?.nextReviewDate || task.dueDate || task.due_date;
          if (!nextReviewDate) return false;

          const target = new Date(nextReviewDate);
          if (isNaN(target.getTime())) return false;
          target.setHours(0, 0, 0, 0);

          const today = new Date(effectiveToday);
          today.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          // ต้องเหลือเวลาไม่เกิน 30 วัน หรือเกินกำหนดแล้วเท่านั้น ถึงจะถือเป็นงานที่ต้องทำ!
          // หาก diffDays > 30 (เช่น ปี 2030) ต้องไม่แสดงใน Inbox
          if (diffDays > 30) return false;
        }

        return isActionableTask(task, currentUser, allDocs, effectiveToday);
      })
      .filter(t => dccAdmin || !isDccExclusiveTask(t))
      .filter(t => !((isLevel6Executive || isLevel6Plus(currentUser)) && (normalizeTaskCategory(t) === 'RECEIPT' || isReceiptTask(t))))
      .filter(t => {
        // 1. งานตรวจรับเล่ม (RECEIPT): ต้องเป็นของแผนกตัวเองเท่านั้น (Strict Segregation)
        // แม้เป็น DCC Admin หรือ QMR ก็ไม่มีสิทธิ์รับงานตรวจรับแทนแผนกอื่น
        const isReceipt = isReceiptTask(t) || normalizeTaskCategory(t) === 'RECEIPT' || t.type === 'CONTROLLED_COPY_RECEIPT';
        if (isReceipt) {
          if (isLevel6Executive || isLevel6Plus(currentUser)) return false;
          const tDept = t.recipient_department || t.recipientDepartment || resolveTaskDept(t) || t.target_department || t.department;
          return userDepts.some(uDept => isSameDepartment(uDept, tDept)) || 
            isSameDepartment(currentUser?.department, tDept) || 
            isSameDepartment(currentUser?.primary_department, tDept) ||
            userMatchesDepartment(currentUser, tDept);
        }

        if (dccAdmin || currentUser?.role === 'QMR' || currentUser?.isQmr) return true;

        const taskAssigneeId = t.assigneeId || t.assignee_id || t.assignedToUserId || t.target_user_id;
        const isAssignee = Boolean(taskAssigneeId && (taskAssigneeId === currentUser?.id || taskAssigneeId === currentUser?.empId || t.assigneeName === currentUser?.name));

        if (t.type === 'PERIODIC_REVIEW_APPROVAL' || t.taskType === 'PERIODIC_REVIEW_APPROVAL') {
          const tDept = resolveTaskDept(t);
          return isAssignee || 
            userDepts.some(uDept => isSameDepartment(uDept, tDept)) || 
            isSameDepartment(currentUser?.department, tDept) || 
            isSameDepartment(currentUser?.primary_department, tDept) ||
            userMatchesDepartment(currentUser, tDept);
        }

        if (taskAssigneeId) {
          return isAssignee;
        }
        const tDept = resolveTaskDept(t);
        const isDeptMatch = userDepts.some(uDept => isSameDepartment(uDept, tDept)) || 
          isSameDepartment(currentUser?.department, tDept) || 
          isSameDepartment(currentUser?.primary_department, tDept);
        return isDeptMatch;
      });
  }, [tasks, currentUser, dccAdmin, isLevel6Executive, userDepts, resolveTaskDept, allDocs, effectiveToday]);

  const availableDepts = useMemo(() => {
    // 🛡️ When in RECEIPT tab: strictly scoped to recipient department(s) of receipt tasks
    if (activeTab === 'RECEIPT') {
      const receiptTasks = (userTasks || []).filter(t => normalizeTaskCategory(t) === 'RECEIPT' || isReceiptTask(t));
      const deptsFromReceipt = receiptTasks.map(t => normalizeCanonicalDept(resolveTaskDept(t))).filter(Boolean);
      const combined = Array.from(new Set([...userDepts, ...deptsFromReceipt].map(d => normalizeCanonicalDept(d))));
      return combined.filter(Boolean);
    }

    const isEnterpriseManager = dccAdmin || currentUser?.role === 'QMR' || currentUser?.isQmr;

    if (!isEnterpriseManager) {
      // 🛡️ Phase 2: Strict Department Isolation - Non-DCC users see affiliated departments plus any directly assigned task's department
      const deptsFromAssignedTasks = (userTasks || [])
        .filter(t => {
          const taskAssigneeId = t.assigneeId || t.assignee_id || t.assignedToUserId || t.target_user_id;
          return Boolean(taskAssigneeId && (taskAssigneeId === currentUser?.id || taskAssigneeId === currentUser?.empId || t.assigneeName === currentUser?.name));
        })
        .map(t => normalizeCanonicalDept(resolveTaskDept(t)))
        .filter(Boolean);
      return Array.from(new Set([...userDepts, ...deptsFromAssignedTasks].map(d => normalizeCanonicalDept(d)))).filter(Boolean);
    }
    const deptsFromTasks = (userTasks || []).map(t => normalizeCanonicalDept(resolveTaskDept(t))).filter(Boolean);
    const combined = Array.from(new Set([...userDepts, ...deptsFromTasks].map(d => normalizeCanonicalDept(d))));
    return combined.filter(Boolean);
  }, [dccAdmin, userDepts, userTasks, resolveTaskDept, currentUser, activeTab]);

  useEffect(() => {
    if (deptFilter !== 'ALL' && !availableDepts.includes(deptFilter)) {
      if (availableDepts.includes(defaultUserDept)) {
        setDeptFilter(defaultUserDept);
      } else if (availableDepts.length > 0) {
        setDeptFilter(availableDepts[0]);
      } else {
        setDeptFilter('ALL');
      }
    }
  }, [availableDepts, deptFilter, defaultUserDept]);

  // Base task list matching current department and origin filter:
  const baseDeptFilteredTasks = useMemo(() => {
    let list = userTasks;
    if (originFilter !== 'ALL') {
      list = list.filter(t => getTaskOrigin(t) === originFilter);
    }
    if (deptFilter !== 'ALL') {
      list = list.filter(t => isTaskMatchingDept(t, deptFilter));
    }
    return list;
  }, [userTasks, originFilter, deptFilter, isTaskMatchingDept]);

  const originCounts = useMemo(() => {
    let list = userTasks;
    if (deptFilter !== 'ALL') {
      list = list.filter(t => isTaskMatchingDept(t, deptFilter));
    }
    return {
      ALL: list.length,
      INTERNAL: list.filter(t => getTaskOrigin(t) === 'INTERNAL').length,
      EXTERNAL: list.filter(t => getTaskOrigin(t) === 'EXTERNAL').length,
    };
  }, [userTasks, deptFilter, isTaskMatchingDept]);

  const getTaskCount = useCallback((tabId) => {
    if (tabId === 'ALL') return baseDeptFilteredTasks.length;
    return baseDeptFilteredTasks.filter(t => normalizeTaskCategory(t) === tabId).length;
  }, [baseDeptFilteredTasks]);

  const filteredTasks = useMemo(() => {
    let filtered = baseDeptFilteredTasks;
    if (activeTab !== 'ALL') {
      filtered = filtered.filter(t => normalizeTaskCategory(t) === activeTab);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(t => {
        const docId = getDocumentIdentifier(t) || '';
        const title = getDocumentTitle(t, storeContext) || '';
        return docId.toLowerCase().includes(term) ||
          title.toLowerCase().includes(term) ||
          (t.title || '').toLowerCase().includes(term) ||
          (t.description || '').toLowerCase().includes(term);
      });
    }
    return filtered;
  }, [baseDeptFilteredTasks, activeTab, searchTerm, storeContext]);

  const pagination = useTablePagination(filteredTasks, 10);

  const tabs = useMemo(() => {
    const baseTabs = dccAdmin ? [
      { id: 'ALL', label: 'ทั้งหมด', count: getTaskCount('ALL') },
      { id: 'DCC_DISTRIBUTE', label: 'แจกจ่าย', count: getTaskCount('DCC_DISTRIBUTE') },
      { id: 'DCC_RECALL', label: 'เรียกคืน', count: getTaskCount('DCC_RECALL') },
      { id: 'REVIEW', label: 'ทบทวน', count: getTaskCount('REVIEW') },
      { id: 'APPROVE', label: 'อนุมัติ', count: getTaskCount('APPROVE') },
      { id: 'RECEIPT', label: 'ตรวจรับเล่ม', count: getTaskCount('RECEIPT') },
      { id: 'REVISE', label: 'ส่งกลับ/แก้ไข', count: getTaskCount('REVISE') },
    ] : [
      { id: 'ALL', label: 'ทั้งหมด', count: getTaskCount('ALL') },
      { id: 'REVIEW', label: 'ทบทวน', count: getTaskCount('REVIEW') },
      { id: 'APPROVE', label: 'อนุมัติ', count: getTaskCount('APPROVE') },
      { id: 'RECEIPT', label: 'ตรวจรับเล่ม', count: getTaskCount('RECEIPT') },
      { id: 'ACK', label: 'รับทราบ', count: getTaskCount('ACK') },
      { id: 'REVISE', label: 'ส่งกลับ/แก้ไข', count: getTaskCount('REVISE') },
    ];
    if (isLevel6Executive) {
      return baseTabs.filter(tab => tab.id !== 'RECEIPT');
    }
    return baseTabs;
  }, [dccAdmin, isLevel6Executive, getTaskCount]);

  const handleTaskClick = (task) => {
    const normType = (task.type || task.taskType || '').toUpperCase();
    const isReceipt = task.referenceType !== 'INTERNAL_DAR' && (
      normType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' ||
      task.taskType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' ||
      normType === 'CONFIRM_RECEIPT' ||
      normType === 'RECEIPT' ||
      task.category === 'RECEIPT' ||
      task.actionType === 'RECEIPT' ||
      task.id?.includes('task-receipt-') ||
      task.title?.includes('ตรวจรับเล่ม') ||
      task.title?.includes('ตรวจรับสำเนา') ||
      task.title?.includes('ตรวจรับเอกสาร'));

    if (isReceipt) {
      setSelectedReceiptTask(task);
      return;
    }

    // Custody workflow tasks → open DCC physical verification modal
    if (normType === 'DCC_RELOCATE' || normType === 'DCC_RETURN') {
      setSelectedCustodyTask(task);
      return;
    }

    // 🛡️ Periodic Review Approval for HOD
    if (normType === 'PERIODIC_REVIEW_APPROVAL' || task.type === 'PERIODIC_REVIEW_APPROVAL') {
      setSelectedPeriodicReviewApprovalTask(task);
      return;
    }

    if (normType === 'PERIODIC_REVIEW_REVISE' || task.type === 'PERIODIC_REVIEW_REVISE') {
      const docId = task.docId || task.documentId || task.externalDocId || '';
      const docCode = task.docCode || task.doc_code || task.document_code || '';
      const params = new URLSearchParams({ taskId: task.id, isReEvaluating: 'true' });
      if (docId) params.set('docId', docId);
      if (docCode) params.set('docCode', docCode);
      if (task.referenceType === 'EXTERNAL_DOC' || task.origin === 'EXTERNAL') params.set('isExternal', 'true');
      navigate(`/dcc/periodic-reviews/${encodeURIComponent(docId || docCode)}?${params.toString()}`);
      return;
    }

    // 🛡️ Periodic Review (Internal) & Verification (External) workflow tasks → navigate to full form
    if (
      normType === 'PERIODIC_REVIEW' || 
      normType === 'EXTERNAL_VERIFICATION' || 
      task.type === 'PERIODIC_REVIEW' || 
      task.taskType === 'PERIODIC_REVIEW' || 
      task.taskType === 'EXTERNAL_VERIFICATION' ||
      Boolean(task.scheduleId)
    ) {
      const docCode = task.document_code || task.doc_code || task.docCode || task.documentNumber || task.scheduleId || task.id;
      navigate(`/periodic-review/record/${encodeURIComponent(docCode)}?taskId=${encodeURIComponent(task.id)}`);
      return;
    }

    if (task.referenceType === 'EXTERNAL_DOC' || task.origin === 'EXTERNAL') {
      // 🛡️ Phase 2: If task is EXTERNAL_REVISE, open ExternalDocFormModal in Resubmit mode
      // API mode: the requester fixes a returned request on the revise page (the server keeps no draft).
      if (isApiMode && (normType === 'EXTERNAL_REVISE' || normType === 'REVISE')) {
        navigate(`/tasks/revise/${task.id}`);
        return;
      }
      if (normType === 'EXTERNAL_REVISE' || normType === 'REVISE') {
        const extDoc = (externalDocuments || []).find(d => d.id === task.referenceId || d.id === task.docId || (task.docCode && d.edCode === task.docCode)) ||
                       (externalRequests || []).find(r => r.id === task.referenceId || r.requestId === task.referenceId || r.docId === task.referenceId || r.externalDocId === task.referenceId || (task.docCode && r.edCode === task.docCode));
        if (extDoc) {
          setEditingExternalDoc({
            ...extDoc,
            returnReason: task.returnReason || task.rejectReason || extDoc.returnReason
          });
          setResubmitTaskId(task.id);
          setIsExternalDocModalOpen(true);
          return;
        }
      }
      setSelectedExtTask(task);
      return;
    }
    // API mode: DCC publishes from the DAR page.
    if (normType === 'DCC_PUBLISH') {
      navigate(`/dar/${task.darId}`);
      return;
    }
    if (normType === 'CC_REPLACEMENT_APPROVAL') {
      navigate(`/tasks/approve-replacement/${task.id}`);
      return;
    }
    if (normType === 'REVIEW' || normType === 'EXT_REVIEW') navigate(`/tasks/review/${task.id}`);
    else if (normType === 'APPROVE' || normType === 'APPROVAL' || normType === 'EXT_APPROVAL') navigate(`/tasks/approve/${task.id}`);
    else if (normType === 'ACK' || normType === 'ACKNOWLEDGE') navigate(`/tasks/ack/${task.id}`);
    else if (normType === 'REVISE' || normType === 'DAR_REVISE' || normType === 'RETURNED_FOR_REVISION') navigate(`/tasks/revise/${task.id || task.darId || task.referenceId}`);
    else if (normType === 'DCC_DISTRIBUTE' || normType === 'DCC_ISSUE') {
      const targetTab = (task.delivery_status === 'DISPATCHED_TRACKING' || task.status === 'COMPLETED') ? 'DISPATCHED_TRACKING' : 'PENDING_ISSUE';
      navigate(`/controlled-copy?tab=${targetTab}`);
    }
    else if (normType === 'DCC_RECALL' || normType === 'DCC_RECALL_WITH_CHECKLIST' || normType === 'RECALL_HARDCOPY' || task.taskType === 'RECALL' || task.taskType === 'DCC_RECALL_WITH_CHECKLIST') navigate(`/controlled-copy?tab=RECALL_CHECKLIST`);
    else if (normType.startsWith('DCC_')) navigate(`/controlled-copy`);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10 w-full max-w-full overflow-hidden">
      {/* ── Standardized Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-6 py-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs">
        <div className="flex items-center gap-3">
          <CheckSquare className="w-5 h-5 text-slate-700 shrink-0" strokeWidth={1.75} />
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            กล่องงานที่ต้องจัดการ
          </h1>
        </div>

        {/* 🏷️ Document Origin Filter (Minimal Pill Switcher) */}
        <div className="flex items-center p-1 bg-slate-100/90 rounded-lg border border-slate-200/80 w-full sm:w-auto">
          {[
            { id: 'ALL', label: 'ทั้งหมด', count: originCounts.ALL, icon: Layers },
            { id: 'INTERNAL', label: 'เอกสารภายใน', count: originCounts.INTERNAL, icon: FileText },
            { id: 'EXTERNAL', label: 'เอกสารภายนอก', count: originCounts.EXTERNAL, icon: Globe },
          ].map(tab => {
            const Icon = tab.icon;
            const isSelected = originFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setOriginFilter(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-2xs font-bold border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
                }`}
              >
                <Icon size={13} className={isSelected ? 'text-indigo-600' : 'text-slate-400'} />
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded text-[11px] font-mono ${
                  isSelected ? 'bg-indigo-50 text-indigo-600 font-bold' : 'bg-slate-200/70 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {/* ── Single-Row Action Tabs & Search Bar ── */}
        <div className="px-3.5 py-2.5 border-b border-slate-200 bg-white flex flex-col md:flex-row justify-between items-stretch md:items-center gap-2.5">
          {/* Action Tabs: Compact Segmented Pills without horizontal scrollbar */}
          <div className="flex items-center flex-wrap gap-1 w-full md:w-auto">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              const enLabel = tab.id === 'REVIEW' ? 'Review' : tab.id === 'APPROVE' ? 'Approve' : tab.id === 'ACK' ? 'Acknowledge' : '';
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-label={`${tab.label} ${enLabel}`.trim()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer border ${
                    isActive
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200/80'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search Box: Compact & Sleek */}
          <div className="flex items-center gap-1.5 w-full md:w-auto shrink-0">
            <div className="relative flex-1 md:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="ค้นหารหัส, ชื่อเอกสาร..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 h-8 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
              />
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                title="ล้างคำค้นหา"
                className="p-1.5 h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all cursor-pointer flex items-center justify-center shrink-0"
              >
                <FilterX size={14} />
              </button>
            )}
          </div>
        </div>

        {/* 🏢 Department Filter: Minimal Subtle Chips */}
        {availableDepts.length > 0 && (
          <div className="px-3.5 py-2 bg-slate-50/70 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-slate-400 font-semibold shrink-0 flex items-center gap-1 mr-0.5 text-[11px]">
              <Building2 size={13} className="text-indigo-500" /> แผนก:
            </span>
            <button
              type="button"
              aria-label={dccAdmin ? `🏢 งานทั้งหมดทุกแผนก (${activeTab === 'ALL' ? userTasks.length : userTasks.filter(t => normalizeTaskCategory(t) === activeTab).length})` : `งานทั้งหมดทุกแผนก ทุกแผนกที่สังกัด (${activeTab === 'ALL' ? userTasks.length : userTasks.filter(t => normalizeTaskCategory(t) === activeTab).length})`}
              onClick={() => setDeptFilter('ALL')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap shrink-0 border cursor-pointer ${
                deptFilter === 'ALL'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs font-semibold'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80'
              }`}
            >
              <span>{dccAdmin ? '🏢 งานทั้งหมดทุกแผนก' : 'ทุกแผนกที่สังกัด'}</span>
              <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                deptFilter === 'ALL' ? 'bg-white/20 text-white font-bold' : 'bg-slate-100 text-slate-600'
              }`}>
                {activeTab === 'ALL' ? userTasks.length : userTasks.filter(t => normalizeTaskCategory(t) === activeTab).length}
              </span>
            </button>
            {availableDepts.map(dept => {
              const deptCount = userTasks.filter(t => (activeTab === 'ALL' || normalizeTaskCategory(t) === activeTab) && isTaskMatchingDept(t, dept)).length;
              const isPrimary = isSameDepartment(primaryDept, dept);
              const isSelected = deptFilter === dept;
              return (
                <button
                  key={dept}
                  type="button"
                  aria-label={
                    dept === 'QC'
                      ? `QC ${deptCount} เฉพาะงาน QA เฉพาะงาน QC${isPrimary ? ' (แผนกหลัก)' : ''}`
                      : `${dept} ${deptCount} เฉพาะงาน ${dept}${isPrimary ? ' (แผนกหลัก)' : ''}`
                  }
                  onClick={() => setDeptFilter(dept)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap shrink-0 border cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80'
                  }`}
                >
                  <span>{dept}</span>
                  {isPrimary && <Star size={11} strokeWidth={1.5} className="text-amber-400 fill-amber-400 shrink-0" title="แผนกหลัก" />}
                  <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                    isSelected ? 'bg-white/20 text-white font-bold' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {deptCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Task List (High-Density Modern Task Rows) ─── */}
        <div className="p-3 bg-slate-50/40 space-y-2 overflow-y-auto max-h-[640px] scrollbar-thin">
          {pagination.paginatedData.length > 0 ? (
            pagination.paginatedData.map(task => {
              const isExternal = getTaskOrigin(task) === 'EXTERNAL';
              const extDoc = isExternal ? (externalDocuments || []).find(d => d.id === task.referenceId || d.id === task.docId) : null;
              const normType = (task.type || task.taskType || '').toUpperCase();

              // ── Data extraction with full null-safety ──
              const matchedDar = (dars || []).find(d => 
                (task.darId && (String(d.id) === String(task.darId) || d.darNo === task.darId || d.darNumber === task.darId)) ||
                (task.referenceType === 'INTERNAL_DAR' && String(d.id) === String(task.referenceId))
              );
              const directDocCode = getDocumentIdentifier(task, storeContext, matchedDar);
              const matchedDoc = (documents || []).find(d => 
                (task.docId && String(d.id) === String(task.docId)) || 
                (matchedDar?.docIdRef && String(d.id) === String(matchedDar.docIdRef)) ||
                (matchedDar?.docId && String(d.id) === String(matchedDar.docId)) ||
                (directDocCode && (d.title === directDocCode || d.document_code === directDocCode || d.code === directDocCode))
              );
              const docCode = directDocCode || getDocumentIdentifier(task, storeContext, matchedDar, matchedDoc);
              const displayDocCode = 
                docCode ||
                task.docNo ||
                task.documentCode ||
                task.documentNumber ||
                task.darData?.docNo ||
                task.darData?.documentCode ||
                (task.docId && typeof task.docId === 'string' && !/[\u0E00-\u0E7F]/.test(task.docId) && !task.docId.startsWith('t-') ? task.docId : null) ||
                '-';

              const darNo = resolveDarIdentifier(task, matchedDar);
              const docTitle = getDocumentTitle(task, storeContext);
              const copyNo = getCopyChip(task);
              const revTransition = getRevisionTransition(task, matchedDar, matchedDoc);
              const badgeConfig = getTaskTypeBadgeConfig(normType, task);
              const slaBadge = getSLABadge(task, mockDateOffset);

              // ── Contextual Metadata ──
              const ownerDept = resolveTaskDepartment(task, storeContext);
              const requesterName = resolveRequesterName(task, matchedDar, matchedDoc, masterUsers);
              const reasonSnippet = resolveReasonSnippet(task, matchedDar);
              const location = task.location || task.locationName || task.station_name || task.point_of_use || '';
              const dueDate = task.dueDate || null;
              const isReplacement = Boolean(task.is_replacement || task.isReplacement || task.replacementReason === 'DAMAGED');
              const isUrgentFastTrack = task.isUrgent || task.priority === 'URGENT' || task.slaType === 'FAST_TRACK';

              const finalDocTitle = isExternal 
                ? (extDoc?.title || docTitle) 
                : ((isReceiptTask(task) && !task.docTitle && !task.docName && !task.doc_title) ? task.title : (docTitle || task.docTitle || task.title || task.documentName));

              return (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="bg-white border border-slate-200/90 hover:border-indigo-400 hover:shadow-xs rounded-lg p-3 sm:py-2.5 sm:px-3.5 transition-all duration-150 group cursor-pointer relative flex flex-col gap-1.5"
                >
                  {/* ── 1. Header Row (ประเภทงาน, หมายเลข และ SLA) ── */}
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    {/* ฝั่งซ้าย: Badge ประเภทงานเด่นชัด + Badge เลขที่คำร้องแบบโมโนสเปซ */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap ${badgeConfig.badgeClass}`}>
                        {badgeConfig.icon}
                        <span>{badgeConfig.label}</span>
                      </span>

                      {darNo && (
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-200 transition-colors whitespace-nowrap">
                          {darNo}
                        </span>
                      )}

                      {copyNo && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                          {copyNo}
                        </span>
                      )}

                      {/* 🛡️ Soft Muted Origin Badge to preserve Visual Hierarchy */}
                      {isExternal && (
                        <span className="bg-slate-100 text-slate-600 border border-slate-200/80 px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1 whitespace-nowrap">
                          <Globe size={10} className="text-slate-400 shrink-0" />
                          <span>ภายนอก</span>
                        </span>
                      )}
                    </div>

                    {/* ฝั่งขวา: Badge เตือนกำหนดเวลาและ SLA */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isUrgentFastTrack && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          <Zap size={9} className="fill-amber-500" /> Fast-Track
                        </span>
                      )}
                      {slaBadge}
                      {dueDate && (
                        <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          <Clock size={10} className="text-slate-400" />
                          <span>กำหนด: <strong className="font-mono text-slate-700">{formatThaiDateTime(dueDate)}</strong></span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── 2. Primary Identity Line (อัตลักษณ์เอกสาร) ── */}
                  <div className="flex items-start sm:items-center justify-between gap-2.5 my-1">
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      {/* 1. รหัสเอกสาร (Document Code) */}
                      <span className="font-bold text-blue-600 dark:text-blue-400 font-mono text-[13px] tracking-tight group-hover:text-blue-700 transition-colors whitespace-nowrap">
                        {displayDocCode}
                      </span>

                      {/* 2. แท็ก Revision หรือ Edition (ถ้ามี) */}
                      {isExternal ? (
                        (extDoc?.sourceVersion || task.sourceVersion || task.edition) ? (
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap font-bold">
                            Ver/Ed: {extDoc?.sourceVersion || task.sourceVersion || task.edition}
                          </span>
                        ) : null
                      ) : revTransition ? (
                        revTransition.type === 'TRANSITION' ? (
                          <span className={`inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap ${revTransition.badgeClass || ''}`}>
                            Rev.{revTransition.prev} <span className="text-slate-400">→</span> Rev.{revTransition.next}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap ${revTransition.badgeClass || ''}`}>
                            {revTransition.label}
                          </span>
                        )
                      ) : (task.revision || task.targetRevision) ? (
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                          {task.currentRevision ? `Rev.${task.currentRevision} → ` : ''}Rev.{String(task.revision || task.targetRevision).replace(/^rev\.?/i, '')}
                        </span>
                      ) : null}

                      {/* 3. ชื่อเอกสาร (Document Title) */}
                      {(() => {
                        const rawTitle = finalDocTitle || task.docTitle || task.title || task.documentName || '';
                        const cleanTitle = typeof rawTitle === 'string' ? rawTitle.replace(/^\[\]\s*/, '') : rawTitle;
                        return (
                          <>
                            <h3 
                              className="text-slate-900 font-medium text-[13px] sm:text-sm leading-snug tracking-tight line-clamp-1"
                              title={task.title || (typeof finalDocTitle === 'string' ? finalDocTitle : undefined)}
                            >
                              {cleanTitle}
                            </h3>
                            {!isReceiptTask(task) && task.title && task.title !== (finalDocTitle || task.docTitle) && (!cleanTitle || !task.title.includes(cleanTitle)) && (
                              <span className="sr-only"> ({task.title})</span>
                            )}
                          </>
                        );
                      })()}

                      {isReplacement && (
                        <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                          ฉบับทดแทน
                        </span>
                      )}
                    </div>

                    {/* 4. Card Action & Affordance (ปุ่ม Action ลัด) */}
                    {normType === 'PERIODIC_REVIEW_APPROVAL' || task.type === 'PERIODIC_REVIEW_APPROVAL' ? (
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedPeriodicReviewApprovalTask(task)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
                          title="เปิดแบบฟอร์มพิจารณาอนุมัติผลการทบทวน"
                        >
                          <ShieldCheck size={12} />
                          <span>พิจารณาอนุมัติ</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPeriodicReviewApprovalTask(task)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors whitespace-nowrap cursor-pointer"
                          title="ตีกลับให้ผู้จัดทำแก้ไขผลการทบทวน"
                        >
                          <RotateCcw size={12} />
                          <span>ตีกลับ</span>
                        </button>
                      </div>
                    ) : (
                      <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-slate-200 text-slate-700 shadow-2xs group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all whitespace-nowrap shrink-0">
                        <span>{badgeConfig.actionLabel}</span>
                        <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    )}
                  </div>

                  {/* ── 3. Contextual Metadata Row (ข้อมูลประกอบการพิจารณา) ── */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    {/* Badge แผนกเจ้าของเอกสาร */}
                    {ownerDept && (() => {
                      const style = getDeptBadgeStyle(ownerDept);
                      return (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap border ${style.badge}`}>
                          <Building2 className={`w-3.5 h-3.5 shrink-0 ${style.icon}`} />
                          <span>{formatDepartmentBadge(ownerDept, masterDepartments)}</span>
                        </span>
                      );
                    })()}

                    {/* ข้อมูลผู้ยื่นคำร้อง */}
                    {requesterName && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium whitespace-nowrap">
                        <User size={11} className="text-slate-400" />
                        <span>ผู้ขอ: <strong className="text-slate-800 font-semibold">{requesterName}</strong></span>
                      </span>
                    )}

                    {/* ข้อมูลผู้รับผิดชอบ (Assignee) ถ้ามีการกำหนดเจาะจงและไม่ใช่ผู้ร้องขอ */}
                    {task.assigneeName && task.assigneeName !== requesterName && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 font-medium whitespace-nowrap">
                        <User size={11} className="text-indigo-400" />
                        <span>ผู้รับผิดชอบ: <strong className="text-indigo-700 font-semibold">{task.assigneeName}</strong></span>
                      </span>
                    )}

                    {/* ตัวอย่างเหตุผลการแก้ไข (Reason Snippet) Truncated */}
                    {reasonSnippet && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 min-w-0 max-w-md truncate" title={reasonSnippet}>
                        <FileText size={11} className="text-slate-400 shrink-0" />
                        <span className="shrink-0 text-slate-600 font-medium">เหตุผล:</span>
                        <span className="truncate text-slate-700">{reasonSnippet}</span>
                      </span>
                    )}

                    {/* Location if hardcopy receipt task */}
                    {location && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
                        <MapPin size={11} className="text-slate-400" />
                        <span>{location}</span>
                      </span>
                    )}

                    {/* 🛡️ Return Reason Alert Banner for EXTERNAL_REVISE / REVISE */}
                    {(task.returnReason || task.rejectReason || task.rejectionRemarks || task.rejection_remarks) && (
                      <div className="w-full flex items-start gap-1.5 text-xs bg-rose-50 text-rose-800 border border-rose-200/80 px-2.5 py-1.5 rounded-md font-medium mt-0.5">
                        <AlertCircle size={13} className="text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">เหตุผลที่ส่งกลับแก้ไข:</span> {task.returnReason || task.rejectReason || task.rejectionRemarks || task.rejection_remarks}
                        </div>
                      </div>
                    )}

                    {/* Mobile Action indicator */}
                    <div className="sm:hidden ml-auto flex items-center text-indigo-600 font-bold text-[11px] gap-0.5">
                      <span>{badgeConfig.actionLabel}</span>
                      <ChevronRight size={13} />
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
              <CheckCircle className="mx-auto text-emerald-500 mb-1.5" size={30} />
              <p className="text-xs sm:text-sm font-bold text-slate-700">ไม่มีงานค้างในกล่องข้อความ</p>
              <p className="text-[11px] text-slate-400 mt-0.5">คุณจัดการงานทั้งหมดเรียบร้อยแล้ว</p>
            </div>
          )}
        </div>
        <TablePagination
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </div>

      <AnimatePresence>
        {selectedExtTask && (
          <ExternalDocActionModal
            isOpen={!!selectedExtTask}
            onClose={() => setSelectedExtTask(null)}
            task={selectedExtTask}
          />
        )}
        {selectedReceiptTask && (
          <TaskConfirmHardcopyReceiptModal
            isOpen={!!selectedReceiptTask}
            onClose={() => setSelectedReceiptTask(null)}
            task={selectedReceiptTask}
          />
        )}
        {selectedCustodyTask && (
          <DccCustodyActionModal
            isOpen={!!selectedCustodyTask}
            onClose={() => setSelectedCustodyTask(null)}
            task={selectedCustodyTask}
          />
        )}
        {selectedPeriodicReviewApprovalTask && (
          <PeriodicReviewApprovalModal
            isOpen={!!selectedPeriodicReviewApprovalTask}
            onClose={() => setSelectedPeriodicReviewApprovalTask(null)}
            task={selectedPeriodicReviewApprovalTask}
          />
        )}
        {isExternalDocModalOpen && (
          <ExternalDocFormModal
            isOpen={isExternalDocModalOpen}
            onClose={() => {
              setIsExternalDocModalOpen(false);
              setEditingExternalDoc(null);
              setResubmitTaskId(null);
            }}
            documentToEdit={editingExternalDoc}
            resubmitTaskId={resubmitTaskId}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default function TaskInboxWrapper(props) {
  return (
    <ErrorBoundary>
      <TaskInbox {...props} />
    </ErrorBoundary>
  );
}
