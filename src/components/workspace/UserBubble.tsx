import { useState, type CSSProperties } from "react";
import { haptic } from "@/lib/long-press-tip";

// Collapse threshold: matches home/nexus reading rhythm.
// Long messages collapse with a "SHOW MORE" affordance so the chat doesn't
// get visually dominated by a giant user paste.
const COLLAPSE_LINES = 6;
const COLLAPSE_CHARS = 360;
const ICON_TOUCH_TARGET_STYLE: CSSProperties = { minWidth: 34, minHeight: 34, padding: 6 };

function formatTimestamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * UserBubble — unified with home/nexus user-bubble styling.
 *
 * Visual contract (must stay in sync with src/pages/home.tsx user branch):
 *   - sans font (var(--app-font-sans)), fontSize var(--ts-body), lineHeight 1.55
 *   - gold-tinted background rgba(201,162,76,0.12) + 0.5px border
 *   - radius "12px 12px 4px 12px"
 *   - maxWidth 80%
 *   - timestamp rendered BELOW the bubble (no "YOU" chip inside)
 *
 * Workspace-only extras kept from the previous version:
 *   - collapse for long messages (> COLLAPSE_LINES rows or > COLLAPSE_CHARS chars)
 *   - hover-revealed copy + edit icon row
 */
export function UserBubble({
  content,
  sentAt,
  onCopy,
  onEdit,
}: {
  content: string;
  sentAt?: string;
  onCopy: () => void;
  onEdit: () => void;
}) {
  const lines = content.split("\n");
  const isTall = lines.length > COLLAPSE_LINES || content.length > COLLAPSE_CHARS;
  const [expanded, setExpanded] = useState(!isTall);
  const [hov, setHov] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayContent = !expanded
    ? lines.slice(0, COLLAPSE_LINES).join("\n").slice(0, COLLAPSE_CHARS) +
      (lines.length > COLLAPSE_LINES || content.length > COLLAPSE_CHARS ? "…" : "")
    : content;

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    haptic.short();
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="atlas-bubble-in"
      style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {/* Bubble — home/nexus parity */}
        <button
          type="button"
          disabled={!isTall}
          onClick={isTall ? () => setExpanded((v) => !v) : undefined}
          aria-label={isTall ? (expanded ? "Collapse message" : "Expand message") : undefined}
          style={{
            position: "relative",
            padding: "9px 13px",
            borderRadius: "12px 12px 4px 12px",
            width: "100%",
            background: "rgba(201,162,76,0.12)",
            border: "0.5px solid rgba(201,162,76,0.3)",
            textAlign: "left",
            font: "inherit",
            cursor: isTall ? "pointer" : "default",
            transition: "background 200ms ease, border-color 200ms ease",
          }}
        >
          <div
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-sans)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >

            {displayContent}
          </div>
          {isTall && (
            <div
              style={{
                marginTop: 6,
                fontSize: 9,
                fontFamily: "var(--app-font-mono)",
                letterSpacing: "0.12em",
                color: "var(--atlas-gold)",
                opacity: 0.6,
              }}
            >
              {expanded ? "SHOW LESS ↑" : "SHOW MORE ↓"}
            </div>
          )}
        </button>

        {/* Timestamp — BELOW bubble, matches home/nexus */}
        {sentAt && (
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: "var(--ts-xs)",
              letterSpacing: "0.08em",
              color: "var(--atlas-muted)",
              opacity: 0.45,
              textTransform: "lowercase",
            }}
          >
            {formatTimestamp(sentAt)}
          </div>
        )}

        {/* Hover action row */}
        <div style={{ display: "flex", gap: 4, opacity: hov ? 1 : 0, transition: "opacity 180ms ease", justifyContent: "flex-end" }}>
          <button
            className={`atlas-icon-action${copied ? " copy-done" : ""}`}
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy"}
            aria-label="Copy message"
            style={ICON_TOUCH_TARGET_STYLE}
          >
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l3 3 7-7" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M9 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v5a1 1 0 001 1h2" /></svg>
            )}
          </button>
          <button className="atlas-icon-action" onClick={onEdit} title="Edit &amp; resend" aria-label="Edit message" style={ICON_TOUCH_TARGET_STYLE}>
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
