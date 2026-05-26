export const API_BASE = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("atlas-token");
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}
