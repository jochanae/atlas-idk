import { useMemo, useState } from "react";
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileCode2,
  File as FileIcon,
  AlertCircle,
  Info,
  Clock,
  BookmarkCheck,
  Download,
  ExternalLink,
  RotateCcw,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  formatBytes,
  formatExpiryDate,
  isExpiringSoon,
  type AttachmentKind,
  type PersistedAttachment,
  type StagedAttachment,
} from "@/lib/attachments/types";

type ChipMenuAction =
  | "open"
  | "use-again"
  | "save-to-library"
  | "download"
  | "remove"
  | "retry";

type ChipVariant =
  | { kind: "staged"; attachment: StagedAttachment }
  | { kind: "persisted"; attachment: PersistedAttachment };

export interface MessageAttachmentChipProps {
  variant: ChipVariant;
  /** When null, the chip is read-only (no menu button). */
  onAction?: (action: ChipMenuAction) => void;
}

const KIND_ICON: Record<AttachmentKind, typeof FileText> = {
  image: FileImage,
  pdf: FileText,
  doc: FileText,
  spreadsheet: FileSpreadsheet,
  code: FileCode2,
  text: FileText,
  other: FileIcon,
};

function pickIcon(kind: AttachmentKind) {
  return KIND_ICON[kind] ?? FileIcon;
}

interface Presentation {
  primaryText: string;
  secondaryText?: string;
  tone: "normal" | "amber" | "muted" | "danger" | "gold" | "info";
  leftIcon?: typeof AlertCircle;
  actions: ChipMenuAction[];
}

function stagedPresentation(s: StagedAttachment): Presentation {
  if (s.uploadStatus === "uploading") {
    return {
      primaryText: s.file.name,
      secondaryText: `Uploading… ${Math.round(s.uploadProgress * 100)}%`,
      tone: "muted",
      leftIcon: Loader2,
      actions: ["remove"],
    };
  }
  if (s.uploadStatus === "failed") {
    return {
      primaryText: s.file.name,
      secondaryText: s.error ?? "Upload failed — retry",
      tone: "danger",
      leftIcon: AlertCircle,
      actions: ["retry", "remove"],
    };
  }
  return {
    primaryText: s.file.name,
    secondaryText: formatBytes(s.file.size),
    tone: "normal",
    actions: ["remove"],
  };
}

function persistedPresentation(p: PersistedAttachment): Presentation {
  const size = formatBytes(p.sizeBytes);
  // Processing signals ride on top of availability, but expired always wins.
  if (p.availabilityStatus === "expired") {
    return {
      primaryText: p.filename,
      secondaryText: "File expired · original file is no longer available",
      tone: "muted",
      leftIcon: Clock,
      actions: [],
    };
  }
  if (p.availabilityStatus === "library" || p.libraryItemId) {
    return {
      primaryText: p.filename,
      secondaryText: "Saved to Library",
      tone: "gold",
      leftIcon: BookmarkCheck,
      actions: ["open", "use-again", "download"],
    };
  }
  if (p.processingStatus === "unsupported") {
    return {
      primaryText: p.filename,
      secondaryText: "Stored — Atlas can't read this file type yet",
      tone: "info",
      leftIcon: Info,
      actions: ["open", "download"],
    };
  }
  if (p.processingStatus === "failed") {
    return {
      primaryText: p.filename,
      secondaryText: "Stored — Atlas couldn't process this file",
      tone: "info",
      leftIcon: AlertCircle,
      actions: ["open", "download"],
    };
  }
  const expiring =
    p.availabilityStatus === "expiring" || isExpiringSoon(p.expiresAt);
  if (expiring && p.expiresAt) {
    return {
      primaryText: p.filename,
      secondaryText: `Available until ${formatExpiryDate(
        p.expiresAt,
      )} · Save to Library to keep it`,
      tone: "amber",
      leftIcon: Clock,
      actions: ["open", "use-again", "save-to-library", "download"],
    };
  }
  return {
    primaryText: p.filename,
    secondaryText: size,
    tone: "normal",
    actions: ["open", "use-again", "save-to-library", "download"],
  };
}

