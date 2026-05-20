import type { CSSProperties, RefObject } from "react";
import { UserBubble } from "@/components/workspace/UserBubble";
import { AtlasActivityBar } from "@/components/workspace/AtlasActivityBar";
import { AssistantBubble } from "@/components/workspace/AssistantBubble";
import { LiveGenerationCard } from "../LiveGenerationCard";
import { GlossaryTip } from "@/components/GlossaryTip";
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

  // empty state
  isHomeHandoff: boolean;
  homeHandoffMeta: HomeHandoffMetaLike;
  isBrandNewProject: boolean;
  project: ProjectLike;
  onStarterPrompt: (label: string) => void;

  // long-thread banner
  wsModel: string;
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
    isHomeHandoff, homeHandoffMeta, isBrandNewProject, project, onStarterPrompt,
    wsModel, onSwitchToGemini,
    onEditUserMessage,
    projectId, sessionId, linkedRepo, trustMode,
    onCatchProceed, onCatchAdjust, onPark, onCommit, onRegenerate,
    onPreviewCode, onRunCommand, onPrCreated, onExtractToForge, onReviewDiff,
    onEditDeclined, onAlertDismiss, onStreamActivityUpdate, onStreamActivityComplete,
    onCommitCardDone, onSurfaceAction,
    planStates, planExecutions, onPlanStateChange, onPlanExecutionChange, onExecuteHomePlan,
    onPushSuccess,
  } = props;

  const containerStyle: CSSProperties = { flex: 1, overflowY: "auto", padding: "28px 22px 12px", position: "relative" };

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
      {messages.length === 0 && !chatPending && isHomeHandoff && homeHandoffMeta && (
        <div style={{ padding: "52px 20px 32px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ maxWidth: 520, color: "var(--atlas-fg)", fontSize: 15, lineHeight: 1.75, textAlign: "center", opacity: 0.88 }}>
            Picked up where we left off. Your flow map has {homeHandoffMeta.flowNodeCount} nodes — {homeHandoffMeta.goalLabel} is the center. What do you want to tackle first?
          </div>
        </div>
      )}
      {messages.length === 0 && !chatPending && !(isHomeHandoff && homeHandoffMeta) && (
        <div style={{ padding: "52px 20px 32px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {isBrandNewProject ? (
              <div style={{ fontSize: 30, fontWeight: 300, color: "var(--atlas-fg)", opacity: 0.75, marginTop: 24, marginBottom: 28, letterSpacing: "-0.025em", lineHeight: 1.2, textAlign: "center", maxWidth: 520 }}>
                New project. Before we build — do you have a <GlossaryTip term="north star">The one outcome that makes everything else worth building.</GlossaryTip> for this? Or should we start from what's in your head?
              </div>
          ) : (
            <>
              <div style={{ fontSize: 30, fontWeight: 300, color: "var(--atlas-fg)", opacity: 0.75, marginTop: 24, marginBottom: 6, letterSpacing: "-0.025em", lineHeight: 1.2, textAlign: "center" }}>
                {project ? project.name : "Ready."}
              </div>
              <div style={{ fontSize: 12, color: "rgba(var(--atlas-muted-rgb),0.4)", marginBottom: 28, textAlign: "center" }}>
                What are we working through today?
              </div>
            </>
          )}
          {/* Starter prompts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 420 }}>
            {[
              { label: "I need to make a decision", sub: "Walk me through it and log it" },
              { label: "I'm not sure which direction to take", sub: "Think out loud, I'll help you see the tension" },
              { label: "Audit my recent decisions", sub: "Review what I've committed to" },
              { label: "I want to map my architecture", sub: "System Map + layer-by-layer spec" },
            ].map((p, i) => (
              <button
                key={i}
                onClick={() => onStarterPrompt(p.label)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  padding: "11px 14px", borderRadius: 9, cursor: "pointer",
                  background: "rgba(201,162,76,0.03)",
                  border: "1px solid rgba(201,162,76,0.08)",
                  textAlign: "left", transition: "all 160ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.07)"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.03)"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.08)"; }}
              >
                <span style={{ fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.8, fontWeight: 500, lineHeight: 1.3 }}>{p.label}</span>
                <span style={{ fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.5, marginTop: 2 }}>{p.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((msg, i) =>
        msg.role === "user" ? (
          <UserBubble
            key={i}
            content={msg.content}
            sentAt={msg.sentAt}
            onCopy={() => {}}
            onEdit={() => onEditUserMessage(msg.content)}
          />
        ) : (
          <AssistantBubble
            key={i}
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
        <AtlasActivityBar content={activityStream.content} />
      ) : null}

      <div ref={bottomRef} />

      {showScrollBtn && (
        <button
          onClick={onScrollToLatest}
          style={{
            position: "sticky",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--atlas-surface)",
            border: "1px solid var(--atlas-gold)",
            borderRadius: 20,
            padding: "6px 16px",
            color: "var(--atlas-gold)",
            fontSize: 12,
            fontFamily: "var(--app-font-mono)",
            cursor: "pointer",
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
            letterSpacing: "0.04em",
            zIndex: 20,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>↓</span> latest
        </button>
      )}
    </div>
  );
}

// Silence unused-imports introduced by Plan/AmbientSurface re-export aliasing.
export type _AmbientSurface = AmbientSurface;
