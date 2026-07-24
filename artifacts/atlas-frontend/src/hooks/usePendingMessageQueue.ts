/**
 * Pending message queue — Cursor-style follow-ups while Joy is mid-run.
 *
 * While busy: new sends enqueue (FIFO).
 * User can reorder (move up/down), remove, or Send now (abort + promote).
 * When the run finishes: auto-dequeue and submit the next item.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type PendingQueueItem = {
  id: string;
  text: string;
  attachmentIds: string[];
  attachmentNames?: string[];
  createdAt: number;
};

export type PendingQueueEnqueueInput = {
  text: string;
  attachmentIds?: string[];
  attachmentNames?: string[];
};

export type PendingQueueSubmitArgs = {
  text: string;
  attachmentIds: string[];
};

type Options = {
  /** True when a new turn may begin. */
  canSend: boolean;
  /** True while a turn is pending or streaming. */
  busy: boolean;
  /** Canonical submit used for auto-dequeue and Send now. */
  submit: (args: PendingQueueSubmitArgs) => Promise<{ ok: boolean }>;
  /** Interrupt the current run (Send now). */
  abort: (opts?: { reason?: "newer_request" | "user_stop" }) => void;
};

function newId(): string {
  return `pq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function usePendingMessageQueue(options: Options) {
  const { canSend, busy, submit, abort } = options;
  const [items, setItems] = useState<PendingQueueItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const drainingRef = useRef(false);
  /** After a failed auto-drain, skip that item until Send now / reorder. */
  const skipAutoIdRef = useRef<string | null>(null);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const abortRef = useRef(abort);
  abortRef.current = abort;

  const setItemsSync = useCallback(
    (updater: (prev: PendingQueueItem[]) => PendingQueueItem[]) => {
      setItems((prev) => {
        const next = updater(prev);
        itemsRef.current = next;
        return next;
      });
    },
    [],
  );

  const enqueue = useCallback((input: PendingQueueEnqueueInput): PendingQueueItem | null => {
    const text = input.text.trim();
    const attachmentIds = (input.attachmentIds ?? []).filter(Boolean);
    if (!text && attachmentIds.length === 0) return null;
    const item: PendingQueueItem = {
      id: newId(),
      text,
      attachmentIds,
      attachmentNames: input.attachmentNames,
      createdAt: Date.now(),
    };
    setItemsSync((prev) => [...prev, item]);
    return item;
  }, [setItemsSync]);

  const remove = useCallback((id: string) => {
    setItemsSync((prev) => prev.filter((i) => i.id !== id));
  }, [setItemsSync]);

  const moveUp = useCallback((id: string) => {
    setItemsSync((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [row] = next.splice(idx, 1);
      next.splice(idx - 1, 0, row);
      return next;
    });
  }, [setItemsSync]);

  const moveDown = useCallback((id: string) => {
    setItemsSync((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      const [row] = next.splice(idx, 1);
      next.splice(idx + 1, 0, row);
      return next;
    });
  }, [setItemsSync]);

  const promoteToFront = useCallback((id: string) => {
    setItemsSync((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [row] = next.splice(idx, 1);
      next.unshift(row);
      return next;
    });
  }, [setItemsSync]);

  const busyRef = useRef(busy);
  busyRef.current = busy;
  const canSendRef = useRef(canSend);
  canSendRef.current = canSend;

  const drainNext = useCallback(async (opts?: { force?: boolean }) => {
    if (drainingRef.current) return;
    if (!opts?.force && (busyRef.current || !canSendRef.current)) return;
    const head = itemsRef.current[0];
    if (!head) return;
    if (!opts?.force && head.id === skipAutoIdRef.current) return;
    drainingRef.current = true;
    // Remove before submit so a failed send does not infinite-loop the same item.
    setItemsSync((prev) => prev.filter((i) => i.id !== head.id));
    try {
      const result = await submitRef.current({
        text: head.text,
        attachmentIds: head.attachmentIds,
      });
      if (!result.ok) {
        skipAutoIdRef.current = head.id;
        // Put it back at the front so the user can retry via Send now.
        setItemsSync((prev) => [head, ...prev]);
      } else if (skipAutoIdRef.current === head.id) {
        skipAutoIdRef.current = null;
      }
      // One item per idle window. The next queued message drains when the
      // turn finishes (busy → idle), via the effect below.
    } catch {
      skipAutoIdRef.current = head.id;
      setItemsSync((prev) => [head, ...prev]);
    } finally {
      drainingRef.current = false;
    }
  }, [setItemsSync]);

  // Auto-dequeue when Joy becomes idle.
  useEffect(() => {
    if (busy || !canSend) return;
    if (items.length === 0) return;
    if (drainingRef.current) return;
    if (items[0]?.id === skipAutoIdRef.current) return;
    void drainNext();
  }, [busy, canSend, items, drainNext]);

  /**
   * Send now: interrupt the current run, promote this item to front, then drain.
   */
  const sendNow = useCallback(
    (id: string) => {
      const exists = itemsRef.current.some((i) => i.id === id);
      if (!exists) return;
      skipAutoIdRef.current = null;
      promoteToFront(id);
      if (busy) {
        abortRef.current({ reason: "newer_request" });
      }
      // Force drain — abort clears busy on next render; don't wait on stale refs.
      window.setTimeout(() => {
        if (!drainingRef.current && itemsRef.current[0]?.id === id) {
          void drainNext({ force: true });
        }
      }, 0);
    },
    [busy, promoteToFront, drainNext],
  );

  /**
   * If idle → submit immediately (returns "sent").
   * If busy → enqueue (returns "queued").
   */
  const sendOrEnqueue = useCallback(
    async (
      input: PendingQueueEnqueueInput,
      immediateSubmit: (args: PendingQueueSubmitArgs) => Promise<{ ok: boolean }>,
    ): Promise<"sent" | "queued" | "empty"> => {
      const text = input.text.trim();
      const attachmentIds = (input.attachmentIds ?? []).filter(Boolean);
      if (!text && attachmentIds.length === 0) return "empty";

      if (!busy && canSend) {
        const result = await immediateSubmit({ text, attachmentIds });
        return result.ok ? "sent" : "queued";
      }

      enqueue({
        text,
        attachmentIds,
        attachmentNames: input.attachmentNames,
      });
      return "queued";
    },
    [busy, canSend, enqueue],
  );

  return {
    items,
    enqueue,
    remove,
    moveUp,
    moveDown,
    sendNow,
    sendOrEnqueue,
    clear: () => setItemsSync(() => []),
  };
}
