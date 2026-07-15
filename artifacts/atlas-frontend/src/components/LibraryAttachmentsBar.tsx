import type { LibraryItem } from "@/lib/library";

/**
 * LibraryAttachmentsBar — chips of library items currently attached
 * to a conversation. Renders in the composer subheader. Attachment
 * state is truth-of-record from `GET /api/conversations/:id/context`
 * (fetched by parent); this component just renders + emits detach.
 */
export interface LibraryAttachmentsBarProps {
  items: LibraryItem[];
  busyId: string | null;
  onDetach: (item: LibraryItem) => void;
}

export function LibraryAttachmentsBar({ items, busyId, onDetach }: LibraryAttachmentsBarProps) {
  if (!items.length) return null;
  return (
    <div
      aria-label="Attached references"
      style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 12px 0",
      }}
    >
      {items.map((item) => {
        const busy = busyId === item.id;
        return (
          <span
            key={item.id}
            title={item.title}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              maxWidth: 200,
              padding: "3px 6px 3px 8px",
              borderRadius: 999,
              background: "color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
              border: "1px solid color-mix(in oklab, var(--atlas-gold) 35%, transparent)",
              color: "var(--atlas-gold)",
              fontFamily: "var(--app-font-mono)",
              fontSize: 10, letterSpacing: "0.06em",
              opacity: busy ? 0.5 : 1,
            }}
          >
            <span style={{
              maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{item.title}</span>
            <button
              type="button"
              aria-label={`Detach ${item.title}`}
              disabled={busy}
              onClick={() => onDetach(item)}
              style={{
                background: "transparent", border: "none", padding: 0, cursor: busy ? "wait" : "pointer",
                color: "var(--atlas-gold)", opacity: 0.7, lineHeight: 1, display: "inline-flex",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
              </svg>
            </button>
          </span>
        );
      })}
    </div>
  );
}
