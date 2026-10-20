import React from 'react';
import { CheckCircle2, X } from 'lucide-react';

/**
 * ApproveConfirmModal
 * 
 * Smooth, zero-flicker approval confirmation modal that starts
 * hardware-accelerated animations immediately on frame 0.
 * Eliminates double rendering and scrollbar layout shifts.
 */
export default function ApproveConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  dar,
  comment,
  title = 'ยืนยันการอนุมัติเอกสาร',
  subtitle = 'กรุณาตรวจสอบรายละเอียดสรุปก่อนดำเนินการยืนยัน',
  isSubmitting = false
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 1. Backdrop มืดเนียนตา ไม่มีจังหวะวูบ */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      />

      {/* 2. Dialog Box เด้งขึ้นนุ่มนวล เริ่มเล่น Animation ทันที */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 ease-out">
        
        {/* Header */}
        <div className="p-6 pb-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle2 className="w-5 h-5"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">{title}</h3>
              <button 
                type="button"
                onClick={onClose} 
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Content Body */}
        <div className="px-6 py-4 space-y-3 bg-slate-50/50 border-y border-slate-100 text-xs text-slate-600">
          {dar && (
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">รหัสคำร้อง:</span>
                <span className="font-semibold text-slate-800">{dar.darNumber || dar.darNo || dar.id || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ชื่อเอกสาร:</span>
                <span className="font-medium text-slate-800 text-right max-w-[280px] truncate">{dar.title || dar.docName || '-'}</span>
              </div>
            </div>
          )}
          {comment && (
            <div className="pt-2 border-t border-slate-200/60">
              <span className="text-slate-400 block mb-1">ความเห็นเพิ่มเติม:</span>
              <p className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 italic">{comment}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-4 flex items-center justify-end gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {isSubmitting ? 'กำลังดำเนินการ...' : 'ยืนยันการอนุมัติ'}
          </button>
        </div>
      </div>
    </div>
  );
}
