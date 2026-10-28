import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  FileText, 
  Download, 
  Building2, 
  Globe, 
  Lock, 
  ShieldAlert, 
  Layers, 
  AlertTriangle, 
  AlertCircle, 
  RotateCw, 
  Archive, 
  PlusCircle, 
  ArrowRight,
  MapPin,
  Flame,
  Eye
} from 'lucide-react';
import useStore from '../../../../store/useStore';
import StatusBadge from '../../components/ui/StatusBadge';
import RequestAdditionalCopiesModal from '../../components/workflow/RequestAdditionalCopiesModal';
import ExternalCopyDispositionModal from './ExternalCopyDispositionModal';
import ExternalDocPreviewModal from './ExternalDocPreviewModal';
import ExternalReviewHistoryTab from './ExternalReviewHistoryTab';
import UniversalWatermarkService, { WATERMARK_TYPES } from '../../services/UniversalWatermarkService';
import toast from 'react-hot-toast';
import { fmtDate, getCanonicalDocNo } from './ExternalDocsList';

const ExternalDocDetailModal = ({ 
  isOpen, 
  onClose, 
  document: initialDoc, 
  documentFamily = null,
  onOpenViewer: _onOpenViewer,
  onOpenRevise,
  onOpenObsolete
}) => {
  const { 
    externalDocuments, 
    externalRequests,
    currentUser, 
    controlledCopyInstances, 
    documentControlledCopies,
    controlledCopies,
    logExternalDownload
  } = useStore();

  const [currentDoc, setCurrentDoc] = useState(initialDoc);
  // currentDoc is a snapshot; review history must reflect approvals made while the modal is open
  const liveDoc = (externalDocuments || []).find(d => String(d.id) === String(currentDoc?.id)) || currentDoc;
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'lineage'
  const [isRequestCopiesOpen, setIsRequestCopiesOpen] = useState(false);
  const [isDispositionModalOpen, setIsDispositionModalOpen] = useState(false);
  const [selectedCopiesForDisposition, setSelectedCopiesForDisposition] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewEditionDoc, setPreviewEditionDoc] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync internal document state when initialDoc changes
  useEffect(() => {
    if (initialDoc) {
      // If initialDoc is an immutable snapshot (e.g. from Superseded Editions modal), preserve its snapshot attributes
      const isHistoricalSnapshot = Boolean(
        initialDoc.status === 'SUPERSEDED' || 
        initialDoc.is_superseded || 
        initialDoc.supersededAt || 
        initialDoc.supersededByEdition
      );

      if (isHistoricalSnapshot) {
        setCurrentDoc(initialDoc);
      } else {
        // Look up freshest record from store if possible for active documents
        const freshDoc = (externalDocuments || []).find(d => d.id === initialDoc.id) || initialDoc;
        setCurrentDoc(freshDoc);
      }
    }
  }, [initialDoc, externalDocuments]);

  // Reset tab to general on new open
  useEffect(() => {
    if (isOpen) {
      setActiveTab('general');
      setPreviewEditionDoc(null);
      setIsExpanded(false);
    }
  }, [isOpen, initialDoc?.id]);

  // Attach the PDF of one specific edition to a history row. History snapshots often lack file info,
  // so borrow it from any record of the same document + same edition (other family rows, then requests).
  const withEditionFile = (item) => {
    if (!item) return item;
    const hasFile = (d) => Boolean(d && (d.apiFilePath || d.attachedFile || d.rawFileId || d.fileId || d.fileStorageKey));
    if (hasFile(item)) return item;
    const edOf = (d) => String(d?.sourceVersion || d?.edition || d?.ver_ed || '').trim();
    const codeOf = (d) => String(d?.edCode || d?.doc_code || d?.docNo || '').trim().toUpperCase();
    const ed = edOf(item);
    const code = codeOf(item) || String(canonicalDocCode || '').trim().toUpperCase();
    if (!ed) return item;
    const donor = [...familyEditions, ...(externalRequests || [])].find(d =>
      d && d !== item && hasFile(d) && edOf(d) === ed && (!code || !codeOf(d) || codeOf(d) === code)
    );
    if (!donor) return item;
    const f = donor.attachedFile || null;
    return {
      ...item,
      ...(f ? { attachedFile: f, file: f, attachment: f } : {}),
      ...(donor.apiFilePath ? { apiFilePath: donor.apiFilePath } : {}),
      ...(donor.rawFileId ? { rawFileId: donor.rawFileId } : {}),
      ...(donor.fileId ? { fileId: donor.fileId } : {}),
      ...(donor.fileStorageKey ? { fileStorageKey: donor.fileStorageKey } : {}),
    };
  };

  // Synchronized controlled copies list
  const allCopies = useMemo(() => {
    return [
      ...(controlledCopyInstances || []),
      ...(documentControlledCopies || []),
      ...(controlledCopies || [])
    ];
  }, [controlledCopyInstances, documentControlledCopies, controlledCopies]);

  const edCode = currentDoc?.edCode || currentDoc?.doc_code || currentDoc?.docNo || currentDoc?.id || 'ED-DOC-001';
  const sourceEdition = currentDoc?.sourceVersion || currentDoc?.edition || '-';
  const docTitle = currentDoc?.title || currentDoc?.name || 'เอกสารภายนอก';
  const getUserDepartments = (user) => {
    if (!user) return [];
    const depts = [];
    if (user.department) depts.push(user.department);
    if (user.primary_department) depts.push(user.primary_department);
    if (user.dept) depts.push(user.dept);
    if (user.dept_code) depts.push(user.dept_code);
    if (Array.isArray(user.departments)) depts.push(...user.departments);
    if (Array.isArray(user.secondaryDepartments)) depts.push(...user.secondaryDepartments);
    if (Array.isArray(user.depts)) depts.push(...user.depts);
    if (Array.isArray(user.affiliated_departments)) depts.push(...user.affiliated_departments);
    return [...new Set(depts.filter(Boolean))];
  };

  const userDepts = getUserDepartments(currentUser);
  const uDept = userDepts[0] || currentUser?.department || 'QA';

  const deptMatches = (d1, d2) => {
    if (!d1 || !d2) return false;
    const s1 = String(typeof d1 === 'object' ? (d1.id || d1.code || d1.dept || d1.department || '') : d1).trim().toUpperCase();
    const s2 = String(typeof d2 === 'object' ? (d2.id || d2.code || d2.dept || d2.department || '') : d2).trim().toUpperCase();
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;
    return false;
  };

  const isOwnerDept = userDepts.includes(currentDoc?.department) || userDepts.some(ud => deptMatches(ud, currentDoc?.department || currentDoc?.dept));
  const isDccAdmin = Boolean(
    currentUser?.role === 'DCC' || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.isDccAdmin || 
    currentUser?.isDcc || 
    currentUser?.role === 'ADMIN' ||
    currentUser?.department === 'DC' ||
    currentUser?.department === 'DCC'
  );

  // Status flags
  const isObsolete = Boolean(
    currentDoc?.status === 'OBSOLETE' || 
    currentDoc?.status === 'OBSOLETE_ARCHIVED' || 
    currentDoc?.is_obsolete
  );

  const isSuperseded = Boolean(
    !isObsolete && (
      currentDoc?.status === 'SUPERSEDED' || 
      currentDoc?.status === 'SUPERSEDED_ARCHIVED' || 
      currentDoc?.is_superseded
    )
  );

  const isActive = Boolean(
    !isObsolete && !isSuperseded && (
      currentDoc?.status === 'ACTIVE' || 
      currentDoc?.status === 'EFFECTIVE'
    )
  );

  const canManageDoc = (isOwnerDept || isDccAdmin) && isActive;
  const canRequestCopy = isActive;

  // Canonical code and base ID resolution
  const canonicalDocCode = useMemo(() => {
    if (!currentDoc) return '';
    return getCanonicalDocNo(currentDoc) || currentDoc.edCode || currentDoc.doc_code || currentDoc.id || '';
  }, [currentDoc]);

  // Sanitizes version string to prevent duplicated prefix (e.g., "Edition Edition 1.7" -> "1.7")
  const cleanVersion = (str) => {
    if (!str) return '1.0';
    let s = String(str).trim();
    while (/^(?:Edition|Ver|Version|Rev|Rev\.)\s*/i.test(s)) {
      s = s.replace(/^(?:Edition|Ver|Version|Rev|Rev\.)\s*/i, '').trim();
    }
    return s || '1.0';
  };

  // Reverse Chronological Comparator for External Document Editions
  const compareEditionsNewestFirst = (a, b) => {
    // 1. Active status always on top
    const isActiveA = (a.status === 'ACTIVE' || a.status === 'EFFECTIVE') && !a.is_superseded && !a.is_obsolete && a.status !== 'SUPERSEDED' && a.status !== 'OBSOLETE';
    const isActiveB = (b.status === 'ACTIVE' || b.status === 'EFFECTIVE') && !b.is_superseded && !b.is_obsolete && b.status !== 'SUPERSEDED' && b.status !== 'OBSOLETE';
    if (isActiveA && !isActiveB) return -1;
    if (!isActiveA && isActiveB) return 1;

    // 2. Direct replacement lineage link (if B replaced A, B is newer than A)
    const edA = cleanVersion(a.sourceVersion || a.edition || a.ver_ed || a.rev);
    const edB = cleanVersion(b.sourceVersion || b.edition || b.ver_ed || b.rev);
    if (
      (a.supersededByDocId && String(a.supersededByDocId) === String(b.id)) ||
      (b.previousDocId && String(b.previousDocId) === String(a.id)) ||
      (a.supersededByEdition && cleanVersion(a.supersededByEdition) === edB)
    ) {
      return 1;
    }
    if (
      (b.supersededByDocId && String(b.supersededByDocId) === String(a.id)) ||
      (a.previousDocId && String(a.previousDocId) === String(b.id)) ||
      (b.supersededByEdition && cleanVersion(b.supersededByEdition) === edA)
    ) {
      return -1;
    }

    // 3. Compare effective date / creation / superseded timestamp descending
    const effA = new Date(a.effective_date || a.effectiveDate || a.issueDate || a.createdAt || a.superseded_at || a.supersededAt || a.supersededDate || 0).getTime() || 0;
    const effB = new Date(b.effective_date || b.effectiveDate || b.issueDate || b.createdAt || b.superseded_at || b.supersededAt || b.supersededDate || 0).getTime() || 0;
    if (effB !== effA) return effB - effA;

    const supA = new Date(a.superseded_at || a.supersededAt || a.supersededDate || a.obsoletedAt || a.obsoleteDate || a.updatedAt || 0).getTime() || 0;
    const supB = new Date(b.superseded_at || b.supersededAt || b.supersededDate || b.obsoletedAt || b.obsoleteDate || b.updatedAt || 0).getTime() || 0;
    if (supB !== supA) return supB - supA;

    // 4. Fallback: compare EDR / DAR request number descending
    const reqA = String(a.request_no || a.requestNo || a.edrNumber || a.requestId || a.dar_no || a.darNo || '');
    const reqB = String(b.request_no || b.requestNo || b.edrNumber || b.requestId || b.dar_no || b.darNo || '');
    if (reqA !== reqB) {
      return reqB.localeCompare(reqA, undefined, { numeric: true });
    }
    return 0;
  };

  // Find all related editions in external documents lineage (ISO 9001:2015 Clause 7.5.3.2)
  const familyEditions = useMemo(() => {
    if (!currentDoc) return [];
    const targetCode = String(canonicalDocCode).trim().toUpperCase();
    const targetTitle = String(docTitle).trim().toLowerCase();
    const targetBaseId = String(currentDoc.id).split('-SUPERSEDED')[0].split('_SUPERSEDED')[0].trim();

    const pool = (documentFamily && Array.isArray(documentFamily) && documentFamily.length > 0)
      ? documentFamily
      : [
          ...(externalDocuments || []),
          ...(Array.isArray(currentDoc.supersededEditions) ? currentDoc.supersededEditions : []),
          ...(Array.isArray(currentDoc.versionHistory) ? currentDoc.versionHistory : [])
        ];

    const matched = pool.filter(d => {
      if (!d) return false;
      const dCode = String(getCanonicalDocNo(d) || d.edCode || d.doc_code || d.docNo || '').trim().toUpperCase();
      const dBaseId = String(d.id).split('-SUPERSEDED')[0].split('_SUPERSEDED')[0].trim();

      if (targetCode && dCode === targetCode) return true;
      if (targetBaseId && dBaseId === targetBaseId) return true;
      if (d.previousDocId && (String(d.previousDocId) === String(currentDoc.id) || String(d.previousDocId) === targetBaseId)) return true;
      if (currentDoc.previousDocId && (String(currentDoc.previousDocId) === String(d.id) || String(currentDoc.previousDocId) === dBaseId)) return true;
      if (d.title && targetTitle && String(d.title).trim().toLowerCase() === targetTitle && deptMatches(d.department, currentDoc.department)) return true;
      return false;
    });

    const uniqueMap = new Map();
    matched.forEach(d => uniqueMap.set(d.id, d));
    // Always include current doc
    uniqueMap.set(currentDoc.id, currentDoc);

    const list = Array.from(uniqueMap.values());
    return list.sort(compareEditionsNewestFirst);
  }, [currentDoc, canonicalDocCode, docTitle, documentFamily, externalDocuments]);

  // Backward-compatible alias
  const allEditions = familyEditions;

  // Separate Active Version vs Superseded/Historical List sorted newest -> oldest
  const sortedHistory = useMemo(() => {
    const activeVersion = familyEditions.find(d =>
      (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') &&
      !d.is_superseded &&
      !d.is_obsolete &&
      d.status !== 'SUPERSEDED' &&
      d.status !== 'OBSOLETE'
    ) || null;

    const rawSuperseded = familyEditions.filter(d => !activeVersion || d.id !== activeVersion.id);
    const supersededList = [...rawSuperseded].sort(compareEditionsNewestFirst);

    return { activeVersion, supersededList };
  }, [familyEditions]);

  // Find latest active/effective edition if current document is superseded
  const latestActiveEdition = useMemo(() => {
    if (!currentDoc) return null;
    return sortedHistory.activeVersion || allEditions[0];
  }, [sortedHistory, allEditions, currentDoc]);

  // Physical controlled copies matched to this external document
  const ccInstances = useMemo(() => {
    if (!currentDoc) return [];
    const targetId = String(currentDoc.id || '').trim();
    const targetCode = String(edCode || '').trim().toUpperCase();

    const matchedStoreCopies = allCopies.filter(c => {
      if (!c) return false;
      const cDocId = String(c.documentId || c.externalDocId || c.external_doc_id || c.docId || c.doc_id || '').trim();
      const matchId = Boolean(targetId && cDocId === targetId);
      const copyDocCode = String(c.doc_code || c.docCode || c.documentCode || c.document_code || c.edCode || c.docTitle || '').trim().toUpperCase();
      const matchCode = Boolean(targetCode && copyDocCode === targetCode);
      return matchId || matchCode;
    });

    const embeddedCopies = [
      ...(Array.isArray(currentDoc.distributionList) ? currentDoc.distributionList : []),
      ...(Array.isArray(currentDoc.distribution) ? currentDoc.distribution : []),
      ...(Array.isArray(currentDoc.controlledCopies) ? currentDoc.controlledCopies : [])
    ];

    const combined = [...matchedStoreCopies, ...embeddedCopies];
    const seen = new Set();

    return combined.filter((c, idx) => {
      if (!c) return false;
      const codeStr = String(c.copyCode || c.copy_code || '').trim().toUpperCase();
      const cMatch = codeStr.match(/-C(\d+)$/i);
      const rawNo = cMatch ? cMatch[1] : (c.copy_number ?? c.copyNumber ?? c.copy_no ?? c.copyNo ?? (c.ccNumber ? String(c.ccNumber).replace(/\D/g, '') : ''));
      const num = parseInt(rawNo, 10);
      const canonicalCopyCode = codeStr || (!isNaN(num) && num > 0 && targetCode ? `${targetCode}-C${String(num).padStart(2, '0')}` : '');
      const dedupKey = canonicalCopyCode || String(c.id || `idx-${idx}`).trim().toUpperCase();
      if (seen.has(dedupKey)) return false;
      seen.add(dedupKey);
      return true;
    });
  }, [currentDoc, edCode, allCopies]);

  // Copies requiring recall / disposition
  const pendingRecallCopies = useMemo(() => {
    return ccInstances.filter(c => 
      c.status === 'PENDING_RECALL' || 
      c.status === 'SUPERSEDED_PENDING_RECALL' || 
      c.status === 'OBSOLETE_PENDING_RECALL'
    );
  }, [ccInstances]);


  // Watermarked PDF Download Action for a specific edition
  const handleDownloadEditionPdf = async (targetDoc) => {
    const docToDl = targetDoc || currentDoc;
    setIsDownloading(true);

    const isDocObs = Boolean(
      docToDl?.status === 'OBSOLETE' || 
      docToDl?.status === 'OBSOLETE_ARCHIVED' || 
      docToDl?.is_obsolete
    );
    const isDocSup = Boolean(
      !isDocObs && (
        docToDl?.status === 'SUPERSEDED' || 
        docToDl?.status === 'SUPERSEDED_ARCHIVED' || 
        docToDl?.is_superseded
      )
    );
    const watermarkPreset = isDocObs 
      ? WATERMARK_TYPES.OBSOLETE 
      : isDocSup 
        ? WATERMARK_TYPES.SUPERSEDED 
        : WATERMARK_TYPES.UNCONTROLLED_COPY;

    const targetCode = docToDl.edCode || docToDl.doc_code || docToDl.docNo || edCode;
    const targetVer = cleanVersion(docToDl.sourceVersion || docToDl.edition || docToDl.rev || '01');
    const toastId = toast.loading(`กำลังประทับลายน้ำเอกสาร ${targetCode} (Edition ${targetVer})...`);

    try {
      await UniversalWatermarkService.downloadWatermarkedPdf(
        {
          ...docToDl,
          id: docToDl.id,
          title: targetCode,
          name: docToDl.title || docTitle,
          docTitle: docToDl.title || docTitle,
          rev: targetVer,
          department: docToDl.department || uDept,
          effectiveDate: docToDl.effectiveDate,
          status: isDocObs ? 'OBSOLETE' : (isDocSup ? 'SUPERSEDED' : (docToDl.status || 'ACTIVE')),
          sourceVersion: targetVer,
          source: docToDl.source || currentDoc.source,
          isExternal: true,
          is_external: true,
          doc_type: 'ED',
          docType: 'ED',
          attachedFile: docToDl.attachedFile,
          fileId: docToDl.fileId || docToDl.attachedFile?.fileId
        },
        watermarkPreset,
        {
          ...docToDl,
          docCode: targetCode,
          docTitle: docToDl.title || docTitle,
          title: docToDl.title || docTitle,
          docVersion: targetVer,
          sourceVersion: targetVer,
          source: docToDl.source || currentDoc.source,
          userName: currentUser?.name || 'Authorized User',
          userDept: currentUser?.department || uDept,
          authorizedScope: docToDl.accessScope === 'Restricted' ? 'Restricted External Release' : 'Standard External Reference',
          dccName: currentUser?.name || 'DCC Admin',
          isExternal: true,
          is_external: true,
          doc_type: 'ED',
          docType: 'ED',
          isRestricted: docToDl.accessScope === 'Restricted' || docToDl.accessScope === 'RESTRICTED',
          accessScope: docToDl.accessScope || currentDoc.accessScope,
          watermarkType: watermarkPreset,
          reason: isDocObs ? 'Historical Download (OBSOLETE)' : (isDocSup ? 'Historical Download (SUPERSEDED)' : 'External Document Download / Print'),
          attachedFile: docToDl.attachedFile,
          fileId: docToDl.fileId || docToDl.attachedFile?.fileId
        }
      );

      if (logExternalDownload) {
        logExternalDownload(docToDl.id);
      }
      toast.success(`ดาวน์โหลดเอกสาร ${targetCode} (${targetVer}) สำเร็จ`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการสร้างเอกสาร PDF', { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadPdf = () => handleDownloadEditionPdf(currentDoc);

  if (!isOpen || !currentDoc) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0"
        />

        {/* Modal Container */}
        <motion.div 
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden z-10 my-auto animate-in fade-in zoom-in-95 duration-150"
        >
          {/* 1. Modal Header */}
          <div className="px-6 py-4.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5 min-w-0 pr-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/80 flex items-center justify-center shrink-0 shadow-xs">
                <FileText size={22} strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {/* System ED Code Badge */}
                  <span className="px-2.5 py-0.5 rounded-md bg-[#E5F4FF] text-[#0D99FF] border border-[#B8E1FF] text-xs font-bold font-mono tracking-wide shadow-2xs">
                    {edCode}
                  </span>

                  {/* Source Edition Badge */}
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-xs font-bold font-mono">
                    {sourceEdition !== '-' ? `Edition ${cleanVersion(sourceEdition)}` : 'ฉบับต้นทาง'}
                  </span>

                  {/* Status Badge */}
                  <StatusBadge status={currentDoc.status} />
                </div>

                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight break-words line-clamp-1 leading-snug">
                  {docTitle}
                </h2>
              </div>
            </div>

            <button 
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors shrink-0 ml-2 outline-none cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X size={20} />
            </button>
          </div>

          {/* 2. Modern Segmented Tab Bar (Linear / Minimalist SaaS Aesthetic) */}
          <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="inline-flex p-1 bg-slate-100/90 rounded-xl gap-1 border border-slate-200/60">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  activeTab === 'general'
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 font-medium'
                }`}
              >
                ข้อมูลทั่วไป
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('lineage')}
                className={`px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'lineage'
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 font-medium'
                }`}
              >
                <span>ประวัติทุกเวอร์ชัน</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === 'lineage' ? 'bg-slate-100 text-slate-900' : 'bg-slate-200/80 text-slate-600'
                }`}>
                  {familyEditions.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  activeTab === 'reviews'
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 font-medium'
                }`}
              >
                {`ประวัติการทบทวน (${liveDoc?.review_history?.length || 0})`}
              </button>

            </div>
          </div>

          {/* Modal Body Container */}
          <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[#FAFAFA] custom-scrollbar">
            {/* Minimal Obsolete Callout Card */}
            {isObsolete && (
              <div className="bg-rose-50/50 border border-rose-200/70 rounded-xl p-3.5 mb-5 flex items-start gap-3">
                <AlertCircle size={16} strokeWidth={2} className="text-rose-500 shrink-0 mt-0.5" />
                <div className="text-xs min-w-0 flex-1">
                  <div className="font-semibold text-rose-900 text-xs flex items-center gap-2 flex-wrap">
                    <span>เอกสารนี้ถูกยกเลิกใช้งานทั้งระบบ (OBSOLETE)</span>
                    {(currentDoc.obsoleteDate || currentDoc.obsoletedAt || currentDoc.effectiveDate) && (
                      <span className="font-mono text-[11px] font-normal text-rose-600">
                        • วันที่มีผล: {fmtDate(currentDoc.obsoleteDate || currentDoc.obsoletedAt || currentDoc.effectiveDate)}
                      </span>
                    )}
                  </div>
                  <div className="break-words text-rose-700/90 text-xs mt-1 leading-relaxed">
                    {currentDoc.reason || currentDoc.obsoleteReason || currentDoc.archivedReason || 'เอกสารฉบับนี้ถูกยกเลิกถาวรและปลดออกจากการใช้งานตามระบบบริหารคุณภาพ'}
                  </div>
                </div>
              </div>
            )}

            {/* Minimal Superseded Callout Card */}
            {isSuperseded && (
              <div className="bg-amber-50/50 border border-amber-200/70 rounded-xl p-3.5 mb-5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <AlertTriangle size={16} strokeWidth={2} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs min-w-0">
                    <span className="font-semibold text-amber-900 text-xs">
                      เอกสารตกรุ่น (SUPERSEDED) • เอกสารฉบับนี้ถูกแทนที่แล้ว ห้ามนำไปใช้อ้างอิงการปฏิบัติงาน
                    </span>
                  </div>
                </div>
                {latestActiveEdition && latestActiveEdition.id !== currentDoc.id && (
                  <button
                    type="button"
                    onClick={() => setCurrentDoc(latestActiveEdition)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-all shrink-0 cursor-pointer"
                  >
                    <span>ดูฉบับล่าสุด</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            )}
            {activeTab === 'general' && (
              <div className="space-y-6">
                {/* 3. Bento Grid Layout 2 Columns */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Left Card: Master Data (7 cols) */}
                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText size={15} className="text-[#0D99FF]" /> ข้อมูลแม่บทเอกสารภายนอก (Master Info)
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          ID: {currentDoc.id}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-4 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px] mb-0.5">รหัสเอกสารภายนอก (ED Code)</span>
                          <span className="font-mono font-bold text-[#0D99FF] text-sm">{edCode}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px] mb-0.5">เวอร์ชันต้นทาง (Edition / Version)</span>
                          <span className="font-mono font-bold text-slate-800">
                            {sourceEdition !== '-' ? sourceEdition : 'ฉบับต้นทาง'}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-[11px] mb-0.5">ชื่อเอกสารทางการ (Title)</span>
                          <span className="font-semibold text-slate-800 text-sm leading-snug">{docTitle}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px] mb-0.5">แผนกผู้รับผิดชอบ (Responsible Dept)</span>
                          <span className="font-bold text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block">
                            {currentDoc.department || 'QA'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px] mb-0.5">หน่วยงานผู้ออกเอกสาร (Issuing Org)</span>
                          <span className="font-bold text-slate-800">{currentDoc.source || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px] mb-0.5">วันที่มีผลบังคับใช้ (Effective Date)</span>
                          <span className="font-mono text-slate-800 font-semibold">{currentDoc.effectiveDate || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px] mb-0.5">รอบกำหนดทบทวนความทันสมัย</span>
                          <span className="text-slate-800 font-semibold">
                            {currentDoc.reviewCycleMonths || 12} เดือน {currentDoc.nextReviewDate && `(กำหนด: ${currentDoc.nextReviewDate})`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Card: Access Scope (5 cols) */}
                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Lock size={15} className="text-amber-600" /> ขอบเขตสิทธิ์การเข้าถึง (Access Control)
                        </span>
                      </div>

                      <div className="space-y-4 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px] mb-1.5">ประเภทสิทธิ์การเข้าถึง</span>
                          {currentDoc.accessScope === 'Restricted' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                              <ShieldAlert size={14} /> ลับเฉพาะ (Restricted Access)
                            </span>
                          ) : currentDoc.accessScope === 'Department' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                              <Building2 size={14} /> เฉพาะแผนก (Department Access)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                              <Globe size={14} /> สิทธิ์ทั่วไป (General Access)
                            </span>
                          )}
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[11px] mb-1.5">ขอบเขตผู้ได้รับสิทธิ์เข้าถึง</span>
                          {currentDoc.accessScope === 'Restricted' ? (
                            <div className="space-y-2">
                              <p className="text-slate-600 text-[11px] leading-relaxed">
                                จำกัดสิทธิ์เฉพาะผู้ได้รับมอบหมายเป็นลายลักษณ์อักษร หรือระดับสิทธิ์ที่ระบุ:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(currentDoc.accessUsers && currentDoc.accessUsers.length > 0) ? (
                                  currentDoc.accessUsers.map((u, i) => (
                                    <span key={i} className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-[11px]">
                                      {u}
                                    </span>
                                  ))
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-[11px]">
                                    Lv.4+ Supervisor & DCC Admin
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : currentDoc.accessScope === 'Department' ? (
                            <div className="space-y-2">
                              <p className="text-slate-600 text-[11px]">
                                สิทธิ์การเข้าถึงสำหรับแผนกที่กำหนด:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {((currentDoc.accessDepartments && currentDoc.accessDepartments.length > 0) ? currentDoc.accessDepartments : [currentDoc.department || 'QA']).map((dept, i) => (
                                  <span key={i} className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold font-mono text-xs">
                                    {dept}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/70 text-emerald-800 text-[11px] leading-relaxed">
                              เปิดให้ทุกแผนกและพนักงานทุกคนในระบบสามารถเปิดอ่านและอ้างอิงเอกสารนี้ได้ตามข้อกำหนด ISO 9001
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Bar (ปุ่มแถบการทำงาน) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      การดำเนินการ:
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Request Additional Copies (if permitted for owner department/DCC and active) */}
                    {canRequestCopy && (
                      <button
                        type="button"
                        onClick={() => setIsRequestCopiesOpen(true)}
                        className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 active:scale-[0.98] text-xs font-bold transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                      >
                        <PlusCircle size={15} />
                        <span>ขอสำเนาควบคุมเพิ่มเติม</span>
                      </button>
                    )}

                    {/* Update Revision Button (Authorized Owner Dept or DCC Only) */}
                    {onOpenRevise && canManageDoc && (
                      <button
                        type="button"
                        onClick={() => onOpenRevise(currentDoc)}
                        className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 active:scale-[0.98] text-xs font-bold transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                        title="อัปเดตฉบับใหม่"
                      >
                        <RotateCw size={15} />
                        <span>อัปเดตฉบับใหม่</span>
                      </button>
                    )}

                    {/* Request Obsolete Button (Authorized Owner Dept or DCC Only) */}
                    {isActive && onOpenObsolete && canManageDoc && (
                      <button
                        type="button"
                        onClick={() => onOpenObsolete(currentDoc)}
                        className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-[0.98] text-xs font-bold transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                        title="ยื่นขอยกเลิกใช้งาน"
                      >
                        <Archive size={15} />
                        <span>ขอยกเลิกใช้งาน</span>
                      </button>
                    )}

                    {/* Download Watermarked PDF */}
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={handleDownloadPdf}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white text-xs font-bold transition-all flex items-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <Download size={15} />
                      <span>ดาวน์โหลด PDF (มีลายน้ำ)</span>
                    </button>
                  </div>
                </div>

                {/* Controlled Copies Circulation Table */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3.5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-indigo-600" />
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        สำเนาควบคุมที่แจกจ่ายประจำจุดใช้งาน (Controlled Copies in Circulation)
                      </h3>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono text-slate-500 font-semibold">
                        ทั้งหมด {ccInstances.length} เล่ม
                      </span>
                      {isDccAdmin && pendingRecallCopies.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCopiesForDisposition(pendingRecallCopies);
                            setIsDispositionModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-98"
                          title="เปิดหน้าต่างบันทึกการเรียกคืน/ทำลายสำเนาควบคุม"
                        >
                          <Flame size={13} />
                          <span>บันทึกการเรียกคืน/ทำลายสำเนา ({pendingRecallCopies.length})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-36">รหัสสำเนา (Copy Code)</th>
                          <th className="py-2.5 px-3 w-40">แผนก / ผู้ถือครอง</th>
                          <th className="py-2.5 px-3">จุดติดตั้ง / จุดใช้งาน</th>
                          <th className="py-2.5 px-3 text-center w-36">สถานะเล่ม (Status)</th>
                          <th className="py-2.5 px-3 text-center w-48">วันที่และผู้ดำเนินการ</th>
                          {isDccAdmin && <th className="py-2.5 px-3 text-center w-20">จัดการ</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ccInstances.length > 0 ? (
                          ccInstances.map((inst, index) => {
                            const rawNo = inst.copyNumber || inst.copy_no || inst.ccNumber || String(index + 1);
                            const numMatch = String(rawNo).match(/(\d+)\s*$/);
                            const paddedNo = numMatch ? String(parseInt(numMatch[1], 10)).padStart(2, '0') : String(index + 1).padStart(2, '0');
                            const copyCodeStr = inst.copyCode || inst.copy_code || (String(rawNo).includes('-C') ? String(rawNo) : `${edCode}-C${paddedNo}`);
                            const deptName = inst.department || inst.target_department || inst.holder_dept || '-';
                            const holderName = inst.holder || inst.custodian || inst.holder_name || inst.recipient || inst.received_by || '';
                            const locationName = inst.location || inst.locationName || inst.station_name || 'จุดใช้งานหลัก';
                            const receiptDate = inst.receipt_confirmed_at || inst.received_at || inst.receivedDate || inst.dateIssued || inst.issued_at || inst.created_at || '-';
                            const isPending = inst.status === 'PENDING_RECALL' || inst.status === 'SUPERSEDED_PENDING_RECALL' || inst.status === 'OBSOLETE_PENDING_RECALL';
                            const isDestroyed = inst.status === 'DESTROYED' || inst.status === 'RECALLED_DESTROYED';
                            const isRecalled = inst.status === 'RECALLED' || inst.status === 'ARCHIVED_OBSOLETE';

                            return (
                              <tr key={inst.copyCode || inst.id || index} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-3 text-center font-mono font-bold text-[#0D99FF] whitespace-nowrap">
                                  {copyCodeStr}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-bold text-slate-700">{deptName}</div>
                                  {holderName && (
                                    <div className="text-[11px] text-slate-500">{holderName}</div>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-slate-600">
                                  <div className="flex items-center gap-1.5">
                                    <MapPin size={13} className="text-slate-400 shrink-0" />
                                    <span>{locationName}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  {isPending ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300 shadow-2xs">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                      รอเรียกคืน (PENDING_RECALL)
                                    </span>
                                  ) : isDestroyed ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300 shadow-2xs">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                      ทำลายแล้ว (DESTROYED)
                                    </span>
                                  ) : isRecalled ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                      เรียกคืนแล้ว (RECALLED)
                                    </span>
                                  ) : (
                                    <StatusBadge status={inst.status} />
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                  {(isDestroyed || isRecalled) ? (
                                    <div>
                                      <div className="font-bold text-slate-800">
                                        {inst.dateDestroyed || inst.dateRecalled || (inst.recalled_at ? inst.recalled_at.split('T')[0] : '-')}
                                      </div>
                                      <div className="text-[10px] text-slate-500 font-sans">
                                        โดย {inst.recalled_by || inst.recalledBy || inst.disposed_by_name || 'DCC'}
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div>{receiptDate && receiptDate !== '-' ? String(receiptDate).split('T')[0] : '-'}</div>
                                      <div className="text-[10px] text-slate-400 font-sans">ตรวจรับเข้าจุดใช้งาน</div>
                                    </div>
                                  )}
                                </td>
                                {isDccAdmin && (
                                  <td className="py-3 px-3 text-center">
                                    {isPending ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedCopiesForDisposition([inst]);
                                          setIsDispositionModalOpen(true);
                                        }}
                                        className="px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold flex items-center gap-1 mx-auto transition-colors cursor-pointer"
                                        title="บันทึกการเรียกคืน/ทำลายสำเนานี้"
                                      >
                                        <Flame size={12} />
                                        <span>จัดการ</span>
                                      </button>
                                    ) : (
                                      <span className="text-slate-300 font-mono text-xs">-</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={isDccAdmin ? 6 : 5} className="py-8 text-center text-slate-400">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <Layers size={24} className="text-slate-300" />
                                <p className="text-xs">ยังไม่มีการแจกจ่ายสำเนาควบคุมสำหรับเอกสารฉบับนี้</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'reviews' && <ExternalReviewHistoryTab doc={liveDoc} />}

            {/* Tab 2: Version & Edition Lineage (Pinned Active Card + Compact Collapsible Timeline) */}
            {activeTab === 'lineage' && (
              <div className="py-1 space-y-5">
                {familyEditions.length > 0 ? (
                  <>
                    {/* 1. การ์ดฉบับปัจจุบัน (Pinned Active Card) */}
                    {sortedHistory.activeVersion && (() => {
                      const activeVer = sortedHistory.activeVersion;
                      const activeVerStr = cleanVersion(activeVer.sourceVersion || activeVer.edition || activeVer.ver_ed || activeVer.rev);
                      const activeReqRef = activeVer.edrNumber || activeVer.requestNo || activeVer.request_no || activeVer.requestId || activeVer.darNo || activeVer.dar_no || activeVer.registeredByRequestId || '-';
                      const activeStartDate = activeVer.effectiveDate || activeVer.effective_date || activeVer.issueDate || activeVer.createdAt
                        ? fmtDate(activeVer.effectiveDate || activeVer.effective_date || activeVer.issueDate || activeVer.createdAt)
                        : '-';
                      const activeSource = activeVer.issuer || activeVer.officialIssuer || activeVer.source || currentDoc.source || activeVer.department || currentDoc.department || '-';
                      const activeReason = activeVer.changeReason || activeVer.reason || activeVer.changeDetails || activeVer.remarks || activeVer.description;

                      return (
                        <div className="mb-5 p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-slate-800 text-sm">
                                Edition {activeVerStr}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ใช้งานปัจจุบัน
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPreviewEditionDoc(withEditionFile(activeVer))}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                                title="เปิดดูตัวอย่างเอกสารฉบับปัจจุบัน"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>ดูเอกสาร</span>
                              </button>
                              <button
                                type="button"
                                disabled={isDownloading}
                                onClick={() => handleDownloadEditionPdf(activeVer)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer disabled:opacity-50"
                                title="ดาวน์โหลด PDF ฉบับปัจจุบัน"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>ดาวน์โหลด</span>
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600 mt-3 pt-3 border-t border-emerald-100">
                            <div>
                              <span className="text-slate-400">ช่วงเวลา: </span>
                              <span className="font-mono font-medium text-slate-800">{activeStartDate} → ปัจจุบัน</span>
                            </div>
                            <div>
                              <span className="text-slate-400">เลขอ้างอิง: </span>
                              <span className="font-mono font-medium text-slate-800">{activeReqRef}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">แหล่งที่มา: </span>
                              <span className="font-medium text-slate-800">{activeSource}</span>
                            </div>
                          </div>
                          {activeReason && activeReason !== '-' && (
                            <div className="mt-2.5 pt-2 border-t border-emerald-100/70 text-[11px] text-slate-600">
                              <span className="text-slate-400">หมายเหตุ: </span>
                              <span>{activeReason}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* 2. รายการฉบับตกรุ่น (Compact Superseded List พร้อม Toggle) */}
                    {sortedHistory.supersededList.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-500 px-1">
                          <span>ประวัติฉบับตกรุ่น ({sortedHistory.supersededList.length} รายการ)</span>
                        </div>

                        {sortedHistory.supersededList
                          .slice(0, isExpanded ? undefined : 3)
                          .map((item, idx) => {
                            const isDocObs = Boolean(
                              item.status === 'OBSOLETE' ||
                              item.status === 'OBSOLETE_ARCHIVED' ||
                              item.is_obsolete
                            );
                            const vStr = cleanVersion(item.sourceVersion || item.edition || item.ver_ed || item.rev);
                            const reqRef = item.edrNumber || item.requestNo || item.request_no || item.requestId || item.darNo || item.dar_no || item.obsoletedByRequestId || item.registeredByRequestId || '-';
                            const reasonText = item.changeReason || item.reason || item.changeDetails || item.obsoleteReason || item.archivedReason || item.remarks || item.description;
                            const startDate = item.effectiveDate || item.effective_date || item.issueDate || item.createdAt
                              ? fmtDate(item.effectiveDate || item.effective_date || item.issueDate || item.createdAt)
                              : '-';
                            const endDate = isDocObs
                              ? (item.obsoletedAt || item.obsoleteDate ? fmtDate(item.obsoletedAt || item.obsoleteDate) : 'สิ้นสุดการใช้งาน')
                              : (item.supersededAt || item.superseded_at || item.supersededDate ? fmtDate(item.supersededAt || item.superseded_at || item.supersededDate) : 'ตกรุ่น');
                            const itemSource = item.issuer || item.officialIssuer || item.source || currentDoc.source || item.department || currentDoc.department || '-';

                            return (
                              <div
                                key={item.id || idx}
                                className="p-3 bg-white rounded-xl border border-slate-200 text-xs hover:border-slate-300 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-semibold text-slate-700">
                                      Edition {vStr}
                                    </span>
                                    {isDocObs ? (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                        ยกเลิกถาวร (Obsolete)
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                                        ตกรุ่น (Superseded)
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setPreviewEditionDoc(withEditionFile(item))}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 rounded-lg transition-colors cursor-pointer"
                                      title="ดูเอกสารฉบับตกรุ่น"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>ดูเอกสาร</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDownloading}
                                      onClick={() => handleDownloadEditionPdf(item)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                      title="ดาวน์โหลดเอกสารฉบับตกรุ่น"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>ดาวน์โหลด</span>
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                                  <span>บังคับใช้: <strong className="font-mono font-medium text-slate-700">{startDate} → {endDate}</strong></span>
                                  <span>เลขอ้างอิง: <strong className="font-mono font-medium text-slate-700">{reqRef}</strong></span>
                                  <span>แหล่งที่มา: <strong className="font-medium text-slate-700">{itemSource}</strong></span>
                                  {reasonText && reasonText !== '-' && <span>หมายเหตุ: {reasonText}</span>}
                                </div>
                              </div>
                            );
                          })}

                        {sortedHistory.supersededList.length > 3 && (
                          <button
                            type="button"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="w-full py-2 text-center text-xs font-medium text-sky-600 hover:bg-sky-50 rounded-lg border border-dashed border-sky-200 transition-colors cursor-pointer"
                          >
                            {isExpanded ? '▲ ซ่อนประวัติเก่า' : `▼ ดูประวัติฉบับตกรุ่นเพิ่มเติม (${sortedHistory.supersededList.length - 3} รายการ)`}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    ไม่พบประวัติเวอร์ชันอื่นในระบบสำหรับเอกสารนี้
                  </div>
                )}
              </div>
            )}


          </div>
        </motion.div>
      </div>

      {/* Embedded Preview Modal for Any Edition */}
      {previewEditionDoc && (
        <ExternalDocPreviewModal
          isOpen={Boolean(previewEditionDoc)}
          onClose={() => setPreviewEditionDoc(null)}
          document={previewEditionDoc}
        />
      )}

      {/* Embedded Request Additional Copies Modal */}
      {isRequestCopiesOpen && (
        <RequestAdditionalCopiesModal
          isOpen={isRequestCopiesOpen}
          onClose={() => setIsRequestCopiesOpen(false)}
          document={{
            ...currentDoc,
            id: currentDoc.id,
            edCode,
            doc_code: edCode,
            code: edCode,
            title: docTitle,
            doc_title: docTitle,
            name: docTitle,
            sourceVersion: currentDoc.sourceVersion || currentDoc.edition || versionNum || '01',
            edition: currentDoc.edition || currentDoc.sourceVersion || versionNum || '01',
            rev: currentDoc.rev || currentDoc.sourceVersion || versionNum || '01',
            department: currentDoc.department || uDept,
            is_external: true,
            doc_type: 'EXTERNAL'
          }}
        />
      )}

      {/* Embedded External Copy Disposition Modal */}
      {isDispositionModalOpen && (
        <ExternalCopyDispositionModal
          isOpen={isDispositionModalOpen}
          onClose={() => {
            setIsDispositionModalOpen(false);
            setSelectedCopiesForDisposition([]);
          }}
          document={currentDoc}
          copies={selectedCopiesForDisposition.length > 0 ? selectedCopiesForDisposition : ccInstances}
        />
      )}
    </AnimatePresence>
  );
};

export default ExternalDocDetailModal;
