import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, X, RotateCcw } from "lucide-react";

type SessionSummaryData = {
  summary: string | null;
  summaryAt: string | null;
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
};

export function SessionSummaryPill({ projectId, onSummaryCleared }: Props) {
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

  if (!data?.summary || !data.summaryAt) return null;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex" }}>
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
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "color-mix(in oklab, var(--atlas-gold) 10%, transparent)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "color-mix(in oklab, var(--atlas-gold) 35%, transparent)";
        }}
        onMouseLeave={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background =
              "color-mix(in oklab, var(--atlas-gold) 5%, transparent)";
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "color-mix(in oklab, var(--atlas-gold) 22%, transparent)";
          }
        }}
      >
        <Clock size={10} strokeWidth={2} aria-hidden />
        Last session: {timeAgo(data.summaryAt)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Session memory"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
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
              What Atlas remembers
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                padding: 2,
                cursor: "pointer",
                color: "var(--atlas-muted)",
                lineHeight: 0,
                borderRadius: 4,
                opacity: 0.6,
                transition: "opacity 120ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.6"; }}
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>

          <p
            style={{
              margin: 0,
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-sans)",
            }}
          >
            {data.summary}
          </p>

          <div
            style={{
              padding: "8px 12px 10px",
              borderTop: "1px solid color-mix(in oklab, var(--atlas-border, #2a2a36) 60%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--atlas-muted)",
                fontFamily: "var(--app-font-sans)",
              }}
            >
              {timeAgo(data.summaryAt!)}
            </span>
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={clearing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "1px solid color-mix(in oklab, var(--atlas-muted) 25%, transparent)",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 11,
                fontFamily: "var(--app-font-sans)",
                fontWeight: 500,
                color: "var(--atlas-muted)",
                cursor: clearing ? "default" : "pointer",
                opacity: clearing ? 0.5 : 1,
                transition: "opacity 160ms ease, border-color 160ms ease, color 160ms ease",
              }}
              onMouseEnter={(e) => {
                if (!clearing) {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--atlas-fg)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "color-mix(in oklab, var(--atlas-muted) 50%, transparent)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--atlas-muted)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "color-mix(in oklab, var(--atlas-muted) 25%, transparent)";
              }}
            >
              <RotateCcw size={10} strokeWidth={2} />
              {clearing ? "Clearing…" : "Clear memory"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
