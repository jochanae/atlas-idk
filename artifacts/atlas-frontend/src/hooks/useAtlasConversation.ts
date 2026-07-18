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
 *
 * ── Canonical conversion path ────────────────────────────────────────────────
 * submit() is the ONE place where StagedFile → base64 conversion happens for
 * conversational sends. No other code in home.tsx or workspace.tsx may perform
 * fileToBase64Safe for a nexus/chat send.
 *
 * ── Success boundary of nexusChatStream.send() ───────────────────────────────
 * send() is async and resolves AFTER the full SSE stream session completes:
 *
 *   1. The optimistic user message (id: "user-${Date.now()}") is added to
 *      state SYNCHRONOUSLY inside send(), before any network call.
 *      lastSentUserMessageIdRef is set at the same time.
 *   2. `await stream("/api/nexus/chat", ...)` is called. The HTTP POST is made
 *      here. Attachment data travels in the request body.
 *   3. stream() resolves when the SSE session ends (last event received).
 *   4. send() itself then resolves.
 *
 * Failure modes:
 *   • Network failure (fetch throws, connection refused, DNS, timeout):
 *     stream() rejects → send() rejects → our catch fires → onRestoreToReady.
 *   • Server-side error reported via SSE onError callback:
 *     stream() resolves (not rejects) — server already received the payload.
 *     Our try block succeeds → onClearSent fires. Correct: server has the data.
 *   • send() returns undefined (internal guard — sendInFlight or isPending race):
 *     We detect undefined and short-circuit rather than calling ?? Promise.resolve(),
 *     which would incorrectly trigger onClearSent without any message having been sent.
 *
 * ── clientMessageId origin ───────────────────────────────────────────────────
 * clientMessageId comes from nexusChatStream.getLastSentMessageId(), a stable
 * getter backed by lastSentUserMessageIdRef set synchronously inside send()
 * before the network request. This is the actual id of the optimistic user
 * message ("user-${Date.now()}"), not an invented UUID.
 *
 * ── Partial-success semantics ────────────────────────────────────────────────
 * When some files convert and others fail:
 *   ok: true    → message sent; submittedAttachmentIds has the sent file ids;
 *                 failedAttachments has the failed files + their errors.
 *   ok: false   → message NOT sent; failedAttachments has all failed files.
 * Surfaces can distinguish "all sent" from "partially sent" via:
 *   result.submittedAttachmentIds.length === submission.stagedAttachments?.length
 *
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
 *
 * ok: true  — message was accepted by nexusChatStream.send().
 *   clientMessageId       — the optimistic user message id in the stream
 *                           (format: "user-${Date.now()}").  NOT a random UUID.
 *   submittedAttachmentIds — staged file ids whose base64 data was sent.
 *   failedAttachments     — staged files that failed conversion and remain
 *                           staged as "failed" for the user to see.
 *
 * ok: false — message was NOT sent (guard fired, all files failed, or transport
 *             failure).  failedAttachments identifies what failed conversion.
 *
 * Surfaces that fire-and-forget (void atlasConv.submit(...)) rely entirely on
 * the lifecycle callbacks (onMarkFailed, onClearSent, etc.) for UI feedback.
 * Surfaces that await submit() can also inspect the result for richer handling.
 */
