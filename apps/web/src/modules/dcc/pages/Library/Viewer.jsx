import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, ExternalLink, ArrowLeft, ShieldAlert, ChevronDown } from 'lucide-react';
import { UniversalWatermarkService, WATERMARK_TYPES, getWatermarkConfig } from '../../services/UniversalWatermarkService';
import { resolveFileBlob } from '../../utils/fileStorage';
import { applyProgressiveSignatoryStamp } from '../../utils/pdfStamper';
import { resolveProgressiveSignatories } from '../../utils/signatoryResolver';
import toast from 'react-hot-toast';
import { hasDocumentAccess } from '../../utils/accessControl';

const Viewer = () => {
  const { docId, rev } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isArchive = searchParams.get('archive') === 'true';
  const { documents, currentUser, canDownloadDocument } = useStore();
  const [realPdfUrl, setRealPdfUrl] = useState(null);
  const [activePdfBlob, setActivePdfBlob] = useState(null);
  const [_loadingPdf, setLoadingPdf] = useState(false);
  const [zoomMode, setZoomMode] = useState('FitH'); // 'FitH' | '100' | '125' | '150' | '75'
  
  const matchesDocIdentifier = (d) => (
    String(d.id) === String(docId) ||
    String(d.document_code) === String(docId) ||
    String(d.doc_code) === String(docId) ||
    String(d.docCode) === String(docId) ||
    String(d.code) === String(docId) ||
    String(d.docNo) === String(docId) ||
    String(d.title) === String(docId)
  );
  const normRevParam = rev ? String(rev).replace(/^Rev\.?\s*/i, '').trim().padStart(2, '0') : '';
  const doc = (documents || []).find(d => {
    if (!matchesDocIdentifier(d)) return false;
    if (!normRevParam) return true;
    const dRev = String(d.rev ?? d.revision ?? d.doc_version ?? '').replace(/^Rev\.?\s*/i, '').trim().padStart(2, '0');
    return dRev === normRevParam;
  }) || (documents || []).find(matchesDocIdentifier);

  useEffect(() => {
    let activeUrl = null;
    let isCancelled = false;

    if (doc) {
      // 1. Fast Path: Check if pre-stamped binary exists directly in memory (Instant 0ms display)
      const isAlreadyStamped = Boolean(doc.isSignatoryStamped || doc.is_signatory_stamped || doc.stampedAt);
      const inMemoryBlob = (doc.fileBlob instanceof Blob ? doc.fileBlob : null) ||
                           (doc.pdfBlob instanceof Blob ? doc.pdfBlob : null) ||
                           (doc.fileData ? new Blob([doc.fileData], { type: 'application/pdf' }) : null);

      if (isAlreadyStamped && inMemoryBlob && inMemoryBlob.size > 0) {
        activeUrl = URL.createObjectURL(inMemoryBlob);
        setRealPdfUrl(activeUrl);
        setActivePdfBlob(inMemoryBlob);
        setLoadingPdf(false);
        return () => {
          isCancelled = true;
          setActivePdfBlob(null);
          if (activeUrl) {
            URL.revokeObjectURL(activeUrl);
          }
        };
      }

      setLoadingPdf(true);
      resolveFileBlob(doc, doc.rawFileId || doc.fileId || doc.id || doc.docCode || doc.title || doc.darId)
        .then(async (blob) => {
          if (!isCancelled && blob) {
            let displayBlob = blob;
            const status = (doc.status || (isArchive ? 'OBSOLETE' : '')).toUpperCase();
            const isSupersededOrObsolete = Boolean(
              doc.is_superseded ||
              status === 'SUPERSEDED' ||
              status === 'SUPERSEDED_ARCHIVED' ||
              doc.is_obsolete ||
              status === 'OBSOLETE' ||
              status === 'OBSOLETE_ARCHIVED'
            );
            const isMasterDoc = !isSupersededOrObsolete && (status === 'ACTIVE' || status === 'EFFECTIVE' || status === 'APPROVED');
            const isInternal = !doc.isExternal && doc.docType !== 'ED' && !String(doc.title || doc.docCode || '').startsWith('ED-') && !String(doc.title || doc.docCode || '').startsWith('EXT-');

            // Only run JIT stamping if the document is an active Master Doc and has NOT been stamped yet
            if (isMasterDoc && isInternal && !isAlreadyStamped) {
              try {
                const store = useStore.getState();
                const relatedDar = (store.dars || []).find(d => 
                  d.id === doc.darId || 
                  d.darNumber === doc.darNumber || 
                  d.docNo === doc.document_code || 
                  d.docCode === doc.document_code ||
                  d.title === doc.title
                );
                const signatories = resolveProgressiveSignatories({
                  dar: relatedDar,
                  masterDoc: doc,
                  stage: 'MASTER',
                  masterUsers: store.masterUsers,
                  users: store.users,
                  currentUser: store.currentUser
                });
                const stampedBytes = await applyProgressiveSignatoryStamp(blob, signatories);
                displayBlob = new Blob([stampedBytes], { type: 'application/pdf' });

                // Pre-bake and cache into Store & IndexedDB so future opens are 100% instant!
                if (store.finalizeAndPublishMaster && (doc.darId || relatedDar?.id)) {
                  store.finalizeAndPublishMaster(doc.darId || relatedDar?.id).catch(() => {});
                }
              } catch (stampErr) {
                console.warn('[Viewer] Stamping 3x3 table warning:', stampErr);
              }
            }

            activeUrl = URL.createObjectURL(displayBlob);
            setRealPdfUrl(activeUrl);
            setActivePdfBlob(displayBlob);
          }
        })
        .catch(err => {
          console.warn('[Viewer] Could not resolve file blob:', err);
        })
        .finally(() => {
          if (!isCancelled) setLoadingPdf(false);
        });
    }

    return () => {
      isCancelled = true;
      setActivePdfBlob(null);
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [doc, isArchive]);

  const iframeUrl = useMemo(() => {
    if (!realPdfUrl) return '';
    const viewParam = zoomMode === 'FitH' ? 'view=FitH' : `view=Fit&zoom=${zoomMode}`;
    return `${realPdfUrl}#toolbar=0&navpanes=0&scrollbar=1&${viewParam}`;
  }, [realPdfUrl, zoomMode]);

  const title = doc ? doc.title : docId;
  const docStatus = doc?.status || (isArchive ? 'OBSOLETE' : '');
  const watermarkConfig = getWatermarkConfig(docStatus);
  const isDccAdmin = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.isDccAdmin || 
    currentUser?.department === 'DC' || 
    currentUser?.department === 'DCC'
  );
  const canDownload = doc && !isArchive && (docStatus === 'EFFECTIVE' || docStatus === 'ACTIVE' || docStatus === 'APPROVED' || isDccAdmin) 
    ? (typeof canDownloadDocument === 'function' ? canDownloadDocument(doc, currentUser) : true) 
    : false;

  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
        setIsDownloadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Access Control Guard
  if (doc && !hasDocumentAccess(doc, currentUser)) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl p-8 text-center border border-[#E5E5E5] space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
          <ShieldAlert size={36} />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-xl font-bold text-[#1E1E1E]">เอกสารนี้ถูกจำกัดสิทธิ์ (Access Restricted)</h2>
          <p className="text-xs text-[#666666] leading-relaxed">
            คุณไม่มีสิทธิ์ในการเข้าถึงหรือดูเนื้อหาเอกสารลับฉบับนี้ ({title}) หากต้องการเข้าถึงกรุณาติดต่อเจ้าของเอกสาร ({doc.department || 'ต้นสังกัด'}) หรือเจ้าหน้าที่ DCC
          </p>
        </div>
        <button
          onClick={() => navigate('/library')}
          className="btn-primary flex items-center gap-2 text-xs"
        >
          <ArrowLeft size={16} /> กลับสู่คลังเอกสาร
        </button>
      </div>
    );
  }

  const handleDownload = async (downloadMode = 'UNCONTROLLED', openInTab = false) => {
    if (!doc) return;
    setIsDownloadMenuOpen(false);
    try {
      let watermarkType = WATERMARK_TYPES.UNCONTROLLED_COPY;
      let isCleanMaster = false;

      if (downloadMode === 'CLEAN' || downloadMode === 'CLEAN_MASTER') {
        watermarkType = 'CLEAN';
        isCleanMaster = true;
      } else if (downloadMode === 'CONTROLLED' || downloadMode === 'CONTROLLED_COPY') {
        watermarkType = WATERMARK_TYPES.CONTROLLED_COPY;
      } else {
        watermarkType = WATERMARK_TYPES.UNCONTROLLED_COPY;
      }

      const docToDownload = {
        ...doc,
        ...(activePdfBlob ? { fileBlob: activePdfBlob, fileData: activePdfBlob } : {})
      };

      await UniversalWatermarkService.downloadWatermarkedPdf(docToDownload, watermarkType, {
        userName: currentUser?.name || 'Authorized User',
        userDept: currentUser?.department || currentUser?.dept || 'QMS',
        holderDept: doc.department || currentUser?.department || 'DCC',
        location: doc.location || doc.pointOfUse || doc.locationName || doc.department || 'DCC Office',
        effectiveDate: doc.effectiveDate,
        isCleanMaster,
        currentUser
      }, openInTab);

      const label = isCleanMaster
        ? 'เอกสารแม่บทคลีน (Clean Master)'
        : (watermarkType === WATERMARK_TYPES.CONTROLLED_COPY ? 'สำเนาควบคุม (Controlled Copy)' : 'สำเนาไม่ควบคุม (Uncontrolled Copy)');

      toast.success(openInTab ? `เปิด ${label} ในแท็บใหม่สำเร็จ` : `ดาวน์โหลด ${label} สำเร็จ`);
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการสร้าง PDF');
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 rounded-xl overflow-hidden shadow-none border border-slate-800 relative min-h-0">
      {/* Viewer Toolbar */}
      <div className="bg-slate-800 text-slate-200 px-4 py-2.5 flex items-center justify-between border-b border-slate-700/80 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer" title="ย้อนกลับ">
            <ArrowLeft size={18} />
          </button>
          <div className="font-bold text-sm md:text-base truncate max-w-[200px] md:max-w-md flex items-center gap-2">
            <span className="font-mono text-[#0D99FF]">{title}</span>
            <span className="text-slate-400 font-mono">Rev. {rev}</span>
            {isArchive && <span className="px-2.5 py-0.5 bg-rose-500/20 text-rose-400 rounded-full text-xs font-bold border border-rose-500/30">ARCHIVED</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-3">

          <div className="hidden md:flex items-center gap-1 bg-slate-700/80 rounded-xl px-2.5 py-1">
            <button 
              onClick={() => setZoomMode(prev => prev === 'FitH' ? '100' : String(Math.max(50, parseInt(prev, 10) - 25)))} 
              className="p-1 hover:bg-slate-600 rounded text-slate-300 transition-colors cursor-pointer" 
              title="ซูมออก"
            >
              <ZoomOut size={15} />
            </button>
            <button 
              onClick={() => setZoomMode('FitH')} 
              className="text-xs w-12 text-center font-mono text-slate-300 hover:text-white transition-colors cursor-pointer" 
              title="คลิกเพื่อรีเซ็ต Fit-Width (พอดีความกว้าง)"
            >
              {zoomMode === 'FitH' ? 'Fit' : `${zoomMode}%`}
            </button>
            <button 
              onClick={() => setZoomMode(prev => prev === 'FitH' ? '125' : String(Math.min(200, parseInt(prev, 10) + 25)))} 
              className="p-1 hover:bg-slate-600 rounded text-slate-300 transition-colors cursor-pointer" 
              title="ซูมเข้า"
            >
              <ZoomIn size={15} />
            </button>
          </div>
          
          <div className="flex items-center gap-1.5 border-l border-slate-700 pl-3">
            {canDownload ? (
              <>
                <button 
                  onClick={() => handleDownload('UNCONTROLLED', true)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-700 flex items-center justify-center text-[#0D99FF] hover:text-white transition-colors cursor-pointer" 
                  title="เปิดดู PDF ในแท็บใหม่ (Open PDF Tab)"
                >
                  <ExternalLink size={16} />
                </button>

                {isDccAdmin ? (
                  <div className="relative inline-block text-left" ref={downloadMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsDownloadMenuOpen(prev => !prev)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                      title="เลือกรูปแบบการดาวน์โหลด (DCC Admin)"
                    >
                      <Download size={14} />
                      <span>ดาวน์โหลด</span>
                      <ChevronDown size={14} className={`opacity-80 transition-transform ${isDownloadMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isDownloadMenuOpen && (
                      <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                        <button
                          type="button"
                          onClick={() => handleDownload('UNCONTROLLED')}
                          className="w-full text-left px-3 py-2 text-xs rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex flex-col transition-colors cursor-pointer"
                        >
                          <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                            📄 สำเนาไม่ควบคุม (Uncontrolled Copy)
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">ติดลายน้ำสีแดง สำหรับดูอ้างอิง</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload('CLEAN')}
                          className="w-full text-left px-3 py-2 text-xs rounded-lg text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex flex-col mt-1 border-t border-slate-100 dark:border-slate-700 transition-colors cursor-pointer"
                        >
                          <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            📥 เอกสารแม่บทฉบับคลีน (Clean Master)
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">ไม่มีลายน้ำ มีเฉพาะตารางลายเซ็น 3x3</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload('CONTROLLED')}
                          className="w-full text-left px-3 py-2 text-xs rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex flex-col mt-1 border-t border-slate-100 dark:border-slate-700 transition-colors cursor-pointer"
                        >
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            📑 สำเนาควบคุม (Controlled Copy)
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">ติดลายน้ำสีน้ำเงิน สำหรับหน้างาน</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button 
                    type="button"
                    onClick={() => handleDownload('UNCONTROLLED')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer" 
                    title="ดาวน์โหลดสำเนาไม่ควบคุม (Uncontrolled Copy)"
                  >
                    <Download size={14} />
                    <span>ดาวน์โหลด (สำเนาไม่ควบคุม)</span>
                  </button>
                )}
              </>
            ) : (
              <button className="w-8 h-8 rounded-lg opacity-40 cursor-not-allowed flex items-center justify-center text-slate-400" title={isArchive ? "Archive Document (Download Disabled)" : "ไม่มีสิทธิ์ดาวน์โหลด"}>
                <Download size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Viewer Canvas - Full Frame Immersive (Edge-to-Edge, Fit-Width Enforced) */}
      <div className="flex-1 w-full bg-slate-950 overflow-hidden flex flex-col p-0 relative min-h-0">
        
        {/* Watermark Overlay for Superseded and Obsolete Documents */}
        {watermarkConfig.visible && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50 overflow-hidden select-none">
            {Array.from({ length: 6 }).map((_, i) => (
              <div 
                key={i} 
                style={{ color: watermarkConfig.color }}
                className="font-black text-4xl sm:text-6xl md:text-7xl whitespace-nowrap -rotate-45 mb-24 md:mb-32 select-none tracking-widest drop-shadow-sm font-sans"
              >
                {watermarkConfig.text}
              </div>
            ))}
          </div>
        )}

        {realPdfUrl ? (
          /* PDF Preview Container - Maximize Vertical Screen Area via Viewport-Clipping */
          <div className="flex-1 min-h-0 w-full relative overflow-hidden bg-slate-900 z-0">
            <iframe
              src={iframeUrl}
              title={`Viewer - ${title}`}
              className="w-full border-none block"
              style={{
                height: 'calc(100% + 52px)',
                marginTop: '-52px'
              }}
            />
          </div>
        ) : (
          <div className="w-full flex-1 h-full bg-white rounded-lg sm:rounded-xl shadow-none flex flex-col items-center justify-center text-center p-6 sm:p-10 relative z-0 min-h-0">
            <div className="border-2 border-dashed border-[#E5E5E5] rounded-xl p-8 w-full max-w-2xl flex flex-col items-center justify-center bg-[#F5F5F5]/50">
              <h1 className="text-xl font-bold text-slate-400 mb-2">PDF Document Viewer</h1>
              <p className="text-sm text-slate-800 font-bold font-mono">Document: {title}</p>
              <p className="text-xs text-[#666666] font-mono mt-0.5">Revision: {rev}</p>
              {watermarkConfig.visible && (
                <div 
                  className="mt-6 px-4 py-2 rounded-full font-bold text-xs border tracking-wide flex items-center gap-2"
                  style={{
                    backgroundColor: docStatus.includes('SUPERSEDED') ? '#FFF7ED' : '#FEF2F2',
                    borderColor: docStatus.includes('SUPERSEDED') ? '#FDBA74' : '#FECACA',
                    color: docStatus.includes('SUPERSEDED') ? '#C2410C' : '#DC2626'
                  }}
                >
                  {docStatus.includes('SUPERSEDED') ? '⏳' : '🚨'} {watermarkConfig.text} (ห้ามนำไปใช้อ้างอิง)
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Floating Pagination */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-md text-white px-4 py-1.5 rounded-full flex items-center gap-3 shadow-lg border border-slate-700/80 text-xs z-20 pointer-events-auto">
        <button className="p-1 hover:bg-slate-700 rounded-full text-slate-300 transition-colors"><ChevronLeft size={16} /></button>
        <span className="font-mono font-medium">Page 1 of 5</span>
        <button className="p-1 hover:bg-slate-700 rounded-full text-slate-300 transition-colors"><ChevronRight size={16} /></button>
      </div>

    </div>
  );
};

export default Viewer;
