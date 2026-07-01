import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, XCircle, Loader, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useBuildStream } from "./useBuildStream";
import type { BuildCommand } from "./types";

const MONO: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };

function StatusIcon({ status }: { status: string }) {
  if (status === "running") return <Loader size={13} style={{ color: "var(--atlas-gold)", animation: "spin 1s linear infinite" }} />;
  if (status === "success") return <CheckCircle size={13} style={{ color: "#22c55e" }} />;
  if (status === "failed" || status === "timeout" || status === "error")
    return <XCircle size={13} style={{ color: "#ef4444" }} />;
  return null;
}

function statusLabel(s: string, cmd: BuildCommand): string {
  if (s === "running") return cmd === "typecheck" ? "Type-checking…" : "Building…";
  if (s === "success") return cmd === "typecheck" ? "Typecheck passed" : "Build succeeded";
  if (s === "failed") return cmd === "typecheck" ? "Type errors found" : "Build failed";
  if (s === "timeout") return "Timed out";
  if (s === "error") return "Command error";
  return "";
}

function ms(n: number): string {
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

// ── BuildPanel ────────────────────────────────────────────────────────────────
export function BuildPanel() {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState<BuildCommand>("typecheck");
  const [errExpanded, setErrExpanded] = useState(false);
  const { status, lines, result, run, cancel, reset } = useBuildStream();
  const outputRef = useRef<HTMLDivElement>(null);

  // Listen for axiom:build-run global event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ command?: BuildCommand; projectId?: number }>).detail ?? {};
      const cmd: BuildCommand = detail.command === "build" ? "build" : "typecheck";
      setCommand(cmd);
      setErrExpanded(false);
      reset();
      setOpen(true);
      // slight delay so panel renders before stream starts
      setTimeout(() => run(cmd, detail.projectId), 80);
    };
    window.addEventListener("axiom:build-run", handler);
    return () => window.removeEventListener("axiom:build-run", handler);
  }, [run, reset]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines.length]);

  // Auto-expand error section on failure
  useEffect(() => {
    if ((status === "failed" || status === "error") && result?.errorSummary) {
      setErrExpanded(true);
    }
  }, [status, result]);

  if (!open || typeof document === "undefined") return null;

  const done = status !== "idle" && status !== "running";
  const errLines = lines.filter((l) => l.kind === "err");
  const hasErrors = errLines.length > 0 || !!result?.errorSummary;

  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: "min(560px, calc(100vw - 48px))",
        zIndex: 2100,
        background: "color-mix(in oklab, var(--atlas-bg) 97%, white 3%)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 12,
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.06)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        maxHeight: "70vh",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        flexShrink: 0,
      }}>
        <StatusIcon status={status} />
        <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.08em", color: "var(--atlas-fg)", flex: 1 }}>
          {status === "idle" ? (command === "typecheck" ? "TYPECHECK" : "BUILD") : statusLabel(status, command).toUpperCase()}
        </span>
        {done && result && (
          <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", opacity: 0.55 }}>
            <Clock size={10} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} />
            {ms(result.duration)}
          </span>
        )}
        {status === "running" && (
          <button
            onClick={cancel}
            style={{
              ...MONO, fontSize: 10, letterSpacing: "0.08em",
              padding: "3px 8px", borderRadius: 4, cursor: "pointer",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              color: "var(--atlas-muted)",
            }}
          >
            cancel
          </button>
        )}
        <button
          onClick={() => { cancel(); setOpen(false); reset(); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--atlas-muted)", display: "flex", padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Output stream ── */}
      <div
        ref={outputRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 14px",
          minHeight: 120,
          maxHeight: 320,
          background: "rgba(0,0,0,0.25)",
        }}
      >
        {lines.length === 0 && status === "running" && (
          <div style={{ ...MONO, fontSize: 11, color: "var(--atlas-muted)", opacity: 0.4 }}>
            Starting…
          </div>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              ...MONO,
              fontSize: 11,
              lineHeight: 1.6,
              color: line.kind === "err" ? "rgba(248,113,113,0.9)" : "rgba(255,255,255,0.75)",
              wordBreak: "break-all",
              whiteSpace: "pre-wrap",
            }}
          >
            {line.text}
          </div>
        ))}
        {status === "running" && (
          <div style={{ ...MONO, fontSize: 11, color: "var(--atlas-gold)", opacity: 0.6, marginTop: 2 }}>
            ▌
          </div>
        )}
      </div>

      {/* ── Error summary (collapsible) ── */}
      {done && hasErrors && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <button
            onClick={() => setErrExpanded((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", background: "none", border: "none", cursor: "pointer",
              color: "#ef4444",
            }}
          >
            <XCircle size={12} />
            <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.08em", flex: 1, textAlign: "left" }}>
              {errLines.length} ERROR{errLines.length !== 1 ? "S" : ""}
            </span>
            {errExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {errExpanded && result?.errorSummary && (
            <div style={{
              padding: "0 14px 10px",
              ...MONO, fontSize: 11, lineHeight: 1.6,
              color: "rgba(248,113,113,0.85)",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {result.errorSummary}
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["typecheck", "build"] as BuildCommand[]).map((cmd) => (
            <button
              key={cmd}
              disabled={status === "running"}
              onClick={() => {
                setCommand(cmd);
                setErrExpanded(false);
                reset();
                setTimeout(() => run(cmd), 80);
              }}
              style={{
                ...MONO, fontSize: 10, letterSpacing: "0.08em",
                padding: "4px 10px", borderRadius: 5, cursor: status === "running" ? "not-allowed" : "pointer",
                background: command === cmd ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.05)",
                border: command === cmd ? "1px solid rgba(212,175,55,0.35)" : "1px solid rgba(255,255,255,0.09)",
                color: command === cmd ? "var(--atlas-gold)" : "var(--atlas-muted)",
                opacity: status === "running" ? 0.5 : 1,
              }}
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Phase 2: send to Atlas to fix — wired but disabled */}
        <button
          disabled={true}
          title="Coming in Phase 2 — send errors to Atlas for an automated fix"
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.06em",
            padding: "4px 10px", borderRadius: 5, cursor: "not-allowed",
            background: "transparent",
            border: "1px solid rgba(212,175,55,0.15)",
            color: "var(--atlas-gold)", opacity: 0.35,
          }}
        >
          send to atlas →
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  );
}
