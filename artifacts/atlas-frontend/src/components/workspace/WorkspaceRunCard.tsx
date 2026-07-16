/**
 * WorkspaceRunCard — live communication layer + receipt for workspace builds.
 *
 * TWO MODES:
 *
 * 1. ACTIVE (chatPending=true or last message streaming):
 *    Single compact card. Shows the live atomic step ("Reading home.tsx",
 *    "Writing App.tsx") as the headline, and a short task description as
 *    the subtitle. Gold shimmer sweep + pulsing accent bar communicate
 *    that work is in progress. No step history list — one card, one surface.
 *
 * 2. RECEIPT (generation complete, file output detected):
 *    Transitions into Run Complete with a perimeter border animation.
 *    Details + Preview buttons revealed. Hides once the user has continued.
 *
 * Props:
 *   chatPending — true while waiting for first token OR during agentic loops
 *   liveStep    — latest step event from SSE { verb, target?, status? }
 *   messages    — full ChatMessage[] for receipt derivation
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Bookmark, Github, ImageIcon, Terminal, Eye, FilePenLine, Circle, FileCode } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ChatMessage } from "@/pages/workspace";
import type { GithubPushPayload } from "@/lib/githubPushReceipt";
import type { ApiRun } from "@/hooks/useProjectRuns";
import {
  addSnapshot,
  toggleBookmark as toggleHistoryBookmark,
  useAtlasHistory,
} from "@/lib/atlas-history";
import { useReadingDensity } from "@/hooks/useComposerVisibility";
import { dispatchVerifyRun } from "@/lib/verification";
import { useWorkspaceEvent } from "@/lib/workspaceEventBus";
import { useQueryClient } from "@tanstack/react-query";
import { EXECUTION_VERBS, doingLabel, thinkingLabel, isDoingVerb } from "@/lib/runStepLabels";

interface LiveStepItem {
  verb: string;
  target?: string;
}

interface Props {
  projectId: number;
  messages: ChatMessage[];
  projectPreviewUrl?: string | null;
  chatPending?: boolean;
  liveStep?: { verb: string; target?: string; status?: string; runId?: string } | null;
  /** Stable identity for the in-flight turn. Enables tap-to-open on the
   *  ActiveCard so the Timeline/Changes drawer deep-links to the same runId
   *  that will later back the completed receipt. */
  activeRunId?: string | null;
  onTryToFix?: () => void;
  receiptMessage?: ChatMessage | null;
  suppressGitHubReceipt?: boolean;
  /** Task #171: the inline ArtifactCreatedCard already renders the deliverable
   *  receipt anchored to its message — suppress the trailing run card's own
   *  deliverable UI so the same output isn't announced twice. */
  suppressDeliverableReceipt?: boolean;
  /** Phase 3: pre-fetched latest run from execution_runs table.
   *  When null and isActive=false, no trailing card is rendered. */
  executionRun?: ApiRun | null;
}

type DerivedStatus = "running" | "applied" | "failed" | "pushed" | "sketched" | "delivered" | "insight";
type PreviewSource = "sandbox" | "generated" | "local" | "url" | null;

interface DerivedRun {
  id: string;
  associatedMessageId: number | null;
  status: DerivedStatus;
  title: string;
  executiveSummary?: string;
  createdAt: number;
  elapsedMs: number | null;
  files: string[];
  produced: string[];
  previewSource: PreviewSource;
  previewPath: string | null;
  error?: string;
  githubPush?: GithubPushPayload;
  sketchImageUrl?: string;
  deliverable?: { name: string; downloadUrl: string };
  /** Semantic kicker for insight-only receipts (e.g. "Decision shaped"). Only set when status === "insight". */
  insightKicker?: string;
}

// Insight-only step verbs that still warrant a durable receipt card (something
// the user may want to revisit later) but never a "Run Complete" build kicker.
// Each maps to a semantic, event-type-specific kicker per task #162.
const INSIGHT_KICKERS: Record<string, string> = {
  DECISION_RECORDED: "Decision shaped",
  DNA_UPDATED: "Requirement clarified",
};

const PRODUCED_EXT = /\.(html?|pdf|md|png|jpe?g|gif|svg|webp)$/i;
const APP_FILE_RE = /(^|\/)(src\/|app\/|pages\/|routes\/|package\.json$|vite\.config|tailwind\.config)/i;

