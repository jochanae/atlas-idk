import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { Tier1Memory } from "@/lib/tier1Memory";
import { useIsMobile } from "@/hooks/use-mobile";
import { useComposerVisibility } from "@/hooks/useComposerVisibility";
import { useHandoffChromeLock } from "@/hooks/useDockVisibility";
import { UserBubble } from "@/components/workspace/UserBubble";
import { StepProgress } from "@/components/workspace/StepProgress";
import { AssistantBubble, type BuildGroupInfo } from "@/components/workspace/AssistantBubble";
import InlineSketchOffer from "@/components/chat/InlineSketchOffer";
import { InlineTerminalBlock } from "@/components/InlineTerminalBlock";
// LiveGenerationCard removed (Model A) — WorkspaceRunCard.ActiveCard owns live streaming.
import { ExecutionJournal, isExecutionStream } from "@/components/workspace/ExecutionJournal";
import { TimelineRail } from "../TimelineRail";
import { WriteFileCard } from "@/components/workspace/WriteFileCard";
import { ArtifactCreatedCard } from "@/components/workspace/ArtifactCreatedCard";
import { SystemActivityCard, BatchedActivityCard } from "@/components/workspace/SystemActivityCard";
import { SuggestionChipRail } from "@/components/workspace/SuggestionChipRail";
import { classifyActivity, type ActivityItem as WorkspaceActivityItem } from "@/hooks/useWorkspaceActivity";
import type { ChatMessage, LinkedRepo, PushRecord } from "@/pages/workspace";
import type { PlanExecution } from "@/lib/plan";
import type { Plan } from "@/lib/plan";
import type { PlanState } from "@/components/workspace/chatShared";
import type { ResumeBrief } from "@/hooks/useProjectResume";
import { isDoingVerb } from "@/lib/runStepLabels";
import { WorkspaceRunCard } from "@/components/workspace/WorkspaceRunCard";
import { BuildContractCard } from "@/components/workspace/BuildContractCard";
import type { ApiRun } from "@/hooks/useProjectRuns";

// Minimal structural types — avoid importing private types from workspace.tsx
type ProjectLike = { name?: string } | null | undefined;
type ProjectWithPreview = { previewUrl?: string | null } | null | undefined;
type HomeHandoffMetaLike = { flowNodeCount: number; goalLabel: string } | null | undefined;
type LinkedRepoLike = LinkedRepo | null;
type PushRecordLike = PushRecord;
type LiveGenerationLike = {
  shouldShow: boolean;
  mode: string;
  steps: unknown[];
};
type LiveStepLike = { verb: string; target?: string; status?: string } | null;
type PlanExecutionLike = PlanExecution;

const PENDING_PHRASES = [
  "Joy is reading your message…",
  "Loading context…",
  "Thinking…",
  "On it…",
];

function ChatPendingIndicator() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PENDING_PHRASES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="atlas-bubble-in"
      style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, paddingLeft: 14, borderLeft: "1.5px solid rgba(201,162,76,0.13)" }}
    >
      <span style={{
        display: "flex", gap: 4, alignItems: "center",
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "var(--atlas-gold)",
            opacity: 0.7,
            animation: `atlas-pulse 1.4s ease-in-out ${i * 0.22}s infinite`,
            flexShrink: 0,
          }} />
        ))}
      </span>
      <span style={{
        fontFamily: "var(--app-font-mono)",
        fontSize: 11,
        letterSpacing: "0.06em",
        color: "var(--atlas-muted)",
        opacity: 0.75,
        animation: "atlasTextFade 300ms ease-out",
      }}>
        {PENDING_PHRASES[idx]}
      </span>
    </div>
  );
}

function isAutoVerifyMessage(msg: ChatMessage): boolean {
  return msg.displayAs === "autoVerify" || msg.content.startsWith("[FILE_COMMITTED]") || msg.content.startsWith("[LOCAL_APPLY_SUCCESS]");
}

function isLedgerContent(content: string): boolean {
  return content.startsWith("[FILE_COMMITTED]") || content.startsWith("[LOCAL_APPLY_SUCCESS]");
}

function AutoVerifyMessage({ content }: { content: string; executionTimeMs?: number | null }) {
  return (
    <div
      style={{
        maxWidth: "82%",
        margin: "4px 0 18px",
        padding: "7px 0 7px 11px",
        borderLeft: "2px solid rgba(201,162,76,0.4)",
        color: "rgba(var(--atlas-muted-rgb),0.9)",
        fontSize: "var(--ts-caption)",
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
      }}
    >
      <div
        style={{
          color: "rgba(201,162,76,0.55)",
          fontFamily: "var(--app-font-mono)",
          fontSize: "var(--ts-micro)",
          marginBottom: 4,
        }}
      >
        Auto-verify
      </div>
      {content}
    </div>
  );
}

function HomeHandoffDivider({ projectName }: { projectName?: string }) {
  const label = projectName?.trim() ? `${projectName.trim()} Workspace` : "Workspace";

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 0 22px" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 1,
          background: "linear-gradient(to right, transparent, rgba(201,162,76,0.3), transparent)",
        }}
      />
      <div
        style={{
          position: "relative",
          padding: "4px 10px",
          borderRadius: 999,
          background: "var(--atlas-bg)",
          border: "1px solid rgba(201,162,76,0.16)",
          color: "var(--atlas-muted)",
          fontFamily: "var(--app-font-mono)",
          fontSize: "var(--ts-micro)",
          letterSpacing: "0.12em",
          lineHeight: 1,
          textTransform: "uppercase",
          opacity: 0.72,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "just now";
    const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    const days = Math.floor(diffSec / 86400);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "just now";
  }
}

