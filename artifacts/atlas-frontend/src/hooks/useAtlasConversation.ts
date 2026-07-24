/**
 * useAtlasConversation — Surface-neutral conversation controller.
 *
 * Owns useNexusChatStream directly. Both Ask Joy and Workspace instantiate
 * this hook. The controller calls nexusChatStream.send({ text, attachmentIds })
 * with the canonical submission object — no surface adapter, no field
 * extraction. Nothing between submit() and the transport may remove or
 * reconstruct fields.
 *
 * ── Canonical attachment path ────────────────────────────────────────────────
 * Staged files are uploaded by useStagedAttachments (shared upload service).
 * submit() sends server attachmentIds only. Surfaces must not convert files
 * or invent payload shapes.
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
 * Storage-layer persistence (server-side attachment URLs, database migrations)
 * is intentionally deferred and does not belong in this controller.
 */
import { useCallback, useRef } from "react";
import {
  useNexusChatStream,
  type NexusMessage,
  type NexusLiveStep,
  type NexusShapingPayload,
  type NexusHandoffSignal,
  type UseNexusChatStreamOptions,
} from "./useNexusChatStream";
import type { StagedAttachment, StagedFileError } from "./useStagedAttachments";
import { shouldIncludeAttachmentsOnSend } from "@/lib/attachments/types";
import { logEvent as _adbgLog } from "@/lib/attachDebugLog";

// ─── Types ────────────────────────────────────────────────────────────────────

/** @deprecated Inline base64 passthrough — prefer staged attachmentIds. */
export type AtlasConversationAttachment = {
  base64?: string;
  mediaType: string;
  name?: string;
  clientAttachmentId?: string;
  attachmentId?: string;
  contentUrl?: string;
  processingStatus?: string;
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
   * Staged files from useStagedAttachments. Ready files must already have
   * attachmentId from the shared upload service. Surfaces must NOT clear
   * staged state before awaiting submit().
   */
  stagedAttachments?: StagedAttachment[];
  /**
   * Optional pre-uploaded attachment IDs (e.g. home→workspace handoff).
   * Merged with IDs from stagedAttachments.
   */
  attachmentIds?: string[];
  /**
   * Display-only passthrough for optimistic chips (opening-message handoff).
   * Never sent as inline base64 to the server when attachmentIds are present.
   */
  attachments?: AtlasConversationAttachment[];
  /**
   * INT-13: hide internal handoff kickoff from the visible Workspace transcript
   * while still sending it (with prior history) to the model.
   */
  hiddenFromUi?: boolean;

  onMarkConverting?: (ids: string[]) => void;
  onMarkFailed?: (id: string, error: StagedFileError) => void;
  onMarkSending?: (ids: string[]) => void;
  onRestoreToReady?: (ids: string[]) => void;
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
  /** Milestone 2.3 Phase A — canonical perspective for Nexus. */
  perspective?: UseNexusChatStreamOptions["perspective"];
  /** Scenario modifier — changes assumptions, not lens identity. */
  speculate?: boolean;
};

