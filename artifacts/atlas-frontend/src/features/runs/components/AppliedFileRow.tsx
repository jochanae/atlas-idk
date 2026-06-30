interface Props {
  path: string;
}

export function AppliedFileRow({ path }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px",
      borderRadius: 6,
      border: "0.5px solid var(--atlas-border)",
      background: "rgba(52,211,153,0.04)",
    }}>
      <span style={{
        fontFamily: "var(--app-font-mono)", fontSize: 9,
        letterSpacing: "0.16em", fontWeight: 700,
        padding: "2px 6px", borderRadius: 3,
        color: "rgba(52,211,153,0.95)",
        background: "rgba(52,211,153,0.10)",
        border: "1px solid rgba(52,211,153,0.30)",
      }}>
        APPLIED
      </span>
      <span style={{
        fontFamily: "var(--app-font-mono)", fontSize: 11,
        color: "var(--atlas-fg)",
      }}>
        {path}
      </span>
    </div>
  );
}
