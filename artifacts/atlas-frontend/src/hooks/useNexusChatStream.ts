import { useState, useCallback, useRef, useEffect } from "react";
import { logEvent as _adbgLog } from "@/lib/attachDebugLog";
import { useAtlasStream } from "./useAtlasStream";
import { loadProfile, profileToString } from "@/lib/userProfile";
import { extractSketchSubject, SKETCH_PROMPT_MARKER_RE } from "@/lib/sketchStylePresets";

import { pushHudEvent } from "@/lib/hudBus";

const STREAM_TIMEOUT_MS = 90_000;
const NAVIGATE_TO_RE = /\s*NAVIGATE_TO:\s*(\{[^\n]*"route"\s*:\s*"([^"]+)"[^\n]*\})\s*$/;
const PROJECT_READY_RE = /PROJECT_READY:\s*(\{[\s\S]*?\})(?=\s|$)/;
const BARE_PROJECT_READY_RE = /(^|\s)PROJECT_READY(?=\s|$)/;
const BARE_PROJECT_READY_RE_GLOBAL = /(^|\s)PROJECT_READY(?=\s|$)/g;

// Full signal lines to strip during streaming (complete lines)
const SIGNAL_LINE_RE = /^(CONV_STATE|MEMORY_T\d+|NAVIGATE_TO|OPEN_PROJECT|PROJECT_READY|VISUALIZE|READY_TO_SHAPE|MEMORY_CHIPS):[^\n]*/gm;
// Partial signal prefixes that may appear at the tail of accumulated text while
// the model is still mid-token — hold them back so they never flash to the user.
const SIGNAL_TAIL_RE = /\n(C|CO|CON|CONV|CONV_|CONV_S|CONV_ST|CONV_STA|CONV_STAT|CONV_STATE|M|ME|MEM|MEMO|MEMOR|MEMORY|MEMORY_|MEMORY_T\d*|N|NA|NAV|NAVI|NAVIG|NAVIGA|NAVIGAT|NAVIGATE|NAVIGATE_|NAVIGATE_T|NAVIGATE_TO|P|PR|PRO|PROJ|PROJE|PROJEC|PROJECT|PROJECT_|PROJECT_R|PROJECT_RE|PROJECT_REA|PROJECT_READ|PROJECT_READY|V|VI|VIS|VISU|VISUA|VISUAL|VISUALI|VISUALIZ|VISUALIZE|R|RE|REA|READ|READY|READY_|READY_T|READY_TO|READY_TO_|READY_TO_S|READY_TO_SH|READY_TO_SHA|READY_TO_SHAP|READY_TO_SHAPE)$/;

function parseProjectReady(content: string): { title: string | null; reason: string | null } | null {
  const match = content.match(PROJECT_READY_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { title?: unknown; reason?: unknown };
    return {
      title: typeof parsed.title === "string" ? parsed.title : null,
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
    };
  } catch {
    const titleMatch = match[1].match(/"title"\s*:\s*"([^"]+)"/);
    const reasonMatch = match[1].match(/"reason"\s*:\s*"([^"]+)"/);
    if (!titleMatch && !reasonMatch) return null;
    return {
      title: titleMatch?.[1] ?? null,
      reason: reasonMatch?.[1] ?? null,
    };
  }
}

