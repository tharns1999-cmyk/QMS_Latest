import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Info, Send } from 'lucide-react';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';
import { STANDARD_STATIONS } from '../../services/MasterDataService';

/**
 * RelocateCopyModal
 * ISO 9001 Clause 7.5.3 - Custody Workflow: Request Relocation
 * Allows a department custodian to request moving a controlled copy to a new physical station.
 * Origin Invariant (Copy 01) is enforced in the store; the UI also hides the trigger for Copy 01.
 */
const RelocateCopyModal = ({ isOpen, onClose, copy }) => {
  const { requestCcRelocation, masterDepartments } = useStore();

  const [newLocation, setNewLocation] = useState('');
  const [newDepartment, setNewDepartment] = useState(copy?.holder_dept || copy?.department || '');
  const [reason, setReason] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stationOptions = React.useMemo(() => {
    const fromStandard = (STANDARD_STATIONS || []).map(s =>
      typeof s === 'string' ? { label: s, value: s } : { label: s.name || s.label || s.value, value: s.name || s.value }
    );
    const fromDepts = (masterDepartments || []).map(d => ({
      label: d.name || d.label || d.id || d.code,
      value: d.name || d.label || d.id || d.code
    }));
    const seen = new Set();
    return [...fromStandard, ...fromDepts].filter(o => {
      if (!o.value || seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    });
  }, [masterDepartments]);

  if (!copy) return null;

  const rawNo = copy.copy_no || copy.ccNumber || '01';
  const docCode = copy.doc_code || copy.docTitle || copy.docCode || 'เอกสารควบคุม';
  const docName = copy.docName || copy.name || docCode;
  const currentLocation = copy.location || copy.locationName || copy.station_name || copy.holder_dept || '-';
  const currentDept = copy.holder_dept || copy.department || '-';

  const effectiveLocation = newLocation === '__custom__' ? customLocation : newLocation;
  const canSubmit = effectiveLocation.trim() && reason.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      if ((await requestCcRelocation(copy.id, {
        newLocation: effectiveLocation.trim(),
        newDepartment: (newDepartment || currentDept).trim(),
        reason: reason.trim()
      })) === false) return;
      toast.success(
        `ส่งคำขอย้ายจุดติดตั้ง ${docCode} Copy ${rawNo} ถึง DCC แล้ว`,
        { duration: 4000, icon: '📍' }
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
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <MapPin size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-base leading-tight">ขอย้ายจุดติดตั้งสำเนาควบคุม</h2>
                  <p className="text-sky-200 text-xs mt-0.5">Custody Workflow</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors" aria-label="ปิด">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 pt-5 pb-0">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 border border-sky-200">Copy {rawNo}</span>
                  <span className="text-sm font-semibold text-slate-700 truncate" title={docName}>{docCode}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><MapPin size={11} className="text-slate-400" />{currentLocation}</span>
                  <span className="text-slate-300">·</span>
                  <span>แผนก: <strong className="text-slate-600">{currentDept}</strong></span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  จุดติดตั้งใหม่ <span className="text-rose-500">*</span>
                </label>
                {stationOptions.length > 0 ? (
                  <select
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow"
                    required={newLocation !== '__custom__'}
                  >
                    <option value="">— เลือกจุดติดตั้ง —</option>
                    {stationOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                    <option value="__custom__">— ระบุเอง —</option>
                  </select>
                ) : null}
                {(newLocation === '__custom__' || stationOptions.length === 0) && (
                  <input
                    type="text"
                    value={customLocation}
                    onChange={e => setCustomLocation(e.target.value)}
                    placeholder="ระบุชื่อจุดติดตั้ง / สถานี"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow mt-2"
                    required
                    autoFocus={stationOptions.length > 0}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">แผนกผู้รับ (ถ้าเปลี่ยน)</label>
                <select
                  value={newDepartment}
                  onChange={e => setNewDepartment(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow"
                >
                  <option value="">— ไม่เปลี่ยนแผนก ({currentDept}) —</option>
                  {(masterDepartments || []).map(d => (
                    <option key={d.id || d.code} value={d.id || d.code}>{d.name || d.label || d.id || d.code}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  เหตุผลที่ขอย้าย <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="ระบุเหตุผล เช่น ย้ายสายการผลิต, ปรับพื้นที่ทำงาน..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow resize-none"
                  required
                />
              </div>

              <div className="flex items-start gap-2.5 px-3.5 py-3 bg-sky-50 border border-sky-100 rounded-xl">
                <Info size={14} className="text-sky-500 mt-0.5 shrink-0" />
                <p className="text-xs text-sky-700 leading-relaxed">
                  คำขอนี้จะส่งถึง <strong>DCC</strong> เพื่อตรวจสอบและอนุมัติ หลังจากอนุมัติ ข้อมูลตำแหน่งสำเนาจะอัปเดตโดยอัตโนมัติ
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">ยกเลิก</button>
                <button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-2"
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

export default RelocateCopyModal;
