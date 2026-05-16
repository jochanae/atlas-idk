const RAILWAY_BASE = import.meta.env.VITE_RAILWAY_URL ?? "https://workspaceapi-server-production-7e0d.up.railway.app";
const RAILWAY_TOKEN = import.meta.env.VITE_RAILWAY_API_TOKEN;

async function railwayFetch(path: string, userId: string): Promise<Response> {
  return fetch(`${RAILWAY_BASE}${path}`, {
    headers: {
      "x-railway-token": RAILWAY_TOKEN ?? "",
      "x-user-id": userId,
      "Content-Type": "application/json",
    },
  });
}

export async function getDashboardStats(userId: string) {
  const res = await railwayFetch("/api/server/stats/dashboard", userId);
  if (!res.ok) throw new Error(`Dashboard stats failed: ${res.status}`);
  return res.json();
}

export async function getProjects(userId: string) {
  const res = await railwayFetch("/api/server/projects", userId);
  if (!res.ok) throw new Error(`Projects failed: ${res.status}`);
  return res.json();
}

export async function getEntries(userId: string) {
  const res = await railwayFetch("/api/server/entries", userId);
  if (!res.ok) throw new Error(`Entries failed: ${res.status}`);
  return res.json();
}

export async function checkRailwayHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${RAILWAY_BASE}/api/server/health`, {
      headers: { "x-railway-token": RAILWAY_TOKEN ?? "" },
    });
    return res.ok;
  } catch {
    return false;
  }
}
