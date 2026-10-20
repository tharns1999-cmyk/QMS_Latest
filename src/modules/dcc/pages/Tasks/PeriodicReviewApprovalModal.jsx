import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  ShieldCheck, 
  RotateCcw,
  Check
} from 'lucide-react';
import useStore from '../../../../store/useStore';
import toast from 'react-hot-toast';
import { getCycleDisplayText } from '../../utils/documentUtils';

export default function PeriodicReviewApprovalModal({ isOpen, onClose, task }) {
  const { currentUser, approvePeriodicReview, rejectPeriodicReview, documents, externalDocuments, periodicReviewSchedules } = useStore();
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !task) return null;

  const payload = task.payload || {};
  const details = payload.details || {};

  const allDocs = [...(documents || []), ...(externalDocuments || [])];
  const targetDoc = allDocs.find(d => 
    (payload.doc_id && d.id === payload.doc_id) ||
    (payload.doc_code && (d.doc_code === payload.doc_code || d.code === payload.doc_code || d.document_number === payload.doc_code || d.title === payload.doc_code)) ||
    (task.docId && d.id === task.docId) ||
    (task.document_code && (d.doc_code === task.document_code || d.code === task.document_code || d.document_number === task.document_code))
  );
  const targetSchedule = (periodicReviewSchedules || []).find(s =>
    (payload.scheduleId && s.id === payload.scheduleId) ||
    (task.scheduleId && s.id === task.scheduleId) ||
    (payload.doc_id && (s.documentId === payload.doc_id || s.externalDocumentId === payload.doc_id)) ||
    (payload.doc_code && s.documentNumber === payload.doc_code)
  );
  const docInfo = targetDoc || targetSchedule || payload;
  const cycleText = getCycleDisplayText(docInfo);

  const handleApprove = () => {
    setIsSubmitting(true);
    try {
      approvePeriodicReview({
        taskId: task.id,
        approverUser: currentUser,
        remarks: remarks.trim()
      });
      toast.success(`อนุมัติผลการทบทวนเอกสารเรียบร้อยแล้ว (ขยายรอบ ${cycleText})`);
      onClose();
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการอนุมัติ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = () => {
    if (!remarks.trim()) {
      toast.error('กรุณาระบุเหตุผลที่ตีกลับแก้ไข');
      return;
    }
    setIsSubmitting(true);
    try {
      rejectPeriodicReview({
        taskId: task.id,
        approverUser: currentUser,
        remarks: remarks.trim()
      });
      toast.success('ตีกลับผลการทบทวนให้ผู้จัดทำเรียบร้อยแล้ว');
      onClose();
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการตีกลับ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                พิจารณาอนุมัติผลการทบทวนเอกสารตามรอบ
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {payload.doc_code || task.document_code} • {payload.doc_title || task.document_title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)] text-xs">
          {/* Document & Submitter Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
            <div>
              <span className="text-slate-400 block text-[11px] mb-0.5">รหัสเอกสาร</span>
              <span className="font-bold text-slate-800 text-sm">{payload.doc_code || task.document_code || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] mb-0.5">ฉบับที่ (Rev)</span>
              <span className="font-semibold text-slate-800">{payload.revision || task.revision || '00'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] mb-0.5">แผนก</span>
              <span className="font-semibold text-slate-800">{payload.department || task.department || '-'}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500">ผู้ส่งผลทบทวน</span>
              <p className="text-sm font-medium text-slate-800">
                {payload.reviewer_name || '-'}
                {payload.reviewer_position ? (
                  <span className="text-xs text-slate-500 ml-1.5 font-normal">
                    ({payload.reviewer_position})
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          {/* Outcome Card */}
          <div className="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold text-emerald-900 text-sm">ไม่มีการเปลี่ยนแปลง (No Change)</span>
                <p className="text-emerald-700 text-[11px] mt-0.5">
                  ผู้ทบทวนยืนยันว่าเนื้อหาเอกสารยังคงถูกต้องตามขั้นตอนปฏิบัติงานปัจจุบัน
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200 shrink-0">
              + ขยายรอบ {cycleText}
            </span>
          </div>

          {/* Review Findings & Details */}
          <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200/80">
            <div>
              <span className="text-slate-500 font-bold block mb-1">เหตุผล / รายละเอียดการทบทวน:</span>
              <p className="p-2.5 bg-slate-50 rounded-lg text-slate-700 whitespace-pre-wrap leading-relaxed">
                {details.comment || details.reason || '-'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div>
                <span className="text-slate-500 font-bold block mb-0.5">ประเด็นที่พบ:</span>
                <p className="text-slate-700">{details.findings || '-'}</p>
              </div>
              <div>
                <span className="text-slate-500 font-bold block mb-0.5">มาตรฐาน / ข้อกำหนดที่ใช้พิจารณา:</span>
                <p className="text-slate-700">{details.standards || '-'}</p>
              </div>
              <div>
                <span className="text-slate-500 font-bold block mb-0.5">ข้อมูล / หลักฐานอ้างอิง:</span>
                <p className="text-slate-700">{details.references || '-'}</p>
              </div>
              <div>
                <span className="text-slate-500 font-bold block mb-0.5">ความคิดเห็นเพิ่มเติม:</span>
                <p className="text-slate-700">{details.additionalComments || '-'}</p>
              </div>
            </div>
          </div>

          {/* Approver Remarks Input */}
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">
              ความเห็นของผู้อนุมัติ (Remarks) / เหตุผลกรณีตีกลับ:
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="ระบุความเห็นเพิ่มเติมของหัวหน้าแผนก หรือเหตุผลหากต้องการตีกลับแก้ไข..."
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-xs"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200/60 rounded-lg font-medium transition-colors"
          >
            ยกเลิก
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-semibold transition-colors shadow-2xs"
            >
              <RotateCcw size={13} />
              <span>ตีกลับแก้ไข (Reject)</span>
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors shadow-sm"
            >
              <Check size={14} />
              <span>อนุมัติผลทบทวน (Approve)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