export type SubmissionResult =
  | {
      ok: true;
      /** Actual optimistic message id set by nexusChatStream before the HTTP request. */
      clientMessageId: string;
      /** Staged file ids whose converted base64 data was included in the send payload. */
      submittedAttachmentIds: string[];
      /** Files that failed conversion; remain staged as "failed". Empty on full success. */
      failedAttachments: Array<{ id: string; error: StagedFileError }>;
    }
  | {
      ok: false;
      error: SubmissionError;
      /** Staged files that failed conversion, if any. */
      failedAttachments?: Array<{ id: string; error: StagedFileError }>;
    };

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
      // Each file is converted independently. A single file failure does NOT
      // abort the other files. Failures are recorded in failedAttachmentsForResult
      // (returned to the caller) AND reported via onMarkFailed (updates staged UI).
      const transported: Array<{ _stagedId: string } & AtlasConversationAttachment> = [];
      const failedConversionIds: string[] = [];
      const failedAttachmentsForResult: Array<{ id: string; error: StagedFileError }> = [];

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
          const err: StagedFileError = {
            code: "CONVERSION_FAILED",
            message: convErr instanceof Error ? convErr.message : "Could not read file",
            retryable: true,
          };
          failedConversionIds.push(sf.id);
          failedAttachmentsForResult.push({ id: sf.id, error: err });
          submission.onMarkFailed?.(sf.id, err);
        }
      }

      // ── Step 3: Build final attachment list ───────────────────────────────
      // Strip the internal _stagedId before handing to the transport layer.
      const transportedAttachments: AtlasConversationAttachment[] = transported.map(
        ({ _stagedId: _, ...rest }) => rest,
      );
      const allAttachments: AtlasConversationAttachment[] = [
        ...transportedAttachments,
        ...(submission.attachments ?? []),
      ];

      const hasFinalContent = trimmed.length > 0 || allAttachments.length > 0;

      // ── Step 4: Bail if nothing survived conversion ────────────────────────
      if (!hasFinalContent) {
        // All staged files failed conversion and there is no text or passthrough.
        // Files are already marked "failed" by onMarkFailed above. Any file that
        // is still "converting" (converted OK but somehow not in transported due
        // to a logic gap) is restored to "ready".
        const stillConverting = readyIds.filter(id => !failedConversionIds.includes(id));
        if (stillConverting.length > 0) {
          submission.onRestoreToReady?.(stillConverting);
        }
        return {
          ok: false,
          error: { code: "ALL_CONVERSIONS_FAILED", message: "No files could be converted" },
          failedAttachments: failedAttachmentsForResult,
        };
      }

      // ── Step 5: Attempt transport ─────────────────────────────────────────
      // IMPORTANT: nexusChatStream.send() can return undefined when its internal
      // guard fires (sendInFlight or isPending race between our canSend check and
      // the send call). We detect this explicitly rather than resolving via
      // `?? Promise.resolve()`, which would incorrectly call onClearSent without
      // any message having been sent.
      const sendPromise = nexusChatStream.send({
        text: trimmed,
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      });

      if (sendPromise === undefined) {
        // send() guard fired — stream is already in-flight or pending.
        // Restore all converting files (none have failed conversion) to "ready".
        const stillConverting = readyIds.filter(id => !failedConversionIds.includes(id));
        if (stillConverting.length > 0) {
          submission.onRestoreToReady?.(stillConverting);
        }
        return {
          ok: false,
          error: { code: "STREAM_BUSY", message: "A send is already in progress" },
          failedAttachments: failedAttachmentsForResult,
        };
      }

      try {
        await sendPromise;

        // ── Step 6: Confirmed success ─────────────────────────────────────
        // stream() resolved → the SSE session completed.  The server received
        // the HTTP POST (including all attachment data) before the first SSE
        // token was sent.  Clearing staged files at this point is safe because:
        //   a) The optimistic user message already owns the base64 data
        //      (stored in message.attachments — UserBubble reads from there,
        //      not from staged previewUrl).
        //   b) The server has the attachment data regardless of whether the
        //      SSE response contained an error.
        const sentIds = transported.map(a => a._stagedId);
        if (sentIds.length > 0) {
          submission.onClearSent?.(sentIds);
        }

        // clientMessageId: the actual optimistic user message id set synchronously
        // in send() before the network request (format: "user-${Date.now()}").
        // getLastSentMessageId() reads lastSentUserMessageIdRef — a mutable ref,
        // not a React state snapshot — so it reflects the value set during this
        // specific send() call even if the component has re-rendered.
        const clientMessageId =
          nexusChatStream.getLastSentMessageId() ?? `user-${Date.now()}`;

        return {
          ok: true,
          clientMessageId,
          submittedAttachmentIds: sentIds,
          failedAttachments: failedAttachmentsForResult,
        };
      } catch (transportErr) {
        // ── Step 7: Network-level transport failure ───────────────────────
        // stream() rejected — the HTTP request failed before the server could
        // acknowledge it (connection refused, DNS failure, fetch abort, timeout).
        // Files that converted successfully are still in "converting" state;
        // restore them to "ready" so the user can retry without reselecting.
        // Files already marked "failed" (conversion errors) remain "failed".
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
          failedAttachments: failedAttachmentsForResult,
        };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nexusChatStream.send, nexusChatStream.getLastSentMessageId, canSend],
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
