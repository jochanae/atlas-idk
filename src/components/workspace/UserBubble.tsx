import { useState, type CSSProperties } from "react";
import { haptic } from "@/lib/long-press-tip";

const COLLAPSE_LINES = 3;
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
  const isTall = lines.length > COLLAPSE_LINES || content.length > 180;
  const [expanded, setExpanded] = useState(!isTall);
  const [hov, setHov] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayContent = !expanded
    ? lines.slice(0, COLLAPSE_LINES).join("\n") + (lines.length > COLLAPSE_LINES ? "…" : "")
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
      style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ maxWidth: "74%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
        {/* Bubble */}
        <button
          type="button"
          disabled={!isTall}
          style={{
            position: "relative",
            padding: "11px 15px 11px 17px",
            borderRadius: "16px 4px 16px 16px",
            width: "100%",
            background: "var(--atlas-surface)",
            border: "none",
            textAlign: "left",
            font: "inherit",
            cursor: isTall ? "pointer" : "default",
            transition: "all 280ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onClick={isTall ? () => setExpanded((v) => !v) : undefined}
          aria-label={isTall ? (expanded ? "Collapse message" : "Expand message") : undefined}
        >
          <div
            style={{
              fontFamily: "var(--app-font-mono)", fontSize: 9,
              letterSpacing: "0.15em", textTransform: "uppercase",
              color: "var(--atlas-muted)", opacity: 0.75, marginBottom: 8, textAlign: "right",
            }}
          >
            YOU{sentAt ? ` · ${formatTimestamp(sentAt)}` : ""}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--atlas-fg)", opacity: 0.85, whiteSpace: "pre-wrap", fontFamily: "var(--app-font-mono)", letterSpacing: "-0.01em" }}>
            {displayContent}
          </div>
          {isTall && (
            <div style={{ marginTop: 5, fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-gold)", opacity: 0.5 }}>
              {expanded ? "SHOW LESS ↑" : "SHOW MORE ↓"}
            </div>
          )}
        </button>

        {/* Action row — icon-only, visible on hover */}
        <div style={{ display: "flex", gap: 4, opacity: hov ? 1 : 0, transition: "opacity 180ms ease", justifyContent: "flex-end" }}>
          {/* Copy */}
          <button className={`atlas-icon-action${copied ? " copy-done" : ""}`} onClick={handleCopy} title={copied ? "Copied!" : "Copy"} aria-label="Copy message" style={ICON_TOUCH_TARGET_STYLE}>
            {copied
              ? <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l3 3 7-7" /></svg>
              : <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M9 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v5a1 1 0 001 1h2" /></svg>
            }
          </button>
          {/* Edit */}
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
