/**
 * WorkspaceRunCard — receipt-style Run Card derived from workspace chat messages.
 *
 * Standalone. Does NOT import from ActiveRuns.tsx, useAllRuns, _startRun, or
 * the Atlas Composer live-queue store. All run data is derived from the
 * ChatMessage[] passed in via props.
 *
 * Visual reference: attached_assets/run-card-{dark,light}.html
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Bookmark,
  BookmarkCheck,
  FileText,
  Image as ImageIcon,
  FileCode,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { addSnapshot, toggleBookmark, useAtlasHistory } from "@/lib/atlas-history";
import type { ChatMessage } from "@/pages/workspace";

interface Props {
  projectId: number;
  messages: ChatMessage[];
}

type DerivedStatus = "running" | "applied" | "failed";

interface DerivedRun {
  id: string;
  /** Numeric chat message id when available — needed for history/bookmark ledger. */
  associatedMessageId: number | null;
  status: DerivedStatus;
  title: string;
  createdAt: number;
  elapsedMs: number | null;
  files: string[];
  produced: string[];
  error?: string;
}

const PRODUCED_EXT = /\.(html?|pdf|md|png|jpe?g|gif|svg|webp)$/i;
const ERROR_MARKERS =
  /\b(INTEGRITY_FAILURE|NO_FILES_WRITTEN|WRITE_CLAIM_WITHOUT_EMISSION|BUILD_FAILED)\b/;

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function deriveRun(messages: ChatMessage[]): DerivedRun | null {
  // Walk backwards, find most-recent assistant message that either is
  // streaming, produced file edits, or reported an error.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    const edits = msg.fileEdits ?? (msg.fileEdit ? [msg.fileEdit] : []);
    const deletes = msg.fileDeletes ?? [];
    const proposal = msg.writeFileProposal?.path;
    const hasWork =
      edits.length > 0 ||
      deletes.length > 0 ||
      !!proposal ||
      msg.streaming ||
      ERROR_MARKERS.test(msg.content ?? "");

    if (!hasWork) continue;

    // Collect file paths.
    const paths = new Set<string>();
    for (const e of edits) if (e?.path) paths.add(e.path);
    for (const d of deletes) if (d?.path) paths.add(d.path);
    if (proposal) paths.add(proposal);
    const files = Array.from(paths);
    const produced = files.filter((p) => PRODUCED_EXT.test(p));

    // Status.
    let status: DerivedStatus = "applied";
    let error: string | undefined;
    if (msg.streaming) status = "running";
    else if (ERROR_MARKERS.test(msg.content ?? "")) {
      status = "failed";
      const m = msg.content?.match(ERROR_MARKERS);
      error = m?.[0];
    }

    // Title = preceding user prompt, else first line of assistant content.
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

    const createdAt = msg.sentAt ? new Date(msg.sentAt).getTime() : Date.now();
    const elapsedMs =
      typeof msg.executionTimeMs === "number" ? msg.executionTimeMs : null;

    const id = msg.id != null ? String(msg.id) : `msg-${i}-${createdAt}`;

    const associatedMessageId = typeof msg.id === "number" ? msg.id : null;
    return { id, associatedMessageId, status, title, createdAt, elapsedMs, files, produced, error };
  }
  return null;
}

/** Find the file content for a given path from the most recent matching fileEdit in messages. */
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

function ProducedIcon({ path }: { path: string }) {
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(path)) return <ImageIcon size={12} />;
  if (/\.(html?|md)$/i.test(path)) return <FileText size={12} />;
  return <FileCode size={12} />;
}

