import { apiUrl } from "./api";

export type RecentProject = {
  id: number;
  name?: string;
  lastOpenedAt?: string;
};

export async function touchProject(id: number): Promise<void> {
  try {
    await fetch(apiUrl(`/api/projects/${id}/touch`), {
      method: "POST",
      credentials: "include",
    });
    try {
      localStorage.setItem("atlas:lastProjectId", String(id));
    } catch {}
  } catch {
    // best-effort, ignore
  }
}

export async function fetchRecentProjects(withinHours = 48): Promise<RecentProject[] | null> {
  try {
    const res = await fetch(apiUrl(`/api/projects/recent?withinHours=${withinHours}`), {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data)) return data as RecentProject[];
    if (Array.isArray((data as any)?.projects)) return (data as any).projects as RecentProject[];
    return null;
  } catch {
    return null;
  }
}
