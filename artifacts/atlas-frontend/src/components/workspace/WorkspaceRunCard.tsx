/**
 * WorkspaceRunCard — live communication layer + receipt for workspace builds.
 *
 * TWO MODES:
 *
 * 1. ACTIVE (chatPending=true or last message streaming):
 *    Card appears immediately, shimmers, and streams live step text as Atlas
 *    scans, reads, and writes. The gold shimmer sweep communicates that work
 *    is happening even during silent phases (file-read, second LLM call, etc.).
 *
 * 2. RECEIPT (generation complete, file output detected):
 *    Settles into the Run Complete / Run Failed summary card with Details +
 *    Preview buttons. Hides once the user has continued the conversation.
 *
 * Props:
 *   chatPending — true while waiting for first token OR during agentic loops
 *   liveStep    — latest step event from SSE { verb, target?, status? }
 *   messages    — full ChatMessage[] for receipt derivation
 *
 * Buttons (receipt mode only):
 *   Details  → dispatches "axiom:open-changes"
 *   Preview  → dispatches "axiom:open-preview"
 *   Bookmark → toggles bookmark in atlas-history ledger
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Bookmark, Github, ImageIcon, Terminal, Eye, FilePenLine, Circle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ChatMessage } from "@/pages/workspace";
import type { GithubPushPayload } from "@/lib/githubPushReceipt";
import type { ApiRun } from "@/hooks/useProjectRuns";
import {
  addSnapshot,
  toggleBookmark as toggleHistoryBookmark,
  useAtlasHistory,
} from "@/lib/atlas-history";

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
  /** Phase 2B: pre-fetched latest run from execution_runs table.
   *  When provided and isActive=false, used instead of deriveRun(messages). */
  executionRun?: ApiRun | null;
}

type DerivedStatus = "running" | "applied" | "failed" | "pushed" | "sketched";
type PreviewSource = "sandbox" | "generated" | "local" | "url" | null;

interface DerivedRun {
  id: string;
  associatedMessageId: number | null;
  status: DerivedStatus;
  title: string;
  createdAt: number;
  elapsedMs: number | null;
  files: string[];
  produced: string[];
  previewSource: PreviewSource;
  previewPath: string | null;
  error?: string;
  /** Present when this run is a GitHub push receipt (durable, survives reload). */
  githubPush?: GithubPushPayload;
  /** Present when this run is a sketch-only response (no file edits). */
  sketchImageUrl?: string;
}

const PRODUCED_EXT = /\.(html?|pdf|md|png|jpe?g|gif|svg|webp)$/i;
const APP_FILE_RE = /(^|\/)(src\/|app\/|pages\/|routes\/|package\.json$|vite\.config|tailwind\.config)/i;

