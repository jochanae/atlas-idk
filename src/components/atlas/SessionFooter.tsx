type Props = {
  artifactCount: number;
  ledgerCount: number;
};

/**
 * Quiet success-state counter. A session is "successful" when it has produced
 * at least one structured artifact or one committed ledger entry.
 */
export function SessionFooter({ artifactCount, ledgerCount }: Props) {
  if (artifactCount === 0 && ledgerCount === 0) return null;

  const hasOutput = artifactCount > 0 || ledgerCount > 0;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "4px 16px 6px",
        gap: 12,
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "color-mix(in oklab, var(--muted-text) 80%, transparent)",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {artifactCount > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            aria-hidden
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--phosphor)",
              boxShadow: "0 0 5px var(--phosphor)",
            }}
          />
          {artifactCount} {artifactCount === 1 ? "artifact" : "artifacts"}
        </span>
      )}
      {artifactCount > 0 && ledgerCount > 0 && (
        <span style={{ opacity: 0.4 }}>·</span>
      )}
      {ledgerCount > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            aria-hidden
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--accent-gold)",
              boxShadow: "0 0 5px var(--accent-gold)",
            }}
          />
          {ledgerCount} {ledgerCount === 1 ? "ledger entry" : "ledger entries"}
        </span>
      )}
      {hasOutput && (
        <span style={{ opacity: 0.4, marginLeft: 4 }}>· session producing</span>
      )}
    </div>
  );
}
