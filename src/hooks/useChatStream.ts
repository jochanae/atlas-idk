import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  useListMessages,
  useCreateSession,
} from "@/_workspace/api-client-react/src/generated/api";
import type {
  Message,
  Session,
} from "@/_workspace/api-client-react/src/generated/api.schemas";

type PriorMessage = Message;

export interface UseChatStreamOptions<T> {
  sessions: Session[] | undefined;
  sessionsLoading: boolean;
  createSession: ReturnType<typeof useCreateSession>;
  queryClient: QueryClient;
  getListSessionsQueryKey: (projectId: number) => QueryKey;
  mapPriorMessage: (m: PriorMessage) => T;
}

export interface ActivityStreamState {
  active: boolean;
  content: string;
}

export interface UseChatStreamReturn<T> {
  messages: T[];
  setMessages: Dispatch<SetStateAction<T[]>>;
  messagesRef: MutableRefObject<T[]>;
  historyMsgCountRef: MutableRefObject<number>;
  priorLoadedRef: MutableRefObject<boolean>;
  sessionId: number | null;
  setSessionId: Dispatch<SetStateAction<number | null>>;
  ensureSessionId: () => Promise<number>;
  chatPending: boolean;
  setChatPending: Dispatch<SetStateAction<boolean>>;
  activityStream: ActivityStreamState;
  setActivityStream: Dispatch<SetStateAction<ActivityStreamState>>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  handleStop: () => void;
}

/**
 * Chat-stream hook — incremental extraction.
 *
 * Currently owns:
 *   - message-list state + prior-message hydration  (B2a)
 *   - sessionId state, creatingSessionRef, ensureSessionId, session-bootstrap effect  (B2b-1)
 *
 * Does NOT yet own: doSend, chatPending, activityStream, memoryChips,
 * abortControllerRef, handleStop, handleRegenerate, summarize effect,
 * auto-prime effects. Those move in later slices.
 */
export function useChatStream<T>(
  projectId: number,
  opts: UseChatStreamOptions<T>,
): UseChatStreamReturn<T> {
  const {
    sessions,
    sessionsLoading,
    createSession,
    queryClient,
    getListSessionsQueryKey,
    mapPriorMessage,
  } = opts;

  // ---- message state (B2a) ----
  const [messages, setMessages] = useState<T[]>([]);
  const messagesRef = useRef<T[]>([]);
  const priorLoadedRef = useRef(false);
  const historyMsgCountRef = useRef<number>(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ---- session state (B2b-1) ----
  const [sessionId, setSessionId] = useState<number | null>(null);
  const creatingSessionRef = useRef<Promise<number> | null>(null);

  // Cross-project reset for everything this hook owns.
  useEffect(() => {
    setMessages([]);
    priorLoadedRef.current = false;
    historyMsgCountRef.current = 0;
    setSessionId(null);
    creatingSessionRef.current = null;
  }, [projectId]);

  // Prior-message hydration.
  const { data: priorMessages } = useListMessages(sessionId ?? 0, {
    query: { enabled: !!sessionId, queryKey: ["messages", sessionId] },
  });
  useEffect(() => {
    if (!priorMessages || priorMessages.length === 0 || priorLoadedRef.current || messages.length > 0) return;
    priorLoadedRef.current = true;
    historyMsgCountRef.current = priorMessages.length;
    setMessages(priorMessages.map(mapPriorMessage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorMessages]);

  // ensureSessionId — create-on-demand with in-flight dedupe.
  const ensureSessionId = useCallback(async (): Promise<number> => {
    if (sessionId) return sessionId;
    if (!creatingSessionRef.current) {
      creatingSessionRef.current = createSession.mutateAsync(
        { projectId, data: { title: "Session", mode: "think" } }
      ).then((s) => {
        setSessionId(s.id);
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey(projectId) });
        return s.id;
      }).finally(() => {
        creatingSessionRef.current = null;
      });
    }
    return creatingSessionRef.current;
  }, [createSession, projectId, queryClient, getListSessionsQueryKey, sessionId]);

  // Session bootstrap — adopt existing or create one.
  useEffect(() => {
    if (sessionsLoading) return;
    if (sessions && sessions.length > 0) {
      if (!sessionId) setSessionId(sessions[0].id);
    } else if (!sessionId) {
      void ensureSessionId();
    }
  }, [ensureSessionId, sessionId, sessions, sessionsLoading]);

  return {
    messages,
    setMessages,
    messagesRef,
    historyMsgCountRef,
    priorLoadedRef,
    sessionId,
    setSessionId,
    ensureSessionId,
  };
}
