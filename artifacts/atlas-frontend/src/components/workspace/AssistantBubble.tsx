import { useState, useRef, useEffect, useMemo, memo, type FormEvent } from "react";
import { createEntry, useCreateEntry, getListEntriesQueryKey, useGetProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { createPortal } from "react-dom";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, CornerUpLeft, Download, Pencil, Sparkles, X, MoreHorizontal, GitBranch, Share2, Archive, FileOutput } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { addSnapshot, toggleBookmark as toggleSnapshotBookmark, rollbackTo, useAtlasHistory, type HistoryIntent } from "@/lib/atlas-history";

import { CommitCard } from "../CommitCard";
import { PlanCard } from "../PlanCard";
import { MarkdownProse } from "../MessageRenderer";
import { AtlasActionRow } from "../home/AtlasActionRow";
import { parseAtlasAction } from "../home/AtlasActionParser";
import { ResearchCard } from "../ResearchCard";
import { ThoughtForBadge } from "../ThoughtForBadge";

import { InsightChip } from "@/components/workspace/InsightChip";
import { GitHubPushModal } from "@/components/workspace/GitHubPushModal";
import { DiffViewer } from "@/components/code/DiffViewer";
import SketchReveal from "@/components/chat/SketchReveal";
import InlineSketchOffer from "@/components/chat/InlineSketchOffer";
import { useGithubPushToken } from "@/hooks/useGithubPushToken";
import {
  ICON_TOUCH_TARGET_STYLE,
  computeLineDiff,
  type PlanState,
} from "@/components/workspace/chatShared";

import { detectDecisionMoment } from "@/lib/DecisionCatchEngine";
import type { CommitCardPayload } from "@/lib/DecisionCatchEngine";
// DecisionCatchCard removed — intelligence now surfaces inline in Joy's prose.
import { DecisionArtifactCard } from "./DecisionArtifactCard";
import { RuntimeDecisionCard } from "./RuntimeDecisionCard";
import { SpeakButton } from "./SpeakButton";
import { detectPlanFromText } from "../../lib/plan";
import type { Plan, PlanExecution, StructuredPlanArtifact, StructuredDecisionGate } from "../../lib/plan";
import { DecisionGateCard } from "./DecisionGateCard";
import { haptic } from "@/lib/long-press-tip";
import { runLinePatchTrustChecks, formatTrustErrors, type TrustCheckInput } from "./linePatchTrust";
import { MessageFeedback } from "./MessageFeedback";
import PlanArtifactCardV2 from "./PlanArtifactCardV2";


import type {
  ChatMessage,
  FileEdit,
  LinePatch,
  LinkedRepo,
  PushRecord,
  ClarifyPayload,
  AlertPayload,
  TradeoffMatrix,
} from "@/pages/workspace";

function formatModelUsedLabel(modelUsed?: string | null): string | null {
  if (!modelUsed) return null;
  const normalized = modelUsed.toLowerCase().replace(/[\s_.]+/g, "-");
  if (normalized.includes("haiku")) return "Claude Haiku";
  if (normalized.includes("sonnet") || normalized === "claude") return "Claude Sonnet 4.6";
  if (normalized.includes("gpt-4o") || normalized.includes("gpt4o")) return "GPT-4o";
  if (normalized.includes("gemini") && normalized.includes("flash")) return "Gemini Flash";
  if (normalized.includes("gemini") && (normalized.includes("pro") || normalized === "gemini")) return "Gemini Pro";
  return null;
}

function ProactiveAlertCard({
  payload, projectId, sessionId, onDismiss,
}: {
  payload: AlertPayload; projectId: number; sessionId: number; onDismiss: () => void;
}) {
  const createEntry = useCreateEntry();
  const queryClient = useQueryClient();
  const handleNote = () => {
    createEntry.mutate(
      { projectId, data: { title: payload.headline, summary: payload.detail, status: "committed", severity: "neutral", mode: "THINK", sessionId } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(projectId, {}) }); onDismiss(); } }
    );
  };
  return (
    <div role="status" aria-label="Joy notice" className="atlas-bubble-in"
      style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8,
        background: "color-mix(in oklab, var(--atlas-gold) 5%, var(--atlas-surface))",
        border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 28%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: "var(--atlas-gold)", boxShadow: "0 0 6px color-mix(in oklab, var(--atlas-gold) 48%, transparent)" }} />
          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--atlas-gold)", opacity: 0.85 }}>
            {payload.headline}
          </span>
        </div>
        <button onClick={() => { haptic.short(); onDismiss(); }} title="Dismiss" aria-label="Dismiss notice"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--atlas-muted)", fontSize: 14, lineHeight: 1, padding: "2px 4px", opacity: 0.45 }}>x</button>
      </div>
      <p style={{ margin: "0 0 9px", fontSize: 12, lineHeight: 1.6, color: "var(--atlas-fg)", opacity: 0.75 }}>
        {payload.detail}
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <button disabled={createEntry.isPending} onClick={handleNote}
          style={{ padding: "4px 11px", fontSize: 9.5, fontWeight: 600, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", textTransform: "uppercase" as const, background: "transparent",
            color: "color-mix(in oklab, var(--atlas-gold) 85%, var(--atlas-fg))", border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 42%, transparent)", borderRadius: 4,
            cursor: createEntry.isPending ? "not-allowed" : "pointer", opacity: createEntry.isPending ? 0.5 : 1 }}>
          {createEntry.isPending ? "Noting..." : (payload.action || "Note it")}
        </button>
        <button onClick={onDismiss}
          style={{ padding: "4px 11px", fontSize: 9.5, fontWeight: 600, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", textTransform: "uppercase" as const, background: "transparent",
            color: "var(--atlas-muted)", border: "0.5px solid color-mix(in oklab, var(--atlas-border) 70%, transparent)", borderRadius: 4, cursor: "pointer", opacity: 0.6 }}>
          Got it
        </button>
      </div>
    </div>
  );
}

type InlinePreviewLine = { type: "added" | "removed"; line: string };

export type BuildGroupInfo =
  | { type: "intermediate"; roundCount: number }
  | { type: "final"; roundCount: number; uniqueFiles: string[]; buildVerified?: boolean };

