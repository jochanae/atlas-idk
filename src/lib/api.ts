// Default to the deployed Neon-backed API. Override with VITE_API_URL when needed.
const DEFAULT_API_BASE = "https://axiomsystem.app";
export const API_BASE = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// Supabase v2 persists the session under localStorage key `sb-<projectRef>-auth-token`.
// We read it synchronously so existing sync call sites keep working.
const SUPABASE_PROJECT_REF = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ?? "lmrpnsjckljdwqudtelk";
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

function getSupabaseAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string } | null;
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getSupabaseAccessToken() ?? (typeof localStorage !== "undefined" ? localStorage.getItem("atlas-token") : null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