export type AtlasConversation = {
  /**
   * Canonical user-initiated send. Called from both Ask Joy and Workspace.
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
  abort: (opts?: { reason?: "newer_request" | "user_stop" }) => void;
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
    perspective: config.perspective,
    speculate: config.speculate,
  });

  const canSend = !nexusChatStream.isPending && !nexusChatStream.isStreaming;
  const submitInFlightRef = useRef(false);

  const submit = useCallback(
    async (submission: AtlasConversationSubmission): Promise<SubmissionResult> => {
      // One message submission despite repeated Send taps.
      if (submitInFlightRef.current || !canSend) {
        return {
          ok: false,
          error: { code: "STREAM_BUSY", message: "A send is already in progress" },
        };
      }

      const trimmed = submission.text.trim();
      const staged = submission.stagedAttachments ?? [];
      const readyStaged = staged.filter(
        (sf) => sf.status === "ready" && !!sf.attachmentId,
      );
      const missingId = staged.filter(
        (sf) => sf.status === "ready" && !sf.attachmentId,
      );
      const failedAttachmentsForResult: Array<{ id: string; error: StagedFileError }> = [];

      for (const sf of missingId) {
        const err: StagedFileError = {
          code: "NOT_UPLOADED",
          message: "File is not uploaded yet",
          retryable: true,
        };
        failedAttachmentsForResult.push({ id: sf.id, error: err });
        submission.onMarkFailed?.(sf.id, err);
      }

      const stagedIds = readyStaged.map((sf) => sf.attachmentId!).filter(Boolean);
      const passthroughIds = (submission.attachmentIds ?? []).filter(Boolean);
      const attachmentIds = [...new Set([...stagedIds, ...passthroughIds])];

      const gate = shouldIncludeAttachmentsOnSend({
        text: trimmed,
        attachmentCount: attachmentIds.length,
      });
      if (!gate.ok) {
        return {
          ok: false,
          error: { code: "NO_CONTENT", message: "Nothing to send or not ready" },
          failedAttachments: failedAttachmentsForResult,
        };
      }

      const readyIds = readyStaged.map((sf) => sf.id);
      submission.onMarkConverting?.(readyIds);

      // Optimistic display metadata from staged files (no inline base64 transport).
      const displayAttachments: AtlasConversationAttachment[] = [
        ...readyStaged.map((sf) => ({
          mediaType: sf.mimeType,
          name: sf.name,
          clientAttachmentId: sf.id,
          attachmentId: sf.attachmentId ?? undefined,
          contentUrl: sf.previewUrl ?? undefined,
          processingStatus: sf.processingStatus ?? undefined,
        })),
        ...(submission.attachments ?? []).map((a) => ({
          mediaType: a.mediaType,
          name: a.name,
          clientAttachmentId: a.clientAttachmentId,
          attachmentId: a.attachmentId,
          contentUrl: a.contentUrl,
          processingStatus: a.processingStatus,
          // Keep base64 only for rare display-only handoff previews.
          base64: a.base64,
        })),
      ];

      submitInFlightRef.current = true;
      for (const sf of readyStaged) {
        _adbgLog("message_submit", {
          id: sf.id,
          attachmentIdsCount: attachmentIds.length,
          attachmentId: sf.attachmentId,
          name: sf.name,
        });
      }
      const sendResult = nexusChatStream.send({
        text: trimmed,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        attachments:
          displayAttachments.length > 0 ? displayAttachments : undefined,
        hiddenFromUi: submission.hiddenFromUi === true,
      });

      if (sendResult === undefined) {
        submitInFlightRef.current = false;
        if (readyIds.length > 0) submission.onRestoreToReady?.(readyIds);
        return {
          ok: false,
          error: { code: "STREAM_BUSY", message: "A send is already in progress" },
          failedAttachments: failedAttachmentsForResult,
        };
      }

      const { clientMessageId, accepted: sendAccepted } = sendResult;
      if (readyIds.length > 0) submission.onMarkSending?.(readyIds);

      try {
        await sendAccepted;
        for (const sf of readyStaged) {
          _adbgLog("message_link", {
            id: sf.id,
            attachmentId: sf.attachmentId,
            clientMessageId,
          });
        }
        if (readyIds.length > 0) submission.onClearSent?.(readyIds);
        return {
          ok: true,
          clientMessageId,
          submittedAttachmentIds: readyIds,
          failedAttachments: failedAttachmentsForResult,
        };
      } catch (transportErr) {
        if (readyIds.length > 0) submission.onRestoreToReady?.(readyIds);
        return {
          ok: false,
          error: {
            code: "TRANSPORT_FAILED",
            message:
              transportErr instanceof Error ? transportErr.message : "Send failed",
          },
          failedAttachments: failedAttachmentsForResult,
        };
      } finally {
        submitInFlightRef.current = false;
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
