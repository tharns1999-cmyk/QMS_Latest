import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingOverlay } from '../../hooks/useFloatingOverlay';

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

  if (typeof document === 'undefined') return null;
  if (!isOpen && !keepMounted) return null;

  const isVisible = isOpen && isCalculated;

  return createPortal(
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
        pointerEvents: 'auto'
      }}
      className={className}
      onClick={(e) => e.stopPropagation()}
      {...rest}
    >
      {children}
    </div>,
    document.body
  );
};

export default FloatingOverlay;

