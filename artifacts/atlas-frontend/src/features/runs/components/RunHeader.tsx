import type { Run } from "../types";
import { statusColors } from "../statusStyle";

interface Props {
  run: Run;
  onViewDiff?: () => void;
}

export function RunHeader({ run, onViewDiff }: Props) {
  const c = statusColors(run.status);
  const shortId = run.id.slice(0, 6);

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: "16px 18px",
      border: "0.5px solid var(--atlas-border)",
      borderRadius: 10,
      background: "rgba(255,255,255,0.015)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9,
          letterSpacing: "0.18em", color: "var(--atlas-muted, rgba(255,255,255,0.45))",
        }}>
          RUN #{shortId}
        </span>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9,
          letterSpacing: "0.16em", fontWeight: 700,
          padding: "3px 8px", borderRadius: 4,
          color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
        }}>
          {c.label}
        </span>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 10,
          color: "var(--atlas-muted, rgba(255,255,255,0.5))",
        }}>
          {run.counts.blocked} blocked · {run.counts.applied} applied
        </span>
        <div style={{ flex: 1 }} />
        {onViewDiff && (
          <button
            type="button"
            onClick={onViewDiff}
            style={{
              padding: "5px 12px", borderRadius: 5,
              background: "transparent",
              border: "0.5px solid var(--atlas-border)",
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            View diff
          </button>
        )}
      </div>
      <div style={{
        fontSize: 15, fontWeight: 400, color: "var(--atlas-fg)",
        letterSpacing: "0.01em", lineHeight: 1.4,
      }}>
        {run.intent}
      </div>
      {run.projectName && (
        <div style={{
          fontFamily: "var(--app-font-mono)", fontSize: 10,
          color: "var(--atlas-muted, rgba(255,255,255,0.45))",
          letterSpacing: "0.06em",
        }}>
          {run.projectName} · {new Date(run.createdAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
