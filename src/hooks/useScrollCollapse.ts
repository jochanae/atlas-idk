import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Scroll-driven collapse for the workspace subheader.
 *
 * Rule set:
 *  - scrollTop > THRESHOLD AND moving down through content → collapsed = true
 *  - scrollTop <= THRESHOLD OR a downward reveal swipe of >= REVEAL_DELTA → collapsed = false
 *  - Manual taps (setManual) pin the value for PIN_MS, during which scroll is ignored.
 *  - Returning to scrollTop === 0 clears the pin.
 *
 * Returns `expanded` (inverse of collapsed for convenience) and `setManual`.
 */
export function useScrollCollapse(
  scrollRef: RefObject<HTMLElement | null>,
  opts: {
    defaultExpanded?: boolean;
    threshold?: number;
    revealDelta?: number;
    pinMs?: number;
  } = {},
) {
  const {
    defaultExpanded = true,
    threshold = 20,
    revealDelta = 8,
    pinMs = 2000,
  } = opts;

  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const lastTopRef = useRef(0);
  const tickingRef = useRef(false);
  const pinnedUntilRef = useRef(0);
  const hasCollapsedOnceRef = useRef(false);

  const setManual = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    pinnedUntilRef.current = Date.now() + pinMs;
    setExpanded((prev) => (typeof value === "function" ? (value as (p: boolean) => boolean)(prev) : value));
  }, [pinMs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        tickingRef.current = false;
        const top = el.scrollTop;
        const delta = top - lastTopRef.current;
        lastTopRef.current = top;

        // Always reveal at the very top, and clear the manual pin.
        if (top <= threshold) {
          pinnedUntilRef.current = 0;
          hasCollapsedOnceRef.current = false;
          setExpanded((prev) => (prev ? prev : true));
          return;
        }

        // Honor a recent manual tap.
        if (Date.now() < pinnedUntilRef.current) return;

        if (delta > 10) {
          // scrolling deeper into the thread → collapse, but only after a deliberate move
          hasCollapsedOnceRef.current = true;
          setExpanded((prev) => (prev ? false : prev));
        } else if (delta < -revealDelta && hasCollapsedOnceRef.current) {
          // reveal only after the rail has been collapsed once, so tiny idle bounces don't toggle it
          setExpanded((prev) => (prev ? prev : true));
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    lastTopRef.current = el.scrollTop;
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, threshold, revealDelta]);

  return { expanded, setExpanded: setManual };
}
