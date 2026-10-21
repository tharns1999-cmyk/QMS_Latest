import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, CornerDownLeft, ShieldCheck, CheckSquare, Square, AlertTriangle, Check, XCircle } from 'lucide-react';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';

/**
 * DccCustodyActionModal
 * ISO 9001 Clause 7.5.3 - Physical Verification & Approval Modal for DCC Officers
 * Handles both DCC_RELOCATE and DCC_RETURN task types.
 * Enforces physical verification checklist before Approve is enabled.
 */
const DccCustodyActionModal = ({ isOpen, onClose, task }) => {
  const {
    approveCcRelocation, rejectCcRelocation,
    approveCcReturn, rejectCcReturn
  } = useStore();

  const [checklistItems, setChecklistItems] = useState({});
  const [notes, setNotes] = useState('');
  const [dispositionMethod, setDispositionMethod] = useState('ARCHIVE');
  const [witnessName, setWitnessName] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!task) return null;

  const normType = (task.type || task.taskType || '').toUpperCase();
  const isRelocation = normType === 'DCC_RELOCATE';
  const isReturn = normType === 'DCC_RETURN';

  const docCode = task.docCode || task.doc_code || 'เอกสารควบคุม';
  const docTitle = task.docTitle || docCode;
  const copyNo = task.copy_no || '??';
  const requesterName = task.requesterName || task.requestedBy || 'ผู้ขอ';
  const requesterDept = task.requesterDept || task.currentDepartment || '-';
  const currentLocation = task.currentLocation || '-';
  const newLocation = task.newLocation || '';
  const newDepartment = task.newDepartment || '';
  const returnDate = task.returnDate || '-';
  const reason = task.reason || '-';

  // Build checklist based on task type
  const CHECKLISTS = isRelocation ? [
    { key: 'physical_move_confirmed', label: 'ยืนยันการย้ายเล่มจริงสำเร็จแล้ว (กรรมการรับรอง)' },
    { key: 'new_station_stamped', label: 'ติดป้ายสถานีใหม่บนเล่มสำเนาถูกต้องแล้ว' },
    { key: 'old_station_cleared', label: 'ยืนยันว่าสถานีเดิมไม่มีสำเนาเหลืออยู่' },
    { key: 'register_updated', label: 'ระบบทะเบียนสำเนาอัปเดตตำแหน่งแล้ว' },
  ] : [
    { key: 'physical_receipt_confirmed', label: 'ยืนยันรับเล่มจริงคืนจากแผนกแล้ว (พร้อมลายเซ็น)' },
    { key: 'stamp_cancelled', label: 'ยืนยันประทับ "ยกเลิก" หรือ "ยกเลิกการใช้งาน" บนเล่มแล้ว' },
    { key: 'register_removed', label: 'ลบสำเนาออกจากทะเบียนสำเนาใช้งานแล้ว' },
    { key: 'archive_or_destroy', label: 'บันทึกวิธีจัดการ (เก็บถาวร / ทำลาย) พร้อมพยาน' },
  ];

  const allChecked = CHECKLISTS.every(item => checklistItems[item.key]);
  const toggle = (key) => setChecklistItems(prev => ({ ...prev, [key]: !prev[key] }));

  const handleApprove = async () => {
    if (!allChecked) return;
    setIsSubmitting(true);
    try {
      if (isRelocation) {
        if ((await approveCcRelocation(task.id, { notes: notes.trim(), checklistVerified: true })) === false) return;
        toast.success(`อนุมัติย้ายจุดติดตั้ง ${docCode} Copy ${copyNo} เรียบร้อยแล้ว`, { icon: '✅', duration: 4000 });
      } else {
        if ((await approveCcReturn(task.id, {
          dispositionMethod,
          witnessName: witnessName.trim(),
          notes: notes.trim(),
          checklistVerified: true
        })) === false) return;
        toast.success(`อนุมัติรับคืน ${docCode} Copy ${copyNo} เรียบร้อยแล้ว`, { icon: '✅', duration: 4000 });
      }
      onClose();
    } catch (err) {
      toast.error(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setIsSubmitting(true);
    try {
      if (isRelocation) {
        if ((await rejectCcRelocation(task.id, { rejectReason: rejectReason.trim() })) === false) return;
      } else {
        if ((await rejectCcReturn(task.id, { rejectReason: rejectReason.trim() })) === false) return;
      }
      toast.success(`ปฏิเสธคำขอ ${docCode} Copy ${copyNo} แล้ว`, { icon: '❌', duration: 4000 });
      onClose();
    } catch (err) {
      toast.error(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setIsSubmitting(false);
    }
  };

  const gradientClass = isRelocation
    ? 'from-sky-600 to-blue-700'
    : 'from-amber-500 to-orange-600';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[90vh] flex flex-col"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          >
            {/* Header */}
            <div className={`bg-gradient-to-r ${gradientClass} px-6 py-4 flex items-center justify-between shrink-0`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  {isRelocation ? <MapPin size={18} className="text-white" /> : <CornerDownLeft size={18} className="text-white" />}
                </div>
                <div>
                  <h2 className="text-white font-semibold text-base leading-tight">
                    {isRelocation ? 'อนุมัติขอย้ายจุดติดตั้ง' : 'อนุมัติขอส่งคืน / ยกเลิกสำเนา'}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ShieldCheck size={11} className="text-white/70" />
                    <p className="text-white/70 text-xs">ISO 9001 Clause 7.5.3 – Physical Verification</p>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1">
              {/* Task Summary */}
              <div className="px-6 pt-5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 border border-slate-300">Copy {copyNo}</span>
                    <span className="text-sm font-bold text-slate-800 truncate" title={docTitle}>{docCode}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div>
                      <span className="text-slate-400 font-medium">ผู้ยื่นคำขอ</span>
                      <p className="text-slate-700 font-semibold mt-0.5">{requesterName} ({requesterDept})</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">จุดติดตั้งปัจจุบัน</span>
                      <p className="text-slate-700 font-semibold mt-0.5 flex items-center gap-1"><MapPin size={11} className="text-slate-400" />{currentLocation}</p>
                    </div>
                    {isRelocation && (
                      <>
                        <div>
                          <span className="text-slate-400 font-medium">จุดติดตั้งใหม่</span>
                          <p className="text-sky-700 font-semibold mt-0.5">{newLocation || '-'}</p>
                        </div>
                        {newDepartment && (
                          <div>
                            <span className="text-slate-400 font-medium">แผนกใหม่</span>
                            <p className="text-sky-700 font-semibold mt-0.5">{newDepartment}</p>
                          </div>
                        )}
                      </>
                    )}
                    {isReturn && (
                      <div>
                        <span className="text-slate-400 font-medium">วันนัดส่งคืน</span>
                        <p className="text-amber-700 font-semibold mt-0.5">{returnDate}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="text-slate-400 font-medium">เหตุผล</span>
                      <p className="text-slate-700 mt-0.5 leading-relaxed">{reason}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Physical Verification Checklist */}
              <div className="px-6 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={15} className="text-slate-500" />
                  <span className="text-sm font-bold text-slate-700">รายการตรวจสอบจริง (Physical Verification)</span>
                  <span className="text-xs text-slate-400 font-medium ml-auto">
                    {CHECKLISTS.filter(i => checklistItems[i.key]).length}/{CHECKLISTS.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {CHECKLISTS.map(item => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggle(item.key)}
                      className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                        checklistItems[item.key]
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {checklistItems[item.key]
                        ? <CheckSquare size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                        : <Square size={16} className="text-slate-400 mt-0.5 shrink-0" />}
                      <span className="text-xs font-medium leading-snug">{item.label}</span>
                    </button>
                  ))}
                </div>
                {!allChecked && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    กรุณาตรวจสอบและกาครบทุกรายการก่อนกดอนุมัติ
                  </p>
                )}
              </div>

              {/* Return-specific: Disposition method */}
              {isReturn && (
                <div className="px-6 pt-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">วิธีจัดการสำเนาที่รับคืน</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'ARCHIVE', label: '📁 เก็บถาวร (Archive)', desc: 'เก็บไว้เพื่อบันทึก' },
                      { value: 'DESTROY', label: '🗑️ ทำลาย (Destroy)', desc: 'ทำลายตามระเบียบ' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDispositionMethod(opt.value)}
                        className={`flex flex-col items-start px-4 py-3 rounded-xl border text-left transition-colors ${
                          dispositionMethod === opt.value
                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-sm font-semibold">{opt.label}</span>
                        <span className="text-xs text-slate-400 mt-0.5">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <input
                      type="text"
                      value={witnessName}
                      onChange={e => setWitnessName(e.target.value)}
                      placeholder="ชื่อพยาน (ถ้ามี)"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-shadow"
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="px-6 pt-4">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ DCC (ถ้ามี)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="หมายเหตุเพิ่มเติมสำหรับบันทึก..."
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-shadow resize-none"
                />
              </div>

              {/* Reject form */}
              <AnimatePresence>
                {showRejectForm && (
                  <motion.div
                    className="px-6 pt-4"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                      <label className="block text-sm font-semibold text-rose-700 mb-2">
                        เหตุผลที่ปฏิเสธ <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="ระบุเหตุผลที่ DCC ปฏิเสธคำขอนี้..."
                        rows={2}
                        className="w-full px-3 py-2.5 text-sm border border-rose-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-shadow resize-none"
                        autoFocus
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-5" />
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
              {!showRejectForm ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(true)}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    ปฏิเสธ
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={!allChecked || isSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
                  >
                    {isSubmitting ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : <Check size={15} />}
                    อนุมัติ (ตรวจสอบแล้ว)
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={!rejectReason.trim() || isSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
                  >
                    {isSubmitting ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : <XCircle size={14} />}
                    ยืนยันปฏิเสธ
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DccCustodyActionModal;
