import { useEffect, useState } from "react";
import type { Project } from "@workspace/api-client-react";

type Props = {
  mostRecent: Project | null;
  fallback: string;
  onResume: (projectId: number) => void;
};

const DISMISS_KEY = (pid: number) => `atlas-resume-dismissed:${pid}`;

function formatAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function useResumeWorthy(projectId: number | null): boolean {
  const [worthy, setWorthy] = useState(false);
  useEffect(() => {
    if (!projectId) { setWorthy(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/state`, { credentials: "include" });
        if (!r.ok || cancelled) return;
        const data = await r.json();
        const hasActive = !!data?.activeSession;
        const parked = typeof data?.parkedCount === "number" ? data.parkedCount : 0;
        const updatedAt = data?.project?.updatedAt ?? data?.project?.createdAt;
        const fresh = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) < 6 * 3600 * 1000 : false;
        if (!cancelled) setWorthy(hasActive || parked > 0 || fresh);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [projectId]);
  return worthy;
}

/**
 * ResumeSubtitle — replaces the hero subtitle when there's something
 * genuinely worth resuming. No card, no border, no pill — just text
 * styled like the rest of the hero. Falls back to the default subtitle
 * when there's nothing to resume.
 */
export function ResumeSubtitle({ mostRecent, fallback, onResume }: Props) {
  const pid = mostRecent?.id ?? null;
  const [dismissed, setDismissed] = useState(false);
  const worthy = useResumeWorthy(pid);

  useEffect(() => {
    if (!pid) return;
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY(pid)) === "1"); } catch { /* noop */ }
  }, [pid]);

  const showResume = !!mostRecent && !!pid && !dismissed && worthy;

  if (!showResume) {
    return <>{fallback}</>;
  }

  const updatedAt = (mostRecent as any).updatedAt ?? mostRecent!.createdAt;
  const ts = updatedAt ? new Date(updatedAt).getTime() : Date.now();

  const handleResume = () => {
    try { sessionStorage.setItem(DISMISS_KEY(pid!), "1"); } catch { /* noop */ }
    onResume(pid!);
  };

  return (
    <button
      type="button"
      onClick={handleResume}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        color: "inherit",
        font: "inherit",
        fontStyle: "italic",
        cursor: "pointer",
        textAlign: "inherit",
        letterSpacing: "inherit",
        lineHeight: "inherit",
      }}
    >
      Continue “{mostRecent!.name}” · {formatAgo(ts)} →
    </button>
  );
}