function stripProjectReady(content: string): string {
  return content.replace(PROJECT_READY_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function hasBareProjectReady(content: string): boolean {
  return BARE_PROJECT_READY_RE.test(content);
}

function stripBareProjectReady(content: string): string {
  return content.replace(BARE_PROJECT_READY_RE_GLOBAL, "$1").replace(/\n{3,}/g, "\n\n");
}

function stripNavigateTo(content: string): { content: string; route: string | null } {
  const match = content.match(NAVIGATE_TO_RE);
  if (!match) return { content, route: null };

  try {
    const parsed = JSON.parse(match[1]) as { route?: unknown };
    if (typeof parsed.route === "string" && parsed.route.startsWith("/")) {
      return {
        content: content.replace(NAVIGATE_TO_RE, "").replace(/\n{3,}/g, "\n\n").trim(),
        route: parsed.route,
      };
    }
  } catch {
    // Fall back to the captured route when JSON parsing fails due to benign spacing.
  }

  return {
    content: content.replace(NAVIGATE_TO_RE, "").replace(/\n{3,}/g, "\n\n").trim(),
    route: match[2] ?? null,
  };
}

export interface NexusMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  kind?: "genesis";
  genesisData?: { projectName: string; timestamp: string };
  imageUrl?: string;
  imageB64?: string;
  imageMimeType?: string;
  pendingSketch?: boolean;
  sketchFailed?: boolean;
  attachments?: Array<{
    base64?: string;
    contentUrl?: string;
    mediaType: string;
    name?: string;
    clientAttachmentId?: string;
    attachmentId?: string;
    processingStatus?: string;
  }>;
  /** Attachment persistence acks received from the server via attachment_ack SSE events. */
  attachmentAcks?: Array<{ id: string; clientAttachmentId: string | null; status: string; errorCode?: string }>;
  imageGen?: {
    images: Array<{
      imageUrl: string;
      prompt?: string;
      model?: string;
      mode?: "render" | "schematic" | string;
    }>;
  } | null;
  createdAt: string;
  streaming?: boolean;
  model?: string | null;
  intentType?: string | null;
  isNew?: boolean;
  handoffSignal?: NexusHandoffSignal | null;
  focusSuggestion?: NexusFocusSuggestion;
  surface?: string | null;
  executionTimeMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  executionOutcome?: { code: string; label: string; complete: boolean; pendingVerification: string[] } | null;
  fileEdit?: { path: string; language?: string; content: string } | null;
  fileEdits?: Array<{ path: string; language?: string; content: string }> | null;
  linePatches?: Array<{ path: string; find: string; replace: string }> | null;
  fileDeletes?: Array<{ path: string }> | null;
  githubPush?: unknown;
  runStatus?: string;
  runSummary?: string | null;
  runActions?: unknown[] | null;
  runArtifacts?: unknown[] | null;
  terminalCmd?: unknown;
  terminalResult?: unknown;
  modelUsed?: string | null;
  errorMessage?: string;
  plan?: unknown;
  /** Build Contract awaiting authorization — set when the server transitions a run
   *  to awaiting_confirmation after validating a BUILD_CONTRACT_START/END block. */
  awaitingAuthorization?: Record<string, unknown> | null;
  visualImageBase64?: string | null;
  visualCaption?: string | null;
  visualLoading?: boolean;
  navigateTo?: { route: string; projectId?: number; projectName?: string | null } | null;
  /** Multiple candidate projects found for an OPEN_PROJECT signal — user must pick one. */
  projectChoices?: Array<{ id: number; name: string }> | null;
  /** Requested project name that had no match — surface a visible not-found message. */
  projectNotFound?: string | null;
  /** Suggestion chips — passed through from backend `nextSuggestions`. */
  nextSuggestions?: string[] | null;
  /** True when the backend queued background decision extraction after this turn. */
  extractionQueued?: boolean;
  /** Structured clarification card emitted by Atlas on DECIDE turns when target is ambiguous. */
  clarify?: { steps: Array<{ question: string; options: string[]; allowFreeText?: boolean; reason?: string }> } | null;
  /** Structured tradeoff matrix emitted by Atlas on DECIDE turns for binary/multi-way choices. */
  tradeoffMatrix?: { question: string; options: Array<{ label: string; pros: string[]; cons: string[]; atlas_leans?: boolean }>; context?: string } | null;
  /** Decision Intelligence artifacts (Tradeoff Matrix / Decision Tree / Deviation Log) generated this turn. */
  decisionArtifacts?: NexusDecisionArtifact[] | null;
  /** Runtime decision card — populated when classify_repository tool runs. Shows target info, env config form, and progress. */
  runtimeCard?: import("../components/workspace/RuntimeDecisionCard").RuntimeCardData | null;
  /**
   * Stable run ID for this turn — matches execution_runs.id.
   * Set from the backend done event so the Plan card can PATCH the run to
   * "succeeded" after a GitHub push completes.
   */
  runId?: string | null;
  /** File-backed deliverables (pptx/docx/xlsx/pdf/mermaid/chart/draft) generated
   *  this turn via generate-deliverable.ts. Same shape as /api/chat's `generatedArtifacts`
   *  (task #171); must stay in sync so the Nexus transport doesn't silently drop it. */
  generatedArtifacts?: Array<{
    artifactId: number | string;
    projectId?: number;
    type: string;
    title: string;
    extension?: string;
    downloadUrl: string;
    summary?: string | null;
  }> | null;
  /** Live build state: set when generate_deliverable fires build_progress events.
   *  Carries current lifecycle stage; cleared when generatedArtifacts arrives in onDone. */
  activeBuild?: {
    type: string;
    title: string;
    stage?: string;
    needsReview?: boolean;
    validationIssues?: string[];
  } | null;
}

export interface NexusDecisionArtifact {
  id: number;
  projectId: number;
  type: "tradeoff_matrix" | "decision_tree" | "deviation_log";
  version: number;
  title: string;
  payload: Record<string, unknown>;
  ledgerEntryId: number | null;
  createdAt: string;
}

export interface NexusHandoffSignal {
  projectName?: string | null;
  reason?: string | null;
  readyToHandoff?: boolean;
  confidence?: string;
  projectId?: number | null;
  /** True when emitted via explicit PROJECT_READY token (vs heuristic). */
  explicit?: boolean;
}

export interface NexusFocusSuggestion {
  projectId: number;
  projectName: string;
}

export interface NexusProjectReadyDoneData {
  projectReady?: {
    projectName: string;
    reason: string | null;
  };
  convState?: "THINK" | "SHAPE" | "COMMIT";
}

export interface NexusShapingPayload {
  title: string;
  audience: string;
  tension: string;
  what: string;
}

export interface NexusLiveStep {
  id: string;
  verb: string;
  target?: string;
  detail?: string;
  status?: "ok" | "warn" | "fail";
  /** Stable identity for this whole turn — same id spans user prompt → live
   *  steps → Timeline row → Changes row → receipt. Set by useNexusChatStream. */
  runId?: string;
}

export interface UseNexusChatStreamOptions {
  focusProjectId?: number | null;
  model?: string;
  mode?: string;
  conversationId?: string | null;
  onData?: (data: unknown) => void;
  onProjectReady?: (doneData?: NexusProjectReadyDoneData) => void;
  onConversationId?: (conversationId: string) => void;
  onThinkingStable?: () => void;
  projectContext?: {
    projectId: number;
    memorySummary?: string | null;
    decisions?: unknown[];
  } | null;
  /**
   * In-project Ask Atlas mode. When present, chat POST includes
   * `projectId` + `sessionId` + `askAtlasContextSeed` (first turn only) so the
   * backend treats this turn as part of the workspace's shared session.
   * See docs/handoffs/2026-07-07-ask-atlas-in-project-mode.md.
   */
  askAtlasInProject?: {
    projectId: number;
    sessionId: number;
    seed?: string | null;
  } | null;
  /** Conversation Mode: same thread, pure-talk posture (no tools/build actions). */
  conversationMode?: boolean;
  /** Explicit surface context sent to the backend. Governs which build
   *  capabilities are allowed. Workspace = full execution. Ask Atlas / home =
   *  conversation + handoff only. Defaults to "home" on the backend when omitted. */
  surfaceContext?: "workspace" | "ask-atlas" | "home";
}

export interface UseNexusChatStreamReturn {
  messages: NexusMessage[];
  setMessages: React.Dispatch<React.SetStateAction<NexusMessage[]>>;
  isStreaming: boolean;
  isPending: boolean;
  liveStep: NexusLiveStep | null;
  liveSteps: NexusLiveStep[];
  /** Stable runId for the currently-streaming turn (null when idle). Same id
   *  will appear on execution_runs.id once persisted, so tapping the live card
   *  can deep-link to Timeline/Changes for this run. */
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
    overrideOptions?: Partial<UseNexusChatStreamOptions>;
    /** Extra fields merged into the backend POST body — used for resume flags
     *  such as _resumeRunId and _approvedPlanVersion. */
    extraBody?: Record<string, unknown>;
  }) => { clientMessageId: string; accepted: Promise<void>; completed: Promise<void> } | undefined;
  abort: () => void;
  clearMessages: () => void;
  /** Build plan awaiting authorization. Set when the server emits awaitingConfirmation
   *  in the done event after validating a BUILD_CONTRACT block. */
  pendingAuthorization: Record<string, unknown> | null;
  /** Authorize a pending build plan and immediately resume execution.
   *  Calls POST /api/runs/:id/authorize then sends a resume message. */
  authorizeRun: (runId: string, planVersion: string) => Promise<void>;
}

