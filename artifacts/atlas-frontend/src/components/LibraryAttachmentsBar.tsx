import { X } from "lucide-react";
import type { LibraryItem } from "@/lib/library";
import { metaFor } from "@/components/library/kindMeta";

/**
 * LibraryAttachmentsBar — chips of Library items currently attached to a
 * conversation. Renders in the composer subheader. Attachment state is
 * truth-of-record from `GET /api/conversations/:id/context` (fetched by
 * parent); this component just renders + emits detach.
 *
 * Each chip carries the item's kind icon + specific type label so the two
 * surfaces (Library list, attachments bar) read the same.
 */
export interface LibraryAttachmentsBarProps {
  items: LibraryItem[];
  busyId: string | null;
  onDetach: (item: LibraryItem) => void;
  /** Optional: open the item (opens Library sheet focused on this item). */
  onOpen?: (item: LibraryItem) => void;
}

export function LibraryAttachmentsBar({ items, busyId, onDetach, onOpen }: LibraryAttachmentsBarProps) {
  if (!items.length) return null;
  return (
    <div
      aria-label="Attached Library items"
      style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 12px 0",
      }}
    >
      {items.map((item) => {
        const busy = busyId === item.id;
        const meta = metaFor(item.kind);
        const Icon = meta.icon;
        const clickable = !!onOpen;
        return (
          <span
            key={item.id}
            title={clickable ? `Open · ${meta.typeLabel} · ${item.title}` : `${meta.typeLabel} · ${item.title}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              maxWidth: 220,
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
            <button
              type="button"
              onClick={() => { if (!busy && onOpen) onOpen(item); }}
              disabled={busy || !clickable}
              aria-label={clickable ? `Open ${item.title}` : item.title}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "transparent", border: "none", padding: 0,
                color: "inherit", font: "inherit", letterSpacing: "inherit",
                cursor: clickable && !busy ? "pointer" : "default",
                maxWidth: 190, textAlign: "left",
              }}
            >
              <Icon size={11} strokeWidth={1.8} />
              <span style={{
                maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{item.title}</span>
            </button>
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
              <X size={10} strokeWidth={2} />
            </button>
          </span>
        );
      })}
    </div>
  );
}