const TONE_STYLE: Record<Presentation["tone"], React.CSSProperties> = {
  normal: {
    background: "color-mix(in oklab, var(--atlas-surface) 92%, transparent)",
    border: "1px solid color-mix(in oklab, var(--atlas-gold) 14%, transparent)",
    color: "var(--atlas-fg)",
  },
  amber: {
    background: "color-mix(in oklab, #c9a24c 10%, var(--atlas-surface))",
    border: "1px solid color-mix(in oklab, #c9a24c 40%, transparent)",
    color: "var(--atlas-fg)",
  },
  muted: {
    background: "color-mix(in oklab, var(--atlas-surface) 70%, transparent)",
    border: "1px dashed color-mix(in oklab, var(--atlas-fg) 20%, transparent)",
    color: "color-mix(in oklab, var(--atlas-fg) 60%, transparent)",
  },
  danger: {
    background: "color-mix(in oklab, #b34747 12%, var(--atlas-surface))",
    border: "1px solid color-mix(in oklab, #b34747 55%, transparent)",
    color: "var(--atlas-fg)",
  },
  gold: {
    background: "color-mix(in oklab, var(--atlas-gold) 14%, var(--atlas-surface))",
    border: "1px solid color-mix(in oklab, var(--atlas-gold) 55%, transparent)",
    color: "var(--atlas-fg)",
  },
  info: {
    background: "color-mix(in oklab, #4c7fc9 10%, var(--atlas-surface))",
    border: "1px solid color-mix(in oklab, #4c7fc9 40%, transparent)",
    color: "var(--atlas-fg)",
  },
};

const ACTION_LABEL: Record<ChipMenuAction, string> = {
  open: "Open",
  "use-again": "Use again",
  "save-to-library": "Save to Library",
  download: "Download",
  remove: "Remove",
  retry: "Retry",
};

const ACTION_ICON: Record<ChipMenuAction, typeof ExternalLink> = {
  open: ExternalLink,
  "use-again": RotateCcw,
  "save-to-library": BookmarkCheck,
  download: Download,
  remove: X,
  retry: RefreshCw,
};

export function MessageAttachmentChip({
  variant,
  onAction,
}: MessageAttachmentChipProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const presentation = useMemo(
    () =>
      variant.kind === "staged"
        ? stagedPresentation(variant.attachment)
        : persistedPresentation(variant.attachment),
    [variant],
  );
  const kind =
    variant.kind === "staged" ? variant.attachment.kind : variant.attachment.kind;
  const KindIcon = pickIcon(kind);
  const LeftIcon = presentation.leftIcon ?? KindIcon;
  const isSpinning =
    variant.kind === "staged" && variant.attachment.uploadStatus === "uploading";
  const showProgress =
    variant.kind === "staged" &&
    variant.attachment.uploadStatus === "uploading" &&
    variant.attachment.uploadProgress > 0 &&
    variant.attachment.uploadProgress < 1;
  const hasActions = presentation.actions.length > 0 && onAction;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 12,
        maxWidth: 320,
        minHeight: 44,
        position: "relative",
        ...TONE_STYLE[presentation.tone],
      }}
      data-testid="attachment-chip"
      data-availability={
        variant.kind === "persisted" ? variant.attachment.availabilityStatus : undefined
      }
      data-processing={
        variant.kind === "persisted" ? variant.attachment.processingStatus : undefined
      }
      data-upload={
        variant.kind === "staged" ? variant.attachment.uploadStatus : undefined
      }
    >
      <LeftIcon
        size={16}
        strokeWidth={1.6}
        style={{
          flexShrink: 0,
          animation: isSpinning ? "atlas-spin 0.9s linear infinite" : undefined,
        }}
        aria-hidden
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {presentation.primaryText}
        </span>
        {presentation.secondaryText && (
          <span
            style={{
              fontSize: 11,
              opacity: 0.75,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {presentation.secondaryText}
          </span>
        )}
        {showProgress && (
          <div
            style={{
              marginTop: 4,
              height: 2,
              width: "100%",
              borderRadius: 999,
              background: "color-mix(in oklab, var(--atlas-fg) 15%, transparent)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(
                  (variant.attachment as StagedAttachment).uploadProgress * 100,
                )}%`,
                background: "var(--atlas-gold)",
                transition: "width 120ms linear",
              }}
            />
          </div>
        )}
      </div>
      {hasActions && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            aria-label="Attachment actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
            style={{
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid color-mix(in oklab, var(--atlas-fg) 12%, transparent)",
              color: "inherit",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}></span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                right: 6,
                top: "calc(100% + 4px)",
                zIndex: 20,
                minWidth: 180,
                padding: 4,
                borderRadius: 10,
                background: "var(--atlas-surface)",
                border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {presentation.actions.map((action) => {
                const Icon = ACTION_ICON[action];
                return (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    onMouseDown={(e) => {
                      // fire before the outer blur closes the menu
                      e.preventDefault();
                      setMenuOpen(false);
                      onAction?.(action);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      textAlign: "left",
                      fontSize: 13,
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    <Icon size={14} strokeWidth={1.6} aria-hidden />
                    {ACTION_LABEL[action]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MessageAttachmentChip;
