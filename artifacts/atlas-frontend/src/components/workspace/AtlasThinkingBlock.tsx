import { useMemo, useState, type CSSProperties } from "react";

export type ThinkingStep = {
  id: string;
  phase: "scan" | "analyze" | "protect" | "render";
  label: string;
  durationMs?: number;
};

export type DeveloperLens = {
  routing: { activeModel: string; provider: string; fallbackTriggered: boolean };
  telemetry: { tokensPerSecond: number; inputTokens: number; executionStrategy: string };
};

export type ThinkingState = {
  status: "processing" | "streaming" | "completed";
  currentStep: ThinkingStep | null;
  history: ThinkingStep[];
  developerLens?: DeveloperLens;
};

interface Props {
  thinkingState: ThinkingState;
}

const monoFont = "var(--app-font-mono)";

function DeveloperLensRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, lineHeight: 1.55 }}>
      <span style={{ opacity: 0.45 }}>{label}</span>
      <span style={{ color: "rgba(255,255,255,0.72)", textAlign: "right" }}>{String(value)}</span>
    </div>
  );
}

// Routine phases that don't need to be surfaced as named steps.
const ROUTINE_PHASES = new Set(["scan", "analyze"]);

function isRoutineStep(step: ThinkingStep): boolean {
  return ROUTINE_PHASES.has(step.phase);
}

export function AtlasThinkingBlock({ thinkingState }: Props) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { status, currentStep, history, developerLens } = thinkingState;
  const isProcessing = status === "processing";

  const collapsedLabels = useMemo(() => {
    // Only show the model name — never replay step labels as frozen static text.
    // Step history shown in the drawer via "tap to inspect", not inline.
    const model = developerLens?.routing?.activeModel;
    return model ? `✓ ${model}` : "";
  }, [developerLens]);

  // During processing, show the current step label only if it's meaningful.
  // Routine scan/analyze phases collapse to a generic quiet label.
  const processingLabel = useMemo(() => {
    if (!currentStep) return "Working...";
    if (isRoutineStep(currentStep)) return "Working...";
    return currentStep.label;
  }, [currentStep]);

  const containerStyle: CSSProperties = {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 10,
    padding: isProcessing ? "6px 0" : "4px 14px",
    maxHeight: isProcessing ? 40 : 18,
    overflow: "hidden",
    transition:
      "max-height 300ms cubic-bezier(0.25,1,0.5,1), padding 300ms cubic-bezier(0.25,1,0.5,1), opacity 300ms cubic-bezier(0.25,1,0.5,1)",
    opacity: 1,
  };

  const drawerStyle: CSSProperties = {
    background: "rgba(212,175,55,0.04)",
    border: "1px solid rgba(212,175,55,0.1)",
    borderRadius: 8,
    padding: isDrawerOpen ? 10 : "0 10px",
    fontFamily: monoFont,
    fontSize: 11,
    color: "rgba(255,255,255,0.78)",
    maxHeight: isDrawerOpen ? 160 : 0,
    opacity: isDrawerOpen ? 1 : 0,
    overflow: "hidden",
    transform: isDrawerOpen ? "translateY(0)" : "translateY(-4px)",
    transition: "max-height 250ms ease, opacity 250ms ease, transform 250ms ease, padding 250ms ease",
    willChange: "transform, opacity, max-height",
  };

  return (
    <div>
      <style>{`
        @keyframes atlasPulse {
          0%,100%{opacity:0.38}
          50%{opacity:0.72}
        }
        .atlas-thinking-quiet {
          font-family: var(--app-font-mono);
          font-size: 11px;
          color: var(--atlas-muted);
          animation: atlasPulse 2.4s ease-in-out infinite;
          letter-spacing: 0.02em;
        }
      `}</style>

      <div style={containerStyle}>
        {isProcessing ? (
          <span className="atlas-thinking-quiet">{processingLabel}</span>
        ) : (
          <div
            style={{
              opacity: 0.35,
              fontFamily: monoFont,
              fontSize: 10,
              color: "rgba(255,255,255,0.76)",
              lineHeight: "10px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {collapsedLabels}
          </div>
        )}
      </div>

      {false && !isProcessing && (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            onClick={() => setIsDrawerOpen((open) => !open)}
            aria-expanded={isDrawerOpen}
            style={{
              appearance: "none",
              background: "transparent",
              border: "none",
              padding: 0,
              color: "rgba(255,255,255,0.78)",
              fontFamily: monoFont,
              fontSize: 10,
              opacity: 0.4,
              cursor: "pointer",
              lineHeight: 1.4,
              transition: "opacity 180ms ease, transform 180ms ease",
              transform: isDrawerOpen ? "translateX(2px)" : "translateX(0)",
            }}
          >
            ↳ atlas · tap to inspect
          </button>

          <div style={{ ...drawerStyle, marginTop: isDrawerOpen ? 8 : 0 }}>
            <DeveloperLensRow label="model" value={developerLens?.routing.activeModel ?? "unavailable"} />
            <DeveloperLensRow label="provider" value={developerLens?.routing.provider ?? "unavailable"} />
            <DeveloperLensRow label="fallback" value={developerLens?.routing.fallbackTriggered ?? "unavailable"} />
            <DeveloperLensRow label="tokens/sec" value={developerLens?.telemetry.tokensPerSecond ?? "unavailable"} />
            <DeveloperLensRow label="input tokens" value={developerLens?.telemetry.inputTokens ?? "unavailable"} />
            <DeveloperLensRow label="strategy" value={developerLens?.telemetry.executionStrategy ?? "unavailable"} />
          </div>
        </div>
      )}
    </div>
  );
}
