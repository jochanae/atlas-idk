import { Fragment, useMemo, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { UserBubble } from "@/components/workspace/UserBubble";
import { AtlasActivityBar } from "@/components/workspace/AtlasActivityBar";
import { AssistantBubble, type BuildGroupInfo } from "@/components/workspace/AssistantBubble";
import InlineSketchOffer from "@/components/chat/InlineSketchOffer";
import { InlineTerminalBlock } from "@/components/InlineTerminalBlock";
import { LiveGenerationCard } from "@/components/workspace/LiveGenerationCard";
import { ExecutionJournal, LedgerSurface, isExecutionStream } from "@/components/workspace/ExecutionJournal";
import { TimelineRail } from "../TimelineRail";
import { WriteFileCard } from "@/components/workspace/WriteFileCard";

import type { ChatMessage, LinkedRepo, PushRecord } from "@/pages/workspace";
import type { PlanExecution } from "@/lib/plan";
import type { Plan } from "@/lib/plan";
import type { PlanState } from "@/components/workspace/chatShared";
import type { ResumeBrief } from "@/hooks/useProjectResume";

// Minimal structural types — avoid importing private types from workspace.tsx
type ProjectLike = { name?: string } | null | undefined;
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

function isAutoVerifyMessage(msg: ChatMessage): boolean {
  return msg.displayAs === "autoVerify" || msg.content.startsWith("[FILE_COMMITTED]") || msg.content.startsWith("[LOCAL_APPLY_SUCCESS]");
}

function isLedgerContent(content: string): boolean {
  return content.startsWith("[FILE_COMMITTED]") || content.startsWith("[LOCAL_APPLY_SUCCESS]");
}

function AutoVerifyMessage({ content, executionTimeMs }: { content: string; executionTimeMs?: number | null }) {
  if (isLedgerContent(content)) {
    return <LedgerSurface content={content} executionTimeMs={executionTimeMs} />;
  }
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
}

// Helper alias so we don't re-derive AssistantBubble prop types here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AssistantBubbleProp<K extends string> = any;

export function ChatStream(props: ChatStreamProps) {
  const {
    scrollRef, bottomRef, onScroll, showScrollBtn, onScrollToLatest,
    messages, chatPending, activityStream, liveGeneration, thinkingBlock, historyMsgCountRef,
    priorLoaded,
    isHomeHandoff, homeHandoffMeta, atlasGreeting, greetingLoading, resumeBrief, project,
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
  } = props;

  // Detect multi-round build chains so CommitPills can be deduplicated.
  // A chain is: assistant(autoPushed) → user([LOCAL_APPLY_SUCCESS]) → [repeat] → assistant(autoPushed)
  // Intermediate rounds get suppressed; the final round shows a summary pill.
  const { buildGroupMap, suppressedLedgerSet } = useMemo(() => {
    const bgMap = new Map<number, BuildGroupInfo>();
    const supLedger = new Set<number>();

    const isLocalApply = (m: ChatMessage) =>
      m.role === "user" &&
      (m.displayAs === "autoVerify" || m.content.startsWith("[LOCAL_APPLY_SUCCESS]"));

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.autoPushed) {
        const chainIdxs: number[] = [i];
        const chainLedgerIdxs: number[] = [];
        const allPaths: string[] = [...((msg.fileEdits ?? []).map((e) => e.path ?? ""))];
        let j = i + 1;

        while (j < messages.length) {
          if (isLocalApply(messages[j])) {
            const ledgerIdx = j;
            j++;
            if (j < messages.length && messages[j].role === "assistant" && messages[j].autoPushed) {
              chainIdxs.push(j);
              chainLedgerIdxs.push(ledgerIdx);
              allPaths.push(...((messages[j].fileEdits ?? []).map((e) => e.path ?? "")));
              j++;
              continue;
            } else {
              // Ledger message after the last autoPushed round — suppress it too
              chainLedgerIdxs.push(ledgerIdx);
            }
          }
          break;
        }

        const uniqueFiles = [...new Set(allPaths.filter(Boolean))];
        const roundCount = chainIdxs.length;

        // Only apply deduplication when there are 2+ rounds
        if (roundCount > 1) {
          for (const li of chainLedgerIdxs) supLedger.add(li);
          for (let k = 0; k < chainIdxs.length; k++) {
            bgMap.set(chainIdxs[k], k < chainIdxs.length - 1
              ? { type: "intermediate", roundCount }
              : { type: "final", roundCount, uniqueFiles }
            );
          }
        }

        i = j;
      } else {
        i++;
      }
    }

    return { buildGroupMap: bgMap, suppressedLedgerSet: supLedger };
  }, [messages]);

  // Match home: parent padding "0 24px" + inner scroller paddingRight 80, paddingTop 56.
  // Bottom padding is generous so messages scroll *behind* the translucent glass composer.
  // On mobile, collapse the desktop rail gutter so content is edge-to-edge like /home.
  const isMobile = useIsMobile();
  const containerStyle: CSSProperties = {
    flex: 1, overflowY: "auto", overflowX: "hidden",
    overscrollBehaviorY: "contain",
    padding: isMobile ? "32px 14px 20px 14px" : "56px 104px 28px 24px",
    position: "relative", scrollbarWidth: "none",
  };

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
    <div

      ref={scrollRef}
      aria-live="polite"
      aria-label="Atlas conversation"
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
              Atlas is here…
            </div>
          ) : (
            <div style={{
              maxWidth: 540,
              color: "var(--atlas-fg)",
              fontSize: 17,
              lineHeight: 1.55,
              fontWeight: 400,
              letterSpacing: "-0.005em",
              opacity: 0.92,
            }}>
              {atlasGreeting?.trim() || "What are we shaping here?"}
            </div>
          )}
        </div>
      )}


      {messages.map((msg, i) => {
        // When a LOCAL_APPLY_SUCCESS follows an assistant message, we render
        // the LedgerSurface *after* that assistant bubble (sentence first, then
        // the APPLIED block).  Skip it here so it isn't double-rendered.
        const nextMsg = messages[i + 1];
        const prevMsg = messages[i - 1];
        const isLedgerMsg = msg.role === "user" && isLedgerContent(msg.content);
        const prevWasAssistant = prevMsg?.role === "assistant";
        if (isLedgerMsg && prevWasAssistant) {
          return null;
        }
        const nextIsLedger = nextMsg?.role === "user" && isLedgerContent(nextMsg.content);

        return (
        <Fragment key={i}>
          {isHomeHandoff && i === 0 && <HomeHandoffDivider projectName={project?.name} />}
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
                isNew={msg.role === "assistant" && i >= (historyMsgCountRef.current ?? 0) && i === messages.map((m, idx) => m.role === "assistant" ? idx : -1).reduce((a, b) => b > a ? b : a, -1)}
                projectId={projectId}
                sessionId={sessionId || 0}
                linkedRepo={linkedRepo as LinkedRepoLike extends infer T ? T : never}
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
              {Boolean(msg.terminalCmd || msg.terminalResult) && (
                <div style={{ maxWidth: "80%", marginTop: -18, marginBottom: 24 }}>
                  <InlineTerminalBlock terminalCmd={msg.terminalCmd} terminalResult={msg.terminalResult} projectId={projectId} />
                </div>
              )}
              {msg.writeFileProposal && !msg.streaming && (
                <div style={{ maxWidth: "80%", marginTop: -8, marginBottom: 4, paddingLeft: 4 }}>
                  <WriteFileCard
                    filePath={msg.writeFileProposal.path}
                    content={msg.content}
                    projectId={projectId}
                    onWriteSuccess={onWriteFile}
                  />
                </div>
              )}
              {/* Execution Journal — shows underneath Atlas's prose during active multi-step streams */}
              {activityStream.active && i === messages.length - 1 && (
                liveGeneration.shouldShow ? (
                  <LiveGenerationCard
                    mode={liveGeneration.mode as never}
                    steps={liveGeneration.steps as never}
                    isComplete={false}
                  />
                ) : isExecutionStream(activityStream.content) ? (
                  <ExecutionJournal content={activityStream.content} isStreaming={true} />
                ) : (
                  <AtlasActivityBar content={activityStream.content} lens={wsLens} />
                )
              )}
            </div>
          )}
          {/* LedgerSurface hoisted above: show AFTER the assistant sentence.
              Suppress it when it is an intermediate inter-round message in a
              multi-round build chain (suppressedLedgerSet tracks those indices). */}
          {msg.role === "assistant" && nextIsLedger && nextMsg && !suppressedLedgerSet.has(i + 1) && (
            <AutoVerifyMessage
              content={nextMsg.content}
              executionTimeMs={nextMsg.executionTimeMs}
            />
          )}
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

      {activityStream.active && (messages.length === 0 || messages[messages.length - 1].role === "user") ? (
        liveGeneration.shouldShow ? (
          <LiveGenerationCard
            mode={liveGeneration.mode as never}
            steps={liveGeneration.steps as never}
            isComplete={false}
          />
        ) : isExecutionStream(activityStream.content) ? (
          <ExecutionJournal content={activityStream.content} isStreaming={true} />
        ) : (
          <AtlasActivityBar content={activityStream.content} lens={wsLens} />
        )
      ) : null}
      {thinkingBlock}


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
            bottom: 10,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--atlas-surface)",
            border: "1px solid var(--atlas-gold)",
            color: "var(--atlas-gold)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            zIndex: 50,
            pointerEvents: "auto",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10M4 9l4 4 4-4"/>
          </svg>
        </button>
      )}
      <TimelineRail bottomOffset={isMobile ? 228 : 110} messages={messages.map((m) => ({ role: m.role as "user" | "assistant", createdAt: m.sentAt, hasSurfacedMemory: !!(m.memoryChips && m.memoryChips.length > 0), text: m.content }))} />
    </div>
  );
}
