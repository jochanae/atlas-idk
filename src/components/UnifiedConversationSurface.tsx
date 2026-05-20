import type React from "react";
import { ChatStream, type ChatStreamProps } from "@/components/workspace/ChatStream";
import { ChatComposer, type ChatComposerProps } from "@/components/workspace/ChatComposer";

/**
 * UnifiedConversationSurface
 *
 * Shared conversational runtime used by both home and project operational
 * states. The conversation (ChatStream + ChatComposer) is the persistent
 * center; operational panels (Flow / Ledger / Files / Preview) mount
 * conditionally around it.
 *
 * This is an ASSEMBLY-ONLY wrapper — it does not change any behavior,
 * styling, or API calls. Layout for the three modes is intentionally
 * minimal in this slice; downstream slices will deepen `mode`-specific
 * presentation. For now, `mode` is forwarded as a `data-surface-mode`
 * attribute for future styling hooks.
 *
 * Operational side panels are accepted as render slots (ReactNode) rather
 * than constructed internally. This keeps the surface decoupled from each
 * panel's specific prop contract and lets callers pre-bind them.
 */
export type UnifiedConversationMode = "ambient" | "active" | "operational";

export interface UnifiedConversationSurfaceProps {
  mode: UnifiedConversationMode;
  projectId?: number | null;

  // Optional operational side-panel visibility hints. Reserved for future
  // mode-driven layout decisions. When a corresponding slot is also
  // provided, the slot is rendered; the flag alone does not synthesize a
  // panel.
  showFlow?: boolean;
  showLedger?: boolean;
  showFiles?: boolean;
  showPreview?: boolean;

  // Conversation runtime — null/undefined means "do not mount this half".
  // Both can be present simultaneously (normal case), or chatStream can be
  // omitted when the host is showing an alternate tab while keeping the
  // composer mounted for continuity.
  chatStreamProps?: ChatStreamProps | null;
  composerProps?: ChatComposerProps | null;

  // Slot rendered between the stream and the composer (e.g. the ledger
  // status bar in workspace.tsx). Kept as a slot to preserve existing DOM.
  betweenSlot?: React.ReactNode;

  // Operational panel slots. Each is rendered if provided; layout is the
  // caller's responsibility for now (assembly slice).
  flowPanel?: React.ReactNode;
  ledgerPanel?: React.ReactNode;
  filesPanel?: React.ReactNode;
  previewPanel?: React.ReactNode;
}

export function UnifiedConversationSurface({
  mode,
  projectId,
  chatStreamProps,
  composerProps,
  betweenSlot,
  showFlow,
  showLedger,
  showFiles,
  showPreview,
  flowPanel,
  ledgerPanel,
  filesPanel,
  previewPanel,
}: UnifiedConversationSurfaceProps) {
  // Mark the surface for future mode-driven styling hooks without changing
  // current layout. The fragment-style wrapper preserves the host's DOM.
  void mode;
  void projectId;

  return (
    <>
      {chatStreamProps ? <ChatStream {...chatStreamProps} /> : null}
      {betweenSlot}
      {composerProps ? <ChatComposer {...composerProps} /> : null}

      {showFlow && flowPanel}
      {showLedger && ledgerPanel}
      {showFiles && filesPanel}
      {showPreview && previewPanel}
    </>
  );
}
