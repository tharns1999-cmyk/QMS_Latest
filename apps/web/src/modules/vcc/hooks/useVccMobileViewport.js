import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useVccMobileViewport
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise Mobile Ergonomics Hook for VCC (iOS Safari, Android Chrome, Tablet & Desktop).
 *
 * Capabilities:
 * 1. Responsive Viewport Detection: Reactive `isMobile` flag (< 640px).
 * 2. VisualViewport & Virtual Keyboard Tracking: Tracks real visible viewport height
 *    when on-screen keyboards open, avoiding double scrolls or hidden inputs.
 * 3. Safe Focus Scrolling: Automatically ensures focused inputs remain in view above
 *    the virtual keyboard without awkward layout jumps.
 * 4. Ergonomic Drag-to-Dismiss Gesture: Smooth touch tracking for Bottom Sheets,
 *    strictly routed through `requestClose()` so Dirty Form Protection is NEVER bypassed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const useVccMobileViewport = ({
  containerRef = null,
  isOpen = true,
  onDismiss = null,
  dragThreshold = 70
} = {}) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640;
  });

  const [visualHeight, setVisualHeight] = useState(() => {
    if (typeof window === 'undefined') return 800;
    return window.visualViewport?.height || window.innerHeight;
  });

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const touchStartYRef = useRef(0);
  const touchCurrentYRef = useRef(0);

  // 1. Viewport & Virtual Keyboard Detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const currentWidth = window.innerWidth;
      setIsMobile(currentWidth < 640);

      const vv = window.visualViewport;
      const currentHeight = vv ? vv.height : window.innerHeight;
      setVisualHeight(currentHeight);

      // Keyboard detection: significant height decrease compared to window innerHeight
      const heightDiff = window.innerHeight - currentHeight;
      setIsKeyboardOpen(heightDiff > 140);
    };

    handleResize();

    window.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('scroll', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  // 2. Safe Input Visibility on Focus (Scoped strictly to open modal & active mobile view)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isOpen) return;

    const handleFocusIn = (e) => {
      // Only execute on mobile screens where virtual keyboards can cover inputs
      if (window.innerWidth >= 640) return;

      const target = e.target;
      if (!target || !target.tagName) return;

      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT';

      if (!isInput) return;

      // Scoped focus check: only scroll if the input is inside this active modal
      if (containerRef?.current && !containerRef.current.contains(target)) {
        return;
      }

      // Delay slightly for virtual keyboard animation to settle (iOS Safari & Android Chrome)
      setTimeout(() => {
        try {
          // Centering input in visible space prevents sticky bottom action bar from covering it
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch {
          // Safe fallback
        }
      }, 180);
    };

    window.addEventListener('focusin', handleFocusIn, { passive: true });
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
    };
  }, [isOpen, containerRef]);

  // 3. Ergonomic Bottom Sheet Drag-to-Dismiss Gesture
  const handleTouchStart = useCallback((e) => {
    if (e.touches && e.touches.length > 0) {
      touchStartYRef.current = e.touches[0].clientY;
      touchCurrentYRef.current = e.touches[0].clientY;
      setIsDragging(true);
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchStartYRef.current || !e.touches || e.touches.length === 0) return;
    touchCurrentYRef.current = e.touches[0].clientY;
    const deltaY = touchCurrentYRef.current - touchStartYRef.current;

    // Only allow downward drag
    if (deltaY > 0) {
      setDragOffset(deltaY);
    } else {
      setDragOffset(0);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const deltaY = touchCurrentYRef.current - touchStartYRef.current;
    setIsDragging(false);

    if (deltaY > dragThreshold) {
      setDragOffset(0);
      touchStartYRef.current = 0;
      touchCurrentYRef.current = 0;
      // Routes strictly through onDismiss (which triggers D2 Dirty Form Protection if dirty)
      onDismiss?.();
    } else {
      setDragOffset(0);
      touchStartYRef.current = 0;
      touchCurrentYRef.current = 0;
    }
  }, [dragThreshold, onDismiss]);

  return {
    isMobile,
    visualHeight,
    isKeyboardOpen,
    dragOffset,
    isDragging,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
};

export default useVccMobileViewport;

