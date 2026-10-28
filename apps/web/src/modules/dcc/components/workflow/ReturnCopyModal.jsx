import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CornerDownLeft, Info, Send, Calendar } from 'lucide-react';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';

/**
 * ReturnCopyModal
 * ISO 9001 Clause 7.5.3 - Custody Workflow: Request Return / Decommission
 * Allows a department custodian to request returning a controlled copy to DCC.
 * Origin Invariant (Copy 01) is enforced in the store and hidden in UI.
 */
const ReturnCopyModal = ({ isOpen, onClose, copy }) => {
  const { requestCcReturn } = useStore();

  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!copy) return null;

  const rawNo = copy.copy_no || copy.ccNumber || '01';
  const docCode = copy.doc_code || copy.docTitle || copy.docCode || 'เอกสารควบคุม';
  const docName = copy.docName || copy.name || docCode;
  const currentLocation = copy.location || copy.locationName || copy.station_name || copy.holder_dept || '-';
  const currentDept = copy.holder_dept || copy.department || '-';
  const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const defaultDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const canSubmit = reason.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      if ((await requestCcReturn(copy.id, {
        reason: reason.trim(),
        returnDate: returnDate || defaultDate
      })) === false) return;
      toast.success(
        `ส่งคำขอส่งคืน ${docCode} Copy ${rawNo} ถึง DCC แล้ว`,
        { duration: 4000, icon: '↩️' }
      );
      onClose();
    } catch (err) {
      toast.error(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          >
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <CornerDownLeft size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-base leading-tight">ขอส่งคืน / ยกเลิกสำเนาควบคุม</h2>
                  <p className="text-amber-200 text-xs mt-0.5">Custody Workflow</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors" aria-label="ปิด">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 pt-5 pb-0">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200">Copy {rawNo}</span>
                  <span className="text-sm font-semibold text-slate-700 truncate" title={docName}>{docCode}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>จุดติดตั้ง: <strong className="text-slate-600">{currentLocation}</strong></span>
                  <span className="text-slate-300">·</span>
                  <span>แผนก: <strong className="text-slate-600">{currentDept}</strong></span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  เหตุผลที่ขอส่งคืน <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="ระบุเหตุผล เช่น ยกเลิกใช้งานสายการผลิตนี้, ลดจำนวนสำเนา, ย้ายออกจากพื้นที่..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><Calendar size={14} />วันที่นัดส่งคืนเล่มจริง</span>
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={e => setReturnDate(e.target.value)}
                  min={minDate}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                />
                <p className="text-xs text-slate-400 mt-1">หากไม่ระบุ ระบบจะกำหนด 3 วันทำการ</p>
              </div>

              <div className="flex items-start gap-2.5 px-3.5 py-3 bg-amber-50 border border-amber-100 rounded-xl">
                <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  หลังจาก DCC อนุมัติ สำเนา Copy {rawNo} จะถูก <strong>ปลดออกจากทะเบียนสำเนาใช้งาน</strong> และบันทึกไว้ในประวัติการเรียกคืน
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">ยกเลิก</button>
                <button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : <Send size={14} />}
                  ส่งคำขอ DCC
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReturnCopyModal;