function adaptExecutionRun(
  run: ApiRun,
  messages: ChatMessage[],
  projectPreviewUrl?: string | null,
  suppressDeliverable?: boolean,
): DerivedRun | null {
  // Receipt eligibility — a run only produces a durable receipt card when at
  // least one step is a real side effect (file write, build/tool execution,
  // GitHub push, image/artifact generation, or persistent insight like a DNA
  // field update). Pure conversational turns — including ones that asked a
  // question, recorded a decision, or read files for context — never get a
  // "RUN COMPLETE" receipt; their outcome is already in the prose, Timeline,
  // and Ledger.
  const RECEIPT_WORTHY = new Set([
    "FILE_EDIT", "FILE_DELETE", "LINE_PATCH",
    "GITHUB_PUSH", "IMAGE_GEN", "ARTIFACT_CREATED",
    "DNA_UPDATED",
    "COMMAND", "SHELL", "BUILD", "INSTALL", "TEST", "RUN",
  ]);
  // In-flight runs (pre-inserted `running` rows from the identity spine) never
  // render as a completed receipt — the live ActiveCard owns that surface until
  // the row terminalizes to succeeded/failed.
  if (run.status === "running") return null;
  if (!run.steps.some(s => RECEIPT_WORTHY.has(s.verb))) return null;

  // Anchor stability — once a receipt has a messageId, it stays anchored in
  // its historical position even as the conversation continues. Only hide
  // when we have no anchor at all AND the tail is a pending user turn (to
  // avoid a truly orphaned trailing card).
  if (run.messageId !== null) {
    const msgIdx = messages.findIndex(m => m.id === run.messageId);
    if (msgIdx === -1) {
      const last = messages[messages.length - 1];
      if (last?.role === "user") return null;
    }
  } else {
    const last = messages[messages.length - 1];
    if (last?.role === "user") return null;
  }

  const hasGithubPush = run.steps.some(s => s.verb === "GITHUB_PUSH");
  const hasImageGen = run.steps.some(s => s.verb === "IMAGE_GEN");
  const hasFileWork = run.steps.some(
    s => s.verb === "FILE_EDIT" || s.verb === "FILE_DELETE" || s.verb === "LINE_PATCH",
  );
  const deliverableStep = suppressDeliverable
    ? undefined
    : run.steps.find(s => s.verb === "ARTIFACT_CREATED");

  // Steps that don't count as "real execution" for status derivation below.
  const CONVERSATIONAL_ONLY = new Set(["PROMPT", "THOUGHT", "SUMMARY", "DECISION", "QUESTION_ASKED", "FILE_READ", "TREE", "FETCH", "DECISION_RECORDED"]);

  // Extract executive summary from the SUMMARY step (nexus workspace turns write this).
  const summaryStep = run.steps.find(s => s.verb === "SUMMARY");
  const executiveSummary = summaryStep?.content?.trim() || undefined;

  // Steps that drove `hasRealExecution` but are otherwise pure insight capture
  // (no file edits, image, push, or deliverable) — e.g. a ledger decision or a
  // DNA/requirement field update. These are durable enough to keep a card for,
  // but must never claim "Run Complete" since nothing was built.
  const nonConversationalSteps = run.steps.filter(s => !CONVERSATIONAL_ONLY.has(s.verb));
  const insightOnly =
    nonConversationalSteps.length > 0 &&
    nonConversationalSteps.every(s => s.verb in INSIGHT_KICKERS) &&
    !hasGithubPush && !hasImageGen && !hasFileWork && !deliverableStep;
  const insightKicker = insightOnly
    ? INSIGHT_KICKERS[nonConversationalSteps[0].verb] ?? "Insight captured"
    : undefined;

  let status: DerivedStatus;
  if (run.status === "failed") status = "failed";
  else if (deliverableStep) status = "delivered";
  else if (hasGithubPush) status = "pushed";
  else if (hasImageGen && !hasFileWork) status = "sketched";
  else if (insightOnly) status = "insight";
  else status = "applied";

  const pathSet = new Set<string>();
  for (const step of run.steps) {
    if (
      (step.verb === "FILE_EDIT" || step.verb === "FILE_DELETE" || step.verb === "LINE_PATCH") &&
      step.target
    ) {
      pathSet.add(step.target);
    }
  }
  const files = Array.from(pathSet);
  const produced = files.filter(p => PRODUCED_EXT.test(p));

  let title: string;
  if (deliverableStep) {
    const name = deliverableStep.target ? deliverableStep.target.split("/").pop() ?? deliverableStep.target : "your file";
    title = `${name} is ready`;
  } else if (files.length > 0) {
    const count = files.length;
    const names = files.slice(0, 2).map(p => p.split("/").pop() ?? p);
    const label = names.join(", ") + (count > 2 ? ` +${count - 2} more` : "");
    title = `${count} file${count !== 1 ? "s" : ""} written — ${label}`;
  } else if (run.messageId !== null) {
    title = run.summary || "Run";
  } else {
    const firstStep = run.steps[0];
    title =
      run.summary ||
      (firstStep ? `${firstStep.verb}${firstStep.target ? ` ${firstStep.target}` : ""}` : "Build run");
  }
  if (title.length > 140) title = title.slice(0, 137) + "…";

  let sketchImageUrl: string | undefined;
  if (hasImageGen && run.messageId !== null) {
    const msg = messages.find(m => m.id === run.messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sketchImageUrl = (msg as any)?.imageGen?.images?.[0]?.imageUrl;
  }

  const hasAppFile = files.some(f => APP_FILE_RE.test(f));
  let previewSource: PreviewSource = null;
  let previewPath: string | null = null;
  if (produced.length > 0) {
    previewSource = "generated";
    previewPath = produced[0];
  } else if (hasAppFile && projectPreviewUrl) {
    previewSource = "local";
    previewPath = projectPreviewUrl;
  }

  let githubPush: GithubPushPayload | undefined;
  if (hasGithubPush) {
    if (run.messageId !== null) {
      const msg = messages.find(m => m.id === run.messageId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((msg as any)?.githubPush) githubPush = (msg as any).githubPush as GithubPushPayload;
    }
    if (!githubPush) {
      const pushStep = run.steps.find(s => s.verb === "GITHUB_PUSH");
      if (pushStep?.target) {
        githubPush = { branch: pushStep.target, message: "", files: [], repo: "", sha: "", url: "" } as GithubPushPayload;
      }
    }
  }

  let deliverable: { name: string; downloadUrl: string } | undefined;
  if (deliverableStep) {
    const name = deliverableStep.target
      ? deliverableStep.target.split("/").pop() ?? deliverableStep.target
      : "file";
    // Backend writes artifactUrl as "artifact://<id>" — resolve to the real download route.
    const rawUrl = deliverableStep.artifactUrl ?? "";
    const artifactId = rawUrl.startsWith("artifact://") ? rawUrl.slice("artifact://".length) : rawUrl;
    if (artifactId) {
      deliverable = {
        name,
        downloadUrl: `/api/projects/${run.projectId}/artifacts/${artifactId}/download`,
      };
    }
  }

  const failStep = run.steps.find(s => s.status === "fail");
  // Task #158: Atlas must never say "I can't generate X" — a deliverable that
  // was generated but failed to persist/deliver downstream is still a failure
  // receipt, but the copy must reflect delivery failure, not generation refusal.
  const error =
    run.status === "failed"
      ? deliverableStep
        ? "Generated, but delivery failed — try again."
        : (failStep?.detail ?? failStep?.verb ?? "Build failed")
      : undefined;

  return {
    id: run.id,
    associatedMessageId: run.messageId,
    status,
    title,
    ...(executiveSummary ? { executiveSummary } : {}),
    createdAt: new Date(run.startedAt).getTime(),
    elapsedMs: run.elapsedMs,
    files,
    produced,
    previewSource,
    previewPath,
    ...(error ? { error } : {}),
    ...(githubPush ? { githubPush } : {}),
    ...(sketchImageUrl ? { sketchImageUrl } : {}),
    ...(deliverable ? { deliverable } : {}),
    ...(insightKicker ? { insightKicker } : {}),
  };
}

const previewUrlStorageKey = (projectId: number | string) =>
  `atlas-preview-${projectId}`;

function getSavedPreviewUrl(projectId: number | string): string | null {
  try {
    const value = window.localStorage.getItem(previewUrlStorageKey(projectId));
    return value?.trim() || null;
  } catch {
    return null;
  }
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function deriveGithubReceipt(msg: ChatMessage): DerivedRun | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const push = (msg as any).githubPush as GithubPushPayload | undefined;
  if (!push) return null;
  const title = ((msg.content ?? "").split("\n").find((l) => l.trim()) ?? "GitHub Push").slice(0, 140);
  const createdAt = msg.sentAt ? new Date(msg.sentAt).getTime() : Date.now();
  const id = msg.id != null ? String(msg.id) : `receipt-${createdAt}`;
  return {
    id,
    associatedMessageId: typeof msg.id === "number" ? msg.id : null,
    status: "pushed",
    title,
    createdAt,
    elapsedMs: typeof msg.executionTimeMs === "number" ? msg.executionTimeMs : null,
    files: [],
    produced: [],
    previewSource: null,
    previewPath: null,
    githubPush: push,
  };
}

function findFileContent(messages: ChatMessage[], filePath: string): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const edits = msg.fileEdits ?? (msg.fileEdit ? [msg.fileEdit] : []);
    const match = edits.find((e) => e.path === filePath);
    if (match && match.content) return match.content;
  }
  return null;
}

