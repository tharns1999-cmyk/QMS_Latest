import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';

/**
 * VccModalShell
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean, modern SaaS accessible dialog shell for VCC modals.
 * Features:
 * - WAI-ARIA compliant role="dialog" or role="alertdialog" with aria-modal="true"
 * - Linked aria-labelledby & optional aria-describedby
 * - Complete Focus Trap & Focus Restoration
 * - Topmost-aware Escape key dismissal
 * - Built-in Dirty Form Discard Confirmation
 * - Accessible close button with aria-label="ปิดหน้าต่าง"
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const VccModalShell = ({
  isOpen,
  onClose,
  title,
  subtitle = null,
  headerBadge = null,
  role = 'dialog',
  isDirty = false,
  initialFocusRef = null,
  returnFocusRef = null,
  maxWidth = 'lg',
  className = '',
  children,
  discardTitle,
  discardMessage
}) => {
  const generatedId = useId();
  const titleId = `vcc-modal-title-${generatedId}`;
  const descId = subtitle ? `vcc-modal-desc-${generatedId}` : undefined;

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen,
    onClose,
    isDirty,
    initialFocusRef,
    returnFocusRef,
    discardTitle,
    discardMessage
  });

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl'
  }[maxWidth] || 'max-w-lg';

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          tabIndex="-1"
          className={`bg-white rounded-2xl border border-slate-200 shadow-2xl ${maxWidthClass} w-full overflow-hidden flex flex-col my-auto outline-none ${className}`}
        >
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
            <div className="space-y-1 pr-4 min-w-0">
              {headerBadge && <div className="flex items-center gap-2">{headerBadge}</div>}
              {typeof title === 'string' ? (
                <h2 id={titleId} className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate">
                  {title}
                </h2>
              ) : (
                <div id={titleId}>{title}</div>
              )}
              {subtitle && (
                <p id={descId} className="text-xs text-slate-500 font-medium">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>

      {/* Discard Changes Prompt */}
      <VccDiscardConfirmDialog
        isOpen={showConfirmDiscard}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        title={discardTitle}
        message={discardMessage}
      />
    </>,
    document.body
  );
};

export default VccModalShell;