export function WorkspaceRunCard({ projectId, messages }: Props) {
  const run = useMemo(() => deriveRun(messages), [messages]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [run?.id, run?.status]);

  // Bookmark state — reads the atlas-history ledger to render an active
  // BookmarkCheck when this run is already saved.
  const historyItems = useAtlasHistory(projectId);
  const bookmarkEntry = useMemo(() => {
    if (!run?.associatedMessageId) return null;
    return historyItems.find((h) => h.associated_message_id === run.associatedMessageId) ?? null;
  }, [historyItems, run?.associatedMessageId]);
  const isBookmarked = !!bookmarkEntry?.isBookmarked;

  const APP_FILE_RE = /(?:^|\/)(package\.json|vite\.config|tsconfig|src\/|app\/|routes\/|pages\/|index\.html$)/i;

  /**
   * Preview priority:
   *   1. preview/output.html            → Draft (sandbox)
   *   2. produced artifact              → Artifacts (generated)
   *   3. app/routes/package changes     → Local Dev (local)
   *   4. (Live URL fallback handled inside PreviewPanel when no source resolves)
   *   5. nothing previewable            → button disabled (rendered below)
   */
  const previewPlan = useMemo(() => {
    if (!run) return null;
    const draftPath = run.produced.find((p) => p === "preview/output.html");
    if (draftPath) {
      return { source: "sandbox" as const, content: findFileContent(messages, draftPath) };
    }
    if (run.produced.length > 0) {
      return { source: "generated" as const };
    }
    if (run.files.some((f) => APP_FILE_RE.test(f))) {
      return { source: "local" as const };
    }
    return null;
  }, [run, messages]);

  const handleOpenPreview = useCallback(() => {
    if (!previewPlan) return;
    window.dispatchEvent(new CustomEvent("axiom:open-preview", { detail: previewPlan }));
  }, [previewPlan]);

  const handleOpenDetails = useCallback(() => {
    if (!run) return;
    window.dispatchEvent(new CustomEvent("axiom:open-changes", { detail: { runId: run.id } }));
  }, [run]);

  const handleBookmark = useCallback(() => {
    if (!run) return;
    if (!run.associatedMessageId) {
      toast.error("Can't bookmark yet", { description: "Run is still streaming — try again after it completes." });
      return;
    }
    // Ensure a snapshot exists for this message, then flip its bookmark flag.
    let entryId = bookmarkEntry?.id ?? null;
    if (!entryId) {
      const created = addSnapshot(projectId, {
        associated_message_id: run.associatedMessageId,
        title: run.title,
        lens: "builder",
        payload: {},
      });
      entryId = created?.id ?? null;
    }
    if (!entryId) return;
    const willBeBookmarked = !isBookmarked;
    toggleBookmark(projectId, entryId);
    toast.success(willBeBookmarked ? "Bookmarked" : "Bookmark removed", {
      description: willBeBookmarked ? run.title : undefined,
      action: willBeBookmarked
        ? {
            label: "View history",
            onClick: () => window.dispatchEvent(new CustomEvent("atlas:open-history-sheet")),
          }
        : undefined,
    });
  }, [run, bookmarkEntry, isBookmarked, projectId]);

  const [expanded, setExpanded] = useState(false);

  if (!run) return null;

  const meta = statusMeta(run.status);
  const tone = TONE[meta.tone];
  const fileCount = run.files.length;
  const elapsedMs =
    run.status === "running"
      ? now - run.createdAt
      : run.elapsedMs ?? Math.max(0, Date.now() - run.createdAt);

  const hasPreview = !!previewPlan;
  // Auto-expand while running so users see progress; otherwise collapsed by default.
  const isOpen = expanded || run.status === "running";

  return (
    <div
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
      }}
      data-run-id={run.id}
      data-run-status={run.status}
    >
      <button
        type="button"
        aria-label={isBookmarked ? "Remove bookmark" : "Bookmark run"}
        title={isBookmarked ? "Remove bookmark" : "Bookmark run"}
        onClick={handleBookmark}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "transparent",
          border: "none",
          color: isBookmarked ? "var(--atlas-gold)" : "hsl(var(--muted-foreground) / 0.55)",
          cursor: "pointer",
          padding: 4,
          borderRadius: 4,
          lineHeight: 0,
        }}
      >
        {isBookmarked
          ? <BookmarkCheck size={12} strokeWidth={1.75} />
          : <Bookmark size={12} strokeWidth={1.75} />}
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

      {run.status !== "running" && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={isOpen}
          style={{
            marginTop: 8,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "5px 8px",
            background: "transparent",
            border: "none",
            color: "hsl(var(--muted-foreground))",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            borderTop: "1px dashed hsl(var(--border))",
          }}
        >
          {isOpen ? "Hide details" : "View details"}
          <ChevronDown
            size={12}
            style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 180ms ease" }}
          />
        </button>
      )}

      {isOpen && hasProduced && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px dashed hsl(var(--border))",
            display: "grid",
            gap: 5,
          }}
        >
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "hsl(var(--muted-foreground) / 0.7)",
            }}
          >
            Produced
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
            {run.produced.map((p) => (
              <li
                key={p}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 11,
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                <ProducedIcon path={p} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOpen && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 10,
            paddingTop: 8,
            borderTop: "1px solid hsl(var(--border))",
          }}
        >
          <Link
            href={detailsHref}
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
              textDecoration: "none",
              letterSpacing: "0.01em",
            }}
          >
            Diff
          </Link>
          {hasProduced ? (
            <button
              type="button"
              onClick={handleOpenPreview}
              style={{
                flex: 1,
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
          ) : (
            <button
              type="button"
              disabled
              title="No previewable files in this run"
              style={{
                flex: 1,
                padding: "6px 10px",
                fontSize: 11.5,
                fontWeight: 500,
                background: "transparent",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground) / 0.5)",
                borderRadius: 5,
                cursor: "not-allowed",
                fontFamily: "inherit",
              }}
            >
              Preview
            </button>
          )}
        </div>
      )}

      <style>{`
        [data-run-id="${run.id}"] .spin { animation: wrc-spin 1s linear infinite; transform-origin: 50% 50%; }
        @keyframes wrc-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default WorkspaceRunCard;
