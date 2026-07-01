// ActiveRuns — command center for starting and tracking Atlas build sessions.
//
// BUILD-only composer: type a prompt, pick a project, fire it. The run streams
// live, and when complete the card expands inline to show Chat + Diff tabs.
// If the run produced a GitHub PR, a PR pill appears on the card immediately.
//
// Store: module-level singleton backed by localStorage so run state survives
// component remounts. Stale "running" entries (> 10 min) are auto-failed on
// load. Completed/failed cards auto-dismiss after 2 minutes (PR runs: never).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { X, ChevronDown, Paperclip, ArrowRight, Loader, GitPullRequest, ChevronUp, FileCode, Terminal } from "lucide-react";
import type { QuickEditProjectOption } from "./QuickEditRow";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Intent = "decide" | "build" | "think";
export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface ActiveRun {
  id: string;
  projectId: number;
  projectName: string;
  intent: Intent;
  prompt: string;
  sessionId: number | null;
  status: RunStatus;
  createdAt: number;
  completedAt: number | null;
  error?: string;
  attachmentNames: string[];
  streamedContent?: string;
  appliedFiles?: string[];
  fileEdits?: Array<{ path: string; content: string }>;
  prUrl?: string;
  summaryLine?: string;
  shellLines?: Array<{ kind: "cmd" | "out" | "err"; text: string }>;
  // Apply trust fields
  applyErrors?: Array<{
    path: string;
    reason: "typecheck" | "partial";
    errors: Array<{ line: number; col: number; message: string }>;
    existingLines?: number;
    proposedLines?: number;
  }>;
  applyError?: string;
}

// ── Module-level store ────────────────────────────────────────────────────────

const STORAGE_KEY = "atlas:active-runs";
const STALE_THRESHOLD_MS = 10 * 60 * 1000;  // 10 min: running→failed on load
const AUTO_DISMISS_COMPLETED_MS = 120_000;  // 2 min — enough time to read the response
const AUTO_DISMISS_FAILED_MS = 120_000;     // 2 min — failed runs stay visible longer

type Listener = () => void;
let _listeners: Listener[] = [];
let _runs: ActiveRun[] = _loadFromStorage();

function _loadFromStorage(): ActiveRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActiveRun[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.map((r) =>
      r.status === "running" && now - r.createdAt > STALE_THRESHOLD_MS
        ? { ...r, status: "failed" as RunStatus, error: "Timed out — open project to check" }
        : r
    );
  } catch {
    return [];
  }
}

