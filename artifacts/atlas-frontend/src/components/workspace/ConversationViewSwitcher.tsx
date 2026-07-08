/**
 * ConversationViewSwitcher — segmented control that toggles the workspace
 * between Conversation Mode (pure talk, no tools/build actions) and Build
 * Mode (full build capability). Same thread, same session — this is a
 * posture switch, not a surface handoff. Ask Atlas has been removed; this
 * control now owns the "Conversation" vs "Build" distinction in-place.
 */
import type { CSSProperties } from "react";

type Props = {
  /** When true, hides the pill (e.g. on small mobile widths where header space is tight). */
  hidden?: boolean;
  conversationMode: boolean;
  onToggle: () => void;
};

export function ConversationViewSwitcher({ hidden = false, conversationMode, onToggle }: Props) {
  if (hidden) return null;

  const pillStyle = (active: boolean): CSSProperties => ({
    padding: "5px 11px",
    borderRadius: 999,
    border: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    letterSpacing: "inherit",
    textTransform: "inherit",
    background: active ? "var(--atlas-gold, #C9A84C)" : "transparent",
    color: active ? "var(--atlas-bg, #000)" : "var(--atlas-muted, rgba(255,255,255,0.55))",
    fontWeight: active ? 700 : 400,
  });

  return (
    <div
      role="tablist"
      aria-label="Mode"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: 3,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--atlas-fg, #fff) 4%, transparent)",
        border: "1px solid var(--atlas-border, rgba(255,255,255,0.08))",
        fontFamily: "var(--app-font-mono)",
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        userSelect: "none",
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={conversationMode}
        onClick={() => { if (!conversationMode) onToggle(); }}
        style={pillStyle(conversationMode)}
      >
        Conversation
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!conversationMode}
        onClick={() => { if (conversationMode) onToggle(); }}
        style={pillStyle(!conversationMode)}
      >
        Build
      </button>
    </div>
  );
}