function InlineDiffCard({
  fileEdits,
  linePatches,
  fileDeletes = [],
  fileMoves = [],
  linkedRepo,
  projectId,
  autoApplied,
  buildGroupInfo,
  onReviewDiff,
  onPushSuccess,
  onEditDeclined,
  onPrCreated,
}: {
  fileEdits: FileEdit[];
  linePatches: LinePatch[];
  fileDeletes?: Array<{ path: string }>;
  fileMoves?: Array<{ from: string; to: string }>;
  linkedRepo: LinkedRepo | null;
  projectId: number;
  autoApplied?: boolean;
  buildGroupInfo?: BuildGroupInfo | null;
  onReviewDiff: () => void;
  onPushSuccess: (records: PushRecord[]) => void;
  onEditDeclined?: () => void;
  onPrCreated?: (prUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patchedEdits, setPatchedEdits] = useState<FileEdit[] | null>(null);
  const [showPushModal, setShowPushModal] = useState(false);
  const [originals, setOriginals] = useState<Record<string, string | null>>({});
  const [inlineApplying, setInlineApplying] = useState(false);
  const [inlineApplied, setInlineApplied] = useState<string[] | null>(null);
  const [inlineApplyError, setInlineApplyError] = useState<string | null>(null);
  const [importWarnDismissed, setImportWarnDismissed] = useState(false);
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackDone, setRollbackDone] = useState(false);
  const pushSucceededRef = useRef(false);

  const { data: project } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });
  const token = useGithubPushToken(project?.githubToken);
  const fileEditKey = fileEdits.map((edit) => `${edit.path}:${edit.content.length}`).join("|");

  useEffect(() => {
    if (fileEdits.length === 0) return;
    // Without a linked repo + token we can't fetch originals — render every edit as
    // a "New file" diff so the FILE_EDIT flow stays visible. Pushing still requires
    // the repo + token, but reviewing the change should not.
    if (!linkedRepo || !token) {
      setOriginals(Object.fromEntries(fileEdits.map((edit) => [edit.path, null])));
      return;
    }
    let cancelled = false;
    void Promise.all(
      fileEdits.map(async (edit) => {
        try {
          const r = await fetch(
            `/api/github/file?repo=${encodeURIComponent(linkedRepo.fullName)}&path=${encodeURIComponent(edit.path)}&branch=${encodeURIComponent(linkedRepo.defaultBranch)}`,
            { headers: { "x-github-token": token } }
          );
          if (!r.ok) return [edit.path, null] as const;
          const d = await r.json() as { content?: string };
          return [edit.path, d.content ?? null] as const;
        } catch {
          return [edit.path, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setOriginals(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [fileEditKey, linkedRepo?.fullName, linkedRepo?.defaultBranch, token]);

  const patchGroups = useMemo(() => {
    const groups: Record<string, LinePatch[]> = {};
    for (const patch of linePatches) {
      if (!groups[patch.path]) groups[patch.path] = [];
      groups[patch.path].push(patch);
    }
    return groups;
  }, [linePatches]);

  // #27 — import validation: warn if proposed files import paths not in this write set
  const missingImports = useMemo(() => {
    try {
      if (fileEdits.length === 0) return [];
      const proposedPaths = new Set(fileEdits.map(e => e.path));
      const missing: Array<{ from: string; importPath: string; resolved: string }> = [];
      const seen = new Set<string>();
      for (const edit of fileEdits) {
        if (!edit.path || !edit.content) continue;
        const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(edit.content)) !== null) {
          const rawImport = match[1];
          const fileDir = edit.path.includes('/') ? edit.path.split('/').slice(0, -1).join('/') : '';
          const joined = fileDir ? fileDir + '/' + rawImport : rawImport;
          const parts = joined.split('/');
          const normalized: string[] = [];
          for (const p of parts) {
            if (p === '..') normalized.pop();
            else if (p !== '.') normalized.push(p);
          }
          const resolvedBase = normalized.join('/');
          const key = `${edit.path}→${resolvedBase}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const inProposal = [...proposedPaths].some(p => {
            const pBase = p.replace(/\.[^./]+$/, '');
            return pBase === resolvedBase || p === resolvedBase || pBase === resolvedBase + '/index';
          });
          if (!inProposal) {
            missing.push({ from: edit.path.split('/').pop() ?? edit.path, importPath: rawImport, resolved: resolvedBase });
          }
        }
      }
      return missing;
    } catch {
      return [];
    }
  }, [fileEdits]);

  const previewLines = useMemo<InlinePreviewLine[]>(() => {
    try {
      if (fileEdits.length > 0) {
        return fileEdits.flatMap((edit) => {
          if (!edit.content) return [];
          const original = originals[edit.path];
          const lines = original !== undefined && original !== null
            ? computeLineDiff(original, edit.content).filter((line) => line.type !== "context")
            : edit.content.split("\n").map((line) => ({ type: "added" as const, line }));
          return lines.map((line) => ({ type: line.type as "added" | "removed", line: line.line }));
        });
      }
      return linePatches.flatMap((patch) => [
        ...(patch.find ?? "").split("\n").map((line) => ({ type: "removed" as const, line })),
        ...(patch.replace ?? "").split("\n").map((line) => ({ type: "added" as const, line })),
      ]);
    } catch {
      return [];
    }
  }, [fileEdits, linePatches, originals]);

  const targetPaths = fileEdits.length > 0
    ? fileEdits.map((edit) => edit.path)
    : Object.keys(patchGroups);
  const totalOps = targetPaths.length + fileDeletes.length + fileMoves.length;
  const firstPath = targetPaths[0] ?? fileDeletes[0]?.path ?? fileMoves[0]?.from ?? "changes";
  const filename = totalOps > 1
    ? `${firstPath.split("/").pop() ?? firstPath} +${totalOps - 1}`
    : firstPath;
  const changedCount = previewLines.length;
  const visibleLines = open ? previewLines : previewLines.slice(0, 3);

  const applyLinePatches = async () => {
    if (!linkedRepo) { setError("No repo linked — connect a GitHub repo in the Files tab."); return; }
    if (!token) { setError("No GitHub token — connect GitHub from your home page."); return; }
    setApplying(true);
    setError(null);
    try {
      const edits: FileEdit[] = [];
      const trustInputs: TrustCheckInput[] = [];
      for (const [filePath, patches] of Object.entries(patchGroups)) {
        const r = await fetch(
          `/api/github/file?repo=${encodeURIComponent(linkedRepo.fullName)}&path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(linkedRepo.defaultBranch)}`,
          { headers: { "x-github-token": token } }
        );
        if (!r.ok) throw new Error(`Could not fetch ${filePath.split("/").pop()} (${r.status})`);
        const data = await r.json() as { content: string };
        const original = data.content;
        let content = original;
        for (const patch of patches) {
          const idx = content.indexOf(patch.find);
          if (idx === -1) throw new Error(`Anchor not found in ${filePath.split("/").pop()}. Ask Joy to re-read the file first.`);
          content = content.slice(0, idx) + patch.replace + content.slice(idx + patch.find.length);
        }
        const ext = filePath.split(".").pop() ?? "";
        const language = ["ts", "tsx"].includes(ext) ? "typescript" : ["js", "jsx"].includes(ext) ? "javascript" : ext;
        edits.push({ path: filePath, language, content });
        trustInputs.push({ path: filePath, patched: content, original });
      }
      // Trust layer: typecheck + partial-guard before opening push modal.
      const trustErrors = await runLinePatchTrustChecks(trustInputs);
      if (trustErrors.length > 0) {
        throw new Error(formatTrustErrors(trustErrors));
      }
      setPatchedEdits(edits);
      pushSucceededRef.current = false;
      setShowPushModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply patches.");
    } finally {
      setApplying(false);
    }
  };

  const applyLocal = async (edits: FileEdit[]) => {
    setInlineApplying(true);
    setInlineApplyError(null);
    try {
      // ── Phase 0: typecheck all TS/JS files before writing to disk ──────────
      const TC_EXTS = new Set(["ts", "tsx", "js", "jsx"]);
      const tcResults = await Promise.all(
        edits.map(async (fe) => {
          const ext = (fe.path ?? "").split(".").pop()?.toLowerCase() ?? "";
          if (!TC_EXTS.has(ext)) return { path: fe.path, clean: true, errors: [] as Array<{ line: number; col: number; message: string }> };
          try {
            const r = await fetch("/api/github/typecheck", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ content: fe.content, path: fe.path }),
            });
            if (!r.ok) return { path: fe.path, clean: true, errors: [] };
            const data = await r.json() as { errors?: Array<{ line: number; col: number; message: string }>; clean?: boolean; skipped?: boolean };
            const isClean = data.skipped === true || (data.clean ?? true);
            return { path: fe.path, clean: isClean, errors: data.errors ?? [] };
          } catch {
            return { path: fe.path, clean: true, errors: [] }; // service unavailable → allow
          }
        })
      );
      const failed = tcResults.filter((r) => !r.clean);
      if (failed.length > 0) {
        const names = failed.map((f) => (f.path ?? "").split("/").pop() ?? f.path).join(", ");
        const firstErrors = failed[0].errors.slice(0, 3).map((e) => `L${e.line}: ${e.message}`).join(" · ");
        throw new Error(
          `Typecheck failed — ${names}${firstErrors ? `: ${firstErrors}` : ""}`
        );
      }

      // ── Checkpoint before writing so the user can undo ────────────────────
      const pathsToCheckpoint = [
        ...edits.map(e => e.path),
        ...fileDeletes.map(d => d.path),
        ...fileMoves.map(m => m.from),
      ];
      if (pathsToCheckpoint.length > 0) {
        try {
          const cpRes = await fetch(`/api/fs/${projectId}/checkpoint`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ files: pathsToCheckpoint }),
          });
          if (cpRes.ok) {
            const cpData = await cpRes.json() as { checkpointId?: string };
            if (cpData.checkpointId) setCheckpointId(cpData.checkpointId);
          }
        } catch { /* checkpoint failure is non-fatal */ }
      }

      const r = await fetch("/api/github/apply-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          files: edits.map(e => ({ path: e.path, content: e.content })),
          ...(fileDeletes.length > 0 ? { fileDeletes } : {}),
          ...(fileMoves.length > 0 ? { fileMoves } : {}),
        }),
      });
      if (!r.ok) { const d = await r.json() as { error?: string }; throw new Error(d.error ?? "Apply failed"); }
      const appliedNames = [
        ...edits.map(e => e.path),
        ...fileDeletes.map(d => d.path),
        ...fileMoves.map(m => m.to),
      ];
      setInlineApplied(appliedNames);
      // Pass paths so the onPushSuccess handler in workspace.tsx can build the correct message.
      // PushRecord has many required fields — we only need `path` here, cast through unknown.
      onPushSuccess(appliedNames.map(p => ({ path: p } as unknown as import("@/pages/workspace").PushRecord)));
    } catch (e) {
      setInlineApplyError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setInlineApplying(false);
    }
  };

  const handleApply = () => {
    // Local workspace (no GitHub) — apply inline, no modal
    if (!linkedRepo) {
      // Apply file edits, deletes, and moves together
      void applyLocal(fileEdits);
      return;
    }
    // GitHub flow — open modal (file edits only; deletes/moves require local apply)
    if (fileEdits.length > 0 && fileDeletes.length === 0 && fileMoves.length === 0) {
      pushSucceededRef.current = false;
      setShowPushModal(true);
      return;
    }
    // If there are deletes or moves, fall back to local apply even with GitHub
    if (fileEdits.length > 0 || fileDeletes.length > 0 || fileMoves.length > 0) {
      void applyLocal(fileEdits);
      return;
    }
    void applyLinePatches();
  };

  const handleRollback = async () => {
    if (!checkpointId) return;
    setRollingBack(true);
    try {
      const r = await fetch(`/api/fs/${projectId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ checkpointId }),
      });
      if (!r.ok) { const d = await r.json() as { error?: string }; throw new Error(d.error ?? "Rollback failed"); }
      setRollbackDone(true);
      setInlineApplied(null);
      setCheckpointId(null);
    } catch (e) {
      setInlineApplyError(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setRollingBack(false);
    }
  };

  const modalEdits = fileEdits.length > 0 ? fileEdits : patchedEdits;

  if (autoApplied) {
    // Intermediate round in a multi-round build — suppress CommitPill entirely
    if (buildGroupInfo?.type === "intermediate") return null;

    // Determine label: summary pill for multi-round, status-enhanced pill for single-round
    let label: string;
    const statusSuffix = buildGroupInfo?.type === "final"
      ? buildGroupInfo.buildVerified === true
        ? " · Build verified"
        : buildGroupInfo.buildVerified === false
          ? " · Check failed"
          : ""
      : "";
    if (buildGroupInfo?.type === "final" && buildGroupInfo.roundCount > 1) {
      const count = buildGroupInfo.uniqueFiles.length;
      const fixRounds = buildGroupInfo.roundCount - 1;
      label = `✓ Applied · ${count} file${count !== 1 ? "s" : ""} · ${fixRounds} fix round${fixRounds !== 1 ? "s" : ""}${statusSuffix}`;
    } else {
      const names = fileEdits.map((e) => e.path?.split("/").pop() ?? e.path).filter(Boolean);
      label = `✓ Auto-applied — ${names.join(", ")}${statusSuffix}`;
    }

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", opacity: 0.55 }}>
          {label}
        </div>
        {checkpointId && !rollbackDone && (
          <button
            type="button"
            disabled={rollingBack}
            onClick={handleRollback}
            style={{ padding: "3px 8px", borderRadius: 4, background: "transparent", border: "1px solid color-mix(in oklab, var(--atlas-ember) 40%, transparent)", color: "var(--atlas-ember)", cursor: rollingBack ? "default" : "pointer", fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.06em", opacity: rollingBack ? 0.5 : 0.75 }}
          >
            {rollingBack ? "Undoing…" : "↩ Undo"}
          </button>
        )}
        {rollbackDone && (
          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9, color: "var(--atlas-muted)", opacity: 0.55 }}>↩ Undone</span>
        )}
      </div>
    );
  }

  return (
    <>
      {missingImports.length > 0 && !importWarnDismissed && (
        <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "color-mix(in oklab, var(--atlas-gold) 8%, transparent)", border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)", fontFamily: "var(--app-font-mono)", fontSize: 10, lineHeight: 1.55 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: "var(--atlas-gold)", flexShrink: 0, marginTop: 1 }}>⚠</span>
            <div style={{ flex: 1, color: "var(--atlas-muted)" }}>
              <span style={{ color: "var(--atlas-fg)" }}>{missingImports.length} import{missingImports.length > 1 ? "s" : ""} may not resolve</span>
              {" — not included in this write set: "}
              {missingImports.slice(0, 3).map((m, i) => (
                <span key={i} style={{ color: "var(--atlas-gold)", opacity: 0.85 }}>
                  {m.importPath}{i < Math.min(missingImports.length, 3) - 1 ? ", " : ""}
                </span>
              ))}
              {missingImports.length > 3 && <span style={{ opacity: 0.5 }}> +{missingImports.length - 3} more</span>}
            </div>
            <button type="button" onClick={() => setImportWarnDismissed(true)} style={{ flexShrink: 0, background: "none", border: "none", color: "var(--atlas-muted)", cursor: "pointer", padding: "0 2px", opacity: 0.55, fontSize: 12, lineHeight: 1 }}>✕</button>
          </div>
        </div>
      )}
      <div
        style={{
          marginTop: 12,
          borderRadius: 8,
          background: "var(--atlas-surface)",
          border: "1px solid var(--atlas-border)",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse" : "Expand"}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: open ? "1px solid var(--atlas-border)" : "none", background: "transparent", borderLeft: "none", borderRight: "none", borderTop: "none", cursor: "pointer", textAlign: "left" }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transition: "transform 160ms ease", transform: open ? "rotate(90deg)" : "rotate(0deg)", opacity: 0.55 }}>
            <path d="M3 2l4 3-4 3" stroke="var(--atlas-fg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--app-font-mono)", fontSize: 10.5, color: "var(--atlas-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {filename}
          </span>
          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-muted)", opacity: 0.7 }}>
            {changedCount} line{changedCount === 1 ? "" : "s"} changed
          </span>
          <span
            role="group"
            aria-label="Diff view mode"
            onClick={(e) => e.stopPropagation()}
            style={{ display: "inline-flex", marginLeft: 8, border: "0.5px solid var(--atlas-border)", borderRadius: 4, overflow: "hidden" }}
          >
            {(["unified", "split"] as const).map((mode) => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setViewMode(mode); }}
                  style={{
                    padding: "2px 7px", fontSize: 9, fontWeight: 600, fontFamily: "var(--app-font-mono)",
                    letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer",
                    background: active ? "color-mix(in oklab, var(--atlas-fg) 10%, transparent)" : "transparent",
                    color: active ? "var(--atlas-fg)" : "var(--atlas-muted)", border: "none",
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </span>
        </button>

        <div style={{ background: "var(--atlas-bg)", fontFamily: "var(--app-font-mono)", fontSize: 10.5, lineHeight: 1.55 }}>
          {fileEdits.length === 1 && originals[fileEdits[0].path] !== undefined ? (
            <DiffViewer
              before={originals[fileEdits[0].path] ?? ""}
              after={fileEdits[0].content}
              viewMode={viewMode === "split" ? "split" : "inline"}
              maxHeight={open ? 420 : 180}
              badge={originals[fileEdits[0].path] == null ? "New file" : undefined}
            />
          ) : fileEdits.length > 1 ? (
            <div>
              {fileEdits.map((edit, fi) => {
                const hasOriginal = originals[edit.path] !== undefined;
                const addedLines = edit.content.split("\n");
                const displayLines = open ? addedLines : addedLines.slice(0, 4);
                return (
                  <div key={edit.path} style={{ borderTop: fi === 0 ? "none" : "1px solid var(--atlas-border)" }}>
                    <div style={{ padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, background: "color-mix(in oklab, var(--atlas-fg) 3%, transparent)" }}>
                      <span style={{ flex: 1, fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-muted)", opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{edit.path}</span>
                      {originals[edit.path] == null && hasOriginal && <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 8.5, color: "var(--atlas-phosphor)", opacity: 0.8, letterSpacing: "0.06em" }}>NEW</span>}
                    </div>
                    {hasOriginal ? (
                      <DiffViewer
                        before={originals[edit.path] ?? ""}
                        after={edit.content}
                        viewMode={viewMode === "split" ? "split" : "inline"}
                        maxHeight={open ? 300 : 80}
                        badge={originals[edit.path] == null ? "New file" : undefined}
                      />
                    ) : (
                      displayLines.map((line, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "flex-start", background: "color-mix(in oklab, var(--atlas-phosphor) 7%, transparent)", borderLeft: "2px solid var(--atlas-phosphor)" }}>
                          <span style={{ width: 18, flexShrink: 0, textAlign: "center", color: "var(--atlas-phosphor)", userSelect: "none" as const }}>+</span>
                          <span style={{ flex: 1, padding: "1px 8px 1px 0", color: "var(--atlas-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line || " "}</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          ) : viewMode === "unified" ? visibleLines.map((line, idx) => {
            const added = line.type === "added";
            return (
              <div
                key={`${idx}-${line.type}-${line.line}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  background: added
                    ? "color-mix(in oklab, var(--atlas-phosphor) 8%, transparent)"
                    : "color-mix(in oklab, var(--atlas-ember) 8%, transparent)",
                  borderLeft: `2px solid ${added ? "var(--atlas-phosphor)" : "var(--atlas-ember)"}`,
                }}
              >
                <span style={{ width: 18, flexShrink: 0, textAlign: "center", color: added ? "var(--atlas-phosphor)" : "var(--atlas-ember)", userSelect: "none" as const }}>
                  {added ? "+" : "-"}
                </span>
                <span style={{ flex: 1, padding: "1px 8px 1px 0", color: "var(--atlas-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {line.line || " "}
                </span>
              </div>
            );
          }) : (() => {
            // Split view: pair adjacent removed/added runs side-by-side
            type Row = { left: string | null; right: string | null };
            const rows: Row[] = [];
            let i = 0;
            while (i < visibleLines.length) {
              const removed: string[] = [];
              const added: string[] = [];
              while (i < visibleLines.length && visibleLines[i].type === "removed") { removed.push(visibleLines[i].line); i++; }
              while (i < visibleLines.length && visibleLines[i].type === "added") { added.push(visibleLines[i].line); i++; }
              const len = Math.max(removed.length, added.length);
              if (len === 0) { i++; continue; }
              for (let k = 0; k < len; k++) {
                rows.push({ left: k < removed.length ? removed[k] : null, right: k < added.length ? added[k] : null });
              }
            }
            const cell = (text: string | null, kind: "removed" | "added") => (
              <div style={{
                flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start",
                background: text === null ? "transparent"
                  : kind === "added" ? "color-mix(in oklab, var(--atlas-phosphor) 8%, transparent)"
                  : "color-mix(in oklab, var(--atlas-ember) 8%, transparent)",
                borderLeft: text === null ? "2px solid transparent" : `2px solid ${kind === "added" ? "var(--atlas-phosphor)" : "var(--atlas-ember)"}`,
              }}>
                <span style={{ width: 18, flexShrink: 0, textAlign: "center", color: kind === "added" ? "var(--atlas-phosphor)" : "var(--atlas-ember)", userSelect: "none" as const }}>
                  {text === null ? " " : kind === "added" ? "+" : "-"}
                </span>
                <span style={{ flex: 1, minWidth: 0, padding: "1px 8px 1px 0", color: "var(--atlas-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {text === null ? " " : (text || " ")}
                </span>
              </div>
            );
            return rows.map((row, idx) => (
              <div key={`split-${idx}`} style={{ display: "flex", gap: 1, borderBottom: "1px solid color-mix(in oklab, var(--atlas-border) 40%, transparent)" }}>
                {cell(row.left, "removed")}
                {cell(row.right, "added")}
              </div>
            ));
          })()}
          {!open && fileEdits.length !== 1 && previewLines.length > 3 && (
            <div style={{ padding: "4px 12px", color: "var(--atlas-muted)", opacity: 0.45 }}>
              + {previewLines.length - 3} more changed line{previewLines.length - 3 === 1 ? "" : "s"}
            </div>
          )}

          {/* FILE_DELETE rows */}
          {fileDeletes.map((del, i) => (
            <div key={`del-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", borderTop: "1px solid var(--atlas-border)", background: "color-mix(in oklab, var(--atlas-ember) 5%, transparent)" }}>
              <span style={{ color: "var(--atlas-ember)", fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.06em", flexShrink: 0 }}>DELETE</span>
              <span style={{ flex: 1, fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-ember)", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{del.path}</span>
            </div>
          ))}

          {/* FILE_MOVE rows */}
          {fileMoves.map((mv, i) => (
            <div key={`mv-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", borderTop: "1px solid var(--atlas-border)", background: "color-mix(in oklab, var(--atlas-gold) 5%, transparent)" }}>
              <span style={{ color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.06em", flexShrink: 0 }}>MOVE</span>
              <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-muted)", opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: "40%" }}>{mv.from}</span>
              <span style={{ color: "var(--atlas-gold)", opacity: 0.6, fontSize: 9 }}>→</span>
              <span style={{ flex: 1, fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-gold)", opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{mv.to}</span>
            </div>
          ))}
        </div>


        <div style={{ display: "flex", justifyContent: "flex-end", gap: 7, padding: "8px 10px", borderTop: "1px solid var(--atlas-border)" }}>
          {fileEdits.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const text = fileEdits.length === 1
                  ? fileEdits[0].content
                  : fileEdits.map((ed) => `// ===== ${ed.path} =====\n${ed.content}`).join("\n\n");
                void navigator.clipboard.writeText(text);
              }}
              title="Copy full file content"
              style={{ padding: "5px 10px", borderRadius: 5, background: "transparent", border: "1px solid var(--atlas-border)", color: "var(--atlas-muted)", cursor: "pointer", fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.06em" }}
            >
              Copy
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReviewDiff(); }}
            style={{ padding: "5px 10px", borderRadius: 5, background: "transparent", border: "1px solid var(--atlas-border)", color: "var(--atlas-muted)", cursor: "pointer", fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.06em" }}
          >
            Review in Diff →
          </button>
          <button
            type="button"
            disabled={applying || inlineApplying || !!inlineApplied}
            onClick={(e) => { e.stopPropagation(); handleApply(); }}
            style={{ padding: "5px 12px", borderRadius: 5, background: inlineApplied ? "rgba(52,211,153,0.12)" : "var(--atlas-gold)", border: inlineApplied ? "1px solid rgba(52,211,153,0.35)" : "1px solid var(--atlas-gold)", color: inlineApplied ? "rgba(52,211,153,0.9)" : "var(--atlas-bg)", cursor: (applying || inlineApplying || !!inlineApplied) ? "default" : "pointer", fontFamily: "var(--app-font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", opacity: (applying || inlineApplying) ? 0.55 : 1, transition: "all 160ms ease" }}
          >
            {inlineApplying ? "Applying…" : inlineApplied ? "✓ Applied" : applying ? "Applying..." : "Apply"}
          </button>
          {inlineApplied && checkpointId && !rollbackDone && (
            <button
              type="button"
              disabled={rollingBack}
              onClick={(e) => { e.stopPropagation(); void handleRollback(); }}
              style={{ padding: "5px 10px", borderRadius: 5, background: "transparent", border: "1px solid color-mix(in oklab, var(--atlas-ember) 40%, transparent)", color: "var(--atlas-ember)", cursor: rollingBack ? "default" : "pointer", fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.06em", opacity: rollingBack ? 0.5 : 1 }}
            >
              {rollingBack ? "Undoing…" : "↩ Undo"}
            </button>
          )}
          {rollbackDone && (
            <span style={{ padding: "5px 8px", fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-muted)", opacity: 0.55 }}>↩ Undone</span>
          )}
        </div>

      </div>

      {error && (
        <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: "color-mix(in oklab, var(--atlas-ember) 9%, transparent)", border: "1px solid color-mix(in oklab, var(--atlas-ember) 24%, transparent)", color: "var(--atlas-ember)", fontFamily: "var(--app-font-mono)", fontSize: 11, lineHeight: 1.55 }}>
          {error}
        </div>
      )}
      {inlineApplyError && (
        <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: "color-mix(in oklab, var(--atlas-ember) 9%, transparent)", border: "1px solid color-mix(in oklab, var(--atlas-ember) 24%, transparent)", color: "var(--atlas-ember)", fontFamily: "var(--app-font-mono)", fontSize: 11, lineHeight: 1.55 }}>
          {inlineApplyError}
        </div>
      )}

      {linkedRepo && showPushModal && modalEdits && modalEdits.length > 0 && (
        <GitHubPushModal
          fileEdits={modalEdits}
          linkedRepo={linkedRepo}
          projectId={projectId}
          onClose={() => { setShowPushModal(false); if (!pushSucceededRef.current) onEditDeclined?.(); }}
          onPushSuccess={(records) => { pushSucceededRef.current = true; onPushSuccess(records); setShowPushModal(false); }}
          onPrCreated={onPrCreated}
        />
      )}
    </>
  );
}

function MigrationCard({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 8,
        border: "1px solid rgba(201,162,76,0.28)",
        background: "rgba(201,162,76,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 12px",
          borderBottom: "1px solid rgba(201,162,76,0.15)",
          background: "rgba(201,162,76,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {/* DB icon */}
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <ellipse cx="8" cy="4" rx="6" ry="2.2" stroke="rgba(201,162,76,0.8)" strokeWidth="1.3" />
            <path d="M2 4v4c0 1.21 2.69 2.2 6 2.2s6-.99 6-2.2V4" stroke="rgba(201,162,76,0.8)" strokeWidth="1.3" />
            <path d="M2 8v4c0 1.21 2.69 2.2 6 2.2s6-.99 6-2.2V8" stroke="rgba(201,162,76,0.8)" strokeWidth="1.3" />
          </svg>
          <span
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9,
              letterSpacing: "0.13em",
              textTransform: "uppercase" as const,
              color: "rgba(201,162,76,0.85)",
            }}
          >
            Schema Change
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: "4px 10px",
            borderRadius: 5,
            border: "1px solid rgba(201,162,76,0.35)",
            background: copied ? "rgba(201,162,76,0.18)" : "transparent",
            color: copied ? "rgba(201,162,76,1)" : "rgba(201,162,76,0.7)",
            fontSize: 10,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "all 140ms ease",
          }}
        >
          {copied ? "Copied ✓" : "Copy SQL"}
        </button>
      </div>

      {/* SQL body */}
      <pre
        style={{
          margin: 0,
          padding: "10px 12px",
          fontFamily: "var(--app-font-mono)",
          fontSize: 11.5,
          lineHeight: 1.7,
          color: "rgba(231,229,228,0.85)",
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {sql}
      </pre>
    </div>
  );
}

function TradeoffMatrixCard({ matrix }: { matrix: TradeoffMatrix }) {
  const lean = matrix.options.find((o) => o.atlas_leans === true);
  return (
    <div style={{
      marginTop: 12,
      borderRadius: 10,
      border: "1px solid color-mix(in oklab, var(--atlas-gold) 20%, var(--atlas-border))",
      background: "color-mix(in oklab, var(--atlas-surface) 85%, var(--atlas-bg))",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: "1px solid color-mix(in oklab, var(--atlas-border) 60%, transparent)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.75 }}>Tradeoff</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--atlas-fg)", lineHeight: 1.35 }}>{matrix.question}</span>
      </div>
      {matrix.context && (
        <div style={{ padding: "6px 14px 0", fontSize: 11.5, color: "var(--atlas-muted)", lineHeight: 1.5 }}>
          {matrix.context}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(matrix.options.length, 2)}, 1fr)`, gap: 1, margin: "10px 10px 10px", background: "var(--atlas-border)" }}>
        {matrix.options.map((opt) => (
          <div key={opt.label} style={{
            background: opt.atlas_leans
              ? "color-mix(in oklab, var(--atlas-gold) 6%, var(--atlas-surface))"
              : "var(--atlas-surface)",
            padding: "10px 12px",
            position: "relative",
          }}>
            {opt.atlas_leans && (
              <span style={{
                position: "absolute", top: 6, right: 8,
                fontSize: 8, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.8,
              }}>Joy pick</span>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: opt.atlas_leans ? "var(--atlas-gold)" : "var(--atlas-fg)", marginBottom: 7 }}>
              {opt.label}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
              {opt.pros.map((p) => (
                <li key={p} style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 9, color: "var(--atlas-phosphor)", flexShrink: 0, marginTop: 1 }}>+</span>
                  <span style={{ fontSize: 11, color: "var(--atlas-fg)", lineHeight: 1.45, opacity: 0.85 }}>{p}</span>
                </li>
              ))}
              {opt.cons.map((c) => (
                <li key={c} style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 9, color: "var(--atlas-ember)", flexShrink: 0, marginTop: 1 }}>−</span>
                  <span style={{ fontSize: 11, color: "var(--atlas-fg)", lineHeight: 1.45, opacity: 0.7 }}>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {lean && (
        <div style={{
          padding: "7px 14px 9px",
          borderTop: "1px solid color-mix(in oklab, var(--atlas-border) 60%, transparent)",
          fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.5,
        }}>
          <span style={{ color: "var(--atlas-gold)", fontWeight: 600 }}>Joy leans toward {lean.label}.</span>
          {" "}Override any lean if it doesn't fit.
        </div>
      )}
    </div>
  );
}

type ClarifyAnswer = {
  value: string;
  skipped: boolean;
};

function ClarifyCard({
  clarify,
  onSend,
}: {
  clarify: ClarifyPayload;
  onSend?: (message: string) => void;
}) {
  const steps = useMemo(
    () => clarify.steps.filter((step) => step.question.trim().length > 0),
    [clarify.steps],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, ClarifyAnswer>>({});
  const [freeTextOpen, setFreeTextOpen] = useState<Record<number, boolean>>({});
  const [freeTextValues, setFreeTextValues] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);

  if (done || steps.length === 0) return null;

  const activeStepIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[activeStepIndex];
  const isMultiStep = steps.length > 1;
  const currentAnswer = answers[activeStepIndex];
  const options = step.options ?? [];
  const freeTextValue = freeTextValues[activeStepIndex] ?? "";
  const isFreeTextOpen = freeTextOpen[activeStepIndex] === true;

  const finish = (nextAnswers: Record<number, ClarifyAnswer>) => {
    const hasAnyAnswer = Object.values(nextAnswers).some((answer) => !answer.skipped && answer.value.trim().length > 0);
    if (hasAnyAnswer) {
      const response = steps
        .map((answeredStep, index) => {
          const answer = nextAnswers[index];
          if (!answer) return null;
          return `Q: ${answeredStep.question} → A: ${answer.skipped ? "Skipped" : answer.value}`;
        })
        .filter((line): line is string => Boolean(line))
        .join("\n");
      if (response) onSend?.(response);
    }
    setDone(true);
  };

  const recordAnswer = (value: string, skipped = false) => {
    const normalizedValue = value.trim();
    if (!skipped && !normalizedValue) return;

    if (!isMultiStep) {
      if (!skipped) onSend?.(normalizedValue);
      setDone(true);
      return;
    }

    const nextAnswers = {
      ...answers,
      [activeStepIndex]: { value: normalizedValue, skipped },
    };
    setAnswers(nextAnswers);

    if (activeStepIndex >= steps.length - 1) {
      finish(nextAnswers);
    } else {
      setStepIndex(activeStepIndex + 1);
    }
  };

  const handleFreeTextSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    recordAnswer(freeTextValue);
  };

  const optionRowStyle = (selected: boolean) => ({
    width: "100%",
    minHeight: 46,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 9,
    border: selected
      ? "1px solid color-mix(in oklab, var(--atlas-gold) 62%, transparent)"
      : "1px solid color-mix(in oklab, var(--atlas-border) 82%, transparent)",
    background: selected
      ? "color-mix(in oklab, var(--atlas-gold) 10%, transparent)"
      : "color-mix(in oklab, var(--atlas-surface-alt) 70%, transparent)",
    color: "var(--atlas-fg)",
    cursor: "pointer",
    textAlign: "left" as const,
    fontFamily: "var(--app-font-sans)",
    fontSize: 14,
    lineHeight: 1.35,
    WebkitTapHighlightColor: "transparent",
  });

  const iconButtonStyle = (disabled = false) => ({
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid color-mix(in oklab, var(--atlas-border) 70%, transparent)",
    background: "transparent",
    color: disabled ? "color-mix(in oklab, var(--atlas-muted) 45%, transparent)" : "var(--atlas-muted)",
    cursor: disabled ? "default" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: disabled ? 0.45 : 0.85,
  });

  return (
    <div
      role="group"
      aria-label="Clarification"
      className="atlas-bubble-in"
      style={{
        marginTop: 12,
        maxWidth: 430,
        borderRadius: 14,
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 24%, var(--atlas-border))",
        background: "linear-gradient(180deg, color-mix(in oklab, var(--atlas-surface) 94%, transparent), color-mix(in oklab, var(--atlas-bg) 88%, transparent))",
        boxShadow: "0 16px 42px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.035)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 9,
              letterSpacing: "0.13em",
              textTransform: "uppercase",
              color: "var(--atlas-gold)",
              opacity: 0.78,
              marginBottom: 6,
            }}
          >
            Clarify
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.45, color: "var(--atlas-fg)", fontWeight: 600 }}>
            {step.question}
          </div>
          {step.reason && step.reason.trim().length > 0 && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12.5,
                lineHeight: 1.5,
                color: "var(--atlas-muted)",
                fontStyle: "italic",
              }}
            >
              {step.reason}
            </div>
          )}
        </div>

        {isMultiStep && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              aria-label="Previous clarification step"
              disabled={activeStepIndex === 0}
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
              style={iconButtonStyle(activeStepIndex === 0)}
            >
              <ChevronLeft size={15} strokeWidth={1.8} />
            </button>
            <div
              aria-label={`Step ${activeStepIndex + 1} of ${steps.length}`}
              style={{
                minWidth: 44,
                textAlign: "center",
                fontFamily: "var(--app-font-mono)",
                fontSize: 10,
                color: "var(--atlas-muted)",
                opacity: 0.8,
              }}
            >
              {activeStepIndex + 1} of {steps.length}
            </div>
            <button
              type="button"
              aria-label="Next clarification step"
              disabled={activeStepIndex >= steps.length - 1}
              onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
              style={iconButtonStyle(activeStepIndex >= steps.length - 1)}
            >
              <ChevronRight size={15} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Dismiss clarification"
              onClick={() => setDone(true)}
              style={iconButtonStyle()}
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((option, index) => {
          const selected = !currentAnswer?.skipped && currentAnswer?.value === option;
          return (
            <button
              key={`${option}-${index}`}
              type="button"
              onClick={() => recordAnswer(option)}
              style={optionRowStyle(selected)}
            >
              <span
                aria-hidden
                style={{
                  width: 25,
                  height: 25,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: selected
                    ? "color-mix(in oklab, var(--atlas-gold) 22%, transparent)"
                    : "color-mix(in oklab, var(--atlas-fg) 7%, transparent)",
                  color: selected ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </span>
              <span style={{ flex: 1 }}>{option}</span>
            </button>
          );
        })}

        {step.allowFreeText && (
          <>
            <button
              type="button"
              onClick={() => setFreeTextOpen((open) => ({ ...open, [activeStepIndex]: true }))}
              style={optionRowStyle(isFreeTextOpen && !currentAnswer?.skipped && currentAnswer?.value === freeTextValue.trim() && freeTextValue.trim().length > 0)}
            >
              <span
                aria-hidden
                style={{
                  width: 25,
                  height: 25,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: "color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
                  color: "var(--atlas-gold)",
                }}
              >
                <Pencil size={13} strokeWidth={1.8} />
              </span>
              <span style={{ flex: 1 }}>Something else</span>
            </button>
            {isFreeTextOpen && (
              <form onSubmit={handleFreeTextSubmit} style={{ display: "flex", gap: 8 }}>
                <input
                  value={freeTextValue}
                  onChange={(event) => setFreeTextValues((values) => ({ ...values, [activeStepIndex]: event.target.value }))}
                  autoFocus
                  placeholder="Type your answer..."
                  aria-label="Clarification free text answer"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 42,
                    borderRadius: 9,
                    border: "1px solid color-mix(in oklab, var(--atlas-border) 88%, transparent)",
                    background: "color-mix(in oklab, var(--atlas-bg) 76%, transparent)",
                    color: "var(--atlas-fg)",
                    padding: "8px 11px",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    minHeight: 42,
                    padding: "0 13px",
                    borderRadius: 9,
                    border: "1px solid var(--atlas-gold)",
                    background: "var(--atlas-gold)",
                    color: "var(--atlas-bg)",
                    cursor: "pointer",
                    fontFamily: "var(--app-font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Send
                </button>
              </form>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => recordAnswer("", true)}
          style={{
            width: "100%",
            minHeight: 42,
            borderRadius: 9,
            border: "1px solid color-mix(in oklab, var(--atlas-border) 66%, transparent)",
            background: "transparent",
            color: "var(--atlas-muted)",
            cursor: "pointer",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Skip
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid color-mix(in oklab, var(--atlas-border) 56%, transparent)",
          fontSize: 12,
          lineHeight: 1.45,
          color: "var(--atlas-muted)",
          opacity: 0.72,
        }}
      >
        Or reply directly in the composer below.
      </div>
    </div>
  );
}

// ── DecisionDraftConfirmChip ──────────────────────────────────────────────────
// Shown when the server auto-detected a DECISION signal and created a parked
// Ledger entry. User clicks Confirm to commit it; nothing is auto-committed.
function DecisionDraftConfirmChip({
  draft,
  projectId,
}: {
  draft: { entryId: number; title: string };
  projectId: number;
}) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const confirm = async () => {
    if (state === "saving" || state === "done") return;
    setState("saving");
    try {
      const res = await fetch(`/api/entries/${draft.entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "committed" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setState("done");
      setTimeout(() => setDismissed(true), 2000);
    } catch {
      setState("error");
    }
  };

  return (
    <div
      style={{
        marginTop: 10,
        padding: "9px 13px",
        borderRadius: 8,
        background: "color-mix(in oklab, var(--atlas-gold, #C9A84C) 6%, transparent)",
        border: "1px solid color-mix(in oklab, var(--atlas-gold, #C9A84C) 22%, transparent)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--atlas-gold, #C9A84C)",
            marginBottom: 3,
          }}
        >
          Decision detected
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--atlas-fg)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={draft.title}
        >
          {draft.title}
        </div>
      </div>
      {state === "done" ? (
        <span
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            color: "var(--atlas-gold, #C9A84C)",
            letterSpacing: "0.08em",
          }}
        >
          ✓ Committed
        </span>
      ) : (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            disabled={state === "saving"}
            style={{
              padding: "5px 9px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid var(--atlas-border, rgba(255,255,255,0.08))",
              color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => { void confirm(); }}
            disabled={state === "saving"}
            style={{
              padding: "5px 11px",
              borderRadius: 6,
              background: "var(--atlas-gold, #C9A84C)",
              border: "1px solid var(--atlas-gold, #C9A84C)",
              color: "#000",
              fontFamily: "var(--app-font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: state === "saving" ? "not-allowed" : "pointer",
              opacity: state === "saving" ? 0.6 : 1,
            }}
          >
            {state === "saving" ? "Saving…" : state === "error" ? "Retry" : "Confirm →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── ReadinessGateCard ─────────────────────────────────────────────────────────
// Advisory-only card — Joy always proceeds. Collapsed by default when there
// are gaps; the user can expand to see the full check list.
function ReadinessGateCard({
  result,
}: {
  result: {
    ready: boolean;
    confidence: number;
    checks: Array<{ name: string; status: "pass" | "fail" | "warn"; explanation: string }>;
    summary: string;
    originalMessage?: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);

  const warnCount = result.checks.filter(c => c.status === "warn").length;
  const failCount = result.checks.filter(c => c.status === "fail").length;
  const gapCount = warnCount + failCount;

  const hasFail = failCount > 0;
  const borderColor = result.ready
    ? "rgba(74,222,128,0.18)"
    : hasFail
    ? "rgba(239,68,68,0.18)"
    : "rgba(250,204,21,0.18)";
  const accentColor = result.ready
    ? "rgba(134,239,172,0.75)"
    : hasFail
    ? "rgba(252,165,165,0.75)"
    : "rgba(253,224,71,0.7)";

  const statusIcon = (s: "pass" | "fail" | "warn") =>
    s === "pass" ? (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" fill="rgba(74,222,128,0.12)" stroke="rgba(74,222,128,0.5)" strokeWidth="1.2" />
        <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="rgba(134,239,172,0.95)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : s === "warn" ? (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L14.5 13.5H1.5L8 2Z" fill="rgba(250,204,21,0.1)" stroke="rgba(250,204,21,0.55)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 6.5v3M8 11.5v.5" stroke="rgba(253,224,71,0.9)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ) : (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.45)" strokeWidth="1.2" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="rgba(252,165,165,0.9)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );

  const statusColor = (s: "pass" | "fail" | "warn") =>
    s === "pass" ? "rgba(134,239,172,0.8)" : s === "warn" ? "rgba(253,224,71,0.8)" : "rgba(252,165,165,0.8)";

  // Collapsed summary line
  const summaryLabel = result.ready
    ? "Readiness checked — all clear"
    : `${gapCount} gap${gapCount !== 1 ? "s" : ""} noted · building with current context`;

  return (
    <div style={{
      marginTop: 10,
      marginBottom: 2,
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      background: "rgba(14,13,11,0.25)",
      overflow: "hidden",
    }}>
      {/* Always-visible compact header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "7px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left" as const,
        }}
      >
        <span style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 8.5,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: accentColor,
          flexShrink: 0,
        }}>
          Build readiness
        </span>
        <span style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 8.5,
          color: "var(--atlas-muted)",
          letterSpacing: "0.05em",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          · {summaryLabel}
        </span>
        <span style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 8.5,
          color: "var(--atlas-muted)",
          letterSpacing: "0.08em",
          flexShrink: 0,
          marginRight: 2,
        }}>
          {result.confidence}%
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 180ms ease", opacity: 0.4 }}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded checks list */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${borderColor}`,
          padding: "8px 12px 10px",
          display: "flex",
          flexDirection: "column" as const,
          gap: 7,
        }}>
          {result.checks.map((check, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
              <span style={{ marginTop: 1, flexShrink: 0 }}>{statusIcon(check.status)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  color: statusColor(check.status),
                  marginBottom: 1,
                }}>
                  {check.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--atlas-fg)", opacity: 0.65, lineHeight: 1.5 }}>
                  {check.explanation}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AssistantBubble ───────────────────────────────────────────────────────────
function AssistantBubbleImpl({
  message,
  isNew = false,
  isLatestAssistant = false,
  projectId,
  sessionId,
  linkedRepo,
  onPark,
  onCommit,
  onRegenerate,
  onSend,
  onPushSuccess,
  onPreviewCode,
  onPrCreated,
  onRunCommand,
  onExtractToForge,
  onForgeIntake,
  onReviewDiff,
  onOpenArtifact,
  onEditDeclined,
  onAlertDismiss,
  onStreamActivityUpdate,
  onStreamActivityComplete,
  onCommitCardDone,
  priorUserMessage,
  planState,
  planExecution,
  onPlanStateChange,
  onPlanExecutionChange,
  onExecuteHomePlan,
  onBuildAnyway,
  buildGroupInfo,
}: {
  message: ChatMessage;
  isNew?: boolean;
  isLatestAssistant?: boolean;
  projectId: number;
  sessionId: number;
  linkedRepo: LinkedRepo | null;
  onPark: (content: string, sourceMessageId?: number, contextWhat?: string, details?: string) => void;
  onCommit: (content: string) => void;
  onRegenerate: () => void;
  onSend?: (message: string) => void;
  onPushSuccess: (records: PushRecord[]) => void;
  onPreviewCode?: (code: string) => void;
  onPrCreated?: (prUrl: string) => void;
  onRunCommand?: (command: string) => void;
  onExtractToForge?: (content: string) => void;
  onForgeIntake?: (content: string) => Promise<void> | void;
  onReviewDiff: () => void;
  onOpenArtifact?: (title: string) => void;
  onEditDeclined?: () => void;
  onAlertDismiss?: () => void;
  onStreamActivityUpdate?: (content: string) => void;
  onStreamActivityComplete?: () => void;
  onCommitCardDone?: () => void;
  priorUserMessage?: string;
  planState?: PlanState;
  planExecution?: PlanExecution;
  onPlanStateChange?: (messageId: number, state: PlanState) => void;
  onPlanExecutionChange?: (messageId: number, execution: PlanExecution | null) => void;
  onExecuteHomePlan?: (plan: Plan) => void;
  onBuildAnyway?: (message: string) => void;
  buildGroupInfo?: BuildGroupInfo | null;
}) {
  const [hov, setHov] = useState(false);
  const [parkDone, setParkDone] = useState(false);
  const [dismissedChipLabels, setDismissedChipLabels] = useState<Set<string>>(new Set());
  const [intakeDone, setIntakeDone] = useState(false);
  const [showForgeSheet, setShowForgeSheet] = useState(false);
  const [commitDone, setCommitDone] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [showPlanPushModal, setShowPlanPushModal] = useState(false);
  const [planPushEdits, setPlanPushEdits] = useState<FileEdit[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selfApplyStatus, setSelfApplyStatus] = useState<"idle" | "applying" | "done" | "error">("idle");
  const [selfApplyMsg, setSelfApplyMsg] = useState("");
  const [commitCardDone, setCommitCardDone] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  const activeEdits = message.fileEdits ?? (message.fileEdit ? [message.fileEdit] : []);
  const planMessageId = message.id ?? 0;

  // Derive a Plan from structured planArtifact (plan-mode responses) so PlanCard
  // can render from typed data instead of regex-parsed text.
  const planFromArtifact: Plan | null = message.planArtifact
    ? {
        title: message.planArtifact.title,
        mode: "plan",
        confidence: message.planArtifact.confidence,
        steps: message.planArtifact.steps.map((s, i) => ({
          order: i + 1,
          description: s.label,
          type: s.stepType,
          moscow: s.moscow,
          ...(s.file ? { file: s.file } : {}),
        })),
        estimatedChanges: message.planArtifact.estimatedChanges ?? 0,
        reversible: message.planArtifact.reversible ?? false,
      }
    : null;
  // Fallback: detect plan from prose for old messages that pre-date structured planArtifact.
  const planFromText: Plan | null = planFromArtifact ? null : detectPlanFromText(message.content);
  // Single effective plan used throughout — structured artifact takes priority.
  const effectivePlan: Plan | null = planFromArtifact ?? planFromText;
  const { data: planProject } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });
  const planGithubToken = useGithubPushToken(planProject?.githubToken);

  // ── Time-travel snapshot (safeguard #1: capture AFTER stream closes) ──
  const { items: historyItems } = useAtlasHistory(projectId);
  const snapshotForMsg = useMemo(
    () => historyItems.find((s) => s.associated_message_id === message.id),
    [historyItems, message.id],
  );
  const isReverted = message.reverted === true;
  useEffect(() => {
    if (message.streaming) return;
    if (message.role !== "assistant") return;
    if (!message.id || !projectId) return;
    if (snapshotForMsg) return;
    const historyIntent: HistoryIntent =
      (message.intentType === "BUILD" && "build") ||
      (message.intentType === "DECIDE" && "decide") ||
      "chat";
    const codeDelta = activeEdits.length
      ? activeEdits.map((e) => `${e.path}\n${e.content ?? ""}`).join("\n---\n")
      : undefined;
    addSnapshot(projectId, {
      associated_message_id: message.id,
      title: (message.content || "").split("\n")[0].slice(0, 80) || "Joy response",
      historyIntent,
      payload: {
        code_delta: codeDelta,
        active_file: activeEdits[0]?.path,
      },
    });
  }, [message.streaming, message.id, message.role, message.intentType, projectId, snapshotForMsg, message.content, activeEdits]);

  const imageGenDataUrl = !message.imageB64
    ? (() => {
        const raw = message.imageGen?.images?.[0]?.imageUrl;
        return typeof raw === "string" && raw.startsWith("data:image/") ? raw : "";
      })()
    : "";

  // Extract image URL from markdown image syntax in content if no base64
  const inlineImageUrl = !message.imageB64 && !imageGenDataUrl
    ? (() => {
        const match = message.content?.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        return match?.[1] ?? "";
      })()
    : "";
  const imageSrc = message.imageB64
    ? `data:${message.imageMimeType ?? "image/png"};base64,${message.imageB64}`
    : imageGenDataUrl || inlineImageUrl;
  const modelUsedLabel = formatModelUsedLabel(message.modelUsed);

  // Parse CMD_EXEC block from Joy response
  const { cmdExec, cleanContent } = useMemo(() => {
    const m = message.content.match(/CMD_EXEC:(\{[^}]*\})/);
    if (m) {
      try {
        const parsed = JSON.parse(m[1]) as { command: string; description?: string };
        if (typeof parsed.command === "string") {
          return {
            cmdExec: parsed,
            cleanContent: message.content.replace(/\n?CMD_EXEC:\{[^}]*\}/g, "").trim(),
          };
        }
      } catch {}
    }
    return { cmdExec: null, cleanContent: message.content };
  }, [message.content]);

  // Parse DB_MIGRATION_START...DB_MIGRATION_END blocks from Joy response
  const { migrationBlocks, displayContent: migrationDisplayContent } = useMemo(() => {
    const blocks: string[] = [];
    const pattern = /DB_MIGRATION_START\s*([\s\S]*?)\s*DB_MIGRATION_END/g;
    let match: RegExpExecArray | null;
    let stripped = cleanContent;
    while ((match = pattern.exec(cleanContent)) !== null) {
      const sql = match[1]?.trim();
      if (sql) blocks.push(sql);
    }
    if (blocks.length > 0) {
      stripped = cleanContent.replace(/\n?DB_MIGRATION_START[\s\S]*?DB_MIGRATION_END\n?/g, "").trim();
    }
    return { migrationBlocks: blocks, displayContent: stripped };
  }, [cleanContent]);

  // Strip FILE_EDIT blocks from the visible chat text. These blocks are
  // applied to the workspace file system and must never appear as raw syntax
  // in the chat bubble. Two passes are needed:
  //   1. Complete blocks (FILE_EDIT_START ... FILE_EDIT_END) — always strip.
  //   2. Partial/open blocks — only during streaming, where FILE_EDIT_END
  //      hasn't arrived yet. Everything from the last FILE_EDIT_START onward
  //      is in-progress and should be hidden until the block is closed.
  const displayContent = (() => {
    let c = (migrationDisplayContent ?? message.content ?? "")
      .replace(/!\[.*?\]\(https?:\/\/[^\s)]+\)/g, "")
      .replace(/\n?FILE_EDIT_START[\s\S]*?FILE_EDIT_END\n?/g, "")
      .trim();
    if (message.streaming) {
      c = c.replace(/\n?FILE_EDIT_START[\s\S]*$/, "").trim();
    }
    return c;
  })();
  const hasImageClarify = (displayContent ?? "").includes("IMAGE_CLARIFY:");
  const cleanedContent = (displayContent ?? "")
    .replace(/^INTENT_TYPE:\s*\S+$/gm, "")
    .replace(/\n\nIMAGE_CLARIFY:[^\n]*/g, "")
    .replace(/- \*\*Cinematic\*\*[^\n]*/g, "")
    .replace(/- \*\*Blueprint\*\*[^\n]*/g, "")
    .replace(/\s*NAVIGATE_TO:\s*\{[^\n]+\}\s*$/gm, "")
    .trim();

  const { actionCleanedContent, actionBlocks } = useMemo(() => {
    const ATLAS_ACTION_RE = /```atlas-action\n([\s\S]*?)```/g;
    const blocks: ReturnType<typeof parseAtlasAction>[] = [];
    const text = cleanedContent.replace(ATLAS_ACTION_RE, (_match, raw: string) => {
      const block = parseAtlasAction(raw.trim());
      if (block) blocks.push(block);
      return "";
    }).trim();
    return { actionCleanedContent: text, actionBlocks: blocks.filter(Boolean) };
  }, [cleanedContent]);

  // Detect previewable code block (html, jsx, tsx, css, or untagged with HTML tags)
  const previewableCode = useMemo(() => {
    const regex = /```(\w*)\n([\s\S]+?)```/g;
    let match;
    const previewLangs = new Set(["html", "jsx", "tsx", "css", "vue", "svelte", ""]);
    while ((match = regex.exec(message.content)) !== null) {
      const lang = (match[1] ?? "").toLowerCase();
      const code = match[2] ?? "";
      if (previewLangs.has(lang) || /<[a-zA-Z][\s\S]*?>/.test(code)) return code;
    }
    return null;
  }, [message.content]);

  const SELF_PATH_RE = /^artifacts\/(atlas|api-server)\//;
  const selfEdits = activeEdits.filter((e) => SELF_PATH_RE.test(e.path));
  const userEdits = activeEdits.filter((e) => !SELF_PATH_RE.test(e.path));
  const commitPayload = useMemo<CommitCardPayload | null>(
    () => detectDecisionMoment(message.content, priorUserMessage),
    [message.content, priorUserMessage]
  );

  const setPlanStatus = (state: PlanState) => {
    if (!message.plan && !effectivePlan) return;
    onPlanStateChange?.(planMessageId, state);
  };

  const setPlanExecution = (execution: PlanExecution | null) => {
    if (!message.plan && !effectivePlan) return;
    onPlanExecutionChange?.(planMessageId, execution);
  };

  const resolvePlanLinePatches = async (): Promise<FileEdit[]> => {
    if (!message.linePatches?.length) return [];
    if (!linkedRepo) throw new Error("No repo linked - connect a GitHub repo in the Files tab.");
    if (!planGithubToken) throw new Error("No GitHub token — connect GitHub from your home page.");
    const groups: Record<string, LinePatch[]> = {};
    for (const patch of message.linePatches) {
      if (!groups[patch.path]) groups[patch.path] = [];
      groups[patch.path].push(patch);
    }
    const edits: FileEdit[] = [];
    const trustInputs: TrustCheckInput[] = [];
    for (const [filePath, patches] of Object.entries(groups)) {
      const r = await fetch(
        `/api/github/file?repo=${encodeURIComponent(linkedRepo.fullName)}&path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(linkedRepo.defaultBranch)}`,
        { headers: { "x-github-token": planGithubToken } }
      );
      if (!r.ok) throw new Error(`Could not fetch ${filePath.split("/").pop()} (${r.status})`);
      const data = await r.json() as { content: string };
      const original = data.content;
      let content = original;
      for (const patch of patches) {
        const idx = content.indexOf(patch.find);
        if (idx === -1) throw new Error(`Anchor not found in ${filePath.split("/").pop()}. Ask Joy to re-read the file first.`);
        content = content.slice(0, idx) + patch.replace + content.slice(idx + patch.find.length);
      }
      const ext = filePath.split(".").pop() ?? "";
      const language = ["ts", "tsx"].includes(ext) ? "typescript" : ["js", "jsx"].includes(ext) ? "javascript" : ext;
      edits.push({ path: filePath, language, content });
      trustInputs.push({ path: filePath, patched: content, original });
    }
    const trustErrors = await runLinePatchTrustChecks(trustInputs);
    if (trustErrors.length > 0) throw new Error(formatTrustErrors(trustErrors));
    return edits;
  };

  const handlePlanApprove = async () => {
    // Use the structured artifact plan if available (plan-mode), fall back to FILE_EDIT-parsed plan.
    const plan = effectivePlan ?? message.plan;
    if (!plan || planState === "executing") return;
    const firstStepOrder = plan.steps[0]?.order ?? 1;
    setPlanStatus("executing");
    setPlanExecution({ currentStepOrder: firstStepOrder, completedStepOrders: [] });
    onStreamActivityUpdate?.(`PLAN_STEP:${plan.steps[0]?.description ?? plan.title}`);

    const codeEdits = userEdits.length > 0 ? userEdits : activeEdits;
    const hasCodeChanges = codeEdits.length > 0 || (message.linePatches?.length ?? 0) > 0;

    // Plan-artifact messages (plan-mode) have no FILE_EDIT blocks — delegate to home plan executor
    // which re-submits the plan as a build request and streams step-by-step progress.
    if (!hasCodeChanges) {
      onExecuteHomePlan?.(plan);
      return;
    }

    try {
      const patchEdits = await resolvePlanLinePatches();
      const modalEdits = [...codeEdits, ...patchEdits];
      if (modalEdits.length === 0) {
        setPlanExecution({
          completedStepOrders: plan.steps.map((step) => step.order),
          changedFiles: 0,
          statusMessage: "Done. 0 files changed.",
        });
        setPlanStatus("completed");
        onStreamActivityComplete?.();
        return;
      }
      const pushStep = plan.steps.find((step) => step.type === "push") ?? plan.steps[plan.steps.length - 1];
      setPlanExecution({
        currentStepOrder: pushStep?.order,
        completedStepOrders: plan.steps.filter((step) => step.order !== pushStep?.order).map((step) => step.order),
      });
      onStreamActivityUpdate?.(`PLAN_STEP:${pushStep?.description ?? "Review and push changes"}`);
      setPlanPushEdits(modalEdits);
      setShowPlanPushModal(true);
    } catch (error) {
      setPlanExecution({
        currentStepOrder: undefined,
        completedStepOrders: [],
        failedStep: {
          order: firstStepOrder,
          error: error instanceof Error ? error.message : "Plan execution failed.",
        },
      });
      setPlanStatus("pending");
      onStreamActivityComplete?.();
    }
  };

  const handleSelfApply = async () => {
    if (selfApplyStatus === "applying") return;
    setSelfApplyStatus("applying");
    setSelfApplyMsg("");
    let lastMsg = "";
    try {
      for (const edit of selfEdits) {
        const res = await fetch("/api/self/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: edit.path, content: edit.content }),
        });
        const json = await res.json() as { ok?: boolean; message?: string; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Apply failed");
        lastMsg = json.message ?? "Applied.";
      }
      setSelfApplyStatus("done");
      setSelfApplyMsg(lastMsg);
    } catch (err: unknown) {
      setSelfApplyStatus("error");
      setSelfApplyMsg(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleDownloadImage = () => {
    if (!imageSrc) return;
    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = "atlas-sketch.png";
    link.click();
  };

  return (
    <div
      className="atlas-bubble-in"
      data-msg-id={message.id ?? undefined}
      style={{
        display: "flex",
        justifyContent: "flex-start",
        marginBottom: 32,
        opacity: isReverted ? 0.42 : 1,
        filter: isReverted ? "grayscale(0.6)" : undefined,
        transition: "opacity 220ms ease, filter 220ms ease",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {isReverted && (
        <span
          style={{
            position: "absolute",
            marginLeft: -6, marginTop: -2,
            padding: "2px 7px",
            fontSize: 9, fontWeight: 600, letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(228,196,128,0.95)",
            background: "rgba(196,160,80,0.12)",
            border: "1px solid rgba(196,160,80,0.35)",
            borderRadius: 999,
          }}
        >
          Reverted
        </span>
      )}
      <div style={{ maxWidth: "min(100%, 74ch)", width: "100%", paddingLeft: 14, borderLeft: "1.5px solid rgba(201,162,76,0.13)" }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "var(--app-font-mono)", fontSize: 9,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "var(--atlas-gold)", opacity: 0.85, marginBottom: 9,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: "var(--atlas-gold)", boxShadow: "0 0 7px color-mix(in oklab, var(--atlas-gold) 55%, transparent)", opacity: 0.8 }} />
          <span>Joy</span>
          {/* Model badge is telemetry — lives in Inspect, not the header */}
          {message.isDeepDive && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "1px 6px", borderRadius: 4,
              background: "rgba(139,92,246,0.12)",
              border: "1px solid rgba(139,92,246,0.28)",
              fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
              color: "#a78bfa",
            }}>
              DEEP DIVE
            </span>
          )}
          {message.sentAt && (
            <span style={{ opacity: 0.75 }}>
              · {(() => {
                const diff = Date.now() - new Date(message.sentAt).getTime();
                const m = Math.floor(diff / 60000);
                if (m < 1) return "just now";
                if (m < 60) return `${m}m ago`;
                const h = Math.floor(m / 60);
                if (h < 24) return `${h}h ago`;
                return `${Math.floor(h / 24)}d ago`;
              })()}
            </span>
          )}
        </div>
        {/* Model label removed — surfaced via "atlas · tap to inspect" developer lens */}
        {/* Memory chips — click to expand insight and park */}
        {message.memoryChips && message.memoryChips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginBottom: 8 }}>
            {message.memoryChips.filter(c => !dismissedChipLabels.has(c.label)).map((chip) => (
              <InsightChip
                key={chip.label}
                chip={chip}
                onPark={(c) => onPark(
                  `${c.label}${c.insight ? `: ${c.insight}` : ""}`,
                  message.id,
                  c.label,
                  c.insight,
                )}
                onDismiss={(label) => setDismissedChipLabels(prev => new Set([...prev, label]))}
              />
            ))}
          </div>
        )}

        {message.repoSearch && message.repoSearch.files.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "var(--atlas-muted)", letterSpacing: "0.06em", opacity: 0.55, marginBottom: 5, fontFamily: "var(--app-font-mono)" }}>
              REPO · {message.repoSearch.query}
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
              {message.repoSearch.files.slice(0, 6).map((f) => (
                <a
                  key={f.path}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-accent)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, opacity: 0.8 }}
                >
                  {f.path}
                </a>
              ))}
            </div>
          </div>
        )}

        {message.pendingSketch && !message.imageB64 && !imageGenDataUrl && !inlineImageUrl && (
          <div style={{ marginBottom: 12 }}>
            <SketchReveal src={null} loading alt="Joy sketch" />
          </div>
        )}
        {(message.imageB64 || imageGenDataUrl || inlineImageUrl) && (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setImageExpanded(true)}
              aria-label="Expand generated visual"
              style={{ padding: 0, border: "none", background: "transparent", cursor: "zoom-in", display: "block", maxWidth: "100%" }}
            >
              <img
                src={imageSrc}
                alt="Generated visual"
                style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid rgba(201,162,76,0.2)", display: "block" }}
              />
            </button>
            <button
              type="button"
              onClick={handleDownloadImage}
              aria-label="Download generated visual"
              title="Download"
              style={{
                marginTop: 6,
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "1px solid var(--atlas-border)",
                background: "var(--atlas-glass-bg)",
                color: "var(--atlas-muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Download size={13} strokeWidth={1.7} />
            </button>
            {imageExpanded && createPortal(
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Expanded generated visual"
                onClick={() => setImageExpanded(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 10000,
                  background: "var(--atlas-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                }}
              >
                <button
                  type="button"
                  onClick={() => setImageExpanded(false)}
                  aria-label="Close expanded visual"
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: "1px solid var(--atlas-border)",
                    background: "var(--atlas-glass-bg)",
                    color: "var(--atlas-fg)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
                <img
                  src={imageSrc}
                  alt="Generated visual"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    borderRadius: 12,
                    border: "1px solid var(--atlas-border)",
                    objectFit: "contain",
                  }}
                />
              </div>,
              document.body
            )}
          </div>
        )}

        {message.browserResult && (
          <div style={{ marginBottom: 14 }}>
            {/* URL label */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                <circle cx="8" cy="8" r="6" stroke="var(--atlas-gold)" strokeWidth="1.3" />
                <path d="M8 2C8 2 5.5 5 5.5 8s2.5 6 2.5 6M8 2c0 0 2.5 3 2.5 6S8 14 8 14M2 8h12" stroke="var(--atlas-gold)" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, color: "var(--atlas-muted)", opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 260 }}>
                {message.browserResult.url}
              </span>
            </div>

            {/* Screenshot */}
            {message.browserResult.screenshotBase64 && (
              <img
                src={message.browserResult.screenshotBase64}
                alt="Browser screenshot"
                style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid rgba(201,162,76,0.2)", display: "block", width: "100%", marginBottom: message.browserResult.analysis ? 8 : 0 }}
              />
            )}

            {/* Health / monitor badge */}
            {(message.browserResult.type === "health" || message.browserResult.type === "monitor") && (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {message.browserResult.type === "health" ? (
                    message.browserResult.isHealthy ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 5, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", color: "rgba(134,239,172,0.9)", fontWeight: 700 }}>
                        ✓ HEALTHY
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 5, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", color: "rgba(252,165,165,0.9)", fontWeight: 700 }}>
                        �� ISSUES
                      </span>
                    )
                  ) : (
                    message.browserResult.hasErrors ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 5, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", color: "rgba(252,165,165,0.9)", fontWeight: 700 }}>
                        ✗ RUNTIME ERRORS
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 5, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", color: "rgba(134,239,172,0.9)", fontWeight: 700 }}>
                        ✓ NO ERRORS
                      </span>
                    )
                  )}
                </div>
                {message.browserResult.issues && message.browserResult.issues.length > 0 && (
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11, color: "rgba(252,165,165,0.75)", lineHeight: 1.7 }}>
                    {message.browserResult.issues.slice(0, 5).map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                )}
                {message.browserResult.consoleErrors && message.browserResult.consoleErrors.length > 0 && (
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11, color: "rgba(252,165,165,0.75)", lineHeight: 1.7 }}>
                    {message.browserResult.consoleErrors.slice(0, 5).map((err, i) => (
                      <li key={i} style={{ fontFamily: "var(--app-font-mono)", fontSize: 10 }}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Analysis text */}
            {message.browserResult.analysis && (
              <div style={{ fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.78, lineHeight: 1.65, marginTop: 6 }}>
                {message.browserResult.analysis}
              </div>
            )}

            {/* Scrape summary */}
            {message.browserResult.type === "scrape" && !message.browserResult.analysis && message.browserResult.summary && (
              <div style={{ fontSize: 12.5, color: "var(--atlas-fg)", opacity: 0.78, lineHeight: 1.65, marginTop: 6 }}>
                {message.browserResult.summary}
              </div>
            )}
          </div>
        )}

        {message.deployQa && (
          <div style={{ marginTop: 10, marginBottom: 10, padding: "10px 14px", borderRadius: 8, background: message.deployQa.isHealthy ? "rgba(74,222,128,0.04)" : "rgba(239,68,68,0.04)", border: `1px solid ${message.deployQa.isHealthy ? "rgba(74,222,128,0.2)" : "rgba(239,68,68,0.2)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: message.deployQa.issues.length > 0 || message.deployQa.analysis ? 8 : 0 }}>
              <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", fontWeight: 700, color: message.deployQa.isHealthy ? "rgba(134,239,172,0.9)" : "rgba(252,165,165,0.9)" }}>
                VISUAL QA — {message.deployQa.isHealthy ? "✓ HEALTHY" : "✗ ISSUES FOUND"}
              </span>
            </div>
            {message.deployQa.screenshotBase64 && (
              <img
                src={message.deployQa.screenshotBase64}
                alt="Deploy preview"
                style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid rgba(201,162,76,0.15)", display: "block", width: "100%", marginBottom: 8 }}
              />
            )}
            {message.deployQa.issues.length > 0 && (
              <ul style={{ margin: "0 0 6px", paddingLeft: 16, fontSize: 11, color: "rgba(252,165,165,0.75)", lineHeight: 1.7 }}>
                {message.deployQa.issues.slice(0, 5).map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
            {message.deployQa.analysis && (
              <div style={{ fontSize: 12, color: "var(--atlas-fg)", opacity: 0.72, lineHeight: 1.6 }}>
                {message.deployQa.analysis}
              </div>
            )}
          </div>
        )}

        {message.autoFetchedFiles && message.autoFetchedFiles.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {message.autoFetchedFiles.map((fp) => (
              <div
                key={fp}
                title={fp}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 4,
                  background: "rgba(201,162,76,0.06)",
                  border: "1px solid rgba(201,162,76,0.18)",
                  fontSize: 10, fontFamily: "var(--app-font-mono)",
                  color: "var(--atlas-muted)", letterSpacing: "0.03em",
                  maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
                  <path d="M2 1h5l3 3v7H2V1z" stroke="var(--atlas-gold)" strokeWidth="1.1" />
                  <path d="M7 1v3h3" stroke="var(--atlas-gold)" strokeWidth="1.1" />
                </svg>
                {fp.split("/").pop() ?? fp}
              </div>
            ))}
          </div>
        )}

        {/* Suppress text body when an image is attached, or while an image is still
            being generated — the sketch (or its loading state) IS the response, and
            raw in-progress prompt/description prose must never flash in its place. */}
        {!(message.imageB64 || imageGenDataUrl || (message.imageGen?.images?.length ?? 0) > 0 || message.pendingSketch) && (
        <div className="atlas-prose" style={{ fontSize: 17.5, lineHeight: 1.72, letterSpacing: "0.012em", color: "var(--atlas-fg)", opacity: 0.94, fontFamily: "var(--app-font-sans)", fontWeight: 430, WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" as const }}>
          {/* Streaming and final states use the SAME renderer so partial markdown
              renders progressively (tables, lists, code fences etc. resolve as
              tokens close). No plain-text streaming branch — no post-completion
              typography swap. See docs/handoffs/2026-07-22-shared-markdown-renderer.md */}
          <MarkdownProse content={actionCleanedContent} />
          {message.streaming && (
            <span className="atlas-cursor" aria-hidden style={{ marginLeft: 2 }} />
          )}

          {/* atlas-action quick-action pills — rendered after prose, not inside the markdown renderer */}
          {!message.streaming && actionBlocks.map((block, i) =>
            block ? (
              <AtlasActionRow
                key={i}
                block={block}
                onAction={(id, payload) => {
                  window.dispatchEvent(new CustomEvent("axiom:atlas-action", { detail: { id, payload } }));
                }}
              />
            ) : null
          )}
        </div>
        )}
        {/* Sketch failed — image generation did not produce a result */}
        {message.sketchFailed && !message.imageB64 && !imageGenDataUrl && !(message.imageGen?.images?.length) && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, opacity: 0.55 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: 12, letterSpacing: "0.02em" }}>Sketch unavailable — tap to retry</span>
            {onSend && (
              <button
                type="button"
                onClick={() => onSend("Sketch this again")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--atlas-gold)", fontSize: 12, padding: "2px 6px", borderRadius: 4, opacity: 0.8 }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {message.researchResult && (
          <ResearchCard
            url={message.researchResult.url}
            title={message.researchResult.title}
            summary={message.researchResult.summary}
            headings={message.researchResult.headings ?? []}
          />
        )}

        {message.readinessResult && (
          <ReadinessGateCard
            result={message.readinessResult}
          />
        )}

        {message.structuredPlan && (
          <PlanArtifactCardV2
            plan={message.structuredPlan}
            approval={message.commitApproval}
            history={message.structuredPlanHistory}
          />
        )}

        {message.thinkingReceipts && message.thinkingReceipts.length > 0 && (
          <details style={{ marginTop: 8, fontSize: 11, color: "var(--atlas-muted)" }}>
            <summary style={{ cursor: "pointer", opacity: 0.65, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 10 }}>
              {message.thinkingReceipts.filter(r => r.kind === "tool_call").length} tool call
              {message.thinkingReceipts.filter(r => r.kind === "tool_call").length === 1 ? "" : "s"}
            </summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 14, lineHeight: 1.55 }}>
              {message.thinkingReceipts.map((r, i) => (
                <li key={i} style={{ opacity: 0.8 }}>
                  {r.kind === "tool_call" && <><span style={{ color: "var(--atlas-gold)" }}>→</span> {r.name}</>}
                  {r.kind === "tool_result" && <><span style={{ color: r.ok ? "rgba(52,211,153,0.85)" : "rgba(248,113,113,0.9)" }}>{r.ok ? "✓" : "✕"}</span> {r.name}{typeof r.ms === "number" ? ` · ${r.ms}ms` : ""}</>}
                  {r.kind === "step_end" && <span style={{ opacity: 0.55 }}>step {r.step}{typeof r.tokensOut === "number" ? ` · ${r.tokensOut}t` : ""}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {message.decisionGate && (
          <DecisionGateCard
            gate={message.decisionGate}
            resolved={!!message.decisionGateResolved}
            selectedValue={message.decisionGateSelectedValue}
            onSelect={(value, label) => {
              onSend?.(`${label}`);
            }}
          />
        )}

        {message.reviewNotes && message.reviewNotes.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-amber-400/90">
              <span className="text-amber-400">⚠</span>
              Joy flagged {message.reviewNotes.length === 1 ? "an issue" : `${message.reviewNotes.length} issues`} in this change
            </div>
            <ul className="space-y-0.5 text-[11px] text-amber-200/70">
              {message.reviewNotes.map((note, i) => (
                <li key={i} className="leading-relaxed">— {note}</li>
              ))}
            </ul>
          </div>
        )}

        {message.confidenceAssessment && (message.fileEdits?.length ?? 0) > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={
              message.confidenceAssessment.confidence === "high" ? "text-emerald-400/70" :
              message.confidenceAssessment.confidence === "medium" ? "text-amber-400/70" :
              "text-red-400/70"
            }>●</span>
            <span>
              {message.confidenceAssessment.confidence === "high" ? "High" :
               message.confidenceAssessment.confidence === "medium" ? "Medium" : "Low"} confidence
              {message.confidenceAssessment.blast_radius && (
                <span className="ml-1 opacity-60">· {message.confidenceAssessment.blast_radius} blast radius</span>
              )}
            </span>
            {message.confidenceAssessment.summary && (
              <span className="opacity-50">— {message.confidenceAssessment.summary}</span>
            )}
          </div>
        )}

        {/* Only render SketchReveal for imageGen when the image hasn't already been
            extracted to imageB64 or imageGenDataUrl (those render at the img block above).
            Rendering both causes SKETCHING… to get stuck below the already-loaded image. */}
        {!message.imageB64 && !imageGenDataUrl && message.imageGen?.images?.map((img, i) => (
          <SketchReveal
            key={i}
            src={img.imageUrl}
            alt={img.prompt}
            caption={`${img.mode === "render" ? "Render" : "Schematic"} · ${img.model}`}
          />
        ))}

        {message.awaitingPlan && !message.planArtifact && (
          <div
            style={{
              marginTop: 8,
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--atlas-muted)",
              opacity: 0.7,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--atlas-gold)",
                animation: "atlas-pulse 1.2s ease-in-out infinite",
              }}
            />
            Structuring plan…
          </div>
        )}

        {!message.streaming && effectivePlan && planState !== "skipped" && (
          <PlanCard
            plan={effectivePlan}
            messageId={planMessageId}
            projectId={projectId}
            isExecuting={planState === "executing"}
            isExpanded={planState === "reviewing"}
            isCompleted={planState === "completed"}
            execution={planExecution}
            onReview={() => setPlanStatus(planState === "reviewing" ? "pending" : "reviewing")}
            onSkip={() => setPlanStatus("skipped")}
            onApprove={() => void handlePlanApprove()}
          />
        )}


        {migrationBlocks.map((sql, i) => (
          <MigrationCard key={i} sql={sql} />
        ))}

        {!message.streaming && message.clarify && (
          <ClarifyCard clarify={message.clarify} onSend={onSend} />
        )}

        {!message.streaming && message.tradeoffMatrix && (
          <TradeoffMatrixCard matrix={message.tradeoffMatrix} />
        )}

        {/* Build lifecycle card — Preparing → Building → Styling → Checking → Ready */}
        {message.activeBuild && !message.generatedArtifacts?.length && (() => {
          const BUILD_STAGES = ["Preparing", "Building", "Styling", "Checking", "Ready"] as const;
          const currentStage = message.activeBuild.stage ?? "Preparing";
          const currentIdx = BUILD_STAGES.indexOf(currentStage as typeof BUILD_STAGES[number]);
          const isReady = currentStage === "Ready";
          const hasIssues = isReady && (message.activeBuild.validationIssues?.length ?? 0) > 0;
          const isDone = isReady && !hasIssues;

          return (
            <div style={{
              marginTop: 8,
              padding: "12px 14px",
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${hasIssues ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.09)"}`,
              borderRadius: 10,
            }}>
              <style>{`
                @keyframes ab-build-spin { to { transform: rotate(360deg); } }
                @keyframes ab-build-pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
              `}</style>

              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                {isDone ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : hasIssues ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    style={{ opacity: 0.65, flexShrink: 0, animation: "ab-build-spin 1.4s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
                <span style={{ fontSize: 12, fontWeight: 500, opacity: isDone ? 0.7 : 0.9, letterSpacing: "0.01em", color: isDone ? "#22c55e" : hasIssues ? "#fbbf24" : "inherit" }}>
                  {isDone ? `${message.activeBuild.title || message.activeBuild.type.toUpperCase()} — Ready` :
                   hasIssues ? `${message.activeBuild.title || message.activeBuild.type.toUpperCase()} — Review needed` :
                   `Building ${message.activeBuild.title || message.activeBuild.type.toUpperCase()}…`}
                </span>
              </div>

              {/* Stage stepper */}
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                {BUILD_STAGES.map((stage, i) => {
                  const done = i < currentIdx || isReady;
                  const active = i === currentIdx && !isReady;
                  return (
                    <div key={stage} style={{ display: "flex", alignItems: "center", flex: i < BUILD_STAGES.length - 1 ? 1 : "none" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: done || (isReady && isDone) ? "#22c55e"
                            : hasIssues && isReady && i === currentIdx ? "#fbbf24"
                            : active ? "var(--atlas-gold, #c9aa71)"
                            : "rgba(255,255,255,0.18)",
                          animation: active ? "ab-build-pulse 1.2s ease-in-out infinite" : "none",
                          transition: "background 0.3s ease",
                          flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: 9, letterSpacing: "0.03em", whiteSpace: "nowrap",
                          opacity: done || active ? 0.7 : 0.3,
                          color: done && isDone ? "#22c55e" : hasIssues && i === currentIdx ? "#fbbf24" : "inherit",
                          fontWeight: active ? 600 : 400,
                        }}>
                          {stage}
                        </span>
                      </div>
                      {i < BUILD_STAGES.length - 1 && (
                        <div style={{
                          flex: 1, height: 1,
                          background: i < currentIdx ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)",
                          margin: "0 3px",
                          marginBottom: 12,
                          transition: "background 0.3s ease",
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Validation issues (shown when stage=Ready and issues exist) */}
              {hasIssues && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Validation notes</div>
                  {(message.activeBuild.validationIssues ?? []).map((issue: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11, opacity: 0.75, marginTop: 3 }}>
                      <span style={{ color: "#fbbf24", flexShrink: 0, marginTop: 1 }}>⚠</span>
                      <span>{issue}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, opacity: 0.4, marginTop: 6 }}>Joy attempted a correction pass — check the output in Draft.</div>
                </div>
              )}
            </div>
          );
        })()}

        {!message.streaming && message.decisionArtifacts?.map((artifact) => (
          <DecisionArtifactCard key={`${artifact.type}-${artifact.id}`} artifact={artifact} />
        ))}

        {!message.streaming && message.runtimeCard && (
          <RuntimeDecisionCard data={message.runtimeCard} projectId={projectId} />
        )}

        {hasImageClarify && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onSend?.("Cinematic — single hero shot")}
              style={{
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid var(--atlas-gold)",
                borderRadius: 8,
                color: "var(--atlas-gold)",
                fontFamily: "var(--app-font-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              ◈ Cinematic
            </button>
            <button
              type="button"
              onClick={() => onSend?.("Blueprint — multi-panel breakdown sheet")}
              style={{
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid var(--atlas-border)",
                borderRadius: 8,
                color: "var(--atlas-fg)",
                fontFamily: "var(--app-font-mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              ◫ Blueprint
            </button>
          </div>
        )}

        {cleanedContent.trim() && !message.streaming && !commitPayload
          && !message.autoPushed
          && !(message.imageB64 || imageGenDataUrl || (message.imageGen?.images?.length ?? 0) > 0)
          && !(message.fileEdits && message.fileEdits.length > 0) && (
          <div style={{ marginTop: 6 }}>
            <ThoughtForBadge
              metrics={{
                executionTimeMs: message.executionTimeMs,
                inputTokens: message.inputTokens,
                outputTokens: message.outputTokens,
                costUsd: message.costUsd,
              }}
            />
          </div>
        )}

        {!message.streaming && message.plan && /FILE_EDIT_START/i.test(message.content) && planState !== "skipped" && (
          <PlanCard
            plan={message.plan}
            messageId={planMessageId}
            projectId={projectId}
            isExecuting={planState === "executing"}
            isExpanded={planState === "reviewing"}
            isCompleted={planState === "completed"}
            execution={planExecution}
            onReview={() => setPlanStatus(planState === "reviewing" ? "pending" : "reviewing")}
            onSkip={() => setPlanStatus("skipped")}
            onApprove={() => void handlePlanApprove()}
          />
        )}

        {showPlanPushModal && planPushEdits && planPushEdits.length > 0 && message.plan && (
          <GitHubPushModal
            fileEdits={planPushEdits}
            linkedRepo={linkedRepo}
            projectId={projectId}
            onClose={() => {
              setShowPlanPushModal(false);
              setPlanStatus("pending");
              setPlanExecution(null);
              onStreamActivityComplete?.();
            }}
            onPushSuccess={(records) => {
              onPushSuccess(records);
              const changedFiles = new Set(records.map((record) => record.path)).size;
              setPlanExecution({
                completedStepOrders: message.plan?.steps.map((step) => step.order) ?? [],
                changedFiles,
                statusMessage: `Done. ${changedFiles} file${changedFiles === 1 ? "" : "s"} changed.`,
              });
              setPlanStatus("completed");
              setShowPlanPushModal(false);
              // Transition the run from awaiting_approval → succeeded now that the push is done.
              const runId = (message as any).runId as string | null | undefined;
              if (runId) {
                fetch(`/api/runs/${runId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ status: "succeeded" }),
                }).catch(() => { /* non-fatal */ });
              }
              onStreamActivityComplete?.();
            }}
            onPrCreated={onPrCreated}
          />
        )}

        {/* Code ready card — self-repair paths */}
        {!message.streaming && selfEdits.length > 0 && (
          <div
            style={{
              marginTop: 12, padding: "11px 14px", borderRadius: 8,
              background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.18)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* wrench icon */}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M10.5 1.5A3.5 3.5 0 007 5c0 .36.05.71.14 1.04L2.5 10.5A1.5 1.5 0 004.5 12.5l4.46-4.64c.33.09.68.14 1.04.14a3.5 3.5 0 000-7z" stroke="rgba(56,189,248,0.9)" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="10.5" cy="5" r="1" fill="rgba(56,189,248,0.9)" />
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(56,189,248,0.9)", marginBottom: 2 }}>
                  {selfEdits.length === 1 ? "Self-repair ready" : `${selfEdits.length} Joy files ready`}
                </div>
                <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, color: "var(--atlas-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {selfEdits.length === 1
                    ? <>{selfEdits[0].path.split("/").pop()}<span style={{ opacity: 0.5, marginLeft: 6 }}>· {selfEdits[0].content.split("\n").length} lines</span></>
                    : selfEdits.map((e) => e.path.split("/").pop()).join(", ")
                  }
                </div>
                {selfApplyStatus === "done" && (
                  <div style={{ fontSize: 10, color: "rgba(56,189,248,0.7)", marginTop: 3 }}>✓ {selfApplyMsg}</div>
                )}
                {selfApplyStatus === "error" && (
                  <div style={{ fontSize: 10, color: "var(--atlas-ember)", marginTop: 3 }}>✗ {selfApplyMsg}</div>
                )}
              </div>
            </div>
            <button
              onClick={handleSelfApply}
              disabled={selfApplyStatus === "applying" || selfApplyStatus === "done"}
              style={{
                flexShrink: 0, padding: "6px 13px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                background: selfApplyStatus === "done"
                  ? "rgba(56,189,248,0.08)"
                  : "linear-gradient(180deg, rgba(56,189,248,0.9) 0%, rgba(14,165,233,0.85) 100%)",
                color: selfApplyStatus === "done" ? "rgba(56,189,248,0.5)" : "#0a1628",
                border: selfApplyStatus === "done" ? "1px solid rgba(56,189,248,0.2)" : "none",
                cursor: selfApplyStatus === "applying" || selfApplyStatus === "done" ? "default" : "pointer",
                opacity: selfApplyStatus === "applying" ? 0.6 : 1,
                transition: "opacity 160ms ease",
              }}
            >
              {selfApplyStatus === "applying" ? "Applying…" : selfApplyStatus === "done" ? "Applied ✓" : "Apply to Joy →"}
            </button>
          </div>
        )}

        {!message.streaming && (userEdits.length > 0 || (message.linePatches && message.linePatches.length > 0) || (message.fileDeletes && message.fileDeletes.length > 0) || (message.fileMoves && message.fileMoves.length > 0)) && (
          <InlineDiffCard
            fileEdits={userEdits}
            linePatches={message.linePatches ?? []}
            fileDeletes={message.fileDeletes ?? []}
            fileMoves={message.fileMoves ?? []}
            linkedRepo={linkedRepo}
            projectId={projectId}
            autoApplied={!!message.autoPushed}
            buildGroupInfo={buildGroupInfo}
            onReviewDiff={onReviewDiff}
            onPushSuccess={onPushSuccess}
            onEditDeclined={onEditDeclined}
            onPrCreated={onPrCreated}
          />
        )}

        {(() => {
          const primaryCardShown =
            (!message.streaming &&
              !!message.plan &&
              /FILE_EDIT_START/i.test(message.content) &&
              planState !== "skipped") ||
            (!message.streaming &&
              (userEdits.length > 0 || (message.linePatches?.length ?? 0) > 0));

          return (
            <>
              {!primaryCardShown && !message.streaming && commitPayload && !commitCardDone && (
                <CommitCard
                  payload={commitPayload}
                  projectId={projectId}
                  sessionId={sessionId}
                  sourceMessageId={message.id}
                  onDone={() => {
                    setCommitCardDone(true);
                    onCommitCardDone?.();
                  }}
                />
              )}

              {!primaryCardShown && !message.streaming && message.alertPayload && !message.alertResolved && (
                <ProactiveAlertCard
                  payload={message.alertPayload}
                  projectId={projectId}
                  sessionId={sessionId}
                  onDismiss={() => onAlertDismiss?.()}
                />
              )}

              {/* Decision Catch card UI removed — intelligence now surfaces inline
                  in Joy's prose. Payload still arrives on message.catchPayload
                  for telemetry/inline hints; no modal-style interrupt is rendered.
                  Hard confirmations (destructive actions) live on their own dialogs. */}

              {!message.streaming && message.decisionDraft && projectId && (
                <DecisionDraftConfirmChip
                  draft={message.decisionDraft}
                  projectId={projectId}
                />
              )}
            </>
          );
        })()}



        {/* CMD_EXEC — runnable command card suggested by Joy */}
        {!message.streaming && cmdExec && (
          <div
            style={{
              marginTop: 12, padding: "10px 14px",
              borderRadius: 8,
              background: "var(--atlas-surface)",
              border: "1px solid rgba(201,162,76,0.22)",
              display: "flex", alignItems: "center", gap: 10,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.65 }}>
              <path d="M2 4l5 4-5 4" stroke="rgba(201,162,76,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 12h5" stroke="rgba(201,162,76,0.9)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 12.5, color: "rgba(201,162,76,0.92)", letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cmdExec.command}
              </div>
              {cmdExec.description && (
                <div style={{ fontSize: 11, color: "var(--atlas-muted)", marginTop: 2, opacity: 0.8 }}>{cmdExec.description}</div>
              )}
            </div>
            <button
              onClick={() => onRunCommand?.(cmdExec.command)}
              style={{
                flexShrink: 0, padding: "5px 12px", borderRadius: 5,
                background: "rgba(146,64,14,0.25)",
                border: "1px solid rgba(146,64,14,0.55)",
                color: "rgba(230,150,90,0.95)",
                fontSize: 11, fontWeight: 600, fontFamily: "var(--app-font-mono)",
                letterSpacing: "0.08em", cursor: "pointer",
                transition: "all 140ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(146,64,14,0.4)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(146,64,14,0.25)")}
            >
              Run →
            </button>
          </div>
        )}

        {/* Action row — feedback + primary cockpit + overflow menu */}
        {!message.streaming && (
        <div style={{ position: "relative", display: "flex", gap: 0, marginTop: 6, marginLeft: -6, alignItems: "center", transition: "opacity 180ms ease" }}>

          {/* Feedback — only persistent on the newest Joy response */}
          {isLatestAssistant && (
            <div style={{ marginRight: 2 }}>
              <MessageFeedback messageId={message.id} />
            </div>
          )}

          {/* ───── PRIMARY ───── Roll back · Copy · Regenerate · Commit
              On older messages these stay hidden until the user hovers/taps,
              keeping the transcript quiet. ⋯ More remains reachable below. */}
          {(isLatestAssistant || hov) && (
          <>

          {snapshotForMsg && !isReverted && (
            <button
              className="atlas-icon-action"
              title="Roll back to here"
              aria-label="Roll back to here"
              style={{ ...ICON_TOUCH_TARGET_STYLE, color: "var(--atlas-gold)" }}
              onClick={() => {
                if (typeof window !== "undefined" &&
                    !window.confirm("Roll back to this message? Newer responses will move to Reverted edits.")) return;
                rollbackTo(projectId, snapshotForMsg.id);
              }}
            >
              <CornerUpLeft size={13} strokeWidth={1.8} />
            </button>
          )}

          <button
            className={`atlas-icon-action${copied ? " copy-done" : ""}`}
            title={copied ? "Copied!" : "Copy response"}
            aria-label="Copy message"
            style={ICON_TOUCH_TARGET_STYLE}
            onClick={() => { navigator.clipboard.writeText(message.content).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
          >
            {copied
              ? <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l3 3 7-7" /></svg>
              : <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M9 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v5a1 1 0 001 1h2" /></svg>
            }
          </button>

          <SpeakButton text={message.content} style={ICON_TOUCH_TARGET_STYLE} />

          {/* Regenerate, Commit, and Sketch moved to ⋯ overflow — keeps the bar minimal */}
          </>
          )}

          {/* ───── OVERFLOW ───── three-dot menu (always reachable) */}
          <button
            className="atlas-icon-action"
            title="More actions"
            aria-label="More actions"
            aria-expanded={menuOpen}
            style={{ ...ICON_TOUCH_TARGET_STYLE, opacity: isLatestAssistant || hov ? 1 : 0.45 }}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          >
            <MoreHorizontal size={13} strokeWidth={1.7} />
          </button>


          {menuOpen && createPortal(
            <>
              <div
                onPointerDown={() => setMenuOpen(false)}
                onTouchStart={() => setMenuOpen(false)}
                onClick={() => setMenuOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 99998, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }}
              />
              <div
                role="menu"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "fixed", top: "auto", left: "auto", zIndex: 99999,
                  marginTop: 6,
                  minWidth: 220, maxWidth: "calc(100vw - 16px)",
                  overflowY: "auto", WebkitOverflowScrolling: "touch",
                  padding: 6, borderRadius: 12,
                  background: "var(--atlas-surface)",
                  border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
                  boxShadow: "0 18px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                  fontFamily: "var(--app-font-sans)",
                }}
                ref={(el) => {
                  if (!el) return;
                  const trigger = document.querySelector(`[aria-label="More actions"][aria-expanded="true"]`) as HTMLElement | null;
                  if (!trigger) return;
                  const r = trigger.getBoundingClientRect();
                  const vh = window.innerHeight;
                  const vw = window.innerWidth;
                  const menuW = Math.min(228, vw - 16);
                  const desired = el.scrollHeight || 320;
                  const maxH = vh - 24;
                  const menuH = Math.min(desired, maxH);
                  el.style.maxHeight = `${maxH}px`;
                  const spaceBelow = vh - r.bottom;
                  const spaceAbove = r.top;
                  const top = spaceBelow >= menuH + 12
                    ? r.bottom + 6
                    : spaceAbove >= menuH + 12
                      ? r.top - menuH - 6
                      : Math.max(8, vh - menuH - 8);
                  const left = Math.max(8, Math.min(vw - menuW - 8, r.left));
                  el.style.top = `${top}px`;
                  el.style.left = `${left}px`;
                }}
              >
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 2px 4px" }}>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      width: 26, height: 26, borderRadius: 999,
                      background: "transparent", border: "none",
                      color: "var(--atlas-muted)", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
                <MenuItem
                  icon={<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 7a5.5 5.5 0 005.5 5.5 5.5 5.5 0 005.5-5.5 5.5 5.5 0 00-5.5-5.5 5.5 5.5 0 00-3.9 1.6" /><polyline points="1.5 1.5 1.5 4 4 4" /></svg>}
                  label="Regenerate response"
                  onClick={() => { setMenuOpen(false); onRegenerate?.(); }}
                />
                <MenuItem
                  icon={commitDone
                    ? <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l3 3 7-7" /></svg>
                    : <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="1.5" width="10" height="11" rx="1.5" /><path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" /></svg>
                  }
                  label={commitDone ? "Committed to ledger" : "Commit to ledger"}
                  disabled={commitDone}
                  onClick={() => { setMenuOpen(false); if (!commitDone) { onCommit(message.content); setCommitDone(true); } }}
                />
                {!message.imageB64 && !message.imageGen && message.content && onSend && (
                  <MenuItem
                    icon={<Sparkles size={13} strokeWidth={1.6} />}
                    label="Sketch this…"
                    onClick={() => { setMenuOpen(false); onSend(`Sketch this: ${message.content.slice(0, 120)}`); }}
                  />
                )}
                {snapshotForMsg && (
                  <MenuItem
                    icon={snapshotForMsg.isBookmarked ? <BookmarkCheck size={13} strokeWidth={1.7} /> : <Bookmark size={13} strokeWidth={1.6} />}
                    label={snapshotForMsg.isBookmarked ? "Bookmarked" : "Bookmark snapshot"}
                    onClick={() => { setMenuOpen(false); toggleSnapshotBookmark(projectId, snapshotForMsg.id); }}
                  />
                )}
                <MenuItem
                  icon={<GitBranch size={13} strokeWidth={1.6} />}
                  label="Fork / branch thread"
                  onClick={() => { setMenuOpen(false); toast("Branching coming soon"); }}
                />
                <MenuItem
                  icon={<FileOutput size={13} strokeWidth={1.6} />}
                  label="Export as artifact"
                  onClick={() => { setMenuOpen(false); toast("Sent to Artifacts workbench"); }}
                />
                <MenuItem
                  icon={<Archive size={13} strokeWidth={1.6} />}
                  label={parkDone ? "Parked" : "Park to inbox"}
                  disabled={parkDone}
                  onClick={() => { setMenuOpen(false); if (!parkDone) { onPark(message.content, message.id); setParkDone(true); } }}
                />
                {(onForgeIntake || onExtractToForge) && (
                  <MenuItem
                    icon={<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 11h10M4 8l3-5 3 5" /></svg>}
                    label="Forge…"
                    accent
                    onClick={() => { setMenuOpen(false); setShowForgeSheet(true); }}
                  />
                )}
                <MenuItem
                  icon={<Share2 size={13} strokeWidth={1.6} />}
                  label="Share / archive"
                  onClick={() => { setMenuOpen(false); toast("Share link coming soon"); }}
                />
                {previewableCode && onPreviewCode && (
                  <MenuItem
                    icon={<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2" width="12" height="9" rx="1.5" /><path d="M5 5.5l2 2-2 2M8.5 9.5h1.5" /></svg>}
                    label="Preview in sandbox"
                    onClick={() => { setMenuOpen(false); onPreviewCode(previewableCode); }}
                  />
                )}
                <MenuItem
                  icon={<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5" /><path d="M7 4.5v3l2 1.5" /></svg>}
                  label="View session history"
                  onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("atlas:open-history-sheet")); }}
                />
              </div>
            </>,
            document.body
          )}
        </div>
        )}
      </div>

      {showForgeSheet && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
          onClick={() => setShowForgeSheet(false)}
        >
          <div
            role="dialog"
            aria-label="Forge this response"
            style={{ position: "relative", zIndex: 10000, width: "100%", maxWidth: 360, background: "color-mix(in oklab, var(--atlas-surface) 94%, transparent)", backdropFilter: "blur(28px) saturate(150%)", border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)", borderRadius: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.65), inset 0 1px 0 color-mix(in oklab, var(--atlas-gold) 12%, transparent)", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, padding: "14px 16px 10px", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(var(--atlas-muted-rgb),0.5)", borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 8%, transparent)" }}>
              Forge this response
            </p>
            {onForgeIntake && (
              <button
                type="button"
                disabled={intakeDone}
                onClick={async () => {
                  if (intakeDone) return;
                  setShowForgeSheet(false);
                  try { await onForgeIntake(message.content); setIntakeDone(true); } catch { /* surfaced by parent */ }
                }}
                style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, padding: "13px 16px", background: "transparent", border: "none", borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 8%, transparent)", cursor: intakeDone ? "default" : "pointer", opacity: intakeDone ? 0.45 : 1, textAlign: "left", WebkitTapHighlightColor: "transparent" }}
                onPointerDown={(e) => { if (!intakeDone) e.currentTarget.style.background = "rgba(201,162,76,0.06)"; }}
                onPointerUp={(e) => { e.currentTarget.style.background = "transparent"; }}
                onPointerLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 15, color: "var(--atlas-gold)", fontFamily: "var(--app-font-sans)" }}>{intakeDone ? "✓ Sent to Forge" : "⚡ Quick Forge"}</span>
                <span style={{ fontSize: 12, color: "rgba(var(--atlas-muted-rgb),0.55)", fontFamily: "var(--app-font-sans)" }}>Immediately map this response into the project.</span>
              </button>
            )}
            {onExtractToForge && (
              <button
                type="button"
                onClick={() => { setShowForgeSheet(false); onExtractToForge(message.content); }}
                style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, padding: "13px 16px 15px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent" }}
                onPointerDown={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.06)"; }}
                onPointerUp={(e) => { e.currentTarget.style.background = "transparent"; }}
                onPointerLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 15, color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)" }}>✏️ Review First</span>
                <span style={{ fontSize: 12, color: "rgba(var(--atlas-muted-rgb),0.55)", fontFamily: "var(--app-font-sans)" }}>Open the Forge editor to review and edit before mapping.</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {showPushModal && activeEdits.length > 0 && (
        <GitHubPushModal
          fileEdits={activeEdits}
          linkedRepo={linkedRepo}
          projectId={projectId}
          onClose={() => setShowPushModal(false)}
          onPushSuccess={(records) => { onPushSuccess(records); setShowPushModal(false); }}
          onPrCreated={onPrCreated}
        />
      )}

      {/* v1.4 — system-owned outcome footer. Rendered from backend-derived RunOutcome,
          never from model prose. Only visible on non-streaming turns that used the
          execution state machine (executionOutcome present + code != NOT_STARTED). */}
      {!message.streaming && message.executionOutcome && message.executionOutcome.code !== "NOT_STARTED" && (() => {
        const oc = message.executionOutcome!;
        const hasMutationEvidence = Boolean(
          (message.fileEdits && message.fileEdits.length > 0) ||
          message.fileEdit ||
          (message.linePatches && message.linePatches.length > 0) ||
          (message.fileDeletes && message.fileDeletes.length > 0) ||
          message.githubPush,
        );
        if ((oc.code === "CAUSE_CONFIRMED" || oc.code === "CHANGE_PROPOSED" || oc.code === "CHANGE_APPLIED") && !hasMutationEvidence) {
          return null;
        }
        const isComplete = oc.complete;
        const isFailed = oc.code === "FAILED" || oc.code === "BLOCKED";
        const dotColor = isComplete
          ? "var(--atlas-green, #4caf50)"
          : isFailed
            ? "var(--atlas-red, #ef5350)"
            : "var(--atlas-gold, #c8a96e)";
        return (
          <div style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: "1px solid color-mix(in oklab, var(--atlas-muted) 18%, transparent)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: dotColor,
              flexShrink: 0,
              display: "inline-block",
            }} />
            <span style={{
              fontSize: 11,
              color: "var(--atlas-muted)",
              fontFamily: "var(--app-font-sans)",
              letterSpacing: "0.01em",
            }}>
              {oc.label}
            </span>
            {oc.pendingVerification.length > 0 && (
              <span style={{
                fontSize: 10,
                color: "color-mix(in oklab, var(--atlas-muted) 60%, transparent)",
                fontFamily: "var(--app-font-sans)",
              }}>
                — {oc.pendingVerification[0].replace(/_/g, " ").toLowerCase()} pending
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// Shallow-compare all non-function props. Function props (callbacks) are treated
// as always equal — parents usually recreate them each render, and re-running
// AssistantBubble (2700+ LOC) on every keystroke/streaming tick just to pick up
// a new callback identity is the perf bug we're fixing. Callbacks are only
// invoked on user interaction; by then, closures capture current state via
// message identity (which IS compared).
function assistantBubblePropsEqual(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(prev).length) return false;
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (Object.is(a, b)) continue;
    if (typeof a === "function" && typeof b === "function") continue;
    return false;
  }
  return true;
}

export const AssistantBubble = memo(AssistantBubbleImpl, assistantBubblePropsEqual as never);



function MenuItem({
  icon, label, onClick, disabled, accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 8,
        background: "transparent", border: "none",
        color: accent ? "var(--atlas-gold)" : "var(--atlas-fg)",
        opacity: disabled ? 0.5 : 0.92,
        cursor: disabled ? "default" : "pointer",
        fontSize: 12.5, fontFamily: "var(--app-font-sans)",
        letterSpacing: "-0.005em", textAlign: "left",
      }}
      onPointerEnter={(e) => { if (!disabled) e.currentTarget.style.background = "color-mix(in oklab, var(--atlas-gold) 8%, transparent)"; }}
      onPointerLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ display: "inline-flex", width: 18, justifyContent: "center", color: accent ? "var(--atlas-gold)" : "var(--atlas-muted)" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}
