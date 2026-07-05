/**
 * UrlPreviewCard — shown above the chat input when a URL is detected.
 * Displays a screenshot thumbnail + title + description while the user composes.
 */

import type { UrlIntelligenceData } from "@/hooks/useUrlIntelligence";

interface Props {
  url: string;
  data: UrlIntelligenceData | null;
  loading: boolean;
  error: boolean;
  onDismiss: () => void;
}

export function UrlPreviewCard({ url, data, loading, error, onDismiss }: Props) {
  const host = data?.host ?? (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();
  const title = data?.title ?? null;
  const description = data?.description ?? null;
  const service = data?.detectedService ?? null;
  const screenshot = data?.screenshotBase64 ?? null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: "var(--atlas-card-bg, rgba(255,255,255,0.04))",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "10px 10px 10px 12px",
        maxWidth: "100%",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Screenshot thumbnail or loading skeleton */}
      <div
        style={{
          flexShrink: 0,
          width: 80,
          height: 52,
          borderRadius: 6,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && !screenshot ? (
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)",
            backgroundSize: "200% 100%",
            animation: "atlas-shimmer 1.4s infinite",
          }} />
        ) : screenshot ? (
          <img
            src={screenshot}
            alt={title ?? url}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
          />
        ) : (
          /* Fallback globe icon when no screenshot */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        )}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Host + service badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 10,
            fontFamily: "var(--app-font-mono)",
            color: "var(--atlas-muted)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 200,
          }}>
            {host}
          </span>
          {service && (
            <span style={{
              fontSize: 9,
              fontFamily: "var(--app-font-mono)",
              background: "rgba(201,162,76,0.15)",
              color: "rgba(201,162,76,0.85)",
              border: "1px solid rgba(201,162,76,0.25)",
              borderRadius: 3,
              padding: "1px 5px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}>
              {service}
            </span>
          )}
        </div>

        {loading && !title ? (
          <div style={{ height: 12, width: "60%", borderRadius: 3, background: "rgba(255,255,255,0.06)", marginTop: 2 }} />
        ) : title ? (
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--atlas-fg)",
            opacity: 0.88,
            lineHeight: 1.3,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
          }}>
            {title}
          </div>
        ) : error ? (
          <div style={{ fontSize: 12, color: "var(--atlas-muted)", opacity: 0.6 }}>
            Couldn't preview — link will be included as context
          </div>
        ) : null}

        {!loading && description && (
          <div style={{
            fontSize: 12,
            color: "var(--atlas-fg)",
            opacity: 0.55,
            lineHeight: 1.4,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
          }}>
            {description}
          </div>
        )}

        {/* Screenshot indicator */}
        {!loading && screenshot && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,76,0.6)" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
            <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "rgba(201,162,76,0.6)", letterSpacing: "0.06em" }}>
              Screenshot captured · Atlas will see this
            </span>
          </div>
        )}
        {!loading && !screenshot && !error && data && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
              <polyline points="9,11 12,14 22,4" />
              <path d="M21,12v7a2,2,0,0,1-2,2H5a2,2,0,0,1-2-2V5a2,2,0,0,1,2-2h11" />
            </svg>
            <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em" }}>
              Page content captured · Atlas will read this
            </span>
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss URL preview"
        style={{
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 2px",
          color: "var(--atlas-muted)",
          opacity: 0.5,
          lineHeight: 1,
          borderRadius: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: -2,
          marginRight: -2,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.5"; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <style>{`
        @keyframes atlas-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

export default UrlPreviewCard;
