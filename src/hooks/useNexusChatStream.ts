import { useState, useCallback, useRef } from "react";
import { useAtlasStream } from "./useAtlasStream";

export interface NexusMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  createdAt: string;
  streaming?: boolean;
  model?: string | null;
  intentType?: string | null;
  isNew?: boolean;
  handoffSignal?: NexusHandoffSignal | null;
  surface?: string | null;
  executionTimeMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  runStatus?: string;
  runSummary?: string | null;
  runActions?: unknown[] | null;
  runArtifacts?: unknown[] | null;
  terminalCmd?: unknown;
  terminalResult?: unknown;
  modelUsed?: string | null;
  errorMessage?: string;
  plan?: unknown;
}

export interface NexusHandoffSignal {
  projectName?: string | null;
  reason?: string | null;
  readyToHandoff?: boolean;
  confidence?: string;
}

export interface NexusShapingPayload {
  title: string;
  audience: string;
  tension: string;
  what: string;
}

export interface UseNexusChatStreamOptions {
  focusProjectId?: number | null;
  model?: string;
  mode?: string;
  conversationId?: string | null;
  projectContext?: {
    projectId: number;
    memorySummary?: string | null;
    decisions?: unknown[];
  } | null;
}

export interface UseNexusChatStreamReturn {
  messages: NexusMessage[];
  setMessages: React.Dispatch<React.SetStateAction<NexusMessage[]>>;
  isStreaming: boolean;
  isPending: boolean;
  liveStep: { verb: string; target?: string; status?: string } | null;
  shapingPayload: NexusShapingPayload | null;
  setShapingPayload: React.Dispatch<React.SetStateAction<NexusShapingPayload | null>>;
  shapingHeld: boolean;
  setShapingHeld: React.Dispatch<React.SetStateAction<boolean>>;
  handoffSignal: NexusHandoffSignal | null;
  send: (options: {
    text: string;
    imageBase64?: string;
    imageMimeType?: string;
    overrideOptions?: Partial<UseNexusChatStreamOptions>;
  }) => Promise<void>;
  abort: () => void;
  clearMessages: () => void;
}

