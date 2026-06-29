// API base URL — resolved once at startup.
// Priority: explicit VITE_API_URL env var → same-origin (Replit backend)
// For Lovable preview: set VITE_API_URL to the Replit deployed URL in Lovable's
// project settings (Settings → Environment → add VITE_API_URL).
function resolveApiBase(): string {
  const explicit = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return ""; // same-origin → Replit backend
}

export const API_BASE = resolveApiBase();

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
