import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { vccDialogStack, FOCUSABLE_SELECTOR } from '../hooks/useVccModalAccessibility';

/**
 * VccDiscardConfirmDialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Nested confirmation dialog adhering strictly to WAI-ARIA role="alertdialog".
 * Triggered automatically when closing a dirty form to prevent accidental data loss.
 *
 * Defaults initial focus to "แก้ไขต่อ" (Cancel Discard) to protect user data from
 * accidental Enter key presses.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const VccDiscardConfirmDialog = ({
  isOpen,
  onConfirm,
  onCancel,
  title = 'ข้อมูลยังไม่ได้บันทึก',
  message = 'คุณมีข้อมูลที่กำลังแก้ไขอยู่ ต้องการปิดโดยไม่บันทึกหรือไม่?'
}) => {
  const dialogRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const idRef = useRef(`vcc-confirm-discard-${Math.random().toString(36).slice(2, 9)}`);
  const titleId = `discard-dialog-title-${idRef.current}`;
  const descId = `discard-dialog-desc-${idRef.current}`;

  useEffect(() => {
    if (!isOpen) return;

    const dialogId = idRef.current;
    vccDialogStack.push(dialogId);

    // Initial focus on safe action (Cancel Discard / Edit More)
    const timer = setTimeout(() => {
      try {
        if (typeof document === 'undefined') return;
        cancelBtnRef.current?.focus({ preventScroll: true });
      } catch {
        // Silently ignore
      }
    }, 40);

    const handleKeyDown = (e) => {
      const isTopmost = vccDialogStack[vccDialogStack.length - 1] === dialogId;
      if (!isTopmost) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (e.key === 'Tab') {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;

        const focusables = Array.from(dialogEl.querySelectorAll(FOCUSABLE_SELECTOR));
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !dialogEl.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !dialogEl.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      const idx = vccDialogStack.indexOf(dialogId);
      if (idx !== -1) {
        vccDialogStack.splice(idx, 1);
      }
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex="-1"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-5 space-y-4 outline-none"
      >
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
            <AlertTriangle size={22} className="shrink-0" />
          </div>
          <div className="space-y-1">
            <h3 id={titleId} className="text-base font-bold text-slate-900 tracking-tight">
              {title}
            </h3>
            <p id={descId} className="text-xs text-slate-600 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="h-9 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            แก้ไขต่อ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 px-3.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer shadow-2xs"
          >
            ละทิ้งข้อมูลและปิด
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VccDiscardConfirmDialog;
