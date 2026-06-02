import { useEffect } from "react";

/**
 * Auto-hide the mobile footer (atlas-mobile-footer) during active scroll on
 * a given scroll container, and bring it back when scrolling stops.
 *
 * Sets `body[data-atlas-footer="hidden"]` while scrolling, removes it after
 * `idleMs` of inactivity. Shared between /home and /workspace so the merge
 * lands with identical behavior.
 */
export function useFooterAutoHide(
  scrollRef: React.RefObject<HTMLElement | null>,
  options: { idleMs?: number; enabled?: boolean } = {}
) {
  const { idleMs = 350, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const show = () => {
      document.body.removeAttribute("data-atlas-footer");
    };
    const hide = () => {
      document.body.setAttribute("data-atlas-footer", "hidden");
    };

    const onScroll = () => {
      hide();
      if (timer) clearTimeout(timer);
      timer = setTimeout(show, idleMs);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      show();
    };
  }, [scrollRef, idleMs, enabled]);
}
