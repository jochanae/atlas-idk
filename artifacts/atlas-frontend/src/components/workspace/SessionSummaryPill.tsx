import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, X, RotateCcw } from "lucide-react";

type SessionSummaryData = {
  summary: string | null;
  summaryAt: string | null;
};

type Tier1Status = {
  known: number;
  total: number;
  missing: string[];
  skipped: boolean;
};

const TIER1_FIELD_LABELS: Record<string, string> = {
  projectName: "name",
  projectKind: "kind",
  successSignal: "success signal",
  constraints: "constraints",
  audience: "audience",
  timeline: "timeline",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  projectId: number | null;
  onSummaryCleared?: () => void;
  /** Compact mode: renders a gold clock icon-only trigger (for composer footer) */
  compact?: boolean;
};

export function SessionSummaryPill({ projectId, onSummaryCleared, compact = false }: Props) {
  const [data, setData] = useState<SessionSummaryData | null>(null);
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSummary = useCallback(async () => {
    if (projectId == null) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/session-summary`, { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as SessionSummaryData;
      setData(json);
    } catch {
    }
  }, [projectId]);

  useEffect(() => {
    setData(null);
    setOpen(false);
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleClear = async () => {
    if (projectId == null || clearing) return;
    setClearing(true);
    try {
      await fetch(`/api/projects/${projectId}/session-summary`, {
        method: "DELETE",
        credentials: "include",
      });
      setData({ summary: null, summaryAt: null });
      setOpen(false);
      onSummaryCleared?.();
    } catch {
    } finally {
      setClearing(false);
    }
  };

  const hasSummary = !!(data?.summary && data.summaryAt);

  // Non-compact mode preserves original behavior: hide entirely when no summary.
  if (!compact && !hasSummary) return null;

  const compactTrigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label={hasSummary ? "Last session memory" : "No session memory yet"}
      title={hasSummary ? "What Atlas remembers from your last session" : "No session memory yet"}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 999,
        background: hasSummary
          ? "color-mix(in oklab, var(--atlas-gold) 10%, transparent)"
          : "color-mix(in oklab, var(--atlas-gold) 4%, transparent)",
        border: `1px solid color-mix(in oklab, var(--atlas-gold) ${hasSummary ? 28 : 14}%, transparent)`,
        color: "var(--atlas-gold)",
        opacity: hasSummary ? 1 : 0.55,
        cursor: "pointer",
        flexShrink: 0,
        position: "relative",
      }}
    >
      <Clock size={15} strokeWidth={1.7} aria-hidden />
      {hasSummary && (
        <span style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 999, background: "var(--atlas-gold)" }} />
      )}
    </button>
  );

  const fullTrigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      title="What Atlas remembers from your last session"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 20,
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
        background: open
          ? "color-mix(in oklab, var(--atlas-gold) 10%, transparent)"
          : "color-mix(in oklab, var(--atlas-gold) 5%, transparent)",
        color: "color-mix(in oklab, var(--atlas-gold) 75%, var(--atlas-muted))",
        fontSize: 11,
        fontFamily: "var(--app-font-sans)",
        fontWeight: 500,
        letterSpacing: "0.03em",
        cursor: "pointer",
        transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
        WebkitTapHighlightColor: "transparent",
        whiteSpace: "nowrap",
      }}
    >
      <Clock size={10} strokeWidth={2} aria-hidden />
      Last session: {data?.summaryAt ? timeAgo(data.summaryAt) : ""}
    </button>
  );

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex" }}>
      {compact ? compactTrigger : fullTrigger}

      {open && (
        <div
          role="dialog"
          aria-label="Session memory"
          style={{
            position: "absolute",
            ...(compact
              ? { bottom: "calc(100% + 8px)", left: 0 }
              : { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }),
            zIndex: 200,
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            background: "var(--atlas-surface, #0e0e14)",
            border: "1px solid color-mix(in oklab, var(--atlas-gold) 20%, transparent)",
            borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px 8px",
              borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 12%, transparent)",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "color-mix(in oklab, var(--atlas-gold) 70%, var(--atlas-muted))",
                fontFamily: "var(--app-font-sans)",
              }}
            >
              Atlas Memory
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: "none", border: "none", padding: 2, cursor: "pointer",
                color: "var(--atlas-muted)", lineHeight: 0, borderRadius: 4, opacity: 0.6,
              }}
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>

          {hasSummary ? (
            <>
              <div style={{ padding: "12px 12px 10px", position: "relative" }}>
                <div
                  aria-hidden
                  style={{
                    position: "absolute", left: 0, top: 12, bottom: 10, width: 2,
                    background: "linear-gradient(180deg, color-mix(in oklab, var(--atlas-gold) 65%, transparent), color-mix(in oklab, var(--atlas-gold) 15%, transparent))",
                    borderRadius: 2,
                  }}
                />
                <p style={{ margin: 0, paddingLeft: 10, fontSize: 13, lineHeight: 1.6, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)" }}>
                  {data!.summary}
                </p>
              </div>
              <div style={{ padding: "8px 12px 10px", borderTop: "1px solid color-mix(in oklab, var(--atlas-border, #2a2a36) 60%, transparent)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Clock size={10} strokeWidth={2} aria-hidden />
                  {timeAgo(data!.summaryAt!)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleClear()}
                  disabled={clearing}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: "none", border: "1px solid color-mix(in oklab, var(--atlas-muted) 25%, transparent)",
                    borderRadius: 6, padding: "3px 8px", fontSize: 11, fontFamily: "var(--app-font-sans)",
                    fontWeight: 500, color: "var(--atlas-muted)",
                    cursor: clearing ? "default" : "pointer", opacity: clearing ? 0.5 : 1,
                  }}
                >
                  <RotateCcw size={10} strokeWidth={2} />
                  {clearing ? "Clearing…" : "Clear memory"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: "18px 14px", textAlign: "center", fontFamily: "var(--app-font-sans)" }}>
              <Clock size={18} strokeWidth={1.5} aria-hidden style={{ color: "color-mix(in oklab, var(--atlas-gold) 55%, transparent)", opacity: 0.7 }} />
              <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--atlas-muted)" }}>
                Nothing to remember yet.<br />Atlas will hold onto what matters as you work.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
