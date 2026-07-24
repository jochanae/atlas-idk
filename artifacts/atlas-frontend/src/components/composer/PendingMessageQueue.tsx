/**
 * Visible pending-message queue above the composer.
 * Move up/down to reorder; up-arrow Send now promotes into chat (interrupts if needed).
 */
import type { ReactNode } from "react";
import { ArrowUp, ChevronDown, ChevronUp, X } from "lucide-react";
import type { PendingQueueItem } from "@/hooks/usePendingMessageQueue";

export type PendingMessageQueueProps = {
  items: PendingQueueItem[];
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onSendNow: (id: string) => void;
  /** When true, Send now is an interrupt+promote. */
  busy?: boolean;
};

function previewText(text: string): string {
  const t = text.trim();
  if (!t) return "(attachment)";
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

export function PendingMessageQueue({
  items,
  onRemove,
  onMoveUp,
  onMoveDown,
  onSendNow,
  busy = false,
}: PendingMessageQueueProps) {
  if (items.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Queued messages"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginBottom: 8,
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
        background: "color-mix(in oklab, var(--atlas-gold) 5%, transparent)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--atlas-gold)",
          opacity: 0.85,
          marginBottom: 2,
        }}
      >
        Queued · {items.length}
      </div>

      {items.map((item, index) => (
        <div
          key={item.id}
          role="listitem"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "8px 8px",
            borderRadius: 8,
            background: "color-mix(in oklab, var(--atlas-fg) 3%, transparent)",
            border: "1px solid color-mix(in oklab, var(--atlas-border, #2a2a36) 70%, transparent)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                color: "var(--atlas-fg)",
                fontFamily: "var(--app-font-sans)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {previewText(item.text)}
            </div>
            {item.attachmentNames && item.attachmentNames.length > 0 && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: "var(--atlas-muted)",
                  fontFamily: "var(--app-font-sans)",
                  opacity: 0.75,
                }}
              >
                {item.attachmentNames.join(" · ")}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <IconButton
              label="Move up in queue"
              disabled={index === 0}
              onClick={() => onMoveUp(item.id)}
            >
              <ChevronUp size={14} strokeWidth={1.8} />
            </IconButton>
            <IconButton
              label="Move down in queue"
              disabled={index === items.length - 1}
              onClick={() => onMoveDown(item.id)}
            >
              <ChevronDown size={14} strokeWidth={1.8} />
            </IconButton>
            <IconButton
              label={busy ? "Send now — interrupt and send" : "Send now"}
              onClick={() => onSendNow(item.id)}
              accent
            >
              <ArrowUp size={14} strokeWidth={2} />
            </IconButton>
            <IconButton label="Remove from queue" onClick={() => onRemove(item.id)}>
              <X size={14} strokeWidth={1.8} />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  accent,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: accent
          ? "1px solid color-mix(in oklab, var(--atlas-gold) 45%, transparent)"
          : "1px solid transparent",
        background: accent
          ? "color-mix(in oklab, var(--atlas-gold) 14%, transparent)"
          : "transparent",
        color: accent ? "var(--atlas-gold)" : "var(--atlas-muted)",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

export default PendingMessageQueue;
