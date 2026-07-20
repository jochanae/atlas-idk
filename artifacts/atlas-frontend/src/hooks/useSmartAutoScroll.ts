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
  },
) {
  const threshold = options?.threshold ?? 80;
  const enabled = options?.enabled ?? true;
  const behavior = options?.behavior ?? "smooth";
  const stickRef = useRef(true);
  const primedRef = useRef(false);

  // Track user scroll position to maintain the stick flag.
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickRef.current = distance <= threshold;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, enabled, threshold]);

  // Mount-priming: when the surface (re)mounts, hold the reader at the
  // bottom until content stops growing (images, streamed markdown, late
  // hydration). Runs for ~1.2s from mount, then releases. This is what
  // makes "return to Ask Atlas / Workspace and see the latest message"
  // actually feel like return-to-bottom on mobile.
  useEffect(() => {
    if (!enabled) return;
    const started = performance.now();
    let lastHeight = -1;
    let stableSince = 0;
    let cancelled = false;
    const scrollToEnd = () => {
      const node = ref.current;
      if (!node) return;
      node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
    };
    const tick = () => {
      if (cancelled) return;
      const node = ref.current;
      if (!node) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const h = node.scrollHeight;
      if (h !== lastHeight) {
        lastHeight = h;
        stableSince = performance.now();
      }
      scrollToEnd();
      const elapsed = performance.now() - started;
      const stable = performance.now() - stableSince;
      // Release once content has been stable for 250ms, or after 1.2s hard cap.
      if (elapsed > 1200 || (elapsed > 200 && stable > 250)) {
        primedRef.current = true;
        stickRef.current = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

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
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);


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