function _saveToStorage(runs: ActiveRun[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {}
}

function _notify() {
  _listeners.forEach((fn) => fn());
}

function _subscribeToRuns(fn: Listener): () => void {
  _listeners = [..._listeners, fn];
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

function _getRuns(): ActiveRun[] {
  return _runs;
}

function _upsertRun(run: ActiveRun) {
  const idx = _runs.findIndex((r) => r.id === run.id);
  _runs = idx >= 0
    ? [..._runs.slice(0, idx), run, ..._runs.slice(idx + 1)]
    : [run, ..._runs];
  _saveToStorage(_runs);
  _notify();
}

function _patchRun(id: string, patch: Partial<ActiveRun>) {
  _runs = _runs.map((r) => (r.id === id ? { ...r, ...patch } : r));
  _saveToStorage(_runs);
  _notify();
}

function _removeRun(id: string) {
  _runs = _runs.filter((r) => r.id !== id);
  _saveToStorage(_runs);
  _notify();
}

function _scheduleAutoDismiss(id: string, failed = false) {
  const run = _getRuns().find((r) => r.id === id);
  // Never auto-dismiss runs that created a PR — user must dismiss manually
  if (run?.prUrl) return;
  const delay = failed ? AUTO_DISMISS_FAILED_MS : AUTO_DISMISS_COMPLETED_MS;
  setTimeout(() => _removeRun(id), delay);
}

// ── Intent helpers ────────────────────────────────────────────────────────────

function intentToModeFlags(intent: Intent): Record<string, unknown> {
  switch (intent) {
    case "build":  return { buildMode: true };
    case "decide": return { planMode: true };
    case "think":  return { mode: "think" };
  }
}

const INTENT_COLOR: Record<Intent, string> = {
  decide: "rgba(201,162,76,0.85)",
  build:  "hsl(217,80%,64%)",
  think:  "rgba(148,163,184,0.8)",
};

const INTENT_BG: Record<Intent, string> = {
  decide: "rgba(201,162,76,0.10)",
  build:  "rgba(99,130,220,0.10)",
  think:  "rgba(148,163,184,0.08)",
};

const INTENT_BORDER: Record<Intent, string> = {
  decide: "rgba(201,162,76,0.25)",
  build:  "rgba(99,130,220,0.25)",
  think:  "rgba(148,163,184,0.15)",
};

const STATUS_DOT_COLOR: Record<RunStatus, string> = {
  queued:    "rgba(201,162,76,0.85)",   // gold — waiting to start
  running:   "hsl(217,80%,64%)",        // blue — in progress
  completed: "rgba(74,222,128,0.85)",
  failed:    "rgba(248,113,113,0.85)",
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

// ── FILE_EDIT block parser ────────────────────────────────────────────────────
// Parses FILE_EDIT_START...FILE_EDIT_END blocks from the streamed content and
// returns an array of {path, content} pairs ready for POST /api/github/apply-local.

function extractFileEdits(content: string): Array<{ path: string; content: string }> {
  const edits: Array<{ path: string; content: string }> = [];
  let searchFrom = 0;
  while (true) {
    const startIdx = content.indexOf("FILE_EDIT_START", searchFrom);
    if (startIdx === -1) break;
    const endIdx = content.indexOf("FILE_EDIT_END", startIdx + 15);
    if (endIdx === -1) break;
    const block = content.slice(startIdx + 15, endIdx);
    const contentIdx = block.indexOf("FILE_EDIT_CONTENT");
    if (contentIdx !== -1) {
      const header = block.slice(0, contentIdx).trim();
      let fileContent = block.slice(contentIdx + 17);
      if (fileContent.startsWith("\n")) fileContent = fileContent.slice(1);
      if (fileContent.endsWith("\n")) fileContent = fileContent.slice(0, -1);
      let path = "";
      for (const line of header.split("\n")) {
        const ci = line.indexOf(":");
        if (ci === -1) continue;
        if (line.slice(0, ci).trim() === "path") {
          path = line.slice(ci + 1).trim();
          break;
        }
      }
      if (path && fileContent) edits.push({ path, content: fileContent });
    }
    searchFrom = endIdx + 13;
  }
  return edits;
}

// ── PR URL extractor ──────────────────────────────────────────────────────────
// Finds the first GitHub PR URL in streamed content.

function extractPrUrl(content: string): string | null {
  const m = content.match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/);
  return m ? m[0] : null;
}

// ── Summary line extractor ────────────────────────────────────────────────────
// Extracts a short 1-line summary from the end of completed content.
// Looks for a "Summary:" label first, then falls back to the last non-empty sentence.

function extractSummaryLine(content: string): string {
  const summaryMatch = content.match(/(?:summary|done|completed)[:\s]+([^\n.!?]{10,120})/i);
  if (summaryMatch?.[1]) return summaryMatch[1].trim();
  const sentences = content
    .replace(/FILE_EDIT_START[\s\S]*?FILE_EDIT_END/g, "")
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 140);
  return sentences[sentences.length - 1] ?? "";
}

// ── Shell lines extractor ─────────────────────────────────────────────────────
// Parses terminal-style output from streamed content.
// Supports explicit SHELL_OUTPUT_START/END blocks (future backend) and
// falls back to heuristic line detection (lines starting with $, %, >, #!).

function extractShellLines(
  content: string,
): Array<{ kind: "cmd" | "out" | "err"; text: string }> {
  // Explicit block takes priority
  const blockMatch = content.match(/SHELL_OUTPUT_START\n([\s\S]*?)SHELL_OUTPUT_END/);
  if (blockMatch) {
    return blockMatch[1].split("\n").filter(Boolean).map((line) => {
      if (line.startsWith("$ ") || line.startsWith("% ")) return { kind: "cmd" as const, text: line };
      if (line.startsWith("! ") || line.toLowerCase().startsWith("error")) return { kind: "err" as const, text: line };
      return { kind: "out" as const, text: line };
    });
  }
  // Heuristic: pick lines that look like shell commands
  const lines = content
    .replace(/FILE_EDIT_START[\s\S]*?FILE_EDIT_END/g, "")
    .split("\n")
    .filter((l) => /^(\$|%|>\s|#!|npm |npx |git |tsc |node |pnpm |yarn |bun )/.test(l.trim()));
  if (lines.length === 0) return [];
  return lines.map((line) => ({
    kind: line.trim().startsWith("$") || line.trim().startsWith("%") ? ("cmd" as const) : ("out" as const),
    text: line.trim(),
  }));
}

// ── file → base64 ────────────────────────────────────────────────────────────

async function fileToBase64(
  file: File
): Promise<{ base64: string; mediaType: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({ base64: base64 ?? "", mediaType: file.type || "application/octet-stream", name: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── startRun (module-level, survives component remounts) ──────────────────────

async function _startRun(
  run: Omit<ActiveRun, "status" | "sessionId" | "completedAt">,
  attachments: Array<{ base64: string; mediaType: string; name: string }>
): Promise<void> {
  const initial: ActiveRun = {
    ...run,
    status: "queued",
    sessionId: null,
    completedAt: null,
  };
  _upsertRun(initial);

  try {
    // 1. Create session
    const sessionRes = await fetch(`/api/projects/${run.projectId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: run.prompt.slice(0, 80), mode: "think" }),
    });
    if (!sessionRes.ok) {
      const msg = await sessionRes.text().catch(() => "HTTP " + sessionRes.status);
      throw new Error(msg);
    }
    const session = (await sessionRes.json()) as { id: number };

    _patchRun(run.id, { status: "running", sessionId: session.id });

    // 2. Fire chat stream
    const modeFlags = intentToModeFlags(run.intent);
    const chatRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        sessionId: session.id,
        message: run.prompt,
        history: [],
        entries: [],
        attachments: attachments.length > 0 ? attachments : undefined,
        ...modeFlags,
      }),
    });
    if (!chatRes.ok) {
      const msg = await chatRes.text().catch(() => "HTTP " + chatRes.status);
      throw new Error(msg);
    }

    // Consume the SSE stream — parse token events and surface them live
    const reader = chatRes.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const parsed = JSON.parse(dataLine.slice(6)) as { type?: string; content?: string };
              if (parsed.type === "token" && parsed.content) {
                accumulated += parsed.content;
                _patchRun(run.id, { streamedContent: accumulated });
              } else if (parsed.type === "done" && parsed.content) {
                // Use the full done content as the final answer (more complete than accumulated tokens)
                accumulated = parsed.content;
                _patchRun(run.id, { streamedContent: accumulated });
              }
            } catch { /* malformed SSE line — skip */ }
          }
        }
        // Flush any trailing buffer
        if (buffer.trim()) {
          const dataLine = buffer.split("\n").find((l) => l.startsWith("data: "));
          if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine.slice(6)) as { type?: string; content?: string };
              if ((parsed.type === "token" || parsed.type === "done") && parsed.content) {
                accumulated = parsed.type === "done" ? parsed.content : accumulated + parsed.content;
                _patchRun(run.id, { streamedContent: accumulated });
              }
            } catch { /* noop */ }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // For BUILD runs — parse FILE_EDIT blocks, store them for the Diff tab, then apply
    if (run.intent === "build") {
      const currentRun = _getRuns().find((r) => r.id === run.id);
      const fullContent = currentRun?.streamedContent ?? "";
      const fileEdits = extractFileEdits(fullContent);
      const prUrl = extractPrUrl(fullContent);
      const summaryLine = extractSummaryLine(fullContent);

      if (fileEdits.length > 0) {
        _patchRun(run.id, { fileEdits });

        // ── Phase 0: partial-file guard ───────────────────────────────────────
        // Block any TS/JS file whose proposed content is <40% of the existing
        // file's line count — this catches Claude returning a stub instead of
        // the full file.  Net-new files and non-TS files are exempt.
        const PARTIAL_THRESHOLD = 0.40;
        const partialBlocked: Array<{ path: string; existingLines: number; proposedLines: number }> = [];

        await Promise.all(
          fileEdits.map(async (fe) => {
            const ext = fe.path.split(".").pop()?.toLowerCase() ?? "";
            if (!new Set(["ts", "tsx", "js", "jsx"]).has(ext)) return;
            const proposedLines = fe.content.split("\n").length;
            try {
              const statUrl = `/api/github/fs-stat?path=${encodeURIComponent(fe.path)}&projectId=${run.projectId}`;
              const statRes = await fetch(statUrl, { credentials: "include" });
              if (!statRes.ok) return;
              const statData = (await statRes.json()) as { exists?: boolean; lineCount?: number };
              if (!statData.exists) return; // net-new file — exempt
              const existingLines = statData.lineCount ?? 0;
              if (existingLines > 0 && proposedLines / existingLines < PARTIAL_THRESHOLD) {
                partialBlocked.push({ path: fe.path, existingLines, proposedLines });
              }
            } catch {
              // stat failure → allow
            }
          })
        );

        if (partialBlocked.length > 0) {
          _patchRun(run.id, {
            applyErrors: [
              ...((_getRuns().find((r) => r.id === run.id)?.applyErrors) ?? []),
              ...partialBlocked.map((pb) => ({
                path: pb.path,
                reason: "partial" as const,
                errors: [] as Array<{ line: number; col: number; message: string }>,
                existingLines: pb.existingLines,
                proposedLines: pb.proposedLines,
              })),
            ],
          });
        }

        // ── Phase 1: typecheck all TS/JS files before writing anything ─────────
        const TC_EXTS = new Set(["ts", "tsx", "js", "jsx"]);
        const tcResults = await Promise.all(
          fileEdits.map(async (fe) => {
            const ext = fe.path.split(".").pop()?.toLowerCase() ?? "";
            if (!TC_EXTS.has(ext)) return { path: fe.path, clean: true, errors: [] as Array<{line:number;col:number;message:string}> };
            try {
              const tcRes = await fetch("/api/github/typecheck", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ content: fe.content, path: fe.path }),
              });
              if (!tcRes.ok) return { path: fe.path, clean: true, errors: [] }; // service unavailable → allow
              const data = (await tcRes.json()) as { errors?: Array<{line:number;col:number;message:string}>; clean?: boolean; skipped?: boolean };
              const isClean = data.skipped === true || (data.clean ?? true);
              return { path: fe.path, clean: isClean, errors: data.errors ?? [] };
            } catch {
              return { path: fe.path, clean: true, errors: [] }; // network failure → allow
            }
          })
        );

        const partialPaths = new Set(partialBlocked.map((pb) => pb.path));
        const blockedEdits = tcResults.filter((r) => !r.clean);
        const cleanEdits = fileEdits.filter((fe) =>
          !partialPaths.has(fe.path) &&
          tcResults.find((r) => r.path === fe.path)?.clean !== false
        );

        if (blockedEdits.length > 0) {
          const existingErrors = _getRuns().find((r) => r.id === run.id)?.applyErrors ?? [];
          _patchRun(run.id, {
            applyErrors: [
              ...existingErrors,
              ...blockedEdits
                .filter((b) => !partialPaths.has(b.path))
                .map((b) => ({
                  path: b.path,
                  reason: "typecheck" as const,
                  errors: b.errors,
                })),
            ],
          });
        }

        // ── Phase 2: apply only the clean files ───────────────────────────────
        if (cleanEdits.length > 0) {
          try {
            const applyRes = await fetch("/api/github/apply-local", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ files: cleanEdits, projectId: run.projectId }),
            });
            if (applyRes.ok) {
              const result = (await applyRes.json()) as { applied?: string[] };
              _patchRun(run.id, { appliedFiles: result.applied ?? cleanEdits.map((f) => f.path) });
            } else {
              const errBody = await applyRes.json().catch(() => ({})) as { error?: string };
              _patchRun(run.id, {
                applyError: `Apply failed (${applyRes.status}): ${errBody.error ?? "Server error"}`,
              });
            }
          } catch (err) {
            _patchRun(run.id, {
              applyError: `Apply failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      }

      if (prUrl) _patchRun(run.id, { prUrl });
      if (summaryLine) _patchRun(run.id, { summaryLine });
      const shellLines = extractShellLines(fullContent);
      if (shellLines.length > 0) _patchRun(run.id, { shellLines });
    }

    _patchRun(run.id, { status: "completed", completedAt: Date.now() });
    _scheduleAutoDismiss(run.id, false);
  } catch (err) {
    _patchRun(run.id, {
      status: "failed",
      error: err instanceof Error ? err.message : "Unexpected error",
      completedAt: Date.now(),
    });
    _scheduleAutoDismiss(run.id, true);
  }
}

// ── Placeholder cycling ───────────────────────────────────────────────────────

const BUILD_PLACEHOLDERS = [
  "Change the hero headline and update the CTA.",
  "Add a settings panel for notification preferences.",
  "Build the empty state for first-time users.",
  "Refactor the onboarding flow to skip step 2.",
  "Fix the mobile nav overflow on small screens.",
  "Update the pricing table copy and highlight the Pro tier.",
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  projects: QuickEditProjectOption[];
  onClose?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActiveRuns({ projects, onClose }: Props) {
  const [, setLocation] = useLocation();
  return (
    <>
      <style>{`
        @keyframes ar-spin { to { transform: rotate(360deg); } }
        @keyframes ar-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.85; } }
        @keyframes ar-cursor-blink { 0%, 100% { opacity: 0.85; } 50% { opacity: 0; } }
      `}</style>
      <_ActiveRunsInner projects={projects} setLocation={setLocation} onClose={onClose} />
    </>
  );
}

function _ActiveRunsInner({ projects, setLocation, onClose }: Props & { setLocation: (to: string) => void }) {

  // form state — BUILD-only, no intent selector
  const intent: Intent = "build";
  const [projectId, setProjectId] = useState<number>(() => projects[0]?.id ?? 0);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // runs state — synced from module-level store
  const [runs, setRuns] = useState<ActiveRun[]>(() => _getRuns());
  useEffect(() => _subscribeToRuns(() => setRuns([..._getRuns()])), []);

  // per-file force-apply state (keyed by "<runId>:<path>")
  const [retryingFiles, setRetryingFiles] = useState<Set<string>>(new Set());
  const [retryErrors, setRetryErrors] = useState<Map<string, string>>(new Map());

  // Track which run IDs were present last render so we can detect removals.
  // Covers both manual dismiss and auto-dismiss timer paths.
  const prevRunIdsRef = useRef<Set<string>>(new Set(runs.map((r) => r.id)));
  useEffect(() => {
    const currentIds = new Set(runs.map((r) => r.id));
    const removed = [...prevRunIdsRef.current].filter((id) => !currentIds.has(id));
    prevRunIdsRef.current = currentIds;
    if (removed.length === 0) return;
    setRetryingFiles((prev) => {
      const next = new Set(prev);
      for (const id of removed) {
        const prefix = `${id}:`;
        for (const key of prev) if (key.startsWith(prefix)) next.delete(key);
      }
      return next;
    });
    setRetryErrors((prev) => {
      const next = new Map(prev);
      for (const id of removed) {
        const prefix = `${id}:`;
        for (const key of prev.keys()) if (key.startsWith(prefix)) next.delete(key);
      }
      return next;
    });
  }, [runs]);

  const handleDismiss = useCallback((runId: string) => {
    _removeRun(runId);
    // retry-state cleanup is handled by the runs useEffect above
  }, []);

  const handleForceApply = useCallback(async (run: ActiveRun, filePath: string) => {
    const fileEdit = run.fileEdits?.find((fe) => fe.path === filePath);
    if (!fileEdit) return;
    const key = `${run.id}:${filePath}`;

    setRetryingFiles((prev) => new Set(prev).add(key));
    setRetryErrors((prev) => { const m = new Map(prev); m.delete(key); return m; });

    try {
      const res = await fetch("/api/github/apply-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ files: [fileEdit], projectId: run.projectId }),
      });
      if (res.ok) {
        // Move from applyErrors → appliedFiles
        _patchRun(run.id, {
          applyErrors: (run.applyErrors ?? []).filter((ae) => ae.path !== filePath),
          appliedFiles: [...(run.appliedFiles ?? []), filePath],
        });
      } else {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        setRetryErrors((prev) => new Map(prev).set(key, `Apply failed (${res.status}): ${errBody.error ?? "Server error"}`));
      }
    } catch (err) {
      setRetryErrors((prev) => new Map(prev).set(key, `Apply failed: ${err instanceof Error ? err.message : String(err)}`));
    } finally {
      setRetryingFiles((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, []);

  // ticker for elapsed time display
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running" || r.status === "queued");
    if (!hasRunning) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [runs]);

  // Sync projectId when projects list loads or changes
  useEffect(() => {
    if (!projects.find((p) => p.id === projectId) && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  // Placeholder rotation
  useEffect(() => {
    setPlaceholderIdx(0);
    if (BUILD_PLACEHOLDERS.length <= 1) return;
    const t = setInterval(() => setPlaceholderIdx((i) => (i + 1) % BUILD_PLACEHOLDERS.length), 4200);
    return () => clearInterval(t);
  }, []);

  const activeProjectName = useMemo(
    () => projects.find((p) => p.id === projectId)?.name ?? "Project",
    [projects, projectId]
  );

  const canSubmit = prompt.trim().length > 0 && projectId > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    const trimmed = prompt.trim();
    setSubmitting(true);

    try {
      // BUILD → background run with live streaming + automatic file apply
      const encodedAttachments = attachments.length > 0
        ? await Promise.all(attachments.map(fileToBase64))
        : [];

      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const project = projects.find((p) => p.id === projectId);

      void _startRun(
        {
          id: runId,
          projectId,
          projectName: project?.name ?? "Project",
          intent,
          prompt: trimmed,
          attachmentNames: attachments.map((f) => f.name),
          createdAt: Date.now(),
        },
        encodedAttachments
      );

      setPrompt("");
      setAttachments([]);
    } finally {
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  }, [canSubmit, prompt, attachments, projectId, projects, intent, onClose, setLocation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const activeRuns = runs.filter((r) => r.status === "queued" || r.status === "running");
  const doneRuns = runs.filter((r) => r.status === "completed" || r.status === "failed");

  return (
    <div className="atlas-discovery-card" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{
            margin: 0, fontSize: 9.5, fontWeight: 600,
            fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)",
            letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7,
          }}>
            Atlas Composer
          </h3>
          {activeRuns.length > 0 && (
            <span style={{
              fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
              padding: "1px 6px", borderRadius: 999,
              background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.28)",
              color: "var(--atlas-gold)",
            }}>
              {activeRuns.length} running
            </span>
          )}
        </div>
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.4,
        }}>
          Live
        </span>
      </div>

      {/* Form */}
      <div style={{
        position: "relative",
        background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.012))",
        backdropFilter: "blur(18px) saturate(120%)",
        WebkitBackdropFilter: "blur(18px) saturate(120%)",
        border: focused
          ? "1px solid rgba(201,162,76,0.45)"
          : "1px solid var(--atlas-border)",
        borderRadius: 12,
        padding: "10px 12px 10px",
        boxShadow: focused
          ? "0 0 0 1px rgba(201,162,76,0.18), 0 0 28px -10px rgba(201,162,76,0.28)"
          : "0 1px 0 rgba(255,255,255,0.03) inset",
        transition: "border-color 200ms ease, box-shadow 200ms ease",
        marginBottom: runs.length > 0 ? 12 : 0,
      }}>
        {/* Project row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          paddingBottom: 10, borderBottom: "1px solid var(--atlas-border)",
        }}>
          <span style={{
            fontSize: 9.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em",
            textTransform: "uppercase", fontWeight: 600,
            color: INTENT_COLOR.build, opacity: 0.9,
            paddingLeft: 2,
          }}>
            Build
          </span>

          <div style={{ flex: 1 }} />

          {/* Project picker */}
          {projects.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => projects.length > 1 && setProjectMenuOpen((v) => !v)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 9px", borderRadius: 999,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--atlas-border)",
                  color: "var(--atlas-fg)",
                  fontFamily: "var(--app-font-mono)", fontSize: 10.5,
                  letterSpacing: "0.04em",
                  cursor: projects.length > 1 ? "pointer" : "default",
                  transition: "border-color 140ms ease",
                }}
                aria-label="Switch project"
              >
                <span style={{ opacity: 0.5 }}>↳</span>
                <span>{activeProjectName}</span>
                {projects.length > 1 && (
                  <ChevronDown size={10} strokeWidth={2} style={{ opacity: 0.55 }} />
                )}
              </button>
              {projectMenuOpen && projects.length > 1 && (
                <div
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                    minWidth: 180, maxHeight: 220, overflowY: "auto",
                    background: "#0b0b0e",
                    backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                    border: "1px solid var(--atlas-border)", borderRadius: 8, padding: 4,
                    boxShadow: "0 14px 36px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)",
                  }}
                >
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setProjectId(p.id); setProjectMenuOpen(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "6px 8px",
                        background: p.id === projectId ? "rgba(201,162,76,0.08)" : "transparent",
                        border: "none", borderRadius: 4,
                        color: "var(--atlas-fg)",
                        fontFamily: "var(--app-font-mono)", fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Textarea */}
        <div style={{ position: "relative", marginTop: 4 }}>
          {!prompt && (
            <div
              aria-hidden
              key={placeholderIdx}
              style={{
                position: "absolute", inset: "10px 8px auto 8px",
                pointerEvents: "none",
                color: "var(--atlas-muted)", opacity: 0.6,
                fontFamily: "var(--app-font-sans)", fontSize: 14, lineHeight: 1.55,
              }}
            >
              {BUILD_PLACEHOLDERS[placeholderIdx]}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            rows={3}
            style={{
              width: "100%", resize: "none",
              background: "transparent", border: 0, outline: 0,
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-sans)", fontSize: 14, lineHeight: 1.55,
              letterSpacing: "-0.005em",
              padding: "10px 8px 8px",
              minHeight: 72,
            }}
          />
        </div>

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 4px 6px" }}>
            {attachments.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 7px", borderRadius: 4,
                  background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
                  color: "rgba(165,180,252,0.95)",
                  fontFamily: "var(--app-font-mono)", fontSize: 10,
                }}
              >
                <Paperclip size={9} />
                {f.name}
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                  style={{ background: "transparent", border: 0, padding: 0, color: "inherit", cursor: "pointer", opacity: 0.75, display: "inline-flex" }}
                >
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Action row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 8, marginTop: 4, borderTop: "1px solid var(--atlas-border)",
        }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
            style={{
              width: 28, height: 28, borderRadius: 7,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "1px solid transparent",
              color: "var(--atlas-muted)", cursor: "pointer",
              transition: "color 140ms ease, border-color 140ms ease, background 140ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--atlas-fg)";
              e.currentTarget.style.borderColor = "var(--atlas-border)";
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--atlas-muted)";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Paperclip size={14} strokeWidth={1.75} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) setAttachments((prev) => [...prev, ...files]);
              e.target.value = "";
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontFamily: "var(--app-font-mono)", fontSize: 9.5,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: "var(--atlas-muted)", opacity: 0.5,
            }}>
              ⌘ + ⏎
            </span>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              aria-label="Start run"
              style={{
                width: 30, height: 30, borderRadius: "50%",
                border: `1px solid ${canSubmit ? "rgba(201,162,76,0.55)" : "rgba(201,162,76,0.2)"}`,
                background: canSubmit
                  ? "linear-gradient(180deg, rgba(201,162,76,0.25), rgba(201,162,76,0.10))"
                  : "rgba(201,162,76,0.04)",
                color: canSubmit ? "var(--atlas-gold)" : "rgba(201,162,76,0.3)",
                cursor: canSubmit ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                transition: "background 180ms ease, color 180ms ease, box-shadow 180ms ease",
              }}
              onMouseEnter={(e) => {
                if (!canSubmit) return;
                e.currentTarget.style.background = "var(--atlas-gold)";
                e.currentTarget.style.color = "var(--atlas-bg)";
                e.currentTarget.style.boxShadow = "0 0 22px -4px rgba(201,162,76,0.55)";
              }}
              onMouseLeave={(e) => {
                if (!canSubmit) return;
                e.currentTarget.style.background = "linear-gradient(180deg, rgba(201,162,76,0.25), rgba(201,162,76,0.10))";
                e.currentTarget.style.color = "var(--atlas-gold)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <ArrowRight size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* Run cards */}
      {activeRuns.length === 0 && doneRuns.length === 0 ? (
        <div style={{
          padding: "16px 4px 4px",
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
        }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--atlas-muted)", opacity: 0.5, fontStyle: "italic", lineHeight: 1.5 }}>
            No active runs.
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--atlas-muted)", opacity: 0.35, lineHeight: 1.5 }}>
            Start a build, decision, or thinking session above.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {activeRuns.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onEnter={() => setLocation(`/project/${run.projectId}`)}
              onDismiss={() => handleDismiss(run.id)}
              retryingFiles={retryingFiles}
              retryErrors={retryErrors}
              onForceApply={handleForceApply}
            />
          ))}
          {doneRuns.length > 0 && (
            <>
              {activeRuns.length > 0 && (
                <div style={{
                  height: 1,
                  background: "var(--atlas-border)",
                  margin: "2px 0",
                  opacity: 0.5,
                }} />
              )}
              {doneRuns.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  onEnter={() => setLocation(`/project/${run.projectId}`)}
                  onDismiss={() => handleDismiss(run.id)}
                  retryingFiles={retryingFiles}
                  retryErrors={retryErrors}
                  onForceApply={handleForceApply}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── RunCard ───────────────────────────────────────────────────────────────────
// Collapsed: status + project + prompt preview + PR pill
// Running: streaming view auto-shown inline
// Expanded (tap): Chat tab (full response) + Diff tab (file changes) + PR link

export function RunCard({
  run,
  onDismiss,
  retryingFiles,
  retryErrors,
  onForceApply,
}: {
  run: ActiveRun;
  onEnter: () => void;  // kept in props for call-site compat, unused here
  onDismiss: () => void;
  retryingFiles: Set<string>;
  retryErrors: Map<string, string>;
  onForceApply: (run: ActiveRun, filePath: string) => void;
}) {
  const isLive = run.status === "running" || run.status === "queued";
  // Auto-expand while running so you see the stream; collapse when done
  const [expanded, setExpanded] = useState(isLive);
  const [activeTab, setActiveTab] = useState<"chat" | "diff" | "shell">("chat");
  const [hovered, setHovered] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [retryingApply, setRetryingApply] = useState(false);
  const [retryApplyError, setRetryApplyError] = useState<string | null>(null);

  const handleRetryApply = async () => {
    // Re-post every file that wasn't blocked by typecheck/partial
    const cleanEdits = (run.fileEdits ?? []).filter(
      (fe) => !(run.applyErrors ?? []).some((ae) => ae.path === fe.path)
    );
    if (cleanEdits.length === 0) return;
    setRetryingApply(true);
    setRetryApplyError(null);
    try {
      const res = await fetch("/api/github/apply-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ files: cleanEdits, projectId: run.projectId }),
      });
      if (res.ok) {
        const result = (await res.json()) as { applied?: string[] };
        _patchRun(run.id, {
          applyError: undefined,
          appliedFiles: [
            ...(run.appliedFiles ?? []),
            ...(result.applied ?? cleanEdits.map((f) => f.path)),
          ],
        });
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setRetryApplyError(`Retry failed (${res.status}): ${body.error ?? "Server error"}`);
      }
    } catch (err) {
      setRetryApplyError(`Retry failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRetryingApply(false);
    }
  };

  // Keep expanded=true while running, but don't force-collapse when it finishes
  // (let the user decide)
  const prevIsLive = useRef(isLive);
  useEffect(() => {
    if (!prevIsLive.current && isLive) setExpanded(true);
    prevIsLive.current = isLive;
  }, [isLive]);

  const now = Date.now();
  const elapsed = run.completedAt
    ? run.completedAt - run.createdAt
    : now - run.createdAt;

  const hasFiles = (run.fileEdits?.length ?? 0) > 0;
  const hasPr = !!run.prUrl;
  const prNum = run.prUrl?.match(/\/pull\/(\d+)/)?.[1];

  // Clean streamedContent: strip FILE_EDIT blocks for Chat tab display
  const chatContent = (run.streamedContent ?? "")
    .replace(/FILE_EDIT_START[\s\S]*?FILE_EDIT_END/g, "")
    .trim();

  // ── Receipt-style derivations ──────────────────────────────────────────────
  // Kicker color/label reflects run outcome — border echoes it.
  const hasBlocked = (run.applyErrors?.length ?? 0) > 0 || !!run.applyError;
  const outcome: "running" | "success" | "partial" | "failed" =
    isLive ? "running"
    : run.status === "failed" ? "failed"
    : hasBlocked ? "partial"
    : "success";

  const KICKER: Record<typeof outcome, { label: string; color: string; soft: string }> = {
    running: { label: "Running",       color: "hsl(217,80%,64%)",     soft: "rgba(96,165,250,0.35)" },
    success: { label: "Run Complete",  color: "rgba(74,222,128,0.95)", soft: "rgba(74,222,128,0.35)" },
    partial: { label: "Needs Input",   color: "rgba(251,191,36,0.95)", soft: "rgba(251,191,36,0.35)" },
    failed:  { label: "Run Failed",    color: "rgba(248,113,113,0.95)", soft: "rgba(248,113,113,0.35)" },
  };
  const kicker = KICKER[outcome];

  // Title = summaryLine when available, else prompt. Chat explanation lives elsewhere.
  const titleLine = (run.summaryLine || run.prompt || "").trim();

  // Meta line: N files · elapsed
  const touchedCount = new Set([
    ...(run.appliedFiles ?? []),
    ...((run.fileEdits ?? []).map((f) => f.path)),
  ]).size;
  const metaBits: string[] = [];
  if (touchedCount > 0) metaBits.push(`${touchedCount} file${touchedCount === 1 ? "" : "s"}`);
  metaBits.push(isLive ? formatElapsed(elapsed) : formatAgo(now - (run.completedAt ?? run.createdAt)));

  // Produced = user-facing artifacts only. Conservative: .html/.pdf/.md/images.
  const producedExt = /\.(html?|pdf|md|png|jpe?g|gif|svg|webp)$/i;
  const producedPaths = Array.from(
    new Set([
      ...(run.appliedFiles ?? []),
      ...((run.fileEdits ?? []).map((f) => f.path)),
    ])
  ).filter((p) => producedExt.test(p));

  const iconFor = (p: string) => {
    if (/\.(png|jpe?g|gif|svg|webp)$/i.test(p)) return "🖼";
    if (/\.pdf$/i.test(p)) return "📑";
    if (/\.md$/i.test(p)) return "📋";
    return "📄";
  };
  const shortName = (p: string) => p.split("/").pop() || p;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 10,
        background: "rgba(255,255,255,0.015)",
        border: `1px solid ${expanded ? INTENT_BORDER[run.intent] : "var(--atlas-border)"}`,
        boxShadow: !isLive ? `inset 3px 0 0 ${kicker.color}` : undefined,
        overflow: "hidden",
        transition: "border-color 160ms ease, box-shadow 400ms ease",
      }}
    >
      {/* ── Bookmark (top-right, future: Saved Runs) ── */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); /* saved-runs: future */ }}
        aria-label="Save run"
        title="Save run"
        style={{
          position: "absolute", top: 8, right: 10,
          background: "transparent", border: 0, padding: 4, cursor: "pointer",
          color: "var(--atlas-muted)", opacity: 0.5,
          display: "inline-flex", borderRadius: 4,
          transition: "color 140ms ease, opacity 140ms ease, background 140ms ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--atlas-gold)"; e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--atlas-muted)"; e.currentTarget.style.opacity = "0.5"; }}
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
          <path d="M5 3 h10 v14 l-5 -3.5 l-5 3.5 z" />
        </svg>
      </button>

      {/* ── Receipt body (tap to expand/collapse when done) ── */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Build run for ${run.projectName} — ${outcome}. ${expanded ? "Collapse" : "Expand"}.`}
        onClick={() => !isLive && setExpanded((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && !isLive && setExpanded((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 40px 10px 14px", /* right room for bookmark */
          cursor: isLive ? "default" : "pointer",
          background: hovered && !isLive ? "rgba(255,255,255,0.015)" : "transparent",
          transition: "background 120ms ease",
        }}
      >
        {/* Status glyph */}
        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", marginTop: 2 }}>
          {isLive ? (
            <Loader size={13} strokeWidth={2} color={kicker.color}
              style={{ animation: "ar-spin 1s linear infinite" }} />
          ) : outcome === "success" ? (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={kicker.color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4,11 8,15 16,6" />
            </svg>
          ) : outcome === "failed" ? (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={kicker.color} strokeWidth={2.2} strokeLinecap="round">
              <line x1="5" y1="5" x2="15" y2="15" /><line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={kicker.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3 L18 17 L2 17 Z" /><line x1="10" y1="9" x2="10" y2="12" />
              <circle cx="10" cy="14.5" r="0.6" fill={kicker.color} />
            </svg>
          )}
        </span>

        {/* Titles */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{
            fontFamily: "var(--app-font-mono)", fontSize: 9.5,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: kicker.color, fontWeight: 600, opacity: 0.9,
          }}>
            {kicker.label}
            <span style={{
              marginLeft: 8, color: "var(--atlas-muted)", opacity: 0.55,
              fontWeight: 400, letterSpacing: "0.04em",
            }}>
              {run.projectName}
            </span>
          </div>
          <div style={{
            fontSize: 13.5, fontWeight: 500, color: "var(--atlas-fg)",
            letterSpacing: "-0.005em", lineHeight: 1.35,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden", wordBreak: "break-word",
          }}>
            {titleLine || <span style={{ opacity: 0.5, fontStyle: "italic" }}>Working…</span>}
          </div>
          {metaBits.length > 0 && (
            <div style={{
              fontFamily: "var(--app-font-mono)", fontSize: 10.5,
              color: "var(--atlas-muted)", opacity: 0.65, marginTop: 3,
              letterSpacing: "0.02em",
            }}>
              {metaBits.join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* ── Produced artifacts (user-facing only) ── */}
      {producedPaths.length > 0 && (
        <div style={{
          padding: "8px 14px 10px",
          borderTop: "1px dashed var(--atlas-border)",
        }}>
          <div style={{
            fontFamily: "var(--app-font-mono)", fontSize: 8.5,
            letterSpacing: "0.18em", textTransform: "uppercase",
            color: "var(--atlas-muted)", opacity: 0.55, marginBottom: 5,
          }}>
            {isLive ? "Producing" : "Produced"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {producedPaths.slice(0, 5).map((p) => (
              <a
                key={p}
                href={`/api/fs/${run.projectId}/preview?path=${encodeURIComponent(p)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={p}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "4px 6px", margin: "0 -6px", borderRadius: 5,
                  fontSize: 12, color: "var(--atlas-fg)", opacity: 0.85,
                  textDecoration: "none", transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 13, flexShrink: 0 }}>{iconFor(p)}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {shortName(p)}
                </span>
              </a>
            ))}
            {producedPaths.length > 5 && (
              <div style={{
                fontFamily: "var(--app-font-mono)", fontSize: 10,
                color: "var(--atlas-muted)", opacity: 0.5, marginTop: 3, paddingLeft: 2,
              }}>
                +{producedPaths.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer: Details · Open Preview · PR · dismiss ── */}
      {!isLive && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          padding: "9px 12px 10px",
          borderTop: "1px solid var(--atlas-border)",
        }}>
          <a
            href={`/project/${run.projectId}?leftTab=diff&runId=${encodeURIComponent(run.id)}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              fontFamily: "var(--app-font-mono)", fontSize: 10,
              letterSpacing: "0.08em",
              padding: "5px 11px", borderRadius: 5,
              background: "transparent",
              border: "1px solid var(--atlas-border)",
              color: "var(--atlas-fg)", opacity: 0.85,
              textDecoration: "none", cursor: "pointer",
              transition: "background 120ms ease, opacity 120ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.85"; }}
          >
            Details
          </a>
          {producedPaths.length > 0 && (
            <a
              href={`/api/fs/${run.projectId}/preview?path=${encodeURIComponent(producedPaths[0])}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontFamily: "var(--app-font-mono)", fontSize: 10,
                letterSpacing: "0.08em",
                padding: "5px 11px", borderRadius: 5,
                background: "transparent",
                border: "1px solid var(--atlas-gold)",
                color: "var(--atlas-gold)",
                textDecoration: "none", cursor: "pointer",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.10)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              Open Preview
            </a>
          )}

          {/* PR pill preserved */}
          {hasPr && (
            <a
              href={run.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Open PR #${prNum} on GitHub`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 999,
                background: "rgba(201,162,76,0.10)",
                border: "1px solid rgba(201,162,76,0.35)",
                color: "var(--atlas-gold)",
                fontSize: 9.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                fontWeight: 600, textDecoration: "none",
              }}
            >
              <GitPullRequest size={9} strokeWidth={2} />
              #{prNum}
            </a>
          )}

          <div style={{ flex: 1 }} />

          {/* Expand chevron */}
          <span style={{
            display: "inline-flex", color: "var(--atlas-muted)",
            opacity: hovered ? 0.7 : 0.35, transition: "opacity 140ms ease",
          }}>
            {expanded ? <ChevronUp size={12} strokeWidth={1.8} /> : <ChevronDown size={12} strokeWidth={1.8} />}
          </span>

          {/* Dismiss */}
          <button type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            aria-label="Dismiss run"
            style={{
              background: "transparent", border: 0, padding: 2, cursor: "pointer",
              color: "var(--atlas-muted)", opacity: hovered ? 0.7 : 0,
              transition: "opacity 120ms ease", display: "inline-flex",
            }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Streaming content (running only, no tabs) ── */}
      {isLive && run.streamedContent && (
        <div style={{
          borderTop: "1px solid var(--atlas-border)",
          padding: "8px 12px 10px 17px",
          maxHeight: 140, overflowY: "auto",
        }}>
          <div style={{
            fontSize: 12, lineHeight: 1.6, color: "var(--atlas-fg)", opacity: 0.8,
            fontFamily: "var(--app-font-sans)", whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {chatContent}
            <span style={{
              display: "inline-block", width: 7, height: 13, marginLeft: 2,
              verticalAlign: "text-bottom",
              background: INTENT_COLOR[run.intent], opacity: 0.85,
              borderRadius: 1, animation: "ar-cursor-blink 0.9s step-end infinite",
            }} />
          </div>
        </div>
      )}

      {/* ── Expanded body (completed/failed, with Chat + Diff tabs) ── */}
      {expanded && !isLive && (
        <div style={{ borderTop: "1px solid var(--atlas-border)" }}>

          {/* Prompt (full, now shown in expanded) */}
          <div style={{
            padding: "8px 12px 0 17px",
            fontSize: 12, color: "var(--atlas-fg)", opacity: 0.75,
            fontFamily: "var(--app-font-sans)", lineHeight: 1.5,
          }}>
            {run.prompt}
          </div>

          {/* Tab bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 0,
            padding: "8px 12px 0",
            borderBottom: "1px solid var(--atlas-border)",
          }}>
            {(["chat", "diff", "shell"] as const).map((tab) => {
              const isActive = activeTab === tab;
              const hasShell = (run.shellLines?.length ?? 0) > 0;
              const label = tab === "chat" ? "Chat"
                : tab === "diff" ? `Diff${hasFiles ? ` · ${run.fileEdits!.length}` : ""}`
                : `Shell${hasShell ? ` · ${run.shellLines!.length}` : ""}`;
              return (
                <button key={tab} type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    position: "relative",
                    background: "transparent", border: 0,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontFamily: "var(--app-font-mono)", fontSize: 10,
                    letterSpacing: "0.10em", textTransform: "uppercase",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--atlas-fg)" : "var(--atlas-muted)",
                    opacity: isActive ? 1 : 0.55,
                    transition: "color 140ms ease, opacity 140ms ease",
                  }}
                >
                  {label}
                  {isActive && (
                    <span aria-hidden style={{
                      position: "absolute", left: 8, right: 8, bottom: -1,
                      height: 1.5, background: "var(--atlas-gold)",
                      boxShadow: "0 0 6px rgba(201,162,76,0.5)", borderRadius: 1,
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Chat tab */}
          {activeTab === "chat" && (
            <div style={{ padding: "10px 12px 12px 17px" }}>
              {run.status === "failed" && run.error ? (
                <div style={{
                  fontSize: 12, color: "rgba(248,113,113,0.85)", lineHeight: 1.5,
                  fontFamily: "var(--app-font-sans)",
                }}>
                  {run.error}
                </div>
              ) : chatContent ? (
                <div style={{
                  fontSize: 12, lineHeight: 1.65, color: "var(--atlas-fg)", opacity: 0.88,
                  fontFamily: "var(--app-font-sans)", whiteSpace: "pre-wrap",
                  wordBreak: "break-word", maxHeight: 280, overflowY: "auto",
                }}>
                  {chatContent}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--atlas-muted)", opacity: 0.5, fontStyle: "italic" }}>
                  No response content.
                </div>
              )}

              {/* Summary line */}
              {run.summaryLine && (
                <div style={{
                  marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--atlas-border)",
                  fontSize: 11, fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em",
                  color: "rgba(74,222,128,0.8)", lineHeight: 1.4,
                }}>
                  ✓ {run.summaryLine}
                </div>
              )}

              {/* PR link in chat tab */}
              {hasPr && (
                <a
                  href={run.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    marginTop: 10,
                    padding: "7px 12px", borderRadius: 7,
                    background: "rgba(201,162,76,0.08)",
                    border: "1px solid rgba(201,162,76,0.28)",
                    color: "var(--atlas-gold)",
                    fontSize: 11, fontFamily: "var(--app-font-mono)",
                    letterSpacing: "0.06em", fontWeight: 600,
                    textDecoration: "none",
                    transition: "background 140ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.15)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.08)"; }}
                >
                  <GitPullRequest size={12} strokeWidth={2} />
                  View PR #{prNum} on GitHub
                </a>
              )}

            </div>
          )}

          {/* Diff tab — unified Apply Report */}
          {activeTab === "diff" && (
            <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 5 }}>

              {/* Network/server apply error banner */}
              {run.applyError && (
                <div style={{
                  borderRadius: 6, overflow: "hidden",
                  border: "1px solid rgba(248,113,113,0.22)",
                  marginBottom: 2,
                }}>
                  {/* Banner row */}
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 7,
                    padding: "7px 10px",
                    background: "rgba(248,113,113,0.06)",
                  }}>
                    <span style={{
                      flexShrink: 0, fontSize: 8.5, fontFamily: "var(--app-font-mono)",
                      letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600,
                      color: "rgba(248,113,113,0.8)",
                      padding: "1px 5px", borderRadius: 3,
                      background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
                      marginTop: 1,
                    }}>
                      apply error
                    </span>
                    <span style={{
                      flex: 1, fontSize: 10.5, fontFamily: "var(--app-font-mono)", lineHeight: 1.5,
                      color: "rgba(248,113,113,0.8)", wordBreak: "break-word",
                    }}>
                      {run.applyError}
                    </span>
                    {/* Retry button */}
                    {(run.fileEdits ?? []).some(
                      (fe) => !(run.applyErrors ?? []).some((ae) => ae.path === fe.path)
                    ) && (
                      <button
                        disabled={retryingApply}
                        onClick={handleRetryApply}
                        style={{
                          flexShrink: 0,
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 4,
                          fontSize: 8.5, fontFamily: "var(--app-font-mono)",
                          letterSpacing: "0.06em", fontWeight: 600, textTransform: "uppercase",
                          background: retryingApply ? "rgba(248,113,113,0.04)" : "rgba(248,113,113,0.12)",
                          border: "1px solid rgba(248,113,113,0.3)",
                          color: retryingApply ? "rgba(248,113,113,0.35)" : "rgba(248,113,113,0.85)",
                          cursor: retryingApply ? "not-allowed" : "pointer",
                          transition: "background 120ms ease",
                          marginTop: 1,
                        }}
                        onMouseEnter={(e) => { if (!retryingApply) e.currentTarget.style.background = "rgba(248,113,113,0.2)"; }}
                        onMouseLeave={(e) => { if (!retryingApply) e.currentTarget.style.background = "rgba(248,113,113,0.12)"; }}
                      >
                        {retryingApply
                          ? <><Loader size={8} style={{ animation: "ar-spin 0.8s linear infinite" }} /> retrying…</>
                          : "retry apply"
                        }
                      </button>
                    )}
                  </div>
                  {/* Retry-level error (if the retry itself fails) */}
                  {retryApplyError && (
                    <div style={{
                      padding: "5px 10px",
                      borderTop: "1px solid rgba(248,113,113,0.15)",
                      background: "rgba(248,113,113,0.03)",
                      fontSize: 10, fontFamily: "var(--app-font-mono)", lineHeight: 1.5,
                      color: "rgba(248,113,113,0.7)", wordBreak: "break-word",
                    }}>
                      {retryApplyError}
                    </div>
                  )}
                </div>
              )}

              {hasFiles ? (
                run.fileEdits!.map((fe) => {
                  const filename = fe.path.split("/").pop() ?? fe.path;
                  const lineCount = fe.content.split("\n").length;
                  const isApplied = (run.appliedFiles ?? []).includes(fe.path);
                  const blockInfo = (run.applyErrors ?? []).find((ae) => ae.path === fe.path);
                  const isBlocked = !!blockInfo;
                  const isPartial = blockInfo?.reason === "partial";
                  const isExpanded = expandedPaths.has(fe.path);
                  const retryKey = `${run.id}:${fe.path}`;
                  const isRetrying = retryingFiles.has(retryKey);
                  const retryError = retryErrors.get(retryKey);

                  // Color: green=applied, amber=partial, red=typecheck-blocked, muted=pending
                  const accent = isApplied
                    ? "74,222,128"
                    : isPartial
                      ? "201,162,76"
                      : isBlocked
                        ? "248,113,113"
                        : "120,120,150";

                  const statusLabel = isApplied
                    ? "applied"
                    : isPartial
                      ? "partial"
                      : isBlocked
                        ? "blocked"
                        : "pending";

                  const toggleExpand = () =>
                    setExpandedPaths((prev) => {
                      const next = new Set(prev);
                      next.has(fe.path) ? next.delete(fe.path) : next.add(fe.path);
                      return next;
                    });

                  return (
                    <div key={fe.path} style={{
                      borderRadius: 7, overflow: "hidden",
                      border: `1px solid rgba(${accent},0.2)`,
                    }}>
                      {/* ── Row header — always visible ── */}
                      <div
                        role="button"
                        onClick={toggleExpand}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 10px",
                          background: `rgba(${accent},0.05)`,
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        {/* Status badge */}
                        <span style={{
                          flexShrink: 0,
                          fontSize: 8.5, fontFamily: "var(--app-font-mono)",
                          letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600,
                          padding: "1px 5px", borderRadius: 3,
                          background: `rgba(${accent},0.1)`, border: `1px solid rgba(${accent},0.25)`,
                          color: `rgba(${accent},0.9)`,
                        }}>
                          {statusLabel}
                        </span>

                        {/* Filename */}
                        <span style={{
                          flex: 1, minWidth: 0,
                          fontSize: 10.5, fontFamily: "var(--app-font-mono)", fontWeight: 600,
                          color: `rgba(${accent},0.85)`,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {filename}
                        </span>

                        {/* Line count */}
                        <span style={{
                          flexShrink: 0,
                          fontSize: 9, fontFamily: "var(--app-font-mono)",
                          color: "var(--atlas-muted)", opacity: 0.5,
                        }}>
                          {lineCount}L
                        </span>

                        {/* Force apply (blocked only) */}
                        {isBlocked && (
                          <button
                            disabled={isRetrying}
                            onClick={(e) => { e.stopPropagation(); onForceApply(run, fe.path); }}
                            style={{
                              flexShrink: 0,
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "2px 7px", borderRadius: 4,
                              fontSize: 8.5, fontFamily: "var(--app-font-mono)",
                              letterSpacing: "0.06em", fontWeight: 600, textTransform: "uppercase",
                              background: isRetrying ? `rgba(${accent},0.04)` : `rgba(${accent},0.10)`,
                              border: `1px solid rgba(${accent},0.28)`,
                              color: isRetrying ? `rgba(${accent},0.35)` : `rgba(${accent},0.8)`,
                              cursor: isRetrying ? "not-allowed" : "pointer",
                              transition: "background 120ms ease",
                            }}
                            onMouseEnter={(e) => { if (!isRetrying) e.currentTarget.style.background = `rgba(${accent},0.18)`; }}
                            onMouseLeave={(e) => { if (!isRetrying) e.currentTarget.style.background = `rgba(${accent},0.10)`; }}
                          >
                            {isRetrying
                              ? <><Loader size={8} style={{ animation: "ar-spin 0.8s linear infinite" }} /> applying…</>
                              : "force apply"
                            }
                          </button>
                        )}

                        {/* Expand chevron */}
                        <span style={{
                          flexShrink: 0,
                          color: `rgba(${accent},0.5)`,
                          display: "inline-flex",
                        }}>
                          {isExpanded
                            ? <ChevronUp size={11} strokeWidth={1.8} />
                            : <ChevronDown size={11} strokeWidth={1.8} />
                          }
                        </span>
                      </div>

                      {/* ── Block details — always visible when blocked ── */}
                      {isBlocked && (
                        <div style={{
                          padding: "5px 10px 6px",
                          borderTop: `1px solid rgba(${accent},0.12)`,
                          background: `rgba(${accent},0.03)`,
                          display: "flex", flexDirection: "column", gap: 3,
                        }}>
                          {isPartial ? (
                            <span style={{
                              fontSize: 10.5, fontFamily: "var(--app-font-mono)", lineHeight: 1.55,
                              color: `rgba(${accent},0.8)`,
                            }}>
                              ⚠ Partial file — existing: {blockInfo.existingLines} lines, proposed: {blockInfo.proposedLines} lines
                            </span>
                          ) : (
                            <>
                              {blockInfo.errors.slice(0, 5).map((e, i) => (
                                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                                  <span style={{
                                    flexShrink: 0, fontSize: 9.5, fontFamily: "var(--app-font-mono)",
                                    color: `rgba(${accent},0.45)`, minWidth: 48,
                                  }}>
                                    L{e.line}:{e.col}
                                  </span>
                                  <span style={{
                                    fontSize: 10.5, fontFamily: "var(--app-font-mono)", lineHeight: 1.5,
                                    color: `rgba(${accent},0.85)`, wordBreak: "break-word",
                                  }}>
                                    {e.message}
                                  </span>
                                </div>
                              ))}
                              {blockInfo.errors.length > 5 && (
                                <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: `rgba(${accent},0.4)` }}>
                                  +{blockInfo.errors.length - 5} more
                                </span>
                              )}
                            </>
                          )}
                          {retryError && (
                            <div style={{
                              marginTop: 3, padding: "3px 7px", borderRadius: 4,
                              background: `rgba(${accent},0.08)`, border: `1px solid rgba(${accent},0.2)`,
                              fontSize: 10, fontFamily: "var(--app-font-mono)", lineHeight: 1.5,
                              color: `rgba(${accent},0.8)`, wordBreak: "break-word",
                            }}>
                              {retryError}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Expanded: proposed file content ── */}
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid rgba(${accent},0.1)` }}>
                          <div style={{
                            maxHeight: 200, overflowY: "auto",
                            padding: "6px 8px",
                            background: "rgba(0,0,0,0.28)",
                          }}>
                            <pre style={{
                              margin: 0, fontSize: 10, lineHeight: 1.55,
                              fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)",
                              opacity: 0.8, whiteSpace: "pre-wrap", wordBreak: "break-word",
                            }}>
                              {fe.content}
                            </pre>
                          </div>
                          <div style={{
                            padding: "3px 10px",
                            background: "rgba(0,0,0,0.15)",
                            fontSize: 8.5, fontFamily: "var(--app-font-mono)",
                            color: "var(--atlas-muted)", opacity: 0.4, letterSpacing: "0.02em",
                          }}>
                            {fe.path}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{
                  fontSize: 11, color: "var(--atlas-muted)", opacity: 0.5,
                  fontStyle: "italic", fontFamily: "var(--app-font-sans)",
                  padding: "4px 0",
                }}>
                  No file changes in this run.
                </div>
              )}
            </div>
          )}

          {/* Shell tab */}
          {activeTab === "shell" && (
            <div style={{ padding: "10px 12px 12px" }}>
              {(run.shellLines?.length ?? 0) > 0 ? (
                <div style={{
                  borderRadius: 6, overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(0,0,0,0.35)",
                }}>
                  {/* Terminal header bar */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px",
                    background: "rgba(0,0,0,0.3)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <Terminal size={9} strokeWidth={2} color="rgba(255,255,255,0.3)" />
                    <span style={{
                      fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                      color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
                    }}>
                      shell output
                    </span>
                    <span style={{
                      marginLeft: "auto",
                      fontSize: 9, fontFamily: "var(--app-font-mono)",
                      color: "rgba(255,255,255,0.2)",
                    }}>
                      {run.shellLines!.length} lines
                    </span>
                  </div>
                  {/* Lines */}
                  <div style={{ maxHeight: 200, overflowY: "auto", padding: "8px 10px" }}>
                    {run.shellLines!.map((line, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 6, alignItems: "flex-start",
                        marginBottom: 3,
                      }}>
                        <span style={{
                          flexShrink: 0, fontSize: 10,
                          color: line.kind === "cmd" ? "rgba(201,162,76,0.85)"
                            : line.kind === "err" ? "rgba(248,113,113,0.8)"
                            : "rgba(74,222,128,0.6)",
                          fontFamily: "var(--app-font-mono)", lineHeight: 1.5,
                          userSelect: "none",
                        }}>
                          {line.kind === "cmd" ? "›" : line.kind === "err" ? "✕" : " "}
                        </span>
                        <pre style={{
                          margin: 0, fontSize: 10.5, lineHeight: 1.5,
                          fontFamily: "var(--app-font-mono)",
                          color: line.kind === "cmd" ? "rgba(255,255,255,0.9)"
                            : line.kind === "err" ? "rgba(248,113,113,0.85)"
                            : "rgba(255,255,255,0.6)",
                          whiteSpace: "pre-wrap", wordBreak: "break-all",
                        }}>
                          {line.text}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{
                  fontSize: 11, color: "var(--atlas-muted)", opacity: 0.5,
                  fontStyle: "italic", fontFamily: "var(--app-font-sans)",
                  padding: "4px 4px",
                }}>
                  No shell output captured for this run.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Running pulse bar */}
      {isLive && (
        <div style={{
          position: "absolute", bottom: 0, left: 12, right: 12, height: 1.5,
          borderRadius: 1, overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            background: `linear-gradient(90deg, transparent, ${INTENT_COLOR[run.intent]}, transparent)`,
            animation: "ar-pulse 2s ease-in-out infinite",
          }} />
        </div>
      )}
    </div>
  );
}

// Public hook — all runs, reactive. Used by ShellLogSheet to aggregate
// shell output across all runs.
export function useAllRuns(): ActiveRun[] {
  const [runs, setRuns] = useState<ActiveRun[]>(() => _getRuns());
  useEffect(() => _subscribeToRuns(() => setRuns([..._getRuns()])), []);
  return runs;
}

// Public hook — count of in-flight runs (queued + running). Used by the
// project drawer to surface a badge on the "Atlas Composer" entry.
export function useActiveRunsCount(): number {
  const [n, setN] = useState(() =>
    _getRuns().filter((r) => r.status === "queued" || r.status === "running").length
  );
  useEffect(
    () => _subscribeToRuns(() =>
      setN(_getRuns().filter((r) => r.status === "queued" || r.status === "running").length)
    ),
    []
  );
  return n;
}
