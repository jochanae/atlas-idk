import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useShellStore } from "@/store/shellStore";
import { haptics } from "@/lib/haptics";

/**
 * CommitPill — the "door you walk through" at the end of a shaped thread.
 *
 * Modes:
 *   1. INLINE  — props with projectId/projectTitle; legacy anchored card.
 *   2. STORE   — driven by shellStore.shapingStatus; floats over the dock.
 *
 * State choreography:
 *   shaping       → "Shaping into structure…" shimmer, non-interactive
 *   ready         → "Enter Workspace →" glowing gold, tappable
 *   transitioning → border-trace plays AS onArm runs in parallel
 *   error         → "Handoff failed — Retry" (local recovery)
 *
 * Pass 3 (Cinematic): onArm fires at tap (not after trace), trace runs as a
 * visual cover, and the HandoffCinemaOverlay sits behind the pill dimming the
 * page. If onArm rejects, the pill enters error/retry state instead of
 * silently navigating.
 */

type Status = "shaping" | "ready" | "packaging" | "opening" | "transitioning" | "error";

interface InlineProps {
  projectId: number;
  projectTitle: string;
  onArm?: () => Promise<void> | void;
  initialStatus?: Exclude<Status, "error">;
  className?: string;
}

interface StoreProps {
  onArm?: () => Promise<void> | void;
  overrideLabel?: string;
  className?: string;
}

export function CommitPill(props: InlineProps | StoreProps = {}) {
  const inline = "projectId" in props && typeof (props as InlineProps).projectId === "number";
  return inline ? (
    <InlineCommitPill {...(props as InlineProps)} />
  ) : (
    <StoreCommitPill {...(props as StoreProps)} />
  );
}

/* ---------------- inline mode ---------------- */

