/**
 * useMessageAttachments — load persisted chips for a sent message.
 * Shared by Ask Joy and Workspace message renderers.
 */
import { useQuery } from "@tanstack/react-query";
import {
  httpAttachmentAdapter,
  type AttachmentAdapter,
} from "@/lib/attachments/adapter";
import type { PersistedAttachment } from "@/lib/attachments/types";

export function useMessageAttachments(
  messageId: string | null | undefined,
  adapter: AttachmentAdapter = httpAttachmentAdapter,
) {
  return useQuery<PersistedAttachment[]>({
    queryKey: ["message-attachments", messageId],
    enabled: !!messageId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!messageId) return [];
      return adapter.listForMessage(messageId);
    },
  });
}
