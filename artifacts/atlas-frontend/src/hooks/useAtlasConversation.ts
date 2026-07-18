/**
 * useAtlasConversation — Surface-neutral conversation controller.
 *
 * Both Ask Atlas and Workspace instantiate this hook and call `submit` to
 * initiate a user turn. The hook owns:
 *   - send eligibility gate (non-empty content, not already sending)
 *   - text normalisation (trim)
 *   - canonical transport invocation (nexusSend)
 *   - pending / canSend state
 *
 * B1 scope: text + pass-through attachments.
 * B2 will add StagedAttachment[] processing inside this controller.
 */
import { useCallback } from "react";

export type AtlasConversationSubmission = {
  /** Raw user text; the controller trims it before sending. */
  text: string;
  /**
   * B1 pass-through: already-converted attachment data from the surface layer.
   * Surfaces continue to own staging and file-to-base64 conversion until B2.
   * B2 will replace this with StagedAttachment[] processed here.
   */
  attachments?: Array<{ base64: string; mediaType: string; name?: string }>;
};

export type AtlasConversationOptions = {
  /** Which surface is instantiating the controller (informational; gates future behaviour). */
  surface: "ask-atlas" | "workspace";
  /**
   * The canonical Nexus transport.  Both surfaces wire their
   * useNexusChatStream.send (or bridge-equivalent) here.
   * Must POST to /api/nexus/chat and return a Promise when available.
   */
  nexusSend: (opts: {
    text: string;
    attachments?: Array<{ base64: string; mediaType: string; name?: string }>;
  }) => Promise<void> | void;
  /** True when a turn is currently in flight — gates submit eligibility. */
  isSending: boolean;
};

export type AtlasConversation = {
  /**
   * Canonical user-initiated send.  Both Ask Atlas and Workspace call this.
   * Returns a Promise so callers can chain .finally() for in-flight tracking.
   */
  submit: (submission: AtlasConversationSubmission) => Promise<void>;
  /** True when submit is allowed (content is non-empty and no turn is in flight). */
  canSend: boolean;
  /** Mirror of isSending passed in opts — exposed for convenience. */
  isSending: boolean;
};

export function useAtlasConversation(opts: AtlasConversationOptions): AtlasConversation {
  const { nexusSend, isSending } = opts;

  const submit = useCallback(
    async ({ text, attachments }: AtlasConversationSubmission): Promise<void> => {
      const trimmed = text.trim();
      const hasAttachments = (attachments?.length ?? 0) > 0;
      const hasContent = trimmed.length > 0 || hasAttachments;
      if (!hasContent || isSending) return;
      await nexusSend({ text: trimmed, attachments });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nexusSend, isSending],
  );

  return { submit, canSend: !isSending, isSending };
}
