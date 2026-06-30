import type { RunApplyError } from "../types";

interface Props {
  error: RunApplyError;
  onRetry?: () => void;
  retryDisabled?: boolean;
  retryTitle?: string;
}

export function ApplyErrorCard({ error, onRetry, retryDisabled, retryTitle }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      borderRadius: 8,
      border: "0.5px solid rgba(248,113,113,0.35)",
      background: "rgba(248,113,113,0.06)",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9,
          letterSpacing: "0.18em", color: "rgba(248,113,113,0.85)", fontWeight: 700,
        }}>
          APPLY ERROR
        </div>
        <div style={{
          fontFamily: "var(--app-font-mono)", fontSize: 11,
          color: "var(--atlas-fg)", letterSpacing: "0.02em",
        }}>
          {error.code ? `(${error.code}) ` : ""}{error.message}
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled || !onRetry}
        title={retryTitle}
        style={{
          padding: "6px 12px", borderRadius: 5,
          background: "transparent",
          border: "0.5px solid var(--atlas-border)",
          color: retryDisabled || !onRetry ? "var(--atlas-muted, rgba(255,255,255,0.35))" : "var(--atlas-fg)",
          fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.08em",
          cursor: retryDisabled || !onRetry ? "not-allowed" : "pointer",
        }}
      >
        ↻ Retry apply
      </button>
    </div>
  );
}
