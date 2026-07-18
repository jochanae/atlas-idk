/**
 * useAtlasConversation — Surface-neutral conversation controller.
 *
 * Owns useNexusChatStream directly. Both Ask Atlas and Workspace instantiate
 * this hook. The controller calls nexusChatStream.send({ text, attachments })
 * with the canonical submission object — no surface adapter, no field
 * extraction. Nothing between submit() and the transport may remove or
 * reconstruct fields.
 *
 * B1 scope: text + pass-through attachments.
 * B2 scope: Full staged-file lifecycle.
 *   submit() accepts StagedFile[] and lifecycle callbacks from useStagedAttachments.
 *   The controller:
 *     1. Calls onMarkConverting(ids) before conversion begins.
 *     2. Converts each file; calls onMarkFailed(id, error) per failed file.
 *     3. If nothing to send: calls onRestoreToReady(remainingIds) and returns ok:false.
 *     4. Attempts transport (nexusChatStream.send).
 *     5. On success: calls onClearSent(sentIds) — only confirmed files are removed.
 *     6. On transport failure: calls onRestoreToReady(convertingIds minus failed) so
 *        the user can retry without reselecting files.
 *   Surfaces MUST NOT call staged.clearFiles() before awaiting submit().
 * B3/C: storage, persistence, database migrations — NOT implemented here.
 */
import { useCallback } from "react";
import {
  useNexusChatStream,
  type NexusMessage,
  type NexusLiveStep,
  type NexusShapingPayload,
  type NexusHandoffSignal,
  type UseNexusChatStreamOptions,
} from "./useNexusChatStream";
import { fileToBase64Safe } from "@/lib/image-resize";
import type { StagedFile, StagedFileError } from "./useStagedAttachments";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AtlasConversationAttachment = {
  base64: string;
  mediaType: string;
  name?: string;
};

export type SubmissionError = {
  code: string;
  message: string;
};

/**
 * Result returned by submit().
 * Surfaces must inspect ok before deciding whether to clear staged state.
 * The shared controller handles staged state via callbacks — surfaces need
 * not react to ok/false for staged files; the callbacks already updated state.
 */
export type SubmissionResult =
  | { ok: true; clientMessageId: string }
  | { ok: false; error: SubmissionError; failedAttachmentIds?: string[] };

export type AtlasConversationSubmission = {
  /** Raw user text; the controller trims it. */
  text: string;
  /**
   * B2 staged files — passed from surfaces that use useStagedAttachments.
   * The controller converts ready files to inline base64 transport inside submit().
   * Surfaces must NOT perform this conversion themselves.
   * Surfaces must NOT clear staged state before awaiting submit() — the
   * lifecycle callbacks manage state transitions based on actual outcomes.
   */
  stagedAttachments?: StagedFile[];
  /**
   * B1 / legacy pass-through: already-converted attachment data.
   * Used by non-staged call sites (opening-message sessionStorage handoffs,
   * auto-continue, suggestion chips). Will be removed once all call sites
   * migrate to stagedAttachments in B3/C.
   */
  attachments?: AtlasConversationAttachment[];

  // ── Staged-file lifecycle callbacks ──────────────────────────────────────
  // Wire these from useStagedAttachments so submit() drives the full lifecycle.
  // All callbacks are optional; omitting them disables per-file status transitions.

  /** Called before conversion begins. Transitions "ready" → "converting". */
  onMarkConverting?: (ids: string[]) => void;
  /** Called when a file's base64 conversion throws. Transitions to "failed". */
  onMarkFailed?: (id: string, error: StagedFileError) => void;
  /**
   * Called when transport fails (after conversion) or when nothing survived
   * conversion. Restores "converting" → "ready" so the user can retry.
   */
  onRestoreToReady?: (ids: string[]) => void;
  /**
   * Called on confirmed transport success. Removes only the files that were
   * actually sent. Files that failed conversion remain staged as "failed".
   */
  onClearSent?: (ids: string[]) => void;
};