function CommitThresholdMarker({ committedAt }: { committedAt: string }) {
  const rel = formatRelativeTime(committedAt);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "28px 0 22px",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 1,
          background: "linear-gradient(to right, transparent, rgba(201,162,76,0.45), transparent)",
        }}
      />
      <div
        style={{
          position: "relative",
          padding: "5px 12px",
          borderRadius: 999,
          background: "var(--atlas-bg)",
          border: "1px solid rgba(201,162,76,0.32)",
          color: "var(--atlas-gold)",
          fontFamily: "var(--app-font-mono)",
          fontSize: "var(--ts-micro)",
          letterSpacing: "0.14em",
          lineHeight: 1,
          textTransform: "uppercase",
          opacity: 0.92,
          boxShadow: "0 0 18px rgba(201,162,76,0.18)",
        }}
        title={new Date(committedAt).toLocaleString()}
      >
        Committed as a project · {rel}
      </div>
    </div>
  );
}

function CommitGreetingBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "4px 4px 18px",
        gap: 8,
      }}
    >
      <div
        style={{
          maxWidth: 540,
          color: "var(--atlas-fg)",
          fontSize: 17,
          lineHeight: 1.55,
          fontWeight: 400,
          letterSpacing: "-0.005em",
          opacity: 0.94,
        }}
      >
        {text}
      </div>
    </div>
  );
}

export interface ChatStreamProps {
  // scroll container
  scrollRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  showScrollBtn: boolean;
  onScrollToLatest: () => void;

  // state
  messages: ChatMessage[];
  chatPending: boolean;
  activityStream: { active: boolean; content: string };
  liveGeneration: LiveGenerationLike;
  liveStep: LiveStepLike;
  thinkingBlock?: ReactNode;
  historyMsgCountRef: RefObject<number> | { current: number };
  priorLoaded?: boolean;

  // empty state
  isHomeHandoff: boolean;
  homeHandoffMeta: HomeHandoffMetaLike;
  isBrandNewProject: boolean;
  atlasGreeting?: string | null;
  greetingLoading?: boolean;
  resumeBrief?: ResumeBrief | null;
  project: ProjectLike;
  tier1Memory?: Tier1Memory | null;
  onStarterPrompt: (label: string) => void;

  // long-thread banner
  wsModel: string;
  wsLens?: string;
  onSwitchToGemini: () => void;

  // user bubble
  onEditUserMessage: (content: string) => void;

  // assistant bubble — context
  projectId: number;
  sessionId: number | null;
  linkedRepo: LinkedRepoLike;
  // assistant bubble — per-message handlers
  onPark: AssistantBubbleProp<"onPark">;
  onCommit: AssistantBubbleProp<"onCommit">;
  onRegenerate: (index: number) => void;
  onSend?: (message: string) => void;
  onPreviewCode: AssistantBubbleProp<"onPreviewCode">;
  onRunCommand: AssistantBubbleProp<"onRunCommand">;
  onPrCreated: (url: string) => void;
  onExtractToForge: (content: string) => void;
  onForgeIntake?: (content: string) => Promise<void> | void;
  onReviewDiff: () => void;
  onOpenArtifact?: (title: string) => void;
  onEditDeclined: () => void;
  onAlertDismiss: (msg: ChatMessage) => void;
  onStreamActivityUpdate: (msg: ChatMessage, content: string) => void;
  onStreamActivityComplete: () => void;
  onCommitCardDone: () => void;

  // plan
  planStates: Map<number, PlanState>;
  planExecutions: Map<number, PlanExecutionLike>;
  onPlanStateChange: (messageId: number, state: PlanState) => void;
  onPlanExecutionChange: (messageId: number, execution: PlanExecutionLike) => void;
  onExecuteHomePlan: (plan: Plan) => void;

  // push
  onPushSuccess: (records: PushRecordLike[]) => void;

  // file writing confirmation callback (optional — workspace.tsx wires this to append a chat line)
  onWriteFile?: (path: string) => void;

  // commit-carryover (ambient thread → committed project): marker + greeting bubble
  // rendered at the tail of the carried thread.
  commitCarryover?: { committedAt: string; greeting?: string | null } | null;

  // Build Readiness Gate: re-send original message bypassing the gate
  onBuildAnyway?: (message: string) => void;

  // Inline workspace activity (GitHub commits, decisions, etc.).
  // Interleaved between messages by timestamp. Quiet events are batched on mobile.
  activityEvents?: WorkspaceActivityItem[];

  // Suggestion chip rail handlers. Rail appears below the last assistant
  // message only when the stream is idle (chatPending=false, not streaming).
  onSuggestionTap?: (text: string) => void;
  onSuggestionPark?: (text: string) => void;

  /** Phase 2B: latest execution_run from the API. Passed to the trailing
   *  WorkspaceRunCard instead of using deriveRun(messages). */
  execLatestRun?: ApiRun | null;
  /** Durable execution runs for this conversation. Receipts are rendered per
   *  originating message so older cards do not disappear when a newer turn runs. */
  execRuns?: ApiRun[];

  /** Stable run id for the currently active Nexus turn. Lets the live card open
   *  the same Timeline/Changes surface that the completed receipt later uses. */
  activeRunId?: string | null;

  /** Authorize a pending build plan and resume execution.
   *  Passed from the nexus bridge → workspace.tsx → ChatStream. */
  authorizeRun?: (runId: string, planVersion: string) => Promise<void>;

  /** Conversation Mode: clean chat only — no run cards, tool blocks, or
   *  execution journals. Same thread/session as Build Mode, just a quieter
   *  render of it (mirrors the old Ask Joy posture). */
  conversationMode?: boolean;

  /** Chat surface lifecycle: fixed chat controls only mount while chat is the
   *  active foreground surface. */
  floatingControlsEnabled?: boolean;
}


// Helper alias so we don't re-derive AssistantBubble prop types here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AssistantBubbleProp<K extends string> = any;