const RECEIPT_TONE: Record<
  "running" | "success" | "failed" | "pushed" | "sketched" | "delivered" | "insight",
  { border: string; ring: string; fg: string; iconBg: string; cardBg: string }
> = {
  // Insight receipts (decision shaped, requirement clarified, etc.) are neutral
  // and quiet — they should never read as a build/success flash.
  insight: {
    border: "hsl(var(--border))",
    ring: "transparent",
    fg: "hsl(var(--muted-foreground))",
    iconBg: "hsl(var(--muted))",
    cardBg: "hsl(var(--card))",
  },
  running: {
    border: "var(--atlas-gold-border)",
    ring: "transparent",
    fg: "var(--atlas-gold)",
    iconBg: "var(--atlas-gold-dim)",
    cardBg: "hsl(var(--card))",
  },
  // Success/failed borders are momentary status flashes — the persistent
  // resting state is neutral so the card doesn't scream in the thread.
  success: {
    border: "hsl(var(--border))",
    ring: "transparent",
    fg: "#4ade80",
    iconBg: "rgba(74,222,128,0.12)",
    cardBg: "hsl(var(--card))",
  },
  failed: {
    border: "hsl(var(--border))",
    ring: "transparent",
    fg: "#f87171",
    iconBg: "rgba(248,113,113,0.12)",
    cardBg: "hsl(var(--card))",
  },
  pushed: {
    border: "hsl(var(--border))",
    ring: "transparent",
    fg: "hsl(var(--card-foreground))",
    iconBg: "hsl(var(--muted))",
    cardBg: "hsl(var(--card))",
  },
  sketched: {
    border: "var(--atlas-gold-border)",
    ring: "rgba(201,162,76,0.07)",
    fg: "var(--atlas-gold)",
    iconBg: "var(--atlas-gold-dim)",
    cardBg: "hsl(var(--card))",
  },
  delivered: {
    border: "hsl(var(--border))",
    ring: "transparent",
    fg: "#4ade80",
    iconBg: "rgba(74,222,128,0.12)",
    cardBg: "hsl(var(--card))",
  },
};

function ReceiptIcon({ status }: { status: DerivedStatus }) {
  if (status === "applied") return <CheckCircle2 size={12} strokeWidth={1.75} />;
  if (status === "delivered") return <CheckCircle2 size={12} strokeWidth={1.75} />;
  if (status === "failed") return <XCircle size={12} strokeWidth={1.75} />;
  if (status === "pushed") return <Github size={12} strokeWidth={1.75} />;
  if (status === "sketched") return <ImageIcon size={12} strokeWidth={1.75} />;
  if (status === "insight") return <Circle size={9} strokeWidth={2} fill="currentColor" />;
  return null;
}

