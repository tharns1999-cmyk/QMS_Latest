import React, { useState, useCallback, memo } from 'react';
import { RotateCcw, Check, X } from 'lucide-react';

/**
 * TaskActionDock - Isolated Action & Feedback Dock
 * 
 * Performance & Memory Optimization:
 * Isolates textarea typing state (comment) entirely within this component.
 * Typing in the feedback box will NOT trigger re-renders in the parent TaskReview / TaskApprove 
 * or cause iframe PDF preview re-rendering / flickering.
 */
const TaskActionDock = memo(({
  mode = 'REVIEW', // 'REVIEW' | 'APPROVE'
  hasReadToBottom = false,
  isObsolete = false,
  isSubmitting = false,
  placeholder = 'ระบุเหตุผล ข้อเสนอแนะ หรือสิ่งที่ต้องปรับปรุง...',
  initialComment = '',
  onAction,
  className = ''
}) => {
  const [comment, setComment] = useState(initialComment);

  const handleButtonClick = useCallback((actionType) => {
    if (typeof onAction === 'function') {
      onAction(actionType, comment);
    }
  }, [onAction, comment]);

  const isReview = mode === 'REVIEW';
  const isDisabled = !hasReadToBottom || isSubmitting;

  return (
    <div className={`shrink-0 p-3.5 border-t border-slate-100 bg-slate-50/90 space-y-2.5 ${className}`}>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className={`w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 resize-none shadow-xs transition-colors ${
          isReview ? 'focus:ring-blue-500/20 focus:border-blue-500' : 'focus:ring-purple-500/20 focus:border-purple-500'
        }`}
      />

      {/* Container ของ Action Buttons ด้านล่าง Textarea */}
      <div className="pt-2.5">
        {mode === 'APPROVE' ? (
          <div className="grid grid-cols-3 gap-2 w-full">
            {/* 1. ไม่อนุมัติ */}
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleButtonClick('REJECT')}
              className="h-10 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 active:scale-[0.98] text-rose-700 border border-rose-200/90 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="ไม่อนุมัติและยกเลิกคำขอนี้ทันที"
            >
              <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span className="whitespace-nowrap">ไม่อนุมัติ</span>
            </button>

            {/* 2. ส่งกลับแก้ไข */}
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleButtonClick('RETURN')}
              className="h-10 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 active:scale-[0.98] text-amber-800 border border-amber-200/90 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="ส่งกลับไปให้ Requester แก้ไข"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="whitespace-nowrap">ส่งกลับแก้ไข</span>
            </button>

            {/* 3. อนุมัติ (Primary) */}
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleButtonClick('APPROVE')}
              aria-label={isObsolete ? 'อนุมัติยกเลิกเอกสาร (Approve Obsolete)' : 'อนุมัติ (Approve)'}
              className={`h-10 px-2 rounded-xl active:scale-[0.98] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
                isObsolete
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25 border border-rose-600'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 border border-emerald-600'
              }`}
              title={isObsolete ? 'อนุมัติยกเลิกเอกสาร' : 'อนุมัติคำขอ'}
            >
              <Check className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="whitespace-nowrap">{isObsolete ? 'อนุมัติยกเลิกเอกสาร' : 'อนุมัติ'}</span>
            </button>
          </div>
        ) : (
          /* โหมด REVIEW (2 ปุ่ม) */
          <div className="grid grid-cols-2 gap-2.5 w-full">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleButtonClick('RETURN')}
              className="h-10 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 active:scale-[0.98] text-amber-800 border border-amber-200/90 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="ส่งกลับไปให้ Requester แก้ไข"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="whitespace-nowrap">ส่งกลับแก้ไข</span>
            </button>

            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleButtonClick('APPROVE')}
              className="h-10 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs shadow-blue-600/25 border border-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              title="ผ่านการทบทวนและส่งต่อผู้อนุมัติ"
            >
              <Check className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="whitespace-nowrap">ผ่านการทบทวน</span>
            </button>
          </div>
        )}
      </div>

      {!hasReadToBottom && (
        <p className="text-[11px] text-rose-500 text-center font-medium">
          ⚠️ กรุณาเลื่อนอ่านเอกสารทางขวาให้จบเพื่อปลดล็อคปุ่ม
        </p>
      )}
    </div>
  );
});

TaskActionDock.displayName = 'TaskActionDock';

export default TaskActionDock;
