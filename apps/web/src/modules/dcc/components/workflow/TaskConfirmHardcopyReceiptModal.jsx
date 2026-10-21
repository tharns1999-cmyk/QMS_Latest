import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, MapPin, Building, Printer, Calendar, UserCheck, AlertTriangle, Check } from 'lucide-react';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';
import { isLevel6Plus, userMatchesDepartment } from '../../utils/taskFilter';

const TaskConfirmHardcopyReceiptModal = ({ isOpen, onClose, task }) => {
  const { currentUser, confirmHardcopyReceipt, documentControlledCopies, controlledCopyInstances, documents, externalDocuments } = useStore();
  const [remarks, setRemarks] = useState('');
  const [hasAcknowledgedTerms, setHasAcknowledgedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !task) return null;

  const copies = documentControlledCopies || controlledCopyInstances || [];
  const copyId = String(task.copy_id || task.copyId || task.instanceId || '');
  const copy = copies.find(c => String(c.id) === copyId);

  const docCode = task.doc_code || task.docCode || copy?.doc_code || copy?.docTitle || task.title;
  
  // Resolve official document title
  const matchedDoc = (documents || []).find(d => d.id === copy?.doc_id || d.doc_code === docCode || d.title === docCode) ||
                     (externalDocuments || []).find(d => d.id === copy?.doc_id || d.edCode === docCode || d.doc_code === docCode);
  const docTitle = task.docTitle || task.docName || copy?.docName || copy?.docTitle || matchedDoc?.title || matchedDoc?.name || '';
  
  const docRev = task.doc_version || copy?.doc_version || copy?.rev || matchedDoc?.rev || '00';
  const copyNo = task.copy_no || copy?.copy_no || copy?.ccNumber || '01';
  const location = task.location || copy?.location || copy?.locationName || copy?.station_name || 'จุดใช้งานหลัก';
  const dept = task.target_department || task.targetDepartment || task.assignedToDept || copy?.holder_dept || copy?.department || currentUser?.department;
  const dispatchedAt = copy?.dispatched_at || task.createdAt;

  const isLevel6 = isLevel6Plus(currentUser);
  const isWildcardUser = currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN';
  const isAuthorized = !isLevel6 && (isWildcardUser || !dept || userMatchesDepartment(currentUser, dept));

  const formatThaiDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return String(dateStr);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLevel6) {
      toast.error('ผู้บริหารระดับสูง (Level 6 ขึ้นไป) ไม่มีหน้าที่ตรวจรับสำเนาควบคุมหน้างาน');
      return;
    }
    if (!isAuthorized) {
      toast.error(`คุณไม่มีสิทธิ์ตรวจรับเอกสารของแผนก ${dept}`);
      return;
    }
    if (!hasAcknowledgedTerms) {
      toast.error('กรุณากดยืนยันข้อความรับรองการตรวจรับเอกสาร');
      return;
    }

    setIsSubmitting(true);
    try {
      const confirmed = await confirmHardcopyReceipt(copyId, task.id, {
        document_id: docCode,
        copy_id: copyId,
        receiver_user_id: currentUser?.id || currentUser?.empId || 'UNKNOWN_USER',
        actor_name: currentUser?.fullName || currentUser?.name || 'Department Custodian',
        actor_primary_department: currentUser?.primary_department || currentUser?.department || 'UNKNOWN_DEPT',
        task_department: dept,
        timestamp: new Date().toISOString(),
        remarks: remarks || 'Confirmed receipt and physical placement at point of use'
      });
      if (confirmed === false) return; // API mode: the server refused and said why
      toast.success(`ตรวจรับสำเนา Copy ${copyNo} เรียบร้อยแล้ว`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการยืนยัน');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col z-10 my-auto"
        >
          {/* Header */}
          <div className="bg-white px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5 min-w-0 pr-2">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0 shadow-2xs">
                <Printer size={22} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-slate-900 font-bold text-lg sm:text-xl tracking-tight leading-tight truncate">
                  ตรวจรับสำเนาควบคุมหน้างาน (Controlled Copy Receipt)
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md shadow-2xs">
                    {docCode}
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shadow-2xs">
                    Rev.{docRev}
                  </span>
                  {docTitle && (
                    <span className="text-slate-600 text-xs font-medium truncate max-w-xs sm:max-w-sm">
                      {docTitle}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-xl transition-colors outline-none cursor-pointer shrink-0"
              title="ปิดหน้าต่าง"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <form id="receipt-form" onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 space-y-5 bg-slate-50/70 overflow-y-auto flex-1 custom-scrollbar">
              
              {/* Bento-Style Physical Copy Details Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Copy No. & Location */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Printer size={14} className="text-blue-500" /> หมายเลขสำเนา / Copy No.
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-mono font-extrabold text-blue-600">
                      Copy {copyNo}
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      สำเนาควบคุมทางการ
                    </span>
                  </div>
                </div>

                {/* 2. Point of Use / Location */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <MapPin size={14} className="text-emerald-600" /> จุดใช้งานจริง / Point of Use
                  </span>
                  <p className="font-bold text-slate-800 text-sm sm:text-base truncate" title={location}>
                    {location}
                  </p>
                </div>

                {/* 3. Custodian Department */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Building size={14} className="text-amber-500" /> แผนกผู้ถือครอง / Custodian
                  </span>
                  <p className="font-bold text-slate-800 text-sm sm:text-base">
                    {dept || 'ส่วนกลาง'}
                  </p>
                </div>

                {/* 4. Dispatch Date by DCC */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Calendar size={14} className="text-indigo-500" /> วันที่จัดพิมพ์/ส่งมอบโดย DCC
                  </span>
                  <p className="font-semibold text-slate-700 text-sm">
                    {formatThaiDate(dispatchedAt)}
                  </p>
                </div>
              </div>

              {/* Recipient User Badge (Automatic User & Role Profile) */}
              <div className="p-4 bg-gradient-to-r from-blue-50/60 via-slate-50 to-emerald-50/40 border border-blue-100 rounded-xl flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                    <UserCheck size={18} />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">ผู้ลงชื่อตรวจรับ (Recipient)</span>
                    <strong className="text-slate-900 font-bold text-sm">
                      {currentUser?.fullName || currentUser?.name || 'User'}
                    </strong>
                    <span className="text-xs text-slate-500 ml-1.5">
                      ({currentUser?.position || currentUser?.role || 'Department Member'} • {currentUser?.primary_department || currentUser?.department || dept})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                  <CheckCircle2 size={14} /> พร้อมตรวจรับ
                </div>
              </div>

              {!isAuthorized && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-sm text-rose-700 shadow-sm leading-relaxed">
                  <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">ไม่มีสิทธิ์ตรวจรับเอกสารของแผนกอื่น</p>
                    <p className="text-xs text-rose-600 mt-0.5">
                      เอกสารนี้จัดส่งสำหรับแผนก <strong>{dept}</strong> เท่านั้น
                    </p>
                  </div>
                </div>
              )}

              {/* Remarks & Compliance Confirmation Checkbox */}
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                    บันทึกสภาพเอกสารและจุดติดตั้ง (Optional Remarks):
                  </label>
                  <textarea
                    disabled={!isAuthorized}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="เช่น ตรวจสอบตราประทับสีแดงเรียบร้อย เอกสารครบถ้วนสมบูรณ์ นำเข้าแฟ้มประจำจุดใช้งานเรียบร้อยแล้ว"
                    rows={2}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all resize-none font-medium text-slate-800 placeholder:text-slate-400 leading-relaxed shadow-2xs disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>

                <label className="flex items-start gap-3 p-3.5 bg-white border border-slate-200 rounded-xl cursor-pointer select-none hover:bg-slate-50/80 transition-colors shadow-2xs">
                  <input
                    type="checkbox"
                    disabled={!isAuthorized}
                    checked={hasAcknowledgedTerms}
                    onChange={(e) => setHasAcknowledgedTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 disabled:opacity-50 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed font-medium">
                    ข้าพเจ้าขอยืนยันว่าได้รับเอกสารฉบับพิมพ์จริงที่มีตราประทับควบคุม และติดตั้ง ณ จุดใช้งาน (<strong className="text-slate-900">{location}</strong>) ครบถ้วนสมบูรณ์เรียบร้อยแล้ว
                  </span>
                </label>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex gap-3 justify-end items-center shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn-secondary text-sm font-semibold px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors outline-none cursor-pointer"
              >
                ยกเลิก / ปิด (Cancel)
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isAuthorized || !hasAcknowledgedTerms}
                className="text-sm font-semibold px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:pointer-events-none outline-none cursor-pointer active:scale-98"
              >
                <Check size={18} className="stroke-[2.5]" />
                {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันการตรวจรับสำเนา (Confirm Receipt)'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default TaskConfirmHardcopyReceiptModal;