/** Phase 2B: map an API-sourced execution_run to the DerivedRun shape used by this card. */
function adaptExecutionRun(
  run: ApiRun,
  messages: ChatMessage[],
  projectPreviewUrl?: string | null,
): DerivedRun | null {
  // Dismiss if conversation has moved on past this run (same threshold as hasSubsequentExchange).
  // BUILD_RUN entries have messageId=null — they always show (never dismissed).
  if (run.messageId !== null) {
    const msgIdx = messages.findIndex(m => m.id === run.messageId);
    if (msgIdx !== -1) {
      let userAfter = 0;
      let assistantAfter = 0;
      for (let k = msgIdx + 1; k < messages.length; k++) {
        if (messages[k].role === "user") userAfter++;
        else if (messages[k].role === "assistant") assistantAfter++;
      }
      if (userAfter >= 2 || (userAfter >= 1 && assistantAfter >= 1)) return null;
    }
  }

  const hasGithubPush = run.steps.some(s => s.verb === "GITHUB_PUSH");
  const hasImageGen = run.steps.some(s => s.verb === "IMAGE_GEN");
  const hasFileWork = run.steps.some(
    s => s.verb === "FILE_EDIT" || s.verb === "FILE_DELETE" || s.verb === "LINE_PATCH",
  );

  let status: DerivedStatus;
  if (run.status === "failed") status = "failed";
  else if (hasGithubPush) status = "pushed";
  else if (hasImageGen && !hasFileWork) status = "sketched";
  else status = "applied";

  // Collect file paths from step targets
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

  // Title: prefer the user message that triggered this run, fall back to summary
  let title = run.summary ?? "Run";
  if (run.messageId !== null) {
    const msgIdx = messages.findIndex(m => m.id === run.messageId);
    if (msgIdx > 0) {
      for (let j = msgIdx - 1; j >= 0; j--) {
        if (messages[j].role === "user") {
          const t = (messages[j].content ?? "").trim();
          if (t) { title = t; break; }
        }
      }
    }
  }
  if (title.length > 140) title = title.slice(0, 137) + "…";

  // Sketch image URL: look it up in the message that was the run response
  let sketchImageUrl: string | undefined;
  if (hasImageGen && run.messageId !== null) {
    const msg = messages.find(m => m.id === run.messageId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sketchImageUrl = (msg as any)?.imageGen?.images?.[0]?.imageUrl;
  }

  // Preview source/path
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

  // GitHub push metadata: prefer rich message payload, fall back to step target
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

  // Error text from the first failed step
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
const ERROR_MARKERS =
  /\b(INTEGRITY_FAILURE|NO_FILES_WRITTEN|WRITE_CLAIM_WITHOUT_EMISSION|BUILD_FAILED)\b/;

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

function deriveRun(
  messages: ChatMessage[],
  projectId: number,
  projectPreviewUrl?: string | null,
  options?: { suppressGitHubReceipt?: boolean },
): DerivedRun | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    const edits = msg.fileEdits
      ?? (msg.fileEdit ? [msg.fileEdit] : undefined)
      ?? (msg.fileEditsJson ? (JSON.parse(msg.fileEditsJson) as Array<{ path: string; language: string }>).map(e => ({ path: e.path, language: e.language, content: "" })) : []);
    const deletes = msg.fileDeletes
      ?? (msg.fileDeletesJson ? (JSON.parse(msg.fileDeletesJson) as Array<{ path: string }>) : []);
    const proposal = msg.writeFileProposal?.path;
    const push = options?.suppressGitHubReceipt ? undefined : msg.githubPush;
    const sketchImages = msg.imageGen?.images ?? [];
    const hasWork =
      edits.length > 0 ||
      deletes.length > 0 ||
      !!proposal ||
      !!push ||
      sketchImages.length > 0;

    if (!hasWork) continue;

    // If the conversation has moved on past this run, hide the receipt card.
    // Rules (any one sufficient):
    //   1. User sent ≥2 messages after this run (clearly moved on regardless of streaming state)
    //   2. User sent a message after the run AND a subsequent assistant reply exists (streaming or not)
    const hasSubsequentExchange = (() => {
      let userAfterCount = 0;
      let foundAssistantAfter = false;
      for (let k = i + 1; k < messages.length; k++) {
        if (messages[k].role === "user") userAfterCount++;
        if (messages[k].role === "assistant") foundAssistantAfter = true;
      }
      if (userAfterCount >= 2) return true;
      if (userAfterCount >= 1 && foundAssistantAfter) return true;
      return false;
    })();
    if (hasSubsequentExchange) return null;

    const paths = new Set<string>();
    for (const e of edits) if (e?.path) paths.add(e.path);
    for (const d of deletes) if (d?.path) paths.add(d.path);
    if (proposal) paths.add(proposal);
    const files = Array.from(paths);
    const produced = files.filter((p) => PRODUCED_EXT.test(p));

    let status: DerivedStatus = "applied";
    let error: string | undefined;
    if (msg.streaming) status = "running";
    else if (ERROR_MARKERS.test(msg.content ?? "")) {
      status = "failed";
      const m = msg.content?.match(ERROR_MARKERS);
      error = m?.[0];
    } else if (push) {
      status = "pushed";
    } else if (sketchImages.length > 0 && edits.length === 0 && deletes.length === 0 && !proposal) {
      status = "sketched";
    }

    let title = "";
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === "user") {
        title = (messages[j].content ?? "").trim();
        break;
      }
    }
    if (!title) {
      title = (msg.content ?? "").split("\n").find((l) => l.trim()) ?? "Run";
    }
    title = title.length > 140 ? title.slice(0, 137) + "…" : title;

    let previewSource: PreviewSource = null;
    let previewPath: string | null = null;
    const sandbox = produced.find((p) => p === "preview/output.html");
    if (sandbox) {
      previewSource = "sandbox";
      previewPath = sandbox;
    } else if (produced.length > 0) {
      previewSource = "generated";
      previewPath = produced[0];
    } else if (files.some((p) => APP_FILE_RE.test(p))) {
      previewSource = "local";
    } else if ((projectPreviewUrl?.trim() || getSavedPreviewUrl(projectId))) {
      previewSource = "url";
    }

    const createdAt = msg.sentAt ? new Date(msg.sentAt).getTime() : Date.now();
    const elapsedMs =
      typeof msg.executionTimeMs === "number" ? msg.executionTimeMs : null;

    const associatedMessageId =
      typeof msg.id === "number" ? msg.id : null;
    const id = msg.id != null ? String(msg.id) : `msg-${i}-${createdAt}`;

    return {
      id,
      associatedMessageId,
      status,
      title,
      createdAt,
      elapsedMs,
      files,
      produced,
      previewSource,
      previewPath,
      error,
      githubPush: push,
      sketchImageUrl: sketchImages[0]?.imageUrl ?? undefined,
    };
  }
  return null;
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
  success: {
    border: "rgba(74,222,128,0.35)",
    ring: "rgba(74,222,128,0.08)",
    fg: "#4ade80",
    iconBg: "rgba(74,222,128,0.10)",
    cardBg: "hsl(var(--card))",
  },
  failed: {
    border: "rgba(248,113,113,0.45)",
    ring: "rgba(248,113,113,0.10)",
    fg: "#f87171",
    iconBg: "rgba(248,113,113,0.12)",
    cardBg: "rgba(248,113,113,0.045)",
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

function liveStepMeta(step?: LiveStepItem): { Icon: LucideIcon; label: string; body: string } {
  const verb = step?.verb ?? "";
  const lower = verb.toLowerCase();
  if (/github[_-]?push|push/.test(lower)) {
    return { Icon: Github, label: "Pushing to GitHub", body: step?.target ?? "Preparing commit" };
  }
  if (/read|inspect|scan|open/.test(lower)) {
    return { Icon: Eye, label: "Reading file", body: step?.target ?? "Checking project files" };
  }
  if (/edit|write|patch|apply|file_edit|line_patch/.test(lower)) {
    return { Icon: FilePenLine, label: "Editing file", body: step?.target ?? "Applying changes" };
  }
  if (/command|terminal|shell|run|exec|install|build|test/.test(lower)) {
    return { Icon: Terminal, label: "Running command", body: step?.target ?? verb };
  }
  return { Icon: Circle, label: "Working", body: step?.target ?? verb ?? "Thinking through the next step" };
}

/** The shimmer live-communication card shown while Atlas is working. */
function ActiveCard({ steps, title }: { steps: LiveStepItem[]; title: string }) {
  const current = steps[steps.length - 1];
  const { Icon, label, body } = liveStepMeta(current);
  return (
    <div
      style={{
        position: "relative",
        background: "hsl(var(--card))",
        border: "1px solid var(--atlas-gold-border)",
        borderRadius: 10,
        padding: "10px 12px",
        margin: "10px 0 4px",
        width: "min(100%, 560px)",
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
          background: "linear-gradient(90deg, transparent 0%, rgba(201,162,76,0.07) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "wrc-shimmer 2.2s ease-in-out infinite",
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />

      {/* Left accent bar — animates opacity */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: "var(--atlas-gold)",
          borderRadius: "10px 0 0 10px",
          animation: "wrc-pulse-bar 1.8s ease-in-out infinite",
        }}
      />

      <div style={{ paddingLeft: 8 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: 999,
              background: "var(--atlas-gold-dim)",
              color: "var(--atlas-gold)",
              flexShrink: 0,
              animation: "wrc-dot-pulse 1.4s ease-in-out infinite",
            }}
          >
            <Icon size={12} strokeWidth={1.75} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--atlas-gold)",
                opacity: 0.9,
                lineHeight: 1.2,
              }}
            >
              {label}
            </div>
            {(body || title) && (
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
                {body || title}
              </div>
            )}
          </div>
        </div>

        {/* Step list — last 5 */}
        {steps.length > 0 && (
          <div
            style={{
              paddingTop: 6,
              borderTop: "1px solid hsl(var(--border) / 0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {steps.slice(-5).map((step, idx, arr) => {
              const isCurrent = idx === arr.length - 1;
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 5,
                    fontFamily: "var(--app-font-mono)",
                    fontSize: 10,
                    lineHeight: 1.4,
                    color: isCurrent
                      ? "var(--atlas-gold)"
                      : "hsl(var(--muted-foreground) / 0.6)",
                    transition: "color 300ms ease",
                  }}
                >
                  <span style={{ flexShrink: 0, fontSize: 9, opacity: isCurrent ? 1 : 0.7 }}>
                    {isCurrent ? "→" : "✓"}
                  </span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {liveStepMeta(step).label}
                    {step.target ? (
                      <span style={{ opacity: 0.75 }}>{" "}{step.target}</span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes wrc-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes wrc-pulse-bar {
          0%, 100% { opacity: 0.4; }
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

export function WorkspaceRunCard({ projectId, messages, projectPreviewUrl, chatPending, liveStep, onTryToFix, receiptMessage, suppressGitHubReceipt, executionRun }: Props) {
  // ── Step accumulation for active/live mode ─────────────────────────────
  const [liveSteps, setLiveSteps] = useState<LiveStepItem[]>([]);
  const prevPendingRef = useRef(false);

  // When a new generation starts, reset step history
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

  // Last user message — title for the active card
  const activeTitle = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const t = (messages[i].content ?? "").trim();
        return t.length > 120 ? t.slice(0, 117) + "…" : t;
      }
    }
    return "";
  }, [messages]);

  // ── Receipt derivation ────────────────────────────────────────────────
  const run = useMemo(
    () => {
      if (receiptMessage) return deriveRun([receiptMessage], projectId, projectPreviewUrl);
      if (isActive) return null;
      // Phase 2B: prefer the API-sourced execution_run when available.
      // Falls back to deriveRun (message scan) when executionRun is not yet loaded
      // or for projects with no recorded runs yet.
      if (executionRun) return adaptExecutionRun(executionRun, messages, projectPreviewUrl);
      return deriveRun(messages, projectId, projectPreviewUrl, { suppressGitHubReceipt });
    },
    [isActive, executionRun, messages, projectId, projectPreviewUrl, receiptMessage, suppressGitHubReceipt],
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
    window.dispatchEvent(
      new CustomEvent("axiom:open-preview", {
        detail: {
          source: run.previewSource ?? undefined,
          content: content ?? undefined,
          emptyReason: run.previewSource ? undefined : (run.error ?? (run.status === "failed" ? "RUN_FAILED" : "NO_PREVIEWABLE_OUTPUT")),
          runId: run.previewSource ? undefined : run.id,
          liveUrl: run.previewSource ? undefined : savedLiveUrl,
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

  // ── Render: active (live communication) ───────────────────────────────
  if (isActive) {
    return <ActiveCard steps={liveSteps} title={activeTitle} />;
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
        margin: "10px 0 4px",
        width: "min(100%, 560px)",
        maxWidth: "100%",
        boxSizing: "border-box",
        alignSelf: "flex-start",
        transition: "border-color 240ms ease, box-shadow 240ms ease",
        cursor: "pointer",
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
            flex: "0 0 auto",
            width: 20,
            height: 20,
            borderRadius: 999,
            background: tone.iconBg,
            color: tone.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ReceiptIcon status={run.status} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: tone.fg,
              lineHeight: 1.2,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {run.title}
          </div>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 10.5,
              color: "hsl(var(--muted-foreground))",
              marginTop: 2,
            }}
          >
            {run.status === "pushed" && pushSubtitle ? (
              pushSubtitle
            ) : run.status === "sketched" ? (
              fmtElapsed(elapsedMs)
            ) : (
              <>
                {fileCount} {fileCount === 1 ? "file" : "files"} · {fmtElapsed(elapsedMs)}
                {run.status === "failed" && run.error ? (
                  <> · <span style={{ color: RECEIPT_TONE.failed.fg }}>{run.error}</span></>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && run.files.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px dashed hsl(var(--border))",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            fontFamily: "var(--app-font-mono)",
            fontSize: 10.5,
            color: "hsl(var(--muted-foreground))",
            maxHeight: 140,
            overflowY: "auto",
          }}
        >
          {run.files.slice(0, 12).map((path) => (
            <div key={path} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {path}
            </div>
          ))}
          {run.files.length > 12 && (
            <div style={{ opacity: 0.6 }}>+{run.files.length - 12} more</div>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid hsl(var(--border))",
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleDetails();
          }}
          style={{
            flex: "1 1 120px",
            minWidth: 0,
            padding: "6px 10px",
            fontSize: 11.5,
            fontWeight: 500,
            textAlign: "center",
            background: "transparent",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--card-foreground))",
            borderRadius: 5,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "0.01em",
          }}
        >
          Details
        </button>
        {run.status === "failed" ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTryToFix?.();
            }}
            style={{
              flex: "1 1 120px",
              minWidth: 0,
              padding: "6px 10px",
              fontSize: 11.5,
              fontWeight: 500,
              textAlign: "center",
              background: "rgba(248,113,113,0.10)",
              border: "1px solid rgba(248,113,113,0.35)",
              color: "#f87171",
              borderRadius: 5,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.01em",
            }}
          >
            Try to fix
          </button>
        ) : run.status === "sketched" ? null
        : run.status === "pushed" && run.githubPush ? (
          <a
            href={run.githubPush.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            style={{
              flex: "1 1 120px",
              minWidth: 0,
              padding: "6px 10px",
              fontSize: 11.5,
              fontWeight: 500,
              textAlign: "center",
              background: "var(--atlas-gold-dim)",
              border: "1px solid var(--atlas-gold-border)",
              color: "var(--atlas-gold)",
              borderRadius: 5,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.01em",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Github size={12} strokeWidth={1.75} />
            View commit
          </a>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handlePreview();
            }}
            title={previewTitle}
            style={{
              flex: "1 1 120px",
              minWidth: 0,
              padding: "6px 10px",
              fontSize: 11.5,
              fontWeight: 500,
              textAlign: "center",
              background: "var(--atlas-gold-dim)",
              border: "1px solid var(--atlas-gold-border)",
              color: "var(--atlas-gold)",
              borderRadius: 5,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.01em",
            }}
          >
            Preview
          </button>
        )}
      </div>

      {/* Env var chip — shown when Atlas wrote code referencing env vars */}
      {envVarsReferenced.length > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            window.dispatchEvent(new CustomEvent("axiom:open-env-panel"));
          }}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "7px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            background: "rgba(201,162,76,0.05)",
            border: "1px solid rgba(201,162,76,0.2)",
            borderRadius: 6,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "var(--app-font-mono)",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--atlas-gold)", marginBottom: 2 }}>
              Env vars referenced
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "hsl(var(--muted-foreground))",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {envVarsReferenced.join(", ")}
            </div>
          </div>
          <span style={{ fontSize: 10, color: "var(--atlas-gold)", opacity: 0.8, flexShrink: 0 }}>
            Configure →
          </span>
        </button>
      )}
    </div>
  );
}

export default WorkspaceRunCard;
