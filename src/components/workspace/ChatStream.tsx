import type { CSSProperties, RefObject } from "react";
import { UserBubble } from "@/components/workspace/UserBubble";
import { AtlasActivityBar } from "@/components/workspace/AtlasActivityBar";
import { AssistantBubble } from "@/components/workspace/AssistantBubble";
import { InlineTerminalBlock } from "@/components/InlineTerminalBlock";
import { LiveGenerationCard } from "../LiveGenerationCard";
import { TimelineRail } from "../TimelineRail";
import type {
  ChatMessage,
  AmbientSurface,
  LinkedRepo,
  PushRecord,
} from "@/pages/workspace";
import type { PlanExecution } from "@/lib/plan";
import type { Plan } from "@/lib/plan";
import type { PlanState } from "@/components/workspace/chatShared";

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
type PlanExecutionLike = PlanExecution;

function isAutoVerifyMessage(msg: ChatMessage): boolean {
  return msg.displayAs === "autoVerify" || msg.content.startsWith("[FILE_COMMITTED]");
}

function AutoVerifyMessage({ content }: { content: string }) {
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
  historyMsgCountRef: RefObject<number> | { current: number };
  priorLoaded?: boolean;

  // empty state
  isHomeHandoff: boolean;
  homeHandoffMeta: HomeHandoffMetaLike;
  isBrandNewProject: boolean;
  atlasGreeting?: string | null;
  greetingLoading?: boolean;
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
  trustMode: "review" | "auto";

  // assistant bubble — per-message handlers
  onCatchProceed: (msg: ChatMessage) => void;
  onCatchAdjust: (msg: ChatMessage) => void;
  onPark: AssistantBubbleProp<"onPark">;
  onCommit: AssistantBubbleProp<"onCommit">;
  onRegenerate: (index: number) => void;
  onSend?: (message: string) => void;
  onPreviewCode: AssistantBubbleProp<"onPreviewCode">;
  onRunCommand: AssistantBubbleProp<"onRunCommand">;
  onPrCreated: (url: string) => void;
  onExtractToForge: (content: string) => void;
  onReviewDiff: () => void;
  onEditDeclined: () => void;
  onAlertDismiss: (msg: ChatMessage) => void;
  onStreamActivityUpdate: (msg: ChatMessage, content: string) => void;
  onStreamActivityComplete: () => void;
  onCommitCardDone: () => void;
  onSurfaceAction: AssistantBubbleProp<"onSurfaceAction">;

  // plan
  planStates: Map<number, PlanState>;
  planExecutions: Map<number, PlanExecutionLike>;
  onPlanStateChange: (messageId: number, state: PlanState) => void;
  onPlanExecutionChange: (messageId: number, execution: PlanExecutionLike) => void;
  onExecuteHomePlan: (plan: Plan) => void;

  // push
  onPushSuccess: (records: PushRecordLike[]) => void;
}

// Helper alias so we don't re-derive AssistantBubble prop types here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AssistantBubbleProp<K extends string> = any;

