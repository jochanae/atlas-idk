import { useEffect, useRef, useState, type RefObject } from "react";

export type ScrollDirection = "up" | "down" | "idle";

export interface ScrollDirectionState {
  direction: ScrollDirection;
  isScrolling: boolean;
  distanceFromBottom: number;
  viewportsFromBottom: number;
}

export interface UseScrollDirectionOptions {
  /** Min accumulated delta (px) before flipping direction. Default 8. */
  threshold?: number;
  /** Idle debounce (ms) after scroll stops. Default 150. */
  debounceMs?: number;
}

/**
 * Tracks scroll direction + idle state for a scroll container using
 * passive scroll + rAF batching. Only re-renders on state-boundary
 * changes (direction flip / idle transition / viewport-distance flip).
 */
export function useScrollDirection(
  scrollRef: RefObject<HTMLElement | null>,
  { threshold = 8, debounceMs = 150 }: UseScrollDirectionOptions = {}
): ScrollDirectionState {
  const [state, setState] = useState<ScrollDirectionState>({
    direction: "idle",
    isScrolling: false,
    distanceFromBottom: 0,
    viewportsFromBottom: 0,
  });

  const lastTopRef = useRef(0);
  const accumRef = useRef(0);
  const directionRef = useRef<ScrollDirection>("idle");
  const isScrollingRef = useRef(false);
  const viewportBucketRef = useRef(0);
  const rafRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    lastTopRef.current = el.scrollTop;

    const commit = (next: Partial<ScrollDirectionState>) => {
      setState((prev) => {
        const merged = { ...prev, ...next };
        // Skip re-render if nothing meaningfully changed.
        if (
          merged.direction === prev.direction &&
          merged.isScrolling === prev.isScrolling &&
          Math.round(merged.viewportsFromBottom * 10) ===
            Math.round(prev.viewportsFromBottom * 10) &&
          Math.abs(merged.distanceFromBottom - prev.distanceFromBottom) < 16
        ) {
          return prev;
        }
        return merged;
      });
    };

    const measure = () => {
      rafRef.current = 0;
      const top = el.scrollTop;
      const delta = top - lastTopRef.current;
      lastTopRef.current = top;

      const distanceFromBottom = Math.max(
        0,
        el.scrollHeight - top - el.clientHeight
      );
      const vh = el.clientHeight || 1;
      const viewportsFromBottom = distanceFromBottom / vh;

      // Accumulate; flip direction only when threshold crossed.
      accumRef.current += delta;
      let nextDir = directionRef.current;
      if (accumRef.current > threshold) {
        nextDir = "down";
        accumRef.current = 0;
      } else if (accumRef.current < -threshold) {
        nextDir = "up";
        accumRef.current = 0;
      }

      const wasScrolling = isScrollingRef.current;
      if (delta !== 0) {
        isScrollingRef.current = true;
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          isScrollingRef.current = false;
          directionRef.current = "idle";
          commit({
            direction: "idle",
            isScrolling: false,
            distanceFromBottom,
            viewportsFromBottom,
          });
        }, debounceMs);
      }

      if (
        nextDir !== directionRef.current ||
        isScrollingRef.current !== wasScrolling
      ) {
        directionRef.current = nextDir;
        commit({
          direction: nextDir,
          isScrolling: isScrollingRef.current,
          distanceFromBottom,
          viewportsFromBottom,
        });
        return;
      }

      // Viewport-bucket change (e.g. crossed 1.0 / 2.0) — still worth a commit.
      const nextBucket = Math.floor(viewportsFromBottom * 10);
      if (nextBucket !== viewportBucketRef.current) {
        viewportBucketRef.current = nextBucket;
        commit({ distanceFromBottom, viewportsFromBottom });
      }
    };

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(measure);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    // Initial measure
    measure();

    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [scrollRef, threshold, debounceMs]);

  return state;
}
