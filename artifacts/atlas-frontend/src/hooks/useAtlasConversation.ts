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
 * B2 will add StagedAttachment[] processing inside this controller.
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

export type AtlasConversationAttachment = {
  base64: string;
  mediaType: string;
  name?: string;
};

export type AtlasConversationSubmission = {
  /** Raw user text; the controller trims it. */
  text: string;
  /**
   * B1 pass-through: already-converted attachment data from the surface.
   * Surfaces own staging and file-to-base64 conversion until B2.
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
   * The controller validates, normalises, and calls nexusChatStream.send directly.
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
    (submission: AtlasConversationSubmission): Promise<void> => {
      const trimmed = submission.text.trim();
      const hasAttachments = (submission.attachments?.length ?? 0) > 0;
      const hasContent = trimmed.length > 0 || hasAttachments;
      // Gate: empty or busy — return a resolved promise so callers can always
      // chain .finally() without null-checking.
      if (!hasContent || !canSend) return Promise.resolve();
      // One canonical call. The canonical submission object is passed directly
      // to nexusChatStream.send — no field extraction, no surface adapter.
      return nexusChatStream.send({ text: trimmed, attachments: submission.attachments }) ?? Promise.resolve();
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