export function ChatStream(props: ChatStreamProps) {
  const {
    scrollRef, bottomRef, onScroll, showScrollBtn, onScrollToLatest,
    messages, chatPending, activityStream, liveGeneration, historyMsgCountRef,
    priorLoaded,
    isHomeHandoff, homeHandoffMeta, atlasGreeting, greetingLoading,
    wsModel, wsLens, onSwitchToGemini,
    onEditUserMessage,
    projectId, sessionId, linkedRepo, trustMode,
    onCatchProceed, onCatchAdjust, onPark, onCommit, onRegenerate, onSend,
    onPreviewCode, onRunCommand, onPrCreated, onExtractToForge, onReviewDiff,
    onEditDeclined, onAlertDismiss, onStreamActivityUpdate, onStreamActivityComplete,
    onCommitCardDone, onSurfaceAction,
    planStates, planExecutions, onPlanStateChange, onPlanExecutionChange, onExecuteHomePlan,
    onPushSuccess,
  } = props;

  const containerStyle: CSSProperties = { flex: 1, overflowY: "auto", padding: "12px 22px 12px", position: "relative" };

  return (
    <div
      ref={scrollRef}
      aria-live="polite"
      aria-label="Atlas conversation"
      aria-busy={chatPending ? "true" : "false"}
      onScroll={onScroll}
      style={containerStyle}
      className="scrollbar-none atlas-chat-timeline"
    >
      {messages.length === 0 && !chatPending && priorLoaded !== false && isHomeHandoff && homeHandoffMeta && (
        <div style={{ padding: "52px 20px 32px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ maxWidth: 520, color: "var(--atlas-fg)", fontSize: 15, lineHeight: 1.75, textAlign: "center", opacity: 0.88 }}>
            Picked up where we left off. Your flow map has {homeHandoffMeta.flowNodeCount} nodes — {homeHandoffMeta.goalLabel} is the center. What do you want to tackle first?
          </div>
        </div>
      )}
      {messages.length === 0 && !chatPending && priorLoaded !== false && !(isHomeHandoff && homeHandoffMeta) && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-start",
          flex: 1, padding: "28px 16px", gap: 8,
        }}>
          {greetingLoading ? (
            <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Atlas is thinking…
            </div>
          ) : atlasGreeting ? (
            <div style={{
              maxWidth: 480, background: "var(--atlas-surface)",
              border: "1px solid var(--atlas-border)", borderRadius: 12,
              padding: "14px 16px", color: "var(--atlas-fg)", fontSize: 14, lineHeight: 1.65,
            }}>
              <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--atlas-gold)", textTransform: "uppercase", marginBottom: 8 }}>
                Atlas
              </div>
              {atlasGreeting}
            </div>
          ) : (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              flex: 1, padding: "40px 24px", gap: 12, textAlign: "center", width: "100%",
            }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--atlas-fg)", lineHeight: 1.4 }}>
                What are we solving today?
              </div>
            </div>
          )}
        </div>
      )}

      {messages.map((msg, i) =>
        msg.role === "user" ? (
          <div key={i} data-atlas-msg-idx={i} data-msg-idx={i}>
            {isAutoVerifyMessage(msg) ? (
              <AutoVerifyMessage content={msg.content} />
            ) : (
              <UserBubble
                content={msg.content}
                sentAt={msg.sentAt}
                onCopy={() => {}}
                onEdit={() => onEditUserMessage(msg.content)}
              />
            )}
          </div>
        ) : (
          <div key={i} data-atlas-msg-idx={i} data-msg-idx={i}>

            <AssistantBubble
              message={msg}
              isNew={msg.role === "assistant" && i >= (historyMsgCountRef.current ?? 0) && i === messages.map((m, idx) => m.role === "assistant" ? idx : -1).reduce((a, b) => b > a ? b : a, -1)}
              projectId={projectId}
              sessionId={sessionId || 0}
              linkedRepo={linkedRepo as LinkedRepoLike extends infer T ? T : never}
              onCatchProceed={() => onCatchProceed(msg)}
              onCatchAdjust={() => onCatchAdjust(msg)}
              onPark={onPark}
              onCommit={onCommit}
              onRegenerate={() => onRegenerate(i)}
              onSend={onSend}
              onPreviewCode={onPreviewCode}
              onRunCommand={onRunCommand}
              onPrCreated={onPrCreated}
              onExtractToForge={onExtractToForge}
              onReviewDiff={onReviewDiff}
              onEditDeclined={onEditDeclined}
              onAlertDismiss={() => onAlertDismiss(msg)}
              onStreamActivityUpdate={(content: string) => onStreamActivityUpdate(msg, content)}
              onStreamActivityComplete={onStreamActivityComplete}
              onCommitCardDone={onCommitCardDone}
              onSurfaceAction={onSurfaceAction}
              planState={planStates.get(msg.id ?? 0) ?? "pending"}
              planExecution={planExecutions.get(msg.id ?? 0)}
              onPlanStateChange={onPlanStateChange}
              onPlanExecutionChange={onPlanExecutionChange}
              onExecuteHomePlan={onExecuteHomePlan}
              trustMode={trustMode}
              onPushSuccess={onPushSuccess}
            />
            {Boolean(msg.terminalCmd || msg.terminalResult) && (
              <div style={{ maxWidth: "80%", marginTop: -18, marginBottom: 24 }}>
                <InlineTerminalBlock terminalCmd={msg.terminalCmd} terminalResult={msg.terminalResult} projectId={projectId} />
              </div>
            )}
          </div>
        )
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

      {activityStream.active && liveGeneration.shouldShow ? (
        <LiveGenerationCard
          mode={liveGeneration.mode as never}
          steps={liveGeneration.steps as never}
          isComplete={false}
        />
      ) : activityStream.active ? (
        <AtlasActivityBar content={activityStream.content} lens={wsLens} />
      ) : null}

      <div ref={bottomRef} />

      {showScrollBtn && (
        <button
          onClick={onScrollToLatest}
          aria-label="Scroll to latest"
          style={{
            position: "sticky",
            bottom: 12,
            left: "100%",
            transform: "translateX(-100%)",
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
            zIndex: 5,
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10M4 9l4 4 4-4"/>
          </svg>
        </button>
      )}

      <TimelineRail messages={messages.map((m) => ({ role: m.role as "user" | "assistant", createdAt: m.sentAt }))} />
    </div>
  );
}

// Silence unused-imports introduced by Plan/AmbientSurface re-export aliasing.
export type _AmbientSurface = AmbientSurface;
