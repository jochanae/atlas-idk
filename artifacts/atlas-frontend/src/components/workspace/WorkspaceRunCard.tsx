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
import { Link } from "wouter";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Bookmark,
  FileText,
  Image as ImageIcon,
  FileCode,
} from "lucide-react";
import type { ChatMessage } from "@/pages/workspace";

interface Props {
  projectId: number;
  messages: ChatMessage[];
}

type DerivedStatus = "running" | "applied" | "failed";

interface DerivedRun {
  id: string;
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

    return { id, status, title, createdAt, elapsedMs, files, produced, error };
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

  const handleOpenPreview = useCallback(() => {
    if (!run?.produced[0]) return;
    const filePath = run.produced[0];
    const isHtml = /\.html?$/i.test(filePath);
    const content = isHtml ? findFileContent(messages, filePath) : null;

    // preview/output.html — route into the Draft sandbox via the same event
    // pathway used by useChatStream. This keeps it inline in the Preview panel
    // instead of opening a new browser tab.
    if (filePath === "preview/output.html" && content) {
      window.dispatchEvent(new CustomEvent("axiom:preview-artifact", {
        detail: { content },
      }));
      return;
    }

    if (content) {
      // All other HTML artifacts — open via blob URL in a new tab.
      const blob = new Blob([content], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      // Fallback: navigate to diff view (historical load — content not in memory).
      const href = `${window.location.origin}/project/${projectId}?leftTab=diff&runId=${encodeURIComponent(run.id)}&file=${encodeURIComponent(filePath)}`;
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }, [run, messages, projectId]);

  if (!run) return null;

  const meta = statusMeta(run.status);
  const tone = TONE[meta.tone];
  const fileCount = run.files.length;
  const elapsedMs =
    run.status === "running"
      ? now - run.createdAt
      : run.elapsedMs ?? Math.max(0, Date.now() - run.createdAt);

  // Details opens the Changes panel. We don't include runId because WorkspaceRunCard
  // derives from chat message IDs, not project_builds IDs — they're different namespaces.
  const detailsHref = `/project/${projectId}?leftTab=diff`;
  const hasProduced = run.produced.length > 0;
  const hasFiles = run.files.length > 0;

  return (
    <div
      style={{
        position: "relative",
        background: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
        border: `1px solid ${tone.border}`,
        boxShadow: tone.ring !== "transparent" ? `0 0 0 3px ${tone.ring}` : undefined,
        borderRadius: 10,
        padding: "14px 16px 12px",
        margin: "12px 0 6px",
        transition: "border-color 240ms ease",
      }}
      data-run-id={run.id}
      data-run-status={run.status}
    >
      <button
        type="button"
        aria-label="Bookmark run"
        title="Bookmark (coming soon)"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "transparent",
          border: "none",
          color: "hsl(var(--muted-foreground) / 0.55)",
          cursor: "pointer",
          padding: 4,
          borderRadius: 4,
          lineHeight: 0,
        }}
      >
        <Bookmark size={14} strokeWidth={1.75} />
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span
          style={{
            flex: "0 0 auto",
            width: 22,
            height: 22,
            borderRadius: 999,
            background: tone.iconBg,
            color: tone.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <meta.Icon size={14} strokeWidth={1.75} className={meta.spin ? "spin" : undefined} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: tone.fg,
              marginBottom: 4,
            }}
          >
            {meta.kicker}
          </div>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {run.title}
          </div>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 11.5,
              color: "hsl(var(--muted-foreground))",
              marginTop: 3,
            }}
          >
            {fileCount} {fileCount === 1 ? "file" : "files"} · {fmtElapsed(elapsedMs)}
          </div>
          {run.status === "failed" && run.error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: TONE.failed.fg }}>{run.error}</div>
          ) : null}
        </div>
      </div>

      {hasProduced && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px dashed hsl(var(--border))",
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9.5,
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
                  fontSize: 11.5,
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

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid hsl(var(--border))",
        }}
      >
        <Link
          href={detailsHref}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: 12.5,
            fontWeight: 500,
            textAlign: "center",
            background: "transparent",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--card-foreground))",
            borderRadius: 6,
            textDecoration: "none",
            letterSpacing: "0.01em",
          }}
        >
          Details
        </Link>
        {hasProduced ? (
          <button
            type="button"
            onClick={handleOpenPreview}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 500,
              textAlign: "center",
              background: "var(--atlas-gold-dim)",
              border: "1px solid var(--atlas-gold-border)",
              color: "var(--atlas-gold)",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.01em",
            }}
          >
            Open Preview
          </button>
        ) : hasFiles ? (
          <Link
            href={detailsHref}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 500,
              textAlign: "center",
              background: "transparent",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--card-foreground))",
              borderRadius: 6,
              textDecoration: "none",
              letterSpacing: "0.01em",
            }}
          >
            View Changes
          </Link>
        ) : null}
      </div>

      <style>{`
        [data-run-id="${run.id}"] .spin { animation: wrc-spin 1s linear infinite; transform-origin: 50% 50%; }
        @keyframes wrc-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default WorkspaceRunCard;
