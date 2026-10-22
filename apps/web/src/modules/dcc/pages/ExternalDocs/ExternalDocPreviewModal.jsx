import React, { useState, useEffect, useRef } from 'react';
import useStore from '../../../../store/useStore';
import { X, ShieldAlert, FileText, Download, Building2, Calendar, Globe, Tag, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalWatermarkService, { WATERMARK_TYPES } from '../../services/UniversalWatermarkService';
import toast from 'react-hot-toast';
import { resolveFileBlob } from '../../utils/fileStorage';
import { stampExternalDocumentTopRight } from '../../utils/pdfStamper';

// A render crash inside the viewer must never unmount it: show the error and wait for the user to press X.
class PreviewBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('ExternalDocPreviewModal crashed:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full text-center space-y-3 shadow-2xl">
          <ShieldAlert size={28} className="mx-auto text-rose-500" />
          <p className="font-semibold text-slate-800 text-sm">แสดงตัวอย่างเอกสารไม่สำเร็จ</p>
          <p className="text-xs text-slate-500 break-words">{String(this.state.error?.message || this.state.error)}</p>
          <button type="button" onClick={this.props.onClose} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold cursor-pointer">ปิด</button>
        </div>
      </div>
    );
  }
}

const ExternalDocPreviewModalInner = ({ isOpen, onClose, document: liveDoc }) => {
  const { currentUser, logExternalDownload } = useStore();

  // Freeze the document while the viewer is open: store refreshes / parent re-renders hand us
  // new object identities, which must not restart the PDF load or blank the viewer mid-read.
  const snapRef = useRef(null);
  const liveEdition = liveDoc?.edition || liveDoc?.sourceVersion;
  if (!isOpen || !liveDoc) {
    snapRef.current = null;
  } else if (!snapRef.current || snapRef.current.id !== liveDoc.id || (snapRef.current.edition || snapRef.current.sourceVersion) !== liveEdition) {
    snapRef.current = liveDoc;
  }
  const doc = snapRef.current;

  const docCode = doc?.edCode || doc?.doc_code || doc?.docNo || doc?.id || 'ED-DOC-001';
  const uDept = currentUser?.department || 'QA';

  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfBroken, setPdfBroken] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const blobUrlRef = useRef(null);
  const stampedPdfBytesRef = useRef(null);
  const currentDocKeyRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    if (!isOpen || !doc) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      stampedPdfBytesRef.current = null;
      currentDocKeyRef.current = null;
      setPdfBlobUrl(null);
      setLoadingPdf(false);
      setPdfBroken(false);
      setLoadError(null);
      return;
    }

    const editionKey = String(doc.edition || doc.sourceVersion || doc.ver_ed || doc.version || '').trim();
    const rawFileId = doc.rawFileId || doc.attachedFile?.rawFileId || doc.attachedFile?.fileId || doc.fileId;
    const fileStorageKey = doc.fileStorageKey || doc.attachedFile?.fileStorageKey || (docCode && editionKey ? `FILE_${docCode}_ED_${editionKey}` : null);
    const docKey = `${doc.id || ''}_${doc.edCode || doc.doc_code || doc.docNo || ''}_${editionKey}_${fileStorageKey || ''}_${rawFileId || ''}`;

    // Skip re-processing if already stamped and loaded for the exact same document
    if (currentDocKeyRef.current === docKey && blobUrlRef.current) {
      return;
    }

    setLoadingPdf(true);
    setPdfBroken(false);
    setLoadError(null);
    const isSupersededOrObsolete = Boolean(
      doc.status === 'SUPERSEDED' ||
      doc.status === 'SUPERSEDED_ARCHIVED' ||
      doc.is_superseded ||
      doc.status === 'OBSOLETE' ||
      doc.status === 'OBSOLETE_ARCHIVED' ||
      doc.is_obsolete
    );
    const fallbackKey = isSupersededOrObsolete
      ? (fileStorageKey || rawFileId || doc.id)
      : (fileStorageKey || rawFileId || doc.edCode || doc.doc_code || doc.docNo || doc.id);
    const sourceDoc = {
      ...doc,
      edition: editionKey || doc.edition,
      ...(fileStorageKey ? { fileStorageKey } : {}),
      ...(rawFileId ? { rawFileId, fileId: rawFileId, attachedFile: { ...(doc.attachedFile || {}), rawFileId, fileId: rawFileId } } : {})
    };

    resolveFileBlob(sourceDoc, fallbackKey).then(async (fileBlob) => {
      if (isCancelled) return;
      if (!fileBlob) {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        stampedPdfBytesRef.current = null;
        currentDocKeyRef.current = null;
        setPdfBlobUrl(null);
        setLoadingPdf(false);
        return;
      }

      try {
        const rawBuffer = await fileBlob.arrayBuffer();
        if (isCancelled) return;

        // Origin version extraction strictly avoiding Rev.00
        const originRev = doc.sourceVersion || doc.edition || doc.originRev || doc.externalEdition || (doc.rev && doc.rev !== '00' && doc.rev !== 'Rev.00' ? doc.rev : null) || (doc.version && doc.version !== '00' && doc.version !== 'Rev.00' ? doc.version : null) || '-';
        const docTitle = doc.docTitle || doc.docName || doc.title || doc.name || 'External Document';
        const effectiveDateFormatted = doc.effectiveDate
          ? (typeof doc.effectiveDate === 'string' && doc.effectiveDate.includes('/')
              ? doc.effectiveDate
              : new Date(doc.effectiveDate).toLocaleDateString('th-TH'))
          : new Date().toLocaleDateString('th-TH');

        const stampData = {
          docCode: docCode,
          docRev: originRev,
          title: docTitle,
          timestamp: effectiveDateFormatted,
          status: doc.status || 'ACTIVE'
        };

        // On-the-fly stamping of all pages for preview
        let stampedBytes;
        try {
          stampedBytes = await stampExternalDocumentTopRight(rawBuffer, stampData);
        } catch (stampErr) {
          // A real PDF that pdf-lib cannot stamp (e.g. encrypted) still opens raw; a stub with no %%EOF would only show a blank viewer.
          if (!new TextDecoder('latin1').decode(new Uint8Array(rawBuffer).slice(-1024)).includes('%%EOF')) {
            setPdfBroken(true);
            throw stampErr;
          }
          console.warn("Failed to apply top-right preview stamp, falling back to raw buffer:", stampErr);
          stampedBytes = rawBuffer;
        }

        if (isCancelled) return;

        stampedPdfBytesRef.current = stampedBytes;
        currentDocKeyRef.current = docKey;

        const stampedBlob = new Blob([stampedBytes], { type: 'application/pdf' });
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        const url = URL.createObjectURL(stampedBlob);
        blobUrlRef.current = url;
        setPdfBlobUrl(url);
      } catch (err) {
        console.error('Error processing PDF stamp:', err);
        if (!isCancelled) {
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
          }
          stampedPdfBytesRef.current = null;
          currentDocKeyRef.current = null;
          setPdfBlobUrl(null);
        }
      } finally {
        if (!isCancelled) {
          setLoadingPdf(false);
        }
      }
    }).catch(err => {
      console.error('Error loading PDF blob:', err);
      if (!isCancelled) {
        // The API refuses with a reason (e.g. superseded files are DCC/QMR only); show it instead of claiming no file exists.
        setLoadError(err?.message || 'โหลดไฟล์ไม่สำเร็จ');
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        stampedPdfBytesRef.current = null;
        currentDocKeyRef.current = null;
        setPdfBlobUrl(null);
        setLoadingPdf(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, doc, docCode]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      stampedPdfBytesRef.current = null;
      currentDocKeyRef.current = null;
    };
  }, []);

  if (!isOpen || !doc) return null;

  const isObsolete = Boolean(
    doc.status === 'OBSOLETE' || 
    doc.status === 'OBSOLETE_ARCHIVED' || 
    doc.is_obsolete
  );
  const isSuperseded = Boolean(
    !isObsolete && (
      doc.status === 'SUPERSEDED' || 
      doc.status === 'SUPERSEDED_ARCHIVED' || 
      doc.is_superseded
    )
  );

  const watermarkPreset = isObsolete 
    ? WATERMARK_TYPES.OBSOLETE 
    : isSuperseded 
      ? WATERMARK_TYPES.SUPERSEDED 
      : WATERMARK_TYPES.UNCONTROLLED_COPY;

  const handleDownload = async () => {
    const toastId = toast.loading(`กำลังประทับลายน้ำเอกสาร ${docCode}...`);

    try {
      const downloadMeta = {
        ...doc,
        docCode,
        docTitle: doc.title,
        title: doc.title,
        docVersion: doc.rev || doc.sourceVersion || '01',
        sourceVersion: doc.sourceVersion || doc.edition,
        source: doc.source,
        userName: currentUser?.name || 'Authorized User',
        userDept: currentUser?.department || uDept,
        authorizedScope: doc.accessScope === 'Restricted' ? 'Restricted External Release' : 'Standard External Reference',
        dccName: currentUser?.name || 'DCC Admin',
        isExternal: true,
        is_external: true,
        doc_type: 'ED',
        docType: 'ED',
        isRestricted: doc.accessScope === 'Restricted' || doc.accessScope === 'RESTRICTED',
        accessScope: doc.accessScope,
        watermarkType: watermarkPreset,
        reason: isObsolete ? 'Historical Download (OBSOLETE)' : (isSuperseded ? 'Historical Download (SUPERSEDED)' : 'External Document Download / Print'),
        attachedFile: doc.attachedFile,
        fileId: doc.fileId || doc.attachedFile?.fileId
      };

      await UniversalWatermarkService.downloadWatermarkedPdf(
        {
          ...doc,
          id: doc.id,
          title: docCode,
          name: doc.title,
          docTitle: doc.title,
          rev: doc.rev || doc.sourceVersion || '01',
          department: doc.department || uDept,
          effectiveDate: doc.effectiveDate,
          status: isObsolete ? 'OBSOLETE' : (isSuperseded ? 'SUPERSEDED' : (doc.status || 'ACTIVE')),
          sourceVersion: doc.sourceVersion || doc.edition,
          source: doc.source,
          isExternal: true,
          is_external: true,
          doc_type: 'ED',
          docType: 'ED',
          attachedFile: doc.attachedFile,
          fileId: doc.fileId || doc.attachedFile?.fileId
        },
        watermarkPreset,
        downloadMeta
      );

      if (logExternalDownload) {
        logExternalDownload(doc.id);
      }
      toast.success(`ดาวน์โหลดเอกสาร ${docCode} สำเร็จ`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการสร้างเอกสาร PDF', { id: toastId });
    }
  };

  const timestamp = UniversalWatermarkService.getBangkokTimestamp ? UniversalWatermarkService.getBangkokTimestamp() : new Date().toLocaleString('th-TH');
  const watermarkText = isObsolete
    ? `OBSOLETE / ยกเลิกการใช้งานแล้ว • ${currentUser?.name || 'User'} • ${timestamp}`
    : isSuperseded
      ? `SUPERSEDED / ตกรุ่น ห้ามใช้อ้างอิง • ${currentUser?.name || 'User'} • ${timestamp}`
      : `UNCONTROLLED COPY (EXTERNAL REF) • ${currentUser?.name || 'User'} • ${timestamp}`;

  return (
    <AnimatePresence>
      <div onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/75 backdrop-blur-md overflow-hidden">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="fixed inset-0"
        />
        
        {/* Near Full-Screen Modal Canvas */}
        <motion.div 
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 340, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="relative w-[95vw] max-w-7xl 2xl:max-w-[1536px] h-[92vh] max-h-[960px] min-h-[580px] bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden z-10 my-auto"
        >
          {/* Header (Compact & High Information Density) */}
          <div className="bg-white px-4 sm:px-6 py-2.5 sm:py-3 flex justify-between items-center shrink-0 border-b border-slate-200/90">
            <div className="flex items-center gap-3 min-w-0 pr-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/80 flex items-center justify-center shrink-0 shadow-xs">
                <FileText size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-slate-900 text-base sm:text-lg font-bold tracking-tight">{docCode}</h2>
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/80 px-2 py-0.5 rounded-md text-[11px] sm:text-xs font-mono font-bold">
                    {doc.sourceVersion ? `Ver/Ed: ${doc.sourceVersion}` : 'EXTERNAL DOC'}
                  </span>
                  {isObsolete ? (
                    <span className="bg-rose-50 text-rose-700 border border-rose-200/80 px-2 py-0.5 rounded-md text-[11px] sm:text-xs font-bold flex items-center gap-1">
                      <AlertTriangle size={12} /> OBSOLETE
                    </span>
                  ) : isSuperseded ? (
                    <span className="bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded-md text-[11px] sm:text-xs font-bold flex items-center gap-1">
                      <AlertTriangle size={12} /> SUPERSEDED
                    </span>
                  ) : (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2 py-0.5 rounded-md text-[11px] sm:text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} /> ACTIVE
                    </span>
                  )}
                  {doc.accessScope === 'Restricted' && (
                    <span className="bg-rose-50 text-rose-700 border border-rose-200/80 px-2 py-0.5 rounded-md text-[11px] sm:text-xs font-bold flex items-center gap-1">
                      <ShieldAlert size={12} /> RESTRICTED
                    </span>
                  )}
                </div>
                <p className="text-slate-500 text-xs sm:text-sm font-medium truncate max-w-xl mt-0.5" title={doc.title}>
                  {doc.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={handleDownload}
                className="px-3.5 sm:px-4 py-2 rounded-xl bg-[#da7756] hover:bg-[#c96646] active:scale-[0.98] text-white font-semibold text-xs sm:text-sm transition-all flex items-center gap-1.5 focus:ring-4 focus:ring-[#da7756]/20 outline-none shadow-sm cursor-pointer"
                title="ดาวน์โหลดไฟล์พร้อมลายน้ำควบคุม"
              >
                <Download size={15} />
                <span>ดาวน์โหลด PDF</span>
              </button>
              <button 
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-2 rounded-xl transition-colors focus:ring-2 focus:ring-[#da7756]/20 outline-none cursor-pointer"
                title="ปิดหน้าต่าง (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Metadata Quick Ribbon (Compact single-line scannable info strip) */}
          <div className="px-4 sm:px-6 py-2 bg-slate-50/90 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-slate-500 shrink-0">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Globe size={13} className="text-slate-400" />
                <span>ผู้ออก:</span>
                <strong className="text-slate-800 font-medium">{doc.source || '-'}</strong>
              </span>
              {(doc.sourceVersion || doc.edition) && (
                <span className="inline-flex items-center gap-1.5">
                  <Tag size={13} className="text-slate-400" />
                  <span>รุ่น/Edition:</span>
                  <strong className="text-slate-800 font-mono font-medium">{doc.sourceVersion || doc.edition}</strong>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" />
                <span>แผนก:</span>
                <strong className="text-slate-800 font-mono font-medium">{doc.department || doc.dept || 'QA'}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                <span>วันบังคับใช้:</span>
                <strong className="text-slate-800 font-mono font-medium">{doc.effectiveDate || '-'}</strong>
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="inline-flex items-center gap-1.5">
                <span>สิทธิ์การเข้าถึง:</span>
                <span className="font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] shadow-2xs">
                  {doc.accessScope || 'General'}
                </span>
              </div>
            </div>
          </div>

          {/* PDF Native Viewer Container (Maximized Full Height Viewport) */}
          <div className="flex-1 min-h-0 w-full h-full bg-slate-900 relative overflow-hidden flex flex-col justify-center items-center">
            {loadingPdf ? (
              <div className="text-slate-400 font-medium animate-pulse flex flex-col items-center gap-3 z-10">
                <FileText size={36} className="text-slate-500 animate-bounce" />
                <span className="text-sm">กำลังประทับตรายางควบคุมและเตรียมพรีวิวเอกสาร...</span>
              </div>
            ) : pdfBlobUrl ? (
              <>
                <iframe
                  src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                  className="w-full border-none block"
                  style={{
                    height: 'calc(100% + 52px)',
                    marginTop: '-52px'
                  }}
                  title="PDF Preview"
                />
                {/* Floating subtle security preview watermark pill */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-slate-300 text-[11px] font-mono shadow-lg flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
                  <ShieldCheck size={12} className={isObsolete ? "text-rose-400" : isSuperseded ? "text-amber-400" : "text-emerald-400"} />
                  <span>{watermarkText}</span>
                </div>
              </>
            ) : (
              <div className="text-slate-400 font-medium flex flex-col items-center gap-3 p-6 text-center z-10">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400">
                  <ShieldAlert size={28} />
                </div>
                <div className="space-y-1">
                  <p className="text-slate-200 font-semibold text-sm">{loadError ? 'เปิดไฟล์ไม่ได้' : pdfBroken ? 'เปิดไฟล์ PDF ไม่ได้ (ไฟล์เสียหรือไม่ใช่ PDF จริง)' : 'ไม่พบไฟล์ต้นฉบับจริง (No original file attached)'}</p>
                  <p className="text-slate-400 text-xs">{loadError ? loadError : pdfBroken ? 'กรุณาให้ผู้ขึ้นทะเบียนอัปโหลดไฟล์ PDF ที่เปิดอ่านได้อีกครั้ง' : 'เอกสารนี้อาจถูกบันทึกโดยไม่มีไฟล์แนบ หรือไฟล์อยู่ในคลังข้อมูลที่ถูกย้าย'}</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const ExternalDocPreviewModal = (props) => (
  <PreviewBoundary onClose={props.onClose}>
    <ExternalDocPreviewModalInner {...props} />
  </PreviewBoundary>
);

export default ExternalDocPreviewModal;
