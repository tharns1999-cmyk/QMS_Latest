import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Archive, Calendar, Layers } from 'lucide-react';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';
import UserSelector from '../../components/UserSelector';
import ActionConfirmModal from '../../../../shared/components/common/ActionConfirmModal';

const ExternalDocObsoleteModal = ({ isOpen, onClose, documentToObsolete }) => {
  const { currentUser, masterUsers, obsoleteExternalDoc, controlledCopyInstances, documentControlledCopies } = useStore();
  const [formData, setFormData] = useState({
    effectiveDate: new Date().toISOString().split('T')[0],
    reason: '',
    reviewerId: '',
    approverId: ''
  });
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        effectiveDate: new Date().toISOString().split('T')[0],
        reason: '',
        reviewerId: '',
        approverId: ''
      });
    }
  }, [isOpen, documentToObsolete]);

  // Helper to determine if a user matches Current User / Requester
  const isCurrentUser = useCallback((u) => {
    if (!u || !currentUser) return false;
    const currentId = currentUser?.id;
    const currentEmpId = currentUser?.empId;
    const currentUsername = currentUser?.username;
    const currentName = (currentUser?.name || currentUser?.fullName || '').trim().toLowerCase();

    const uId = u.id;
    const uEmpId = u.empId;
    const uUsername = u.username;
    const uName = (u.name || u.fullName || '').trim().toLowerCase();

    if (currentId && (uId === currentId || uEmpId === currentId || uUsername === currentId)) return true;
    if (currentEmpId && (uId === currentEmpId || uEmpId === currentEmpId || uUsername === currentEmpId)) return true;
    if (currentUsername && (uUsername === currentUsername || uId === currentUsername)) return true;
    if (currentName && uName && (uName === currentName)) return true;
    return false;
  }, [currentUser]);

  // Rule 1: Eligible Reviewers (Exclude DCC Admin, Current User, and selected Approver)
  const eligibleReviewers = useMemo(() => {
    return (masterUsers || []).filter(u => {
      if (!u || !u.id) return false;
      if (u.role === 'DCC_ADMIN' || u.isDcc || u.isDccAdmin) return false;
      if (isCurrentUser(u)) return false;
      if (formData?.approverId && (u.id === formData.approverId || u.empId === formData.approverId)) return false;
      return true;
    });
  }, [masterUsers, isCurrentUser, formData?.approverId]);

  // Rule 2: Eligible Approvers (Exclude DCC Admin, Current User, and selected Reviewer)
  const eligibleApprovers = useMemo(() => {
    return (masterUsers || []).filter(u => {
      if (!u || !u.id) return false;
      if (u.role === 'DCC_ADMIN' || u.isDcc || u.isDccAdmin) return false;
      if (isCurrentUser(u)) return false;
      if (formData?.reviewerId && (u.id === formData.reviewerId || u.empId === formData.reviewerId)) return false;
      return true;
    });
  }, [masterUsers, isCurrentUser, formData?.reviewerId]);

  const docCode = documentToObsolete?.edCode || documentToObsolete?.doc_code || documentToObsolete?.docNo || documentToObsolete?.id;

  // Active controlled copies in circulation that will require physical recall
  const activeCopiesToRecall = useMemo(() => {
    if (!documentToObsolete) return [];
    const targetId = String(documentToObsolete.id);
    const targetCode = String(docCode || '').trim().toUpperCase();

    const allStoreCopies = (controlledCopyInstances && controlledCopyInstances.length > 0)
      ? controlledCopyInstances
      : (documentControlledCopies || []);

    const embeddedCopies = Array.isArray(documentToObsolete.controlledCopies) ? documentToObsolete.controlledCopies : [];

    const map = new Map();
    embeddedCopies.forEach(c => map.set(c.id, c));
    allStoreCopies.forEach(sc => {
      const matchId = String(sc.externalDocId || sc.external_doc_id || sc.docId || sc.doc_id) === targetId;
      const copyDocCode = String(sc.doc_code || sc.docCode || sc.docTitle || '').trim().toUpperCase();
      const matchCode = Boolean(targetCode && copyDocCode === targetCode);
      if (matchId || matchCode) {
        map.set(sc.id, sc);
      }
    });

    const combined = Array.from(map.values());
    return combined.filter(c => {
      const s = String(c.status || 'ACTIVE').toUpperCase();
      return s !== 'DESTROYED' && s !== 'RECALLED' && s !== 'ARCHIVED_OBSOLETE';
    });
  }, [documentToObsolete, docCode, controlledCopyInstances, documentControlledCopies]);

  if (!isOpen || !documentToObsolete) return null;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!formData.reason?.trim() || !formData.reviewerId || !formData.approverId) {
      toast.error('กรุณาระบุเหตุผลการยกเลิก และเลือก Reviewer และ Approver ให้ครบถ้วน');
      return;
    }

    const currentUserId = currentUser?.id;
    const currentUserEmpId = currentUser?.empId;
    const currentUsername = currentUser?.username;

    const isMatchCurrentUser = (selectedId) => {
      if (!selectedId || !currentUser) return false;
      if (currentUserId && (selectedId === currentUserId || selectedId === currentUserEmpId || selectedId === currentUsername)) return true;
      if (currentUserEmpId && (selectedId === currentUserEmpId || selectedId === currentUserId)) return true;
      if (currentUsername && selectedId === currentUsername) return true;

      const targetUser = (masterUsers || []).find(u => u.id === selectedId || u.empId === selectedId || u.username === selectedId);
      if (targetUser && isCurrentUser(targetUser)) return true;
      return false;
    };

    const isRequesterReviewer = isMatchCurrentUser(formData.reviewerId);
    const isRequesterApprover = isMatchCurrentUser(formData.approverId);

    if (isRequesterReviewer || isRequesterApprover) {
      toast.error('ผู้ยื่นคำร้องไม่สามารถเป็นผู้ทบทวนหรือผู้อนุมัติเอกสารได้ (ISO 9001 SoD Violation)');
      return;
    }

    if (formData.reviewerId === formData.approverId) {
      toast.error('ผู้ทบทวนและผู้อนุมัติต้องไม่เป็นบุคคลเดียวกัน (ISO 9001 SoD Violation)');
      return;
    }

    setShowConfirm(true);
  };

  const executeSubmit = () => {
    const currentUserId = currentUser?.id;
    const currentUserEmpId = currentUser?.empId;
    const currentUsername = currentUser?.username;

    const isMatchCurrentUser = (selectedId) => {
      if (!selectedId || !currentUser) return false;
      if (currentUserId && (selectedId === currentUserId || selectedId === currentUserEmpId || selectedId === currentUsername)) return true;
      if (currentUserEmpId && (selectedId === currentUserEmpId || selectedId === currentUserId)) return true;
      if (currentUsername && selectedId === currentUsername) return true;

      const targetUser = (masterUsers || []).find(u => u.id === selectedId || u.empId === selectedId || u.username === selectedId);
      if (targetUser && isCurrentUser(targetUser)) return true;
      return false;
    };

    if (isMatchCurrentUser(formData.reviewerId) || isMatchCurrentUser(formData.approverId) || formData.reviewerId === formData.approverId) {
      toast.error('ข้อมูลผู้ลงนามไม่ถูกต้องตามหลักการแบ่งแยกหน้าที่ (SoD)');
      return;
    }

    obsoleteExternalDoc(documentToObsolete.id, {
      reason: formData.reason,
      effectiveDate: formData.effectiveDate,
      obsoleteEffectiveDate: formData.effectiveDate,
      reviewerId: formData.reviewerId,
      approverId: formData.approverId
    });
    
    toast.success(`ส่งคำขอยกเลิกเอกสาร ${docCode} เรียบร้อยแล้ว`);
    setShowConfirm(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 my-auto"
          >
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                  <Archive size={22} />
                </div>
                <div>
                  <h2 className="text-slate-900 font-bold text-lg sm:text-xl tracking-tight flex items-center gap-2">
                    ขอยกเลิกเอกสารภายนอก (Obsolete Request)
                  </h2>
                  <p className="text-slate-500 text-xs mt-0.5 font-medium">
                    {docCode} - {documentToObsolete.title}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors outline-none cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 overflow-y-auto flex-1 space-y-6 bg-slate-50 custom-scrollbar">
              <div className="bg-[#f5e6e6] border border-[#e5cdcd] rounded-xl p-5 flex gap-4 text-[#a94442] shadow-sm">
                <AlertTriangle className="shrink-0 text-[#a94442] mt-0.5" size={24} />
                <div className="text-sm space-y-1.5">
                  <p className="font-bold text-[#8a3331] text-base">คำเตือนการยกเลิกเอกสาร (Obsolete Warning)</p>
                  <p className="text-[#a94442] leading-relaxed">
                    คุณกำลังทำเรื่องขอยกเลิกเอกสาร <strong className="font-mono">{docCode}</strong> ({documentToObsolete.title}) เมื่อผ่านการอนุมัติ เอกสารจะถูกเปลี่ยนสถานะเป็น <strong>OBSOLETE</strong> ทันที
                  </p>
                </div>
              </div>

              {/* Controlled Copy Warning Box */}
              {activeCopiesToRecall.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3.5 text-amber-900 shadow-2xs">
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-700 shrink-0 self-start">
                    <Layers size={20} />
                  </div>
                  <div className="text-xs space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-bold text-amber-900 text-sm">
                        แจ้งเตือนสำเนาควบคุมในระบบ (Controlled Copies Recall Notice)
                      </p>
                      <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[11px] bg-amber-200/80 text-amber-800 border border-amber-300">
                        {activeCopiesToRecall.length} เล่ม
                      </span>
                    </div>
                    <p className="text-amber-800 leading-relaxed">
                      พบสำเนาควบคุมที่กำลังใช้งานอยู่ประจำจุดปฏิบัติงานจำนวน <strong>{activeCopiesToRecall.length} เล่ม</strong> เมื่อคำร้องขอยกเลิกนี้ได้รับการอนุมัติ สำเนาทั้งหมดจะถูกปรับสถานะเป็น <strong className="text-amber-900 font-mono">"รอเรียกคืน (PENDING_RECALL)"</strong> โดยอัตโนมัติ เพื่อส่งมอบให้เจ้าหน้าที่ DCC ดำเนินการเรียกคืนและทำลายตามข้อกำหนด ISO 9001
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {activeCopiesToRecall.slice(0, 5).map((c, i) => (
                        <span key={c.id || i} className="px-2 py-0.5 rounded bg-white/90 border border-amber-200 text-amber-800 font-mono text-[10px]">
                          {c.copy_no ? `Copy ${c.copy_no}` : (c.ccNumber || `Copy ${i + 1}`)} ({c.holder_dept || c.department || 'จุดใช้งาน'})
                        </span>
                      ))}
                      {activeCopiesToRecall.length > 5 && (
                        <span className="text-[10px] text-amber-700 font-medium">
                          + อีก {activeCopiesToRecall.length - 5} เล่ม
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <form id="obsolete-doc-form" onSubmit={handleFormSubmit} className="space-y-6 pb-12">
                {/* Effective Date Field */}
                <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-2">
                  <label className="block text-sm font-bold text-[#2d2d2d] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={15} className="text-stone-500" />
                      วันที่มีผลยกเลิก (Effective Date) <span className="text-[#da7756]">*</span>
                    </span>
                    <span className="text-[11px] font-normal text-stone-400">
                      ค่าเริ่มต้นคือวันนี้ (สามารถกำหนดวันล่วงหน้าได้)
                    </span>
                  </label>
                  <input
                    type="date"
                    value={formData.effectiveDate}
                    onChange={(e) => handleChange('effectiveDate', e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-[#f9f8f6] border border-stone-200 rounded-xl text-sm font-medium focus:bg-white focus:border-[#a94442] focus:ring-4 focus:ring-[#a94442]/10 transition-all outline-none"
                  />
                </div>

                <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-3">
                  <label className="block text-sm font-bold text-[#2d2d2d]">
                    เหตุผลในการยกเลิกเอกสาร (Obsolete Reason) <span className="text-[#da7756]">*</span>
                  </label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => handleChange('reason', e.target.value)}
                    className="w-full px-4 py-3 bg-[#f9f8f6] border border-stone-200 rounded-xl text-sm font-medium focus:bg-white focus:border-[#a94442] focus:ring-4 focus:ring-[#a94442]/10 transition-all outline-none resize-none placeholder:text-stone-400 leading-relaxed"
                    rows={3}
                    placeholder="ระบุเหตุผล เช่น มีกฎหมาย/มาตรฐานฉบับใหม่ออกมาแทนที่, ยกเลิกการใช้งานเครื่องจักร..."
                  />
                </div>

                <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-5 relative z-20">
                  <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest border-b border-stone-100 pb-3">
                    ผู้รับผิดชอบการทบทวนและอนุมัติการยกเลิก (Sign-Off)
                  </h3>

                  <div className="space-y-4">
                    <div className="relative z-30 focus-within:z-50">
                      <label className="block text-sm font-bold text-[#2d2d2d] mb-2">
                        ผู้ทบทวนการยกเลิก (External Reviewer) <span className="text-[#da7756]">*</span>
                      </label>
                      <UserSelector 
                        value={formData.reviewerId}
                        onChange={val => handleChange('reviewerId', val)}
                        users={eligibleReviewers}
                        placeholder="เลือกผู้ทบทวน (ที่ไม่ใช่ DCC Admin)..."
                      />
                    </div>

                    <div className="relative z-20 focus-within:z-40">
                      <label className="block text-sm font-bold text-[#2d2d2d] mb-2">
                        ผู้อนุมัติการยกเลิก (External Approver) <span className="text-[#da7756]">*</span>
                      </label>
                      <UserSelector 
                        value={formData.approverId}
                        onChange={val => handleChange('approverId', val)}
                        users={eligibleApprovers}
                        placeholder="เลือกผู้อนุมัติ (Manager / Director)..."
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-sm font-semibold px-5 py-2.5 rounded-xl border border-slate-300 transition-colors outline-none cursor-pointer"
              >
                ยกเลิก (Cancel)
              </button>
              <button
                type="submit"
                form="obsolete-doc-form"
                className="btn-danger text-sm font-semibold px-6 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 outline-none cursor-pointer"
              >
                <Archive size={18} />
                <span>ส่งคำขอยกเลิก (Submit Obsolete)</span>
              </button>
            </div>
          </motion.div>

          {showConfirm && (
            <ActionConfirmModal
              isOpen={showConfirm}
              onClose={() => setShowConfirm(false)}
              onConfirm={executeSubmit}
              title="ยืนยันการส่งคำขอยกเลิกเอกสารภายนอก"
              message={`คุณต้องการส่งคำขอยกเลิกเอกสาร ${docCode} หรือไม่?`}
              confirmLabel="ยืนยันการส่งคำขอ (Confirm)"
              summaryItems={[
                { label: 'รหัสเอกสาร (Code)', value: docCode },
                { label: 'ชื่อเอกสาร (Title)', value: documentToObsolete.title },
                { label: 'วันที่มีผลยกเลิก (Effective Date)', value: formData.effectiveDate },
                { label: 'สำเนาควบคุมที่ต้องเรียกคืน', value: `${activeCopiesToRecall.length} เล่ม` },
                { label: 'เหตุผล (Reason)', value: formData.reason }
              ]}
            />
          )}
        </div>
      )}
    </AnimatePresence>
  );
};

export default ExternalDocObsoleteModal;