export function ChatStream(props: ChatStreamProps) {
  const {
    scrollRef, bottomRef, onScroll, showScrollBtn, onScrollToLatest,
    messages, chatPending, activityStream, liveGeneration, thinkingBlock, historyMsgCountRef,
    priorLoaded,
    isHomeHandoff, homeHandoffMeta, atlasGreeting, greetingLoading, resumeBrief, project, tier1Memory,
    wsModel, wsLens, onSwitchToGemini,
    onEditUserMessage,
    projectId, sessionId, linkedRepo,
    onPark, onCommit, onRegenerate, onSend,
    onPreviewCode, onRunCommand, onPrCreated, onExtractToForge, onForgeIntake, onReviewDiff,
    onOpenArtifact,
    onEditDeclined, onAlertDismiss, onStreamActivityUpdate, onStreamActivityComplete,
    onCommitCardDone,
    planStates, planExecutions, onPlanStateChange, onPlanExecutionChange, onExecuteHomePlan,
    onPushSuccess,
    onWriteFile,
    commitCarryover,
    onBuildAnyway,
    activityEvents: activityEventsRaw,
    onSuggestionTap,
    onSuggestionPark,
    liveStep,
    execLatestRun,
    execRuns,
    activeRunId,
    conversationMode,
    authorizeRun,
    floatingControlsEnabled = true,
  } = props;
  const initialTailPinnedRef = useRef(false);

  // Attachment / turn lifecycle verbs belong to Changes → Timeline ONLY.
  // The chat thread keeps only commit / decision / session receipts so they
  // never leak into the "quiet updates" batch card.
  const activityEvents = useMemo(
    () => (activityEventsRaw ?? []).filter(
      (ev) => ev.type === "commit" || ev.type === "decision" || ev.type === "session",
    ),
    [activityEventsRaw],
  );

  // Suppress the streaming prose bubble when live build steps are actively
  // flowing — the WorkspaceRunCard owns that surface during a build.
  // Also suppress during the gap between agentic turns (chatPending=true but
  // liveStep not yet set) when the last user message is a LOCAL_APPLY_SUCCESS
  // auto-message — we're mid-build-chain and the prose would flash for 1-2s.
  const inBuildChain = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return false;
    return last.role === "user" && (
      last.displayAs === "autoVerify" ||
      (last.content ?? "").startsWith("[LOCAL_APPLY_SUCCESS]")
    );
  }, [messages]);
  // Task #158: only suppress prose for "Doing" steps (mutating tool-use — the
  // WorkspaceRunCard owns that surface). Pure "Thinking" steps (FILE_READ,
  // TREE, FETCH, etc.) must NOT suppress — Joy's prose should stream
  // normally while thinking, per the Thinking/Doing/Receipt lifecycle.
  const suppressStreamingText = isDoingVerb(liveStep?.verb, liveStep?.target) || (chatPending && inBuildChain);

  // Inline run-card anchor. The run card should sit with the turn that produced
  // it, not float below all messages. Rules:
  //  - If a settled run exists and its associated assistant message is in view,
  //    inject the card BEFORE that message (so order is: user → CARD → summary).
  //  - Once backend splits the turn into intent + summary (execution-narrative
  //    handoff), the run's messageId points at the INTENT message and the card
  //    renders immediately after that bubble (intent → CARD → summary).
  //  - During active runs (chatPending/streaming) we fall back to the trailing
  //    card — it's the live surface and there's no settled messageId yet.
  const runCardsByIdx = useMemo(() => {
    const runs = execRuns?.length ? execRuns : execLatestRun ? [execLatestRun] : [];
    const byRunId = new Map(runs.map((run) => [run.id, run]));
    const byMessageId = new Map<number, ApiRun>();
    for (const run of runs) {
      if (run.messageId != null && !byMessageId.has(run.messageId)) {
        byMessageId.set(run.messageId, run);
      }
    }

    const mapped = new Map<number, ApiRun[]>();
    messages.forEach((m, idx) => {
      if (m.role !== "assistant") return;
      const run = m.runId ? byRunId.get(m.runId) : m.id != null ? byMessageId.get(m.id) : undefined;
      if (!run) return;
      const list = mapped.get(idx) ?? [];
      if (!list.some((existing) => existing.id === run.id)) {
        mapped.set(idx, [...list, run]);
      }
    });
    return mapped;
  }, [execRuns, execLatestRun, messages]);

  const latestRunAnchored = useMemo(() => {
    if (!execLatestRun) return false;
    for (const runs of runCardsByIdx.values()) {
      if (runs.some((run) => run.id === execLatestRun.id)) return true;
    }
    return false;
  }, [execLatestRun, runCardsByIdx]);

  // Workspace page load must land at the tail after stored messages hydrate.
  // This is separate from the manual "latest" button and runs inside the actual
  // scroll surface so it waits for the rendered thread, then retries as layout
  // settles from markdown/cards/images.
  // While handoff chrome is locked, skip multi-timer pins (they fight frozen
  // bottom tokens). One pin runs when the lock releases.
  const handoffChromeLocked = useHandoffChromeLock();
  useLayoutEffect(() => {
    if (handoffChromeLocked) return;
    if (initialTailPinnedRef.current) return;
    if (!priorLoaded || messages.length === 0) return;

    initialTailPinnedRef.current = true;
    const pinToTail = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    };

    pinToTail();
    const raf1 = requestAnimationFrame(pinToTail);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(pinToTail));
    const t1 = window.setTimeout(pinToTail, 120);
    const t2 = window.setTimeout(pinToTail, 360);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [messages.length, priorLoaded, scrollRef, handoffChromeLocked]);


  // Detect multi-round build chains so CommitPills can be deduplicated.
  // A chain is: assistant(autoPushed) → user([LOCAL_APPLY_SUCCESS]) → [repeat] → assistant(autoPushed)
  // Intermediate rounds get suppressed; the final round shows a summary pill.
  const { buildGroupMap, suppressedLedgerSet } = useMemo(() => {
    const bgMap = new Map<number, BuildGroupInfo>();
    const supLedger = new Set<number>();

    const isLocalApply = (m: ChatMessage) =>
      m.role === "user" &&
      (m.displayAs === "autoVerify" || m.content.startsWith("[LOCAL_APPLY_SUCCESS]"));

    // Detects an auto-applied build round for both live messages (autoPushed flag)
    // and historical messages loaded from DB (no autoPushed — infer from FILE_EDIT_START
    // content + the fact that the next message is a LOCAL_APPLY_SUCCESS).
    const isAutoAppliedRound = (m: ChatMessage, nextM: ChatMessage | undefined) =>
      m.role === "assistant" && (
        m.autoPushed === true ||
        (/FILE_EDIT_START/i.test(m.content) && nextM != null && isLocalApply(nextM))
      );

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (isAutoAppliedRound(msg, messages[i + 1])) {
        const chainIdxs: number[] = [i];
        const chainLedgerIdxs: number[] = [];
        const allPaths: string[] = [...((msg.fileEdits ?? []).map((e) => e.path ?? ""))];
        let j = i + 1;

        while (j < messages.length) {
          if (isLocalApply(messages[j])) {
            const ledgerIdx = j;
            j++;
            if (j < messages.length && isAutoAppliedRound(messages[j], messages[j + 1])) {
              chainIdxs.push(j);
              chainLedgerIdxs.push(ledgerIdx);
              allPaths.push(...((messages[j].fileEdits ?? []).map((e) => e.path ?? "")));
              j++;
              continue;
            } else {
              // Ledger message after the last auto-applied round — suppress it too
              chainLedgerIdxs.push(ledgerIdx);
            }
          }
          break;
        }

        const uniqueFiles = [...new Set(allPaths.filter(Boolean))];
        const roundCount = chainIdxs.length;

        // Derive build verification status from the last ledger message content.
        // Scan all ledger messages so even an intermediate INTEGRITY_FAILURE is detected.
        const lastLedgerIdx = chainLedgerIdxs[chainLedgerIdxs.length - 1];
        const lastLedgerContent = lastLedgerIdx != null ? messages[lastLedgerIdx]?.content ?? "" : "";
        const buildVerified: boolean | undefined = lastLedgerContent
          ? lastLedgerContent.includes("AUDIT PASSED")
            ? true
            : lastLedgerContent.includes("INTEGRITY FAILURE")
              ? false
              : undefined
          : undefined;

        // Tag all ledger messages in the chain as suppressed — applies to both
        // single-round (trailing audit message) and multi-round (all inter-round messages)
        for (const li of chainLedgerIdxs) supLedger.add(li);

        // Set buildGroupInfo for all auto-apply rounds (single and multi).
        // Multi-round: intermediate rounds suppressed, final gets summary label.
        // Single-round: final gets build status injected into the existing label.
        for (let k = 0; k < chainIdxs.length; k++) {
          bgMap.set(chainIdxs[k], k < chainIdxs.length - 1
            ? { type: "intermediate", roundCount }
            : { type: "final", roundCount, uniqueFiles, buildVerified }
          );
        }

        i = j;
      } else {
        i++;
      }
    }

    return { buildGroupMap: bgMap, suppressedLedgerSet: supLedger };
  }, [messages]);

  // Precompute per-render values that were previously being derived inside messages.map,
  // which caused O(n²) work on every render (once per row × two scans of the full array).
  // Also memoize array transforms passed to child components so their memoization holds.
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  // priorUserMessage[i] = content of the closest user message with index < i.
  const priorUserMessageByIndex = useMemo(() => {
    const out: (string | undefined)[] = new Array(messages.length);
    let last: string | undefined;
    for (let i = 0; i < messages.length; i++) {
      out[i] = last;
      if (messages[i].role === "user") last = messages[i].content;
    }
    return out;
  }, [messages]);

  const historyBoundary = historyMsgCountRef.current ?? 0;

  const timelineRailMessages = useMemo(() => {
    const events: Array<{
      role: "user" | "assistant";
      createdAt?: string;
      hasSurfacedMemory?: boolean;
      text?: string;
      kind?: "message" | "commit" | "session" | "decision" | "run";
      id?: string;
      domIndex?: number;
    }> = messages.map((m, i) => ({
      role: m.role as "user" | "assistant",
      createdAt: m.sentAt,
      hasSurfacedMemory: !!(m.memoryChips && m.memoryChips.length > 0),
      text: m.content,
      kind: "message" as const,
      domIndex: i,
    }));
    // Include activity events (commits, sessions, decisions) so they receive
    // their own date dots and participate in the shared chronological rail.
    (activityEvents ?? []).forEach((ev, k) => {
      events.push({
        role: "assistant",
        createdAt: ev.timestamp,
        kind: ev.type as "commit" | "decision" | "session",
        id: `${ev.type}-${ev.id ?? ev.sha ?? k}`,
        // Anchor index namespace kept disjoint from message indices.
        domIndex: 100_000 + k,
      });
    });
    return events;
  }, [messages, activityEvents]);

  // ---- Inline activity interleaving -----------------------------------------
  // Assign each event to the index of the message AFTER which it should render
  // (based on timestamp). Events newer than the last message go at the tail.
  // On mobile, runs of "quiet" events between two anchors collapse into one
  // BatchedActivityCard; "important" events always render inline immediately.
  const isMobile = useIsMobile();
  const activityByAnchor = useMemo(() => {
    const map = new Map<number, WorkspaceActivityItem[]>();
    if (!activityEvents || activityEvents.length === 0) return map;

    const msgTimes = messages.map((m) => m.sentAt ? new Date(m.sentAt).getTime() : 0);
    for (const ev of activityEvents) {
      const t = new Date(ev.timestamp).getTime();
      let anchor = -1;
      for (let i = 0; i < msgTimes.length; i++) {
        if (msgTimes[i] && msgTimes[i] <= t) anchor = i;
      }
      const arr = map.get(anchor) ?? [];
      arr.push(ev);
      map.set(anchor, arr);
    }
    return map;
  }, [activityEvents, messages]);

  // Newest commit across all anchors gets an accent border on its card.
  const latestCommitKey = useMemo(() => {
    let best: { ts: number; key: string } | null = null;
    for (const [anchor, evs] of activityByAnchor.entries()) {
      evs.forEach((ev, k) => {
        if (ev.type !== "commit") return;
        const ts = new Date(ev.timestamp).getTime();
        if (!best || ts > best.ts) best = { ts, key: `${anchor}:${k}` };
      });
    }
    return (best as { ts: number; key: string } | null)?.key ?? null;
  }, [activityByAnchor]);

  // Global index for each activity event — matches the tlIndex domain used by
  // the TimelineRail (offset by 100_000) so commit/session cards receive their
  // own date dots and participate in the shared chronological rail.
  const activityGlobalIdx = useMemo(() => {
    const m = new Map<WorkspaceActivityItem, number>();
    (activityEvents ?? []).forEach((ev, i) => m.set(ev, i));
    return m;
  }, [activityEvents]);

  const anchorAttrs = (ev: WorkspaceActivityItem) => {
    const g = activityGlobalIdx.get(ev) ?? -1;
    return {
      "data-timeline-index": g >= 0 ? String(100_000 + g) : undefined,
      "data-timeline-kind": ev.type,
      "data-timeline-id": ev.id != null ? String(ev.id) : ev.sha ?? undefined,
      "data-timeline-timestamp": ev.timestamp,
      "data-timeline-project-id": String(ev.projectId),
    } as Record<string, string | undefined>;
  };

  const wrapAnchor = (ev: WorkspaceActivityItem, key: string, node: ReactNode) => (
    <div key={key} {...anchorAttrs(ev)}>{node}</div>
  );

  const renderActivityForAnchor = (anchor: number) => {
    const evs = activityByAnchor.get(anchor);
    if (!evs || evs.length === 0) return null;
    const latestFor = (k: number) => latestCommitKey === `${anchor}:${k}`;
    if (!isMobile) {
      return evs.map((ev, k) => wrapAnchor(
        ev,
        `act-${anchor}-${k}`,
        <SystemActivityCard item={ev} isLatest={latestFor(k)} />,
      ));
    }
    // Mobile: render important immediately, batch consecutive quiet.
    const out: ReactNode[] = [];
    let buf: WorkspaceActivityItem[] = [];
    const flush = (key: string) => {
      if (buf.length === 0) return;
      if (buf.length === 1) out.push(wrapAnchor(buf[0], key, <SystemActivityCard item={buf[0]} />));
      else out.push(<BatchedActivityCard key={key} items={buf} />);
      buf = [];
    };
    evs.forEach((ev, k) => {
      if (classifyActivity(ev) === "important") {
        flush(`act-${anchor}-b-${k}`);
        out.push(wrapAnchor(ev, `act-${anchor}-${k}`, <SystemActivityCard item={ev} isLatest={latestFor(k)} />));
      } else {
        buf.push(ev);
      }
    });
    flush(`act-${anchor}-tail`);
    return out;
  };


  // ---- Suggestion chips -----------------------------------------------------
  // Only when stream is idle AND the last message is a completed assistant msg.
  const lastMsg = messages[messages.length - 1];
  const showSuggestionChips =
    !chatPending &&
    !activityStream.active &&
    lastMsg?.role === "assistant" &&
    !lastMsg.streaming;
  const lastAssistantText = showSuggestionChips ? (lastMsg?.content ?? "") : "";


  // Match home: parent padding "0 24px" + inner scroller paddingRight 80, paddingTop 56.
  // Bottom padding is generous so messages scroll *behind* the translucent glass composer.
  // On mobile, collapse the desktop rail gutter so content is edge-to-edge like /home.
  const composerVisibility = useComposerVisibility();
  const dockedExtraPad = composerVisibility === "docked" ? 72 : 0;
  // Mobile shell already reserves dock + safe-area on the outer workspace
  // container. ChatStream only needs composer clearance so dock toggles don't
  // double-move the scroll surface.
  const bottomPadding = isMobile
    ? `calc(var(--atlas-composer-clearance, 52px) + 24px + ${dockedExtraPad}px)`
    : `calc(var(--atlas-composer-clearance, 0px) + ${28 + dockedExtraPad}px)`;
  const containerStyle: CSSProperties = {
    flex: 1, overflowY: "auto", overflowX: "hidden",
    overscrollBehaviorY: "contain",
    padding: isMobile
      ? `32px 14px ${bottomPadding} 14px`
      : `56px 104px ${bottomPadding} 24px`,
    position: "relative", scrollbarWidth: "none",
    // Match dock/shell easing so bottom chrome moves as one unit.
    transition: handoffChromeLocked
      ? "none"
      : "padding 240ms cubic-bezier(.32,.72,0,1)",
  };


  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <style>{`.atlas-chat-timeline > * + * { margin-top: 10px; }`}</style>
    <div

      ref={scrollRef}
      aria-live="polite"
      aria-label="Joy conversation"
      aria-busy={chatPending ? "true" : "false"}
      onScroll={onScroll}
      style={containerStyle}
      className="scrollbar-none atlas-chat-timeline"
    >
      {messages.length === 0 && !chatPending && priorLoaded !== false && isHomeHandoff && resumeBrief && (
        <div style={{ padding: "36px 4px 16px", display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ maxWidth: 560 }}>
            <p style={{ margin: "0 0 18px", fontSize: 16, lineHeight: 1.6, color: "var(--atlas-fg)", opacity: 0.9, fontWeight: 400, letterSpacing: "-0.005em" }}>
              I brought over the thread.
            </p>

            {resumeBrief.threadSummary && (
              <div style={{ marginBottom: 20 }}>
                <span style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(212,175,55,0.55)", marginBottom: 6 }}>
                  Here's what we established
                </span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "var(--atlas-fg)", opacity: 0.72 }}>
                  {resumeBrief.threadSummary}
                </p>
              </div>
            )}

            {resumeBrief.suggestedFirstBuild && (
              <div style={{ marginBottom: 20 }}>
                <span style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(212,175,55,0.55)", marginBottom: 6 }}>
                  Suggested first build
                </span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--atlas-fg)", opacity: 0.78 }}>
                  {resumeBrief.suggestedFirstBuild}
                </p>
              </div>
            )}

            {resumeBrief.openQuestions.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <span style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>
                  Still open
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {resumeBrief.openQuestions.slice(0, 3).map((q, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 13, marginTop: 1, flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--atlas-fg)", opacity: 0.38 }}>{q}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--atlas-fg)", opacity: 0.55, fontStyle: "italic" }}>
              We can continue from here.
            </p>
          </div>
        </div>
      )}
      {messages.length === 0 && !chatPending && priorLoaded !== false && isHomeHandoff && !resumeBrief && homeHandoffMeta && (
        <div style={{ padding: "52px 20px 32px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ maxWidth: 520, color: "var(--atlas-fg)", fontSize: 15, lineHeight: 1.75, textAlign: "center", opacity: 0.88 }}>
            Picked up where we left off. Your flow map has {homeHandoffMeta.flowNodeCount} nodes — {homeHandoffMeta.goalLabel} is the center. What do you want to tackle first?
          </div>
        </div>
      )}
      {messages.length === 0 && !chatPending && priorLoaded !== false && !isHomeHandoff && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-start",
          padding: "32px 4px 8px", gap: 8,
        }}>
          {greetingLoading ? (
            <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>
              Joy is here…
            </div>
          ) : (() => {
            const a = tier1Memory?.answers;
            const hasRecall = a && (a.building?.trim() || a.audience?.trim() || a.problem?.trim());
            if (hasRecall) {
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 540 }}>
                  <div style={{ color: "var(--atlas-fg)", fontSize: 17, lineHeight: 1.55, fontWeight: 400, letterSpacing: "-0.005em", opacity: 0.92 }}>
                    {atlasGreeting?.trim() || "Here's what I already know about this project."}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {a.building?.trim() && (
                      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                        <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", letterSpacing: "0.1em", textTransform: "uppercase", minWidth: 56, flexShrink: 0 }}>Building</span>
                        <span style={{ fontSize: 14, color: "var(--atlas-fg)", opacity: 0.78, lineHeight: 1.45 }}>{a.building}</span>
                      </div>
                    )}
                    {a.audience?.trim() && (
                      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                        <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", letterSpacing: "0.1em", textTransform: "uppercase", minWidth: 56, flexShrink: 0 }}>For</span>
                        <span style={{ fontSize: 14, color: "var(--atlas-fg)", opacity: 0.78, lineHeight: 1.45 }}>{a.audience}</span>
                      </div>
                    )}
                    {a.problem?.trim() && (
                      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                        <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", letterSpacing: "0.1em", textTransform: "uppercase", minWidth: 56, flexShrink: 0 }}>Solving</span>
                        <span style={{ fontSize: 14, color: "var(--atlas-fg)", opacity: 0.78, lineHeight: 1.45 }}>{a.problem}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            return atlasGreeting?.trim() ? (
              <div style={{ maxWidth: 540, color: "var(--atlas-fg)", fontSize: 17, lineHeight: 1.55, fontWeight: 400, letterSpacing: "-0.005em", opacity: 0.92 }}>
                {atlasGreeting}
              </div>
            ) : null;
          })()}
        </div>
      )}


      {renderActivityForAnchor(-1)}
      {messages.map((msg, i) => {

        const nextMsg = messages[i + 1];
        const isLedgerMsg = msg.role === "user" && isLedgerContent(msg.content);
        // Skip all ledger messages from the chat stream — they belong in the Ledger panel.
        // Also skip any user message tagged for full suppression as part of a build chain.
        if (isLedgerMsg || suppressedLedgerSet.has(i)) {
          return null;
        }

        // While Joy is executing steps the WorkspaceRunCard is the live view.
        // Suppress the last streaming assistant message so the card stands alone.
        if (
          suppressStreamingText &&
          msg.role === "assistant" &&
          msg.streaming &&
          i === messages.length - 1
        ) {
          return null;
        }

        // Agentic loops produce multiple consecutive streaming assistant messages.
        // Suppress any that have no content yet and aren't the last — they'd
        // show as empty "ATLAS · JUST NOW" rows with nothing in them.
        if (
          msg.role === "assistant" &&
          msg.streaming &&
          !msg.content?.trim() &&
          i < messages.length - 1
        ) {
          return null;
        }

        if (msg.role === "assistant" && msg.githubPush && !conversationMode) {
          return (
            <Fragment key={msg.stableKey ?? String(msg.id)}>

              <div data-atlas-msg-idx={i} data-msg-idx={i}>
                <WorkspaceRunCard
                  projectId={projectId}
                  messages={messages.slice(0, i + 1)}
                  projectPreviewUrl={(project as ProjectWithPreview)?.previewUrl ?? null}
                  chatPending={false}
                  liveStep={null}
                  receiptMessage={msg}
                  onTryToFix={() => onSend?.("The last run failed. Please review the error and fix it.")}
                />
              </div>
              {renderActivityForAnchor(i)}
            </Fragment>
          );
        }

        return (
        <Fragment key={msg.stableKey ?? String(msg.id)}>
          {isHomeHandoff && i === 0 && <HomeHandoffDivider projectName={project?.name} />}
          {!conversationMode && msg.role === "assistant" && runCardsByIdx.has(i) && (
            <div data-atlas-run-anchor="inline" style={{ marginBottom: 8 }}>
              {runCardsByIdx.get(i)?.map((run) => (
                <WorkspaceRunCard
                  key={run.id}
                  projectId={projectId}
                  messages={messages.slice(0, i + 1)}
                  projectPreviewUrl={(project as ProjectWithPreview)?.previewUrl ?? null}
                  chatPending={false}
                  liveStep={null}
                  suppressGitHubReceipt
                  suppressDeliverableReceipt={Boolean(messages.find(m => m.role === "assistant" && (m.runId ? m.runId === run.id : run.messageId != null && m.id === run.messageId))?.generatedArtifacts?.length)}
                  executionRun={run}
                  onTryToFix={() => onSend?.("The last run failed. Please review the error and fix it.")}
                />
              ))}
            </div>
          )}
          {msg.role === "user" ? (
            <div data-atlas-msg-idx={i} data-msg-idx={i}>
              {isAutoVerifyMessage(msg) ? (
                <AutoVerifyMessage
                  content={msg.content}
                  executionTimeMs={i > 0 && messages[i - 1]?.role === "assistant" ? messages[i - 1].executionTimeMs : null}
                />
              ) : (
                <UserBubble
                  content={msg.content}
                  sentAt={msg.sentAt}
                  imageB64={msg.imageB64}
                  imageMimeType={msg.imageMimeType}
                  attachments={msg.attachments}
                  onCopy={() => {}}
                  onEdit={() => onEditUserMessage(msg.content)}
                />
              )}
            </div>
          ) : (
            <div data-atlas-msg-idx={i} data-msg-idx={i}>
              <AssistantBubble
                message={msg}
                isNew={msg.role === "assistant" && i >= historyBoundary && i === lastAssistantIdx}
                isLatestAssistant={i === lastAssistantIdx}
                projectId={projectId}
                sessionId={sessionId || 0}
                linkedRepo={linkedRepo as LinkedRepoLike extends infer T ? T : never}
                priorUserMessage={priorUserMessageByIndex[i]}
                onPark={onPark}
                onCommit={onCommit}
                onRegenerate={() => onRegenerate(i)}
                onSend={onSend}
                onPreviewCode={onPreviewCode}
                onRunCommand={onRunCommand}
                onPrCreated={onPrCreated}
                onExtractToForge={onExtractToForge}
                onForgeIntake={onForgeIntake}
                onReviewDiff={onReviewDiff}
                onOpenArtifact={onOpenArtifact}
                onEditDeclined={onEditDeclined}
                onAlertDismiss={() => onAlertDismiss(msg)}
                onStreamActivityUpdate={(content: string) => onStreamActivityUpdate(msg, content)}
                onStreamActivityComplete={onStreamActivityComplete}
                onCommitCardDone={onCommitCardDone}
                planState={planStates.get(msg.id ?? 0) ?? "pending"}
                planExecution={planExecutions.get(msg.id ?? 0)}
                onPlanStateChange={onPlanStateChange}
                onPlanExecutionChange={onPlanExecutionChange}
                onExecuteHomePlan={onExecuteHomePlan}
                onPushSuccess={onPushSuccess}
                onBuildAnyway={onBuildAnyway}
                buildGroupInfo={buildGroupMap.get(i)}
              />
              {!conversationMode && (msg as any).awaitingAuthorization && !msg.streaming && (
                <div style={{ maxWidth: "80%", marginTop: -4, marginBottom: 4, paddingLeft: 4 }}>
                  <BuildContractCard
                    contract={{
                      runId: (msg as any).awaitingAuthorization.runId ?? "",
                      planVersion: (msg as any).awaitingAuthorization.planVersion ?? "",
                      authorizationPolicy: (msg as any).awaitingAuthorization.authorizationPolicy ?? "explicit-confirmation-required",
                      buildType: (msg as any).awaitingAuthorization.buildType,
                      atomicPolicy: (msg as any).awaitingAuthorization.atomicPolicy,
                      estimatedAtomicSteps: (msg as any).awaitingAuthorization.estimatedAtomicSteps,
                      expectedSurfaces: (msg as any).awaitingAuthorization.expectedSurfaces,
                      changesExpected: (msg as any).awaitingAuthorization.changesExpected,
                      previewDestination: (msg as any).awaitingAuthorization.previewDestination,
                      localDevExpected: (msg as any).awaitingAuthorization.localDevExpected,
                      iterationStrategy: (msg as any).awaitingAuthorization.iterationStrategy,
                      verificationCriteria: (msg as any).awaitingAuthorization.verificationCriteria,
                      rollbackTarget: (msg as any).awaitingAuthorization.rollbackTarget,
                      steps: (msg as any).awaitingAuthorization.steps ?? [],
                    }}
                    onAuthorize={() => {
                      const auth = (msg as any).awaitingAuthorization;
                      if (auth?.runId) {
                        authorizeRun?.(auth.runId, auth.planVersion ?? "").catch(() => {});
                      }
                    }}
                    onRevise={() => {
                      onSend?.("Please revise the build plan — I have some changes in mind.");
                    }}
                    onCancel={() => {
                      onSend?.("Cancel the build plan.");
                    }}
                  />
                </div>
              )}
              {!conversationMode && Boolean(msg.terminalCmd || msg.terminalResult) && (
                <div style={{ maxWidth: "80%", marginTop: -18, marginBottom: 24 }}>
                  <InlineTerminalBlock terminalCmd={msg.terminalCmd} terminalResult={msg.terminalResult} projectId={projectId} />
                </div>
              )}
              {!conversationMode && msg.writeFileProposal && !msg.streaming && (
                <div style={{ maxWidth: "80%", marginTop: -8, marginBottom: 4, paddingLeft: 4 }}>
                  <WriteFileCard
                    filePath={msg.writeFileProposal.path}
                    content={msg.content}
                    projectId={projectId}
                    onWriteSuccess={onWriteFile}
                  />
                </div>
              )}
              {!conversationMode && msg.generatedArtifacts && msg.generatedArtifacts.length > 0 && !msg.streaming && (
                <div style={{ maxWidth: "80%", marginTop: -8, marginBottom: 4, paddingLeft: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                  {msg.generatedArtifacts.map((artifact) => (
                    <ArtifactCreatedCard
                      key={artifact.artifactId}
                      artifact={artifact}
                      projectId={projectId}
                      onOpen={() => onOpenArtifact?.(artifact.title)}
                    />
                  ))}
                </div>
              )}
              {/* Execution Journal — shows underneath Joy's prose during active multi-step streams.
                  Model A: WorkspaceRunCard.ActiveCard owns the live step feed, so we skip
                  LiveGenerationCard here and only render the non-generation activity views.
                  Suppressed entirely in Conversation Mode — no tool/build chrome. */}
              {!conversationMode && activityStream.active && i === messages.length - 1 && !liveGeneration.shouldShow && (
                isExecutionStream(activityStream.content) ? (
                  <ExecutionJournal content={activityStream.content} isStreaming={true} />
                ) : (
                  <StepProgress mode="stream" content={activityStream.content} lens={wsLens} />
                )
              )}
            </div>
          )}
          {renderActivityForAnchor(i)}
        </Fragment>
        );
      })}


      {commitCarryover && messages.length > 0 && (
        <>
          <CommitThresholdMarker committedAt={commitCarryover.committedAt} />
          <CommitGreetingBubble
            text={
              commitCarryover.greeting?.trim() ||
              "Okay — this is a project now. Where do you want to take it first?"
            }
          />
        </>
      )}



      {messages.filter(m => m.role !== "user").length >= 60 && !chatPending && wsModel !== "gemini" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, margin: "4px 0 16px",
          padding: "8px 12px", borderRadius: 8,
          background: "rgba(66,133,244,0.06)", border: "1px solid rgba(66,133,244,0.2)",
        }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="6" stroke="rgba(66,133,244,0.7)" strokeWidth="1.3" />
            <path d="M8 5v4M8 10.5v.5" stroke="rgba(66,133,244,0.7)" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-fg)", letterSpacing: "0.04em", flex: 1 }}>
            Long thread. Gemini handles more context without losing the top.
          </span>
          <button
            onClick={onSwitchToGemini}
            style={{
              fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.08em",
              padding: "3px 8px", borderRadius: 4, cursor: "pointer",
              background: "rgba(66,133,244,0.15)", border: "1px solid rgba(66,133,244,0.35)",
              color: "#4285f4", whiteSpace: "nowrap",
            }}
          >
            Switch →
          </button>
        </div>
      )}

      {/* Immediate pending indicator — shows when chatPending=true and the last
          row is still the user message (no optimistic assistant yet). Once an
          empty streaming assistant exists, WorkspaceRunCard owns the pre-token
          “Thinking…” pulse so we don't double-chrome. */}
      {chatPending && !activityStream.active && !thinkingBlock && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
        <ChatPendingIndicator />
      )}

      {!conversationMode && activityStream.active && (messages.length === 0 || messages[messages.length - 1].role === "user") && !liveGeneration.shouldShow ? (
        isExecutionStream(activityStream.content) ? (
          <ExecutionJournal content={activityStream.content} isStreaming={true} />
        ) : (
          <StepProgress mode="stream" content={activityStream.content} lens={wsLens} />
        )
      ) : null}
      {thinkingBlock}

      {/* Trailing run card. Owns the LIVE surface (chatPending/streaming) and
          is the fallback receipt slot. When the latest run is already anchored
          inline with its turn (see loop above) and this trailing instance is
          suppressed so the receipt doesn't double-render. Fully suppressed in
          Conversation Mode. */}
      {!conversationMode && (chatPending || !latestRunAnchored) && (
        <WorkspaceRunCard
          projectId={projectId}
          messages={messages}
          projectPreviewUrl={(project as ProjectWithPreview)?.previewUrl ?? null}
          chatPending={chatPending}
          liveStep={liveStep}
          activeRunId={activeRunId}
          suppressGitHubReceipt
          suppressDeliverableReceipt={Boolean(execLatestRun != null && messages.find(m => m.role === "assistant" && (m.runId ? m.runId === execLatestRun.id : execLatestRun.messageId != null && m.id === execLatestRun.messageId))?.generatedArtifacts?.length)}
          executionRun={execLatestRun}
          onTryToFix={() => onSend?.("The last run failed. Please review the error and fix it.")}
        />
      )}

      {showSuggestionChips && onSuggestionTap && (
        <SuggestionChipRail
          lastAssistantText={lastAssistantText}
          nextSuggestions={lastMsg?.nextSuggestions}
          onTap={onSuggestionTap}
          onLongPress={onSuggestionPark ?? onSuggestionTap}
        />
      )}


      <div ref={bottomRef} />




    </div>
      {showScrollBtn && (
        <button
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") {
              e.preventDefault();
              onScrollToLatest();
            }
          }}
          onClick={(e) => {
            if (e.detail === 0) onScrollToLatest();
          }}
          aria-label="Scroll to latest"
          style={{
            position: "absolute",
            bottom: 14,
            right: 14,
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "color-mix(in oklab, var(--atlas-surface) 55%, transparent)",
            WebkitBackdropFilter: "blur(12px) saturate(1.1)",
            backdropFilter: "blur(12px) saturate(1.1)",
            border: "1px solid color-mix(in oklab, var(--atlas-gold) 40%, transparent)",
            color: "var(--atlas-gold)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 4px 18px rgba(0,0,0,0.25), inset 0 1px 0 color-mix(in oklab, var(--atlas-gold) 18%, transparent), 0 0 10px color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
            zIndex: 50,
            pointerEvents: "auto",
            transition: "background 160ms ease, border-color 160ms ease, transform 120ms ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3.5v9M4.5 9L8 12.5 11.5 9"/>
          </svg>
        </button>
      )}
      {floatingControlsEnabled && (
        <TimelineRail bottomOffset={isMobile ? 228 : 110} messages={timelineRailMessages} />
      )}
    </div>
  );
}
