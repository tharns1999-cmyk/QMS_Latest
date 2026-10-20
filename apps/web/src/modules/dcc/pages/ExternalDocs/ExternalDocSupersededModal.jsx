import React, { useEffect } from 'react';
import { 
  X, 
  Package, 
  FileText, 
  Clock, 
  Eye, 
  Download, 
  ShieldCheck, 
  Building2,
  FileCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fmtDate } from './ExternalDocsList';

/**
 * ExternalDocSupersededModal
 * 
 * Dedicated, ergonomic modal dialog for displaying and interacting with 
 * superseded/archived editions of an External Document.
 * Completely replaces inline table expansion to prevent table row inflation.
 */
const ExternalDocSupersededModal = ({
  isOpen,
  onClose,
  docGroup,
  isChildModalOpen = false,
  onPreview,
  onDownload,
  onOpenDetail
}) => {
  // Support ESC key to close (only if no nested Level 2 child modal is open)
  useEffect(() => {
    if (!isOpen || isChildModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isChildModalOpen, onClose]);

  if (!isOpen || !docGroup) return null;

  const docNo = docGroup.docNo || docGroup.primaryDoc?.docNo || docGroup.primaryDoc?.edCode || '-';
  const docTitle = docGroup.primaryDoc?.title || docGroup.primaryDoc?.name || 'เอกสารภายนอก';
  const issuer = docGroup.issuer || docGroup.primaryDoc?.issuer || docGroup.primaryDoc?.officialIssuer || '-';
  const activeEdition = docGroup.activeEdition?.sourceVersion || docGroup.activeEdition?.edition;

  // Strict descending order: latest superseded edition at the top
  const supersededEditions = [...(docGroup.supersededEditions || [])].sort((a, b) => {
    const dateA = new Date(a.supersededAt || a.supersededDate || a.effectiveDate || a.createdAt || 0).getTime() || 0;
    const dateB = new Date(b.supersededAt || b.supersededDate || b.effectiveDate || b.createdAt || 0).getTime() || 0;
    return dateB - dateA;
  });

  const isObsoleteStack = Boolean(
    docGroup.isStackObsolete ||
    docGroup.stackStatus === 'OBSOLETE' ||
    docGroup.primaryDoc?.status === 'OBSOLETE' ||
    docGroup.primaryDoc?.is_obsolete
  );

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="superseded-modal-title"
      >
        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-gradient-to-b from-slate-50/60 to-white shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono font-bold text-sm text-[#0D99FF] bg-[#E5F4FF] border border-[#B8E1FF] px-2.5 py-0.5 rounded-md shadow-2xs">
                  {docNo}
                </span>
                {isObsoleteStack ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    <span>เอกสารถูกยกเลิกใช้งานแล้วทั้งระบบ (OBSOLETE)</span>
                  </span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      <Package size={12} className="text-amber-600" />
                      <span>{supersededEditions.length} ฉบับตกรุ่น</span>
                    </span>
                    {activeEdition && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Active: {activeEdition}
                      </span>
                    )}
                  </>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  <ShieldCheck size={12} className="text-slate-500" />
                  ISO 9001:2015 §7.5.3
                </span>
              </div>

              <h2 id="superseded-modal-title" className="text-base font-bold text-slate-800 truncate" title={docTitle}>
                {docTitle}
              </h2>

              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Building2 size={12} className="text-slate-400" />
                  ผู้ออกเอกสาร: <strong className="text-slate-700 font-medium">{issuer}</strong>
                </span>
                <span>•</span>
                <span>เก็บบันทึกประวัติและลายน้ำตกรุ่นอัตโนมัติ</span>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 focus:outline-hidden focus:ring-2 focus:ring-slate-300"
              aria-label="ปิดหน้าต่าง"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Edition List (Modal Body) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/40">
            {supersededEditions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <Package size={32} className="text-slate-300" />
                <p className="text-sm font-medium">ไม่พบประวัติฉบับตกรุ่นสำหรับเอกสารชุดนี้</p>
              </div>
            ) : (
              supersededEditions.map((editionDoc, idx) => {
                const editionTag = editionDoc.sourceVersion || editionDoc.edition || 'ฉบับประวัติ';
                const supersededDate = fmtDate(editionDoc.supersededAt || editionDoc.supersededDate || editionDoc.updatedAt || editionDoc.effectiveDate);
                const originalEffectiveDate = editionDoc.effectiveDate ? fmtDate(editionDoc.effectiveDate) : '-';
                const replacedBy = editionDoc.supersededByEdition || '-';
                const reqId = editionDoc.edrNumber || editionDoc.requestNo || editionDoc.darNo || '-';
                const docIssuer = editionDoc.issuer || editionDoc.officialIssuer || issuer;

                return (
                  <div
                    key={editionDoc.id || `${docNo}-sup-${idx}`}
                    className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    {/* Left: Metadata and Identification */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      {/* Sequence Pill */}
                      <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
                        {idx + 1}
                      </div>

                      <div className="min-w-0 space-y-1.5 flex-1">
                        {/* Edition Badge and Traceability References */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs">
                            {editionTag}
                          </span>

                          {isObsoleteStack || editionDoc.status === 'OBSOLETE' || editionDoc.is_obsolete ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              <span>ยกเลิกถาวร (Obsolete)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100/70 text-amber-800 border border-amber-200">
                              <Clock size={11} className="text-amber-600" />
                              <span>ตกรุ่น (Superseded)</span>
                            </span>
                          )}

                          {replacedBy !== '-' && (
                            <span className="text-[11px] font-mono font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1">
                              <span>แทนที่โดย:</span>
                              <strong className="text-slate-800">{replacedBy}</strong>
                            </span>
                          )}

                          {reqId !== '-' && (
                            <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 inline-flex items-center gap-1">
                              <FileCheck size={11} className="text-indigo-500" />
                              <span>คำร้อง:</span>
                              <strong>{reqId}</strong>
                            </span>
                          )}
                        </div>

                        {/* Lifecycle Audit Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 pt-0.5">
                          <div>
                            ตกรุ่นเมื่อ: <strong className="text-slate-700 font-mono">{supersededDate}</strong>
                          </div>
                          <div>
                            แทนที่โดย: <span className="font-mono text-slate-700 font-medium">{replacedBy}</span>
                          </div>
                          <div>
                            วันที่มีผลบังคับใช้เดิม: <span className="font-mono text-slate-700">{originalEffectiveDate}</span>
                          </div>
                          <div>
                            ผู้ออก: <span className="text-slate-700">{docIssuer}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Isolated Action Controls */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end">
                      {/* Preview PDF */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onPreview) onPreview(editionDoc);
                        }}
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-300 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="เปิดอ่านไฟล์ PDF พร้อมลายน้ำ SUPERSEDED"
                      >
                        <Eye size={13} />
                        <span>ดูเอกสาร</span>
                      </button>

                      {/* Download PDF */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDownload) onDownload(editionDoc, e);
                        }}
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="ดาวน์โหลด PDF พร้อมลายน้ำ SUPERSEDED"
                      >
                        <Download size={13} />
                        <span>ดาวน์โหลด</span>
                      </button>

                      {/* View Metadata Details */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenDetail) onOpenDetail(editionDoc);
                        }}
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="ดูรายละเอียดข้อมูลฉบับประวัติ"
                      >
                        <FileText size={13} />
                        <span>รายละเอียด</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Modal Footer */}
          <div className="border-t border-slate-100 p-4 bg-slate-50/50 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500 font-medium">
              แสดง {supersededEditions.length} ฉบับที่ตกรุ่นตามลำดับเวลาล่าสุดก่อน
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-slate-300"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ExternalDocSupersededModal;
