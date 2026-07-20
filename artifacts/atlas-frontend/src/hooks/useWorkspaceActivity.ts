import { useEffect, useRef, useState } from "react";

export type ActivityItem = {
  id?: number;
  type:
    | "commit"
    | "decision"
    | "session"
    // Attachment / turn lifecycle verbs. Backend will emit; frontend renders
    // them the same way regardless of source. Keep names stable — they are
    // the wire contract with the Replit worker (see 2026-07-20 handoff).
    | "attachment_received"
    | "image_analyzed"
    | "document_analyzed"
    | "attachment_unsupported"
    | "atlas_thinking"
    | "response_generated";
  projectId: number;
  projectName: string;
  title: string;
  subtitle?: string;
  url?: string;
  sha?: string;
  timestamp: string;
  /** Optional filename/attachment reference for attachment_* verbs. */
  attachmentName?: string;
  /** Reason string for attachment_unsupported ("PPTX not yet readable"). */
  reason?: string;
};

export type Importance = "important" | "quiet";

export function classifyActivity(item: ActivityItem): Importance {
  // Commits and decisions are first-class receipts — render as full cards.
  // Only sessions (opens, background pings) stay quiet/batched.
  if (item.type === "session") return "quiet";
  return "important";
}

const POLL_MS = 30_000;
const SEEN_KEY = (pid: number) => `atlas-workspace-activity-seen:${pid}`;

// Legacy placeholder titles seeded before the no-auto-seed policy.
// "Session" is included as a temporary safeguard for older data.
const STARTUP_SESSION_TITLES = new Set(["Session 1", "Session", ""]);

function isStartupNoise(item: ActivityItem): boolean {
  if (item.type === "session") {
    return STARTUP_SESSION_TITLES.has(item.title?.trim() ?? "");
  }
  if (item.type === "decision" && item.title === "Project activated.") {
    return true;
  }
  return false;
}

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
          .filter((it) => !isStartupNoise(it))
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
