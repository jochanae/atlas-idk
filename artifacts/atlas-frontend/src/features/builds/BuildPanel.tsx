import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { X, CheckCircle, XCircle, Loader, Clock, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useBuildStream } from "./useBuildStream";
import type { BuildCommand } from "./types";

const MONO: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };
const MAX_FIX_ATTEMPTS = 3;

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
  const queryClient = useQueryClient();
  const { status, lines, result, run, cancel, reset } = useBuildStream();
  const outputRef = useRef<HTMLDivElement>(null);

  // ── Fix cycle state ────────────────────────────────────────────────────────
  // fixAttempt === 0 → not in a fix cycle
  // fixAttempt === 1..MAX → currently in fix cycle, on this attempt
  // patchSent === true → "send to atlas →" was clicked, waiting for patch-applied event
  const [fixAttempt, setFixAttempt] = useState(0);
  const [patchSent, setPatchSent] = useState(false);
  const fixCommandRef = useRef<BuildCommand>("typecheck");
  const fixProjectIdRef = useRef<number | undefined>(undefined);
  const currentProjectIdRef = useRef<number | undefined>(undefined);

  const inFixCycle = fixAttempt > 0;
  const atMaxAttempts = fixAttempt >= MAX_FIX_ATTEMPTS;

  // ── Listen for axiom:build-run global event ────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ command?: BuildCommand; projectId?: number }>).detail ?? {};
      const cmd: BuildCommand = detail.command === "build" ? "build" : "typecheck";
      setCommand(cmd);
      setErrExpanded(false);
      // Starting a manual build-run resets any active fix cycle
      setFixAttempt(0);
      setPatchSent(false);
      currentProjectIdRef.current = detail.projectId;
      reset();
      setOpen(true);
      setTimeout(() => run(cmd, detail.projectId), 80);
    };
    window.addEventListener("axiom:build-run", handler);
    return () => window.removeEventListener("axiom:build-run", handler);
  }, [run, reset]);

  // ── Listen for axiom:patch-applied — re-run build after fix is applied ─────
  useEffect(() => {
    const handler = () => {
      if (!patchSent) return; // only respond when we're waiting for a patch
      const cmd = fixCommandRef.current;
      const pid = fixProjectIdRef.current;
      setPatchSent(false);
      setErrExpanded(false);
      reset();
      setOpen(true);
      setTimeout(() => run(cmd, pid), 120);
    };
    window.addEventListener("axiom:patch-applied", handler);
    return () => window.removeEventListener("axiom:patch-applied", handler);
  }, [patchSent, run, reset]);

  // ── Auto-scroll output ─────────────────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines.length]);

  // ── Invalidate project runs list when a build completes ───────────────────
  useEffect(() => {
    if (!result) return;
    const pid = currentProjectIdRef.current;
    if (pid != null) {
      void queryClient.invalidateQueries({ queryKey: ["project-runs", pid] });
    }
  }, [result, queryClient]);

  // ── Auto-expand error section on failure ───────────────────────────────────
  useEffect(() => {
    if ((status === "failed" || status === "error") && result?.errorSummary) {
      setErrExpanded(true);
    }
  }, [status, result]);

  if (!open || typeof document === "undefined") return null;

  const done = status !== "idle" && status !== "running";
  const errLines = lines.filter((l) => l.kind === "err");
  const hasErrors = errLines.length > 0 || !!result?.errorSummary;
  const fixSucceeded = inFixCycle && done && status === "success";
  const fixFailed = inFixCycle && done && status !== "success";

  const headerLabel = (() => {
    if (fixSucceeded) return `FIXED ✓ (attempt ${fixAttempt}/${MAX_FIX_ATTEMPTS})`;
    if (inFixCycle && status === "running")
      return `FIX ATTEMPT ${fixAttempt}/${MAX_FIX_ATTEMPTS} — ${command === "typecheck" ? "TYPE-CHECKING…" : "BUILDING…"}`;
    if (inFixCycle && done)
      return `FIX ATTEMPT ${fixAttempt}/${MAX_FIX_ATTEMPTS} — ${statusLabel(status, command).toUpperCase()}`;
    if (patchSent) return "SENT TO ATLAS — AWAITING PATCH…";
    if (status === "idle") return command === "typecheck" ? "TYPECHECK" : "BUILD";
    return statusLabel(status, command).toUpperCase();
  })();

  const headerColor = fixSucceeded
    ? "#22c55e"
    : (inFixCycle || patchSent)
      ? "rgba(201,162,76,0.9)"
      : "var(--atlas-fg)";

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
        {patchSent
          ? <RefreshCw size={13} style={{ color: "rgba(201,162,76,0.7)", animation: "spin 2s linear infinite" }} />
          : <StatusIcon status={status} />}
        <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.08em", color: headerColor, flex: 1 }}>
          {headerLabel}
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
          onClick={() => {
            cancel();
            setOpen(false);
            reset();
            setFixAttempt(0);
            setPatchSent(false);
          }}
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
        {lines.length === 0 && patchSent && (
          <div style={{ ...MONO, fontSize: 11, color: "rgba(201,162,76,0.5)", lineHeight: 1.7 }}>
            Errors sent to Joy. Review the proposed changes in the chat,{"\n"}
            then approve the diff — the build will re-run automatically.
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

      {/* ── Max attempts banner ── */}
      {atMaxAttempts && fixFailed && (
        <div style={{
          padding: "7px 14px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          ...MONO, fontSize: 10, letterSpacing: "0.06em",
          color: "rgba(248,113,113,0.7)",
          background: "rgba(239,68,68,0.04)",
        }}>
          Max fix attempts ({MAX_FIX_ATTEMPTS}) reached — resolve remaining errors manually.
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        {/* Left: command buttons (hidden during fix cycle to reduce noise) */}
        <div style={{ display: "flex", gap: 6 }}>
          {!inFixCycle && !patchSent && (["typecheck", "build"] as BuildCommand[]).map((cmd) => (
            <button
              key={cmd}
              disabled={status === "running"}
              onClick={() => {
                setCommand(cmd);
                setErrExpanded(false);
                setFixAttempt(0);
                setPatchSent(false);
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

          {/* During fix cycle: show attempt indicator */}
          {(inFixCycle || patchSent) && (
            <span style={{ ...MONO, fontSize: 10, color: "var(--atlas-muted)", opacity: 0.55, alignSelf: "center" }}>
              {patchSent ? `attempt ${fixAttempt}/${MAX_FIX_ATTEMPTS} — patch pending` : `attempt ${fixAttempt}/${MAX_FIX_ATTEMPTS}`}
            </span>
          )}
        </div>

        {/* Right: send button — hidden when: success in no-fix-cycle, patchSent, max attempts, or fix succeeded */}
        {fixSucceeded ? (
          <span style={{ ...MONO, fontSize: 10, color: "#22c55e", letterSpacing: "0.06em" }}>
            fixed ✓
          </span>
        ) : patchSent ? (
          <span style={{ ...MONO, fontSize: 10, color: "rgba(201,162,76,0.5)", letterSpacing: "0.06em" }}>
            waiting for patch…
          </span>
        ) : atMaxAttempts && fixFailed ? null : (
          <button
            disabled={!done || !result?.errorSummary || status === "success"}
            title={
              !done ? "Waiting for run to finish…"
              : status === "success" ? "No errors to send"
              : atMaxAttempts ? `Max ${MAX_FIX_ATTEMPTS} fix attempts reached`
              : inFixCycle
                ? `Send remaining errors to Joy (attempt ${fixAttempt + 1}/${MAX_FIX_ATTEMPTS})`
                : "Send errors to Joy to diagnose and fix"
            }
            onClick={() => {
              if (!result?.errorSummary) return;
              const nextAttempt = fixAttempt + 1;
              setFixAttempt(nextAttempt);
              setPatchSent(true);
              fixCommandRef.current = command;
              fixProjectIdRef.current = result.buildId ? undefined : undefined; // projectId not on result; carry from last run
              const attemptNote = inFixCycle
                ? ` (fix attempt ${nextAttempt}/${MAX_FIX_ATTEMPTS})`
                : "";
              const msg = `I just ran \`${result.command}\` and got these errors${attemptNote}. Please diagnose and fix them:\n\n\`\`\`\n${result.errorSummary}\n\`\`\``;
              window.dispatchEvent(
                new CustomEvent("axiom:send-build-errors", { detail: { message: msg } })
              );
            }}
            style={{
              ...MONO, fontSize: 10, letterSpacing: "0.06em",
              padding: "4px 10px", borderRadius: 5,
              cursor: (!done || !result?.errorSummary || status === "success") ? "not-allowed" : "pointer",
              background: "transparent",
              border: `1px solid ${inFixCycle ? "rgba(201,162,76,0.3)" : "rgba(212,175,55,0.15)"}`,
              color: "var(--atlas-gold)",
              opacity: (!done || !result?.errorSummary || status === "success") ? 0.3 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {inFixCycle ? `send again →` : `send to atlas →`}
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  );
}
