// Default to the deployed Neon-backed API. Override with VITE_API_URL when needed.
const DEFAULT_API_BASE = "https://www.axiomsystem.app";
export const API_BASE = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("atlas-token");
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}
