import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Terminal, GitPullRequest } from "lucide-react";
import { useAllRuns } from "./home/ActiveRuns";
import type { ActiveRun } from "./home/ActiveRuns";

type Props = {
  open: boolean;
  onClose: () => void;
};

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RunShellBlock({ run }: { run: ActiveRun }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run.shellLines?.length]);

  const prNum = run.prUrl?.match(/\/pull\/(\d+)/)?.[1];
  const now = Date.now();
  const ago = formatAgo(now - (run.completedAt ?? run.createdAt));

  return (
    <div style={{
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.07)",
      overflow: "hidden",
      background: "rgba(0,0,0,0.2)",
    }}>
      {/* Run header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 12px",
        background: "rgba(0,0,0,0.25)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* Status dot */}
        <span style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: run.status === "completed" ? "rgba(74,222,128,0.8)"
            : run.status === "running" ? "hsl(217,80%,64%)"
            : run.status === "failed" ? "rgba(248,113,113,0.8)"
            : "rgba(201,162,76,0.7)",
          boxShadow: run.status === "running" ? "0 0 5px hsl(217,80%,64%)" : "none",
        }} />

        {/* Project */}
        <span style={{
          fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
          color: "var(--atlas-muted)", flexShrink: 0,
        }}>
          {run.projectName}
        </span>

        {/* Prompt (truncated) */}
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 11, fontFamily: "var(--app-font-sans)",
          color: "var(--atlas-fg)", opacity: 0.7,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {run.prompt}
        </span>

        {/* PR pill */}
        {prNum && run.prUrl && (
          <a
            href={run.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "1px 6px", borderRadius: 999, flexShrink: 0,
              background: "rgba(201,162,76,0.10)",
              border: "1px solid rgba(201,162,76,0.3)",
              color: "var(--atlas-gold)",
              fontSize: 9.5, fontFamily: "var(--app-font-mono)", fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <GitPullRequest size={8} strokeWidth={2} />
            #{prNum}
          </a>
        )}

        {/* Timestamp */}
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)",
          color: "var(--atlas-muted)", opacity: 0.45, flexShrink: 0,
        }}>
          {ago}
        </span>
      </div>

      {/* Shell lines */}
      <div style={{ padding: "8px 12px", maxHeight: 220, overflowY: "auto" }}>
        {(run.shellLines?.length ?? 0) > 0 ? (
          run.shellLines!.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 2 }}>
              <span style={{
                flexShrink: 0, width: 12, textAlign: "right",
                fontSize: 10, fontFamily: "var(--app-font-mono)", lineHeight: 1.55,
                color: line.kind === "cmd" ? "rgba(201,162,76,0.8)"
                  : line.kind === "err" ? "rgba(248,113,113,0.75)"
                  : "rgba(74,222,128,0.5)",
                userSelect: "none",
              }}>
                {line.kind === "cmd" ? "›" : line.kind === "err" ? "✕" : " "}
              </span>
              <pre style={{
                margin: 0, flex: 1, fontSize: 10.5, lineHeight: 1.55,
                fontFamily: "var(--app-font-mono)",
                color: line.kind === "cmd" ? "rgba(255,255,255,0.88)"
                  : line.kind === "err" ? "rgba(248,113,113,0.85)"
                  : "rgba(255,255,255,0.55)",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {line.text}
              </pre>
            </div>
          ))
        ) : (
          <div style={{
            fontSize: 11, color: "var(--atlas-muted)", opacity: 0.45,
            fontStyle: "italic", fontFamily: "var(--app-font-sans)",
          }}>
            No shell output captured.
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export function ShellLogSheet({ open, onClose }: Props) {
  const allRuns = useAllRuns();
  const runsWithShell = allRuns.filter(
    (r) => (r.shellLines?.length ?? 0) > 0 || r.status === "running"
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)",
          zIndex: 12100,
          animation: "shell-fade-in 180ms ease",
        }}
      />

      {/* Sheet */}
      <aside
        role="dialog"
        aria-label="Shell Log"
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 0,
          top: "max(env(safe-area-inset-top, 0px), 4vh)",
          width: "min(720px, 100vw)",
          backgroundColor: "var(--atlas-bg)",
          borderTop: "1px solid var(--atlas-gold-border)",
          borderLeft: "1px solid var(--atlas-gold-border)",
          borderRight: "1px solid var(--atlas-gold-border)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -12px 60px -12px rgba(0,0,0,0.75), 0 0 0 1px rgba(201,162,76,0.06)",
          zIndex: 12101,
          display: "flex", flexDirection: "column",
          animation: "shell-slide-in 240ms cubic-bezier(.2,.8,.2,1)",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "8px 0 4px",
        }}>
          <div style={{
            width: 36, height: 3, borderRadius: 999,
            background: "rgba(201,162,76,0.25)",
          }} />
        </div>

        {/* Header */}
        <header style={{
          flexShrink: 0,
          padding: "6px 16px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--atlas-gold-border)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Terminal size={13} strokeWidth={1.8} color="var(--atlas-gold)" />
              <span style={{
                fontSize: 9.5, fontWeight: 600,
                fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)",
                letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7,
              }}>
                Shell
              </span>
            </div>
            <span style={{
              fontSize: 10.5, color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-sans)",
            }}>
              Commands fired across all build runs
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: "transparent", color: "var(--atlas-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: "14px 16px",
          overscrollBehavior: "contain",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {runsWithShell.length > 0 ? (
            runsWithShell.map((run) => (
              <RunShellBlock key={run.id} run={run} />
            ))
          ) : (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 12, opacity: 0.5,
            }}>
              <Terminal size={28} strokeWidth={1.2} color="var(--atlas-muted)" />
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 13, fontFamily: "var(--app-font-sans)",
                  color: "var(--atlas-fg)", opacity: 0.7, marginBottom: 4,
                }}>
                  No shell output yet
                </div>
                <div style={{
                  fontSize: 11, fontFamily: "var(--app-font-sans)",
                  color: "var(--atlas-muted)",
                }}>
                  Run a build in the Atlas Composer to see commands here.
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <style>{`
        @keyframes shell-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shell-slide-in {
          from { transform: translate(-50%, 24px); opacity: 0; }
          to   { transform: translate(-50%, 0);    opacity: 1; }
        }
      `}</style>
    </>,
    document.body
  );
}
