import { ChevronRight } from "lucide-react";

type Props = {
  projectName: string | null;
  sessionTitle: string | null;
  onHomeClick?: () => void;
  onProjectClick?: () => void;
  /** When true, shows a soft gold pulse next to session title (a commit just landed). */
  pulse?: boolean;
};

/**
 * Atlas / [Project] / [Session] — quiet header micro-nav for the active workspace.
 * Inherits the persistent header; never re-renders during Front Door → Session transition.
 */
export function SessionBreadcrumb({
  projectName,
  sessionTitle,
  onHomeClick,
  onProjectClick,
  pulse = false,
}: Props) {
  const crumbStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 10.5,
    letterSpacing: "0.08em",
    color: "var(--muted-text)",
    textTransform: "uppercase",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    transition: "color 160ms var(--ease-cinematic)",
    maxWidth: 140,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const sep = (
    <ChevronRight
      size={11}
      style={{ color: "color-mix(in oklab, var(--muted-text) 50%, transparent)", flexShrink: 0 }}
    />
  );

  return (
    <nav
      aria-label="Session location"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
        animation: "atlas-tag-in 400ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <button
        type="button"
        onClick={onHomeClick}
        className="atlas-crumb"
        style={crumbStyle}
        title="Back to Atlas"
      >
        Atlas
      </button>
      {projectName && (
        <>
          {sep}
          <button
            type="button"
            onClick={onProjectClick}
            className="atlas-crumb"
            style={crumbStyle}
            title={projectName}
          >
            {projectName}
          </button>
        </>
      )}
      {sessionTitle && (
        <>
          {sep}
          <span
            style={{
              ...crumbStyle,
              color: "var(--foreground)",
              cursor: "default",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            title={sessionTitle}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 160,
                display: "inline-block",
              }}
            >
              {sessionTitle}
            </span>
            {pulse && (
              <span
                aria-label="Synced to ledger"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--accent-gold)",
                  boxShadow: "0 0 8px var(--accent-gold)",
                  animation: "atlas-commit-pulse 1.6s ease-in-out infinite",
                  flexShrink: 0,
                }}
              />
            )}
          </span>
        </>
      )}

      <style>{`
        .atlas-crumb:hover { color: var(--accent-gold) !important; }
        @keyframes atlas-commit-pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.4); }
        }
      `}</style>
    </nav>
  );
}
