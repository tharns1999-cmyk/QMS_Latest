import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { resolvePlanCode } from './AnnualPlansHub';

export const DeletePlanModal = ({
  isOpen = false,
  onClose,
  plan = null,
  onConfirm,
  loading = false
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !plan) return null;

  const digitalCode = resolvePlanCode(plan);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('กรุณาระบุเหตุผลการลบแผนงาน');
      return;
    }
    setError('');
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการลบแผนงาน');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-plan-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <Trash2 size={20} />
            </div>
            <div>
              <h2 id="delete-plan-modal-title" className="text-base font-bold text-slate-900">
                ยืนยันการลบแผนงานฉบับร่าง
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                การดำเนินการนี้ไม่สามารถเรียกคืนได้
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {/* Plan Details Card */}
          <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">รหัสแผนงาน:</span>
              <span className="font-mono font-bold text-slate-900">{digitalCode}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">ปี / แผนก:</span>
              <span className="font-semibold text-slate-800">พ.ศ. {plan.plan_year + 543} ({plan.plan_year}) • แผนก {plan.department}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">ครั้งที่แก้ไข:</span>
              <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                Rev.{plan.revision || '01'}
              </span>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              รายการกำหนดการและรอบการสอบเทียบทั้งหมดในแผนฉบับนี้จะถูกลบออกอย่างถาวร แต่<strong>ไม่ส่งผลกระทบต่อทะเบียนเครื่องมือวัด</strong>
            </p>
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <label htmlFor="delete-plan-reason" className="block text-xs font-bold text-slate-700">
              เหตุผลในการลบแผนงาน <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="delete-plan-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder="ระบุเหตุผล เช่น สร้างแผนงานซ้ำซ้อน, เลือกปีผิดพลาด, ยกเลิกการแก้ไขรอบนี้..."
              disabled={loading}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-colors resize-none placeholder-slate-400"
            />
            {error && (
              <p className="text-xs font-semibold text-rose-600 animate-in fade-in">
                {error}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs transition-colors cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>กำลังลบ...</span>
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  <span>ยืนยันลบแผนงาน</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeletePlanModal;
