import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useListMessages } from "@/_workspace/api-client-react/src/generated/api";

type PriorMessage = NonNullable<ReturnType<typeof useListMessages>["data"]>[number];

export interface UseChatStreamOptions<T> {
  sessionId: number | null;
  mapPriorMessage: (m: PriorMessage) => T;
}

export interface UseChatStreamReturn<T> {
  messages: T[];
  setMessages: Dispatch<SetStateAction<T[]>>;
  messagesRef: MutableRefObject<T[]>;
  historyMsgCountRef: MutableRefObject<number>;
  priorLoadedRef: MutableRefObject<boolean>;
}

/**
 * B2a slice of the chat-stream extraction.
 *
 * Owns only message-list state and prior-message hydration. Does NOT own
 * sessionId, doSend, chatPending, activityStream, memoryChips, abort, or
 * any auto-prime effects — those move in later slices.
 */
export function useChatStream<T>(
  projectId: number | string | null | undefined,
  opts: UseChatStreamOptions<T>,
): UseChatStreamReturn<T> {
  const [messages, setMessages] = useState<T[]>([]);
  const messagesRef = useRef<T[]>([]);
  const priorLoadedRef = useRef(false);
  const historyMsgCountRef = useRef<number>(0);

  // Keep messagesRef synced (moved from workspace.tsx)
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Cross-project reset (messages + priorLoadedRef + historyMsgCountRef portion only).
  // Other resets (sessionId, planStates, chatPending, abort, auto-prime guards)
  // remain in workspace.tsx until later extraction slices.
  useEffect(() => {
    setMessages([]);
    priorLoadedRef.current = false;
    historyMsgCountRef.current = 0;
  }, [projectId]);

  // Prior-message hydration (moved from workspace.tsx).
  const { data: priorMessages } = useListMessages(opts.sessionId ?? 0, {
    query: { enabled: !!opts.sessionId, queryKey: ["messages", opts.sessionId] },
  });
  useEffect(() => {
    if (!priorMessages || priorMessages.length === 0 || priorLoadedRef.current || messages.length > 0) return;
    priorLoadedRef.current = true;
    historyMsgCountRef.current = priorMessages.length;
    setMessages(priorMessages.map(opts.mapPriorMessage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorMessages]);

  return { messages, setMessages, messagesRef, historyMsgCountRef, priorLoadedRef };
}
