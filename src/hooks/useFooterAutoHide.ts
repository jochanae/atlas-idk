import { useEffect } from "react";

/**
 * Auto-hide the mobile footer (atlas-mobile-footer) during active scroll on
 * a given scroll container, and bring it back when scrolling stops.
 *
 * Sets `body[data-atlas-footer="hidden"]` while scrolling, removes it after
 * `idleMs` of inactivity. Shared between /home and /workspace so the merge
 * lands with identical behavior.
 *
 * Pass either a ref or a CSS selector string for the scroll container.
 */
export function useFooterAutoHide(
  source: React.RefObject<HTMLElement | null> | string,
  options: { idleMs?: number; enabled?: boolean } = {}
) {
  const { idleMs = 350, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const resolve = (): HTMLElement | null => {
      if (typeof source === "string") {
        return document.querySelector<HTMLElement>(source);
      }
      return source.current ?? null;
    };

    let el = resolve();
    // If the element isn't mounted yet, poll briefly.
    let attachTimer: ReturnType<typeof setTimeout> | null = null;
    if (!el) {
      attachTimer = setTimeout(() => {
        el = resolve();
        if (el) el.addEventListener("scroll", onScroll, { passive: true });
      }, 200);
    }

    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const show = () => {
      document.body.removeAttribute("data-atlas-footer");
    };
    const hide = () => {
      document.body.setAttribute("data-atlas-footer", "hidden");
    };

    const onScroll = () => {
      hide();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(show, idleMs);
    };

    if (el) el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (attachTimer) clearTimeout(attachTimer);
      if (idleTimer) clearTimeout(idleTimer);
      const cur = resolve();
      if (cur) cur.removeEventListener("scroll", onScroll);
      show();
    };
  }, [source, idleMs, enabled]);
}
