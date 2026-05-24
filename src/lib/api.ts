export const API_BASE = "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("atlas-token");
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}
