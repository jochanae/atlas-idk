import { useEffect, useRef, useState } from "react";

export type ActivityItem = {
  type: "commit" | "decision" | "session";
  projectId: number;
  projectName: string;
  title: string;
  subtitle?: string;
  url?: string;
  sha?: string;
  timestamp: string;
};

export type Importance = "important" | "quiet";

export function classifyActivity(item: ActivityItem): Importance {
  if (item.type === "decision") return "important";
  // commits/sessions are quiet by default; flag deploy/release/merge as important
  const hay = `${item.title} ${item.subtitle ?? ""}`.toLowerCase();
  if (/\b(deploy|release|merge|publish|prod|main)\b/.test(hay)) return "important";
  return "quiet";
}

const POLL_MS = 30_000;
const SEEN_KEY = (pid: number) => `atlas-workspace-activity-seen:${pid}`;

/**
 * useWorkspaceActivity — polls /api/nexus/activity, filters to this project,
 * returns chronologically ascending items. Tracks last-seen timestamp per
 * project so new events can be highlighted by the renderer if desired.
 */
export function useWorkspaceActivity(projectId: number | null | undefined) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const lastSeenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    try {
      lastSeenRef.current = localStorage.getItem(SEEN_KEY(projectId));
    } catch { /* noop */ }

    let cancelled = false;
    const pull = async () => {
      try {
        const r = await fetch("/api/nexus/activity", { credentials: "include" });
        if (!r.ok) return;
        const data = (await r.json()) as { items?: ActivityItem[] };
        if (cancelled || !data.items) return;
        const filtered = data.items
          .filter((it) => it.projectId === projectId)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setItems(filtered);
      } catch { /* noop */ }
    };

    void pull();
    const id = window.setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [projectId]);

  const markAllSeen = () => {
    if (!projectId || items.length === 0) return;
    const last = items[items.length - 1].timestamp;
    lastSeenRef.current = last;
    try { localStorage.setItem(SEEN_KEY(projectId), last); } catch { /* noop */ }
  };

  return { items, lastSeen: lastSeenRef.current, markAllSeen };
}
