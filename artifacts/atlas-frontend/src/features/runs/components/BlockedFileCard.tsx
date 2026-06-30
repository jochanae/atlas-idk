import type { RunFile } from "../types";

interface Props {
  file: RunFile;
  onRetry?: () => void;
  retryDisabled?: boolean;
  retryTitle?: string;
}

export function BlockedFileCard({ file, onRetry, retryDisabled, retryTitle }: Props) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: "12px 14px",
      borderRadius: 8,
      border: "0.5px solid rgba(248,113,113,0.30)",
      background: "rgba(248,113,113,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9,
          letterSpacing: "0.16em", fontWeight: 700,
          padding: "2px 6px", borderRadius: 3,
          color: "rgba(248,113,113,0.95)",
          background: "rgba(248,113,113,0.12)",
          border: "1px solid rgba(248,113,113,0.35)",
        }}>
          BLOCKED
        </span>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 11,
          color: "var(--atlas-fg)", flex: 1,
        }}>
          {file.path}
        </span>
        {file.reason && (
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            color: "var(--atlas-muted, rgba(255,255,255,0.45))",
          }}>
            {file.reason}
          </span>
        )}
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled || !onRetry}
          title={retryTitle}
          style={{
            padding: "5px 10px", borderRadius: 4,
            background: "transparent",
            border: "0.5px solid var(--atlas-border)",
            color: retryDisabled || !onRetry ? "var(--atlas-muted, rgba(255,255,255,0.35))" : "var(--atlas-fg)",
            fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.08em",
            cursor: retryDisabled || !onRetry ? "not-allowed" : "pointer",
          }}
        >
          ↻ Retry file
        </button>
      </div>
      {file.errors && file.errors.length > 0 && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 2,
          padding: "8px 10px",
          borderRadius: 5,
          background: "rgba(0,0,0,0.25)",
        }}>
          {file.errors.map((e, i) => (
            <div key={i} style={{
              fontFamily: "var(--app-font-mono)", fontSize: 10.5,
              color: "rgba(248,113,113,0.85)",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}>
              <span style={{ color: "var(--atlas-muted, rgba(255,255,255,0.45))" }}>
                {e.line}:{e.col}
              </span>
              {"  "}error{"  "}{e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
