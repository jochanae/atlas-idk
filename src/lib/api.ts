export const API_BASE = "https://axiom-atlas-689827072865.us-east1.run.app";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("atlas-token");
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}
