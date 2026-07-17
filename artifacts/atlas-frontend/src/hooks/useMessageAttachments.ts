import { useCallback, useEffect, useRef, useState } from "react";
import {
  httpAttachmentAdapter,
  type AttachmentAdapter,
} from "@/lib/attachments/adapter";
import { isAttachmentFlagOn } from "@/lib/attachments/flags";
import type { PersistedAttachment } from "@/lib/attachments/types";

/**
 * Lightweight fetcher for per-message attachment metadata.
 *
 * No React Query dependency — the surface is dead-simple (one GET keyed by
 * messageId) and Atlas surfaces mount and unmount around this hook frequently.
 * Callers pass an explicit adapter so tests can inject the mock; the default
 * is the HTTP adapter, gated by the persistence flag.
 *
 * Returns [] when:
 *   - messageId is null/empty
 *   - the persistence flag is off
 *   - the fetch fails (silent — chips are not core to message correctness)
 */
export function useMessageAttachments(
  messageId: string | null | undefined,
  opts?: { adapter?: AttachmentAdapter },
): {
  attachments: PersistedAttachment[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [attachments, setAttachments] = useState<PersistedAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const adapterRef = useRef<AttachmentAdapter>(
    opts?.adapter ?? httpAttachmentAdapter,
  );
  adapterRef.current = opts?.adapter ?? httpAttachmentAdapter;

  const load = useCallback(async () => {
    if (!messageId || !isAttachmentFlagOn("attachments.persistence")) {
      setAttachments([]);
      return;
    }
    setLoading(true);
    try {
      const list = await adapterRef.current.listForMessage(messageId);
      setAttachments(list);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { attachments, loading, refresh: load };
}
