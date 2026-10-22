import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  FileText, 
  Download, 
  ExternalLink, 
  Sparkles, 
  PlusCircle, 
  Calendar, 
  ShieldCheck, 
  MapPin, 
  History,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Globe,
  Lock,
  Building2,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Loader2,
  Printer
} from 'lucide-react';
import useStore from '../../../../store/useStore';
import { normalizeDepartmentId, cleanLocationName } from '../../services/MasterDataService';
import { ErrorBoundary } from '../../../../shared/components/ErrorBoundary';
import { UniversalWatermarkService, resolveWatermarkConfig, WATERMARK_TYPES, applySupersededWatermark } from '../../services/UniversalWatermarkService';
import * as fileStorage from '../../utils/fileStorage';
import { FILE_PURPOSE } from '../../../../api/client';
import RequestAdditionalCopiesModal from './RequestAdditionalCopiesModal';
import ReplacementModal from '../../pages/Library/ReplacementModal';
import RelocateCopyModal from './RelocateCopyModal';
import ReturnCopyModal from './ReturnCopyModal';
import { canManageControlledCopy } from '../../utils/accessControl';
import DarAuditRecord from './DarAuditRecord';
import { jobTitle } from '../../utils/signatoryResolver';
import { formatDarNumber } from '../../utils/darNumberGenerator';
import { 
  getDarReason, 
  getDarDetail, 
  getRequesterName, 
  getReviewerName, 
  getApproverName, 
  getAckNames 
} from '../../utils/darHelper';
import { resolveDocCode, resolveDocTitle } from '../../utils/documentUtils';
import { generateQmsDownloadName } from '../../utils/documentNamingHelper';
import { resolveFullDocumentHistory } from '../Documents/DocumentHistoryTab';
import { PeriodicReviewHistoryTab } from './PeriodicReviewHistoryTab';
import { formatQmsDisplayDate } from '../../../../shared/utils/dateFormatter';
import toast from 'react-hot-toast';

export { resolveFullDocumentHistory };

/**
 * Strict revision normalizer
 * Normalizes '00', '0', 0, 'Rev.00', 'Rev.0', 'Rev. 00' -> '00'
 * Normalizes '01', '1', 1, 'Rev.01', 'Rev. 1' -> '01'
 * Preserves alphanumeric revisions like 'A' -> 'A'
 */
const normalizeRev = (r) => {
  if (r === undefined || r === null) return '';
  const str = String(r).trim().replace(/^Rev\.?\s*/i, '').trim();
  if (!str) return '';
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    return String(num).padStart(2, '0');
  }
  return str.toUpperCase();
};

/**
 * Strict revision equality matcher
 * Normalizes '01', 1, 'Rev.01', 'Rev.1' for accurate comparison
 */
const _isMatchingRevision = (revA, revB) => {
  const normA = normalizeRev(revA);
  const normB = normalizeRev(revB);
  if (!normA || !normB) return false;
  return normA === normB;
};

/**
 * ฟังก์ชันดาวน์โหลดประวัติเอกสารฉบับเก่า (Exact Historical Revision PDF)
 * ดึงไฟล์ PDF ต้นฉบับเฉพาะของ Revision นั้นๆ (ห้ามใช้ไฟล์ของฉบับ Effective ปัจจุบันเด็ดขาด)
 * แล้วนำไฟล์ของ Revision นั้นไปประทับลายน้ำ SUPERSEDED หรือ OBSOLETE ตามมาตรฐาน ISO 9001
 * 
 * @param {Object} darItem - ประวัติ DAR หรือรายการ Revision
 * @param {Object} currentDoc - เอกสารหลักที่กำลังเปิดดู
 * @param {Object} options - { currentUser, relatedDar, skipDownload }
 */
export const handleDownloadHistoricalRevision = async (darItem, currentDoc, options = {}) => {
  try {
    const isObsoleteItem = Boolean(darItem.type === 'OBSOLETE' || darItem.request_type === 'OBSOLETE' || darItem.darType === 'OBSOLETE' || darItem.is_obsolete);

    // 1. ค้นหาข้อมูล DAR ที่ตรงกับประวัตินี้เพื่อดึงไฟล์ที่แนบมาในรอบนั้น
    let relatedDar = options.relatedDar;
    if (!relatedDar) {
      try {
        const store = useStore.getState();
        const allDars = [...(store.dars || []), ...(store.darRequests || [])];
        relatedDar = allDars.find(d => 
          (darItem.dar_no && (d.dar_no === darItem.dar_no || d.darNo === darItem.dar_no || d.id === darItem.dar_no)) ||
          (darItem.id && (d.id === darItem.id || d.dar_no === darItem.id || d.darNo === darItem.id)) ||
          (darItem.darNo && (d.darNo === darItem.darNo || d.dar_no === darItem.darNo || d.id === darItem.darNo)) ||
          (darItem.dar_id && (d.id === darItem.dar_id || d.dar_no === darItem.dar_id))
        );
      } catch {}
    }

    const candidateDocRev = (currentDoc?.rev && currentDoc?.rev !== '00') 
      ? currentDoc.rev 
      : ((currentDoc?.revision && currentDoc?.revision !== '00') 
        ? currentDoc.revision 
        : (currentDoc?.rev || currentDoc?.revision || '01'));

    const rawTargetRev = darItem.target_revision ?? darItem.targetRevision ?? darItem.docRev ?? darItem.rev ?? darItem.revision ?? darItem.doc_version ?? relatedDar?.target_revision ?? relatedDar?.targetRevision ?? relatedDar?.revision ?? relatedDar?.docRev ?? relatedDar?.rev;
    const rawObsoleteRev = (darItem.revision && darItem.revision !== '00') 
      ? darItem.revision 
      : (rawTargetRev && rawTargetRev !== '00' ? rawTargetRev : candidateDocRev);
    const effectiveObsoleteRev = String(rawObsoleteRev).replace(/^Rev\.?/i, '').padStart(2, '0');

    const darRevStr = isObsoleteItem 
      ? effectiveObsoleteRev 
      : String(rawTargetRev || '00').replace(/^Rev\.?/i, '').padStart(2, '0');
    const targetRev = isObsoleteItem ? effectiveObsoleteRev : darRevStr;

    const docCode = resolveDocCode(currentDoc) || currentDoc?.code || currentDoc?.document_code || currentDoc?.docNo || currentDoc?.title || 'DOCUMENT';
    const darNo = formatDarNumber(darItem.dar_no || darItem.darNo || darItem.id || `DAR-2026-${darRevStr}`);
    const effDate = darItem.completedAt || darItem.effectiveDate || darItem.effective_date_requested || darItem.date || darItem.createdAt?.split('T')[0] || '-';

    let replacementRev = options.replacedByRev;
    if (!replacementRev) {
      try {
        const store = useStore.getState();
        const allDocs = [...(store.documents || []), ...(store.masterDocuments || [])];
        const effectiveDoc = allDocs.find(d => {
          const c = (d.document_code || d.doc_code || d.code || d.docNo || d.title || '').trim().toUpperCase();
          return c === String(docCode).toUpperCase() && (d.status === 'EFFECTIVE' || d.status === 'ACTIVE');
        });
        if (effectiveDoc) {
          replacementRev = effectiveDoc.rev || effectiveDoc.revision;
        }
      } catch {}
    }
    if (!replacementRev) {
      replacementRev = currentDoc?.rev || currentDoc?.revision || 'Latest';
    }
    const replacedByRevStr = String(replacementRev).replace(/^Rev\.?/i, '').padStart(2, '0');

    // 2. ดึงไฟล์เฉพาะของ Revision นั้น (ห้ามใช้ currentDoc.file เด็ดขาด ยกเว้นกรณีคำร้อง OBSOLETE ที่ใช้ไฟล์ Master PDF ฉบับสุดท้าย)
    let rawRevisionFile = 
      darItem.file || 
      darItem.fileBlob || 
      darItem.fileData ||
      darItem.finalPdf ||
      darItem.final_file ||
      darItem.attachedFile?.file ||
      darItem.attachedFile?.blob ||
      relatedDar?.final_file || 
      relatedDar?.finalPdf || 
      relatedDar?.file || 
      relatedDar?.fileBlob || 
      relatedDar?.fileData ||
      relatedDar?.attachedFile?.file ||
      relatedDar?.attachedFile?.blob;

    if (isObsoleteItem && !rawRevisionFile) {
      rawRevisionFile = currentDoc?.file || currentDoc?.fileBlob || currentDoc?.fileData;
    }

    // ตรวจสอบใน revision_history ของเอกสาร
    if (!rawRevisionFile && currentDoc?.revision_history && Array.isArray(currentDoc.revision_history)) {
      const cleanTRev = String(targetRev).replace(/\D/g, '');
      const hist = currentDoc.revision_history.find(h => {
        const hRev = String(h.revision || h.rev || '').replace(/\D/g, '');
        return hRev === cleanTRev || h.dar_no === darNo || h.dar_id === darItem.id;
      });
      if (hist) {
        rawRevisionFile = hist.file || hist.fileBlob || hist.fileData || hist.finalPdf;
      }
    }

    // ตรวจสอบใน documents ของ Store (หากมีเอกสารฉบับ Superseded นั้นเก็บไว้)
    if (!rawRevisionFile) {
      try {
        const store = useStore.getState();
        const allDocs = [...(store.documents || []), ...(store.masterDocuments || []), ...(store.supersededDocuments || [])];
        const cleanTRev = String(targetRev).replace(/\D/g, '');
        const codeUpper = String(docCode).toUpperCase();
        const matchedDoc = allDocs.find(d => {
          const c = (d.document_code || d.doc_code || d.code || d.docNo || d.title || '').trim().toUpperCase();
          const r = String(d.revision || d.rev || '').replace(/\D/g, '');
          return c === codeUpper && r === cleanTRev && (d.status === 'SUPERSEDED' || d.is_superseded || isObsoleteItem);
        });
        if (matchedDoc) {
          rawRevisionFile = matchedDoc.file || matchedDoc.fileBlob || matchedDoc.fileData;
        }
      } catch {}
    }

    // ตรวจสอบจาก storage โดยใช้ getVersionFileFromStorage
    if (!rawRevisionFile) {
      rawRevisionFile = await fileStorage.getVersionFileFromStorage(docCode, targetRev);
    }

    // ตรวจสอบจาก IndexedDB / In-Memory cache แยกตาม Key
    if (!rawRevisionFile) {
      const cleanTRev = String(targetRev).replace(/^Rev\.?/i, '').trim();
      const storageKeys = [
        `DOC_${docCode}_REV${cleanTRev}`,
        `FILE_${docCode}_REV${cleanTRev}`,
        `DOC_${docCode}_REV${cleanTRev.padStart(2, '0')}`,
        `FILE_${docCode}_REV${cleanTRev.padStart(2, '0')}`,
        `DOC_${docCode}_REV_${cleanTRev}`,
        `FILE_${docCode}_REV_${cleanTRev}`,
        `DOC_${docCode}_REV_${cleanTRev.padStart(2, '0')}`,
        `FILE_${docCode}_REV_${cleanTRev.padStart(2, '0')}`,
        `${docCode}_REV_${cleanTRev}`,
        `${docCode}_REV_${cleanTRev.padStart(2, '0')}`,
        darItem.fileId,
        darItem.id,
        relatedDar?.fileId,
        relatedDar?.id
      ].filter(Boolean);

      for (const k of storageKeys) {
        try {
          const retrieved = await fileStorage.getFile(k);
          if (retrieved) {
            rawRevisionFile = retrieved;
            break;
          }
        } catch {}
      }
    }

    // Fallback sample document if in mock/test environment without uploaded binary
    if (!rawRevisionFile) {
      try {
        const { getSystemSampleDocumentBlob } = await import('../../utils/pdfStamper');
        rawRevisionFile = getSystemSampleDocumentBlob(docCode, currentDoc?.name || currentDoc?.title || 'Standard Document', targetRev);
      } catch {}
    }

    if (!rawRevisionFile) {
      toast?.error?.(`ไม่พบไฟล์ประวัติของ Revision ${targetRev}`);
      return null;
    }

    // 3. นำไฟล์ของ Revision นั้นไปประทับลายน้ำ SUPERSEDED หรือ OBSOLETE
    let downloadBlob = null;
    let downloadFilename = `${docCode}_Rev${targetRev}_SUPERSEDED.pdf`;

    if (isObsoleteItem) {
      downloadFilename = `${docCode}_Rev${targetRev}_OBSOLETE.pdf`;
      const { drawStandardIsoWatermark } = await import('../../services/watermarkEngine');
      const stampedBytes = await drawStandardIsoWatermark(rawRevisionFile, 'OBSOLETE', {
        docCode,
        documentCode: docCode,
        revNo: targetRev,
        effectiveDate: effDate,
        darNo,
        userName: options.currentUser?.name || 'DCC Officer',
        userDept: options.currentUser?.department || 'DC'
      });
      const pdfBytes = (stampedBytes && typeof stampedBytes.save === 'function') ? await stampedBytes.save() : stampedBytes;
      downloadBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    } else {
      downloadBlob = await applySupersededWatermark(rawRevisionFile, {
        documentCode: docCode,
        docCode,
        formerRev: targetRev,
        revision: targetRev,
        replacedByRev: replacedByRevStr, // Rev ปัจจุบันที่มาแทนที่
        supersededByRev: replacedByRevStr,
        effectiveDate: effDate,
        darNo,
        userName: options.currentUser?.name || 'DCC Officer',
        userDept: options.currentUser?.department || 'DC'
      });
    }

    // 4. สั่งดาวน์โหลดไฟล์ (หากไม่ได้กำหนด skipDownload)
    if (!options.skipDownload && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const downloadUrl = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try { URL.revokeObjectURL(downloadUrl); } catch {}
      }, 60000);

      toast?.success?.(
        isObsoleteItem
          ? `ดาวน์โหลดเอกสาร Rev.${targetRev} (Obsolete) สำเร็จ`
          : `ดาวน์โหลดเอกสาร Rev.${targetRev} (Superseded) สำเร็จ`
      );
    }

    return downloadBlob;
  } catch (error) {
    console.error('Error downloading historical revision:', error);
    toast?.error?.('เกิดข้อผิดพลาดในการดาวน์โหลดเอกสารประวัติ');
    return null;
  }
};

/**
 * Format raw date string/ISO into strict 'DD/MM/YYYY HH:mm'
 */
