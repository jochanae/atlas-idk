// SW guard: unregister any existing /sw.js and clear its caches on
// Lovable preview/dev hosts (or when ?sw=off). Prevents stale bundles
// from flipping the preview between old and new builds.

const PREVIEW_HOST_PATTERNS = [
  /\.lovable\.app$/i,
  /\.lovableproject\.com$/i,
  /\.lovableproject-dev\.com$/i,
  /\.beta\.lovable\.dev$/i,
  /^id-preview--/i,
  /^preview--/i,
  /^localhost$/i,
  /^127\.0\.0\.1$/i,
];

function isPreviewOrDev(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("sw") === "off") return true;
    if (window.self !== window.top) return true;
    const host = window.location.hostname;
    if (PREVIEW_HOST_PATTERNS.some((rx) => rx.test(host))) return true;
    if (!import.meta.env.PROD) return true;
  } catch {}
  return false;
}

export function installSwGuard(): void {
  if (typeof window === "undefined") return;
  if (!isPreviewOrDev()) return;
  if (!("serviceWorker" in navigator)) return;

  void (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(
        regs.map(async (reg) => {
          const scriptURL =
            reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || "";
          // Only kill our own /sw.js — leave foreign workers (e.g. messaging) alone
          if (!scriptURL || scriptURL.endsWith("/sw.js")) {
            await reg.unregister();
          }
        }),
      );
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.allSettled(
          keys.filter((k) => k.startsWith("axiom-")).map((k) => caches.delete(k)),
        );
      }
    } catch {}
  })();
}
