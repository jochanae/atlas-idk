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
 * B2 scope: StagedFile[] → temporary inline base64 transport conversion.
 *   Surfaces pass stagedAttachments: StagedFile[] to submit().
 *   This controller converts ready staged files to { base64, mediaType, name }
 *   via fileToBase64Safe — the ONLY place this conversion occurs in the codebase.
 *   The inline base64 shape is intentionally temporary. B3/C will replace it
 *   with storage-backed attachment URLs without changing surface call sites.
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
import type { StagedFile } from "./useStagedAttachments";

export type AtlasConversationAttachment = {
  base64: string;
  mediaType: string;
  name?: string;
};

export type AtlasConversationSubmission = {
  /** Raw user text; the controller trims it. */
  text: string;
  /**
   * B2 staged files — passed from surfaces that use useStagedAttachments.
   * The controller converts ready files to inline base64 transport inside submit().
   * Surfaces must NOT perform this conversion themselves.
   */
  stagedAttachments?: StagedFile[];
  /**
   * B1 / legacy pass-through: already-converted attachment data.
   * Used by non-staged call sites (opening-message sessionStorage handoffs,
   * auto-continue, suggestion chips). Will be removed once all call sites
   * migrate to stagedAttachments in B3/C.
   */
  attachments?: AtlasConversationAttachment[];
};

export type AtlasConversationConfig = {
  surface: "ask-atlas" | "workspace";
  focusProjectId?: number | null;
  /**
   * The active conversation thread ID.
   * - Workspace: managed by workspace.tsx (derived from localStorage or URL param).
   * - Ask Atlas: managed by home.tsx (askAtlasConversationId state).
   */
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
   * Always returns a Promise — never null — so callers can chain .finally().
   * The controller validates, normalises, converts staged attachments to transport,
   * and calls nexusChatStream.send directly.
   * No surface adapter may intercept or reconstruct the submission payload.
   */
  submit: (submission: AtlasConversationSubmission) => Promise<void>;
  /** True when a new turn may begin (not streaming, not pending). */
  canSend: boolean;
  // Full stream state — exposed so surfaces and the workspace bridge can bind to it.
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
    async (submission: AtlasConversationSubmission): Promise<void> => {
      const trimmed = submission.text.trim();

      // Pre-check: bail immediately if clearly nothing to send.
      const hasStagedFiles = (submission.stagedAttachments?.length ?? 0) > 0;
      const hasPassthrough = (submission.attachments?.length ?? 0) > 0;
      if ((trimmed.length === 0 && !hasStagedFiles && !hasPassthrough) || !canSend) {
        return;
      }

      // ── B2: Convert staged files → temporary inline base64 transport ─────────
      // This is the ONLY place in the codebase where StagedFile → base64 occurs.
      // Surfaces snapshot readyFiles and clear staged state before calling submit(),
      // so failed conversions drop that file without restoring the draft (the
      // directive: "failed conversion preserves the draft and unaffected files"
      // is enforced at the surface level by the snapshot-then-clear pattern).
      const transported: AtlasConversationAttachment[] = [];
      for (const sf of (submission.stagedAttachments ?? [])) {
        if (sf.status !== "ready") continue;
        try {
          const result = await fileToBase64Safe(sf.file);
          transported.push({ base64: result.base64, mediaType: result.mediaType, name: sf.name });
        } catch {
          // Conversion failed for this file — proceed without it.
        }
      }

      const allAttachments: AtlasConversationAttachment[] = [
        ...transported,
        ...(submission.attachments ?? []),
      ];

      // Re-check after conversion (all staged files may have failed).
      const hasFinalContent = trimmed.length > 0 || allAttachments.length > 0;
      if (!hasFinalContent) return;

      // One canonical call. No field extraction, no surface adapter, no reconstruction.
      await (nexusChatStream.send({
        text: trimmed,
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      }) ?? Promise.resolve());
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
