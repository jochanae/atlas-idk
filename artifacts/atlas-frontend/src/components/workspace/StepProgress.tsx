// StepProgress — unified step indicator for chat streaming.
//
// mode="single"  Ask Joy: pulsing dot + current step text.
//                Shown when streaming but no assistant content has appeared yet.
// mode="stream"  Workspace: orbital animation + narrated or ambient step text.
//                Driven by the activityStream content string.

import { useEffect, useState } from "react";

// ── Shared type ───────────────────────────────────────────────────────────────

export type LiveStep = {
  verb: string;
  target?: string | null;
  status?: "ok" | "warn" | "fail" | string;
} | null;

// ── Single mode ───────────────────────────────────────────────────────────────

function SingleStep({
  isStreaming,
  hasContent,
  liveStep,
  pendingPhrase = "",
}: {
  isStreaming: boolean;
  hasContent: boolean;
  liveStep?: LiveStep;
  pendingPhrase?: string;
}) {
  if (!isStreaming || hasContent) return null;
  const text = liveStep
    ? `${liveStep.verb}${liveStep.target ? " " + liveStep.target : ""}`
    : pendingPhrase;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.75 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--atlas-gold)",
          animation: "atlas-pulse 1.4s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      {text && (
        <span
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--atlas-muted)",
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

// ── Stream mode ───────────────────────────────────────────────────────────────

function resolveActivityStatus(content: string): string {
  const narration = content.match(/^NARRATION:(.+)/)?.[1]?.trim();
  if (narration) return narration;
  const planStep = content.match(/PLAN_STEP:\s*(.+)/i)?.[1]?.trim();
  if (planStep) return planStep;
  if (/LINE_PATCH/i.test(content)) return "Patching code...";
  if (/FILE_EDIT/i.test(content)) return "Preparing changes...";
  if (/FILE_READ/i.test(content)) return "Reading files...";
  if (/\b(git|push)\b/i.test(content)) return "Pushing to GitHub...";
  return "";
}

const AMBIENT_STEPS = [
  "Joy is thinking",
  "Mapping architecture",
  "Aligning multi-agent nodes",
  "Synthesizing workspace blueprint",
  "Tracing decision lineage",
  "Calibrating context gravity",
];

function StreamStep({ content }: { content: string; lens?: string }) {
  const resolved = resolveActivityStatus(content);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (resolved) return;
    const t = setInterval(() => setStepIdx((i) => (i + 1) % AMBIENT_STEPS.length), 2600);
    return () => clearInterval(t);
  }, [resolved]);

  const displayed = resolved || `${AMBIENT_STEPS[stepIdx]}...`;

  return (
    <div
      className="atlas-planetary-thinking"
      style={{
        margin: "2px 0 18px",
        pointerEvents: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        position: "relative",
      }}
    >
      <style>{`
        @keyframes atlasPlanetaryPulse {
          0%, 100% { opacity: 0.55; text-shadow: 0 0 8px rgba(212,175,55,0.18); }
          50%       { opacity: 0.95; text-shadow: 0 0 14px rgba(212,175,55,0.55); }
        }
        @keyframes atlasOrbitSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes atlasCoreBloom {
          0%, 100% { box-shadow: 0 0 4px rgba(212,175,55,0.5), 0 0 10px rgba(212,175,55,0.25); }
          50%       { box-shadow: 0 0 8px rgba(212,175,55,0.9), 0 0 18px rgba(212,175,55,0.45); }
        }
        @keyframes atlasTextFade {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .atlas-orbit-system {
          position: relative; width: 16px; height: 16px; flex-shrink: 0;
        }
        .atlas-orbit-core {
          position: absolute; top: 50%; left: 50%;
          width: 4px; height: 4px; margin: -2px 0 0 -2px;
          border-radius: 50%;
          background: var(--atlas-gold, #C9A24C);
          animation: atlasCoreBloom 3s ease-in-out infinite;
        }
        .atlas-orbit-ring {
          position: absolute; inset: 0; border-radius: 50%;
          border: 1px solid rgba(212,175,55,0.12);
          animation: atlasOrbitSpin 4.5s linear infinite;
        }
        .atlas-orbit-ring::before {
          content: ''; position: absolute;
          top: -1.5px; left: 50%;
          width: 2.5px; height: 2.5px; margin-left: -1.25px;
          border-radius: 50%;
          background: var(--atlas-gold, #C9A24C);
          box-shadow: 0 0 6px rgba(212,175,55,0.7);
        }
        .atlas-orbit-ring--inner {
          inset: 4px; border-color: rgba(212,175,55,0.08);
          animation-duration: 2.8s; animation-direction: reverse;
        }
        .atlas-orbit-ring--inner::before {
          width: 2px; height: 2px; margin-left: -1px; top: -1px;
          background: rgba(212,175,55,0.85);
        }
        .atlas-planetary-text {
          font-family: var(--app-font-mono); font-size: 11px;
          letter-spacing: 0.04em; color: rgba(255,255,255,0.78);
          animation: atlasPlanetaryPulse 3s ease-in-out infinite;
        }
        .atlas-planetary-text > span {
          display: inline-block;
          animation: atlasTextFade 380ms ease-out;
        }
      `}</style>

      <span className="atlas-orbit-system" aria-hidden>
        <span className="atlas-orbit-ring" />
        <span className="atlas-orbit-ring atlas-orbit-ring--inner" />
        <span className="atlas-orbit-core" />
      </span>

      <span className="atlas-planetary-text">
        <span key={displayed}>{displayed}</span>
      </span>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

type SingleProps = {
  mode: "single";
  isStreaming: boolean;
  hasContent: boolean;
  liveStep?: LiveStep;
  pendingPhrase?: string;
};

type StreamProps = {
  mode: "stream";
  content: string;
  lens?: string;
};

export type StepProgressProps = SingleProps | StreamProps;

export function StepProgress(props: StepProgressProps) {
  if (props.mode === "single") {
    return (
      <SingleStep
        isStreaming={props.isStreaming}
        hasContent={props.hasContent}
        liveStep={props.liveStep}
        pendingPhrase={props.pendingPhrase}
      />
    );
  }
  return <StreamStep content={props.content} lens={props.lens} />;
}
