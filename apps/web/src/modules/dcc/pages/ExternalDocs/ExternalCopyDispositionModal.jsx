import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, Archive, CheckCircle2, Layers, MapPin, ShieldCheck } from 'lucide-react';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';

/**
 * ExternalCopyDispositionModal
 * Dedicated modal for DCC Admin to record physical recall / disposition
 * (Shred / Destroy OR Stamp VOID & Archive) for external document controlled copies.
 */
const ExternalCopyDispositionModal = ({ 
  isOpen, 
  onClose, 
  document: doc, 
  copies = [], 
  onSuccess 
}) => {
  const { currentUser, recordExternalCopyDisposition } = useStore();

  const [selectedCopyIds, setSelectedCopyIds] = useState([]);
  const [dispositionAction, setDispositionAction] = useState('SHREDDED'); // 'SHREDDED' | 'STAMPED_VOID'
  const [dispositionDate, setDispositionDate] = useState(new Date().toISOString().split('T')[0]);
  const [witnessName, setWitnessName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize selected copies: pre-select those with status PENDING_RECALL, or all if none
  useEffect(() => {
    if (isOpen && copies.length > 0) {
      const pendingIds = copies
        .filter(c => c.status === 'PENDING_RECALL' || c.status === 'SUPERSEDED_PENDING_RECALL' || c.status === 'OBSOLETE_PENDING_RECALL')
        .map(c => String(c.id));

      if (pendingIds.length > 0) {
        setSelectedCopyIds(pendingIds);
      } else {
        setSelectedCopyIds(copies.map(c => String(c.id)));
      }
      setDispositionAction('SHREDDED');
      setDispositionDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setWitnessName('');
      setReferenceNo('');
    }
  }, [isOpen, copies]);

  if (!isOpen || !doc) return null;

  const docCode = doc.edCode || doc.doc_code || doc.docNo || doc.id || 'ED-DOC';
  const docEdition = doc.edition || doc.sourceVersion || 'ฉบับต้นทาง';

  const handleToggleSelectCopy = (id) => {
    const strId = String(id);
    setSelectedCopyIds(prev => 
      prev.includes(strId) ? prev.filter(i => i !== strId) : [...prev, strId]
    );
  };

  const handleSelectAll = () => {
    if (selectedCopyIds.length === copies.length) {
      setSelectedCopyIds([]);
    } else {
      setSelectedCopyIds(copies.map(c => String(c.id)));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedCopyIds.length === 0) {
      toast.error('กรุณาเลือกสำเนาที่ต้องการบันทึกการจัดการอย่างน้อย 1 เล่ม');
      return;
    }

    setIsSubmitting(true);
    try {
      const recalledAtIso = `${dispositionDate}T${new Date().toTimeString().split(' ')[0]}`;
      const payload = {
        dispositionAction,
        recalledAt: recalledAtIso,
        recalledBy: currentUser?.name || 'DCC Admin',
        witnessName: witnessName.trim(),
        referenceNo: referenceNo.trim(),
        notes: notes.trim()
      };

      // Record disposition for selected copies
      // API mode returns false when any copy was refused (the API already showed why); demo mode returns nothing.
      if (await recordExternalCopyDisposition(doc.id, selectedCopyIds, payload) === false) return;

      const actionText = dispositionAction === 'SHREDDED' 
        ? 'ทำลายทิ้ง (Shred / Destroy)' 
        : 'ประทับตรายกเลิก (Stamp VOID / Archive)';

      toast.success(`บันทึกการจัดการสำเนา (${actionText}) จำนวน ${selectedCopyIds.length} เล่ม เรียบร้อยแล้ว`);
      
      if (onSuccess) {
        onSuccess({ selectedCopyIds, dispositionAction });
      }
      onClose();
    } catch (err) {
      console.error('Error recording external copy disposition:', err);
      toast.error('เกิดข้อผิดพลาดในการบันทึกการจัดการสำเนา');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0"
          />

          {/* Modal Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 my-auto"
          >
            {/* Header */}
            <div className="bg-white px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5 min-w-0 pr-2">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                  <Flame size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#E5F4FF] text-[#0D99FF] border border-[#B8E1FF] text-xs font-bold font-mono">
                      {docCode}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold font-mono">
                      {docEdition}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold">
                      DCC Disposition
                    </span>
                  </div>
                  <h2 className="text-slate-900 font-bold text-base sm:text-lg tracking-tight truncate">
                    บันทึกการเรียกคืน/ทำลายสำเนาควบคุม (Copy Disposition)
                  </h2>
                </div>
              </div>

              <button 
                type="button"
                onClick={onClose} 
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors outline-none cursor-pointer shrink-0"
                title="ปิดหน้าต่าง"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <form id="disposition-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-6 bg-slate-50 custom-scrollbar">
              {/* Step 1: Select Copies */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      1. เลือกเล่มสำเนาที่ต้องการบันทึกการจัดการ
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs font-bold text-[#0D99FF] hover:text-blue-700 cursor-pointer"
                  >
                    {selectedCopyIds.length === copies.length ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {copies.length > 0 ? (
                    copies.map((c, i) => {
                      const isChecked = selectedCopyIds.includes(String(c.id));
                      const isPending = c.status === 'PENDING_RECALL' || c.status === 'SUPERSEDED_PENDING_RECALL' || c.status === 'OBSOLETE_PENDING_RECALL';
                      const isAlreadyDestroyed = c.status === 'DESTROYED' || c.status === 'RECALLED_DESTROYED';
                      const isAlreadyRecalled = c.status === 'RECALLED';

                      return (
                        <div
                          key={c.id || i}
                          onClick={() => handleToggleSelectCopy(c.id)}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/10'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-xs text-slate-900">
                                  {c.copy_no ? (String(c.copy_no).startsWith('Copy') ? c.copy_no : `Copy ${c.copy_no}`) : (c.ccNumber || `Copy ${i + 1}`)}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {c.holder_dept || c.department || 'ไม่ระบุแผนก'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                                <MapPin size={11} className="shrink-0 text-slate-400" />
                                <span className="truncate">{c.location || c.locationName || c.installationPoint || 'จุดติดตั้งประจำแผนก'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isPending && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                รอเรียกคืน
                              </span>
                            )}
                            {isAlreadyDestroyed && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                ทำลายแล้ว
                              </span>
                            )}
                            {isAlreadyRecalled && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                เรียกคืนแล้ว
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center py-4 text-xs text-slate-400">
                      ไม่พบรายการสำเนาควบคุมสำหรับเอกสารฉบับนี้
                    </p>
                  )}
                </div>
              </div>

              {/* Step 2: Disposition Method */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <ShieldCheck size={16} className="text-amber-600" />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    2. เลือกวิธีการจัดการเล่มสำเนาจริง (Disposition Method)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Option 1: SHREDDED */}
                  <label 
                    className={`p-4 rounded-xl border flex items-start gap-3.5 cursor-pointer transition-all ${
                      dispositionAction === 'SHREDDED'
                        ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-500/15 text-rose-950 font-medium'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dispositionAction"
                      value="SHREDDED"
                      checked={dispositionAction === 'SHREDDED'}
                      onChange={() => setDispositionAction('SHREDDED')}
                      className="mt-1 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-rose-900">
                        <Flame size={15} className="text-rose-600" />
                        <span>ย่อยทำลายทิ้ง (Shred / Destroy)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        ทำลายเล่มกระดาษด้วยเครื่องย่อยเอกสาร สำเนาจะถูกเปลี่ยนสถานะเป็น <strong>DESTROYED</strong> ถาวร
                      </p>
                    </div>
                  </label>

                  {/* Option 2: STAMPED_VOID */}
                  <label 
                    className={`p-4 rounded-xl border flex items-start gap-3.5 cursor-pointer transition-all ${
                      dispositionAction === 'STAMPED_VOID'
                        ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/15 text-indigo-950 font-medium'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dispositionAction"
                      value="STAMPED_VOID"
                      checked={dispositionAction === 'STAMPED_VOID'}
                      onChange={() => setDispositionAction('STAMPED_VOID')}
                      className="mt-1 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-indigo-900">
                        <Archive size={15} className="text-indigo-600" />
                        <span>ประทับตรายกเลิก (Stamp VOID / Archive)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        ปั๊มตรา "ยกเลิก / OBSOLETE" เพื่อจัดเก็บเป็นหลักฐานในคลังประวัติ สำเนาจะเปลี่ยนสถานะเป็น <strong>RECALLED</strong>
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Step 3: Execution Details */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2.5">
                  3. บันทึกรายละเอียดการดำเนินการ (Execution Details)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      วันที่ดำเนินการ (Disposition Date) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={dispositionDate}
                      onChange={(e) => setDispositionDate(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      ผู้ดำเนินการ (DCC Officer)
                    </label>
                    <input
                      type="text"
                      value={currentUser?.name || 'DCC Admin'}
                      disabled
                      className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 cursor-not-allowed outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      พยานรับรองการทำลาย (Witness Name)
                    </label>
                    <input
                      type="text"
                      value={witnessName}
                      onChange={(e) => setWitnessName(e.target.value)}
                      placeholder="เช่น QA Manager, EMR หรือหัวหน้าแผนก..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none placeholder:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      เลขที่เอกสารอ้างอิง (Reference No.)
                    </label>
                    <input
                      type="text"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      placeholder="เช่น EDR-2026-0001, DISP-001..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    หมายเหตุ / บันทึกการทำลาย (Notes &amp; Remarks)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="ระบุรายละเอียดเพิ่มเติม เช่น ย่อยทำลายด้วยเครื่องตัดกระดาษละเอียดตามมาตรฐานความปลอดภัย..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none resize-none placeholder:text-slate-400 leading-relaxed"
                  />
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500">
                เลือกดำเนินการ: <span className="font-bold font-mono text-slate-800">{selectedCopyIds.length}</span> จาก <span className="font-mono">{copies.length}</span> เล่ม
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="btn-secondary text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-300 transition-colors cursor-pointer"
                >
                  ยกเลิก (Cancel)
                </button>
                <button
                  type="submit"
                  form="disposition-form"
                  disabled={isSubmitting || selectedCopyIds.length === 0}
                  className={`text-xs font-bold px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 text-white cursor-pointer ${
                    dispositionAction === 'SHREDDED'
                      ? 'bg-rose-600 hover:bg-rose-700 active:scale-98'
                      : 'bg-[#0D99FF] hover:bg-[#007BE5] active:scale-98'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    {isSubmitting ? 'กำลังบันทึก...' : `ยืนยันการบันทึก (${selectedCopyIds.length} เล่ม)`}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ExternalCopyDispositionModal;
