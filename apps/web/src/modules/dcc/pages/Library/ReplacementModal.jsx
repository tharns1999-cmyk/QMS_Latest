import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, FileText, CheckCircle2, Copy, MapPin, Building2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { cleanLocationName } from '../../services/MasterDataService';

const ReplacementModal = ({ isOpen, onClose, instance }) => {
  const [reasonType, setReasonType] = useState('DAMAGED');
  const [reasonText, setReasonText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !instance) return null;

  const currentIssue = parseInt(String(instance.issue_no || instance.issueNumber || '1').replace(/\D/g, ''), 10) || 1;
  const nextIssueNo = String(currentIssue + 1).padStart(2, '0');
  const trimmedReason = reasonText.trim();
  const isReasonValid = trimmedReason.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isReasonValid) {
      toast.error('กรุณาระบุสาเหตุหรือรายละเอียดเพิ่มเติม');
      return;
    }

    setIsSubmitting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (onClose) {
        await onClose(true, reasonType, trimmedReason);
      }
    } catch (err) {
      console.error('[ReplacementModal] Submission failed:', err);
      toast.error(err?.message || 'เกิดข้อผิดพลาดในการทำรายการ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyNumber = instance.copy_no || instance.ccNumber || '01';
  const locationName = cleanLocationName(instance.location || instance.locationName || instance.station_name || `${instance.holder_dept || instance.department || 'PD'} Station`);
  const departmentName = instance.holder_dept || instance.department || instance.dept_code || 'PD';
  const docCode = instance.doc_code || instance.docTitle || instance.title || 'Controlled Document';
  const docTitle = instance.docName || instance.docTitle || instance.name || docCode;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isSubmitting && onClose()}
            className="fixed inset-0"
          />
          
          <motion.div 
            initial={{ scale: 0.96, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 my-auto"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 shadow-2xs shrink-0">
                  <AlertTriangle size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                      แจ้งเอกสารชำรุด/สูญหาย
                    </h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      Issue {nextIssueNo}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    ขอออกสำเนาควบคุมทดแทนประจำจุดใช้งาน
                  </p>
                </div>
              </div>
              <button 
                onClick={() => !isSubmitting && onClose()}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all outline-none cursor-pointer"
                disabled={isSubmitting}
                title="ปิดหน้าต่าง"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar bg-white">
              {/* Sleek Passport Context Card */}
              <div className="bg-slate-50/70 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs font-bold px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-700 shadow-xs shrink-0">
                    {docCode}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 truncate text-right flex-1" title={docTitle}>
                    {docTitle}
                  </span>
                </div>

                {/* Metadata Grid */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/40">
                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200/40 font-mono">
                    <Copy size={13} className="text-slate-400" />
                    <span>Copy {copyNumber}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200/40">
                    <MapPin size={13} className="text-slate-400" />
                    <span className="truncate max-w-[140px]" title={locationName}>{locationName}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200/40">
                    <Building2 size={13} className="text-slate-400" />
                    <span className="font-medium">{departmentName}</span>
                  </div>
                </div>
              </div>

              {/* Form */}
              <form id="replacement-form" onSubmit={handleSubmit} className="space-y-4">
                {/* Interactive Request Type Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
                    ประเภทคำขอ <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Damaged Option */}
                    <div 
                      onClick={() => setReasonType('DAMAGED')}
                      className={`relative rounded-2xl p-3.5 flex flex-col cursor-pointer transition-all duration-150 ${
                        reasonType === 'DAMAGED'
                          ? 'border-2 border-amber-500 bg-amber-50/40 shadow-xs scale-[1.01]'
                          : 'border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          reasonType === 'DAMAGED' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <FileText size={18} />
                        </div>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                          reasonType === 'DAMAGED'
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'border-slate-300 bg-white'
                        }`}>
                          {reasonType === 'DAMAGED' && <Check size={12} strokeWidth={3} />}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-slate-800">
                        ชำรุด (Damaged)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        มีเล่มจริงส่งคืน DCC เพื่อทำลาย
                      </p>
                    </div>

                    {/* Lost Option */}
                    <div 
                      onClick={() => setReasonType('LOST')}
                      className={`relative rounded-2xl p-3.5 flex flex-col cursor-pointer transition-all duration-150 ${
                        reasonType === 'LOST'
                          ? 'border-2 border-amber-500 bg-amber-50/40 shadow-xs scale-[1.01]'
                          : 'border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          reasonType === 'LOST' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <AlertTriangle size={18} />
                        </div>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                          reasonType === 'LOST'
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'border-slate-300 bg-white'
                        }`}>
                          {reasonType === 'LOST' && <Check size={12} strokeWidth={3} />}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-slate-800">
                        สูญหาย (Lost)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        ไม่มีเล่มจริง จำหน่ายออกจากทะเบียน
                      </p>
                    </div>
                  </div>
                </div>

                {/* Reason Textarea */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      สาเหตุ / รายละเอียดเพิ่มเติม <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {reasonText.length} ตัวอักษร
                    </span>
                  </div>
                  <textarea 
                    rows="3"
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all resize-none shadow-xs font-medium"
                    placeholder={
                      reasonType === 'LOST' 
                        ? 'ระบุรายละเอียดและสาเหตุการสูญหาย (จำเป็นต้องระบุ)...' 
                        : 'ระบุลักษณะการชำรุด เช่น ฉีกขาด, เปียกน้ำ (จำเป็นต้องระบุ)...'
                    }
                    required
                  />
                  {!isReasonValid && reasonText.length > 0 && (
                    <p className="text-xs text-rose-500 font-medium flex items-center gap-1">
                      <AlertTriangle size={12} />
                      กรุณาระบุสาเหตุ (ไม่สามารถส่งเฉพาะช่องว่างได้)
                    </p>
                  )}
                </div>

                {/* ISO 9001 Process Callout */}
                <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3.5 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 size={15} strokeWidth={2.5} />
                  </div>
                  <div className="text-xs text-emerald-900 leading-relaxed space-y-0.5">
                    <div className="font-semibold text-emerald-950">
                      กระบวนการควบคุมตามมาตรฐาน ISO 9001
                    </div>
                    <div>
                      {reasonType === 'DAMAGED' 
                        ? `ระบบจะเปิดงานแจกจ่ายเล่มใหม่ (Issue ${nextIssueNo}) และสร้างงานเรียกคืนเล่มเดิม (${copyNumber}) ให้ DCC ตรวจรับมาลงบันทึกทำลาย`
                        : `ระบบจะเปิดงานแจกจ่ายเล่มใหม่ (Issue ${nextIssueNo}) และตัดจำหน่ายเล่มเดิม (${copyNumber}) ออกจากทะเบียนทันทีโดยไม่ต้องตามเก็บเล่มจริง`
                      }
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Action Buttons Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
              <button 
                type="button"
                onClick={() => onClose()}
                disabled={isSubmitting}
                className="btn-secondary text-sm font-semibold px-5 py-2.5 rounded-xl border border-slate-300 transition-colors outline-none cursor-pointer"
              >
                ยกเลิก (Cancel)
              </button>
              <button 
                type="submit"
                form="replacement-form"
                disabled={isSubmitting || !isReasonValid}
                className="btn-primary bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>กำลังดำเนินการ...</>
                ) : (
                  <>ยืนยันการแจ้ง & ขอฉบับทดแทน</>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ReplacementModal;
