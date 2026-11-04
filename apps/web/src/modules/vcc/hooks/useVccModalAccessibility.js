import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useVccModalAccessibility
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise accessibility hook for VCC Modals, Dialogs, and Drawers (Phase 3 UX Round D2).
 *
 * Implements WAI-ARIA Modal Dialog Practices:
 * 1. Focus Trap: Encloses keyboard Tab / Shift+Tab navigation strictly inside the modal.
 * 2. Initial Focus: Automatically focuses the designated element or the first focusable input.
 * 3. Focus Restoration: Gracefully returns focus to the trigger element upon closing.
 * 4. Topmost Dialog Stack: Supports nested dialogs (e.g. discard confirmations) so only
 *    the topmost dialog handles Escape and tab traps.
 * 5. Scroll Lock: Disables body scroll with layout-shift prevention (paddingRight compensation).
 * 6. Dirty Form Protection: Guards against accidental dismissal via Escape, backdrop, or X button
 *    when form fields have been edited.
 * 7. Browser Navigation Guard: Registers beforeunload warning when form is dirty.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Module-level stack of open dialogs
export const vccDialogStack = [];

export const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

export const isElementVisible = (el) => {
  if (!el) return false;
  if (el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0)) {
    return true;
  }
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return !el.hasAttribute('hidden');
};

let originalBodyOverflow = '';
let originalBodyPaddingRight = '';

const lockBodyScroll = () => {
  if (typeof document === 'undefined') return;
  if (vccDialogStack.length === 1) {
    originalBodyOverflow = document.body.style.overflow;
    originalBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
};

const unlockBodyScroll = () => {
  if (typeof document === 'undefined') return;
  if (vccDialogStack.length === 0) {
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.paddingRight = originalBodyPaddingRight;
  }
};

/**
 * @param {Object} options
 * @param {boolean} options.isOpen - Whether modal is visible
 * @param {() => void} options.onClose - Dismiss callback
 * @param {boolean} [options.isDirty=false] - Whether form has unsaved modifications
 * @param {React.RefObject} [options.initialFocusRef] - Element to focus on mount
 * @param {React.RefObject} [options.returnFocusRef] - Element to restore focus to on close
 * @param {boolean} [options.closeOnEscape=true] - Dismiss on Escape key
 * @param {boolean} [options.closeOnBackdrop=true] - Dismiss on backdrop click
 * @param {string} [options.discardTitle='ข้อมูลยังไม่ได้บันทึก']
 * @param {string} [options.discardMessage='คุณมีข้อมูลที่กำลังแก้ไขอยู่ ต้องการปิดโดยไม่บันทึกหรือไม่?']
 */
export const useVccModalAccessibility = ({
  isOpen,
  onClose,
  isDirty = false,
  initialFocusRef = null,
  returnFocusRef = null,
  closeOnEscape = true,
  closeOnBackdrop = true,
  discardTitle = 'ข้อมูลยังไม่ได้บันทึก',
  discardMessage = 'คุณมีข้อมูลที่กำลังแก้ไขอยู่ ต้องการปิดโดยไม่บันทึกหรือไม่?'
}) => {
  const dialogRef = useRef(null);
  const idRef = useRef(`vcc-modal-${Math.random().toString(36).slice(2, 9)}`);
  const previousActiveElement = useRef(null);
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false);

  // 1. Stack Registration & Scroll Lock
  useEffect(() => {
    if (!isOpen) return;

    const dialogId = idRef.current;
    previousActiveElement.current = returnFocusRef?.current || (typeof document !== 'undefined' ? document.activeElement : null);
    vccDialogStack.push(dialogId);
    lockBodyScroll();

    return () => {
      const idx = vccDialogStack.indexOf(dialogId);
      if (idx !== -1) {
        vccDialogStack.splice(idx, 1);
      }
      unlockBodyScroll();

      // Focus Restoration: Only restore if focus is in document and not stolen by another active modal
      const elementToFocus = previousActiveElement.current;
      if (elementToFocus && typeof elementToFocus.focus === 'function') {
        setTimeout(() => {
          try {
            if (typeof document !== 'undefined' && document?.body && typeof document.body.contains === 'function' && document.body.contains(elementToFocus)) {
              elementToFocus.focus({ preventScroll: true });
            }
          } catch {
            // Environment may be unmounted or torn down
          }
        }, 10);
      }
    };
  }, [isOpen, returnFocusRef]);

  // 2. Initial Focus on Open
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      try {
        if (typeof document === 'undefined') return;
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus({ preventScroll: true });
        } else if (dialogRef.current) {
          const firstFocusable = dialogRef.current.querySelector(FOCUSABLE_SELECTOR);
          if (firstFocusable) {
            firstFocusable.focus({ preventScroll: true });
          } else {
            dialogRef.current.focus({ preventScroll: true });
          }
        }
      } catch {
        // Silently ignore
      }
    }, 40);

    return () => clearTimeout(timer);
  }, [isOpen, initialFocusRef]);

  // 3. Request Close with Dirty Form check
  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowConfirmDiscard(true);
    } else {
      onClose?.();
    }
  }, [isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setShowConfirmDiscard(false);
    onClose?.();
  }, [onClose]);

  const cancelDiscard = useCallback(() => {
    setShowConfirmDiscard(false);
    // Return focus back to dialog container or its first focusable
    setTimeout(() => {
      try {
        if (typeof document === 'undefined') return;
        if (dialogRef.current) {
          const first = dialogRef.current.querySelector(FOCUSABLE_SELECTOR);
          if (first) first.focus({ preventScroll: true });
          else dialogRef.current.focus({ preventScroll: true });
        }
      } catch {
        // Silently ignore
      }
    }, 10);
  }, []);

  // 4. Keyboard Navigation: Escape Key & Focus Trap (Topmost dialog only)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      const isTopmost = vccDialogStack[vccDialogStack.length - 1] === idRef.current;
      if (!isTopmost) return;

      // When discard confirmation is active, it handles its own keyboard navigation
      if (showConfirmDiscard) return;

      // Handle Escape
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
        return;
      }

      // Handle Tab (Focus Trap)
      if (e.key === 'Tab') {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;

        const allFocusables = Array.from(dialogEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
          isElementVisible
        );

        if (allFocusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = allFocusables[0];
        const last = allFocusables[allFocusables.length - 1];

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
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, closeOnEscape, requestClose, showConfirmDiscard]);

  // 5. Browser Tab Navigation / Reload Guard
  useEffect(() => {
    if (!isOpen || !isDirty) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, isDirty]);

  // 6. Backdrop click helper
  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget && closeOnBackdrop) {
        requestClose();
      }
    },
    [closeOnBackdrop, requestClose]
  );

  return {
    dialogRef,
    dialogId: idRef.current,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard,
    discardTitle,
    discardMessage
  };
};

export default useVccModalAccessibility;