function InlineCommitPill({
  projectId,
  projectTitle,
  onArm,
  initialStatus = "ready",
  className = "",
}: InlineProps) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [traceProgress, setTraceProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "transitioning") return;
    const start = performance.now();
    const DURATION = 1400;
    let raf = 0;
    const tick = (t: number) => {
      const pct = Math.min(1, (t - start) / DURATION);
      setTraceProgress(pct);
      if (pct < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const handleTap = async () => {
    if (status === "transitioning") return;
    haptics.cardConfirmed();
    setErrorMsg(null);
    setStatus("transitioning");
    try {
      if (onArm) await onArm();
      else navigate(`/project/${projectId}`);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Handoff failed");
    }
  };

  return (
    <PillVisual
      status={status}
      title={projectTitle}
      traceProgress={traceProgress}
      errorMsg={errorMsg}
      onTap={handleTap}
      className={className}
    />
  );
}

/* ---------------- store mode ---------------- */

function StoreCommitPill({ className = "", onArm, overrideLabel }: { className?: string; onArm?: () => Promise<void> | void; overrideLabel?: string }) {
  const [, navigate] = useLocation();
  const status = useShellStore((s) => s.shapingStatus);
  const projectId = useShellStore((s) => s.pendingWorkspaceId);
  const title = useShellStore((s) => s.pendingWorkspaceTitle);
  const setShapingStatus = useShellStore((s) => s.setShapingStatus);
  const resetHandoff = useShellStore((s) => s.resetHandoff);
  const setShellMode = useShellStore((s) => s.setShellMode);

  const [traceProgress, setTraceProgress] = useState(0);
  const [localStatus, setLocalStatus] = useState<"none" | "error">("none");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const armedRef = useRef(false);

  // Reset local error when store resets back to ready/idle/shaping.
  useEffect(() => {
    if (status === "ready" || status === "idle" || status === "shaping") {
      setLocalStatus("none");
      setErrorMsg(null);
      armedRef.current = false;
    }
  }, [status]);

  // Ephemeral: auto-collapse after 20s in "ready" state with no interaction.
  // If the user ignores the pill and keeps talking, Atlas reads that as "still exploring".
  useEffect(() => {
    if (status !== "ready") return;
    const timer = setTimeout(() => setShapingStatus("idle"), 20_000);
    return () => clearTimeout(timer);
  }, [status, setShapingStatus]);

  // Trace animation runs during packaging/opening/transitioning as visual cover.
  useEffect(() => {
    const active = status === "packaging" || status === "opening" || status === "transitioning";
    if (!active) {
      setTraceProgress(0);
      return;
    }
    const start = performance.now();
    const DURATION = 1400;
    let raf = 0;
    const tick = (t: number) => {
      const pct = Math.min(1, (t - start) / DURATION);
      setTraceProgress(pct);
      if (pct < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  // Kick off onArm exactly once when the user commits (packaging state).
  useEffect(() => {
    if ((status !== "packaging" && status !== "transitioning") || armedRef.current) return;
    armedRef.current = true;
    const run = async () => {
      try {
        if (onArm) {
          await onArm();
          setTimeout(() => resetHandoff(), 80);
        } else if (projectId) {
          setShellMode("operational");
          // Phase 3: fire the Replit adapter so the project launches in parallel
          // with workspace navigation. LaunchPanel handles hasScaffold gracefully.
          window.dispatchEvent(
            new CustomEvent("axiom:launch-project", {
              detail: { projectId, adapter: "replit-devserver" },
            })
          );
          navigate(`/project/${projectId}?source=commit-handoff`);
          setTimeout(() => resetHandoff(), 80);
        }
      } catch (err) {
        setLocalStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Handoff failed");
        setShapingStatus("ready");
      }
    };
    void run();
  }, [status, onArm, projectId, navigate, setShellMode, setShapingStatus, resetHandoff]);

  if (status === "idle") return null;

  const effectiveStatus: Status = localStatus === "error" ? "error" : (status as Status);

  return (
    <PillVisual
      status={effectiveStatus}
      title={title ?? "workspace"}
      traceProgress={traceProgress}
      errorMsg={errorMsg}
      overrideLabel={overrideLabel}
      onTap={() => {
        if (effectiveStatus === "error") {
          setLocalStatus("none");
          setErrorMsg(null);
          armedRef.current = false;
          haptics.tap();
          setShapingStatus("packaging");
          return;
        }
        if (status !== "ready") return;
        haptics.cardConfirmed();
        setShapingStatus("packaging");
      }}
      className={className}
    />
  );
}

/* ---------------- shared visual ---------------- */

function PillVisual({
  status,
  title,
  traceProgress,
  errorMsg,
  onTap,
  className,
  overrideLabel,
}: {
  status: Status;
  title: string;
  traceProgress: number;
  errorMsg: string | null;
  onTap: () => void;
  className: string;
  overrideLabel?: string;
}) {
  const label =
    status === "shaping"
      ? "Shaping\u2026"
      : status === "ready"
        ? (overrideLabel ?? "Enter Workspace \u2192")
        : status === "packaging"
          ? "Packaging\u2026"
          : status === "opening" || status === "transitioning"
            ? "Opening Workspace\u2026"
            : status === "error"
              ? "Handoff failed \u2014 Retry"
              : "Enter Workspace \u2192";

  const GENERIC_TITLES = new Set(["workspace", "New Project", "New Idea", "My Project", "Untitled", ""]);
  const showTitle = status === "ready" && !overrideLabel && title && !GENERIC_TITLES.has(title.trim());

  const isShaping = status === "shaping";
  const isReady = status === "ready";
  const isPackaging = status === "packaging";
  const isOpening = status === "opening" || status === "transitioning";
  const isError = status === "error";
  const interactive = isReady || isError;

  const accent = isError ? "rgba(220,90,80,0.85)" : "var(--atlas-gold)";
  const accentSoft = isError ? "rgba(220,90,80,0.16)" : "rgba(201,162,76,0.16)";
  const accentBorder = isError ? "rgba(220,90,80,0.55)" : "rgba(201,162,76,0.55)";

  return (
    <div className={`flex flex-col items-center w-full my-6 ${className}`}>
      <button
        type="button"
        onClick={onTap}
        disabled={!interactive}
        aria-label={label}
        title={isError && errorMsg ? errorMsg : undefined}
        className="relative px-6 py-3 rounded-full select-none transition-all duration-300"
        style={{
          background: interactive
            ? `linear-gradient(135deg, ${accentSoft}, ${accentSoft.replace("0.16", "0.08")})`
            : isPackaging || isOpening
              ? "rgba(201,162,76,0.06)"
              : "rgba(255,255,255,0.03)",
          border: `1px solid ${interactive ? accentBorder : isPackaging || isOpening ? "rgba(201,162,76,0.3)" : "rgba(255,255,255,0.08)"}`,
          boxShadow: isReady
            ? "0 0 24px rgba(201,162,76,0.25), inset 0 0 12px rgba(201,162,76,0.08)"
            : isError
              ? "0 0 18px rgba(220,90,80,0.25)"
              : "none",
          color: interactive ? accent : isPackaging || isOpening ? "rgba(201,162,76,0.6)" : "var(--atlas-muted)",
          fontFamily: "var(--app-font-mono)",
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: interactive ? "pointer" : "default",
          overflow: "hidden",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {isReady && (
          <span
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              background: "radial-gradient(circle at center, rgba(201,162,76,0.12), transparent 70%)",
              pointerEvents: "none",
            }}
          />
        )}

        {(isShaping || isPackaging) && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: isPackaging
                ? "linear-gradient(90deg, transparent, rgba(201,162,76,0.1), transparent)"
                : "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
              backgroundSize: "200% 100%",
              animation: "commit-pill-shimmer 1.6s linear infinite",
              pointerEvents: "none",
            }}
          />
        )}

        {isOpening && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <rect
              x="0.5"
              y="0.5"
              width="99"
              height="99"
              rx="49"
              ry="49"
              fill="none"
              stroke="var(--atlas-gold)"
              strokeWidth="1.5"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - traceProgress}
              style={{ filter: "drop-shadow(0 0 6px rgba(201,162,76,0.7))" }}
            />
          </svg>
        )}

        <span className="relative z-10 flex flex-col items-center gap-0.5">
          <span>{label}</span>
          {showTitle && (
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                opacity: 0.65,
                textTransform: "none",
                fontFamily: "var(--app-font-sans, sans-serif)",
                fontWeight: 400,
              }}
            >
              {title}
            </span>
          )}
        </span>
      </button>

      {isError && errorMsg && (
        <div
          style={{
            marginTop: 8,
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            color: "rgba(220,90,80,0.75)",
            letterSpacing: "0.05em",
            maxWidth: 280,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {errorMsg}
        </div>
      )}

      <style>{`
        @keyframes commit-pill-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
