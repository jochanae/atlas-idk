import { useState, useCallback, useRef } from "react";
import type {
  NexusMessage,
  NexusHandoffSignal,
  NexusShapingPayload,
  NexusLiveStep,
  NexusProjectReadyDoneData,
} from "./useNexusChatStream";

const SIGNAL_LINE_RE = /^(CONV_STATE|MEMORY_T\d+|NAVIGATE_TO|PROJECT_READY|VISUALIZE|READY_TO_SHAPE|MEMORY_CHIPS):[^\n]*/gm;
const NAVIGATE_TO_RE = /\s*NAVIGATE_TO:\s*(\{[^\n]*"route"\s*:\s*"([^"]+)"[^\n]*\})\s*/g;
const PROJECT_READY_RE = /PROJECT_READY:\s*(\{[\s\S]*?\})(?=\s|$)/;

function parseProjectReadyName(content: string): string | null {
  const match = content.match(PROJECT_READY_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { projectName?: string; title?: string };
    return parsed.projectName ?? parsed.title ?? null;
  } catch {
    const m = match[1].match(/"(?:projectName|title)"\s*:\s*"([^"]+)"/);
    return m?.[1] ?? null;
  }
}

function parseNavigateRoute(content: string): string | null {
  const re = /NAVIGATE_TO:\s*(\{[^\n]*"route"\s*:\s*"([^"]+)"[^\n]*\})/;
  const match = content.match(re);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { route?: string };
    return typeof parsed.route === "string" ? parsed.route : match[2] ?? null;
  } catch {
    return match[2] ?? null;
  }
}

function cleanSignals(content: string): string {
  return content
    .replace(SIGNAL_LINE_RE, "")
    .replace(NAVIGATE_TO_RE, "")
    .replace(PROJECT_READY_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface UseFoundationChatOptions {
  onProjectReady?: (doneData?: NexusProjectReadyDoneData) => void;
}

export interface UseFoundationChatReturn {
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
  send: (options: {
    text: string;
    imageBase64?: string;
    imageMimeType?: string;
    attachments?: Array<{ base64: string; mediaType: string; name?: string }>;
    overrideOptions?: Record<string, unknown>;
  }) => Promise<void>;
  abort: () => void;
  clearMessages: () => void;
}

export function useFoundationChat(opts?: UseFoundationChatOptions): UseFoundationChatReturn {
  const [messages, setMessages] = useState<NexusMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [handoffSignal, setHandoffSignal] = useState<NexusHandoffSignal | null>(null);
  const [shapingPayload, setShapingPayload] = useState<NexusShapingPayload | null>(null);
  const [shapingHeld, setShapingHeld] = useState(false);

  const messagesRef = useRef<NexusMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const onProjectReadyRef = useRef(opts?.onProjectReady);
  onProjectReadyRef.current = opts?.onProjectReady;

  const syncMessages: typeof setMessages = useCallback((update) => {
    setMessages((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      messagesRef.current = next;
      return next;
    });
  }, []);

  const clearMessages = useCallback(() => {
    syncMessages([]);
    setHandoffSignal(null);
  }, [syncMessages]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(async (sendOpts: {
    text: string;
    imageBase64?: string;
    imageMimeType?: string;
    attachments?: Array<{ base64: string; mediaType: string; name?: string }>;
    overrideOptions?: Record<string, unknown>;
  }) => {
    const { text, attachments = [], imageBase64, imageMimeType } = sendOpts;
    if (!text?.trim() && !attachments.length) return;

    const streamId = `fc-${Date.now()}`;

    const userMsg: NexusMessage = {
      id: `user-${streamId}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      ...(imageBase64 && imageMimeType ? { imageUrl: `data:${imageMimeType};base64,${imageBase64}` } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    };

    const history = messagesRef.current.map((m) => ({ role: m.role, content: m.content }));

    syncMessages((prev) => [...prev, userMsg]);
    setIsPending(true);
    setIsStreaming(false);

    abortRef.current = new AbortController();

    const allAttachments = [
      ...attachments,
      ...(imageBase64 && imageMimeType ? [{ base64: imageBase64, mediaType: imageMimeType }] : []),
    ];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          history,
          attachments: allAttachments,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Request failed");
        const errMsg: NexusMessage = {
          id: `err-${streamId}`,
          role: "assistant",
          content: `Something went wrong: ${errText}`,
          createdAt: new Date().toISOString(),
        };
        syncMessages((prev) => [...prev, errMsg]);
        return;
      }

      const assistantId = `asst-${streamId}`;
      const assistantMsg: NexusMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
      };
      syncMessages((prev) => [...prev, assistantMsg]);
      setIsPending(false);
      setIsStreaming(true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(jsonStr) as Record<string, unknown>;
          } catch {
            continue;
          }

          const type = evt.type as string | undefined;

          if (type === "text" || type === "delta") {
            const chunk = (evt.content ?? evt.delta ?? "") as string;
            if (chunk) {
              accumulated += chunk;
              const cleaned = cleanSignals(accumulated);
              syncMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.id === assistantId) {
                  return [...prev.slice(0, -1), { ...last, content: cleaned }];
                }
                return prev;
              });
            }
          } else if (type === "done") {
            const projectName = parseProjectReadyName(accumulated);
            const route = parseNavigateRoute(accumulated) ?? (evt.navigateTo as string | null | undefined) ?? null;

            if (projectName) {
              const signal: NexusHandoffSignal = {
                projectName,
                readyToHandoff: true,
                explicit: true,
              };
              setHandoffSignal(signal);
              onProjectReadyRef.current?.({
                projectReady: { projectName, reason: null },
                convState: "SHAPE",
              });
            }

            const finalContent = cleanSignals(accumulated);
            const nav = route ? { route } : null;

            syncMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.id === assistantId) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: finalContent, streaming: false, navigateTo: nav },
                ];
              }
              return prev;
            });
            break;
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const errMsg: NexusMessage = {
        id: `err-${streamId}`,
        role: "assistant",
        content: "Something went wrong. Please try again.",
        createdAt: new Date().toISOString(),
      };
      syncMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.id === `asst-${streamId}`) {
          return [...prev.slice(0, -1), errMsg];
        }
        return [...prev, errMsg];
      });
    } finally {
      setIsStreaming(false);
      setIsPending(false);
      syncMessages((prev) =>
        prev.map((m) =>
          m.id === `asst-${streamId}` ? { ...m, streaming: false } : m
        )
      );
    }
  }, [syncMessages]);

  return {
    messages,
    setMessages: syncMessages,
    isStreaming,
    isPending,
    liveStep: null,
    liveSteps: [],
    activeRunId: null,
    shapingPayload,
    setShapingPayload,
    shapingHeld,
    setShapingHeld,
    handoffSignal,
    send,
    abort,
    clearMessages,
  };
}
