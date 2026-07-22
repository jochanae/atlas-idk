import { useEffect, useRef, type RefObject } from "react";

/**
 * Smart Anchor scroll for chat surfaces.
 *
 * Rules:
 *  - Auto-scroll to bottom on dep change ONLY if the user is already near the bottom.
 *  - If the user scrolls UP (away from bottom), freeze — do not yank them back.
 *  - Once the user returns to near-bottom manually, the lock releases and auto-scroll resumes.
 *  - `force` deps (e.g. a fresh user send) override the freeze and jump to bottom.
 *
 * Threshold defaults to 80px from bottom — anything closer counts as "at bottom".
 */
export function useSmartAutoScroll(
  ref: RefObject<HTMLElement | null>,
  deps: ReadonlyArray<unknown>,
  options?: {
    threshold?: number;
    /** Deps that should bypass the freeze and always jump to bottom (e.g. user-send count). */
    forceDeps?: ReadonlyArray<unknown>;
    /** Set false to disable entirely (e.g. surface not open). */
    enabled?: boolean;
    behavior?: ScrollBehavior;
    /**
     * When this key changes, the "first-time prime to bottom" resets so the
     * hook re-jumps to the tail (e.g. switching between projects/threads
     * without remounting the container).
     */
    primeKey?: string | number | null;
  },
) {
  const threshold = options?.threshold ?? 80;
  const enabled = options?.enabled ?? true;
  const behavior = options?.behavior ?? "smooth";
  const primeKey = options?.primeKey;
  const stickRef = useRef(true);
  const primedRef = useRef(false);
  const lastPrimeKeyRef = useRef<string | number | null | undefined>(primeKey);

  // Reset priming when the primeKey changes (project/thread switch).
  if (lastPrimeKeyRef.current !== primeKey) {
    lastPrimeKeyRef.current = primeKey;
    primedRef.current = false;
    stickRef.current = true;
  }

  // Track user scroll position to maintain the stick flag.
  // rAF-debounced: coalesce a burst of scroll events into one read per frame
  // so we don't fight the dock's height animation with repeated scrollHeight
  // reads mid-reflow.
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const node = ref.current;
      if (!node) return;
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      stickRef.current = distance <= threshold;
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, enabled, threshold]);

  // Auto-scroll on dep change if stuck to bottom.
  // First time the container reports real content, force-jump to bottom
  // (instant) so a returning reader sees the tail of the conversation
  // instead of the top. This runs regardless of stickRef because on first
  // paint scrollTop is 0 and we don't want the reader stranded at the top.
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const jump = () => {
      const node = ref.current;
      if (!node) return;
      const scrollToEnd = () => {
        const latest = ref.current;
        if (!latest) return;
        latest.scrollTop = Math.max(0, latest.scrollHeight - latest.clientHeight);
      };
      if (!primedRef.current) {
        if (node.scrollHeight > node.clientHeight + 4) {
          scrollToEnd();
          primedRef.current = true;
          stickRef.current = true;
          return;
        }
      }
      if (stickRef.current) {
        node.scrollTo({ top: node.scrollHeight, behavior });
        requestAnimationFrame(scrollToEnd);
        window.setTimeout(scrollToEnd, 90);
        window.setTimeout(scrollToEnd, 240);
      }
    };
    jump();
    // Cover late-arriving layout (images, streamed markdown) with a rAF pass.
    const raf = requestAnimationFrame(jump);
    // Also cover async content hydration that lands after the initial paint
    // (e.g. returning to a workspace where messages are already in memory but
    // the container just re-mounted).
    const t1 = window.setTimeout(jump, 120);
    const t2 = window.setTimeout(jump, 320);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, primeKey]);



  // Force-scroll on user send / explicit triggers — bypasses the freeze.
  useEffect(() => {
    if (!enabled) return;
    if (!options?.forceDeps) return;
    const el = ref.current;
    if (!el) return;
    stickRef.current = true;
    const scrollToEnd = () => {
      const node = ref.current;
      if (!node) return;
      node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
    };
    el.scrollTo({ top: el.scrollHeight, behavior });
    requestAnimationFrame(scrollToEnd);
    window.setTimeout(scrollToEnd, 90);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, options?.forceDeps ?? []);

  return {
    /** Imperatively jump to bottom (e.g. scroll-to-latest button). Also re-locks stick. */
    scrollToBottom: (b: ScrollBehavior = "smooth") => {
      const el = ref.current;
      if (!el) return;
      stickRef.current = true;
      const scrollToEnd = () => {
        const node = ref.current;
        if (!node) return;
        node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
      };
      el.scrollTo({ top: el.scrollHeight, behavior: b });
      requestAnimationFrame(scrollToEnd);
      window.setTimeout(scrollToEnd, 90);
      window.setTimeout(scrollToEnd, 240);
    },
    isStuckRef: stickRef,
  };
}