export type AtlasConversationConfig = {
  surface: "ask-atlas" | "workspace";
  focusProjectId?: number | null;
  conversationId?: string | null;
  conversationMode?: boolean;
  model?: string;
  mode?: string;
  projectContext?: UseNexusChatStreamOptions["projectContext"];
  askAtlasInProject?: UseNexusChatStreamOptions["askAtlasInProject"];
  onConversationId?: (id: string) => void;
  onThinkingStable?: () => void;
};

export type AtlasConversation = {
  /**
   * Canonical user-initiated send. Called from both Ask Atlas and Workspace.
   * Returns SubmissionResult — callers must await to determine lifecycle outcome.
   * The controller validates, normalises, converts staged attachments, drives
   * lifecycle callbacks, and calls nexusChatStream.send directly.
   * No surface adapter may intercept or reconstruct the submission payload.
   */
  submit: (submission: AtlasConversationSubmission) => Promise<SubmissionResult>;
  /** True when a new turn may begin (not streaming, not pending). */
  canSend: boolean;
  messages: NexusMessage[];
  setMessages: React.Dispatch<React.SetStateAction<NexusMessage[]>>;
  isStreaming: boolean;
  isPending: boolean;
  liveStep: NexusLiveStep | null;
  liveSteps: NexusLiveStep[];
  activeRunId: string | null;
  shapingPayload: NexusShapingPayload | null;
  setShapingPayload: React.Dispatch<React.SetStateAction<NexusShapingPayload | null>>;
  shapingHeld: boolean;
  setShapingHeld: React.Dispatch<React.SetStateAction<boolean>>;
  handoffSignal: NexusHandoffSignal | null;
  abort: () => void;
  clearMessages: () => void;
  pendingAuthorization: Record<string, unknown> | null;
  authorizeRun: (runId: string, planVersion: string) => Promise<void>;
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAtlasConversation(config: AtlasConversationConfig): AtlasConversation {
  const surfaceContext = config.surface === "ask-atlas" ? "ask-atlas" : "workspace";

  const nexusChatStream = useNexusChatStream({
    focusProjectId: config.focusProjectId ?? null,
    model: config.model ?? "claude",
    mode: config.mode,
    conversationId: config.conversationId ?? null,
    conversationMode: config.conversationMode,
    surfaceContext,
    projectContext: config.projectContext ?? null,
    askAtlasInProject: config.askAtlasInProject,
    onConversationId: config.onConversationId,
    onThinkingStable: config.onThinkingStable,
  });

  const canSend = !nexusChatStream.isPending && !nexusChatStream.isStreaming;

  const submit = useCallback(
    async (submission: AtlasConversationSubmission): Promise<SubmissionResult> => {
      const trimmed = submission.text.trim();
      const staged = submission.stagedAttachments ?? [];
      const readyStaged = staged.filter(sf => sf.status === "ready");
      const hasStagedFiles = readyStaged.length > 0;
      const hasPassthrough = (submission.attachments?.length ?? 0) > 0;

      if ((trimmed.length === 0 && !hasStagedFiles && !hasPassthrough) || !canSend) {
        return {
          ok: false,
          error: { code: "NO_CONTENT", message: "Nothing to send or not ready" },
        };
      }

      // ── Step 1: Mark all ready staged files as converting ─────────────────
      const readyIds = readyStaged.map(sf => sf.id);
      if (readyIds.length > 0) {
        submission.onMarkConverting?.(readyIds);
      }

      // ── Step 2: Convert each staged file — per-file error isolation ───────
      // Tracks: { _stagedId, base64, mediaType, name } for successfully converted files.
      const transported: Array<{ _stagedId: string } & AtlasConversationAttachment> = [];
      const failedConversionIds: string[] = [];

      for (const sf of readyStaged) {
        try {
          const result = await fileToBase64Safe(sf.file);
          transported.push({
            _stagedId: sf.id,
            base64: result.base64,
            mediaType: result.mediaType,
            name: sf.name,
          });
        } catch (convErr) {
          failedConversionIds.push(sf.id);
          submission.onMarkFailed?.(sf.id, {
            code: "CONVERSION_FAILED",
            message: convErr instanceof Error ? convErr.message : "Could not read file",
            retryable: true,
          });
        }
      }

      // ── Step 3: Build final attachment list ───────────────────────────────
      // Strip the internal _stagedId before sending to the transport layer.
      const transportedAttachments: AtlasConversationAttachment[] = transported.map(
        ({ _stagedId: _, ...rest }) => rest,
      );
      const allAttachments: AtlasConversationAttachment[] = [
        ...transportedAttachments,
        ...(submission.attachments ?? []),
      ];

      const hasFinalContent = trimmed.length > 0 || allAttachments.length > 0;

      // ── Step 4: Bail if nothing to send after conversion ──────────────────
      if (!hasFinalContent) {
        // All staged files failed conversion and there's no text.
        // Restore the files that converted OK (none) vs the ones that are now "failed".
        // readyIds minus failedConversionIds = files that might still be "converting"
        // after markFailed was called for failures. In practice, if all fail they're
        // all "failed" now, but we restore the empty set to be safe.
        const stillConverting = readyIds.filter(id => !failedConversionIds.includes(id));
        if (stillConverting.length > 0) {
          submission.onRestoreToReady?.(stillConverting);
        }
        return {
          ok: false,
          error: { code: "ALL_CONVERSIONS_FAILED", message: "No files could be converted" },
          failedAttachmentIds: failedConversionIds,
        };
      }

      // ── Step 5: Attempt transport ─────────────────────────────────────────
      try {
        await (nexusChatStream.send({
          text: trimmed,
          attachments: allAttachments.length > 0 ? allAttachments : undefined,
        }) ?? Promise.resolve());

        // ── Step 6: Confirmed success — clear only the files that were sent ──
        const sentIds = transported.map(a => a._stagedId);
        if (sentIds.length > 0) {
          submission.onClearSent?.(sentIds);
        }

        return { ok: true, clientMessageId: crypto.randomUUID() };
      } catch (transportErr) {
        // ── Step 7: Transport failure — restore converting files to ready ────
        // Files that failed conversion remain "failed" (user must remove/retry).
        // Files that converted successfully but whose transport failed go back to "ready"
        // so the user can retry the whole send without reselecting.
        const stillConverting = readyIds.filter(id => !failedConversionIds.includes(id));
        if (stillConverting.length > 0) {
          submission.onRestoreToReady?.(stillConverting);
        }

        return {
          ok: false,
          error: {
            code: "TRANSPORT_FAILED",
            message:
              transportErr instanceof Error ? transportErr.message : "Send failed",
          },
          failedAttachmentIds: failedConversionIds,
        };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nexusChatStream.send, canSend],
  );

  return {
    submit,
    canSend,
    messages: nexusChatStream.messages,
    setMessages: nexusChatStream.setMessages,
    isStreaming: nexusChatStream.isStreaming,
    isPending: nexusChatStream.isPending,
    liveStep: nexusChatStream.liveStep,
    liveSteps: nexusChatStream.liveSteps,
    activeRunId: nexusChatStream.activeRunId,
    shapingPayload: nexusChatStream.shapingPayload,
    setShapingPayload: nexusChatStream.setShapingPayload,
    shapingHeld: nexusChatStream.shapingHeld,
    setShapingHeld: nexusChatStream.setShapingHeld,
    handoffSignal: nexusChatStream.handoffSignal,
    abort: nexusChatStream.abort,
    clearMessages: nexusChatStream.clearMessages,
    pendingAuthorization: nexusChatStream.pendingAuthorization,
    authorizeRun: nexusChatStream.authorizeRun,
  };
}
