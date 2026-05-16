import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RAILWAY_BASE =
  process.env.RAILWAY_URL ??
  "https://workspaceapi-server-production-7e0d.up.railway.app";

async function railwayFetch(path: string, userId: string) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error("RAILWAY_API_TOKEN missing");
  const res = await fetch(`${RAILWAY_BASE}${path}`, {
    headers: {
      "x-railway-token": token,
      "x-user-id": userId,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Railway ${path} failed: ${res.status}`);
  return res.json();
}

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return railwayFetch("/api/server/stats/dashboard", context.userId);
  });

export const getProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return railwayFetch("/api/server/projects", context.userId);
  });

export const getEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return railwayFetch("/api/server/entries", context.userId);
  });

export const checkRailwayHealth = createServerFn({ method: "GET" }).handler(
  async () => {
    const token = process.env.RAILWAY_API_TOKEN;
    try {
      const res = await fetch(`${RAILWAY_BASE}/api/server/health`, {
        headers: { "x-railway-token": token ?? "" },
      });
      return { ok: res.ok, status: res.status };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "unreachable" };
    }
  },
);
