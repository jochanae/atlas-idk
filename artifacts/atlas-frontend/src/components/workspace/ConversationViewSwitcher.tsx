/**
 * ConversationViewSwitcher — small segmented control that reinforces the
 * "same conversation, two views" model. Mounted on the workspace as a
 * fixed pill; tapping "Conversation" opens the Ask Atlas surface with
 * the current project's context (via activeProjectContext, populated by
 * workspace.tsx on mount).
 *
 * See plan step 5 (2026-07-07). Not a route change — Ask Atlas lives on
 * /home, so we navigate there and let its own open-flag logic take over
 * (home.tsx:2089 auto-opens the surface when askAtlasSession.isSurfaceOpen()).
 */
import { useLocation } from "wouter";
import { askAtlasSession } from "@/lib/askAtlasSession";
import { useActiveProjectContext } from "@/lib/activeProjectContext";

type Props = {
  /** When true, hides the pill (e.g. on small mobile widths where header space is tight). */
  hidden?: boolean;
};

export function ConversationViewSwitcher({ hidden = false }: Props) {
  const ctx = useActiveProjectContext();
  const [, setLoc] = useLocation();
  if (hidden || !ctx) return null;

  const goConversation = () => {
    askAtlasSession.clearClosed();
    askAtlasSession.setSurfaceOpen(true);
    setLoc("/home");
    // If /home is already the same origin, Ask Atlas surface auto-opens
    // from storage. Otherwise the axiom:ask-atlas event fires it.
    window.setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent("axiom:ask-atlas")); } catch {}
    }, 30);
  };

  return (
    <div
      role="tablist"
      aria-label="View"
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
        onClick={goConversation}
        style={{
          padding: "5px 11px",
          borderRadius: 999,
          background: "transparent",
          border: 0,
          color: "var(--atlas-muted, rgba(255,255,255,0.55))",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
        }}
      >
        Conversation
      </button>
      <span
        role="tab"
        aria-selected="true"
        style={{
          padding: "5px 11px",
          borderRadius: 999,
          background: "var(--atlas-gold, #C9A84C)",
          color: "var(--atlas-bg, #000)",
          fontWeight: 700,
        }}
      >
        Workspace
      </span>
    </div>
  );
}
