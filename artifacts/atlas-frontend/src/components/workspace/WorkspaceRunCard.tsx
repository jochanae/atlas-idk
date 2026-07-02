/**
 * WorkspaceRunCard — receipt-style Run Card derived from workspace chat messages.
 *
 * Standalone. Does NOT import from ActiveRuns.tsx, useAllRuns, _startRun, or
 * the Atlas Composer live-queue store. All run data is derived from the
 * ChatMessage[] passed in via props.
 *
 * Buttons:
 *   Card tap → during a run, routes to Details; after a run, routes to Preview when
 *              previewable, otherwise Details.
 *   Details  → dispatches "axiom:open-changes" (workspace switches to Changes/Diff panel)
 *   Preview  → dispatches "axiom:open-preview" with priority:
 *              1. preview/output.html      → { source: "sandbox", content }
 *              2. any produced artifact    → { source: "generated" }
 *              3. app/route/package edits  → { source: "local" }
 *              4. saved live URL fallback  → { source: "url" }
 *              5. otherwise                → disabled
 *   Bookmark → toggles bookmark in atlas-history ledger (existing sheet),
 *              toast with "View history" opens the sheet via "atlas:open-history-sheet".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Bookmark,
} from "lucide-react";
import type { ChatMessage } from "@/pages/workspace";
import {
  addSnapshot,
  toggleBookmark as toggleHistoryBookmark,
  useAtlasHistory,
} from "@/lib/atlas-history";

interface Props {
  projectId: number;
  messages: ChatMessage[];
  projectPreviewUrl?: string | null;
}

type DerivedStatus = "running" | "applied" | "failed";
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
}

const PRODUCED_EXT = /\.(html?|pdf|md|png|jpe?g|gif|svg|webp)$/i;
const APP_FILE_RE = /(^|\/)(src\/|app\/|pages\/|routes\/|package\.json$|vite\.config|tailwind\.config)/i;
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
): DerivedRun | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    const edits = msg.fileEdits ?? (msg.fileEdit ? [msg.fileEdit] : []);
    const deletes = msg.fileDeletes ?? [];
    const proposal = msg.writeFileProposal?.path;
    // Gate: only show the run card when Atlas actually produced an artifact.
    // Pure streaming with no file output is Layer 3 telemetry — no card.
    const hasWork =
      edits.length > 0 ||
      deletes.length > 0 ||
      !!proposal ||
      ERROR_MARKERS.test(msg.content ?? "");

    if (!hasWork) continue;

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

    // Preview source priority.
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

function statusMeta(status: DerivedStatus) {
  switch (status) {
    case "running":
      return { kicker: "Working", tone: "running" as const, Icon: Loader2, spin: true };
    case "applied":
      return { kicker: "Run Complete", tone: "success" as const, Icon: CheckCircle2, spin: false };
    case "failed":
      return { kicker: "Run Failed", tone: "failed" as const, Icon: XCircle, spin: false };
  }
}

const TONE: Record<
  "running" | "success" | "failed",
  { border: string; ring: string; fg: string; iconBg: string }
> = {
  running: {
    border: "var(--atlas-gold-border)",
    ring: "transparent",
    fg: "var(--atlas-gold)",
    iconBg: "var(--atlas-gold-dim)",
  },
  success: {
    border: "rgba(74,222,128,0.35)",
    ring: "rgba(74,222,128,0.08)",
    fg: "#4ade80",
    iconBg: "rgba(74,222,128,0.10)",
  },
  failed: {
    border: "rgba(248,113,113,0.35)",
    ring: "rgba(248,113,113,0.08)",
    fg: "#f87171",
    iconBg: "rgba(248,113,113,0.10)",
  },
};

export function WorkspaceRunCard({ projectId, messages, projectPreviewUrl }: Props) {
  const run = useMemo(
    () => deriveRun(messages, projectId, projectPreviewUrl),
    [messages, projectId, projectPreviewUrl],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [run?.id, run?.status]);

  // Bookmark state via existing atlas-history ledger.
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
          // Empty-state hints — only meaningful when source is null.
          emptyReason: run.previewSource ? undefined : (run.error ?? (run.status === "failed" ? "RUN_FAILED" : "NO_PREVIEWABLE_OUTPUT")),
          runId: run.previewSource ? undefined : run.id,
          liveUrl: run.previewSource ? undefined : savedLiveUrl,
        },
      }),
    );
  }, [run, messages, projectId, projectPreviewUrl]);

  // Card body tap = inline expand/collapse only. Navigation is on explicit
  // Details / Preview buttons — never smart card-body routing.
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

  if (!run) return null;

  const meta = statusMeta(run.status);
  const tone = TONE[meta.tone];
  const fileCount = run.files.length;
  const elapsedMs =
    run.status === "running"
      ? now - run.createdAt
      : run.elapsedMs ?? Math.max(0, Date.now() - run.createdAt);

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
        background: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
        border: `1px solid ${tone.border}`,
        boxShadow: tone.ring !== "transparent" ? `0 0 0 3px ${tone.ring}` : undefined,
        borderRadius: 10,
        padding: "10px 12px",
        margin: "10px 0 4px",
        maxWidth: "88%",
        alignSelf: "flex-start",
        transition: "border-color 240ms ease",
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
          <meta.Icon size={12} strokeWidth={1.75} className={meta.spin ? "spin" : undefined} />
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
            {meta.kicker}
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
            {fileCount} {fileCount === 1 ? "file" : "files"} · {fmtElapsed(elapsedMs)}
            {run.status === "failed" && run.error ? (
              <> · <span style={{ color: TONE.failed.fg }}>{run.error}</span></>
            ) : null}
          </div>
        </div>
      </div>

      {/* Inline expand — file list preview. No navigation. */}
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

      {/* Divider + always-visible Details / Preview buttons */}
      <div
        style={{
          display: "flex",
          gap: 6,
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
            flex: 1,
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
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handlePreview();
          }}
          disabled={false}
          title={previewTitle}
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 11.5,
            fontWeight: 500,
            textAlign: "center",
            background: noFreshArtifact ? "transparent" : "var(--atlas-gold-dim)",
            border: noFreshArtifact
              ? "1px solid hsl(var(--border))"
              : "1px solid var(--atlas-gold-border)",
            color: noFreshArtifact
              ? "hsl(var(--muted-foreground) / 0.75)"
              : "var(--atlas-gold)",
            borderRadius: 5,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "0.01em",
          }}
        >
          Preview
        </button>
      </div>

      <style>{`
        [data-run-id="${run.id}"] .spin { animation: wrc-spin 1s linear infinite; transform-origin: 50% 50%; }
        @keyframes wrc-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default WorkspaceRunCard;
