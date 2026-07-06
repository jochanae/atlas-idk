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

interface LiveStepItem {
  verb: string;
  target?: string;
}

interface Props {
  projectId: number;
  messages: ChatMessage[];
  projectPreviewUrl?: string | null;
  chatPending?: boolean;
  liveStep?: { verb: string; target?: string; status?: string } | null;
  onTryToFix?: () => void;
  receiptMessage?: ChatMessage | null;
  suppressGitHubReceipt?: boolean;
  /** Phase 3: pre-fetched latest run from execution_runs table.
   *  When null and isActive=false, no trailing card is rendered. */
  executionRun?: ApiRun | null;
}

type DerivedStatus = "running" | "applied" | "failed" | "pushed" | "sketched";
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
}

const PRODUCED_EXT = /\.(html?|pdf|md|png|jpe?g|gif|svg|webp)$/i;
const APP_FILE_RE = /(^|\/)(src\/|app\/|pages\/|routes\/|package\.json$|vite\.config|tailwind\.config)/i;

function adaptExecutionRun(
  run: ApiRun,
  messages: ChatMessage[],
  projectPreviewUrl?: string | null,
): DerivedRun | null {
  // Anchor the trailing receipt to its own turn. If a newer user message has
  // arrived after the run's associated assistant message, the receipt belongs
  // to a prior conversation — suppress so it doesn't float below the new turn.
  if (run.messageId !== null) {
    const msgIdx = messages.findIndex(m => m.id === run.messageId);
    if (msgIdx !== -1) {
      let userAfter = 0;
      for (let k = msgIdx + 1; k < messages.length; k++) {
        if (messages[k].role === "user") userAfter++;
      }
      if (userAfter >= 1) return null;
    } else {
      // Associated message isn't in the loaded thread (pruned/older session).
      // If the current tail is a user message, this receipt is orphaned — hide it.
      const last = messages[messages.length - 1];
      if (last?.role === "user") return null;
    }
  } else {
    // No message anchor at all — never trail this under a pending user turn.
    const last = messages[messages.length - 1];
    if (last?.role === "user") return null;
  }

  const hasGithubPush = run.steps.some(s => s.verb === "GITHUB_PUSH");
  const hasImageGen = run.steps.some(s => s.verb === "IMAGE_GEN");
  const hasFileWork = run.steps.some(
    s => s.verb === "FILE_EDIT" || s.verb === "FILE_DELETE" || s.verb === "LINE_PATCH",
  );

  // Pure conversational turns — only PROMPT/THOUGHT/SUMMARY with no real tool
  // invocations (FILE_READ, FILE_EDIT, COMMAND, etc.). Never show a receipt card.
  const CONVERSATIONAL_ONLY = new Set(["PROMPT", "THOUGHT", "SUMMARY", "DECISION"]);
  const hasRealExecution = run.steps.some(s => !CONVERSATIONAL_ONLY.has(s.verb));
  if (!hasRealExecution && !hasGithubPush && !hasImageGen && !hasFileWork) return null;

  // Extract executive summary from the SUMMARY step (nexus workspace turns write this).
  const summaryStep = run.steps.find(s => s.verb === "SUMMARY");
  const executiveSummary = summaryStep?.content?.trim() || undefined;

  let status: DerivedStatus;
  if (run.status === "failed") status = "failed";
  else if (hasGithubPush) status = "pushed";
  else if (hasImageGen && !hasFileWork) status = "sketched";
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
  if (files.length > 0) {
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

  const failStep = run.steps.find(s => s.status === "fail");
  const error =
    run.status === "failed"
      ? (failStep?.detail ?? failStep?.verb ?? "Build failed")
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
  "running" | "success" | "failed" | "pushed" | "sketched",
  { border: string; ring: string; fg: string; iconBg: string; cardBg: string }
> = {
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
};

function ReceiptIcon({ status }: { status: DerivedStatus }) {
  if (status === "applied") return <CheckCircle2 size={12} strokeWidth={1.75} />;
  if (status === "failed") return <XCircle size={12} strokeWidth={1.75} />;
  if (status === "pushed") return <Github size={12} strokeWidth={1.75} />;
  if (status === "sketched") return <ImageIcon size={12} strokeWidth={1.75} />;
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


// Verbs that mean Atlas is actually writing, building, or executing something.
// Anything not in this set is a read/think operation.
const EXECUTION_VERBS = new Set([
  "FILE_EDIT", "LINE_PATCH", "FILE_DELETE", "COMMAND", "SHELL",
  "BUILD", "INSTALL", "TEST", "GITHUB_PUSH", "IMAGE_GEN", "RUN",
]);

/**
 * Lightweight inline status shown for conversational/thinking-only turns.
 * A single shimmer line — no card, no border, no title row.
 * Disappears as soon as Atlas's response text begins streaming.
 */
function InlineThinkingPulse({ steps }: { steps: LiveStepItem[] }) {
  const current = steps[steps.length - 1];
  const verb = (current?.verb ?? "").toUpperCase();

  const label =
    verb === "TREE" ? "Reviewing project structure…"
    : verb === "FILE_READ" && current?.target
      ? `Reading ${current.target.split("/").pop() ?? current.target}…`
    : verb === "FILE_READ" ? "Reviewing project files…"
    : verb === "FETCH" ? "Fetching context…"
    : verb === "THOUGHT" || verb === "SUMMARY" || verb === "DECISION" || verb === "PROMPT"
      ? "Thinking…"
    : steps.length > 0 ? "Thinking…"
    : "Thinking…";

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
 *  One card. One current step. Fixed height. No growing list. */
function ActiveCard({ steps, taskGoal }: { steps: LiveStepItem[]; taskGoal: string }) {
  const current = steps[steps.length - 1];
  const stepCount = steps.length;

  // If no execution verbs have fired yet, this is a thinking/reading turn —
  // never say "Running [project]". Switch to a thinking label instead.
  const hasExecutionStep = steps.some(s => EXECUTION_VERBS.has((s.verb ?? "").toUpperCase()));
  const { headline: stepHeadline } = liveStepMeta(current);
  const currentHeadline = hasExecutionStep
    ? stepHeadline
    : current?.verb?.toUpperCase() === "FILE_READ" || current?.verb?.toUpperCase() === "TREE"
      ? "Reviewing project context"
      : stepHeadline === "Working…" || !stepHeadline
        ? "Thinking with Atlas"
        : stepHeadline;

  return (
    <div
      style={{
        position: "relative",
        background: "hsl(var(--card))",
        border: "1px solid var(--atlas-gold-border)",
        borderRadius: 12,
        padding: "14px 16px",
        margin: "6px 0 4px",
        width: "min(100%, 440px)",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
      data-wrc-active="true"
    >
      {/* Shimmer sweep */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, transparent 0%, rgba(201,162,76,0.05) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "wrc-shimmer 2.4s ease-in-out infinite",
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />

      {/* Title row: task goal + pulsing dot */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
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
            background: "var(--atlas-gold)",
            flexShrink: 0,
            marginTop: 5,
            animation: "wrc-dot-pulse 1.4s ease-in-out infinite",
          }}
        />
      </div>

      {/* Divider */}
      <div aria-hidden="true" style={{ height: 1, background: "hsl(var(--border) / 0.45)", marginBottom: 10 }} />

      {/* Single rotating current step */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Spinning ring */}
        <span
          aria-label="running"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 999,
            border: "1.5px solid hsl(var(--muted-foreground) / 0.2)",
            borderTopColor: "var(--atlas-gold)",
            flexShrink: 0,
            animation: "wrc-spin 0.8s linear infinite",
          }}
        />
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: "hsl(var(--card-foreground))",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
            letterSpacing: "-0.005em",
          }}
        >
          {currentHeadline || "Working…"}
        </span>
        {/* Step counter — subtle breadcrumb */}
        {stepCount > 1 && (
          <span
            style={{
              fontSize: 10.5,
              color: "hsl(var(--muted-foreground) / 0.45)",
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {stepCount}
          </span>
        )}
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
      `}</style>
    </div>
  );
}

export function WorkspaceRunCard({ projectId, messages, projectPreviewUrl, chatPending, liveStep, onTryToFix, receiptMessage, executionRun }: Props) {
  // ── Step accumulation for active/live mode ─────────────────────────────
  const [liveSteps, setLiveSteps] = useState<LiveStepItem[]>([]);
  const prevPendingRef = useRef(false);
  // Freshness gate: only surface trailing receipts for runs that started
  // AFTER this workspace session mounted. Prevents stale runs from a prior
  // session from floating into unrelated conversations.
  const mountedAtRef = useRef<number>(Date.now());

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

  // While the run card owns the screen (active OR settled receipt), collapse the
  // composer to compact so it doesn't cover the card content on mobile.
  useReadingDensity("analysis", { active: isActive || !!receiptMessage });



  // Only show the active card when at least one TOOL-USE step has arrived.
  // Pure conversational turns (PROMPT/THOUGHT/SUMMARY/DECISION/ANALYZE) must
  // never show a card — those are Atlas thinking, not Atlas executing.
  // Tool-use = anything that touches the filesystem, shell, network, or build.
  const PURE_CONVERSATION = new Set([
    "PROMPT", "THOUGHT", "SUMMARY", "DECISION",
    "ANALYZE", "ANALYZE_REQUEST", "ASSESS",
  ]);
  const hasBuildStep = useMemo(
    () => liveSteps.some(s => !PURE_CONVERSATION.has((s.verb ?? "").toUpperCase())),
    [liveSteps],
  );

  // Task goal — derived from what Atlas is actually DOING, not what the user said.
  // The user message already appears in the chat bubble above; repeating it in
  // the run card title makes no sense (e.g. "Lets do it. Im ready" as a run title).
  const taskGoal = useMemo(() => {
    if (liveSteps.length === 0) return "";

    // Highest priority: execution steps — describe the active write/build action.
    const execStep = liveSteps.find(s => EXECUTION_VERBS.has((s.verb ?? "").toUpperCase()));
    if (execStep) {
      const v = (execStep.verb ?? "").toUpperCase();
      const filename = execStep.target ? execStep.target.split("/").pop() ?? execStep.target : "";
      if (v === "FILE_EDIT" || v === "LINE_PATCH") return filename ? `Editing ${filename}` : "Editing project files";
      if (v === "FILE_DELETE") return filename ? `Removing ${filename}` : "Removing file";
      if (v === "GITHUB_PUSH") return execStep.target ? `Pushing to ${execStep.target}` : "Pushing to GitHub";
      if (v === "BUILD") return "Running build";
      if (v === "INSTALL") return "Installing packages";
      if (v === "TEST") return "Running tests";
      if (v === "IMAGE_GEN") return "Generating image";
      return filename ? `Running ${filename}` : "Running command";
    }

    // Read-only steps — describe what Atlas is reviewing.
    const readStep = liveSteps.find(s => {
      const v = (s.verb ?? "").toUpperCase();
      return v === "FILE_READ" || v === "TREE" || v === "FETCH";
    });
    if (readStep) {
      const v = (readStep.verb ?? "").toUpperCase();
      if (v === "TREE") return "Reading project structure";
      if (v === "FETCH") return readStep.target ? `Fetching ${readStep.target}` : "Fetching data";
      const filename = readStep.target ? readStep.target.split("/").pop() ?? readStep.target : "";
      return filename ? `Reading ${filename}` : "Reviewing project files";
    }

    return "Working…";
  }, [liveSteps]);

  // ── Receipt derivation ────────────────────────────────────────────────
  const run = useMemo(
    () => {
      if (receiptMessage) return deriveGithubReceipt(receiptMessage);
      if (isActive) return null;
      if (executionRun) {
        const startedAt = new Date(executionRun.startedAt).getTime();
        // Suppress stale runs that predate this session's mount.
        if (Number.isFinite(startedAt) && startedAt < mountedAtRef.current - 2000) return null;
        return adaptExecutionRun(executionRun, messages, projectPreviewUrl);
      }
      return null;
    },
    [isActive, executionRun, messages, projectPreviewUrl, receiptMessage],
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

  const handleDetails = useCallback(() => {
    if (!run) return;
    window.dispatchEvent(new CustomEvent("axiom:open-changes", { detail: { runId: run.id } }));
  }, [run]);

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
      return <ActiveCard steps={liveSteps} taskGoal={taskGoal} />;
    }
    // Conversational / thinking-only turn → lightweight inline shimmer only.
    // No card, no title row, no step count — just "Thinking…" or
    // "Reading [file]…" in a subtle animated gradient that disappears once
    // Atlas's response text starts streaming.
    return <InlineThinkingPulse steps={liveSteps} />;
  }

  // ── Render: receipt ───────────────────────────────────────────────────
  if (!run) return null;

  const toneKey =
    run.status === "applied" ? "success"
    : run.status === "failed" ? "failed"
    : run.status === "pushed" ? "pushed"
    : run.status === "sketched" ? "sketched"
    : "running";
  const tone = RECEIPT_TONE[toneKey];
  const fileCount = run.files.length;
  const kicker =
    run.status === "running" ? "Working"
    : run.status === "applied" ? "Run Complete"
    : run.status === "pushed" ? "Pushed to GitHub"
    : run.status === "sketched" ? "Sketch Complete"
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
        padding: "10px 12px",
        margin: "6px 0 4px",
        width: "min(100%, 380px)",
        maxWidth: "100%",
        boxSizing: "border-box",
        alignSelf: "flex-start",
        cursor: "pointer",
        animation:
          toneKey === "success" ? "wrc-border-flash-success 1.6s ease-out forwards"
          : toneKey === "failed" ? "wrc-border-flash-failed 1.6s ease-out forwards"
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
          Changes
        </button>
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
        @keyframes wrc-border-flash-success {
          0%   { box-shadow: 0 0 0 0 rgba(74,222,128,0);    border-color: hsl(var(--border)); }
          25%  { box-shadow: 0 0 0 4px rgba(74,222,128,0.18); border-color: rgba(74,222,128,0.85); }
          100% { box-shadow: 0 0 0 0 rgba(74,222,128,0);    border-color: hsl(var(--border)); }
        }
        @keyframes wrc-border-flash-failed {
          0%   { box-shadow: 0 0 0 0 rgba(248,113,113,0);    border-color: hsl(var(--border)); }
          25%  { box-shadow: 0 0 0 4px rgba(248,113,113,0.18); border-color: rgba(248,113,113,0.85); }
          100% { box-shadow: 0 0 0 0 rgba(248,113,113,0);    border-color: hsl(var(--border)); }
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