export function useNexusChatStream(
  options: UseNexusChatStreamOptions
): UseNexusChatStreamReturn {
  const { focusProjectId, model = "claude", mode, conversationId, projectContext } = options;

  const [messages, setMessages] = useState<NexusMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [liveStep, setLiveStep] = useState<{ verb: string; target?: string; status?: string } | null>(null);
  const [shapingPayload, setShapingPayload] = useState<NexusShapingPayload | null>(null);
  const [shapingHeld, setShapingHeld] = useState(false);
  const [handoffSignal, setHandoffSignal] = useState<NexusHandoffSignal | null>(null);

  const { stream, abort: abortStream } = useAtlasStream();
  const streamingIdRef = useRef<string | null>(null);

  const abort = useCallback(() => {
    abortStream();
    setIsStreaming(false);
    setIsPending(false);
    setLiveStep(null);
  }, [abortStream]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setShapingPayload(null);
    setHandoffSignal(null);
  }, []);

  const send = useCallback(async ({
    text,
    imageBase64,
    imageMimeType,
    overrideOptions,
  }: {
    text: string;
    imageBase64?: string;
    imageMimeType?: string;
    overrideOptions?: Partial<UseNexusChatStreamOptions>;
  }) => {
    if (!text.trim() || isPending) return;

    const resolved = {
      focusProjectId: overrideOptions?.focusProjectId ?? focusProjectId,
      model: overrideOptions?.model ?? model,
      mode: overrideOptions?.mode ?? mode,
      conversationId: overrideOptions?.conversationId ?? conversationId,
      projectContext: overrideOptions?.projectContext ?? projectContext,
    };

    setIsPending(true);
    setIsStreaming(true);
    const streamingId = Date.now().toString();
    streamingIdRef.current = streamingId;

    // Add user message
    const userMsg: NexusMessage = {
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Add streaming assistant bubble
    const assistantMsg: NexusMessage = {
      id: streamingId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      model: resolved.model,
      isNew: true,
    };
    setMessages(prev => [...prev, assistantMsg]);

    await stream({
      endpoint: "/api/nexus/chat",
      body: {
        message: text,
        model: resolved.model,
        focusProjectId: resolved.focusProjectId,
        mode: resolved.mode,
        imageBase64,
        imageMimeType,
        conversationId: resolved.conversationId,
        projectContext: resolved.projectContext ?? null,
      },
      callbacks: {
        onToken: (released) => {
          // Strip any partial or complete markers from 
          // streamed content so they never show as gibberish
          const cleaned = released
            .replace(/\nREADY_TO_SHAPE:\{[^\n]*\}?/g, "")
            .replace(/\nNAVIGATE_TO:\{[^\n]*\}?/g, "")
            .replace(/\nMEMORY_CHIPS:[\s\S]*$/g, "")
            .replace(/READY_TO_SHAPE:[^\n]*/g, "")
            .replace(/NAVIGATE_TO:[^\n]*/g, "");
          setMessages(prev => prev.map(m =>
            (m as any).id === streamingId
              ? { ...m, content: cleaned }
              : m
          ));
        },
        onStep: (step) => {
          setLiveStep({ verb: step.verb ?? "", target: step.target, status: step.status });
        },
        onDone: (fullText, meta) => {
          // Parse NAVIGATE_TO
          let displayText = fullText;
          const navMatch = displayText.match(/NAVIGATE_TO:\{"route":"([^"]+)"\}/);
          if (navMatch) {
            const route = navMatch[1];
            displayText = displayText.replace(/\nNAVIGATE_TO:\{[^}]+\}/g, "").trim();
            setTimeout(() => { window.location.href = route; }, 800);
          }

          // Read shapingPayload from meta — backend parses and 
          // sends it in the done event already cleaned
          const shapingFromMeta = meta.shapingPayload as NexusShapingPayload | null | undefined;
          if (shapingFromMeta?.title && shapingFromMeta?.tension && !shapingHeld) {
            setShapingPayload(shapingFromMeta);
          }

          // Parse MEMORY_CHIPS
          const chipMatch = displayText.match(/MEMORY_CHIPS:\s*(\[[\s\S]*?\])/);
          if (chipMatch) {
            try { JSON.parse(chipMatch[1]); } catch { /* non-fatal */ }
            displayText = displayText.replace(/\nMEMORY_CHIPS:[\s\S]*$/g, "").trim();
          }

          const handoff = meta.handoffSignal as NexusHandoffSignal | undefined;
          if (handoff) setHandoffSignal(handoff);

          setMessages(prev => prev.map(m =>
            (m as any).id === streamingId
              ? {
                  ...m,
                  content: displayText,
                  streaming: false,
                  handoffSignal: handoff ?? null,
                  surface: (meta.surface ?? null) as string | null,
                  executionTimeMs: (meta.executionTimeMs ?? meta.execution_time_ms ?? null) as number | null,
                  inputTokens: (meta.inputTokens ?? meta.input_tokens ?? null) as number | null,
                  outputTokens: (meta.outputTokens ?? meta.output_tokens ?? null) as number | null,
                  costUsd: (meta.costUsd ?? (meta.cost_usd != null ? Number(meta.cost_usd) : null)) as number | null,
                  runStatus: (meta.runStatus ?? meta.run_status ?? "completed") as string,
                  runSummary: (meta.runSummary ?? meta.run_summary ?? null) as string | null,
                  modelUsed: (meta.modelUsed ?? meta.model_used ?? null) as string | null,
                }
              : m
          ));

          setLiveStep(null);
          setIsStreaming(false);
          setIsPending(false);
        },
        onError: (errMsg) => {
          setMessages(prev => prev.map(m =>
            (m as any).id === streamingId
              ? {
                  ...m,
                  content: errMsg || "Something went wrong. Tap send again.",
                  streaming: false,
                  runStatus: "failed",
                  errorMessage: errMsg,
                }
              : m
          ));
          setIsStreaming(false);
          setIsPending(false);
          setLiveStep(null);
        },
      },
    });
  }, [isPending, focusProjectId, model, mode, conversationId, projectContext, stream, shapingHeld]);

  return {
    messages,
    setMessages,
    isStreaming,
    isPending,
    liveStep,
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
