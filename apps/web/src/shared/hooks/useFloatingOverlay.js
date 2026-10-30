import { useState, useEffect, useCallback, useLayoutEffect } from 'react';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * useFloatingOverlay
 * Robust floating positioning hook with collision detection, auto-flip, viewport constraints,
 * outside click handling, and escape key dismiss.
 *
 * Designed for zero layout shift in data tables and overflow-constrained containers.
 *
 * @param {Object} options
 * @param {boolean} options.isOpen
 * @param {Function} options.onClose
 * @param {React.RefObject} options.triggerRef
 * @param {React.RefObject} options.overlayRef
 * @param {'bottom-start'|'bottom-end'|'bottom-center'|'top-start'|'top-end'|'top-center'} [options.placement='bottom-start']
 * @param {number} [options.offset=6]
 * @param {number} [options.viewportPadding=8]
 * @param {boolean} [options.closeOnEscape=true]
 * @param {boolean} [options.closeOnOutsideClick=true]
 * @param {boolean} [options.lockScroll=false]
 */
export const useFloatingOverlay = ({
  isOpen,
  onClose,
  triggerRef,
  overlayRef,
  placement = 'bottom-start',
  offset = 6,
  viewportPadding = 8,
  closeOnEscape = true,
  closeOnOutsideClick = true,
  lockScroll = false
}) => {
  const [coords, setCoords] = useState({ top: 0, left: 0, actualPlacement: placement });
  const [isCalculated, setIsCalculated] = useState(false);

  const updatePosition = useCallback(() => {
    if (!isOpen || !triggerRef?.current) return;

    const triggerEl = triggerRef.current;
    const triggerRect = triggerEl.getBoundingClientRect();
    const overlayEl = overlayRef?.current;

    const overlayWidth = overlayEl ? overlayEl.offsetWidth : 320;
    const overlayHeight = overlayEl ? overlayEl.offsetHeight : 200;

    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;

    // Determine vertical direction: bottom or top
    const [preferredSide, preferredAlign = 'start'] = placement.split('-');

    const spaceBelow = vh - triggerRect.bottom - offset - viewportPadding;
    const spaceAbove = triggerRect.top - offset - viewportPadding;

    let actualSide = preferredSide;
    if (preferredSide === 'bottom') {
      if (spaceBelow < overlayHeight && spaceAbove > spaceBelow) {
        actualSide = 'top';
      }
    } else if (preferredSide === 'top') {
      if (spaceAbove < overlayHeight && spaceBelow > spaceAbove) {
        actualSide = 'bottom';
      }
    }

    // Calculate Top
    let top = 0;
    if (actualSide === 'bottom') {
      top = triggerRect.bottom + offset;
    } else {
      top = triggerRect.top - overlayHeight - offset;
    }

    // Calculate Left based on alignment
    let left = 0;
    if (preferredAlign === 'end') {
      left = triggerRect.right - overlayWidth;
    } else if (preferredAlign === 'center') {
      left = triggerRect.left + (triggerRect.width - overlayWidth) / 2;
    } else {
      // default 'start'
      left = triggerRect.left;
    }

    // Viewport bounds clamping
    left = Math.max(viewportPadding, Math.min(left, vw - overlayWidth - viewportPadding));
    top = Math.max(viewportPadding, Math.min(top, vh - overlayHeight - viewportPadding));

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      actualPlacement: `${actualSide}-${preferredAlign}`
    });
    setIsCalculated(true);
  }, [isOpen, triggerRef, overlayRef, placement, offset, viewportPadding]);

  // Recalculate layout immediately on mount/open
  useIsomorphicLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      // Second tick to account for actual rendered dimensions of the overlay
      const timer = requestAnimationFrame(updatePosition);
      return () => cancelAnimationFrame(timer);
    } else {
      setIsCalculated(false);
    }
  }, [isOpen, updatePosition]);

  // Listen to scroll and resize
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Outside click & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };

    const handlePointerDown = (e) => {
      if (!closeOnOutsideClick) return;

      const target = e.target;
      const isInsideTrigger = triggerRef?.current && triggerRef.current.contains(target);
      const isInsideOverlay = overlayRef?.current && overlayRef.current.contains(target);

      if (!isInsideTrigger && !isInsideOverlay) {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, onClose, triggerRef, overlayRef, closeOnEscape, closeOnOutsideClick]);

  // Optional body scroll lock
  useEffect(() => {
    if (!isOpen || !lockScroll) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, lockScroll]);

  return {
    coords,
    isCalculated,
    updatePosition
  };
};

export default useFloatingOverlay;
