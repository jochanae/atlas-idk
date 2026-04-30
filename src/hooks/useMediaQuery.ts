import { useEffect, useState } from "react";

/**
 * useMediaQuery — SSR-safe matchMedia hook.
 * Returns false on the server and on first client render, then updates.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
