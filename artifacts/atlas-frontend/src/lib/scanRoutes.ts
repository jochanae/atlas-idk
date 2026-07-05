export type RouterType = "hash" | "browser";

export function detectRouterType(source: string): RouterType {
  return /HashRouter/.test(source) ? "hash" : "browser";
}

export function scanRoutesFromSource(source: string): string[] {
  const routes = new Set<string>();
  // Matches <Route path="/foo" ...> and <Route path='/foo' ...>
  const re = /<Route\s+[^>]*\bpath\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const p = m[1].trim();
    if (p && !p.includes(":") && !p.includes("*")) routes.add(p.startsWith("/") ? p : `/${p}`);
  }
  return Array.from(routes);
}

export function cacheScannedRoutes(projectId: string, routes: string[], routerType?: RouterType) {
  try {
    const key = `atlas-scan-${projectId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...prev, routes, ...(routerType ? { routerType } : {}) }));
    // Nudge PreviewPanel effect — it depends on projectId/previewMode,
    // so also dispatch a storage event for same-tab listeners if needed:
    window.dispatchEvent(new StorageEvent("storage", { key }));
  } catch {}
}

export function cacheRoutesFromBuildFiles(
  projectId: number | string,
  files: Array<{ path?: string; content?: string; contents?: string }>,
) {
  const appFile = files.find((f) => f.path && /(^|\/)App\.(tsx|jsx)$/.test(f.path));
  const source = appFile?.contents ?? appFile?.content;
  if (source) {
    cacheScannedRoutes(String(projectId), scanRoutesFromSource(source), detectRouterType(source));
  }
}