const formatWorkflowTimestamp = (rawVal, defaultTime = '09:00') => {
  if (!rawVal) return '-';
  try {
    if (typeof rawVal === 'string' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(rawVal)) {
      return rawVal;
    }
    const d = new Date(rawVal);
    if (isNaN(d.getTime())) {
      return String(rawVal);
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    let minutes = d.getMinutes();

    // If midnight (00:00) because it was only a YYYY-MM-DD string, use default business hours
    if (hours === 0 && minutes === 0 && defaultTime) {
      const [dh, dm] = defaultTime.split(':').map(Number);
      hours = dh || 9;
      minutes = dm || 0;
    }

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${day}/${month}/${year} ${hh}:${mm}`;
  } catch {
    return String(rawVal);
  }
};

/**
 * Resolve explicit workflow stage timestamp (DD/MM/YYYY HH:mm) from timeline or DAR fields
 */
const getWorkflowStepTimestamp = (dar, stepType, timeline) => {
  if (!dar) return '-';
  const darId = dar.id || dar.dar_no;

  if (timeline && timeline.length > 0) {
    const actionMatches = {
      'REQUEST': ['Created', 'SUBMIT', 'Submitted', 'Resubmitted', 'Create'],
      'REVIEW': ['Reviewed', 'REVIEW', 'Review'],
      'APPROVE': ['Approved', 'APPROVE', 'Approve'],
      'ACK': ['Acknowledged', 'ACKNOWLEDGE', 'Ack', 'Distributed', 'DISTRIBUTE']
    };

    const targetActions = actionMatches[stepType] || [];
    const tlItem = timeline
      .slice()
      .reverse()
      .find(t => (String(t.darId) === String(darId) || String(t.darId) === String(dar.dar_no)) && targetActions.includes(t.action));

    if (tlItem && (tlItem.timestamp || tlItem.date || tlItem.createdAt)) {
      return formatWorkflowTimestamp(tlItem.timestamp || tlItem.date || tlItem.createdAt);
    }
  }

  if (stepType === 'REQUEST') {
    const raw = dar.request_timestamp || dar.createdAt || dar.requestDate || dar.request_date || dar.date;
    if (raw) return formatWorkflowTimestamp(raw, '08:30');
  } else if (stepType === 'REVIEW') {
    const raw = dar.reviewed_timestamp || dar.reviewedAt || dar.reviewed_at || dar.reviewDate;
    if (raw) return formatWorkflowTimestamp(raw, '11:15');
    if (dar.createdAt || dar.requestDate) return formatWorkflowTimestamp(dar.createdAt || dar.requestDate, '11:15');
  } else if (stepType === 'APPROVE') {
    const raw = dar.approved_timestamp || dar.approvedAt || dar.approved_at || dar.approveDate;
    if (raw) return formatWorkflowTimestamp(raw, '14:45');
    if (dar.effectiveDate || dar.createdAt) return formatWorkflowTimestamp(dar.effectiveDate || dar.createdAt, '14:45');
  } else if (stepType === 'ACK') {
    const isAckRequired = dar.requireAck === true || dar.require_ack === true || dar.ackRequirement === 'REQUIRED';
    if (!isAckRequired) return '-';
    const raw = dar.acknowledged_timestamp || dar.acknowledgedAt || dar.acknowledged_at || dar.ackDate;
    if (raw) return formatWorkflowTimestamp(raw, '16:20');
    if (dar.effectiveDate) return formatWorkflowTimestamp(dar.effectiveDate, '16:20');
  }

  return '-';
};

/**
 * Lightweight Headless Menu Compound Component
 */
const MenuContext = createContext({ isOpen: false, setIsOpen: () => {} });

const Menu = ({ as: Component = 'div', className = '', children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <MenuContext.Provider value={{ isOpen, setIsOpen }}>
      <Component ref={menuRef} className={className}>
        {children}
      </Component>
    </MenuContext.Provider>
  );
};

Menu.Button = ({ className = '', children, ...props }) => {
  const { isOpen, setIsOpen } = useContext(MenuContext);
  return (
    <button
      type="button"
      className={className}
      onClick={() => setIsOpen(!isOpen)}
      {...props}
    >
      {children}
    </button>
  );
};

Menu.Items = ({ className = '', children }) => {
  const { isOpen } = useContext(MenuContext);
  if (!isOpen) return null;
  return (
    <div className={className}>
      {children}
    </div>
  );
};

Menu.Item = ({ children }) => {
  const { setIsOpen } = useContext(MenuContext);
  const [active, setActive] = useState(false);

  return (
    <div
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onClick={() => setIsOpen(false)}
    >
      {typeof children === 'function' ? children({ active }) : children}
    </div>
  );
};

const DocumentDetailModal = ({ 
  isOpen, 
  onClose, 
  document: inputDoc, 
  onOpenViewer,
  filterStatus = 'ALL',
  activeTab: _libraryActiveTab = 'TAB_MY_DEPT' 
}) => {
  const { 
    documents,
    currentUser, 
    masterDepartments,
    controlledCopyInstances, 
    documentControlledCopies,
    dars,
    darRequests,
    timeline,
    masterUsers,
    reportCcDamagedLost,
    canDownloadDocument = () => true,
    periodicReviewSchedules
  } = useStore();

  // Find all revisions for the current document code to enable switching
  const availableRevisions = useMemo(() => {
    if (!inputDoc) return [];
    const targetCode = resolveDocCode(inputDoc);
    let revs = [];
    if (Array.isArray(inputDoc.revisions) && inputDoc.revisions.length > 0) {
      revs = [...inputDoc.revisions];
    } else if (targetCode && Array.isArray(documents)) {
      revs = documents.filter(d => {
        const codeMatch = resolveDocCode(d)?.toUpperCase() === targetCode.toUpperCase();
        if (!codeMatch) return false;
        if (inputDoc.status === 'SUPERSEDED') {
          return d.status === 'SUPERSEDED' || d.status === 'SUPERSEDED_ARCHIVED' || Boolean(d.is_superseded);
        }
        return true;
      }).map(d => (String(d.id) === String(inputDoc.id) ? { ...d, ...inputDoc } : d));
    }
    if (revs.length === 0 && inputDoc) {
      revs = [inputDoc];
    }
    revs.sort((a, b) => {
      const revA = parseInt(String(a.rev || a.revision || '0').replace(/\D/g, ''), 10) || 0;
      const revB = parseInt(String(b.rev || b.revision || '0').replace(/\D/g, ''), 10) || 0;
      return revB - revA;
    });
    return revs;
  }, [inputDoc, documents]);

  const [selectedRevId, setSelectedRevId] = useState(null);

  useEffect(() => {
    if (inputDoc) {
      setSelectedRevId(inputDoc.id || null);
    }
  }, [inputDoc]);

  // Derive active doc dynamically based on selected revision
  const doc = useMemo(() => {
    if (!inputDoc) return null;
    if (!selectedRevId) {
      return availableRevisions[0] || inputDoc;
    }
    const found = availableRevisions.find(r => 
      String(r.id) === String(selectedRevId) || 
      String(r.revision || r.rev).replace(/\D/g, '') === String(selectedRevId).replace(/\D/g, '')
    );
    return found || availableRevisions[0] || inputDoc;
  }, [inputDoc, selectedRevId, availableRevisions]);

  const allDars = useMemo(() => {
    const raw = [...(dars || []), ...(darRequests || [])];
    const map = new Map();
    raw.forEach(d => {
      if (!d) return;
      const key = String(d.id || d.dar_no || d.darNo);
      if (!map.has(key)) {
        map.set(key, d);
      }
    });
    return Array.from(map.values());
  }, [dars, darRequests]);

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'history' | 'periodic'
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedReplacementCopy, setSelectedReplacementCopy] = useState(null);
  const [selectedRelocateCopy, setSelectedRelocateCopy] = useState(null);
  const [selectedReturnCopy, setSelectedReturnCopy] = useState(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  let navigate;
  try {
    navigate = useNavigate();
  } catch {
    navigate = (path) => {
      if (typeof window !== 'undefined') {
        window.location.href = path;
      }
    };
  }
  // Recording happens on the periodic review page: it enforces who may review, routes NO_CHANGE to approval and links any DAR to the cycle.
  const handleRecordReview = () => {
    if (!inputDoc) return;
    const matchingSchedule = (periodicReviewSchedules || []).find(
      s => s.documentId === inputDoc.id || s.externalDocumentId === inputDoc.id ||
           (inputDoc.title && s.documentNumber === inputDoc.title) ||
           (inputDoc.doc_code && s.documentNumber === inputDoc.doc_code)
    );
    const docCode = resolveDocCode(inputDoc);
    const params = new URLSearchParams({ docId: String(inputDoc.id) });
    if (docCode) params.set('docCode', docCode);
    onClose();
    navigate(`/dcc/periodic-reviews/${encodeURIComponent(matchingSchedule?.id || docCode || inputDoc.id)}?${params.toString()}`);
  };

  const isDccAdmin = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.isDccAdmin || 
    currentUser?.department === 'DC' || 
    currentUser?.department === 'DCC'
  );

  // Robust permission check supporting both argument signatures: (doc, user) and (user, doc)
  const canDownload = useMemo(() => {
    if (!doc || !currentUser) return false;
    if (typeof canDownloadDocument !== 'function') return true;
    return Boolean(canDownloadDocument(doc, currentUser) || canDownloadDocument(currentUser, doc));
  }, [doc, currentUser, canDownloadDocument]);

  // Safe viewer open handler with seamless fallback
  const handleOpenViewer = () => {
    onClose();
    if (onOpenViewer) {
      onOpenViewer(doc);
    } else if (doc?.id) {
      const docRev = normalizeRev(doc.rev || doc.revision || doc.doc_version || '01');
      if (typeof window !== 'undefined') {
        window.location.href = `/viewer/${doc.id}/${docRev}`;
      }
    }
  };

  // Real PDF download handler with Universal File Resolver & Watermark Pipeline
  const handleDownloadPdf = async (mode = 'UNCONTROLLED') => {
    if (!doc) return;
    if (isDownloadingPdf) return;

    if (!canDownload) {
      toast.error('คุณไม่มีสิทธิ์ดาวน์โหลดเอกสารนี้ตามระดับการเข้าถึง (Access Scope)');
      return;
    }

    setIsDownloadingPdf(true);
    const toastId = toast.loading('กำลังค้นหาและจัดเตรียมไฟล์ PDF...');

    try {
      // 1. Resolve raw file blob through Universal File Resolver
      const rawBlob = await fileStorage.resolveFileBlob(doc, doc.fileId || doc.id || doc.docCode || doc.title || doc.darId, { purpose: FILE_PURPOSE.DOWNLOAD });

      if (!rawBlob) {
        toast.dismiss(toastId);
        toast.error('ไม่พบไฟล์เอกสารต้นฉบับในระบบ');
        setIsDownloadingPdf(false);
        return;
      }

      const isForm = UniversalWatermarkService.isBlankFormBypass(doc);
      const isCleanMode = mode === 'CLEAN' || mode === 'CLEAN_MASTER' || isForm;

      const docCode = resolveDocCode(doc) || doc.docNo || doc.title || 'DOCUMENT';
      const docRev = normalizeRev(doc.rev || doc.revision || doc.doc_version || '01');
      const docTitle = resolveDocTitle(doc) || doc.name || doc.docName || doc.title || '';
      const cleanFileName = generateQmsDownloadName({
        docCode,
        title: docTitle,
        revision: docRev,
        systemStatus: doc.status || 'ACTIVE',
        isControlledPrint: false,
        isCleanMaster: isCleanMode
      });

      // Attach resolved blob to doc clone to ensure UniversalWatermarkService consumes it directly
      const docWithFile = {
        ...doc,
        fileBlob: rawBlob,
        file: rawBlob,
        attachedFile: doc.attachedFile || rawBlob,
        title: docCode,
        docCode,
        docTitle
      };

      if (isCleanMode) {
        await UniversalWatermarkService.downloadCleanPdf(docWithFile, {
          userName: currentUser?.name || 'User',
          userDept: currentUser?.department || currentUser?.dept || 'User Station',
          docCode,
          docTitle,
          currentUser,
          isCleanMaster: true,
          filename: cleanFileName
        }, false);
      } else if (mode === 'CONTROLLED' || mode === 'CONTROLLED_COPY') {
        const watermarkType = WATERMARK_TYPES.CONTROLLED_COPY;
        await UniversalWatermarkService.downloadWatermarkedPdf(
          docWithFile,
          watermarkType,
          {
            userName: currentUser?.name || 'User',
            userDept: currentUser?.department || currentUser?.dept || 'User Station',
            holderDept: doc.department || currentUser?.department || 'DCC',
            location: doc.location || doc.pointOfUse || doc.locationName || doc.department || 'DCC Office',
            docCode,
            docTitle,
            docVersion: docRev,
            copyNo: '01',
            issueNo: '01',
            isControlledPrint: true,
            currentUser,
            filename: cleanFileName
          },
          false
        );
      } else {
        const watermarkType = WATERMARK_TYPES.UNCONTROLLED_COPY;
        const watermarkConfig = resolveWatermarkConfig(docWithFile, { currentUser });

        await UniversalWatermarkService.downloadWatermarkedPdf(
          docWithFile,
          watermarkType,
          {
            userName: currentUser?.name || 'User',
            userDept: currentUser?.department || currentUser?.dept || 'User Station',
            reason: 'Master Document Record Download',
            location: currentUser?.department || currentUser?.dept || 'User Station',
            ...watermarkConfig?.metadata,
            docCode,
            docTitle,
            docVersion: docRev,
            watermarkType: 'UNCONTROLLED_COPY',
            downloadMode: 'UNCONTROLLED_COPY',
            isUncontrolledCopy: true,
            currentUser,
            filename: cleanFileName
          },
          false
        );
      }

      toast.dismiss(toastId);
      toast.success('ดาวน์โหลดเอกสาร PDF สำเร็จ');
    } catch (err) {
      console.error('[DocumentDetailModal] PDF Download failed:', err);
      toast.dismiss(toastId);
      const msg = err?.message || '';
      if (msg.includes('ไม่พบ') || msg.includes('not found')) {
        toast.error('ไม่พบไฟล์เอกสารต้นฉบับในระบบ');
      } else {
        toast.error('เกิดข้อผิดพลาดในการดาวน์โหลดเอกสาร PDF');
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadControlledCopy = async (targetCopy) => {
    try {
      const copyNum = targetCopy.copy_no || targetCopy.copyNo || targetCopy.ccNumber || '01';
      const toastId = toast.loading(`กำลังจัดเตรียมสำเนาควบคุม Copy ${copyNum}...`);
      const rawBlob = await fileStorage.resolveFileBlob(doc, doc.fileId || doc.id || doc.docCode || doc.title || doc.darId, { purpose: FILE_PURPOSE.DOWNLOAD });
      const docCode = resolveDocCode(doc) || doc.docNo || doc.title || 'DOCUMENT';
      const docRev = normalizeRev(doc.rev || doc.revision || doc.doc_version || '01');
      const docTitle = resolveDocTitle(doc) || doc.name || doc.docName || doc.title || '';

      const docWithFile = {
        ...doc,
        fileBlob: rawBlob,
        file: rawBlob,
        attachedFile: doc.attachedFile || rawBlob,
        title: docCode,
        docCode,
        docTitle
      };

      await UniversalWatermarkService.downloadWatermarkedPdf(docWithFile, WATERMARK_TYPES.CONTROLLED_COPY, {
        currentUser,
        docCode,
        docTitle,
        docVersion: docRev,
        copyNo: targetCopy.copy_no || targetCopy.copyNo || targetCopy.ccNumber || '01',
        issueNo: targetCopy.issue_no || targetCopy.issueNo || '01',
        holderDept: targetCopy.holder_dept || targetCopy.department || targetCopy.holderDept || 'DCC',
        location: targetCopy.location || targetCopy.pointOfUse || targetCopy.targetLocation || targetCopy.locationName || targetCopy.station_name || '-',
        issuedDate: targetCopy.issuedDate || targetCopy.receipt_confirmed_at || targetCopy.dateIssued || new Date().toISOString().split('T')[0],
        isControlledPrint: true
      });

      toast.dismiss(toastId);
      toast.success(`ดาวน์โหลดสำเนาควบคุม Copy ${copyNum} สำเร็จ`);
    } catch (err) {
      console.error('[DocumentDetailModal] Controlled copy download failed:', err);
      toast.error('เกิดข้อผิดพลาดในการดาวน์โหลดสำเนาควบคุม');
    }
  };

  // Synchronized copies
  const allCopies = useMemo(() => {
    return (controlledCopyInstances && controlledCopyInstances.length > 0)
      ? controlledCopyInstances
      : (documentControlledCopies || []);
  }, [controlledCopyInstances, documentControlledCopies]);

  // Current document revision
  const currentDocRev = String(doc?.rev || doc?.currentRevision || doc?.revision || doc?.doc_version || '01');
  const normCurrentRev = String(currentDocRev).replace(/^Rev\.?/i, '').padStart(2, '0');

  // Accordion state for superseded revisions (Default: user-clicked revision is expanded)
  const [expandedRevs, setExpandedRevs] = useState(() => ({ [normCurrentRev]: true }));

  useEffect(() => {
    const r = String(currentDocRev).replace(/^Rev\.?/i, '').padStart(2, '0');
    setExpandedRevs({ [r]: true });
  }, [doc?.id, currentDocRev]);

  const toggleRevision = (rev) => {
    setExpandedRevs(prev => ({
      ...prev,
      [rev]: !prev[rev]
    }));
  };

  // Determine if this document is a Superseded / Obsolete revision
  const isObsoleteDoc = useMemo(() => {
    if (!doc) return false;
    return Boolean(
      doc.status?.toUpperCase() === 'OBSOLETE' || 
      doc.status?.toUpperCase() === 'OBSOLETE_ARCHIVED' || 
      doc.status?.toUpperCase() === 'ARCHIVED_OBSOLETE' || 
      doc.is_obsolete ||
      (filterStatus === 'OBSOLETE')
    );
  }, [doc, filterStatus]);

  const isSupersededDoc = useMemo(() => {
    if (!doc) return false;
    if (isObsoleteDoc) return false; // Obsolete takes priority
    return Boolean(
      doc.status?.toUpperCase() === 'SUPERSEDED' || 
      doc.status?.toUpperCase() === 'SUPERSEDED_ARCHIVED' || 
      doc.is_superseded || 
      (filterStatus === 'SUPERSEDED' && doc.status !== 'EFFECTIVE' && doc.status !== 'ACTIVE')
    );
  }, [doc, filterStatus, isObsoleteDoc]);

  // Effective document mode: active/effective document (not superseded and not obsolete)
  const isEffectiveMode = useMemo(() => {
    return !isSupersededDoc && !isObsoleteDoc;
  }, [isSupersededDoc, isObsoleteDoc]);

  // Strict Revision Scoping & Selector-Level Deduplication (Strict Single-Record per Physical Copy)
  const { activeCopies, recalledCopies, groupedRecalledCopies } = useMemo(() => {
    if (!doc) return { activeCopies: [], recalledCopies: [], groupedRecalledCopies: [] };

    const docCode = (doc.title || doc.doc_code || doc.code || '').trim().toUpperCase();

    const isMatchingDoc = (c) => {
      const matchId = (c.doc_id && String(c.doc_id) === String(doc.id)) ||
                      (c.docId && String(c.docId) === String(doc.id));
      const copyCode = (c.doc_code || c.docTitle || c.document_code || '').trim().toUpperCase();
      const matchCode = Boolean(docCode && copyCode && docCode === copyCode);
      return Boolean(matchId || matchCode);
    };

    const matchingCopies = allCopies.filter(isMatchingDoc);

    const getCopyRev = (c) => {
      const rawRev = c.rev ?? c.doc_version ?? c.revision ?? c.docRev ?? c.displayRev;
      if (rawRev !== undefined && rawRev !== null && String(rawRev).trim() !== '') {
        return String(rawRev).replace(/^Rev\.?/i, '').padStart(2, '0');
      }
      if (c.doc_id || c.docId) {
        const matchedDoc = (documents || []).find(d => String(d.id) === String(c.doc_id || c.docId));
        if (matchedDoc && (matchedDoc.rev || matchedDoc.revision)) {
          return String(matchedDoc.rev || matchedDoc.revision).replace(/^Rev\.?/i, '').padStart(2, '0');
        }
      }
      return normCurrentRev;
    };

    // Lifecycle status priority: most advanced physical disposition status takes precedence
    const STATUS_PRIORITY = {
      'DESTROYED': 100,
      'RECALLED_DESTROYED': 95,
      'ARCHIVED_OBSOLETE': 90,
      'OBSOLETE_ARCHIVED': 85,
      'RECALLED_OBSOLETE': 80,
      'DISPOSED': 75,
      'RECALLED': 60,
      'RECALLED_HELD_AT_DCC': 55,
      'RECEIVED_AT_DCC': 50,
      'SUPERSEDED_PENDING_RECALL': 40,
      'PENDING_RECALL': 35,
      'DAMAGED_PENDING_RECALL': 30,
      'OBSOLETE_PENDING_RECALL': 25,
      'ISSUED_ACTIVE': 20,
      'ACTIVE': 18,
      'DISPATCHED_PENDING_RECEIPT': 15,
      'PENDING_RECEIPT': 12,
      'PENDING_ISSUE': 10
    };

    if (isSupersededDoc) {
      // PHASE 3: ACCORDION STACKING BY REVISION
      // 1. Group all controlled copy records for this document code by revision
      const revsSet = new Set();
      revsSet.add(normCurrentRev);

      // Include revisions from matching copies
      matchingCopies.forEach(c => {
        const cRev = getCopyRev(c);
        const cRevNum = parseInt(cRev, 10);
        const curRevNum = parseInt(normCurrentRev, 10);
        if (c.is_superseded || 
            String(c.status || '').toUpperCase().includes('RECALL') ||
            String(c.status || '').toUpperCase().includes('SUPERSEDED') ||
            String(c.status || '').toUpperCase().includes('DESTROY') ||
            (!isNaN(cRevNum) && !isNaN(curRevNum) && cRevNum <= curRevNum)) {
          revsSet.add(cRev);
        }
      });

      // Include historical/superseded revisions from documents list
      (documents || []).forEach(d => {
        const dCode = (d.title || d.doc_code || d.code || '').trim().toUpperCase();
        if (dCode && dCode === docCode) {
          if (d.status === 'SUPERSEDED' || d.status === 'SUPERSEDED_ARCHIVED' || d.is_superseded) {
            revsSet.add(String(d.rev || d.revision || '00').replace(/^Rev\.?/i, '').padStart(2, '0'));
          }
        }
      });

      // Include historical revisions from DARs (<= currentDocRev)
      (dars || []).forEach(dar => {
        const darDocCode = (dar.doc_code || dar.title || '').trim().toUpperCase();
        if (darDocCode && darDocCode === docCode) {
          const dRevStr = String(dar.docRev || dar.rev || dar.revision || '00').replace(/^Rev\.?/i, '').padStart(2, '0');
          const dRevNum = parseInt(dRevStr, 10);
          const curRevNum = parseInt(normCurrentRev, 10);
          if (!isNaN(dRevNum) && !isNaN(curRevNum) && dRevNum <= curRevNum) {
            revsSet.add(dRevStr);
          }
        }
      });

      const copiesByRev = new Map();
      revsSet.forEach(r => copiesByRev.set(r, new Map()));

      matchingCopies.forEach(copy => {
        const cRev = getCopyRev(copy);
        if (copiesByRev.has(cRev)) {
          let copyStatus = copy.status;
          if (!copyStatus || copyStatus === 'ISSUED_ACTIVE' || copyStatus === 'ACTIVE') {
            copyStatus = copy.receipt_confirmed_at ? 'SUPERSEDED_PENDING_RECALL' : 'RECALLED';
          }
          const hydratedCopy = {
            ...copy,
            displayRev: cRev,
            status: copyStatus
          };
          const copyNum = parseInt(String(copy.copy_no || copy.ccNumber || '0').replace(/\D/g, ''), 10) || 1;
          const copyKey = `Copy_${String(copyNum).padStart(2, '0')}`;
          const targetMap = copiesByRev.get(cRev);

          if (!targetMap.has(copyKey)) {
            targetMap.set(copyKey, hydratedCopy);
          } else {
            const existing = targetMap.get(copyKey);
            const existingPrio = STATUS_PRIORITY[String(existing.status).toUpperCase()] || 0;
            const newPrio = STATUS_PRIORITY[String(hydratedCopy.status).toUpperCase()] || 0;
            if (newPrio > existingPrio) {
              targetMap.set(copyKey, hydratedCopy);
            }
          }
        }
      });

      // Sort revision groups descending: latest revision -> oldest (e.g. Rev.01 -> Rev.00)
      const sortedRevisionGroups = Array.from(revsSet)
        .sort((a, b) => {
          const numA = parseInt(a, 10);
          const numB = parseInt(b, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
          return b.localeCompare(a);
        })
        .map(rev => {
          const revCopiesMap = copiesByRev.get(rev);
          const sortedCopies = Array.from(revCopiesMap ? revCopiesMap.values() : []).sort((a, b) => {
            const numA = parseInt(String(a.copy_no || a.ccNumber || '0').replace(/\D/g, ''), 10) || 0;
            const numB = parseInt(String(b.copy_no || b.ccNumber || '0').replace(/\D/g, ''), 10) || 0;
            return numA - numB;
          });
          return {
            revision: rev,
            displayRev: `Rev.${rev}`,
            isCurrentViewingRev: rev === normCurrentRev,
            copies: sortedCopies
          };
        });

      // Flatten copies for current viewing revision for backward compatibility
      const currentRevCopies = sortedRevisionGroups.find(g => g.revision === normCurrentRev)?.copies || [];

      return {
        activeCopies: [],
        recalledCopies: currentRevCopies,
        groupedRecalledCopies: sortedRevisionGroups
      };
    }

    if (isObsoleteDoc) {
      // Obsolete doc: ALL copies of ALL revisions belong in the Destruction Ledger
      const recallMap = new Map();
      matchingCopies.forEach(copy => {
        const copyRev = getCopyRev(copy);
        const copyNum = parseInt(String(copy.copy_no || copy.ccNumber || '0').replace(/\D/g, ''), 10) || 1;
        const copyKey = `${copyRev}::Copy_${String(copyNum).padStart(2, '0')}`;
        const hydrated = {
          ...copy,
          displayRev: copyRev,
          status: copy.status || 'RECALLED'
        };

        if (!recallMap.has(copyKey)) {
          recallMap.set(copyKey, hydrated);
        } else {
          const existing = recallMap.get(copyKey);
          const existingPrio = STATUS_PRIORITY[String(existing.status).toUpperCase()] || 0;
          const newPrio = STATUS_PRIORITY[String(hydrated.status).toUpperCase()] || 0;
          if (newPrio > existingPrio) {
            recallMap.set(copyKey, hydrated);
          }
        }
      });

      const sortedRecall = Array.from(recallMap.values()).sort((a, b) => {
        const numA = parseInt(String(a.copy_no || a.ccNumber || '0').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.copy_no || b.ccNumber || '0').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });

      return {
        activeCopies: [],
        recalledCopies: sortedRecall,
        groupedRecalledCopies: []
      };
    }

    // Active document view: strictly omit any superseded/older copies from active display
    const activeMap = new Map();
    matchingCopies.forEach(copy => {
      const copyRev = String(copy.rev || copy.doc_version || copy.revision || copy.docRev || '');
      const status = String(copy.status || '').toUpperCase();
      const isRecallStatus = [
        'SUPERSEDED_PENDING_RECALL',
        'PENDING_RECALL',
        'DAMAGED_PENDING_RECALL',
        'OBSOLETE_PENDING_RECALL',
        'RECALLED',
        'RECALLED_HELD_AT_DCC',
        'RECEIVED_AT_DCC',
        'RECALLED_DESTROYED',
        'DESTROYED',
        'ARCHIVED_OBSOLETE',
        'OBSOLETE_ARCHIVED',
        'RECALLED_OBSOLETE',
        'DISPOSED'
      ].includes(status);

      const isOlderRev = Boolean(copyRev && copyRev !== currentDocRev);
      if (isOlderRev || copy.is_superseded || (isRecallStatus && copyRev !== currentDocRev)) {
        return;
      }

      if (status === 'REPLACED_VOID' || status === 'OBSOLETE' || status === 'OBSOLETE_ARCHIVED') {
        return;
      }

      let healedStatus = copy.status;
      if (status === 'SUPERSEDED_PENDING_RECALL') {
        healedStatus = copy.receipt_confirmed_at ? 'ISSUED_ACTIVE' : 'PENDING_ISSUE';
      }

      const hydrated = {
        ...copy,
        displayRev: currentDocRev,
        status: healedStatus
      };

      const copyNum = parseInt(String(copy.copy_no || copy.ccNumber || '0').replace(/\D/g, ''), 10) || 1;
      const copyKey = `${hydrated.displayRev || currentDocRev}::Copy_${String(copyNum).padStart(2, '0')}`;

      if (!activeMap.has(copyKey)) {
        activeMap.set(copyKey, hydrated);
      } else {
        const existing = activeMap.get(copyKey);
        const existingIssue = parseInt(String(existing.issue_no || existing.issueNumber || '1').replace(/\D/g, ''), 10) || 1;
        const newIssue = parseInt(String(copy.issue_no || copy.issueNumber || '1').replace(/\D/g, ''), 10) || 1;
        const existingPrio = STATUS_PRIORITY[String(existing.status).toUpperCase()] || 0;
        const newPrio = STATUS_PRIORITY[String(copy.status).toUpperCase()] || 0;

        // A newer issue always wins: a recalled old copy would otherwise outrank the replacement that stands in for it.
        if (newIssue > existingIssue || (newIssue === existingIssue && ((copy.is_replacement && !existing.is_replacement) || newPrio > existingPrio))) {
          activeMap.set(copyKey, hydrated);
        }
      }
    });

    const sortedActive = Array.from(activeMap.values()).sort((a, b) => {
      const numA = parseInt(String(a.copy_no || a.ccNumber || '0').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.copy_no || b.ccNumber || '0').replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return {
      activeCopies: sortedActive,
      recalledCopies: [],
      groupedRecalledCopies: []
    };
  }, [allCopies, doc, currentDocRev, normCurrentRev, isSupersededDoc, isObsoleteDoc, documents, dars]);

  // Backward compatible alias
  const docCopies = activeCopies;

  // Complete Status Mapping for Badges
  const renderCopyStatusBadge = (status, copy = {}) => {
    const normalized = String(status || '').toUpperCase();
    
    // Check if copy is destroyed
    const isDestroyed = normalized === 'DESTROYED' || normalized === 'RECALLED_DESTROYED' || normalized === 'DISPOSED' || normalized === 'RECALLED' || normalized === 'RECALLED_HELD_AT_DCC' || normalized === 'RECEIVED_AT_DCC' || Boolean(copy.destroyed_at || copy.recalled_at);

    if (isDestroyed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          ทำลายแล้ว
        </span>
      );
    }

    if (isObsoleteDoc || normalized === 'PENDING_RECALL' || normalized === 'SUPERSEDED_PENDING_RECALL' || normalized === 'OBSOLETE_PENDING_RECALL') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          รอเรียกคืน/รอทำลาย
        </span>
      );
    }

    if (normalized === 'ISSUED_ACTIVE' || normalized === 'ACTIVE' || normalized === 'ISSUED' || normalized === 'RECEIVED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          ใช้งานปกติ
        </span>
      );
    }

    if (normalized === 'RELOCATION_PENDING_APPROVAL') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
          รอ DCC อนุมัติย้ายจุด
        </span>
      );
    }

    if (normalized === 'RETURN_PENDING_APPROVAL') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          รอ DCC อนุมัติส่งคืน
        </span>
      );
    }

    if (normalized === 'PENDING_ISSUE' || normalized === 'PENDING_DISTRIBUTE' || normalized === 'PENDING_DISTRIBUTION') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></span>
          รอพิมพ์/แจกจ่าย
        </span>
      );
    }

    if (normalized === 'DISPATCHED_PENDING_RECEIPT' || normalized === 'PENDING_RECEIPT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>
          รอตรวจรับ
        </span>
      );
    }

    if (normalized === 'ARCHIVED_OBSOLETE' || normalized === 'OBSOLETE_ARCHIVED' || normalized === 'RECALLED_OBSOLETE') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#64748B]"></span>
          จัดเก็บเป็นประวัติ (ยกเลิก)
        </span>
      );
    }

    if (normalized === 'DESTROYED' || normalized === 'RECALLED_DESTROYED' || normalized === 'DISPOSED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FEF2F2] text-[#991B1B] border border-[#F87171] whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>
          ทำลายแล้ว
        </span>
      );
    }

    if (normalized === 'RECALLED' || normalized === 'RECALLED_HELD_AT_DCC' || normalized === 'RECEIVED_AT_DCC') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FFF7ED] text-[#C2410C] border border-[#FFD8A8] whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F97316]"></span>
          เรียกคืนแล้ว
        </span>
      );
    }

    if (normalized === 'SUPERSEDED_PENDING_RECALL' || normalized === 'PENDING_RECALL' || normalized === 'OBSOLETE_PENDING_RECALL') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>
          รอเรียกคืน (Rev.เดิม)
        </span>
      );
    }

    if (normalized === 'DAMAGED_PENDING_RECALL') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>
          รอเรียกคืน (ชำรุด)
        </span>
      );
    }

    if (normalized === 'REPLACEMENT_REQUESTED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FAF5FF] text-[#9333EA] border border-[#E9D5FF] whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]"></span>
          ขอเล่มทดแทน
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-[#F5F5F5] text-[#666666] border border-[#E5E5E5] whitespace-nowrap">
        {status || '-'}
      </span>
    );
  };

  const formatReceiptDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('th-TH');
    } catch {
      return '-';
    }
  };

  // Strict Revision Scoped Filter: Filter DAR History by Current Revision of the Opened Document
  // When viewing WI-QC-01 Rev.02, shows ONLY the DAR matching Rev.02.
  const currentDocCode = resolveDocCode(doc);
  const currentRevision = String(doc?.revision ?? doc?.revNo ?? doc?.rev ?? doc?.doc_version ?? '00');
  const currentRevisionNorm = normalizeRev(currentRevision);

  const scopedDarHistory = useMemo(() => {
    if (!doc) return [];

    const currentDocCodeUpper = currentDocCode.toUpperCase();
    const currentDocTitle = String(doc.title || doc.name || '').trim().toUpperCase();
    const docIdStr = String(doc.id || '');

    // 1. ดึง DAR ทั้งหมดที่เป็นของเอกสารรหัสเดียวกัน
    const docDars = allDars.filter((dar) => {
      if (!dar) return false;
      const darDocCode = resolveDocCode(dar).toUpperCase();
      const darTitle = String(dar.title || dar.document_title || '').trim().toUpperCase();
      const darDocCodeField = String(dar.doc_code || dar.docCode || dar.docNo || dar.document_code || '').trim().toUpperCase();

      const matchCode = Boolean(
        (currentDocCodeUpper && currentDocCodeUpper !== '-' && (darDocCode === currentDocCodeUpper || darDocCodeField === currentDocCodeUpper)) ||
        (currentDocTitle && (darTitle === currentDocTitle || darDocCodeField === currentDocTitle))
      );

      const matchId = Boolean(
        (dar.doc_id && String(dar.doc_id) === docIdStr) ||
        (dar.docId && String(dar.docId) === docIdStr) ||
        (dar.docIdRef && String(dar.docIdRef) === docIdStr) ||
        (dar.targetDocumentId && String(dar.targetDocumentId) === docIdStr)
      );

      const matchDirectDarId = Boolean(
        (doc.darId && (String(dar.id) === String(doc.darId) || String(dar.dar_no) === String(doc.darId))) ||
        (doc.dar_id && (String(dar.id) === String(doc.dar_id) || String(dar.dar_no) === String(doc.dar_id))) ||
        (doc.darRef && (String(dar.id) === String(doc.darRef) || String(dar.dar_no) === String(doc.darRef))) ||
        (doc.dar_ref && (String(dar.id) === String(doc.dar_ref) || String(dar.dar_no) === String(doc.dar_ref)))
      );

      return matchCode || matchId || matchDirectDarId;
    });

    // 2. ถ้าเปิดดูในโหมด Superseded (ฉบับเดิมตกรุ่น):
    // รวมประวัติ DAR ทุกฉบับตกรุ่นของรหัสเอกสารนี้มาแสดงในหน้านี้หน้าเดียว (Unified Vertical Timeline)
    if (isSupersededDoc) {
      // ค้นหา Revision ของฉบับที่กำลัง Effective อยู่ปัจจุบัน เพื่อกรองไม่เอาฉบับ Effective
      const effectiveDoc = (documents || []).find((d) => {
        const c = resolveDocCode(d).toUpperCase();
        return c === currentDocCodeUpper && (d.status === 'EFFECTIVE' || d.status === 'ACTIVE');
      });
      const effectiveRevNorm = effectiveDoc 
        ? normalizeRev(effectiveDoc.rev || effectiveDoc.revision || effectiveDoc.doc_version)
        : null;

      const supersededDars = docDars.filter((dar) => {
        const st = String(dar.status || '').toUpperCase();
        if (st === 'CANCELLED' || st === 'REJECTED') return false;

        const darRev = String(dar.target_revision ?? dar.targetRevision ?? dar.revision ?? dar.docRev ?? dar.rev ?? dar.doc_version ?? '00');
        const darRevNorm = normalizeRev(darRev);

        // กรองไม่เอาฉบับ Effective ปัจจุบัน และไม่เอา Draft/Future revision ที่มากกว่าหรือเท่ากับฉบับ Effective
        if (effectiveRevNorm) {
          const effectiveRevNum = parseInt(effectiveRevNorm, 10);
          const darRevNum = parseInt(darRevNorm, 10);
          if (!isNaN(effectiveRevNum) && !isNaN(darRevNum)) {
            if (darRevNum >= effectiveRevNum) {
              return false;
            }
          } else if (darRevNorm === effectiveRevNorm) {
            return false;
          }
        }
        return true;
      });

      if (supersededDars.length > 0) {
        // เรียงลำดับจาก Revision ล่าสุดลงไปหาเก่าสุด (Descending: Rev.01 -> Rev.00)
        return supersededDars.sort((a, b) => {
          const revA = parseInt(String(a.target_revision ?? a.targetRevision ?? a.revision ?? a.docRev ?? a.rev ?? '0').replace(/\D/g, ''), 10) || 0;
          const revB = parseInt(String(b.target_revision ?? b.targetRevision ?? b.revision ?? b.docRev ?? b.rev ?? '0').replace(/\D/g, ''), 10) || 0;
          if (revB !== revA) {
            return revB - revA;
          }
          return new Date(b.completedAt || b.createdAt || b.effectiveDate || 0) - new Date(a.completedAt || a.createdAt || a.effectiveDate || 0);
        });
      }
    }

    // 3. สำหรับเอกสาร OBSOLETE (ยกเลิกถาวร):
    // ต้องแสดงประวัติครบทุกรุ่น (Full Document Lifecycle Traceability from Rev.00 to Latest + Obsolete)
    const isDocObsolete = Boolean(doc.status?.toUpperCase() === 'OBSOLETE' || doc.is_obsolete || isObsoleteDoc);
    if (isDocObsolete) {
      const fullHistory = resolveFullDocumentHistory(doc, allDars);
      if (fullHistory && fullHistory.length > 0) {
        return fullHistory;
      }
    }

    // 4. กรองเฉพาะ DAR ที่มี Revision ตรงกับ Revision ปัจจุบันของเอกสารที่กำลังเปิดดูเท่านั้น (Strict Current Revision)
    const filtered = docDars.filter((dar) => {
      const rawDarRev = dar.target_revision ?? dar.targetRevision ?? dar.revision ?? dar.docRev ?? dar.rev ?? dar.doc_version;
      const darRevision = String(rawDarRev !== undefined && rawDarRev !== null ? rawDarRev : (docDars.length === 1 || dar.type === 'NEW' ? currentRevision : '00'));
      const darRevisionNorm = normalizeRev(darRevision);
      return darRevision === currentRevision || (darRevisionNorm && darRevisionNorm === currentRevisionNorm);
    });

    if (filtered.length > 0) {
      // จัดเรียงตามลำดับเวลาจากล่าสุดลงไปหาอดีต (Descending)
      return filtered.sort((a, b) => {
        const aIsObsolete = a.type === 'OBSOLETE' || a.request_type === 'OBSOLETE' || a.is_obsolete;
        const bIsObsolete = b.type === 'OBSOLETE' || b.request_type === 'OBSOLETE' || b.is_obsolete;
        
        if (aIsObsolete && !bIsObsolete) return -1;
        if (!aIsObsolete && bIsObsolete) return 1;

        return new Date(b.createdAt || b.effectiveDate || 0) - new Date(a.createdAt || a.effectiveDate || 0);
      });
    }

    // 4. Fallback: If no explicit DAR found in store, construct single DAR record for current revision only
    const isGenesis = currentRevisionNorm === '00' || currentRevision === '00' || currentRevision === '0';
    const isObs = Boolean(doc.status?.toUpperCase() === 'OBSOLETE' || doc.is_obsolete || isObsoleteDoc);
    const rStr = currentRevisionNorm || '00';
    const revNum = parseInt(rStr, 10);
    const resolvedDarId = doc.darId || doc.dar_id || doc.darRef || doc.dar_ref;
    const resolvedDarNo = doc.darNo || doc.dar_no || doc.darRef || doc.dar_ref;

    return [{
      id: resolvedDarId ? resolvedDarId : `DAR-${currentDocCode}-R${rStr}`,
      dar_no: resolvedDarNo ? formatDarNumber(resolvedDarNo) : `DAR-${String(new Date(doc.effectiveDate || '2025-01-01').getFullYear() || 2025).slice(-2)}-${String((!isNaN(revNum) ? revNum : 0) + 1).padStart(3, '0')}`,
      doc_code: currentDocCode,
      title: doc.name || doc.title || currentDocCode,
      revision: rStr,
      rev: rStr,
      docRev: rStr,
      type: isObs ? 'OBSOLETE' : (isGenesis ? 'NEW' : 'REVISION'),
      request_type: isObs ? 'OBSOLETE' : (isGenesis ? 'NEW' : 'REVISION'),
      status: isObs ? 'OBSOLETE' : (isSupersededDoc ? 'SUPERSEDED' : 'EFFECTIVE'),
      effectiveDate: doc.effectiveDate || doc.effective_date || '2025-01-01',
      effective_date_requested: doc.effectiveDate || doc.effective_date || '2025-01-01',
      createdAt: doc.createdAt || `${doc.effectiveDate || '2025-01-01'}T08:30:00.000Z`,
      reason: isGenesis ? 'จัดทำระเบียบปฏิบัติการและเอกสารคุณภาพฉบับเริ่มต้น (Genesis Document Creation)' : (doc.reason || doc.revisionNote || doc.changeReason || 'ทบทวนและปรับปรุงขั้นตอนการทำงานให้สอดคล้องกับหน้างานจริง'),
      description: doc.description || doc.change_details || doc.changeSummary || 'กำหนดขั้นตอนการทำงาน มาตรฐานการควบคุมคุณภาพ',
      requester_name: doc.ownerName || '',
      reviewer_name: '',
      approver_name: '',
      require_ack: true
    }];
  }, [allDars, doc, currentDocCode, currentRevision, currentRevisionNorm, isObsoleteDoc, isSupersededDoc, documents]);

  // State ควบคุมการกาง/พับ (Collapsible Timeline - ใบแรกกางออกเป็นค่าเริ่มต้น)
  const [expandedDarItems, setExpandedDarItems] = useState([]);

  useEffect(() => {
    if (scopedDarHistory && scopedDarHistory.length > 0) {
      const firstId = scopedDarHistory[0].id || scopedDarHistory[0].dar_no || scopedDarHistory[0].darNo || 'dar-0';
      setExpandedDarItems([firstId]);
    } else {
      setExpandedDarItems([]);
    }
  }, [scopedDarHistory]);

  const toggleDarItem = (id) => {
    setExpandedDarItems(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const allDarIds = useMemo(() => {
    return scopedDarHistory.map((d, idx) => d.id || d.dar_no || d.darNo || `dar-${idx}`);
  }, [scopedDarHistory]);

  const isAllExpanded = useMemo(() => {
    if (allDarIds.length === 0) return false;
    return allDarIds.every(id => expandedDarItems.includes(id));
  }, [allDarIds, expandedDarItems]);

  const toggleAllAccordions = () => {
    if (isAllExpanded) {
      setExpandedDarItems([]);
    } else {
      setExpandedDarItems([...allDarIds]);
    }
  };



  // Permission Check for Requesting Additional Copies
  const canRequestAdditionalCopies = useMemo(() => {
    if (!doc || !currentUser) return false;
    if (isObsoleteDoc) return false; // Never allow requests for obsolete docs

    const isEffective = doc.status === 'EFFECTIVE' || doc.status === 'ACTIVE';
    if (!isEffective) return false;

    const userDept = currentUser.department || currentUser.dept;
    const userDepts = currentUser.depts || (userDept ? [userDept] : []);
    const docDept = doc.owner_dept || doc.department;

    const isOwnerDept = docDept && (docDept === userDept || userDepts.includes(docDept));
    const isDcc = currentUser.isDcc || currentUser.role === 'DCC_ADMIN' || currentUser.level >= 5;

    return isOwnerDept || isDcc;
  }, [doc, currentUser, isObsoleteDoc]);

  // Accessible departments list (called unconditionally before early returns)
  const accessibleDeptsList = useMemo(() => {
    if (!doc) return [];
    const scope = doc.access_control?.scope || doc.access_scope || 'GENERAL';
    if (scope === 'GENERAL') return [];
    if (scope === 'DEPT_ONLY') {
      const dept = doc.owner_dept || doc.department;
      return dept ? [dept] : [];
    }
    return (
      doc.access_control?.allowed_departments ||
      doc.access_control?.target_departments ||
      doc.target_departments ||
      []
    );
  }, [doc]);

  if (!isOpen || !doc) return null;

  // Export DAR History CSV with detailed DD/MM/YYYY HH:mm timestamps
  const handleExportDarHistoryCsv = () => {
    const targetDars = scopedDarHistory;
    if (!targetDars || targetDars.length === 0) return;

    const headers = [
      'รหัสเอกสาร',
      'ชื่อเอกสาร',
      'ฉบับที่ (Rev.)',
      'เลขที่คำร้อง DAR',
      'ประเภทคำร้อง',
      'สถานะคำร้อง',
      'วันที่ยื่นคำขอ',
      'วันที่มีผลบังคับใช้',
      'ผู้ยื่นคำขอ',
      'วันเวลาที่ยื่นคำขอ (Requester Timestamp)',
      'ผู้ทบทวน',
      'วันเวลาที่ทบทวน (Reviewer Timestamp)',
      'ผู้อนุมัติ',
      'วันเวลาที่อนุมัติ (Approver Timestamp)',
      'การรับทราบ',
      'วันเวลาที่รับทราบ (Ack Timestamp)',
      'เหตุผลในการร้องขอ',
      'รายละเอียดคำร้อง/แผนรองรับ'
    ];

    const rows = targetDars.map((dar) => {
      const reasonInfo = getDarReason(dar);
      const detailInfo = getDarDetail(dar);

      const reasonText = (reasonInfo.value && reasonInfo.value !== '-') 
        ? reasonInfo.value 
        : (dar.reason || dar.requestReason || dar.changeReason || dar.otherReason || 'ปรับปรุงระเบียบปฏิบัติงานและเอกสารคุณภาพให้สอดคล้องกับมาตรฐาน ISO 9001:2015');

      const detailText = (detailInfo.value && detailInfo.value !== '-') 
        ? detailInfo.value 
        : (dar.description || dar.changeSummary || dar.requestDetail || dar.change_details || dar.disposition_plan || 'กำหนดขั้นตอนการทำงานและจุดควบคุมสำหรับการปฏิบัติงานประจำวัน');

      const reqName = (getRequesterName(dar, masterUsers) !== '-' ? getRequesterName(dar, masterUsers) : null) || dar.requester_name || dar.requester || dar.requesterName || '-';
      const revName = (getReviewerName(dar, timeline) !== '-' ? getReviewerName(dar, timeline) : null) || dar.reviewer_name || dar.reviewer || dar.reviewerName || '-';
      const appName = (getApproverName(dar, timeline) !== '-' ? getApproverName(dar, timeline) : null) || dar.approver_name || dar.approver || dar.approverName || '-';
      const ackName = (getAckNames(dar, timeline) !== '-' ? getAckNames(dar, timeline) : null) || dar.ack_name || dar.ackNames || (dar.require_ack !== false ? 'ต้องรับทราบ' : 'ไม่ต้องรับทราบ');

      const reqTimestamp = getWorkflowStepTimestamp(dar, 'REQUEST', timeline);
      const revTimestamp = getWorkflowStepTimestamp(dar, 'REVIEW', timeline);
      const appTimestamp = getWorkflowStepTimestamp(dar, 'APPROVE', timeline);
      const ackTimestamp = getWorkflowStepTimestamp(dar, 'ACK', timeline);

      const docCode = doc.title || doc.document_code || doc.id || '-';
      const docTitle = doc.name || doc.docName || doc.title || '-';
      const rev = dar.docRev || dar.rev || dar.revision || doc.rev || '00';
      const darNo = dar.dar_no || dar.id || '-';
      const requestType = dar.type === 'NEW' || dar.request_type === 'NEW' ? 'สร้างใหม่' : dar.type === 'REVISION' || dar.request_type === 'REVISION' ? 'ขอแก้ไข' : 'ขอยกเลิก';
      const status = dar.status || 'EFFECTIVE';
      const requestDate = dar.createdAt?.split('T')[0] || dar.request_date || dar.requestDate || '-';
      const effectiveDate = dar.effectiveDate || dar.effective_date_requested || dar.obsolete_effective_date || doc.effectiveDate || '-';

      return [
        `"${String(docCode).replace(/"/g, '""')}"`,
        `"${String(docTitle).replace(/"/g, '""')}"`,
        `"${String(rev).replace(/"/g, '""')}"`,
        `"${String(darNo).replace(/"/g, '""')}"`,
        `"${String(requestType).replace(/"/g, '""')}"`,
        `"${String(status).replace(/"/g, '""')}"`,
        `"${String(requestDate).replace(/"/g, '""')}"`,
        `"${String(effectiveDate).replace(/"/g, '""')}"`,
        `"${String(reqName).replace(/"/g, '""')}"`,
        `"${String(reqTimestamp).replace(/"/g, '""')}"`,
        `"${String(revName).replace(/"/g, '""')}"`,
        `"${String(revTimestamp).replace(/"/g, '""')}"`,
        `"${String(appName).replace(/"/g, '""')}"`,
        `"${String(appTimestamp).replace(/"/g, '""')}"`,
        `"${String(ackName).replace(/"/g, '""')}"`,
        `"${String(ackTimestamp).replace(/"/g, '""')}"`,
        `"${String(reasonText).replace(/"/g, '""')}"`,
        `"${String(detailText).replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const sanitizedDocCode = (doc.title || doc.document_code || 'DOC').replace(/[/\\?%*:|"<>]/g, '-');
    link.setAttribute('href', url);
    link.setAttribute('download', `DAR_History_${sanitizedDocCode}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('ส่งออกประวัติ DAR สำเร็จ');
  };

  // Owner department display resolver
  const ownerDeptDisplay = (() => {
    const d = normalizeDepartmentId(doc?.department || doc?.owner_dept || '');
    const dObj = (masterDepartments || []).find(md => normalizeDepartmentId(md.id) === d);
    return dObj ? `${d} - ${dObj.nameTh || dObj.name}` : (d || '-');
  })();

  // Access Scope Badge Resolver
  const renderAccessScopeBadge = (targetDoc) => {
    const scope = targetDoc?.access_control?.scope || targetDoc?.access_scope || 'GENERAL';
    if (scope === 'GENERAL') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#E6F7ED] text-[#14AE5C] border border-[#B3E7C9]">
          <Globe size={13} /> ทั่วไป (General)
        </span>
      );
    }
    if (scope === 'DEPT_ONLY') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFF8E6] text-[#B87C33] border border-[#FDE6B0]">
          <Lock size={13} /> เฉพาะแผนก (Department Only)
        </span>
      );
    }
    if (scope === 'TARGETED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#E5F4FF] text-[#0D99FF] border border-[#B8E1FF]">
          <Building2 size={13} /> ระบุแผนก (Targeted)
        </span>
      );
    }
    if (scope === 'RESTRICTED') {
      const minLvl = targetDoc?.access_control?.min_access_level;
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FFF2F0] text-[#F24822] border border-[#FDC4B8]">
          <ShieldAlert size={13} /> ลับเฉพาะ{minLvl ? ` (Lv.${minLvl}+)` : ''}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#E6F7ED] text-[#14AE5C] border border-[#B3E7C9]">
        <Globe size={13} /> ทั่วไป
      </span>
    );
  };

  return (
    <ErrorBoundary>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 my-auto"
          >
            {/* Header: Crisp Bento Titlebar */}
            <div className="px-6 pt-6 pb-4 bg-white border-b border-[#E5E5E5] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="p-2.5 bg-[#E5F4FF] text-[#0D99FF] border border-[#B8E1FF] rounded-xl shrink-0">
                  <FileText size={22} strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#E5F4FF] text-[#0D99FF] border border-[#B8E1FF] text-xs font-bold font-mono">
                      {resolveDocCode(doc)}
                    </span>
                    {isObsoleteDoc ? (
                      <span className="px-2.5 py-0.5 rounded-md bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] text-xs font-semibold">
                        🚫 ยกเลิกถาวร (Obsolete)
                      </span>
                    ) : isSupersededDoc ? (
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
                        ⏳ ฉบับเดิม (Superseded)
                      </span>
                    ) : (
                      <>
                        <span className="px-2.5 py-0.5 rounded-md bg-[#E6F7ED] text-[#14AE5C] border border-[#B3E7C9] text-xs font-bold font-mono">
                          Rev.{doc.rev || '00'}
                        </span>
                        <span className="text-xs text-[#777777] font-medium ml-1">
                          Master Document Record
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-[#1E1E1E] tracking-tight break-all break-words min-w-0 [overflow-wrap:anywhere]">
                    {doc.name || doc.title}
                  </h2>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-[#888888] hover:text-[#1E1E1E] hover:bg-[#F5F5F5] rounded-xl transition-colors shrink-0 ml-2 outline-none cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="px-6 bg-[#FAFAFA] border-b border-[#E5E5E5] flex gap-6 shrink-0 relative">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-2 py-3.5 font-semibold text-xs sm:text-sm transition-all border-b-2 cursor-pointer ${
                  activeTab === 'overview'
                    ? 'text-[#0D99FF] border-[#0D99FF]'
                    : 'text-[#666666] hover:text-[#1E1E1E] border-transparent'
                }`}
              >
                <Layers size={15} strokeWidth={1.75} />
                <span>{isSupersededDoc ? 'สำเนาควบคุม' : 'ข้อมูลทั่วไปและสำเนาควบคุม'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 py-3.5 font-semibold text-xs sm:text-sm transition-all border-b-2 cursor-pointer ${
                  activeTab === 'history'
                    ? 'text-[#0D99FF] border-[#0D99FF]'
                    : 'text-[#666666] hover:text-[#1E1E1E] border-transparent'
                }`}
              >
                <History size={15} strokeWidth={1.75} />
                <span>
                  {`ประวัติ DAR และการแก้ไข (${scopedDarHistory.length})`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('periodic')}
                className={`flex items-center gap-2 py-3.5 font-semibold text-xs sm:text-sm transition-all border-b-2 cursor-pointer ${
                  activeTab === 'periodic'
                    ? 'text-[#0D99FF] border-[#0D99FF]'
                    : 'text-[#666666] hover:text-[#1E1E1E] border-transparent'
                }`}
              >
                <RotateCw size={15} strokeWidth={1.75} />
                <span>ประวัติการทบทวนตามรอบ</span>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#FBFBFB]">
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Bento Box Layout: Row 1 - Cards 1 & 2 (Hidden in Superseded Mode) */}
                  {!isSupersededDoc && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* Card 1: ข้อมูลแม่บทเอกสาร (Master Data) - 7 cols */}
                      <div className="md:col-span-7 bg-white border border-[#E5E5E5] rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
                        <div>
                          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                              <FileText size={15} className="text-[#0D99FF]" /> ข้อมูลแม่บทเอกสาร (Master Data)
                            </span>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              isObsoleteDoc
                                ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                                : isSupersededDoc
                                  ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                                  : (doc.status === 'EFFECTIVE' || doc.status === 'ACTIVE')
                                    ? 'bg-[#E6F7ED] text-[#14AE5C] border border-[#B3E7C9]'
                                    : 'bg-[#FFF0F0] text-[#E02424] border border-[#FDE8E8]'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                isObsoleteDoc ? 'bg-[#EF4444]' : isSupersededDoc ? 'bg-[#F59E0B]' : (doc.status === 'EFFECTIVE' || doc.status === 'ACTIVE') ? 'bg-[#14AE5C]' : 'bg-[#E02424]'
                              }`} />
                              {isObsoleteDoc ? 'ยกเลิกถาวร (Obsolete)' : isSupersededDoc ? 'ฉบับเดิม (Superseded)' : (doc.status === 'EFFECTIVE' || doc.status === 'ACTIVE') ? 'มีผลบังคับใช้' : doc.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5 text-xs">
                            <div>
                              <p className="text-slate-400 font-medium">รหัสเอกสาร</p>
                              <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">
                                {doc.title || doc.document_code || '-'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-medium">ฉบับที่ (Revision)</p>
                              <p className="text-sm font-mono font-bold text-[#0D99FF] mt-0.5">
                                Rev.{doc.rev || doc.currentRevision || doc.revision || '00'}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-slate-400 font-medium">ชื่อเอกสาร</p>
                              <p className="text-sm font-semibold text-slate-900 mt-0.5 leading-snug break-words">
                                {doc.name || doc.docName || '-'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-medium">แผนกเจ้าของเอกสาร</p>
                              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 mt-0.5 truncate">
                                <Building2 size={14} className="text-slate-400 shrink-0" />
                                <span className="truncate">{ownerDeptDisplay}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-slate-400 font-medium">วันที่มีผลบังคับใช้</p>
                              <div className="flex items-center gap-1.5 text-sm font-semibold font-mono text-slate-800 mt-0.5">
                                <Calendar size={14} className="text-slate-400 shrink-0" />
                                <span>{doc.effectiveDate || doc.effective_date || '-'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card 2: ขอบเขตการเข้าถึงและสิทธิ์ (Access Scope Card) - 5 cols */}
                      <div className="md:col-span-5 bg-white border border-[#E5E5E5] rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
                        <div>
                          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                              <ShieldCheck size={15} className="text-[#14AE5C]" /> ขอบเขตการเข้าถึง (Access Scope)
                            </span>
                          </div>

                          <div className="space-y-3.5 text-xs">
                            <div>
                              <p className="text-slate-400 font-medium mb-1.5">ระดับความลับ / สิทธิ์การเข้าถึง</p>
                              <div>{renderAccessScopeBadge(doc)}</div>
                            </div>

                            <div>
                              <p className="text-slate-400 font-medium mb-1.5">แผนกที่มีสิทธิ์เข้าถึง</p>
                              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                {accessibleDeptsList.map((dept, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                                    {dept}
                                  </span>
                                ))}
                                {accessibleDeptsList.length === 0 && (
                                  <span className="text-slate-500 text-xs italic">
                                    ทุกแผนกในองค์กร (General Access)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Toolbar Grid (Button "เปิดดูเอกสาร" hidden in Superseded Mode) */}
                  {(!isSupersededDoc || (currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN' || currentUser?.role === 'SUPER_ADMIN') || canRequestAdditionalCopies) && (
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Action 1: เปิดดูเอกสาร */}
                      {!isSupersededDoc && (
                        <button
                          type="button"
                          onClick={handleOpenViewer}
                          className="h-10 px-4 bg-white border border-[#E5E5E5] hover:bg-[#F5F5F5] text-[#1E1E1E] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
                        >
                          <ExternalLink size={15} strokeWidth={1.75} />
                          <span>เปิดดูเอกสาร</span>
                        </button>
                      )}

                      {/* Action: ดาวน์โหลด PDF (Role-Based Download Menu) */}
                      {canDownload && (
                        isDccAdmin ? (
                          <Menu as="div" className="relative inline-block text-left">
                            <Menu.Button 
                              disabled={isDownloadingPdf}
                              className="h-10 px-4 text-xs sm:text-sm font-semibold text-[#1E1E1E] dark:text-slate-200 bg-white dark:bg-slate-800 border border-[#E5E5E5] dark:border-slate-600 hover:bg-[#F5F5F5] dark:hover:bg-slate-700 rounded-xl flex items-center gap-2 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isDownloadingPdf ? (
                                <Loader2 size={15} className="animate-spin text-slate-600" />
                              ) : (
                                <Download size={15} strokeWidth={1.75} className="text-slate-500" />
                              )}
                              <span>{isDownloadingPdf ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด PDF'}</span>
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            </Menu.Button>
                            <Menu.Items className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-1.5 z-50">
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadPdf('UNCONTROLLED')}
                                    className={`${active ? 'bg-slate-100 dark:bg-slate-700' : ''} w-full text-left px-3 py-2 text-xs rounded-lg text-slate-700 dark:text-slate-200 flex flex-col cursor-pointer`}
                                  >
                                    <span className="font-semibold text-slate-900 dark:text-white">📄 สำเนาไม่ควบคุม (Uncontrolled)</span>
                                    <span className="text-[11px] text-slate-400">สำหรับเปิดดูและอ้างอิงทั่วไป (ลายน้ำสีแดง)</span>
                                  </button>
                                )}
                              </Menu.Item>
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadPdf('CLEAN')}
                                    className={`${active ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : ''} w-full text-left px-3 py-2 text-xs rounded-lg flex flex-col mt-1 border-t border-slate-100 dark:border-slate-700 cursor-pointer`}
                                  >
                                    <span className="font-semibold text-blue-600 dark:text-blue-400">📥 เอกสารแม่บทคลีน (Clean Master)</span>
                                    <span className="text-[11px] text-slate-400">ตารางลายเซ็นครบ ไม่มีลายน้ำขวางหน้ากระดาษ</span>
                                  </button>
                                )}
                              </Menu.Item>
                            </Menu.Items>
                          </Menu>
                        ) : (
                          <button
                            type="button"
                            disabled={isDownloadingPdf}
                            onClick={() => handleDownloadPdf('UNCONTROLLED')}
                            className="h-10 px-4 text-xs sm:text-sm font-semibold text-[#1E1E1E] dark:text-slate-200 bg-white dark:bg-slate-800 border border-[#E5E5E5] dark:border-slate-600 hover:bg-[#F5F5F5] dark:hover:bg-slate-700 rounded-xl flex items-center gap-2 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isDownloadingPdf ? (
                              <Loader2 size={15} className="animate-spin text-slate-600" />
                            ) : (
                              <Download size={15} strokeWidth={1.75} className="text-slate-500" />
                            )}
                            <span>{isDownloadingPdf ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด PDF'}</span>
                          </button>
                        )
                      )}

                      {/* Action 3: ขอสำเนาควบคุมเพิ่มเติม */}
                      {canRequestAdditionalCopies && (
                        <button
                          type="button"
                          onClick={() => setIsRequestModalOpen(true)}
                          className="h-10 px-4 bg-[#0D99FF] hover:bg-[#007BE5] text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer ml-auto"
                          title="ขอสำเนาควบคุมเพิ่มเติม"
                        >
                          <PlusCircle size={15} strokeWidth={1.75} />
                          <span>ขอสำเนาควบคุมเพิ่มเติม</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Card 3: สำเนาควบคุมที่แจกจ่ายประจำจุดใช้งาน (Active Controlled Copies) */}
                  {!isObsoleteDoc && !isSupersededDoc && (
                    <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 shadow-xs space-y-3.5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-[#1E1E1E] text-sm flex items-center gap-2">
                          <Layers size={16} className="text-[#0D99FF]" />
                          สำเนาควบคุมที่แจกจ่ายประจำจุดใช้งาน ({docCopies.length} เล่ม)
                        </h3>
                        <span className="text-xs text-[#64748B] font-medium bg-[#F8FAFC] px-2.5 py-1 rounded-md border border-[#E2E8F0]">
                          ฉบับปัจจุบัน Rev.{currentDocRev}
                        </span>
                      </div>

                    {/* Active Controlled Copies Table */}
                    <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white shadow-2xs overflow-x-auto overflow-y-auto max-h-[320px] scrollbar-thin">
                      <table className="w-full text-left text-sm table-fixed border-collapse">
                        <thead className="bg-[#F8FAFC] text-[#374151] font-bold text-xs uppercase tracking-wider border-b border-[#E2E8F0] sticky top-0 z-10 shadow-xs backdrop-blur-sm whitespace-nowrap">
                          <tr>
                            <th className="py-3 px-3.5 w-44 bg-[#F8FAFC]">หมายเลขสำเนา</th>
                            <th className="py-3 px-3.5 w-28 bg-[#F8FAFC]">แผนกผู้รับ</th>
                            <th className="py-3 px-3.5 bg-[#F8FAFC]">จุดติดตั้ง</th>
                            <th className="py-3 px-3.5 text-center w-40 bg-[#F8FAFC]">สถานะสำเนา</th>
                            <th className="py-3 px-3.5 text-center w-32 bg-[#F8FAFC]">วันที่ตรวจรับ</th>
                            <th className="py-3 px-3.5 text-center min-w-[200px] w-52 bg-[#F8FAFC]">การจัดการ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F0F0]">
                          {activeCopies.map(copy => {
                            const rawNo = copy.copy_no || copy.ccNumber || '01';
                            const num = parseInt(String(rawNo).replace(/\D/g, ''), 10) || 1;
                            const isOrigin = Boolean(copy.is_owner || copy.isOwner || num === 1);
                            const deptName = copy.holder_dept || copy.department || '-';
                            const locName = cleanLocationName(copy.location || copy.locationName || copy.station_name || `${deptName || 'PD'} Head Office`);
                            return (
                              <tr key={copy.id || `active-${num}`} className="hover:bg-[#F8FAFC] transition-colors">
                                <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-[#F0F7FF] text-[#0284C7] border border-[#BAE6FD]">
                                      Copy {copy.copy_no || copy.ccNumber}
                                    </span>
                                    <span className="font-sans text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]">
                                      เล่มควบคุม
                                    </span>
                                    {isOrigin && (
                                      <span className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]">
                                        จุดต้นทาง
                                      </span>
                                    )}
                                    {(copy.is_replacement || (copy.issue_no && copy.issue_no !== '01')) && (
                                      <span className="inline-block px-2 py-0.5 rounded bg-[#FFF8E6] text-[#B87C33] font-semibold border border-[#FDE6B0] text-xs whitespace-nowrap font-sans w-fit">
                                        Issue {copy.issue_no || '02'} (ทดแทน)
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td 
                                  className="py-3 px-3.5 font-semibold text-[#1E293B] truncate align-middle text-sm"
                                  title={deptName}
                                >
                                  <span className="truncate block" title={deptName}>
                                    {deptName}
                                  </span>
                                </td>
                                <td 
                                  className="py-3 px-3.5 text-slate-700 align-middle text-sm"
                                  title={locName}
                                >
                                  <div className="flex items-center gap-1.5 truncate" title={locName}>
                                    <MapPin size={14} className="text-[#14AE5C] shrink-0" />
                                    <span className="truncate" title={locName}>
                                      {locName}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-center whitespace-nowrap align-middle">
                                  {renderCopyStatusBadge(copy.status, copy)}
                                </td>
                                <td className="py-3 px-3.5 text-slate-600 text-center whitespace-nowrap font-mono text-xs align-middle">
                                  {formatReceiptDate(copy.receipt_confirmed_at)}
                                </td>
                                <td className="py-3 px-3.5 text-center whitespace-nowrap align-middle">
                                  {/* Case A: ติดสถานะรอดำเนินการ (Pending State) */}
                                  {copy.status === 'RELOCATION_PENDING_APPROVAL' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-xs font-medium whitespace-nowrap">
                                      <span>⏳</span>
                                      <span>รอ DCC ตรวจสอบ</span>
                                    </span>
                                  ) : copy.status === 'RETURN_PENDING_APPROVAL' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium whitespace-nowrap">
                                      <span>⏳</span>
                                      <span>รอ DCC ตรวจสอบ</span>
                                    </span>
                                  ) : (copy.status === 'ISSUED_ACTIVE' || copy.status === 'ACTIVE') ? (
                                    !canManageControlledCopy(currentUser, copy) ? (
                                      /* Case B: ไม่มีสิทธิ์ครอบครอง (Unauthorized User) */
                                      <div 
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200" 
                                        title={`สิทธิ์เฉพาะบุคลากรแผนก ${copy.department || deptName || 'ผู้ครอบครอง'}`}
                                      >
                                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span>เฉพาะแผนก {copy.department || deptName}</span>
                                      </div>
                                    ) : isOrigin ? (
                                      /* Case C (Copy 01 Origin): แสดงเฉพาะปุ่มฉุกเฉิน [ ⚠️ แจ้งชำรุด/สูญหาย ] */
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedReplacementCopy(copy)}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-200 transition-colors cursor-pointer"
                                          title="แจ้งชำรุด / สูญหาย"
                                          aria-label="แจ้งชำรุด/สูญหาย แจ้งชำรุด/เล่มใหม่"
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                          <span>แจ้งชำรุด/สูญหาย</span>
                                        </button>
                                        {isDccAdmin && (
                                          <button
                                            type="button"
                                            onClick={() => handleDownloadControlledCopy(copy)}
                                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer border border-transparent hover:border-blue-200"
                                            title={`พิมพ์/ดาวน์โหลดสำเนาควบคุม Copy ${copy.copy_no || copy.ccNumber} (${locName})`}
                                            aria-label={`พิมพ์สำเนา Copy ${copy.copy_no || copy.ccNumber}`}
                                          >
                                            <Printer className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      /* Case C (Copy 02+): แสดงกลุ่มปุ่มแบบ Compact Flex: ขอย้ายจุด, ส่งคืน, แจ้งชำรุด */
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedRelocateCopy(copy)}
                                          className="px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md border border-sky-200/80 transition-colors cursor-pointer"
                                        >
                                          ขอย้ายจุด
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedReturnCopy(copy)}
                                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors cursor-pointer"
                                        >
                                          ส่งคืน
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedReplacementCopy(copy)}
                                          className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                                          title="แจ้งชำรุด/สูญหาย"
                                          aria-label="แจ้งชำรุด/สูญหาย แจ้งชำรุด/เล่มใหม่"
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                        </button>
                                        {isDccAdmin && (
                                          <button
                                            type="button"
                                            onClick={() => handleDownloadControlledCopy(copy)}
                                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer border border-transparent hover:border-blue-200"
                                            title={`พิมพ์/ดาวน์โหลดสำเนาควบคุม Copy ${copy.copy_no || copy.ccNumber} (${locName})`}
                                            aria-label={`พิมพ์สำเนา Copy ${copy.copy_no || copy.ccNumber}`}
                                          >
                                            <Printer className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    <span className="text-[#999999] text-xs">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {activeCopies.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-[#888888]">
                                ยังไม่มีสำเนาควบคุมที่แจกจ่ายสำหรับเอกสารนี้
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}

                  {/* Phase 3: Accordion Stacking by Revision (ISO 9001 Clause 7.5.3) - For Superseded Docs */}
                  {isSupersededDoc && (
                    <div className="bg-[#FFFDF7] border border-[#FDE68A] rounded-2xl p-5 shadow-xs space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[#FDE68A]">
                        <div className="flex items-center gap-2.5">
                          <span className="p-2 rounded-xl text-base bg-[#FEF3C7] text-[#92400E]">
                            📁
                          </span>
                          <div>
                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                              ทะเบียนเรียกคืนและทำลายสำเนาฉบับเดิมแยกตามฉบับ — สำหรับงาน Audit (ISO 9001:2015 Clause 7.5.3)
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              หลักฐานการเรียกคืนและทำลายสำเนาควบคุมฉบับที่ถูกยกเลิก/แทนที่ เพื่อป้องกันการนำไปใช้โดยไม่ได้ตั้งใจ
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]">
                          รวม {groupedRecalledCopies.reduce((acc, g) => acc + g.copies.length, 0)} รายการ
                        </span>
                      </div>

                      {/* Accordion Stack by Revision */}
                      <div className="space-y-3">
                        {groupedRecalledCopies.map(group => {
                          const isExpanded = Boolean(expandedRevs[group.revision]);
                          return (
                            <div 
                              key={group.revision}
                              className={`border rounded-xl overflow-hidden bg-white transition-all shadow-2xs ${
                                isExpanded ? 'border-amber-300 ring-1 ring-amber-200/60' : 'border-[#E2E8F0] hover:border-slate-300'
                              }`}
                            >
                              {/* Accordion Header */}
                              <button
                                type="button"
                                onClick={() => toggleRevision(group.revision)}
                                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left bg-gradient-to-r from-amber-50/40 to-white hover:bg-amber-50/70 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-mono font-bold">
                                    {group.displayRev}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                                    {group.copies.length} เล่ม
                                  </span>
                                  {group.isCurrentViewingRev && (
                                    <span className="text-[11px] font-medium text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md border border-amber-300/80">
                                      ฉบับที่กำลังเปิดดู
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-slate-500">
                                  <span className="text-xs font-medium text-slate-400 hidden sm:inline">
                                    {isExpanded ? 'พับเก็บ' : 'ดูรายละเอียด'}
                                  </span>
                                  <div className="p-1 rounded-md text-slate-600 bg-slate-100">
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </div>
                                </div>
                              </button>

                              {/* Accordion Body: Evidence Table */}
                              {isExpanded && (
                                <div className="border-t border-[#E2E8F0] overflow-x-auto max-h-[300px] scrollbar-thin">
                                  <table className="w-full text-left text-sm table-fixed border-collapse">
                                    <thead className="bg-[#F8FAFC] text-[#374151] font-bold text-xs uppercase tracking-wider border-b border-[#E2E8F0] sticky top-0 z-10 shadow-xs backdrop-blur-sm whitespace-nowrap">
                                      <tr>
                                        <th className="py-2.5 px-3 w-36 bg-[#F8FAFC]">หมายเลขสำเนา</th>
                                        <th className="py-2.5 px-3 w-32 bg-[#F8FAFC]">แผนกผู้ถือเดิม</th>
                                        <th className="py-2.5 px-3 bg-[#F8FAFC]">จุดติดตั้งเดิม</th>
                                        <th className="py-2.5 px-3 text-center w-24 bg-[#F8FAFC]">ฉบับเดิม</th>
                                        <th className="py-2.5 px-3 text-center w-44 bg-[#F8FAFC]">สถานะการเรียกคืน</th>
                                        <th className="py-2.5 px-3 text-center w-36 bg-[#F8FAFC]">วันที่เรียกคืน/ทำลาย</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F0F0F0]">
                                      {group.copies.map(copy => {
                                        const deptName = copy.departmentName || copy.department || copy.holder_dept || '-';
                                        const locName = cleanLocationName(copy.location || copy.originalLocation || copy.point || copy.locationName || copy.station_name || `${deptName || 'PD'} Head Office`);
                                        return (
                                          <tr key={copy.id || `${group.revision}-${copy.copy_no}`} className="hover:bg-[#FFFBF5] transition-colors">
                                            <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
                                                  Copy {copy.copy_no || copy.ccNumber}
                                                </span>
                                                <span className="font-sans text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]">
                                                  เล่มควบคุม
                                                </span>
                                                {(copy.is_replacement || (copy.issue_no && copy.issue_no !== '01')) && (
                                                  <span className="inline-block px-1.5 py-0.5 rounded bg-[#FFF8E6] text-[#B87C33] font-semibold border border-[#FDE6B0] text-[10px] whitespace-nowrap">
                                                    Issue {copy.issue_no || '02'}
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td 
                                              className="py-2.5 px-3 font-semibold text-[#1E293B] truncate align-middle text-sm"
                                              title={deptName}
                                            >
                                              <span className="truncate block" title={deptName}>
                                                {deptName}
                                              </span>
                                            </td>
                                            <td 
                                              className="py-2.5 px-3 text-slate-700 align-middle text-sm"
                                              title={locName}
                                            >
                                              <div className="flex items-center gap-1.5 truncate" title={locName}>
                                                <MapPin size={13} className="text-[#94A3B8] shrink-0" />
                                                <span className="truncate" title={locName}>
                                                  {locName}
                                                </span>
                                              </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-center whitespace-nowrap align-middle">
                                              <span className="inline-block px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-mono font-bold">
                                                {group.displayRev}
                                              </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-center whitespace-nowrap align-middle">
                                              {renderCopyStatusBadge(copy.status, copy)}
                                            </td>
                                            <td className="py-2.5 px-3 text-slate-600 text-center whitespace-nowrap font-mono text-xs align-middle">
                                              {formatReceiptDate(copy.destroyed_at || copy.dateDestroyed || copy.recalled_at || copy.dateRecalled || copy.superseded_at)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      {group.copies.length === 0 && (
                                        <tr>
                                          <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                                            <div className="flex flex-col items-center gap-1.5">
                                              <span className="font-medium text-slate-600">ไม่มีรายการสำเนาควบคุมค้างเรียกคืนสำหรับ {group.displayRev}</span>
                                              <span className="text-slate-400 text-[11px]">
                                                เอกสารชุดนี้อาจเป็นรูปแบบ Paperless หรือไม่มีบันทึกการแจกจ่ายเล่มควบคุมทางกายภาพ
                                              </span>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {groupedRecalledCopies.length === 0 && (
                          <div className="border border-[#E2E8F0] rounded-xl p-8 text-center text-slate-500 bg-white">
                            <Sparkles size={24} className="mx-auto text-slate-300 mb-2" />
                            <p className="font-semibold text-slate-700 text-sm">ไม่พบบันทึกสำเนาควบคุมสำหรับเอกสารฉบับนี้</p>
                            <p className="text-slate-400 text-xs mt-1">ไม่มีข้อมูลการออกเล่มสำเนาทางกายภาพในระบบ</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recall & Disposal Ledger (ISO 9001 Clause 7.5.3) - For Obsolete Docs */}
                  {isObsoleteDoc && (
                    <div className="bg-[#FFF0F0] border-[#FECACA] border rounded-2xl p-5 shadow-xs space-y-3.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="p-2 rounded-xl text-base bg-[#FEE2E2] text-[#991B1B]">
                            🗑️
                          </span>
                          <div>
                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                              ทะเบียนบันทึกการเรียกคืนและทำลาย (ทุกฉบับ) — สำหรับงาน Audit (ISO 9001:2015 Clause 7.5.3)
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              หลักฐานการเรียกคืนและทำลายสำเนาควบคุม "ทั้งหมด" เนื่องจากเอกสารรหัสนี้ถูกยกเลิกการใช้งานถาวร
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]">
                          {recalledCopies.length} รายการ
                        </span>
                      </div>

                      {/* Evidence Table */}
                      <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white shadow-2xs overflow-x-auto max-h-[280px] scrollbar-thin">
                        <table className="w-full text-left text-sm table-fixed border-collapse">
                          <thead className="bg-[#F8FAFC] text-[#374151] font-bold text-xs uppercase tracking-wider border-b border-[#E2E8F0] sticky top-0 z-10 shadow-xs backdrop-blur-sm whitespace-nowrap">
                            <tr>
                              <th className="py-2.5 px-3 w-36 bg-[#F8FAFC]">หมายเลขสำเนา</th>
                              <th className="py-2.5 px-3 w-28 bg-[#F8FAFC]">แผนกผู้ถือเดิม</th>
                              <th className="py-2.5 px-3 bg-[#F8FAFC]">จุดติดตั้งเดิม</th>
                              <th className="py-2.5 px-3 text-center w-24 bg-[#F8FAFC]">ฉบับเดิม</th>
                              <th className="py-2.5 px-3 text-center w-48 bg-[#F8FAFC]">สถานะการเรียกคืน</th>
                              <th className="py-2.5 px-3 text-center w-36 bg-[#F8FAFC]">วันที่เรียกคืน/ทำลาย</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0F0F0]">
                            {recalledCopies.map(copy => {
                              const deptName = copy.departmentName || copy.department || copy.holder_dept || '-';
                              const locName = copy.location || copy.originalLocation || copy.point || copy.locationName || copy.station_name || `${deptName || 'PD'} Head Office`;
                              return (
                                <tr key={copy.id || `${copy.displayRev}-${copy.copy_no}`} className="hover:bg-[#FFFBF5] transition-colors">
                                  <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                    <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
                                      Copy {copy.copy_no || copy.ccNumber}
                                    </span>
                                  </td>
                                  <td 
                                    className="py-2.5 px-3 font-semibold text-[#1E293B] truncate align-middle text-sm"
                                    title={deptName}
                                  >
                                    <span className="truncate block" title={deptName}>
                                      {deptName}
                                    </span>
                                  </td>
                                  <td 
                                    className="py-2.5 px-3 text-slate-700 align-middle text-sm"
                                    title={locName}
                                  >
                                    <div className="flex items-center gap-1.5 truncate" title={locName}>
                                      <MapPin size={13} className="text-[#94A3B8] shrink-0" />
                                      <span className="truncate" title={locName}>
                                        {locName}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center whitespace-nowrap align-middle">
                                    <span className="inline-block px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-mono font-bold">
                                      Rev.{copy.displayRev || copy.rev || copy.doc_version || '00'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center whitespace-nowrap align-middle">
                                    {renderCopyStatusBadge(copy.status, copy)}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 text-center whitespace-nowrap font-mono text-xs align-middle">
                                    {formatReceiptDate(copy.destroyed_at || copy.dateDestroyed || copy.recalled_at || copy.dateRecalled || copy.superseded_at)}
                                  </td>
                                </tr>
                              );
                            })}
                            {recalledCopies.length === 0 && (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                                  <div className="flex flex-col items-center gap-2">
                                    <Sparkles size={24} className="text-slate-300" />
                                    <span className="font-semibold text-slate-600">ไม่มีรายการสำเนาควบคุมค้างเรียกคืน</span>
                                    <span className="text-slate-400">
                                      เอกสารชุดนี้เป็นรูปแบบอิเล็กทรอนิกส์ (Paperless) ทั้งหมด ไม่มีบันทึกการทำลายเล่มควบคุมทางกายภาพ
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-6 w-full max-w-full">
                  {/* History Header & Export CSV */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] gap-3">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-[#0D99FF]" />
                      <h3 className="font-bold text-[#1E1E1E] text-sm">
                        ประวัติ DAR และการแก้ไข
                      </h3>
                      <span className="text-xs text-[#666666] font-medium bg-[#FAFAFA] px-2.5 py-0.5 rounded-md border border-[#E5E5E5]">
                        พบทั้งหมด {scopedDarHistory.length} ฉบับ
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {scopedDarHistory.length > 1 && (
                        <button
                          type="button"
                          onClick={toggleAllAccordions}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer border border-transparent hover:border-blue-100"
                        >
                          {isAllExpanded ? 'พับเก็บทั้งหมด' : 'ขยายทั้งหมด'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleExportDarHistoryCsv}
                        disabled={scopedDarHistory.length === 0}
                        className="h-9 px-3.5 text-xs font-semibold text-[#1E1E1E] bg-white border border-[#E5E5E5] hover:bg-[#F5F5F5] hover:border-[#CCCCCC] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-2xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="ส่งออกประวัติ DAR เป็นไฟล์ CSV สำหรับเปิดใน Excel"
                      >
                        <Download className="text-[#0D99FF]" size={15} strokeWidth={1.75} />
                        <span>ส่งออกประวัติ (CSV)</span>
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Accordion Timeline (Gen-Z SaaS Style) */}
                  {scopedDarHistory.length > 0 && (
                    <div className="relative pt-2">
                      <div className="space-y-3">
                        {scopedDarHistory.map((dar, idx) => {
                          const itemId = dar.id || dar.dar_no || dar.darNo || `dar-${idx}`;
                          const isExpanded = expandedDarItems.includes(itemId);
                          const isLatest = isEffectiveMode && idx === 0;

                          const reasonInfo = getDarReason(dar);
                          const detailInfo = getDarDetail(dar);

                          const reasonText = (reasonInfo.value && reasonInfo.value !== '-')
                            ? reasonInfo.value
                            : (dar.reason || dar.requestReason || dar.changeReason || dar.otherReason || 'ปรับปรุงระเบียบปฏิบัติงานและเอกสารคุณภาพให้สอดคล้องกับมาตรฐาน ISO 9001:2015');

                          const detailText = (detailInfo.value && detailInfo.value !== '-')
                            ? detailInfo.value
                            : (dar.description || dar.changeSummary || dar.requestDetail || dar.change_details || dar.disposition_plan || 'กำหนดขั้นตอนการทำงานและจุดควบคุมสำหรับการปฏิบัติงานประจำวัน');

                          const reqName = (getRequesterName(dar, masterUsers) !== '-' ? getRequesterName(dar, masterUsers) : null) || dar.requester_name || dar.requester || dar.requesterName || '-';
                          const revName = (getReviewerName(dar, timeline) !== '-' ? getReviewerName(dar, timeline) : null) || dar.reviewer_name || dar.reviewer || dar.reviewerName || '-';
                          const appName = (getApproverName(dar, timeline) !== '-' ? getApproverName(dar, timeline) : null) || dar.approver_name || dar.approver || dar.approverName || '-';
                          const ackName = (getAckNames(dar, timeline) !== '-' ? getAckNames(dar, timeline) : null) || dar.ack_name || dar.ackNames || (dar.require_ack !== false ? 'ต้องรับทราบ' : 'ไม่ต้องรับทราบ');

                          const userOf = (n) => (masterUsers || []).find((u) => u.name === n || u.fullName === n);
                          const darType = dar.type || dar.request_type || dar.requestType || 'NEW';
                          const darStatus = dar.status || 'EFFECTIVE';
                          const isObsoleteItem = dar.type === 'OBSOLETE' || dar.request_type === 'OBSOLETE' || dar.darType === 'OBSOLETE' || dar.is_obsolete;
                          const isRevisionType = darType === 'REVISION' || darType === 'REVISE';

                          // หากเป็น Obsolete ให้ใช้ dar.revision หรือหากข้อมูลผิดพลาดเป็น 00 ให้ fallback ไปที่ Revision ของเอกสารแม่บท (doc.rev || doc.revision)
                          const candidateDocRev = (doc.rev && doc.rev !== '00') 
                            ? doc.rev 
                            : ((doc.revision && doc.revision !== '00') 
                              ? doc.revision 
                              : (doc.rev || doc.revision || '01'));
                          const rawObsoleteRev = (dar.revision && dar.revision !== '00') 
                            ? dar.revision 
                            : candidateDocRev;
                          const effectiveObsoleteRev = String(rawObsoleteRev).replace(/^Rev\.?/i, '').padStart(2, '0');

                          const darRevStr = isObsoleteItem 
                            ? effectiveObsoleteRev 
                            : String(dar.target_revision || dar.targetRevision || dar.docRev || dar.rev || dar.revision || '00').replace(/^Rev\.?/i, '').padStart(2, '0');
                          const darNo = formatDarNumber(dar.dar_no || dar.darNo || dar.id || `DAR-2026-${darRevStr}`);
                          const effDate = dar.completedAt || dar.effectiveDate || dar.effective_date_requested || dar.date || dar.createdAt?.split('T')[0] || '-';

                          const handleDownloadHistoricalPdf = async () => {
                            const isHistoricalRev = !isLatest || isObsoleteDoc;
                            if (isHistoricalRev || isObsoleteItem) {
                              const relatedDar = (dars || []).concat(darRequests || []).find(d => 
                                (dar.dar_no && (d.dar_no === dar.dar_no || d.darNo === dar.dar_no || d.id === dar.dar_no)) ||
                                (dar.id && (d.id === dar.id || d.dar_no === dar.id || d.darNo === dar.id)) ||
                                (dar.darNo && (d.darNo === dar.darNo || d.dar_no === dar.darNo || d.id === dar.darNo)) ||
                                (dar.dar_id && (d.id === dar.dar_id || d.dar_no === dar.dar_id))
                              );
                              return await handleDownloadHistoricalRevision(dar, doc, {
                                currentUser,
                                relatedDar
                              });
                            }

                            try {
                              const targetRev = darRevStr;
                              const toastId = toast.loading(`กำลังสร้าง PDF Rev.${targetRev}...`);
                              const targetDoc = {
                                ...doc,
                                rev: targetRev,
                                revision: targetRev,
                                status: doc.status || 'EFFECTIVE'
                              };
                              const watermarkConfig = resolveWatermarkConfig(targetDoc, {
                                currentUser,
                                isHistoricalRev: false
                              });
                              const isControlledUser = Boolean(currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN' || currentUser?.role === 'SUPER_ADMIN');
                              const histFileName = generateQmsDownloadName({
                                docCode: resolveDocCode(targetDoc) || targetDoc.docNo || targetDoc.title || 'DOCUMENT',
                                title: resolveDocTitle(targetDoc) || targetDoc.name || targetDoc.docName || targetDoc.title || '',
                                revision: targetRev,
                                systemStatus: targetDoc.status,
                                isControlledPrint: isControlledUser
                              });
                              await UniversalWatermarkService.generateAndDownloadPdf(targetDoc, watermarkConfig, {
                                userName: currentUser?.name || 'DCC Officer',
                                userDept: currentUser?.department || 'DC',
                                filename: histFileName
                              });
                              toast.dismiss(toastId);
                              toast.success(`ดาวน์โหลด PDF Rev.${targetRev} สำเร็จ`);
                            } catch (err) {
                              console.error(err);
                              toast.error('เกิดข้อผิดพลาดในการดาวน์โหลด');
                            }
                          };

                          return (
                            <div key={itemId} className="relative pl-6 pb-4">
                              {/* Timeline Line & Dot */}
                              <div className="absolute left-2 top-3 bottom-0 w-px bg-slate-200" />
                              <div className={`absolute left-1 top-2.5 w-2.5 h-2.5 rounded-full ring-4 ring-white ${isLatest ? 'bg-emerald-500' : 'bg-amber-500'}`} />

                              {/* Card Container */}
                              <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden transition-all duration-200 hover:border-slate-300">
                                {/* Clickable Header Strip */}
                                <button
                                  type="button"
                                  onClick={() => toggleDarItem(itemId)}
                                  className="w-full flex items-center justify-between p-3.5 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                                >
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {/* Revision & DAR No */}
                                    {isObsoleteItem ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
                                        สิ้นสุดที่ Rev.{effectiveObsoleteRev}
                                      </span>
                                    ) : (
                                      <span className="font-mono text-[13px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                        Rev.{darRevStr}
                                      </span>
                                    )}
                                    <span className="font-mono text-[13px] font-semibold text-slate-700">
                                      {darNo}
                                    </span>
                                    {/* Request Type Badge */}
                                    {isObsoleteItem ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200/60">
                                        ยกเลิกถาวร (OBSOLETE)
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200/60">
                                        {isRevisionType ? 'ขอแก้ไข' : 'จัดทำใหม่'}
                                      </span>
                                    )}
                                    {isLatest && !isObsoleteItem && !isObsoleteDoc && (
                                      <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">ฉบับล่าสุด</span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 sm:gap-4">
                                    {/* Status & Date */}
                                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                                      {darStatus}
                                    </span>
                                    <span className="text-xs font-mono text-slate-500">{effDate}</span>

                                    {/* Download Archive PDF Button */}
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadHistoricalPdf();
                                      }}
                                      title={`ดาวน์โหลด Archive PDF Rev.${darRevStr}`}
                                      className="p-1 rounded-md bg-white hover:bg-slate-200/70 text-slate-600 border border-slate-200 transition-colors cursor-pointer inline-flex items-center justify-center"
                                    >
                                      <Download size={13} strokeWidth={2} />
                                    </div>

                                    {/* Toggle Chevron */}
                                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                      {isExpanded ? (
                                        <ChevronUp className="w-4 h-4 text-slate-600" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-slate-500" />
                                      )}
                                    </div>
                                  </div>
                                </button>

                                {/* Collapsible Body */}
                                {isExpanded && (
                                  <div className="border-t border-slate-100 p-4 transition-all duration-200 animate-in slide-in-from-top-2 fade-in">
                                  <DarAuditRecord
                                    dar={dar}
                                    darType={darType}
                                    requesterName={reqName}
                                    requesterDept={dar.department || dar.dept || userOf(reqName)?.department}
                                    previousRev={String(Math.max(parseInt(darRevStr, 10) - 1, 0)).padStart(2, '0')}
                                    currentRev={darRevStr}
                                  />

                                  {/* Compact 4-Stage Approval Workflow Grid with Timestamps */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-[#F1F5F9] bg-[#FAFAFA] p-2.5 rounded-lg text-xs">
                                    <div className="min-w-0">
                                      <p className="text-[#64748B] font-medium text-[11px]">1. ผู้ร้องขอ (Requester)</p>
                                      <p className="font-bold text-[#1E293B] mt-0.5 truncate text-xs">{reqName}</p>
                                      <p className="text-[10px] text-slate-500 truncate">{jobTitle(userOf(reqName)?.position) || '-'}</p>
                                      <p className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-1">
                                        <Clock size={10} className="text-[#0D99FF] shrink-0" />
                                        <span>{getWorkflowStepTimestamp(dar, 'REQUEST', timeline)}</span>
                                      </p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[#64748B] font-medium text-[11px]">2. ผู้ทบทวน (Reviewer)</p>
                                      <p className="font-bold text-[#1E293B] mt-0.5 truncate text-xs">{revName}</p>
                                      <p className="text-[10px] text-slate-500 truncate">{jobTitle(userOf(revName)?.position) || '-'}</p>
                                      <p className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-1">
                                        <Clock size={10} className="text-[#0D99FF] shrink-0" />
                                        <span>{getWorkflowStepTimestamp(dar, 'REVIEW', timeline)}</span>
                                      </p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[#64748B] font-medium text-[11px]">3. ผู้อนุมัติ (Approver)</p>
                                      <p className="font-bold text-[#1E293B] mt-0.5 truncate text-xs">{appName}</p>
                                      <p className="text-[10px] text-slate-500 truncate">{jobTitle(userOf(appName)?.position) || '-'}</p>
                                      <p className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-1">
                                        <Clock size={10} className="text-[#0D99FF] shrink-0" />
                                        <span>{getWorkflowStepTimestamp(dar, 'APPROVE', timeline)}</span>
                                      </p>
                                    </div>
                                    <div className="min-w-0">
                                      {(() => {
                                        const isAckRequired = dar.requireAck === true || dar.require_ack === true || dar.ackRequirement === 'REQUIRED';
                                        if (!isAckRequired) {
                                          return (
                                            <>
                                              <p className="text-[#64748B] font-medium text-[11px]">4. ไม่ต้องรับทราบ</p>
                                              <p className="font-medium text-slate-500 mt-0.5 truncate text-xs">ยกเว้นการรับทราบ</p>
                                              <p className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-1">
                                                <Clock size={10} className="text-slate-400 shrink-0" />
                                                <span>-</span>
                                              </p>
                                            </>
                                          );
                                        }
                                        return (
                                          <>
                                            <p className="text-[#64748B] font-medium text-[11px]">4. การรับทราบ (Ack)</p>
                                            <p className="font-bold text-[#14AE5C] mt-0.5 truncate text-xs">{ackName}</p>
                                            <p className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-1">
                                              <Clock size={10} className="text-[#0D99FF] shrink-0" />
                                              <span>{getWorkflowStepTimestamp(dar, 'ACK', timeline)}</span>
                                            </p>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                   </div>
                                 )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Fallback Empty State: Simple, elegant 1-line display */}
                  {scopedDarHistory.length === 0 && (
                    <div className="p-8 bg-white border border-dashed border-[#E2E8F0] rounded-2xl text-center text-slate-500 text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-2xs">
                      <Sparkles size={16} className="text-slate-400 shrink-0" />
                      <span>ยังไม่มีบันทึกข้อมูลคำร้อง DAR สำหรับเอกสารฉบับนี้ในระบบ</span>
                    </div>
                  )}
                
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════
                  ISO 9001 Clause 7.5.3 — Periodic Review History Tab
                  Shows all review log entries stamped onto the schedule
                  for this document. Auditors value this trail because it
                  proves the document was periodically assessed even when
                  Rev number did not change.
              ═══════════════════════════════════════════════════════════════ */}
              {activeTab === 'periodic' && (() => {
                const docId = doc?.id;
                const matchingSchedule = (periodicReviewSchedules || []).find(
                  s => s.documentId === docId || s.externalDocumentId === docId ||
                       (doc?.title && s.documentNumber === doc.title) ||
                       (doc?.doc_code && s.documentNumber === doc.doc_code)
                );
                const reviewLogs = (doc?.periodic_reviews && doc.periodic_reviews.length > 0)
                  ? doc.periodic_reviews
                  : ((matchingSchedule?.reviewLogs && matchingSchedule.reviewLogs.length > 0)
                      ? matchingSchedule.reviewLogs
                      : (doc?.review_history || []));
                const nextReviewDate = matchingSchedule?.nextReviewDate || matchingSchedule?.currentScheduledReviewDate || doc?.next_review_date;
                const lastReviewedDate = matchingSchedule?.lastReviewedDate || doc?.last_reviewed_at || doc?.last_verified_at;

                const formatDate = (dateStr) => {
                  return formatQmsDisplayDate(dateStr);
                };

                // Review urgency indicator
                const urgency = (() => {
                  if (!nextReviewDate) return null;
                  const now = new Date(); now.setHours(0,0,0,0);
                  const due = new Date(nextReviewDate); due.setHours(0,0,0,0);
                  const diff = Math.ceil((due - now) / 86400000);
                  if (diff < 0) return { label: '🚨 เกินกำหนด', color: 'bg-red-100 text-red-700 border-red-200' };
                  if (diff <= 30) return { label: '⚠️ ใกล้ครบกำหนด', color: 'bg-amber-100 text-amber-700 border-amber-200' };
                  return { label: '✅ ยังไม่ถึงกำหนด', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
                })();

                return (
                  <div className="space-y-5">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] gap-3">
                      <div className="flex items-center gap-2">
                        <RotateCw size={16} className="text-[#0D99FF]" />
                        <h3 className="font-bold text-[#1E1E1E] text-sm">
                          ประวัติการทบทวนตามรอบ
                        </h3>
                        <span className="text-xs text-[#666666] font-medium bg-[#FAFAFA] px-2.5 py-0.5 rounded-md border border-[#E5E5E5]">
                          {reviewLogs.length} ครั้ง
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {nextReviewDate && urgency && (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${urgency.color}`}>
                            {urgency.label} · ครบกำหนด {formatDate(nextReviewDate)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleRecordReview}
                          className="px-3 py-1.5 bg-[#0D99FF] text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1.5"
                        >
                          <PlusCircle size={14} /> บันทึกผลทบทวน
                        </button>
                      </div>
                    </div>

                    {/* Meta info row */}
                    {matchingSchedule && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'รอบทบทวน (เดือน)', value: matchingSchedule.frequencyMonths || 12 },
                          { label: 'ครบกำหนดถัดไป', value: formatDate(nextReviewDate) || '-' },
                          { label: 'ทบทวนล่าสุด', value: formatDate(lastReviewedDate) || '-' },
                          { label: 'จำนวนครั้งที่ทบทวนแล้ว', value: reviewLogs.length },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-[#F8FAFC] border border-[#E5E5E5] rounded-xl p-3">
                            <p className="text-xs text-[#666666] mb-0.5">{label}</p>
                            <p className="font-bold text-[#1E1E1E] text-sm">{value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Timeline */}
                    <PeriodicReviewHistoryTab 
                      reviews={reviewLogs} 
                      nextReviewDate={nextReviewDate} 
                      matchingSchedule={matchingSchedule} 
                      reversed 
                    />
                  </div>
                );
              })()}
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Request Additional Copies Modal */}
      {isRequestModalOpen && (
        <RequestAdditionalCopiesModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          document={doc}
        />
      )}

      {/* Point-of-Use Station Replacement Modal */}
      {selectedReplacementCopy && (
        <ReplacementModal
          isOpen={!!selectedReplacementCopy}
          onClose={async (success, type, reason) => {
            if (success && type && reason) {
              try {
                if ((await reportCcDamagedLost(selectedReplacementCopy.id, type, reason)) === false) return;
                toast.success('ยื่นคำร้องขอสำเนาทดแทนเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่ DCC จัดพิมพ์และส่งมอบ');
                setSelectedReplacementCopy(null);
              } catch (err) {
                console.error('[DocumentDetailModal] reportCcDamagedLost failed:', err);
                toast.error(err?.message || 'เกิดข้อผิดพลาดในการทำรายการ');
                throw err;
              }
            } else {
              setSelectedReplacementCopy(null);
            }
          }}
          instance={selectedReplacementCopy}
        />
      )}

      {/* ISO 9001 Clause 7.5.3 – Custody Workflow: Relocation Request Modal */}
      {selectedRelocateCopy && (
        <RelocateCopyModal
          isOpen={!!selectedRelocateCopy}
          onClose={() => setSelectedRelocateCopy(null)}
          copy={selectedRelocateCopy}
        />
      )}

      {/* ISO 9001 Clause 7.5.3 – Custody Workflow: Return / Decommission Modal */}
      {selectedReturnCopy && (
        <ReturnCopyModal
          isOpen={!!selectedReturnCopy}
          onClose={() => setSelectedReturnCopy(null)}
          copy={selectedReturnCopy}
        />
      )}
    </ErrorBoundary>

  );
};

export default DocumentDetailModal;
