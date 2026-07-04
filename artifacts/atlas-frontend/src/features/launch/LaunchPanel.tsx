/**
 * LaunchPanel — Phase 3 launch experience overlay.
 *
 * Listens for `axiom:launch-project` (CustomEvent<LaunchSpec>).
 * Resolves the right adapter, runs it, and shows progress.
 *
 * The experience reads as "Atlas is launching" — not "you opened a tab."
 * Auto-dismisses 8s after reaching running state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { type LaunchResult, type LaunchSpec, resolveAdapter } from "@/lib/launchAdapters";

type Phase = "idle" | "checking" | "starting" | "running" | "failed" | "no-scaffold";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  checking: "Checking project…",
  starting: "Atlas is launching your project…",
  running: "Running",
  failed: "Launch failed",
  "no-scaffold": "No code yet",
};

export function LaunchPanel() {
  const [spec, setSpec] = useState<LaunchSpec | null>(null);
  const [result, setResult] = useState<LaunchResult>({ status: "idle" });
  const [visible, setVisible] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, navigate] = useLocation();

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    abortRef.current?.();
    abortRef.current = null;
    setVisible(false);
    setSpec(null);
    setResult({ status: "idle" });
  }, []);

  // Listen for launch events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<LaunchSpec>).detail;
      if (!detail?.projectId || !detail?.adapter) return;

      // Clean up any prior launch
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      abortRef.current?.();

      setSpec(detail);
      setResult({ status: "checking" });
      setVisible(true);

      const adapter = resolveAdapter(detail);
      if (!adapter) {
        setResult({ status: "failed", errorMsg: `Unknown adapter: ${detail.adapter}` });
        return;
      }

      const abort = adapter.launch(detail, (r) => {
        setResult(r);
        if (r.status === "running") {
          // Auto-dismiss 8s after reaching running state
          dismissTimer.current = setTimeout(dismiss, 8000);
        }
        if (r.status === "no-scaffold" || r.status === "failed") {
          // Auto-dismiss errors after 6s
          dismissTimer.current = setTimeout(dismiss, 6000);
        }
      });
      abortRef.current = abort;
    };

    window.addEventListener("axiom:launch-project", handler as EventListener);
    return () => window.removeEventListener("axiom:launch-project", handler as EventListener);
  }, [dismiss]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    abortRef.current?.();
  }, []);

  if (!visible || !spec) return null;

  const phase = result.status as Phase;
  const isActive = phase === "checking" || phase === "starting";
  const isRunning = phase === "running";
  const isFailed = phase === "failed";
  const isNoScaffold = phase === "no-scaffold";

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 88,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderRadius: 40,
          background: isRunning
            ? "color-mix(in oklab, var(--atlas-gold) 10%, #0a0a0a)"
            : isFailed
              ? "rgba(220,70,70,0.12)"
              : "rgba(14,14,14,0.94)",
          border: `1px solid ${
            isRunning
              ? "color-mix(in oklab, var(--atlas-gold) 40%, transparent)"
              : isFailed
                ? "rgba(220,70,70,0.4)"
                : "rgba(255,255,255,0.09)"
          }`,
          boxShadow: isRunning
            ? "0 0 24px color-mix(in oklab, var(--atlas-gold) 20%, transparent)"
            : "0 4px 24px rgba(0,0,0,0.5)",
          backdropFilter: "blur(16px)",
          pointerEvents: "auto",
          maxWidth: 360,
        }}
      >
        {/* Status indicator */}
        {isActive && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--atlas-gold)",
              flexShrink: 0,
              animation: "launch-pulse 1.4s ease-in-out infinite",
            }}
          />
        )}
        {isRunning && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#4caf7d",
              flexShrink: 0,
              boxShadow: "0 0 6px #4caf7d",
            }}
          />
        )}
        {(isFailed || isNoScaffold) && (
          <span style={{ fontSize: 12, flexShrink: 0 }}>
            {isFailed ? "✕" : "○"}
          </span>
        )}

        {/* Label */}
        <span
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: 11,
            letterSpacing: "0.07em",
            color: isRunning
              ? "var(--atlas-gold)"
              : isFailed
                ? "rgba(220,70,70,0.9)"
                : "rgba(255,255,255,0.75)",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {isNoScaffold
            ? "No code yet — start building in the workspace"
            : isFailed
              ? result.errorMsg ?? "Launch failed"
              : PHASE_LABEL[phase]}
        </span>

        {/* Open Preview CTA when running */}
        {isRunning && result.previewUrl && (
          <button
            type="button"
            onClick={() => {
              navigate(`/project/${spec.projectId}?tab=preview`);
              dismiss();
            }}
            style={{
              marginLeft: 4,
              padding: "4px 10px",
              borderRadius: 999,
              background: "color-mix(in oklab, var(--atlas-gold) 18%, transparent)",
              border: "1px solid color-mix(in oklab, var(--atlas-gold) 50%, transparent)",
              color: "var(--atlas-gold)",
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Open Preview →
          </button>
        )}

        {/* Dismiss */}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          style={{
            marginLeft: 4,
            background: "none",
            border: "none",
            padding: "2px 4px",
            cursor: "pointer",
            color: "rgba(255,255,255,0.3)",
            fontSize: 14,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <style>{`
        @keyframes launch-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>
    </div>,
    document.body
  );
}
