// QuickEditRow — state-driven wrapper that turns an activity row into a
// tactical execution lane. States: idle → prompt → active → resolved | failed.
// Reuses useCodegen, RunSummaryBlock, DiffViewer. No new edge functions.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Zap, X, ArrowRight, GitBranch, ChevronDown, ChevronRight } from "lucide-react";
import { useCodegen, type CodegenFile } from "@/hooks/useCodegen";
import { RunSummaryBlock, type RunStatus, type RunArtifact } from "@/components/RunSummary";
import { DiffViewer } from "@/components/code/DiffViewer";

type Phase = "idle" | "prompt" | "active" | "resolved" | "failed";

interface Props {
  projectId: number;
  projectName: string;
  /** The original row markup, rendered as the visible header. */
  row: ReactNode;
  /** Forwarded when the user dismisses without acting. */
  onClose?: () => void;
}

export function QuickEditRow({ projectId, projectName, row, onClose }: Props) {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { running, steps, lastFile, run, reset } = useCodegen({
    projectId,
    onResult: () => setPhase("resolved"),
    onError: (msg) => {
      setErrorMessage(msg);
      setPhase("failed");
    },
  });

  const open = phase !== "idle";
  const toggle = useCallback(() => {
    if (open) {
      // Don't kill an in-flight job — just collapse.
      if (phase === "active") {
        // Allow collapse; job continues in background. Re-open restores state.
        setPhase("idle");
      } else {
        setPhase("idle");
        reset();
        setPrompt("");
        setShowDiff(false);
        setErrorMessage(null);
        onClose?.();
      }
    } else {
      setPhase("prompt");
    }
  }, [open, phase, reset, onClose]);

  const submit = useCallback(async () => {
    if (!prompt.trim() || running) return;
    setPhase("active");
    setErrorMessage(null);
    await run(prompt);
  }, [prompt, running, run]);

  const ejectToWorkspace = useCallback(() => {
    const payload = {
      prompt,
      error: errorMessage,
      filename: lastFile?.filename,
    };
    try {
      sessionStorage.setItem(`atlas:quickedit:resume:${projectId}`, JSON.stringify(payload));
    } catch {}
    setLocation(`/workspace?project=${projectId}&resume=quickedit`);
  }, [prompt, errorMessage, lastFile, projectId, setLocation]);

  const artifacts: RunArtifact[] = useMemo(() => {
    if (!lastFile) return [];
    return [{ type: "file", label: lastFile.filename, meta: lastFile.language }];
  }, [lastFile]);

  const status: RunStatus | null =
    phase === "resolved" ? "completed" : phase === "failed" ? "failed" : null;

  return (
    <div
      style={{
        borderRadius: 8,
        background: open ? "rgba(201,162,76,0.03)" : "transparent",
        border: open ? "1px solid rgba(201,162,76,0.12)" : "1px solid transparent",
        transition: "background 180ms ease, border-color 180ms ease",
        overflow: "hidden",
      }}
    >
      {/* Header (existing row, clickable to toggle) */}
      <div
        onClick={toggle}
        style={{ cursor: "pointer", position: "relative" }}
        aria-expanded={open}
      >
        {row}
        {/* Quick-edit affordance: lightning bolt fades in on hover/open */}
        <span
          style={{
            position: "absolute",
            top: 10,
            right: 38,
            opacity: open ? 0.8 : 0,
            transition: "opacity 160ms ease",
            color: "var(--atlas-gold)",
            pointerEvents: "none",
          }}
          aria-hidden
        >
          <Zap size={11} strokeWidth={2.25} />
        </span>
      </div>

      {/* Expanded body */}
      {open && (
        <div
          style={{
            padding: "10px 12px 12px",
            borderTop: "1px dashed rgba(201,162,76,0.12)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Prompt input — visible until a run starts */}
          {(phase === "prompt" || phase === "active") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                autoFocus={phase === "prompt"}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                disabled={running}
                placeholder={`Quick edit on ${projectName} — describe the change`}
                rows={2}
                style={{
                  width: "100%",
                  resize: "none",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 12,
                  lineHeight: 1.5,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--atlas-surface)",
                  border: "1px solid var(--atlas-border)",
                  color: "var(--atlas-fg)",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.55 }}>
                  ⌘↵ to run · esc to close
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={toggle}
                    style={pillBtnStyle("ghost")}
                    aria-label="Cancel quick edit"
                  >
                    <X size={11} strokeWidth={2} /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!prompt.trim() || running}
                    style={pillBtnStyle("primary", !prompt.trim() || running)}
                  >
                    <Zap size={11} strokeWidth={2.25} />
                    {running ? "Running..." : "Run"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Live steps */}
          {(phase === "active" || phase === "resolved" || phase === "failed") && steps.length > 0 && (
            <StepStream steps={steps} running={running} />
          )}

          {/* Resolved: summary + diff toggle */}
          {phase === "resolved" && lastFile && (
            <>
              <RunSummaryBlock
                status={status}
                summary={`Generated ${lastFile.filename}`}
                artifacts={artifacts}
              />
              <button
                type="button"
                onClick={() => setShowDiff((v) => !v)}
                style={{
                  alignSelf: "flex-start",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "var(--atlas-gold)",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {showDiff ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                {showDiff ? "Hide changes" : "Review changes"}
              </button>
              {showDiff && (
                <DiffViewer
                  filename={lastFile.filename}
                  before=""
                  after={lastFile.content}
                  badge="Generated"
                  maxHeight={260}
                />
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={ejectToWorkspace}
                  style={pillBtnStyle("primary")}
                >
                  <GitBranch size={11} strokeWidth={2} /> Accept & Push
                </button>
                <button
                  type="button"
                  onClick={() => { setPhase("prompt"); reset(); setShowDiff(false); }}
                  style={pillBtnStyle("ghost")}
                >
                  Tweak
                </button>
                <button
                  type="button"
                  onClick={ejectToWorkspace}
                  style={pillBtnStyle("ghost")}
                >
                  Open in Workspace <ArrowRight size={11} strokeWidth={2} />
                </button>
              </div>
            </>
          )}

          {/* Failed: red summary + single eject CTA */}
          {phase === "failed" && (
            <>
              <RunSummaryBlock
                status="failed"
                summary={errorMessage ?? "Quick edit failed"}
              />
              <button
                type="button"
                onClick={ejectToWorkspace}
                style={pillBtnStyle("primary")}
              >
                Eject to Workspace <ArrowRight size={11} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StepStream({ steps, running }: { steps: string[]; running: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.015)",
        border: "1px solid var(--atlas-border)",
      }}
    >
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const isError = s.toLowerCase().startsWith("error");
        return (
          <div
            key={`${i}-${s}`}
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 11,
              lineHeight: 1.55,
              color: isError ? "#f87171" : "var(--atlas-fg)",
              opacity: isLast && running ? 1 : 0.7,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: isError
                  ? "#f87171"
                  : isLast && running
                  ? "var(--atlas-gold)"
                  : "rgba(74,222,128,0.7)",
                flexShrink: 0,
                animation: isLast && running ? "atlasCoreBloom 1.4s ease-in-out infinite" : "none",
              }}
            />
            {s}
          </div>
        );
      })}
    </div>
  );
}

function pillBtnStyle(variant: "primary" | "ghost", disabled = false): React.CSSProperties {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "5px 10px",
      borderRadius: 5,
      background: disabled ? "rgba(201,162,76,0.08)" : "rgba(201,162,76,0.16)",
      border: "1px solid rgba(201,162,76,0.35)",
      color: disabled ? "rgba(201,162,76,0.5)" : "var(--atlas-gold)",
      fontFamily: "var(--app-font-mono)",
      fontSize: 10.5,
      letterSpacing: "0.04em",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background 140ms ease",
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 10px",
    borderRadius: 5,
    background: "transparent",
    border: "1px solid var(--atlas-border)",
    color: "var(--atlas-muted)",
    fontFamily: "var(--app-font-mono)",
    fontSize: 10.5,
    letterSpacing: "0.04em",
    cursor: "pointer",
    transition: "color 140ms ease, border-color 140ms ease",
  };
}
