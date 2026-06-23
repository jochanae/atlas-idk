import { useRef, useCallback } from "react";

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  /** When true, swipe events are suppressed (e.g. while dragging an overlay) */
  disabled?: boolean;
}

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight, threshold = 50, disabled }: UseSwipeOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchEnd = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Skip swipe if touching an overlay element
    if (disabled) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-overlay-id]")) return;
    touchEnd.current = null;
    touchStart.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  }, [disabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    touchEnd.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  }, [disabled]);

  const onTouchEnd = useCallback(() => {
    if (disabled) return;
    if (!touchStart.current || !touchEnd.current) return;

    const distX = touchStart.current.x - touchEnd.current.x;
    const distY = touchStart.current.y - touchEnd.current.y;

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(distX) > Math.abs(distY) && Math.abs(distX) > threshold) {
      if (distX > 0) {
        onSwipeLeft?.(); // swipe left = next slide
      } else {
        onSwipeRight?.(); // swipe right = prev slide
      }
    }

    touchStart.current = null;
    touchEnd.current = null;
  }, [onSwipeLeft, onSwipeRight, threshold, disabled]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