export function useNexusChatStream(
  options: UseNexusChatStreamOptions
): UseNexusChatStreamReturn {
  const { focusProjectId, model = "claude", mode, conversationId, onData, onProjectReady, onConversationId, onThinkingStable, projectContext, askAtlasInProject, conversationMode } = options;
  const askAtlasSeedSentRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<NexusMessage[]>([]);
  const messagesRef = useRef<NexusMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [liveStep, setLiveStep] = useState<NexusLiveStep | null>(null);
  const [liveSteps, setLiveSteps] = useState<NexusLiveStep[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const [shapingPayload, setShapingPayload] = useState<NexusShapingPayload | null>(null);
  const [shapingHeld, setShapingHeld] = useState(false);
  const shapingHeldRef = useRef(false);
  const [handoffSignal, setHandoffSignal] = useState<NexusHandoffSignal | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = conversationId ?? null;
  }, [conversationId]);

  useEffect(() => {
    shapingHeldRef.current = shapingHeld;
  }, [shapingHeld]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const { stream, abort: abortStream } = useAtlasStream();
  const streamingIdRef = useRef<string | null>(null);
  const cleanedUpRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepSeqRef = useRef(0);
  const projectReadyNotifiedStreamRef = useRef<string | null>(null);
  // Synchronous in-flight guard — prevents a second rapid submit from reaching
  // useAtlasStream.stream(), which aborts the previous request on every call.
  // React state (isPending) is not enough here because state updates are batched
  // and two submits can both see isPending===false before the first render fires.
  const sendInFlightRef = useRef(false);
  /** Tracks the id of the optimistic user message created in the most recent send() call. */
  const lastSentUserMessageIdRef = useRef<string | null>(null);

  const resetStreamState = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    streamingIdRef.current = null;
    cleanedUpRef.current = true;
    setIsStreaming(false);
    setIsPending(false);
    setLiveStep(null);
    setLiveSteps([]);
    setActiveRunId(null);
    activeRunIdRef.current = null;
    sendInFlightRef.current = false;
  }, []);

  const abort = useCallback(() => {
    abortStream();
    resetStreamState();
  }, [abortStream, resetStreamState]);

  const clearMessages = useCallback(() => {
    activeConversationIdRef.current = null;
    setMessages([]);
    setShapingPayload(null);
    setHandoffSignal(null);
  }, []);

  const [pendingAuthorization, setPendingAuthorization] = useState<Record<string, unknown> | null>(null);

  const send = useCallback(({
    text,
    imageBase64,
    imageMimeType,
    attachments,
    attachmentIds,
    overrideOptions,
    extraBody,
  }: {
    text: string;
    imageBase64?: string;
    imageMimeType?: string;
    /** Display metadata for optimistic chips — not the transport payload when attachmentIds is set. */
    attachments?: Array<{
      base64?: string;
      contentUrl?: string;
      mediaType: string;
      name?: string;
      clientAttachmentId?: string;
      attachmentId?: string;
      processingStatus?: string;
    }>;
    /** Canonical transport — server resolves bytes. */
    attachmentIds?: string[];
    overrideOptions?: Partial<UseNexusChatStreamOptions>;
    extraBody?: Record<string, unknown>;
  }): { clientMessageId: string; accepted: Promise<void>; completed: Promise<void> } | undefined => {
    const resolvedAttachmentIds = [
      ...new Set((attachmentIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0)),
    ];
    const imgAttachments =
      (attachments && attachments.length > 0)
        ? attachments.filter((a) => a.mediaType?.startsWith("image/"))
        : (imageBase64
            ? [{ base64: imageBase64, mediaType: imageMimeType || "image/png" }]
            : []);
    const docAttachments =
      (attachments && attachments.length > 0)
        ? attachments.filter((a) => !a.mediaType?.startsWith("image/"))
        : [];
    const allFileAttachments = [...imgAttachments, ...docAttachments];
    const hasTransport =
      resolvedAttachmentIds.length > 0 || allFileAttachments.some((a) => !!a.base64);
    if (sendInFlightRef.current || (!text.trim() && !hasTransport && allFileAttachments.length === 0) || isPending) {
      return undefined;
    }
    const firstImg = imgAttachments[0];

    // B3.1/B3.2: empty string is valid when attachments are present.
    // Never substitute a placeholder — attachment-only sends persist "" content.
    const effectiveText = text.trim();
    // R6: [SKETCH:*] client-side short-circuit removed. Route through the LLM which
    // emits IMAGE_GEN tokens — handled server-side via Gemini/Imagen.
    // Transform [SKETCH:<preset>] prefix into natural language so the LLM has style context.
    let routedText = effectiveText;
    if (SKETCH_PROMPT_MARKER_RE.test(effectiveText)) {
      const sketchPreset = effectiveText.match(SKETCH_PROMPT_MARKER_RE)?.[1]?.toLowerCase();
      const imgSubject = extractSketchSubject(effectiveText);
      routedText = sketchPreset
        ? `Generate a ${sketchPreset} style image: ${imgSubject}`
        : `Generate an image: ${imgSubject}`;
    }

    const resolvedModel = overrideOptions?.model ?? model;
    const resolvedMode = overrideOptions?.mode ?? mode;
    const resolvedFocusProjectId = overrideOptions?.focusProjectId ?? focusProjectId;
    const resolvedConversationMode = overrideOptions?.conversationMode ?? conversationMode;
    const history = messagesRef.current.map((m) => ({ role: m.role, content: m.content }));
    const userProfile = profileToString(loadProfile());

    sendInFlightRef.current = true;
    setIsPending(true);
    setIsStreaming(true);
    const streamingId = Date.now().toString();
    streamingIdRef.current = streamingId;
    // Mint the stable run identity for this turn. Sent to the backend so the
    // execution_runs row is inserted under the same id — live card, Timeline,
    // Changes and receipt all read/write against this single identity.
    const turnRunId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    activeRunIdRef.current = turnRunId;
    setActiveRunId(turnRunId);
    stepSeqRef.current = 0;
    projectReadyNotifiedStreamRef.current = null;
    cleanedUpRef.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (cleanedUpRef.current || streamingIdRef.current !== streamingId) return;

      abortStream();
      setMessages(prev => prev.map(m =>
        (m as any).id === streamingId
          ? {
              ...m,
              content: "Connection timed out. Tap send again to retry.",
              streaming: false,
              runStatus: "failed",
              errorMessage: "Stream timed out.",
            }
          : m
      ));
      resetStreamState();
    }, STREAM_TIMEOUT_MS);

    // Add user message
    // A: stable client-side id on every optimistic user message so ChatStream
    // can key by identity instead of array index (prevents remount cascades
    // when a new message/run-card is inserted mid-thread).
    const userMsg: NexusMessage = {
      id: `user-${streamingId}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      ...(allFileAttachments.length > 0
        ? {
            attachments: allFileAttachments,
            ...(firstImg?.base64 ? { imageUrl: `data:${firstImg.mediaType};base64,${firstImg.base64}` } : {}),
          }
        : {}),
    };
    setMessages(prev => [...prev, userMsg]);
    // Record the stable id so useAtlasConversation.submit() can return a real
    // clientMessageId rather than an invented UUID.  Must be set before await stream().
    lastSentUserMessageIdRef.current = userMsg.id ?? null;

    // Add streaming assistant bubble
    const assistantMsg: NexusMessage = {
      id: streamingId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      model: resolvedModel,
      isNew: true,
    };
    setMessages(prev => [...prev, assistantMsg]);

    // clientMessageId is set synchronously here — the optimistic user message
    // is already in state before the HTTP request is made.
    const clientMessageId = userMsg.id!;

    // accepted: resolves when the server sends its first token (transport confirmed,
    //   optimistic message owns attachment data — safe to clear staged chips).
    // completed: resolves when the full SSE stream ends (all tokens delivered).
    // Transport failures reject accepted. Model-generation failures that occur
    // after the first token (e.g. a downstream API error mid-stream) happen
    // after accepted resolves, consistent with the send lifecycle contract.
    let resolveAccepted!: () => void;
    let rejectAccepted!: (err: unknown) => void;
    const accepted = new Promise<void>((res, rej) => {
      resolveAccepted = res;
      rejectAccepted = rej;
    });
    let acceptedFired = false;
    const fireAccepted = () => {
      if (!acceptedFired) { acceptedFired = true; resolveAccepted(); }
    };
    const completed = (async () => {
    const notifyProjectReady = (doneData?: NexusProjectReadyDoneData) => {
      if (projectReadyNotifiedStreamRef.current === streamingId) return;
      projectReadyNotifiedStreamRef.current = streamingId;
      onProjectReady?.(doneData);
    };

    try {
      _adbgLog("post_nexus_chat_send", {
        hasAttachments: allFileAttachments.length > 0 || resolvedAttachmentIds.length > 0,
        attachmentCount: resolvedAttachmentIds.length || allFileAttachments.length,
        attachmentIds: resolvedAttachmentIds,
        names: allFileAttachments.map((a) => a.name ?? "(unnamed)"),
      });
      await stream({
        endpoint: "/api/nexus/chat",
        body: {
          message: routedText,
          text: routedText,
          history,
          userProfile,
          model: resolvedModel,
          mode: resolvedMode,
          conversationId: activeConversationIdRef.current ?? undefined,
          focusProjectId: resolvedFocusProjectId ?? undefined,
          runId: turnRunId,
          // Lifecycle idempotency key (user persist → link → run → assistant → done).
          clientMessageId,
          ...(resolvedConversationMode ? { conversationMode: true } : {}),
          ...(options.surfaceContext ? { surfaceContext: options.surfaceContext } : {}),
          ...(resolvedAttachmentIds.length > 0
            ? {
                // Canonical transport — server resolves + authorizes bytes.
                attachmentIds: resolvedAttachmentIds,
              }
            : allFileAttachments.length > 0
              ? {
                  // Legacy inline path kept only for rare programmatic callers.
                  // Do NOT also set imageBase64/imageMimeType.
                  attachments: allFileAttachments.filter((a) => !!a.base64),
                }
              : {}),
          ...(askAtlasInProject
            ? (() => {
                const key = `${askAtlasInProject.projectId}:${askAtlasInProject.sessionId}`;
                const isFirst = askAtlasSeedSentRef.current !== key;
                if (isFirst) askAtlasSeedSentRef.current = key;
                return {
                  projectId: askAtlasInProject.projectId,
                  sessionId: askAtlasInProject.sessionId,
                  ...(isFirst && askAtlasInProject.seed
                    ? { askAtlasContextSeed: askAtlasInProject.seed }
                    : {}),
                };
              })()
            : {}),
          ...(extraBody ?? {}),
        },

        callbacks: {
          // onFirstEvent fires at event:meta time — the earliest authoritative
          // signal that the server accepted and materialized the message.
          // This resolves the accepted promise so staged chips can be cleared
          // before any textual token has been produced.
          onFirstEvent: () => { fireAccepted(); },
          onToken: (released) => {
            if (hasBareProjectReady(released)) notifyProjectReady();
            // 1. Strip complete signal lines (CONV_STATE, MEMORY_Tx, PROJECT_READY, etc.)
            // 2. Strip partial signal prefixes at the tail so they never flash to the user
            //    while the model is still building the token (e.g. "C", "CO", "CONV_ST…")
            const navStripped = stripNavigateTo(released).content;
            const linesCleaned = navStripped
              .replace(SIGNAL_LINE_RE, "")
              .replace(/\n{3,}/g, "\n\n");
            const tailCleaned = linesCleaned.replace(SIGNAL_TAIL_RE, "");
            const cleaned = stripBareProjectReady(tailCleaned);
            setMessages(prev => prev.map(m =>
              (m as any).id === streamingId
                ? { ...m, content: cleaned }
                : m
            ));
          },
          onStep: (step) => {
            const nextStep: NexusLiveStep = {
              id: `${streamingId}-${stepSeqRef.current++}`,
              verb: step.verb ?? "",
              target: step.target,
              detail: step.detail,
              status: step.status,
              runId: activeRunIdRef.current ?? turnRunId,
            };
            setLiveStep(nextStep);
            setLiveSteps(prev => [...prev, nextStep].slice(-6));
          },
          onArtifactCreated: (data) => {
            // Live signal: Atlas finished generating a deliverable during this
            // stream. Open the Outputs panel immediately — before done fires —
            // so the user sees where the file landed without hunting for it.
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("axiom:open-output", {
                detail: { artifactId: data.artifactId, projectId: resolvedFocusProjectId ?? undefined },
              }));
            }
          },
          onImagePending: () => {
            // Backend detected the IMAGE_GEN marker and stopped streaming raw
            // prompt/description text. Flip the streaming message into the
            // loading state so SketchReveal renders user-facing copy instead
            // of any partial prose that already streamed in (task #162).
            setMessages(prev => prev.map(m =>
              (m as any).id === streamingId
                ? { ...m, pendingSketch: true }
                : m
            ));
          },
          onBuildProgress: (data) => {
            // Build lifecycle stages: Preparing → Building → Styling → Checking → Ready.
            // "failed" clears the card immediately. "complete" keeps the card (stage="Ready")
            // so validation issues can be shown — cleared when generatedArtifacts arrives.
            setMessages(prev => prev.map(m =>
              (m as any).id === streamingId
                ? {
                    ...m,
                    activeBuild: data.status === "failed"
                      ? null
                      : {
                          type: data.type,
                          title: data.title,
                          stage: data.stage,
                          needsReview: data.needsReview ?? false,
                          validationIssues: data.validationIssues ?? [],
                        },
                  }
                : m
            ));
          },
          onImage: (imgPayload) => {
            // Async image delivery: patch the last assistant message and clear the Sketching step.
            // Arrives AFTER `done` — keep pendingSketch until this fires (see onDone).
            const raw = imgPayload?.images?.[0]?.imageUrl;
            if (!raw) return;
            const match = raw.match(/^data:([^;]+);base64,(.+)$/);
            setMessages(prev => {
              const lastAssistantIdx = [...prev].reverse().findIndex(m => m.role === "assistant");
              if (lastAssistantIdx === -1) return prev;
              const idx = prev.length - 1 - lastAssistantIdx;
              return prev.map((m, i) =>
                i === idx
                  ? {
                      ...m,
                      imageGen: imgPayload as NexusMessage["imageGen"],
                      ...(match ? { imageB64: match[2], imageMimeType: match[1] } : {}),
                      pendingSketch: false,
                      sketchFailed: false,
                    }
                  : m
              );
            });
            setLiveStep(null);
          },
          onData,
          onDone: (fullText, meta) => {
            if (meta && !(meta as any).imageGen && (meta as any).image_gen) {
              (meta as any).imageGen = (meta as any).image_gen;
            }
            const doneConversationId = meta.conversationId;
            if (typeof doneConversationId === "string" && doneConversationId) {
              if (!activeConversationIdRef.current) {
                activeConversationIdRef.current = doneConversationId;
              }
              onConversationId?.(doneConversationId);
            }

            // THINKING_STABLE — crystallization signal from Atlas
            if ((meta as any).thinkingStable === true) {
              onThinkingStable?.();
            }

            const { content: navCleanedText, route: routeFromText } = stripNavigateTo(fullText);
            // Strip CONV_STATE signal — internal governor token that should never reach the user.
            // Backend strips it from metadata but the raw streamed fullText still contains it.
            let displayText = navCleanedText.replace(/^CONV_STATE:\s*\{[^\n]+\}\s*$/gm, "").trim();
            // Prefer structured navigateTo from done event; fall back to text extraction (backward compat)
            const navFromMeta = (meta as any).navigateTo as { route: string; projectId?: number; projectName?: string | null } | null | undefined;
            const navigateTo: { route: string; projectId?: number; projectName?: string | null } | null = navFromMeta
              ?? (routeFromText
                ? (() => {
                    const m = routeFromText.match(/^\/project\/(\d+)$/);
                    return { route: routeFromText, projectId: m ? parseInt(m[1], 10) : undefined, projectName: null };
                  })()
                : null);
            // Pre-activate the project so the sidebar chip lights up, but do NOT navigate.
            // The user decides when to navigate via the suggestion card rendered on the message.
            if (navigateTo?.projectId) {
              fetch(`/api/projects/${navigateTo.projectId}/activate`, { method: "POST", credentials: "include" }).catch(() => {});
            }
            if (navigateTo?.route) {
              const navLabel = navigateTo.projectName
                ? `${navigateTo.projectName} (${navigateTo.route})`
                : navigateTo.route;
              pushHudEvent("NAVIGATED", navLabel);
            }

            // Read shapingPayload from meta — backend parses and 
            // sends it in the done event already cleaned
            const shapingFromMeta = meta.shapingPayload as NexusShapingPayload | null | undefined;
            if (shapingFromMeta?.title && shapingFromMeta?.tension && !shapingHeldRef.current) {
              setShapingPayload(shapingFromMeta);
              pushHudEvent("TENSION", shapingFromMeta.tension);
            }
            // Always notify — handler reads convState on every response, not just projectReady ones
            notifyProjectReady(meta as NexusProjectReadyDoneData);

            // Push convState as a HUD signal so the extraction feed reflects Atlas's mode.
            const convState = (meta as any).convState as "THINK" | "SHAPE" | "COMMIT" | undefined;
            if (convState === "SHAPE") {
              pushHudEvent("TENSION", "Structuring scope — mapping constraints and gaps");
            } else if (convState === "COMMIT") {
              pushHudEvent("DECISION", "Build signal detected — ready to commit");
            }

            // DECISION surface auto-captured to Ledger — notify quietly
            const surfaceMeta = (meta as any).surface as { type: string } | null | undefined;
            if (surfaceMeta?.type === "DECISION" && (meta as any).focusProjectId) {
              import("sonner").then(({ toast }) => {
                toast("Decision captured to Ledger", {
                  description: "Atlas logged this commitment automatically.",
                  duration: 3500,
                });
              }).catch(() => { /* non-critical */ });
            }

            // Parse VISUALIZE marker
            const visualMatch = fullText.match(
              /VISUALIZE:\{([\s\S]*?)\}(?:\s|$)/
            ) || fullText.match(
              /VISUALIZE:(\{[\s\S]*\})/
            );
            if (visualMatch) {
              let visualData: { prompt: string; caption: string } | null = null;
              try {
                const rawJson = visualMatch[1].startsWith('{')
                  ? visualMatch[1]
                  : `{${visualMatch[1]}}`;
                visualData = JSON.parse(rawJson);
              } catch {
                const promptMatch = fullText.match(/"prompt":"([^"]+)"/);
                const captionMatch = fullText.match(/"caption":"([^"]+)"/);
                if (promptMatch) {
                  visualData = {
                    prompt: promptMatch[1],
                    caption: captionMatch?.[1] ?? "",
                  };
                }
              }

                if (visualData?.prompt) {
                  // Set loading state on the message
                  setMessages(prev => prev.map(m =>
                    (m as any).id === streamingId
                      ? { 
                          ...m, 
                          visualLoading: true,
                          visualCaption: visualData.caption ?? null,
                        }
                      : m
                  ));

                  // Fetch the image async — don't block onDone
                  fetch("/api/nexus/visualize", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      prompt: visualData.prompt 
                    }),
                  })
                    .then(r => r.ok ? r.json() : null)
                    .then((data: { 
                      imageBase64?: string; 
                      mimeType?: string 
                    } | null) => {
                      if (data?.imageBase64) {
                        setMessages(prev => prev.map(m =>
                          (m as any).id === streamingId
                            ? {
                                ...m,
                                visualLoading: false,
                                visualImageBase64: data.imageBase64,
                              }
                            : m
                        ));
                      } else {
                        setMessages(prev => prev.map(m =>
                          (m as any).id === streamingId
                            ? { ...m, visualLoading: false }
                            : m
                        ));
                      }
                    })
                    .catch(() => {
                      setMessages(prev => prev.map(m =>
                        (m as any).id === streamingId
                          ? { ...m, visualLoading: false }
                          : m
                      ));
                    });
                }
            }


            // Parse MEMORY_CHIPS
            const chipMatch = displayText.match(/MEMORY_CHIPS:\s*(\[[\s\S]*?\])/);
            if (chipMatch) {
              try {
                const chips = JSON.parse(chipMatch[1]) as unknown;
                if (Array.isArray(chips)) {
                  for (const chip of chips) {
                    const text = typeof chip === "string" ? chip : typeof chip?.text === "string" ? chip.text : null;
                    if (text) pushHudEvent("MEMORY", text.length > 80 ? text.slice(0, 77) + "…" : text);
                  }
                }
              } catch { /* non-fatal */ }
              displayText = displayText.replace(/\nMEMORY_CHIPS:[\s\S]*$/g, "").trim();
            }

            // Parse explicit PROJECT_READY token from stream text and synthesize
            // a handoff signal if backend didn't already include one in meta.
            const projectReady = parseProjectReady(displayText);
            if (projectReady) {
              displayText = stripProjectReady(displayText);
            }
            if (hasBareProjectReady(displayText)) {
              notifyProjectReady();
              displayText = stripBareProjectReady(displayText).trim();
            }

            let handoff = meta.handoffSignal as NexusHandoffSignal | undefined;
            if (projectReady && !handoff) {
              handoff = {
                readyToHandoff: true,
                confidence: "high",
                projectName: projectReady.title,
                reason: projectReady.reason,
                explicit: true,
              };
            } else if (projectReady && handoff) {
              handoff = { ...handoff, explicit: true, readyToHandoff: true };
            }
            if (handoff) setHandoffSignal(handoff);
            const focusSuggestion = meta.focusSuggestion as NexusFocusSuggestion | undefined;

            setMessages(prev => prev.map(m => {
              if ((m as any).id !== streamingId) return m;
              // Image gen runs AFTER done on the server. Keep the shimmer until
              // `event: image` arrives (or the stream closes in `finally`).
              const wasPendingSketch = !!(m as any).pendingSketch;
              const metaImageGen = ((meta as any).imageGen ?? null) as NexusMessage["imageGen"];
              const hasImage = !!(m as any).imageB64
                || !!((m as any).imageGen?.images?.length)
                || !!(metaImageGen?.images?.length);
              const stillAwaitingSketch = wasPendingSketch && !hasImage;
              return {
                    ...m,
                    content: displayText,
                    navigateTo: navigateTo,
                    pendingSketch: stillAwaitingSketch,
                    sketchFailed: false,
                    imageGen: (metaImageGen ?? (m as any).imageGen ?? null) as NexusMessage["imageGen"],
                    decisionArtifacts: ((meta as any).decisionArtifacts ?? null) as NexusMessage["decisionArtifacts"],
                    streaming: false,
                    handoffSignal: handoff ?? null,
                    focusSuggestion,
                    surface: (meta.surface ?? null) as string | null,
                    executionTimeMs: (meta.executionTimeMs ?? meta.execution_time_ms ?? null) as number | null,
                    inputTokens: (meta.inputTokens ?? meta.input_tokens ?? null) as number | null,
                    outputTokens: (meta.outputTokens ?? meta.output_tokens ?? null) as number | null,
                    costUsd: (meta.costUsd ?? (meta.cost_usd != null ? Number(meta.cost_usd) : null)) as number | null,
                    runStatus: (meta.runStatus ?? meta.run_status ?? "completed") as string,
                    runSummary: (meta.runSummary ?? meta.run_summary ?? null) as string | null,
                    modelUsed: (meta.modelUsed ?? meta.model_used ?? null) as string | null,
                    // Pass-through fields that the bridge was previously dropping:
                    nextSuggestions: (meta.nextSuggestions as string[] | undefined) ?? null,
                    extractionQueued: !!(meta.extractionQueued),
                    clarify: ((meta as any).clarify ?? null) as NexusMessage["clarify"],
                    tradeoffMatrix: ((meta as any).tradeoff ?? null) as NexusMessage["tradeoffMatrix"],
                    projectChoices: ((meta as any).projectChoices ?? null) as NexusMessage["projectChoices"],
                    projectNotFound: ((meta as any).projectNotFound ?? null) as NexusMessage["projectNotFound"],
                    generatedArtifacts: ((meta as any).generatedArtifacts ?? null) as NexusMessage["generatedArtifacts"],
                    runtimeCard: ((meta as any).runtimeCard ?? null) as NexusMessage["runtimeCard"],
                    activeBuild: null, // clear stage stepper once the artifact card takes over
                    runId: ((meta as any).runId as string | undefined) ?? null,
                    executionOutcome: ((meta as any).executionOutcome ?? null) as NexusMessage["executionOutcome"],
                    fileEdit: ((meta as any).fileEdit ?? null) as NexusMessage["fileEdit"],
                    fileEdits: ((meta as any).fileEdits ?? null) as NexusMessage["fileEdits"],
                    linePatches: ((meta as any).linePatches ?? null) as NexusMessage["linePatches"],
                    fileDeletes: ((meta as any).fileDeletes ?? null) as NexusMessage["fileDeletes"],
                    githubPush: ((meta as any).githubPush ?? null) as NexusMessage["githubPush"],
                    awaitingAuthorization: ((meta as any).awaitingConfirmation ?? null) as NexusMessage["awaitingAuthorization"],
                  };
            }));

            // Capture pending authorization so consumers can render the authorize card
            if ((meta as any).awaitingConfirmation) {
              setPendingAuthorization((meta as any).awaitingConfirmation as Record<string, unknown>);
            }

            // If an html-app was generated, open the Preview panel automatically
            // so the user sees the running app without manually switching tabs.
            const _htmlApp = ((meta as any).generatedArtifacts as Array<{ type: string; downloadUrl?: string }> | null)
              ?.find(a => a.type === "html-app" || a.type === "html");
            if (_htmlApp?.downloadUrl) {
              const _dlUrl = _htmlApp.downloadUrl;
              setTimeout(() => {
                fetch(_dlUrl, { credentials: "include" })
                  .then(r => r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))
                  .then(html => {
                    window.dispatchEvent(new CustomEvent("axiom:open-preview", {
                      detail: { source: "sandbox", content: html },
                    }));
                  })
                  .catch(() => { /* non-critical: preview auto-open failed */ });
              }, 350);
            }

            resetStreamState();
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
            resetStreamState();
          },
          onCorrection: (correctedContent) => {
            // Attachment output guard fired server-side: snap the streaming
            // message to the grounded correction before done arrives.
            setMessages(prev => prev.map(m =>
              (m as any).id === streamingId
                ? { ...m, content: correctedContent }
                : m
            ));
          },
          onAttachmentAck: (ack) => {
            // Store attachment acks on the USER message (id = `user-${streamingId}`)
            // so B3.3 can look up the durable row id by clientAttachmentId and
            // enrich the attachment chip with a content URL.
            // Skip pending_upload — only final-status acks (uploaded | failed) matter here.
            if (ack.status === "pending_upload") return;
            const userMsgId = `user-${streamingId}`;
            setMessages(prev => prev.map(m =>
              (m as any).id === userMsgId
                ? {
                    ...m,
                    attachmentAcks: [
                      ...((m as any).attachmentAcks ?? []).filter(
                        (a: typeof ack) => a.clientAttachmentId !== ack.clientAttachmentId
                      ),
                      ack,
                    ],
                  }
                : m
            ));
          },
        },
      });
    } finally {
      // Guard: if the stream closed without delivering content (no tokens arrived,
      // no onError fired), the assistant bubble stays at "" with streaming:true.
      // This happens when the server sends event:error but the SSE connection closes
      // before the client parses it, or when the model returned only stripped tokens.
      // Convert the orphaned empty bubble to a visible error so the user is not
      // left looking at a silent blank message.
      // Sketch-only turns may have empty prose but a pending/arrived image — do not
      // treat those as failed empty responses.
      const capturedId = streamingId;
      setMessages(prev => prev.map(m => {
        if ((m as any).id !== capturedId || m.role !== "assistant") return m;
        const hasImage = !!(m as any).imageB64
          || !!((m as any).imageGen?.images?.length)
          || !!(m as any).imageUrl;
        if ((m as any).pendingSketch && !hasImage) {
          return {
            ...m,
            pendingSketch: false,
            sketchFailed: true,
            streaming: false,
          };
        }
        if (!m.content?.trim() && !hasImage && !(m as any).pendingSketch) {
          return {
            ...m,
            content: "No response was generated. Please try again.",
            streaming: false,
            runStatus: "failed" as const,
          };
        }
        return m;
      }));
      resetStreamState();
    }
    })(); // end completed async closure

    // Propagate to accepted if the stream ends before any token fires
    // (transport error, server error before generation, or empty response).
    completed.then(
      () => { fireAccepted(); },
      (err: unknown) => {
        if (!acceptedFired) { rejectAccepted(err); } else { fireAccepted(); }
      },
    );

    return { clientMessageId, accepted, completed };
  }, [focusProjectId, isPending, model, mode, conversationMode, onData, onProjectReady, stream, abortStream, resetStreamState]);

  const authorizeRun = async (runId: string, planVersion: string): Promise<void> => {
    // Step 1: transition the run to executing
    const res = await fetch(`/api/runs/${runId}/authorize`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedPlanVersion: planVersion }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "authorize failed" })) as { message?: string };
      throw new Error(err.message ?? `authorize failed: ${res.status}`);
    }
    // Clear pending authorization state immediately
    setPendingAuthorization(null);
    // Step 2: send a resume turn that triggers execution
    const sendResult = send({
      text: "(Authorized — proceeding with build plan)",
      extraBody: {
        _resumeRunId: runId,
        _approvedPlanVersion: planVersion,
      },
    });
    if (sendResult !== undefined) {
      await sendResult.completed;
    }
  };

  return {
    messages,
    setMessages,
    isStreaming,
    isPending,
    liveStep,
    liveSteps,
    activeRunId,
    shapingPayload,
    setShapingPayload,
    shapingHeld,
    setShapingHeld,
    handoffSignal,
    send,
    abort,
    clearMessages,
    pendingAuthorization,
    authorizeRun,
  };
}