/** Map a step verb+target to a display icon and short action label. */
function liveStepMeta(step?: LiveStepItem): { Icon: LucideIcon; headline: string } {
  const verb = step?.verb ?? "";
  const target = step?.target ?? "";
  const filename = target ? target.split("/").pop() ?? target : "";
  const lower = verb.toLowerCase();

  if (/github[_-]?push|push/.test(lower)) {
    return { Icon: Github, headline: target ? `Pushing to ${target}` : "Pushing to GitHub" };
  }
  if (/writ|creat|generat/.test(lower)) {
    return { Icon: FilePenLine, headline: filename ? `Writing ${filename}` : "Writing file" };
  }
  if (/patch|apply|line_patch/.test(lower)) {
    return { Icon: FilePenLine, headline: filename ? `Patching ${filename}` : "Applying patch" };
  }
  if (/edit|file_edit/.test(lower)) {
    return { Icon: FilePenLine, headline: filename ? `Editing ${filename}` : "Editing file" };
  }
  if (/read|inspect|scan|open/.test(lower)) {
    return { Icon: Eye, headline: filename ? `Reading ${filename}` : "Reading file" };
  }
  if (/^tree$/.test(lower)) {
    return { Icon: Eye, headline: "Reading project structure" };
  }
  if (/command|terminal|shell|exec|install|build|test|check/.test(lower)) {
    return { Icon: Terminal, headline: target ? `Running ${target}` : "Running command" };
  }
  if (/fetch|visit|scrape|research/.test(lower)) {
    return { Icon: Eye, headline: target ? `Fetching ${target}` : "Fetching data" };
  }
  if (/analyz|assess/.test(lower)) {
    return { Icon: Circle, headline: "Working…" };
  }
  if (verb) {
    const display = target ? `${verb} ${filename || target}` : verb;
    return { Icon: Circle, headline: display.length > 60 ? display.slice(0, 57) + "…" : display };
  }
  return { Icon: Circle, headline: "Working…" };
}


/**
 * Lightweight inline status shown for conversational/thinking-only turns.
 * A single shimmer line — no card, no border, no title row.
 * Disappears as soon as Atlas's response text begins streaming.
 */
