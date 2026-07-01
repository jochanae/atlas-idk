// ViewChangesPanel — unified "What changed?" surface.
//
// Three sections, all collapsible, newest data at top:
//
//   1. Workspace   — local git status (modified/untracked files) from our
//                    own API. No actions here — actions live in Files tab.
//   2. GitHub      — full commit history from Cloud Run / GitHub API, using
//                    the same CommitHistoryCard (SHA, files, revert) that the
//                    Files tab already shows.
//   3. Atlas       — SessionTimeline: prompts → thoughts → file edits (with
//                    inline diff) → push records, for the current session.
//
// Data is fetched lazily per section (only when that section is open).
// No new storage model — each section reads from its own existing source.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, FolderGit2, Sparkles } from "lucide-react";
import { SessionTimeline, type TimelineMessage } from "@/components/workspace/SessionTimeline";
import type { PushRecord, LinkedRepo } from "@/pages/workspace";

// ── Shared badge logic (mirrors WorkspaceFilesPanel) ─────────────────────────

function gitBadge(code: string): { label: string; color: string } | null {
  if (!code) return null;
  const x = code[0] ?? " ";
  const y = code[1] ?? " ";
  if (x === "?" && y === "?") return { label: "?", color: "rgba(180,180,180,0.65)" };
  if (x === "A" || y === "A") return { label: "A", color: "rgba(100,200,120,0.85)" };
  if (x === "D" || y === "D") return { label: "D", color: "rgba(220,80,80,0.8)" };
  if (x === "M" || y === "M") return { label: "M", color: "rgba(201,162,76,0.9)" };
  if (x === "R" || y === "R") return { label: "R", color: "rgba(140,160,220,0.85)" };
  return { label: code.trim().slice(0, 1) || "~", color: "rgba(180,180,180,0.7)" };
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  label,
  count,
  expanded,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "9px 14px 8px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid rgba(201,162,76,0.1)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ color: "rgba(201,162,76,0.55)", flexShrink: 0, display: "flex" }}>
        {icon}
      </span>
      <span style={{
        fontSize: 9.5,
        fontFamily: "var(--app-font-mono)",
        color: "var(--atlas-gold)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        opacity: 0.8,
        flex: 1,
      }}>
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: 9,
          fontFamily: "var(--app-font-mono)",
          background: "rgba(201,162,76,0.14)",
          color: "rgba(201,162,76,0.9)",
          border: "1px solid rgba(201,162,76,0.22)",
          borderRadius: 3,
          padding: "1px 5px",
          flexShrink: 0,
        }}>
          {count}
        </span>
      )}
      <span style={{ color: "var(--atlas-muted)", opacity: 0.4, flexShrink: 0, display: "flex" }}>
        {expanded
          ? <ChevronDown size={11} strokeWidth={1.8} />
          : <ChevronRight size={11} strokeWidth={1.8} />}
      </span>
    </button>
  );
}

// ── Section 1: Workspace (local git status) ───────────────────────────────────

function WorkspaceSection({ projectId, open }: { projectId: number; open: boolean }) {
  const { data, isLoading } = useQuery<{ files: Record<string, string>; hasRemote?: boolean }>({
    queryKey: ["vcp-gitstatus", projectId],
    queryFn: () =>
      fetch(`/api/fs/${projectId}/gitstatus`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 10_000,
    enabled: open,
  });

  if (!open) return null;

  const files = data?.files ?? {};
  const entries = Object.entries(files);

  return (
    <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      {isLoading && (
        <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.5 }}>
          Checking workspace…
        </div>
      )}
      {!isLoading && entries.length === 0 && (
        <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.45, lineHeight: 1.55 }}>
          {data ? "Workspace is clean — no local changes." : "Not a git repo, or no workspace yet."}
        </div>
      )}
      {entries.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {entries.map(([filePath, code]) => {
              const badge = gitBadge(code);
              return (
                <div key={filePath} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  fontSize: 11.5, fontFamily: "var(--app-font-mono)",
                  color: "var(--atlas-fg)", opacity: 0.8,
                }}>
                  {badge && (
                    <span style={{
                      color: badge.color, flexShrink: 0,
                      width: 10, textAlign: "center", fontWeight: 700,
                      fontSize: 11,
                    }}>
                      {badge.label}
                    </span>
                  )}
                  <span style={{
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {filePath}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{
            fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.45,
            fontFamily: "var(--app-font-sans)", lineHeight: 1.5, paddingTop: 2,
          }}>
            Commit & push from the Files tab → Workspace.
          </div>
        </>
      )}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

interface Props {
  projectId: number;
  linkedRepo: LinkedRepo | null;
  messages: TimelineMessage[];
  pushHistory: PushRecord[];
  onRollbackPush: (record: PushRecord) => Promise<void>;
}

export function ViewChangesPanel({
  projectId,
  linkedRepo: _linkedRepo,
  messages,
  pushHistory,
  onRollbackPush,
}: Props) {
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [atlasOpen, setAtlasOpen] = useState(true);

  const { data: wsStatus } = useQuery<{ files: Record<string, string> }>({
    queryKey: ["vcp-gitstatus-badge", projectId],
    queryFn: () =>
      fetch(`/api/fs/${projectId}/gitstatus`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 10_000,
  });
  const wsChangedCount = Object.keys(wsStatus?.files ?? {}).length;
  const atlasCount = pushHistory.length + messages.filter((m) => m.role === "assistant" && (m.fileEdits?.length || m.fileEdit || m.linePatches?.length)).length;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minHeight: "100%",
      fontFamily: "var(--app-font-sans)",
      color: "var(--atlas-fg)",
    }}>

      {/* ── Section 1: Workspace ── */}
      <SectionHeader
        icon={<FolderGit2 size={11} strokeWidth={1.7} />}
        label="Workspace"
        count={wsChangedCount}
        expanded={workspaceOpen}
        onToggle={() => setWorkspaceOpen((o) => !o)}
      />
      <WorkspaceSection projectId={projectId} open={workspaceOpen} />

      <div style={{ borderTop: "1px solid rgba(201,162,76,0.06)" }} />

      {/* ── Section 2: Atlas Activity ── */}
      <SectionHeader
        icon={<Sparkles size={11} strokeWidth={1.7} />}
        label="Atlas Activity"
        count={atlasCount > 0 ? atlasCount : undefined}
        expanded={atlasOpen}
        onToggle={() => setAtlasOpen((o) => !o)}
      />
      {atlasOpen && (
        <SessionTimeline
          messages={messages}
          pushHistory={pushHistory}
          onRollbackPush={onRollbackPush}
          projectId={projectId}
        />
      )}


    </div>
  );
}
