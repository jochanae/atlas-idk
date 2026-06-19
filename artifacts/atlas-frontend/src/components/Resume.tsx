type RecentProject = {
  id: number;
  name: string;
  updatedAt: string;
};

type Props = {
  briefing?: string | null;
  briefingLoading?: boolean;
  recentProjects?: RecentProject[];
  onOpenProject?: (id: number) => void;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Resume({ briefing, briefingLoading, recentProjects = [], onOpenProject }: Props) {
  const hasBriefing = briefingLoading || !!briefing;
  const hasProjects = recentProjects.length > 0;

  if (!hasBriefing && !hasProjects) return null;

  return (
    <div className="atlas-discovery-card" style={{ padding: "16px 16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <h3 style={{
          margin: 0, fontSize: 9.5, fontWeight: 600,
          fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)",
          letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7,
        }}>
          Resume
        </h3>
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)",
          opacity: 0.35, letterSpacing: "0.04em",
        }}>
          Where things stand
        </span>
      </div>

      {briefingLoading && (
        <div style={{
          fontSize: 11, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)",
          opacity: 0.5, letterSpacing: "0.04em",
          marginBottom: hasProjects ? 14 : 0,
        }}>
          Atlas is reading the ledger…
        </div>
      )}

      {!briefingLoading && briefing && (
        <p style={{
          margin: 0,
          marginBottom: hasProjects ? 14 : 0,
          fontSize: "var(--ts-body)", color: "var(--atlas-fg)",
          lineHeight: 1.6, fontFamily: "var(--app-font-sans)",
          opacity: 0.88, whiteSpace: "pre-wrap",
        }}>
          {briefing}
        </p>
      )}

      {hasProjects && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {recentProjects.slice(0, 4).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenProject?.(p.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "6px 8px", borderRadius: 7,
                background: "transparent", border: "none",
                cursor: onOpenProject ? "pointer" : "default",
                textAlign: "left", transition: "background 140ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{
                fontSize: 12, color: "var(--atlas-fg)", opacity: 0.8,
                fontFamily: "var(--app-font-sans)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
              }}>
                {p.name}
              </span>
              <span style={{
                fontSize: 9.5, fontFamily: "var(--app-font-mono)",
                color: "var(--atlas-muted)", opacity: 0.4,
                flexShrink: 0, marginLeft: 8, letterSpacing: "0.02em",
              }}>
                {formatRelative(p.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