function InlineThinkingPulse({ steps }: { steps: LiveStepItem[] }) {
  const current = steps[steps.length - 1];
  const label = thinkingLabel(current?.verb, current?.target);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        margin: "4px 0 2px",
        padding: "5px 0",
        position: "relative",
        overflow: "hidden",
      }}
      data-wrc-thinking="true"
    >
      {/* Shimmer text */}
      <span
        style={{
          fontFamily: "var(--app-font-mono, monospace)",
          fontSize: 11.5,
          letterSpacing: "0.06em",
          color: "color-mix(in oklab, var(--atlas-gold) 55%, var(--atlas-muted))",
          background:
            "linear-gradient(90deg, color-mix(in oklab, var(--atlas-gold) 45%, transparent) 0%, color-mix(in oklab, var(--atlas-gold) 85%, transparent) 40%, color-mix(in oklab, var(--atlas-gold) 45%, transparent) 100%)",
          backgroundSize: "200% auto",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          animation: "wrc-text-shimmer 2.2s linear infinite",
        }}
      >
        {label}
      </span>
      <style>{`
        @keyframes wrc-text-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>
    </div>
  );
}

/** The live execution card shown while Atlas is working.
 *  Shows a growing list of task-level steps (file writes, commands, pushes),
 *  each with an individual spinner → checkmark as they complete in sequence.
 *  Non-task (read/think) steps appear as a muted subtitle, not as list rows.
 *  Tapping the card (when a runId is available) opens Timeline/Changes for
 *  the in-flight run — the same identity that will later carry the receipt. */
function ActiveCard({ steps, taskGoal, runId }: { steps: LiveStepItem[]; taskGoal: string; runId?: string | null }) {
  // Split steps into task-worthy rows (file writes, commands, pushes, etc.)
  // and ambient context steps (reads, thinks). Only task-worthy steps appear
  // as list rows; context steps become the muted subtitle.
  const taskSteps = steps.filter(s => isDoingVerb(s.verb));

  // Last non-task step → subtitle. Gives context for what Atlas reviewed
  // before / between task steps without adding noise to the list.
  let subtitleText: string | null = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (!isDoingVerb(steps[i].verb)) {
      subtitleText = thinkingLabel(steps[i].verb, steps[i].target);
      break;
    }
  }

  // Cap list at 5 visible rows; summarise older steps with an overflow counter.
  const MAX_VISIBLE = 5;
  const hiddenCount = Math.max(0, taskSteps.length - MAX_VISIBLE);
  const visibleSteps = taskSteps.slice(-MAX_VISIBLE);

  const clickable = !!runId;
  const openTimeline = () => {
    if (!runId) return;
    window.dispatchEvent(new CustomEvent("axiom:open-changes", { detail: { runId } }));
  };

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? "Open Timeline for the in-flight run" : undefined}
      onClick={clickable ? openTimeline : undefined}
      onKeyDown={clickable
        ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTimeline(); } }
        : undefined}
      style={{
        position: "relative",
        background: "hsl(var(--card))",
        border: "1px solid rgba(139, 92, 246, 0.45)",
        borderRadius: 12,
        padding: "12px 14px",
        margin: "6px 0 4px",
        width: "min(100%, 360px)",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        cursor: clickable ? "pointer" : "default",
        animation: "wrc-purple-pulse 2.5s ease-in-out infinite",
      }}
      data-wrc-active="true"
      data-run-id={runId ?? undefined}
    >
      {/* Shimmer sweep */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.04) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "wrc-shimmer 2.4s ease-in-out infinite",
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />

      {/* Title row: task goal + pulsing dot */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: subtitleText ? 3 : 8 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "hsl(var(--card-foreground))",
            letterSpacing: "-0.01em",
            lineHeight: 1.35,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {taskGoal || "Working…"}
        </div>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: "rgba(139, 92, 246, 0.9)",
            flexShrink: 0,
            marginTop: 5,
            animation: "wrc-dot-pulse 1.4s ease-in-out infinite",
          }}
        />
      </div>

      {/* Subtitle: last ambient/context step (muted) */}
      {subtitleText && (
        <div
          style={{
            fontSize: 11.5,
            color: "hsl(var(--muted-foreground) / 0.65)",
            marginBottom: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "0.005em",
          }}
        >
          {subtitleText}
        </div>
      )}

      {/* Divider */}
      <div aria-hidden="true" style={{ height: 1, background: "hsl(var(--border) / 0.45)", marginBottom: 8 }} />

      {/* Overflow counter — when more than MAX_VISIBLE task steps have fired */}
      {hiddenCount > 0 && (
        <div
          style={{
            fontSize: 10.5,
            color: "hsl(var(--muted-foreground) / 0.4)",
            marginBottom: 6,
            paddingLeft: 26,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{hiddenCount} earlier step{hiddenCount !== 1 ? "s" : ""}
        </div>
      )}

      {/* Step list: completed rows (checkmark) + active row (spinner) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {visibleSteps.length === 0 ? (
          /* Fallback: no task steps surfaced yet — single ambient spinner */
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-label="running"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                border: "1.5px solid hsl(var(--muted-foreground) / 0.15)",
                borderTopColor: "rgba(139, 92, 246, 0.9)",
                animation: "wrc-spin 0.8s linear infinite",
              }}
            />
            <span style={{ fontSize: 12.5, fontWeight: 500, color: "hsl(var(--card-foreground))", letterSpacing: "-0.005em" }}>
              Working…
            </span>
          </div>
        ) : visibleSteps.map((step, i) => {
          const isCurrentStep = i === visibleSteps.length - 1;
          const { headline } = liveStepMeta(step);
          return (
            <div key={`${step.verb}-${step.target ?? ""}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isCurrentStep ? (
                /* Active: spinning ring */
                <span
                  aria-label="running"
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                    border: "1.5px solid hsl(var(--muted-foreground) / 0.15)",
                    borderTopColor: "rgba(139, 92, 246, 0.9)",
                    animation: "wrc-spin 0.8s linear infinite",
                  }}
                />
              ) : (
                /* Completed: circle checkmark */
                <span
                  aria-label="done"
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                    border: "1.5px solid rgba(139, 92, 246, 0.3)",
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                    <path d="M1.5 4L3 5.5L6.5 2" stroke="rgba(139,92,246,0.75)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              )}
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: isCurrentStep ? 500 : 400,
                  color: isCurrentStep
                    ? "hsl(var(--card-foreground))"
                    : "hsl(var(--card-foreground) / 0.45)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                  letterSpacing: "-0.005em",
                }}
              >
                {headline}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes wrc-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes wrc-dot-pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.85); }
          50%       { opacity: 1;   transform: scale(1); }
        }
        @keyframes wrc-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes wrc-purple-pulse {
          0%, 100% {
            box-shadow: 0 0 12px 1px rgba(139, 92, 246, 0.18);
            border-color: rgba(139, 92, 246, 0.38);
          }
          50% {
            box-shadow: 0 0 20px 4px rgba(139, 92, 246, 0.38);
            border-color: rgba(139, 92, 246, 0.72);
          }
        }
      `}</style>
    </div>
  );
}

export function WorkspaceRunCard({ projectId, messages, projectPreviewUrl, chatPending, liveStep, activeRunId, onTryToFix, receiptMessage, executionRun, suppressDeliverableReceipt }: Props) {
  // ── Step accumulation for active/live mode ─────────────────────────────
  const [liveSteps, setLiveSteps] = useState<LiveStepItem[]>([]);
  const prevPendingRef = useRef(false);
  // Refresh the run list shown in the receipt immediately when a run completes.
  // Without this, WorkspaceRunCard waits 30 s for the stale-time window to
  // expire before showing the finished run's outputs.
  const queryClient = useQueryClient();
  useWorkspaceEvent("run-completed", ({ projectId: changedPid }) => {
    if (changedPid === projectId) {
      void queryClient.invalidateQueries({ queryKey: ["project-runs", projectId] });
    }
  }, [projectId, queryClient]);

  // Reset step history when a new generation starts
  useEffect(() => {
    const nowPending = chatPending ?? false;
    if (nowPending && !prevPendingRef.current) {
      setLiveSteps([]);
    }
    prevPendingRef.current = nowPending;
  }, [chatPending]);

  // Accumulate live step events (deduplicate consecutive identical steps)
  useEffect(() => {
    if (!liveStep?.verb) return;
    setLiveSteps(prev => {
      const last = prev[prev.length - 1];
      if (last?.verb === liveStep.verb && last?.target === liveStep.target) return prev;
      return [...prev, { verb: liveStep.verb, target: liveStep.target }];
    });
  }, [liveStep?.verb, liveStep?.target]);

  // ── Active state detection ─────────────────────────────────────────────
  const isStreaming = useMemo(
    () => messages.some(m => m.streaming),
    [messages],
  );
  const isActive = !receiptMessage && ((chatPending ?? false) || isStreaming);

  // Has assistant prose actually started rendering? Once it has, a pure
  // "Thinking" turn must show ONLY the streaming text — no shimmer, no card
  // — per the Thinking/Doing/Receipt lifecycle (Thinking = plain prose).
  const hasStreamedText = useMemo(
    () => messages.some(m => m.role === "assistant" && m.streaming && (m.content ?? "").trim().length > 0),
    [messages],
  );

  // While the run card owns the screen (active OR settled receipt), collapse the
  // composer to compact so it doesn't cover the card content on mobile.
  useReadingDensity("analysis", { active: isActive || !!receiptMessage });



  // Only show the active card ("Doing") when at least one mutating/tool-use
  // step has arrived. Read-only/conversational steps (PROMPT/THOUGHT/SUMMARY/
  // DECISION/FILE_READ/TREE/FETCH/etc.) are "Thinking" — never a card. This
  // MUST use the same classifier as ChatStream's prose-suppression check
  // (isDoingVerb) so a turn is never simultaneously "showing prose" and
  // "showing a live card" for the same step.
  const hasBuildStep = useMemo(
    () => liveSteps.some(s => isDoingVerb(s.verb)),
    [liveSteps],
  );

  // Task goal — derived from what Atlas is actually DOING, not what the user said.
  // The user message already appears in the chat bubble above; repeating it in
  // the run card title makes no sense (e.g. "Lets do it. Im ready" as a run title).
  const taskGoal = useMemo(() => {
    if (liveSteps.length === 0) return "";

    // Highest priority: execution steps — describe the active write/build action.
    const execStep = liveSteps.find(s => EXECUTION_VERBS.has((s.verb ?? "").toUpperCase()));
    if (execStep) return doingLabel(execStep.verb, execStep.target);

    // Read-only steps — describe what Atlas is reviewing (plain language, no card).
    const readStep = liveSteps.find(s => {
      const v = (s.verb ?? "").toUpperCase();
      return v === "FILE_READ" || v === "TREE" || v === "FETCH";
    });
    if (readStep) return thinkingLabel(readStep.verb, readStep.target).replace(/…$/, "");

    return "Working…";
  }, [liveSteps]);

  // ── Receipt derivation ────────────────────────────────────────────────
  const run = useMemo(
    () => {
      if (receiptMessage) return deriveGithubReceipt(receiptMessage);
      if (isActive) return null;
      if (executionRun) {
        return adaptExecutionRun(executionRun, messages, projectPreviewUrl, suppressDeliverableReceipt);
      }
      return null;
    },
    [isActive, executionRun, messages, projectPreviewUrl, receiptMessage, suppressDeliverableReceipt],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [run?.id, run?.status]);

  // ── Bookmark (receipt mode) ───────────────────────────────────────────
  const { items } = useAtlasHistory(projectId);
  const existingSnapshot = useMemo(() => {
    if (!run?.associatedMessageId) return null;
    return items.find((i) => i.associated_message_id === run.associatedMessageId) ?? null;
  }, [items, run?.associatedMessageId]);
  const isBookmarked = !!existingSnapshot?.isBookmarked;

  const [, navigate] = useLocation();
  const handleDetails = useCallback(() => {
    if (!run) return;
    navigate(`/runs/${run.id}`);
  }, [run, navigate]);

  const handlePreview = useCallback(() => {
    if (!run) return;
    let content: string | null = null;
    if (run.previewSource === "sandbox" && run.previewPath) {
      content = findFileContent(messages, run.previewPath);
    }
    const savedLiveUrl = getSavedPreviewUrl(projectId) || projectPreviewUrl || null;

    // When no explicit preview source but build succeeded with files, open the
    // Local Dev panel — the workspace dev server is running there.
    const effectiveSource = run.previewSource
      ?? (run.status === "applied" && run.files.length > 0 ? "local" : null);

    window.dispatchEvent(
      new CustomEvent("axiom:open-preview", {
        detail: {
          source: effectiveSource ?? undefined,
          content: content ?? undefined,
          emptyReason: effectiveSource ? undefined : (run.error ?? (run.status === "failed" ? "RUN_FAILED" : "NO_PREVIEWABLE_OUTPUT")),
          runId: effectiveSource ? undefined : run.id,
          liveUrl: effectiveSource ? undefined : savedLiveUrl,
        },
      }),
    );
  }, [run, messages, projectId, projectPreviewUrl]);

  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  const handleBookmark = useCallback(() => {
    if (!run) return;
    if (!run.associatedMessageId) {
      toast.error("Can't bookmark this run yet — message hasn't been persisted.");
      return;
    }
    let snap = existingSnapshot;
    if (!snap) {
      snap = addSnapshot(projectId, {
        associated_message_id: run.associatedMessageId,
        title: run.title,
        lens: "builder",
        payload: {
          code_delta: [
            `${run.status.toUpperCase()} · ${run.files.length} ${run.files.length === 1 ? "file" : "files"}`,
            ...run.files,
          ].join("\n"),
          active_file: run.previewPath ?? run.files[0],
        },
      });
    }
    if (!snap) return;
    toggleHistoryBookmark(projectId, snap.id);
    const nowBookmarked = !isBookmarked;
    toast.success(nowBookmarked ? "Bookmarked to history" : "Bookmark removed", {
      duration: 5000,
      action: nowBookmarked
        ? {
            label: "View history",
            onClick: () => window.dispatchEvent(new CustomEvent("atlas:open-history-sheet")),
          }
        : undefined,
    });
  }, [run, existingSnapshot, isBookmarked, projectId]);

  // ── Env var detection (receipt mode only) ────────────────────────────
  const envVarsReferenced = useMemo(() => {
    if (isActive) return [];
    const vars = new Set<string>();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      const edits = msg.fileEdits ?? (msg.fileEdit ? [msg.fileEdit] : []);
      if (edits.length === 0) continue;
      for (const edit of edits) {
        if (!edit?.content) continue;
        for (const m of edit.content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]+)/g)) {
          vars.add(m[1]);
        }
        for (const m of edit.content.matchAll(/import\.meta\.env\.(VITE_[A-Z_][A-Z0-9_]+)/g)) {
          vars.add(m[1]);
        }
      }
      break;
    }
    return Array.from(vars);
  }, [isActive, messages]);

  // ── Render: active (live execution) ───────────────────────────────────
  if (isActive) {
    if (hasBuildStep) {
      // Real tool-use turn (file reads/writes, builds, etc.) → full run card.
      return <ActiveCard steps={liveSteps} taskGoal={taskGoal} runId={activeRunId ?? liveStep?.runId ?? null} />;
      // Note: `activeRunId` prop is optional; when omitted the card falls back
      // to liveStep.runId (Nexus transport attaches it to every step event).
    }
    // Conversational / thinking-only turn: "Thinking" = plain prose, no card.
    // ChatStream streams assistant prose unsuppressed during these steps, so
    // once that prose has actually started rendering, this component must
    // show nothing — no shimmer, no title row — otherwise the same turn
    // would show both prose AND a card simultaneously. Before the first
    // token arrives (liveSteps present, no text yet), show a brief inline
    // shimmer as a bridge so the turn doesn't look inert.
    if (!liveSteps.length || hasStreamedText) return null;
    return <InlineThinkingPulse steps={liveSteps} />;
  }

  // ── Render: receipt ───────────────────────────────────────────────────
  if (!run) return null;

  const toneKey =
    run.status === "applied" ? "success"
    : run.status === "delivered" ? "delivered"
    : run.status === "failed" ? "failed"
    : run.status === "pushed" ? "pushed"
    : run.status === "sketched" ? "sketched"
    : run.status === "insight" ? "insight"
    : "running";
  const tone = RECEIPT_TONE[toneKey];
  const fileCount = run.files.length;
  const kicker =
    run.status === "running" ? "Working"
    : run.status === "applied" && executionRun?.status === "awaiting_approval" ? "Applied Locally"
    : run.status === "applied" ? "Run Complete"
    : run.status === "delivered" ? "Ready to Download"
    : run.status === "pushed" ? "Pushed to GitHub"
    : run.status === "sketched" ? "Sketch Complete"
    : run.status === "insight" ? (run.insightKicker ?? "Insight captured")
    : "Build Unsuccessful";
  const elapsedMs =
    run.status === "running"
      ? now - run.createdAt
      : run.elapsedMs ?? Math.max(0, Date.now() - run.createdAt);
  const shortSha = run.githubPush?.sha ? run.githubPush.sha.slice(0, 7) : "";
  const pushSubtitle = run.githubPush
    ? [run.githubPush.repo, shortSha, run.githubPush.branch].filter(Boolean).join(" · ")
    : "";

  const noFreshArtifact = run.previewSource === null;
  const previewTitle = noFreshArtifact
    ? "No fresh artifact from this run — opens Preview panel"
    : run.previewSource === "sandbox"
      ? "Open Draft preview"
      : run.previewSource === "generated"
        ? "Open produced artifact"
        : run.previewSource === "local"
          ? "Open local dev preview"
          : "Open saved live URL preview";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse run details" : "Expand run details"}
      onClick={toggleExpanded}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleExpanded();
        }
      }}
      style={{
        position: "relative",
        background: tone.cardBg,
        color: "hsl(var(--card-foreground))",
        border: `1px solid ${tone.border}`,
        boxShadow: tone.ring !== "transparent" ? `0 0 0 3px ${tone.ring}` : undefined,
        borderRadius: 10,
        padding: "9px 11px",
        margin: "6px 0 4px",
        width: "min(100%, 320px)",
        maxWidth: "100%",
        boxSizing: "border-box",
        alignSelf: "flex-start",
        cursor: "pointer",
        animation:
          toneKey === "success" ? "wrc-border-cooldown 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards"
          : toneKey === "failed"  ? "wrc-border-cooldown-failed 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards"
          : undefined,
      }}
      data-run-id={run.id}
      data-run-status={run.status}
    >
      <button
        type="button"
        aria-label={isBookmarked ? "Remove bookmark" : "Bookmark run"}
        title={isBookmarked ? "Bookmarked" : "Bookmark run"}
        onClick={(event) => {
          event.stopPropagation();
          handleBookmark();
        }}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "transparent",
          border: "none",
          color: isBookmarked
            ? "var(--atlas-gold)"
            : "hsl(var(--muted-foreground) / 0.55)",
          cursor: "pointer",
          padding: 4,
          borderRadius: 4,
          lineHeight: 0,
        }}
      >
        <Bookmark
          size={12}
          strokeWidth={1.75}
          fill={isBookmarked ? "currentColor" : "none"}
        />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 9, paddingRight: 22 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 999,
            background: tone.iconBg,
            color: tone.fg,
            flexShrink: 0,
          }}
        >
          <ReceiptIcon status={run.status} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: tone.fg,
              opacity: 0.9,
              lineHeight: 1.2,
            }}
          >
            {kicker}
            {elapsedMs != null && (
              <span style={{ opacity: 0.6, marginLeft: 6 }}>{fmtElapsed(elapsedMs)}</span>
            )}
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "hsl(var(--card-foreground))",
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              letterSpacing: "-0.005em",
            }}
          >
            {run.status === "pushed" ? (pushSubtitle || run.title) : run.title}
          </div>
        </div>
      </div>

      {/* Executive summary — shown when available (nexus workspace turns) */}
      {run.executiveSummary && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid hsl(var(--border) / 0.4)",
            fontSize: 12,
            color: "hsl(var(--card-foreground) / 0.75)",
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: expanded ? undefined : 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: expanded ? "visible" : "hidden",
          }}
        >
          {run.executiveSummary}
        </div>
      )}

      {/* Expanded detail: file list */}
      {expanded && run.files.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid hsl(var(--border) / 0.5)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {run.files.map((f) => (
            <div
              key={f}
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 10,
                color: "hsl(var(--muted-foreground))",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {f}
            </div>
          ))}
          {envVarsReferenced.length > 0 && (
            <div
              style={{
                marginTop: 4,
                paddingTop: 6,
                borderTop: "1px solid hsl(var(--border) / 0.4)",
                fontSize: 10,
                color: "hsl(var(--muted-foreground) / 0.7)",
                fontFamily: "var(--app-font-mono)",
              }}
            >
              env: {envVarsReferenced.join(", ")}
            </div>
          )}
          {run.error && (
            <div
              style={{
                marginTop: 4,
                fontSize: 10.5,
                color: "#f87171",
                fontFamily: "var(--app-font-mono)",
              }}
            >
              {run.error}
            </div>
          )}
        </div>
      )}

      {/* Action buttons — compact receipt row. Verification lives in expand. */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid hsl(var(--border) / 0.4)",
          justifyContent: "flex-end",
        }}
      >
        {run.deliverable ? (
          <>
            <a
              href={run.deliverable.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 11.5,
                fontWeight: 500,
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid transparent",
                background: "transparent",
                color: "hsl(var(--card-foreground) / 0.75)",
                cursor: "pointer",
                letterSpacing: "0.01em",
                textDecoration: "none",
              }}
            >
              Preview
            </a>
            <a
              href={run.deliverable.downloadUrl}
              download={run.deliverable.name}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
                color: "hsl(var(--card-foreground))",
                cursor: "pointer",
                letterSpacing: "0.01em",
                textDecoration: "none",
              }}
            >
              Download
            </a>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDetails(); }}
              style={{
                fontSize: 11.5,
                fontWeight: 500,
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid transparent",
                background: "transparent",
                color: "hsl(var(--card-foreground) / 0.75)",
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Details
            </button>
            {run.status === "pushed" && run.githubPush?.url ? (
              <a
                href={run.githubPush.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--card-foreground))",
                  cursor: "pointer",
                  letterSpacing: "0.01em",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Github size={11} strokeWidth={1.75} />
                GitHub
              </a>
            ) : (
              <button
                type="button"
                title={previewTitle}
                onClick={(e) => { e.stopPropagation(); handlePreview(); }}
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px solid transparent",
                  background: "transparent",
                  color: "hsl(var(--card-foreground) / 0.75)",
                  cursor: "pointer",
                  letterSpacing: "0.01em",
                }}
              >
                Preview
              </button>
            )}
          </>
        )}
        {expanded && (run.status === "applied" || run.status === "pushed") && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dispatchVerifyRun("typecheck", projectId, run.id); }}
              style={{
                fontSize: 11.5, fontWeight: 500, padding: "5px 10px",
                borderRadius: 6, border: "1px solid transparent",
                background: "transparent",
                color: "hsl(var(--card-foreground) / 0.75)",
                cursor: "pointer",
              }}
            >
              Type Check
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dispatchVerifyRun("test", projectId, run.id); }}
              style={{
                fontSize: 11.5, fontWeight: 500, padding: "5px 10px",
                borderRadius: 6, border: "1px solid transparent",
                background: "transparent",
                color: "hsl(var(--card-foreground) / 0.75)",
                cursor: "pointer",
              }}
            >
              Tests
            </button>
          </>
        )}
      </div>

      <style>{`
        /* Cool Down: purple energy drains out, green briefly emerges, card settles */
        @keyframes wrc-border-cooldown {
          0%   { box-shadow: 0 0 14px 3px rgba(139,92,246,0.38); border-color: rgba(139,92,246,0.70); }
          18%  { box-shadow: 0 0 26px 6px rgba(139,92,246,0.28); border-color: rgba(139,92,246,0.85); }
          55%  { box-shadow: 0 0 6px 1px rgba(74,222,128,0.12);  border-color: rgba(74,222,128,0.45); }
          100% { box-shadow: none;                                border-color: hsl(var(--border)); }
        }
        /* Cool Down (failed): purple → warm amber, never red */
        @keyframes wrc-border-cooldown-failed {
          0%   { box-shadow: 0 0 14px 3px rgba(139,92,246,0.38); border-color: rgba(139,92,246,0.70); }
          18%  { box-shadow: 0 0 26px 6px rgba(139,92,246,0.28); border-color: rgba(139,92,246,0.85); }
          55%  { box-shadow: 0 0 6px 1px rgba(251,191,36,0.15);  border-color: rgba(251,191,36,0.50); }
          100% { box-shadow: none;                                border-color: hsl(var(--border)); }
        }
        @keyframes wrc-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes wrc-pulse-bar {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 1; }
        }
        @keyframes wrc-dot-pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.85); }
          50%       { opacity: 1;   transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
