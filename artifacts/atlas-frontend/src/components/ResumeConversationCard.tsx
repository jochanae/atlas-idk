import { useEffect, useState } from "react";
import type { Project } from "@workspace/api-client-react";

type Props = {
  mostRecent: Project | null;
  isParchment: boolean;
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

type ResumeSignals = {
  worthResuming: boolean;
  reason?: "active-session" | "parked" | "fresh" | "unfinished";
};

/**
 * Determine whether the user has "something worth resuming" — Atlas waiting,
 * an open build, unresolved approvals, or genuinely unfinished work.
 *
 * Frontend-only heuristic (no new backend):
 *  - active session present → unfinished thread
 *  - parkedCount > 0        → unresolved items
 *  - updatedAt within 6h    → genuinely fresh, likely mid-flow
 * Otherwise: hide. Someone who left yesterday after finishing gets nothing.
 */
function useResumeSignals(projectId: number | null): ResumeSignals {
  const [signals, setSignals] = useState<ResumeSignals>({ worthResuming: false });

  useEffect(() => {
    if (!projectId) { setSignals({ worthResuming: false }); return; }
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

        if (hasActive) setSignals({ worthResuming: true, reason: "active-session" });
        else if (parked > 0) setSignals({ worthResuming: true, reason: "parked" });
        else if (fresh) setSignals({ worthResuming: true, reason: "fresh" });
        else setSignals({ worthResuming: false });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  return signals;
}

export function ResumeConversationCard({ mostRecent, isParchment, onResume }: Props) {
  const pid = mostRecent?.id ?? null;
  const [dismissed, setDismissed] = useState(false);
  const signals = useResumeSignals(pid);

  useEffect(() => {
    if (!pid) return;
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY(pid)) === "1"); } catch { /* noop */ }
  }, [pid]);

  if (!mostRecent || !pid) return null;
  if (dismissed) return null;
  if (!signals.worthResuming) return null;

  const updatedAt = (mostRecent as any).updatedAt ?? mostRecent.createdAt;
  const ts = updatedAt ? new Date(updatedAt).getTime() : Date.now();

  const handleResume = () => {
    try { sessionStorage.setItem(DISMISS_KEY(pid), "1"); } catch { /* noop */ }
    onResume(pid);
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 14, width: "100%" }}>
      <button
        type="button"
        onClick={handleResume}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 6,
          padding: "12px 16px",
          maxWidth: 360,
          width: "100%",
          textAlign: "left",
          background: isParchment ? "rgba(255,255,255,0.6)" : "rgba(28,25,23,0.4)",
          border: isParchment ? "1px solid rgba(146,64,14,0.18)" : "1px solid rgba(201,162,76,0.22)",
          borderRadius: 12,
          backdropFilter: "blur(6px)",
          cursor: "pointer",
          color: "inherit",
          transition: "border-color 160ms ease, background 160ms ease",
          boxSizing: "border-box",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = isParchment ? "rgba(146,64,14,0.4)" : "rgba(201,162,76,0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = isParchment ? "rgba(146,64,14,0.18)" : "rgba(201,162,76,0.22)";
        }}
      >
        <span style={{
          fontSize: 9.5,
          fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: isParchment ? "rgba(120,52,8,0.7)" : "rgba(201,162,76,0.7)",
        }}>
          Resume conversation
        </span>
        <span style={{
          fontSize: 14,
          fontFamily: "var(--app-font-sans)",
          fontWeight: 500,
          color: isParchment ? "rgba(17,17,17,0.92)" : "var(--atlas-fg)",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}>
          {mostRecent.name}
        </span>
        <span style={{
          fontSize: 11,
          fontFamily: "var(--app-font-mono)",
          color: isParchment ? "rgba(80,60,40,0.6)" : "var(--atlas-muted)",
          opacity: 0.75,
          letterSpacing: "0.02em",
        }}>
          Last active {formatAgo(ts)} · Continue →
        </span>
      </button>
    </div>
  );
}
