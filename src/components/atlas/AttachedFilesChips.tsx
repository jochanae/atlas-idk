import { X, Paperclip } from "lucide-react";

export type AttachedFile = { name: string; url: string; type: string };

interface Props {
  files: AttachedFile[];
  onRemove?: (index: number) => void;
}

/**
 * Compact chip row for files attached to an outgoing message.
 * Renders nothing when there are no files. Designed to sit directly above
 * the textarea inside the input shell.
 */
export function AttachedFilesChips({ files, onRemove }: Props) {
  if (!files || files.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Attached files"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: "0.5px solid color-mix(in oklab, var(--border) 60%, transparent)",
      }}
    >
      {files.map((f, i) => (
        <div
          key={`${f.name}-${i}`}
          role="listitem"
          title={f.name}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 6px 4px 8px",
            borderRadius: 8,
            background: "color-mix(in oklab, var(--accent-gold) 8%, var(--surface-alt))",
            border: "0.5px solid color-mix(in oklab, var(--accent-gold) 40%, var(--border))",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--foreground)",
            maxWidth: 220,
          }}
        >
          <Paperclip size={11} style={{ opacity: 0.7, flexShrink: 0 }} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {f.name}
          </span>
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              onClick={() => onRemove(i)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: 4,
                border: "none",
                background: "transparent",
                color: "var(--muted-text)",
                cursor: "pointer",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "color-mix(in oklab, var(--foreground) 8%, transparent)";
                e.currentTarget.style.color = "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--muted-text)";
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
