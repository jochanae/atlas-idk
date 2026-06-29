// API base URL.
// - Replit (dev + deployed): no env var set → same-origin → Express backend
// - Lovable preview: set VITE_API_URL=https://axiom-atlas-689827072865.us-east1.run.app
//   in Lovable's environment settings so its preview hits Cloud Run.
const configuredApiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "";
export const API_BASE = configuredApiBase.replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// Auth is cookie-based (atlas-session, httpOnly) PLUS a bearer token stored
// in localStorage as "atlas-auth-token". The global fetch shim in
// src/lib/install-api-fetch.ts attaches both automatically. Most call sites
// can keep using bare fetch("/api/..."); use apiUrl() only for non-fetch URLs
// (window.location redirects, <a href>, OAuth start).
export function getAuthHeaders(): Record<string, string> {
  return {};
}
