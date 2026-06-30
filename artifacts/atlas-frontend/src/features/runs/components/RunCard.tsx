// Compact in-chat / in-dock Run pill. Links to /runs/:id.
// Intentionally additive — does not replace existing builder output.

import { useLocation } from "wouter";
import { useRun } from "../useRun";
import { statusColors } from "../statusStyle";

interface Props {
  runId: string;
}

export function RunCard({ runId }: Props) {
  const [, setLocation] = useLocation();
  const run = useRun(runId);
  if (!run) return null;

  const c = statusColors(run.status);
  const shortId = runId.slice(0, 6);

  return (
    <button
      type="button"
      onClick={() => setLocation(`/runs/${runId}`)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.025)",
        border: "0.5px solid var(--atlas-border)",
        color: "var(--atlas-fg)",
        cursor: "pointer",
        fontFamily: "var(--app-font-mono)",
        fontSize: 10,
        letterSpacing: "0.06em",
        textAlign: "left",
      }}
      aria-label={`Open Run ${shortId}`}
    >
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: c.fg, flexShrink: 0,
      }} />
      <span style={{ color: "var(--atlas-muted, rgba(255,255,255,0.55))" }}>
        RUN #{shortId}
      </span>
      <span style={{ color: c.fg, fontWeight: 600 }}>{c.label}</span>
      <span style={{ color: "var(--atlas-muted, rgba(255,255,255,0.45))" }}>
        · {run.counts.blocked} blocked · {run.counts.applied} applied
      </span>
      <span style={{ color: "var(--atlas-gold)", marginLeft: 4 }}>View →</span>
    </button>
  );
}
