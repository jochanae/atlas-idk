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
import type {
  ChatMessage,
  MemoryChip,
  CatchPayload,
  FileEdit,
  LinePatch,
  AmbientSurface,
  ProjectScan,
} from "@/pages/workspace";
import type { Plan } from "@/lib/plan";
import type { WorkspaceLens } from "@/hooks/useChatLens";
import { loadProfile, profileToString } from "@/lib/userProfile";

type PriorMessage = Message;

type LedgerEntryLike = { id: number | string; title: string; status: string };

export interface UseChatStreamOptions {
  sessions: Session[] | undefined;
  sessionsLoading: boolean;
  createSession: ReturnType<typeof useCreateSession>;
  queryClient: QueryClient;
  getListSessionsQueryKey: (projectId: number) => QueryKey;
  mapPriorMessage: (m: PriorMessage) => ChatMessage;

  // B2c deps
  entries: LedgerEntryLike[] | undefined;
  fileContext: string | null;
  forgeContext: string | null;
  sendCtxRef: MutableRefObject<{ wsLens: WorkspaceLens; wsModel: string }>;
  setDetectedLens: Dispatch<SetStateAction<WorkspaceLens | null>>;
  setScenarioBuffer: Dispatch<SetStateAction<Array<{ role: string; content: string }>>>;
  setLeftTab: Dispatch<SetStateAction<"chat" | "diff" | "blueprints" | "terminal">>;
  setMobileTab: Dispatch<SetStateAction<string>>;
  setActiveCatch: Dispatch<SetStateAction<CatchPayload | null>>;
  setPendingResolvedNodeIds: Dispatch<SetStateAction<string[]>>;
  setAutoNameKey: Dispatch<SetStateAction<number>>;
  playCatch: () => void;
  getGetProjectQueryKey: (projectId: number) => QueryKey;
  getListProjectsQueryKey: () => QueryKey;
  reportError: (err: unknown, ctx?: { projectId?: number }) => void;
}

export interface ActivityStreamState {
  active: boolean;
  content: string;
}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  messagesRef: MutableRefObject<ChatMessage[]>;
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
  memoryChips: MemoryChip[];
  setMemoryChips: Dispatch<SetStateAction<MemoryChip[]>>;
  doSend: (
    text: string,
    sid: number,
    currentMessages: ChatMessage[],
    ctx?: string | null,
    imageData?: { base64: string; mediaType: string },
  ) => void;
  handleRegenerate: (assistantMsgIndex: number) => void;
}

/**
 * Chat-stream hook — owns message state, session, pending/activity, memory chips,
 * doSend, handleRegenerate, and the per-session summarize effect.
 */
