// API base URL. Points to Cloud Run (production backend) by default so the
// Lovable preview works out of the box. Override with VITE_API_URL at build
// time when pointing at a different backend (e.g. the local Replit Express
// server during development).
const DEFAULT_API_BASE = "https://axiom-atlas-689827072865.us-east1.run.app";
const configuredApiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE;
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
