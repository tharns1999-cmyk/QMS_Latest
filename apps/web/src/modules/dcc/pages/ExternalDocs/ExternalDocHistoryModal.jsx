import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  History, 
  FileText, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  Download, 
  Layers, 
  Building2, 
  Calendar, 
  ArrowRight,
  ShieldAlert,
  Archive,
  Tag,
  FileSpreadsheet,
  ChevronDown,
  Flame,
  Check,
  Info
} from 'lucide-react';
import useStore from '../../../../store/useStore';
import UniversalWatermarkService, { WATERMARK_TYPES } from '../../services/UniversalWatermarkService';
import ExternalCopyDispositionModal from './ExternalCopyDispositionModal';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const ExternalDocHistoryModal = ({ 
  isOpen, 
  onClose, 
  docCode: initialDocCode,
  document: doc,
  onViewActiveDoc
}) => {
  const navigate = useNavigate();
  const { 
    externalDocuments, 
    externalRequests,
    currentUser, 
    controlledCopyInstances, 
    documentControlledCopies,
    externalAuditTrail,
    logExternalDownload 
  } = useStore();

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isDispositionModalOpen, setIsDispositionModalOpen] = useState(false);
  const [selectedDocForDisposition, setSelectedDocForDisposition] = useState(null);
  const [selectedCopiesForDisposition, setSelectedCopiesForDisposition] = useState([]);

  const isDccAdmin = Boolean(
    currentUser?.role === 'DCC' || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.isDccAdmin || 
    currentUser?.isDcc || 
    currentUser?.role === 'ADMIN'
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.export-history-dock')) {
        setIsExportDropdownOpen(false);
      }
    };
    if (isExportDropdownOpen) {
      window.addEventListener('click', handleOutsideClick);
    }
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [isExportDropdownOpen]);

  // Normalize document code
  const targetCode = useMemo(() => {
    if (initialDocCode) return String(initialDocCode).trim();
    if (!doc) return '';
    return String(doc.documentCode || doc.edCode || doc.doc_code || doc.docCode || doc.docNo || doc.id || '').trim();
  }, [initialDocCode, doc]);

  // Retrieve all related revisions for this document code
  const allLineageDocs = useMemo(() => {
    if (!targetCode) return doc ? [doc] : [];
    const upperTarget = targetCode.toUpperCase();

    const matched = (externalDocuments || []).filter(d => {
      const c = String(d.documentCode || d.edCode || d.doc_code || d.docCode || d.docNo || d.id || '').trim().toUpperCase();
      if (c === upperTarget) return true;
      if (c.startsWith(`${upperTarget}-R`) || c.startsWith(`${upperTarget}_R`) || c.startsWith(`${upperTarget}-SUPERSEDED`)) return true;
      if (String(d.id || '').toUpperCase().startsWith(upperTarget)) return true;
      if (doc?.id && (d.previousDocId === doc.id || d.supersededByDocId === doc.id)) return true;
      if (doc?.previousDocId && (d.id === doc.previousDocId || d.previousDocId === doc.previousDocId)) return true;
      if (doc?.title && String(d.title || '').trim().toLowerCase() === String(doc.title).trim().toLowerCase()) return true;
      return false;
    });

    // Make sure current doc is included if not found
    if (doc && !matched.some(d => d.id === doc.id)) {
      matched.push(doc);
    }

    const uniqueMap = new Map();
    matched.forEach(d => uniqueMap.set(d.id, d));
    const list = Array.from(uniqueMap.values());

    // Sort descending: Active first, then reverse chronological by effective/superseded/created date or EDR/DAR request number
    return list.sort((a, b) => {
      const isActiveA = (a.status === 'ACTIVE' || a.status === 'EFFECTIVE') && !a.is_superseded && !a.is_obsolete && a.status !== 'SUPERSEDED' && a.status !== 'OBSOLETE';
      const isActiveB = (b.status === 'ACTIVE' || b.status === 'EFFECTIVE') && !b.is_superseded && !b.is_obsolete && b.status !== 'SUPERSEDED' && b.status !== 'OBSOLETE';
      if (isActiveA && !isActiveB) return -1;
      if (!isActiveA && isActiveB) return 1;

      if ((a.supersededByDocId && String(a.supersededByDocId) === String(b.id)) || (b.previousDocId && String(b.previousDocId) === String(a.id))) return 1;
      if ((b.supersededByDocId && String(b.supersededByDocId) === String(a.id)) || (a.previousDocId && String(a.previousDocId) === String(b.id))) return -1;

      const effA = new Date(a.effective_date || a.effectiveDate || a.issueDate || a.createdAt || a.supersededAt || a.supersededDate || a.obsoleteDate || 0).getTime() || 0;
      const effB = new Date(b.effective_date || b.effectiveDate || b.issueDate || b.createdAt || b.supersededAt || b.supersededDate || b.obsoleteDate || 0).getTime() || 0;
      if (effB !== effA) return effB - effA;

      const supA = new Date(a.supersededAt || a.supersededDate || a.obsoleteDate || a.updatedAt || 0).getTime() || 0;
      const supB = new Date(b.supersededAt || b.supersededDate || b.obsoleteDate || b.updatedAt || 0).getTime() || 0;
      if (supB !== supA) return supB - supA;

      const reqA = String(a.request_no || a.requestNo || a.edrNumber || a.requestId || a.dar_no || a.darNo || '');
      const reqB = String(b.request_no || b.requestNo || b.edrNumber || b.requestId || b.dar_no || b.darNo || '');
      return reqB.localeCompare(reqA, undefined, { numeric: true });
    });
  }, [externalDocuments, targetCode, doc]);

  // Primary active document if exists
  const activeDoc = useMemo(() => {
    return allLineageDocs.find(d => 
      (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') && 
      !d.is_superseded && 
      !d.is_obsolete && 
      d.status !== 'SUPERSEDED' && 
      d.status !== 'OBSOLETE'
    );
  }, [allLineageDocs]);

  // Historical documents list (Superseded or Obsolete)
  const historicalDocs = useMemo(() => {
    const hist = allLineageDocs.filter(d => 
      d.status === 'SUPERSEDED' || 
      d.status === 'SUPERSEDED_ARCHIVED' || 
      d.is_superseded || 
      d.status === 'OBSOLETE' || 
      d.status === 'OBSOLETE_ARCHIVED' || 
      d.is_obsolete
    );
    // If none marked as historical yet, display all except activeDoc if available
    if (hist.length === 0) {
      return allLineageDocs.filter(d => d.id !== activeDoc?.id);
    }
    return hist;
  }, [allLineageDocs, activeDoc]);

  // Synchronized controlled copies pool
  const allCopies = useMemo(() => {
    return (controlledCopyInstances && controlledCopyInstances.length > 0)
      ? controlledCopyInstances
      : (documentControlledCopies || []);
  }, [controlledCopyInstances, documentControlledCopies]);

  // Retrieve controlled copies specific to each revision
  const getCopiesForRevision = (revDoc) => {
    if (!revDoc) return [];
    const revId = String(revDoc.id || '');
    const code = String(revDoc.edCode || revDoc.doc_code || revDoc.docNo || targetCode || '').trim().toUpperCase();
    const docRev = String(revDoc.rev || '').trim();

    return allCopies.filter(c => {
      const matchDocId = String(c.externalDocId || c.external_doc_id || c.docId || c.doc_id) === revId;
      const copyCode = String(c.doc_code || c.docCode || c.edCode || '').trim().toUpperCase();
      const copyRev = String(c.rev || c.version || '').trim();
      const matchCodeAndRev = copyCode === code && (!docRev || !copyRev || copyRev === docRev);
      return matchDocId || matchCodeAndRev;
    });
  };

  // Safe Request-to-Revision Traceability Resolver (ISO 9001 Compliance)
  const getRequestForRevision = (revDoc) => {
    if (!revDoc) return null;
    const reqs = externalRequests || [];
    const docRevNum = parseInt(String(revDoc.rev || revDoc.revision || '0').replace(/\D/g, ''), 10);
    const docCode = String(revDoc.documentCode || revDoc.edCode || revDoc.doc_code || revDoc.docCode || revDoc.docNo || targetCode || '').trim().toUpperCase();

    // Helper to check if a request revision matches docRevNum
    const doesRequestRevisionMatch = (r) => {
      const rTargetRev = String(r.targetRevision || '').replace(/\D/g, '');
      const rRev = String(r.rev || '').replace(/\D/g, '');
      const rRevision = String(r.revision || '').replace(/\D/g, '');
      if (rTargetRev && parseInt(rTargetRev, 10) === docRevNum) return true;
      if (rRev && parseInt(rRev, 10) === docRevNum) return true;
      if (rRevision && parseInt(rRevision, 10) === docRevNum) return true;
      if (docRevNum === 0 && (r.type === 'NEW' || r.requestType === 'NEW' || r.actionType === 'NEW')) return true;
      return false;
    };

    // 1. Direct match by exact requestId or edrNumber (verifying revision compatibility)
    if (revDoc.requestId || revDoc.edrNumber) {
      const directMatch = reqs.find(r => 
        r.id === revDoc.requestId || 
        r.requestId === revDoc.requestId ||
        r.requestNo === revDoc.edrNumber || 
        r.edrNumber === revDoc.edrNumber ||
        (revDoc.requestNo && (r.requestNo === revDoc.requestNo || r.edrNumber === revDoc.requestNo))
      );
      if (directMatch && doesRequestRevisionMatch(directMatch)) return directMatch;
    }

    // 2. Direct match by docId / externalDocId
    if (revDoc.id) {
      const idMatch = reqs.find(r => 
        r.docId === revDoc.id || r.externalDocId === revDoc.id || r.documentId === revDoc.id
      );
      if (idMatch && doesRequestRevisionMatch(idMatch)) return idMatch;
    }

    // 3. Match by documentCode + exact revision number
    const revMatch = reqs.find(r => {
      const rDocCode = String(r.documentCode || r.edCode || r.doc_code || r.docCode || '').trim().toUpperCase();
      if (rDocCode !== docCode) return false;
      return doesRequestRevisionMatch(r);
    });
    if (revMatch) return revMatch;

    // 4. Fallback for initial registration (Rev.00) matching NEW request
    if (docRevNum === 0) {
      return reqs.find(r => {
        const rDocCode = String(r.documentCode || r.edCode || r.doc_code || r.docCode || '').trim().toUpperCase();
        return rDocCode === docCode && (r.type === 'NEW' || r.requestType === 'NEW' || r.actionType === 'NEW');
      }) || null;
    }

    return null;
  };

  // Representative metadata
  const primaryDoc = activeDoc || allLineageDocs[0] || doc || {};
  const docTitle = primaryDoc.title || primaryDoc.docTitle || primaryDoc.name || 'เอกสารภายนอก';
  const docDept = primaryDoc.department || primaryDoc.dept || 'QA';
  const docIssuer = primaryDoc.issuer || primaryDoc.officialIssuer || primaryDoc.source || 'หน่วยงานภายนอก';

  // Audit trail logs for this doc
  const auditLogs = useMemo(() => {
    return (externalAuditTrail || [])
      .filter(log => 
        log.docId === primaryDoc.id || 
        log.docCode === targetCode || 
        allLineageDocs.some(d => d.id === log.docId)
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [externalAuditTrail, primaryDoc.id, targetCode, allLineageDocs]);

  // Handle Historical Watermarked PDF Download
  const handleDownloadHistoricalPdf = async (item) => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadingDocId(item.id);

    const isObs = item.status === 'OBSOLETE' || item.status === 'OBSOLETE_ARCHIVED' || item.is_obsolete;
    const watermarkPreset = isObs ? WATERMARK_TYPES.OBSOLETE : WATERMARK_TYPES.SUPERSEDED;
    const edLabel = item.sourceVersion || item.edition || 'ฉบับประวัติ';

    const toastId = toast.loading(`กำลังประทับลายน้ำเอกสารย้อนหลัง ${currentDocCode} (${edLabel})...`);

    try {
      await UniversalWatermarkService.downloadWatermarkedPdf(
        {
          id: item.id,
          title: currentDocCode,
          name: item.title || docTitle,
          docTitle: item.title || docTitle,
          status: isObs ? 'OBSOLETE' : 'SUPERSEDED',
          isExternal: true,
          ...item
        },
        watermarkPreset,
        {
          userName: currentUser?.name || 'User',
          userDept: currentUser?.department || 'QA',
          reason: `Historical Document Access (${isObs ? 'OBSOLETE' : 'SUPERSEDED'})`,
          location: currentUser?.department || 'QA',
          watermarkType: watermarkPreset,
          isRestricted: item.accessScope === 'Restricted',
          accessScope: item.accessScope,
          supersededByRev: item.supersededByRev || item.superseded_by_edition || activeDoc?.sourceVersion || 'Latest',
          obsoleteDate: item.obsoleteDate || item.supersededAt || '-'
        },
        false
      );

      toast.dismiss(toastId);
      toast.success(`ดาวน์โหลดเอกสารประวัติ ${currentDocCode} (${edLabel}) สำเร็จ`);

      if (logExternalDownload) {
        logExternalDownload(item.id);
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.dismiss(toastId);
      toast.error('เกิดข้อผิดพลาดในการดาวน์โหลดเอกสารย้อนหลัง');
    } finally {
      setIsDownloading(false);
      setDownloadingDocId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Phase 2 & 3: Revision History Data Mapping & Export Engine
  // ─────────────────────────────────────────────────────────────
  const prepareExportData = () => {
    // Sort all revisions descending by revision
    const sortedAllRevisions = [...allLineageDocs].sort((a, b) => {
      const revA = parseInt(String(a.rev || '0').replace(/\D/g, ''), 10) || 0;
      const revB = parseInt(String(b.rev || '0').replace(/\D/g, ''), 10) || 0;
      if (revB !== revA) return revB - revA;
      const dateA = new Date(a.effectiveDate || a.createdAt || 0);
      const dateB = new Date(b.effectiveDate || b.createdAt || 0);
      return dateB - dateA;
    });

    const exportTimestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');

    return sortedAllRevisions.map((item) => {
      const isObs = item.status === 'OBSOLETE' || item.status === 'OBSOLETE_ARCHIVED' || item.is_obsolete;
      const isSuper = item.status === 'SUPERSEDED' || item.status === 'SUPERSEDED_ARCHIVED' || item.is_superseded;
      const isActive = !isObs && !isSuper && (item.status === 'ACTIVE' || item.status === 'EFFECTIVE');

      let statusLabel = 'ตกรุ่น (SUPERSEDED)';
      if (isActive) statusLabel = 'ใช้งานปัจจุบัน (ACTIVE)';
      else if (isObs) statusLabel = 'ยกเลิกถาวร (OBSOLETE)';

      const edLabel = item.sourceVersion || item.edition || 'ฉบับแรก';
      const matchedReq = getRequestForRevision(item);
      const reqNumber = matchedReq?.requestNo || matchedReq?.edrNumber || 
        ((item.edrNumber && item.edrNumber !== item.supersededByEdrNumber) ? item.edrNumber : null) || 
        ((item.requestId && item.requestId !== item.supersededByRequestId) ? item.requestId : null) || 
        item.edrNumber || item.requestId || item.requestNo || '-';

      const reasonText = (matchedReq?.reason || matchedReq?.changeReason) || 
        (item.changeReason && item.changeReason !== '-' ? item.changeReason : null) || 
        item.changeReason || '-';
      
      const obsoleteOrSupersededDate = item.supersededAt 
        ? dayjs(item.supersededAt).format('YYYY-MM-DD') 
        : (item.supersededDate || item.obsoleteDate || (isActive ? 'ปัจจุบัน (ยังใช้งาน)' : '-'));

      const copies = getCopiesForRevision(item);
      let copySummary = 'ไม่มีการแจกจ่ายเล่มสำเนาควบคุม (Digital Only)';
      if (copies.length > 0) {
        const recalledCount = copies.filter(c => c.status === 'RECALLED' || c.status === 'RECEIVED_AT_DCC').length;
        const destroyedCount = copies.filter(c => c.status === 'RECALLED_DESTROYED' || c.status === 'DESTROYED').length;
        copySummary = `ทั้งหมด ${copies.length} เล่ม (เรียกคืนแล้ว: ${recalledCount}, ทำลายแล้ว: ${destroyedCount})`;
      }

      return {
        'รหัสเอกสาร (Document Code)': targetCode || item.edCode || item.doc_code || item.id || '-',
        'ชื่อเอกสารทางการ (Document Title)': item.title || docTitle || '-',
        'แผนกผู้รับผิดชอบ (Department)': item.department || item.dept || docDept || '-',
        'หน่วยงานผู้ออกเอกสาร (Official Issuer / Source)': item.issuer || item.officialIssuer || item.source || docIssuer || '-',
        'เวอร์ชันต้นทาง (Edition / Version)': edLabel,
        'สถานะฉบับ (Status)': statusLabel,
        'เลขที่คำร้องที่เกี่ยวข้อง (EDR Reference No.)': reqNumber,
        'วันที่มีผลบังคับใช้ (Effective Date)': item.effectiveDate || '-',
        'วันที่ปลดระวาง/ตกรุ่น (Superseded/Obsolete Date)': obsoleteOrSupersededDate,
        'ผู้ยื่นคำร้อง (Requester)': matchedReq?.requesterName || item.requesterName || '-',
        'ผู้ทบทวน (Reviewer)': matchedReq?.reviewerName || item.reviewerName || '-',
        'ผู้อนุมัติ (Approver)': matchedReq?.approverName || item.approverName || '-',
        'เหตุผลการปรับปรุง / บันทึกการเปลี่ยนแปลง (Change Log & Revision Reason)': reasonText,
        'จำนวนสำเนาควบคุมและการเรียกคืน (Controlled Copies Disposition Summary)': copySummary,
        'วันและเวลาที่พิมพ์รายงาน (Export Timestamp)': exportTimestamp
      };
    });
  };

  const saveAsFile = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSV Export with UTF-8 BOM Header (\uFEFF)
  const handleExportCsv = () => {
    const data = prepareExportData();
    if (!data || data.length === 0) {
      toast.error('ไม่พบข้อมูลประวัติเอกสารสำหรับส่งออก');
      return;
    }

    try {
      const sanitizedCode = (targetCode || 'DOC').replace(/[/\\?%*:|"<>]/g, '-');
      const timestamp = dayjs().format('YYYYMMDD_HHmm');
      const fileName = `ED_History_${sanitizedCode}_${timestamp}`;

      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
        ...data.map(row => 
          headers.map(fieldName => {
            const val = row[fieldName] ?? '';
            const escaped = String(val).replace(/"/g, '""');
            return `"${escaped}"`;
          }).join(',')
        )
      ];

      // ใส่ BOM (\uFEFF) นำหน้าเสมอ เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง 100%
      const csvString = '\uFEFF' + csvRows.join('\r\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      saveAsFile(blob, `${fileName}.csv`);

      toast.success(`ส่งออกประวัติเอกสาร ${targetCode} เรียบร้อยแล้ว`);
      setIsExportDropdownOpen(false);
    } catch (error) {
      console.error('Export to CSV error:', error);
      toast.error('เกิดข้อผิดพลาดในการส่งออกไฟล์ CSV');
    }
  };

  // Excel (.xlsx) Export using SheetJS binary ArrayBuffer
  const handleExportExcel = () => {
    const data = prepareExportData();
    if (!data || data.length === 0) {
      toast.error('ไม่พบข้อมูลประวัติเอกสารสำหรับส่งออก');
      return;
    }

    try {
      const sanitizedCode = (targetCode || 'DOC').replace(/[/\\?%*:|"<>]/g, '-');
      const timestamp = dayjs().format('YYYYMMDD_HHmm');
      const fileName = `ED_History_${sanitizedCode}_${timestamp}`;

      const worksheet = XLSX.utils.json_to_sheet(data);

      // ตั้งความกว้างคอลัมน์อัตโนมัติให้อ่านง่าย
      const colWidths = Object.keys(data[0] || {}).map(key => {
        const maxContentLen = Math.max(
          ...data.map(row => String(row[key] ?? '').length),
          key.length
        );
        return {
          wch: Math.min(Math.max(maxContentLen + 3, 15), 55)
        };
      });
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Revision History');

      // สำคัญ: ต้องใช้ type: 'array' เพื่อให้ได้ Uint8Array ที่เป็น Valid Zip Archive
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });

      saveAsFile(blob, `${fileName}.xlsx`);

      toast.success(`ส่งออกประวัติเอกสาร ${targetCode} เรียบร้อยแล้ว`);
      setIsExportDropdownOpen(false);
    } catch (error) {
      console.error('Export to Excel error:', error);
      toast.error('เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0"
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 15 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 my-auto"
        >
          {/* ───────────────────────────────────────────────────────────── */}
          {/* 1. Header Section */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="bg-white px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 shadow-2xs">
                <History size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-bold text-sm text-[#0D99FF] bg-[#E5F4FF] border border-[#B8E1FF] px-2.5 py-0.5 rounded-md inline-block shadow-2xs">
                    {targetCode || 'ED-DOC'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100/80 text-amber-900 border border-amber-300 shadow-2xs flex items-center gap-1">
                    <Clock size={12} />
                    <span>ประวัติเอกสารตกรุ่น/ยกเลิก (Superseded History)</span>
                  </span>
                </div>
                <h2 className="text-slate-900 font-bold text-base sm:text-lg tracking-tight mt-1 truncate max-w-xl" title={docTitle}>
                  {docTitle}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 relative export-history-dock">
              {/* Phase 1: Export History Bento Pill Button with Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 active:scale-[0.98] text-xs font-bold transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                  title="ส่งออกประวัติเอกสาร (Export Revision History)"
                >
                  <FileSpreadsheet size={15} className="text-emerald-600" />
                  <span className="hidden sm:inline">ส่งออกประวัติ (Export)</span>
                  <ChevronDown size={13} className={`text-slate-400 transition-transform duration-150 ${isExportDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isExportDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-1.5 text-left animate-in fade-in zoom-in-95 duration-150 divide-y divide-slate-100">
                    <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      เลือกรูปแบบไฟล์ (Export Format)
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        className="w-full px-3.5 py-2 text-xs text-slate-700 hover:text-emerald-700 hover:bg-emerald-50/70 flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
                      >
                        <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
                        <div className="text-left">
                          <div className="font-bold text-slate-800">ดาวน์โหลดเป็น Excel (.xlsx)</div>
                          <div className="text-[10px] text-slate-400">ไฟล์ Excel แท้ (.xlsx) จัดตารางอ่านง่าย</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportCsv}
                        className="w-full px-3.5 py-2 text-xs text-slate-700 hover:text-blue-700 hover:bg-blue-50/70 flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
                      >
                        <Download size={16} className="text-blue-600 shrink-0" />
                        <div className="text-left">
                          <div className="font-bold text-slate-800">ดาวน์โหลดเป็น CSV (.csv)</div>
                          <div className="text-[10px] text-slate-400">UTF-8 BOM ป้องกันภาษาไทยเพี้ยน</div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Close Button */}
              <button 
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors outline-none cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* Scrollable Modal Body */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-[#F8FAFC] custom-scrollbar">
            {/* ───────────────────────────────────────────────────────────── */}
            {/* 2. Active Reference Banner (แบนเนอร์ชี้เป้าฉบับปัจจุบัน) */}
            {/* ───────────────────────────────────────────────────────────── */}
            {activeDoc ? (
              <div className="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                        ฉบับใช้งานปัจจุบัน (Current Active Edition):
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-900 bg-white px-2 py-0.5 rounded-md border border-emerald-300 shadow-2xs">
                        {activeDoc.sourceVersion || activeDoc.edition || 'ฉบับปัจจุบัน'}
                      </span>
                      {(() => {
                        const activeReq = getRequestForRevision(activeDoc);
                        const activeReqNo = activeReq?.requestNo || activeReq?.edrNumber || activeDoc.edrNumber || activeDoc.requestId;
                        if (!activeReqNo) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              onClose?.();
                              navigate(`/dcc/external/requests/${encodeURIComponent(activeReqNo)}`);
                            }}
                            className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-white/90 hover:bg-white px-2 py-0.5 rounded-md border border-emerald-300 hover:border-emerald-400 transition-all cursor-pointer shadow-2xs"
                            title="คลิกเพื่อดูรายละเอียดคำร้องฉบับนี้"
                          >
                            <FileText size={11} className="text-emerald-600" />
                            <span>คำร้อง: {activeReqNo}</span>
                          </button>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      มีผลบังคับใช้เมื่อ <strong className="font-semibold">{activeDoc.effectiveDate || 'ตามประกาศ'}</strong> • เอกสารฉบับทางการล่าสุดในระบบ
                    </p>
                  </div>
                </div>

                {onViewActiveDoc && (
                  <button
                    type="button"
                    onClick={() => onViewActiveDoc(activeDoc)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
                  >
                    <span>เปิดดูฉบับปัจจุบัน</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-50/90 border border-rose-200 flex items-start sm:items-center gap-3.5 shadow-2xs">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <XCircle size={22} />
                </div>
                <div>
                  <div className="text-xs font-bold text-rose-950 flex items-center gap-2 flex-wrap">
                    <span>เอกสารรหัสนี้ถูกยกเลิกการใช้งานถาวรแล้วทั้งระบบ (All Editions Obsoleted)</span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-200 text-rose-900 border border-rose-300 font-mono">
                      OBSOLETE
                    </span>
                  </div>
                  <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                    ห้ามนำเอกสารฉบับนี้และฉบับย้อนหลังทั้งหมดไปใช้อ้างอิงในการปฏิบัติงานตามข้อกำหนดระบบบริหารคุณภาพ ISO 9001
                  </p>
                </div>
              </div>
            )}

            {/* Quick Metadata Bento Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Tag size={12} /> รหัสเอกสาร
                </div>
                <div className="text-xs font-mono font-bold text-slate-800 truncate">{targetCode}</div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Building2 size={12} /> แผนกเจ้าของ
                </div>
                <div className="text-xs font-bold text-slate-800 truncate">{docDept}</div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <History size={12} /> ประวัติฉบับย้อนหลัง
                </div>
                <div className="text-xs font-bold text-amber-700 font-mono">
                  {historicalDocs.length} ฉบับ
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Building2 size={12} /> ผู้ออกเอกสาร
                </div>
                <div className="text-xs font-bold text-slate-800 truncate" title={docIssuer}>
                  {docIssuer}
                </div>
              </div>
            </div>

            {/* ───────────────────────────────────────────────────────────── */}
            {/* 3. Revision History Timeline (การ์ดแสดงลำดับฉบับย้อนหลัง) */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 border-b border-slate-200 gap-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Clock size={16} className="text-amber-600" />
                  <span>ลำดับฉบับย้อนหลังและบันทึกการเปลี่ยนแปลง (Revision History Timeline)</span>
                </h3>
                <span className="text-xs font-mono text-slate-500 font-semibold">
                  เรียงจากฉบับล่าสุดลงไป
                </span>
              </div>

              {historicalDocs.length > 0 ? (
                <div className="relative space-y-5 before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-200 before:pointer-events-none">
                  {historicalDocs.map((item, idx) => {
                    const isObs = item.status === 'OBSOLETE' || item.status === 'OBSOLETE_ARCHIVED' || item.is_obsolete;
                    const copies = getCopiesForRevision(item);
                    const isDownloadingThis = isDownloading && downloadingDocId === item.id;
                    const matchedReq = getRequestForRevision(item);
                    const reqNumber = matchedReq?.requestNo || matchedReq?.edrNumber || 
                      ((item.edrNumber && item.edrNumber !== item.supersededByEdrNumber) ? item.edrNumber : null) || 
                      ((item.requestId && item.requestId !== item.supersededByRequestId) ? item.requestId : null) || 
                      item.edrNumber || item.requestId || item.requestNo || '-';

                    const reasonText = (matchedReq?.reason || matchedReq?.changeReason) || 
                      (item.changeReason && item.changeReason !== '-' ? item.changeReason : null) || 
                      item.changeReason || '-';

                    // Superseded or Obsolete Date
                    const obsoleteOrSupersededDate = item.supersededAt 
                      ? dayjs(item.supersededAt).format('YYYY-MM-DD') 
                      : (item.supersededDate || item.obsoleteDate || item.recalledDate || '-');

                    return (
                      <div key={item.id || idx} className="relative pl-12">
                        {/* Timeline Node Dot */}
                        <div className={`absolute left-3 top-4 w-4.5 h-4.5 rounded-full border-2 bg-white flex items-center justify-center -translate-x-1/2 shadow-xs ${
                          isObs ? 'border-rose-500' : 'border-amber-500'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${isObs ? 'bg-rose-500' : 'bg-amber-500'}`} />
                        </div>

                        {/* Bento Card for this Revision */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-4">
                          {/* Card Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                                ฉบับที่นำเข้า: {item.sourceVersion || item.edition || 'ฉบับต้นทาง'}
                              </span>

                              {isObs ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <Archive size={12} />
                                  <span>ยกเลิกถาวร (OBSOLETE)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock size={12} />
                                  <span>ฉบับตกรุ่น (SUPERSEDED)</span>
                                </span>
                              )}

                              {reqNumber !== '-' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose?.();
                                    navigate(`/dcc/external/requests/${encodeURIComponent(reqNumber)}`);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-mono font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 px-2 py-0.5 rounded-md transition-all cursor-pointer shadow-2xs"
                                  title="คลิกเพื่อดูรายละเอียดคำร้องฉบับนี้"
                                >
                                  <FileText size={11} className="text-blue-600" />
                                  <span>คำร้อง: {reqNumber}</span>
                                </button>
                              ) : (
                                <span className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded-md">
                                  คำร้อง: -
                                </span>
                              )}
                            </div>

                            {/* Historical File Download Button */}
                            <button
                              type="button"
                              disabled={isDownloading}
                              onClick={() => handleDownloadHistoricalPdf(item)}
                              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white text-xs font-bold transition-all flex items-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer self-start sm:self-auto"
                              title="ดาวน์โหลด PDF พร้อมประทับลายน้ำฉบับตกรุ่นสีแดง"
                            >
                              <Download size={14} className={isDownloadingThis ? 'animate-bounce' : ''} />
                              <span>{isDownloadingThis ? 'กำลังประทับลายน้ำ...' : 'ดาวน์โหลด PDF ย้อนหลัง (มีลายน้ำ)'}</span>
                            </button>
                          </div>

                          {/* Revision Meta Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
                              <div className="font-bold text-slate-600 flex items-center gap-1.5">
                                <Calendar size={13} className="text-slate-400" />
                                <span>ช่วงเวลาบังคับใช้ (Enforcement Period)</span>
                              </div>
                              <div className="font-mono text-slate-700 pl-5">
                                <span className="text-emerald-700 font-semibold">{item.effectiveDate || '-'}</span>
                                <span className="mx-2 text-slate-400">➔</span>
                                <span className={isObs ? 'text-rose-700 font-semibold' : 'text-amber-700 font-semibold'}>
                                  {obsoleteOrSupersededDate}
                                </span>
                              </div>
                            </div>

                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
                              <div className="font-bold text-slate-600 flex items-center gap-1.5">
                                <User size={13} className="text-slate-400" />
                                <span>ผู้ดำเนินการตามขั้นตอน QMS (Actors)</span>
                              </div>
                              <div className="text-slate-700 pl-5 flex flex-wrap gap-x-3 gap-y-1">
                                <span>ผู้ยื่น: <strong>{matchedReq?.requesterName || item.requesterName || '-'}</strong></span>
                                <span>•</span>
                                <span>ผู้ทบทวน: <strong>{matchedReq?.reviewerName || item.reviewerName || '-'}</strong></span>
                                <span>•</span>
                                <span>ผู้อนุมัติ: <strong>{matchedReq?.approverName || item.approverName || '-'}</strong></span>
                              </div>
                            </div>
                          </div>

                            {/* Reason / Change Log */}
                          <div className="p-3.5 bg-amber-50/40 border border-amber-200/60 rounded-xl text-xs space-y-1">
                            <div className="font-bold text-amber-900 flex items-center gap-1.5">
                              <FileText size={13} className="text-amber-700" />
                              <span>เหตุผลการปรับปรุง / บันทึกการเปลี่ยนแปลง (Change Log & Revision Reason):</span>
                            </div>
                            <p className="text-slate-700 pl-5 leading-relaxed">
                              {reasonText}
                            </p>
                          </div>

                          {/* Controlled Copies Disposition (สถานะการเรียกคืนสำเนาควบคุม) */}
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-bold text-slate-700 pb-1 border-b border-slate-100">
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Layers size={14} className="text-indigo-600" />
                                <span>สถานะการเรียกคืนสำเนาควบคุมประจำฉบับนี้ (Controlled Copies Disposition):</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-slate-500 font-semibold">
                                  {copies.length} เล่มที่บันทึก
                                </span>
                                {isDccAdmin && copies.some(c => c.status === 'PENDING_RECALL' || c.status === 'SUPERSEDED_PENDING_RECALL' || c.status === 'OBSOLETE_PENDING_RECALL') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const pendingList = copies.filter(c => c.status === 'PENDING_RECALL' || c.status === 'SUPERSEDED_PENDING_RECALL' || c.status === 'OBSOLETE_PENDING_RECALL');
                                      setSelectedDocForDisposition(item);
                                      setSelectedCopiesForDisposition(pendingList);
                                      setIsDispositionModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-98"
                                    title="เปิดหน้าต่างบันทึกการเรียกคืน/ทำลายสำเนาควบคุมสำหรับฉบับนี้"
                                  >
                                    <Flame size={12} />
                                    <span>บันทึกการเรียกคืน/ทำลายสำเนา</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                                  <tr>
                                    <th className="py-2 px-3 text-center w-24">หมายเลขเล่ม</th>
                                    <th className="py-2 px-3 w-28">แผนกผู้รับ</th>
                                    <th className="py-2 px-3">จุดติดตั้ง / จุดใช้งาน</th>
                                    <th className="py-2 px-3 text-center w-36">สถานะการเรียกคืน</th>
                                    <th className="py-2 px-3 text-center w-40">วันที่และผู้เรียกคืน/ทำลาย</th>
                                    {isDccAdmin && <th className="py-2 px-3 text-center w-16">จัดการ</th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {copies.length > 0 ? (
                                    copies.map((c, cIdx) => {
                                      const isPending = c.status === 'PENDING_RECALL' || c.status === 'SUPERSEDED_PENDING_RECALL' || c.status === 'OBSOLETE_PENDING_RECALL';
                                      const isDestroyed = c.status === 'RECALLED_DESTROYED' || c.status === 'DESTROYED';
                                      const isRecalled = c.status === 'RECALLED' || c.status === 'RECEIVED_AT_DCC' || c.status === 'ARCHIVED_OBSOLETE';
                                      const operatorName = c.recalled_by || c.recalledBy || c.disposed_by_name || null;
                                      const recallDateStr = c.dateDestroyed || c.dateRecalled || (c.recalled_at ? dayjs(c.recalled_at).format('YYYY-MM-DD') : (obsoleteOrSupersededDate !== '-' ? obsoleteOrSupersededDate : null));

                                      return (
                                        <tr key={c.id || cIdx} className="hover:bg-slate-50/70 transition-colors">
                                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                                            #{c.copyNumber || c.copyNo || `0${cIdx + 1}`}
                                          </td>
                                          <td className="py-2 px-3 font-semibold text-slate-700">
                                            {c.holder_dept || c.department || c.dept || docDept}
                                          </td>
                                          <td className="py-2 px-3 text-slate-600 truncate max-w-xs">
                                            {c.location || c.installationPoint || 'จุดใช้งานตามทะเบียนแจกจ่าย'}
                                          </td>
                                          <td className="py-2 px-3 text-center">
                                            {isPending ? (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                <span>รอเรียกคืน (PENDING_RECALL)</span>
                                              </span>
                                            ) : isDestroyed ? (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                                                <XCircle size={11} className="text-slate-500" />
                                                <span>ทำลายแล้ว (DESTROYED)</span>
                                              </span>
                                            ) : isRecalled ? (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                                <Check size={11} className="text-indigo-600" />
                                                <span>เรียกคืนแล้ว (RECALLED)</span>
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                {c.status || 'ACTIVE'}
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 text-center font-mono text-slate-500 text-[11px] whitespace-nowrap">
                                            {recallDateStr ? (
                                              <div>
                                                <div className="font-bold text-slate-700">{recallDateStr}</div>
                                                {operatorName && (
                                                  <div className="text-[10px] text-slate-400 font-sans">
                                                    โดย {operatorName}
                                                  </div>
                                                )}
                                              </div>
                                            ) : '-'}
                                          </td>
                                          {isDccAdmin && (
                                            <td className="py-2 px-3 text-center">
                                              {isPending ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedDocForDisposition(item);
                                                    setSelectedCopiesForDisposition([c]);
                                                    setIsDispositionModalOpen(true);
                                                  }}
                                                  className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                                  title="บันทึกการเรียกคืน/ทำลายเล่มนี้"
                                                >
                                                  <Flame size={11} />
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
                                      <td colSpan={isDccAdmin ? 6 : 5} className="py-3 px-4 text-center text-slate-400 italic">
                                        ไม่มีประวัติการพิมพ์เล่มสำเนาควบคุมแจกจ่ายสำหรับฉบับนี้ (Digital Distribution Only)
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-slate-400 space-y-1">
                  <Info size={28} className="mx-auto text-slate-300 mb-1" />
                  <p className="font-bold text-xs text-slate-700">ไม่พบข้อมูลประวัติฉบับย้อนหลัง</p>
                  <p className="text-xs text-slate-400">เอกสารรหัสนี้อาจเป็นฉบับแรก (Initial Edition) หรือยังไม่มีการตกรุ่น/ยกเลิก</p>
                </div>
              )}
            </div>

            {/* Collapsible System Audit Trail Logs (บันทึก Audit Trail ของระบบ) */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAuditLogs(!showAuditLogs)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert size={15} className="text-slate-500" />
                  <span>บันทึกประวัติการดำเนินการระบบ (System Audit Trail Logs)</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-mono">
                    {auditLogs.length} รายการ
                  </span>
                </div>
                <span className="text-slate-400 text-xs">{showAuditLogs ? 'ซ่อน ▲' : 'แสดง ▼'}</span>
              </button>

              {showAuditLogs && (
                <div className="mt-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5 whitespace-nowrap">วันและเวลา</th>
                          <th className="px-4 py-2.5 whitespace-nowrap">การกระทำ</th>
                          <th className="px-4 py-2.5 whitespace-nowrap">ผู้ดำเนินการ</th>
                          <th className="px-4 py-2.5">รายละเอียด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditLogs.length > 0 ? (
                          auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-slate-500 text-[11px]">
                                {dayjs(log.date).format('YYYY-MM-DD HH:mm')}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[11px] font-semibold text-slate-700">
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-800">
                                {log.actor || 'System'}
                              </td>
                              <td className="px-4 py-2.5 text-slate-600 leading-relaxed">
                                {log.details}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-slate-400">
                              ยังไม่มีบันทึก Audit Trail สำหรับเอกสารนี้
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* Modal Footer */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between rounded-b-3xl shrink-0">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>ระบบควบคุมการเข้าถึงเอกสารประวัติตามระเบียบปฏิบัติ QMS (ISO 9001:2015 Clause 7.5.3)</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors outline-none cursor-pointer shadow-2xs"
            >
              ปิดหน้าต่าง (Close)
            </button>
          </div>
        </motion.div>
      </div>

      {/* Embedded External Copy Disposition Modal */}
      {isDispositionModalOpen && (
        <ExternalCopyDispositionModal
          isOpen={isDispositionModalOpen}
          onClose={() => {
            setIsDispositionModalOpen(false);
            setSelectedDocForDisposition(null);
            setSelectedCopiesForDisposition([]);
          }}
          document={selectedDocForDisposition || doc}
          copies={selectedCopiesForDisposition}
        />
      )}
    </AnimatePresence>
  );
};

export default ExternalDocHistoryModal;
