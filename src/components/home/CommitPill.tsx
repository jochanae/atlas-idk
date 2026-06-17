import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useShellStore } from "@/store/shellStore";
import { haptics } from "@/lib/haptics";

/**
 * CommitPill — the "door you walk through" at the end of a shaped thread.
 *
 * State choreography (all driven by shellStore.shapingStatus):
 *   shaping       → "Shaping into structure…" with shimmer; non-interactive
 *   ready         → "Enter Workspace →" glowing gold; tap arms the handoff
 *   transitioning → "Preparing {Title}…" with border-trace; auto-navigates on completion
 *
 * Anchored inline at the commit marker. Persists indefinitely while `ready`
 * (no timeout). Single-tap commits; haptic confirmation, silent.
 *
 * Wiring expectation:
 *   - Caller sets shapingStatus='shaping' when the commit endpoint fires
 *   - Backend responds → caller sets pendingWorkspaceId/Title + status='ready'
 *   - Pill handles the rest (transitioning → navigate → resetHandoff)
 */
export function CommitPill({ className = "" }: { className?: string }) {
  const [, navigate] = useLocation();
  const status = useShellStore((s) => s.shapingStatus);
  const projectId = useShellStore((s) => s.pendingWorkspaceId);
  const title = useShellStore((s) => s.pendingWorkspaceTitle);
  const setShapingStatus = useShellStore((s) => s.setShapingStatus);
  const resetHandoff = useShellStore((s) => s.resetHandoff);
  const setShellMode = useShellStore((s) => s.setShellMode);
  const [traceProgress, setTraceProgress] = useState(0);

  // Drive the border-trace + navigation during 'transitioning'.
  useEffect(() => {
    if (status !== "transitioning" || !projectId) return;
    const start = performance.now();
    const DURATION = 1200; // ms — generous enough to feel cinematic
    let raf = 0;
    const tick = (t: number) => {
      const pct = Math.min(1, (t - start) / DURATION);
      setTraceProgress(pct);
      if (pct < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // Handoff complete — flip shell, navigate, reset.
        setShellMode("operational");
        navigate(`/project/${projectId}?source=commit-handoff`);
        // Defer reset so the workspace mount sees isHandoff=true for one frame,
        // letting the header gate hold. workspace.tsx clears it on first paint.
        setTimeout(() => resetHandoff(), 50);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, projectId, navigate, setShellMode, resetHandoff]);

  if (status === "idle") return null;

  const handleTap = () => {
    if (status !== "ready") return;
    haptics.cardConfirmed();
    setShapingStatus("transitioning");
  };

  const label =
    status === "shaping"
      ? "Shaping into structure…"
      : status === "ready"
        ? "Enter Workspace →"
        : `Preparing ${title ?? "workspace"}…`;

  const isReady = status === "ready";
  const isTransitioning = status === "transitioning";

  return (
    <div className={`flex justify-center w-full my-6 ${className}`}>
      <button
        type="button"
        onClick={handleTap}
        disabled={!isReady}
        aria-label={label}
        className="relative px-6 py-3 rounded-full select-none transition-all duration-300"
        style={{
          background: isReady
            ? "linear-gradient(135deg, rgba(201,162,76,0.16), rgba(201,162,76,0.08))"
            : "rgba(255,255,255,0.03)",
          border: `1px solid ${isReady ? "rgba(201,162,76,0.55)" : "rgba(255,255,255,0.08)"}`,
          boxShadow: isReady
            ? "0 0 24px rgba(201,162,76,0.25), inset 0 0 12px rgba(201,162,76,0.08)"
            : "none",
          color: isReady ? "var(--atlas-gold)" : "var(--atlas-muted)",
          fontFamily: "var(--app-font-mono)",
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: isReady ? "pointer" : "default",
          overflow: "hidden",
        }}
      >
        {/* Ambient breathing glow when ready */}
        {isReady && (
          <span
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              background: "radial-gradient(circle at center, rgba(201,162,76,0.12), transparent 70%)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Shimmer band when shaping */}
        {status === "shaping" && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
              backgroundSize: "200% 100%",
              animation: "commit-pill-shimmer 1.6s linear infinite",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Border trace during transitioning */}
        {isTransitioning && (
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
              style={{ filter: "drop-shadow(0 0 4px rgba(201,162,76,0.6))" }}
            />
          </svg>
        )}

        <span className="relative z-10">{label}</span>
      </button>

      <style>{`
        @keyframes commit-pill-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
