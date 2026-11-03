import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingOverlay } from '../../hooks/useFloatingOverlay';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * FloatingOverlay
 * Reusable zero-layout-shift floating panel rendered into document.body via React Portal.
 * Automatically handles viewport constraints, flip, outside click, and keyboard accessibility.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {React.RefObject} props.triggerRef
 * @param {'bottom-start'|'bottom-end'|'bottom-center'|'top-start'|'top-end'|'top-center'} [props.placement='bottom-start']
 * @param {number} [props.offset=6]
 * @param {number} [props.viewportPadding=8]
 * @param {number} [props.zIndex=9999]
 * @param {string} [props.className='']
 * @param {React.ReactNode} props.children
 * @param {string} [props.role='dialog']
 * @param {string} [props.ariaLabel]
 * @param {boolean} [props.closeOnEscape=true]
 * @param {boolean} [props.closeOnOutsideClick=true]
 * @param {boolean} [props.lockScroll=false]
 */
export const FloatingOverlay = ({
  isOpen,
  onClose,
  triggerRef,
  placement = 'bottom-start',
  offset = 6,
  viewportPadding = 8,
  zIndex = 9999,
  className = '',
  children,
  role = 'dialog',
  ariaLabel,
  closeOnEscape = true,
  closeOnOutsideClick = true,
  lockScroll = false,
  keepMounted = false,
  portal = true,
  ...rest
}) => {
  const overlayRef = useRef(null);

  const { coords, isCalculated } = useFloatingOverlay({
    isOpen,
    onClose,
    triggerRef,
    overlayRef,
    placement,
    offset,
    viewportPadding,
    closeOnEscape,
    closeOnOutsideClick,
    lockScroll
  });

  const isVisible = isOpen && isCalculated;
  const wasVisible = useRef(false);

  // Keyboard users: a portaled panel sits at the end of <body>, so Tab from the trigger would never reach it. Move focus in on open,
  // and give it back to the trigger on close (only if focus was inside the panel or lost, never stealing it from another control).
  useEffect(() => {
    const overlayEl = overlayRef.current;
    if (isVisible && !wasVisible.current && portal) {
      overlayEl?.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
    } else if (!isVisible && wasVisible.current) {
      const active = document.activeElement;
      if (!active || active === document.body || overlayEl?.contains(active)) triggerRef?.current?.focus({ preventScroll: true });
    }
    wasVisible.current = isVisible;
  }, [isVisible, portal, triggerRef]);

  if (typeof document === 'undefined') return null;
  if (!isOpen && !keepMounted) return null;

  const content = (
    <div
      ref={overlayRef}
      role={role || undefined}
      aria-label={ariaLabel}
      aria-modal={role === 'dialog' ? 'true' : undefined}
      data-floating-overlay="true"
      data-placement={coords.actualPlacement}
      style={{
        position: 'fixed',
        top: isVisible ? `${coords.top}px` : '-9999px',
        left: isVisible ? `${coords.left}px` : '-9999px',
        zIndex,
        opacity: isVisible ? 1 : 0,
        // a closed (keepMounted) menu must not stay in the Tab order or the accessibility tree
        visibility: isVisible ? 'visible' : 'hidden',
        // fade only the opacity: a visibility transition keeps the panel hidden for its first moments, and a hidden element refuses focus
        transitionProperty: 'opacity',
        pointerEvents: 'auto'
      }}
      className={className}
      onClick={(e) => e.stopPropagation()}
      {...rest}
    >
      {children}
    </div>
  );

  return portal ? createPortal(content, document.body) : content;
};

export default FloatingOverlay;