export function useChatStream(
  projectId: number,
  opts: UseChatStreamOptions,
): UseChatStreamReturn {
  const {
    sessions,
    sessionsLoading,
    createSession,
    queryClient,
    getListSessionsQueryKey,
    mapPriorMessage,
    entries,
    fileContext,
    forgeContext,
    sendCtxRef,
    setDetectedLens,
    setScenarioBuffer,
    setLeftTab,
    setMobileTab,
    setActiveCatch,
    setPendingResolvedNodeIds,
    setAutoNameKey,
    playCatch,
    getGetProjectQueryKey,
    getListProjectsQueryKey,
    reportError,
  } = opts;

  // ---- message state ----
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const priorLoadedRef = useRef(false);
  const historyMsgCountRef = useRef<number>(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ---- session state ----
  const [sessionId, setSessionId] = useState<number | null>(null);
  const creatingSessionRef = useRef<Promise<number> | null>(null);

  // ---- chat-pending / activity stream / abort ----
  const [chatPending, setChatPending] = useState(false);
  const [activityStream, setActivityStream] = useState<ActivityStreamState>({ active: false, content: "" });
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ---- memory chips (B2c) ----
  const [memoryChips, setMemoryChips] = useState<MemoryChip[]>([]);

  // Cross-project reset.
  useEffect(() => {
    setMessages([]);
    priorLoadedRef.current = false;
    historyMsgCountRef.current = 0;
    setSessionId(null);
    creatingSessionRef.current = null;
    try { abortControllerRef.current?.abort(); } catch { /* noop */ }
    abortControllerRef.current = null;
    setChatPending(false);
    setActivityStream({ active: false, content: "" });
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

  useEffect(() => {
    if (sessionsLoading) return;
    if (sessions && sessions.length > 0) {
      if (!sessionId) setSessionId(sessions[0].id);
    } else if (!sessionId) {
      void ensureSessionId();
    }
  }, [ensureSessionId, sessionId, sessions, sessionsLoading]);

  // ---- doSend (B2c) ----
  const doSend = useCallback(
    (
      text: string,
      sid: number,
      currentMessages: ChatMessage[],
      ctx?: string | null,
      imageData?: { base64: string; mediaType: string },
    ) => {
      const userMsg: ChatMessage = { role: "user", content: text, sentAt: new Date().toISOString() };
      const history = currentMessages.map((m) => ({ role: m.role, content: m.content }));
      const ledgerEntries = (entries || []).map((e) => ({ id: e.id, title: e.title, status: e.status }));
      const activeCtx = ctx !== undefined ? ctx : fileContext;

      setMessages((prev) => [...prev, userMsg]);
      setChatPending(true);
      setActivityStream({ active: true, content: "" });

      const userProfileStr = profileToString(loadProfile());

      // Read cached project scan from localStorage and send as compact map string
      let projectMap: string | undefined;
      try {
        const rawScan = localStorage.getItem(`atlas-scan-${projectId}`);
        if (rawScan) {
          const s = JSON.parse(rawScan) as ProjectScan;
          const lines = [
            `Repo: ${s.repo} (scanned ${s.scannedAt?.slice(0, 10) ?? "recently"})`,
            s.description ? `What it does: ${s.description}` : "",
            s.stack?.length ? `Stack: ${s.stack.join(", ")}` : "",
            s.routes?.length ? `Routes (${s.routes.length}): ${s.routes.slice(0, 15).join(", ")}` : "",
            s.pages?.length ? `Pages: ${s.pages.slice(0, 12).join(", ")}` : "",
            s.components?.length ? `Components: ${s.components.slice(0, 12).join(", ")}` : "",
            s.tables?.length ? `DB Tables: ${s.tables.join(", ")}` : "",
            `Auth: ${s.authEnabled ? "enabled" : "not found"}`,
            `Total files: ${s.totalFiles}`,
            s.summary ? `Summary: ${s.summary}` : "",
          ].filter(Boolean).join("\n");
          if (lines.trim()) projectMap = lines;
        }
      } catch { /* non-fatal */ }

      const lensCtx = sendCtxRef.current;
      const isScenario = lensCtx.wsLens === "scenario";
      const body = {
        sessionId: sid,
        projectId,
        message: text,
        model: lensCtx.wsModel,
        workspaceLens: lensCtx.wsLens,
        scenarioMode: isScenario,
        history,
        entries: ledgerEntries,
        ...(activeCtx ? { fileContext: activeCtx } : {}),
        ...(userProfileStr ? { userProfile: userProfileStr } : {}),
        ...(projectMap ? { projectMap } : {}),
        ...(imageData ? { imageData } : {}),
        ...(forgeContext ? { forgeContext } : {}),
      };

      const controller = new AbortController();
      abortControllerRef.current = controller;

      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((res) => {
          if (res.content && typeof res.content === "string") {
            const driftMatch = res.content.match(/LENS_DRIFT:\s*(flow|build|look|scenario)/i);
            if (driftMatch) {
              const drifted = driftMatch[1].toLowerCase() as WorkspaceLens;
              if (drifted !== sendCtxRef.current.wsLens) {
                setDetectedLens(drifted);
              }
              res.content = res.content.replace(/\n?LENS_DRIFT:\s*(flow|build|look|scenario)\s*$/i, "").trim();
            } else {
              setDetectedLens(null);
            }
          }
          const cp = res.catchPayload as CatchPayload | null;
          const fes = (res.fileEdits ?? (res.fileEdit ? [res.fileEdit] : [])) as FileEdit[];
          const lps = (res.linePatches ?? []) as LinePatch[];
          const aff = (res.autoFetchedFiles ?? []) as string[];
          setActivityStream({
            active: true,
            content: [
              res.content ?? "",
              res.plan?.mode === "blueprint" ? "BLUEPRINT" : res.plan ? "PLAN" : "",
              aff.length > 0 ? "FILE_READ" : "",
              fes.length > 0 ? "FILE_EDIT" : "",
              lps.length > 0 ? "LINE_PATCH" : "",
            ].filter(Boolean).join("\n"),
          });
          const rawChips = (res.memoryChips ?? []) as Array<string | MemoryChip>;
          const normalizedChips: MemoryChip[] = rawChips.map((c) =>
            typeof c === "string" ? { label: c } : c
          );
          setMessages((prev) => [...prev, {
            id: res.messageId, role: "assistant",
            content: res.content, intentType: res.intentType, catchPayload: cp,
            ...(res.plan ? { plan: res.plan as Plan } : {}),
            sentAt: new Date().toISOString(),
            model: res.model ?? sendCtxRef.current.wsModel,
            isDeepDive: !!res.isDeepDive,
            ...(fes.length > 0 ? { fileEdits: fes, fileEdit: fes[0] } : {}),
            ...(lps.length > 0 ? { linePatches: lps } : {}),
            ...(normalizedChips.length > 0 ? { memoryChips: normalizedChips } : {}),
            ...(res.imageB64 ? { imageB64: res.imageB64, imageMimeType: res.imageMimeType } : {}),
            ...(aff.length > 0 ? { autoFetchedFiles: aff } : {}),
            surface: (res.surface ?? null) as AmbientSurface,
          }]);
          if (isScenario) {
            setScenarioBuffer((prev) => [
              ...prev,
              { role: "user", content: text },
              { role: "assistant", content: res.content ?? "" },
            ]);
          }
          if (fes && fes.length > 0) {
            setLeftTab("diff");
            setMobileTab("preview");
          }
          if (cp) { playCatch(); setActiveCatch(cp); }
          if (normalizedChips.length > 0) {
            setMemoryChips((prev) => {
              const merged = [...prev];
              for (const c of normalizedChips) {
                if (!merged.some((m) => m.label === c.label)) merged.push(c);
              }
              return merged.slice(-12);
            });
          }
          if (res.resolvedNodes && res.resolvedNodes.length > 0) {
            setPendingResolvedNodeIds((prev) => {
              const merged = [...prev];
              for (const nodeId of res.resolvedNodes as string[]) {
                if (!merged.includes(nodeId)) merged.push(nodeId);
              }
              return merged;
            });
          }
          if (res.autoName && typeof res.autoName === "string") {
            setAutoNameKey((k) => k + 1);
            queryClient.setQueryData(getGetProjectQueryKey(projectId), (old: unknown) => {
              if (old && typeof old === "object" && "name" in old) return { ...(old as object), name: res.autoName };
              return old;
            });
            queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          }
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") {
            setActivityStream({ active: false, content: "" });
            return;
          }
          void reportError(err, { projectId });
          setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again.", sentAt: new Date().toISOString() }]);
          setActivityStream({ active: false, content: "" });
        })
        .finally(() => { setChatPending(false); abortControllerRef.current = null; });
    },
    [entries, projectId, fileContext, forgeContext, sendCtxRef, setDetectedLens, setScenarioBuffer, setLeftTab, setMobileTab, setActiveCatch, setPendingResolvedNodeIds, setAutoNameKey, playCatch, queryClient, getGetProjectQueryKey, getListProjectsQueryKey, reportError],
  );

  const handleRegenerate = useCallback(
    (assistantMsgIndex: number) => {
      if (!sessionId || chatPending) return;
      const msgsUpToAssistant = messages.slice(0, assistantMsgIndex);
      const prevUserMsg = [...msgsUpToAssistant].reverse().find((m) => m.role === "user");
      if (!prevUserMsg) return;
      const historyUpToPrevUser = msgsUpToAssistant.slice(0, msgsUpToAssistant.lastIndexOf(prevUserMsg));
      setMessages(msgsUpToAssistant.slice(0, msgsUpToAssistant.lastIndexOf(prevUserMsg) + 1));
      doSend(prevUserMsg.content, sessionId, historyUpToPrevUser);
    },
    [sessionId, chatPending, messages, doSend],
  );

  // ---- summarize effect (B2c) ----
  const summarizedSessionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    const assistantCount = messages.filter((m) => m.role === "assistant").length;
    if (assistantCount < 2) return;
    const onHide = () => {
      if (!document.hidden) return;
      if (summarizedSessionRef.current === sessionId) return;
      summarizedSessionRef.current = sessionId;
      void fetch(`/api/sessions/${sessionId}/summarize`, {
        method: "POST",
        credentials: "include",
      });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [sessionId, messages]);

  return {
    messages,
    setMessages,
    messagesRef,
    historyMsgCountRef,
    priorLoadedRef,
    sessionId,
    setSessionId,
    ensureSessionId,
    chatPending,
    setChatPending,
    activityStream,
    setActivityStream,
    abortControllerRef,
    handleStop,
    memoryChips,
    setMemoryChips,
    doSend,
    handleRegenerate,
  };
}
