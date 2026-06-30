// ActiveRuns — command center for starting and tracking Atlas work sessions.
//
// Replaces the old QuickActionV2 launcher inside ActivityHubCard.
// The form (intent + project + prompt + attach) is always visible at the top.
// On submit: creates a session, fires the chat API in the background, and
// displays a live run card with status/elapsed time. Multiple concurrent runs
// across different projects are supported.
//
// Store: module-level singleton backed by localStorage so run state survives
// component remounts. Stale "running" entries (> 10 min) are auto-failed on
// load. Completed/failed cards auto-dismiss after 2 minutes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { X, ChevronDown, Paperclip, ArrowRight, Loader } from "lucide-react";
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
}

// ── Module-level store ────────────────────────────────────────────────────────

const STORAGE_KEY = "atlas:active-runs";
const STALE_THRESHOLD_MS = 10 * 60 * 1000;  // 10 min: running→failed on load
const AUTO_DISMISS_MS = 3_000;              // 3s flash, then remove from Active Runs

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

function _scheduleAutoDismiss(id: string) {
  setTimeout(() => _removeRun(id), AUTO_DISMISS_MS);
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

    // Consume the SSE stream to completion
    const reader = chatRes.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    }

    _patchRun(run.id, { status: "completed", completedAt: Date.now() });
    _scheduleAutoDismiss(run.id);
  } catch (err) {
    _patchRun(run.id, {
      status: "failed",
      error: err instanceof Error ? err.message : "Unexpected error",
      completedAt: Date.now(),
    });
    _scheduleAutoDismiss(run.id);
  }
}

// ── Placeholder cycling ───────────────────────────────────────────────────────

const PLACEHOLDERS: Record<Intent, string[]> = {
  decide: [
    "Should pricing live above the fold?",
    "Should we ship the v2 onboarding now?",
    "Should we keep the trial or move to freemium?",
    "Should the CTA say 'Start free' or 'Get started'?",
  ],
  think: [
    "Summarize what this project is for.",
    "Why is activation dropping after sign-up?",
    "What does 'done' mean for the MVP?",
    "What is the riskiest assumption in this plan?",
  ],
  build: [
    "Change the hero headline and update the CTA.",
    "Add a settings panel for notification preferences.",
    "Build the empty state for first-time users.",
    "Refactor the onboarding flow to skip step 2.",
  ],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  projects: QuickEditProjectOption[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActiveRuns({ projects }: Props) {
  const [, setLocation] = useLocation();
  return (
    <>
      <style>{`
        @keyframes ar-spin { to { transform: rotate(360deg); } }
        @keyframes ar-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.85; } }
      `}</style>
      <_ActiveRunsInner projects={projects} setLocation={setLocation} />
    </>
  );
}

function _ActiveRunsInner({ projects, setLocation }: Props & { setLocation: (to: string) => void }) {

  // form state
  const [intent, setIntent] = useState<Intent>("decide");
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
    const list = PLACEHOLDERS[intent];
    if (list.length <= 1) return;
    const t = setInterval(() => setPlaceholderIdx((i) => (i + 1) % list.length), 4200);
    return () => clearInterval(t);
  }, [intent]);

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
      // Encode attachments before calling module-level startRun
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
  }, [canSubmit, prompt, attachments, projectId, projects, intent]);

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
        {/* Intent + Project row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          paddingBottom: 10, borderBottom: "1px solid var(--atlas-border)",
        }}>
          {/* Intent tabs */}
          <div role="tablist" aria-label="Intent" style={{ display: "inline-flex", gap: 12, paddingLeft: 2 }}>
            {(["decide", "build", "think"] as Intent[]).map((i) => {
              const active = intent === i;
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setIntent(i)}
                  style={{
                    position: "relative",
                    background: "transparent",
                    border: 0,
                    padding: "4px 0",
                    cursor: "pointer",
                    fontFamily: "var(--app-font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: active ? 500 : 400,
                    color: active ? INTENT_COLOR[i] : "var(--atlas-muted)",
                    opacity: active ? 1 : 0.65,
                    transition: "color 160ms ease, opacity 160ms ease",
                  }}
                >
                  {i}
                  {active && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 0, right: 0, bottom: -6,
                        height: 1.5,
                        background: INTENT_COLOR[i],
                        boxShadow: `0 0 8px ${INTENT_COLOR[i]}88`,
                        borderRadius: 1,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

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
              key={`${intent}-${placeholderIdx}`}
              style={{
                position: "absolute", inset: "10px 8px auto 8px",
                pointerEvents: "none",
                color: "var(--atlas-muted)", opacity: 0.6,
                fontFamily: "var(--app-font-sans)", fontSize: 14, lineHeight: 1.55,
              }}
            >
              {PLACEHOLDERS[intent][placeholderIdx]}
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
      {activeRuns.length === 0 ? (
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
              onDismiss={() => _removeRun(run.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── RunCard ───────────────────────────────────────────────────────────────────

function RunCard({
  run,
  onEnter,
  onDismiss,
}: {
  run: ActiveRun;
  onEnter: () => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const now = Date.now();
  const elapsed = run.completedAt
    ? run.completedAt - run.createdAt
    : now - run.createdAt;

  const isLive = run.status === "running" || run.status === "queued";
  const statusLabel: Record<RunStatus, string> = {
    queued: "queued",
    running: "running",
    completed: "done",
    failed: "failed",
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${run.intent} run for ${run.projectName} — ${statusLabel[run.status]}. Press Enter to open.`}
      onClick={onEnter}
      onKeyDown={(e) => e.key === "Enter" && onEnter()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column", gap: 5,
        padding: "10px 12px",
        borderRadius: 10,
        background: hovered ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
        border: hovered
          ? `1px solid ${INTENT_BORDER[run.intent]}`
          : "1px solid var(--atlas-border)",
        cursor: "pointer",
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      {/* Top row: status dot + intent + project + dismiss */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        {/* Status dot / spinner */}
        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
          {run.status === "running" ? (
            <Loader
              size={10}
              strokeWidth={2}
              color="hsl(217,80%,64%)"
              style={{ animation: "ar-spin 1s linear infinite" }}
            />
          ) : (
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block",
              background: STATUS_DOT_COLOR[run.status],
              boxShadow: run.status === "queued"
                ? "0 0 5px rgba(201,162,76,0.45)"
                : run.status === "completed"
                ? "0 0 6px rgba(74,222,128,0.5)"
                : run.status === "failed"
                ? "0 0 6px rgba(248,113,113,0.5)"
                : "none",
              animation: run.status === "queued" ? "ar-pulse 2s ease-in-out infinite" : "none",
            }} />
          )}
        </span>

        {/* Intent badge + status */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
          fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
          textTransform: "uppercase", fontWeight: 600,
          padding: "2px 7px", borderRadius: 4,
          background: INTENT_BG[run.intent],
          border: `1px solid ${INTENT_BORDER[run.intent]}`,
          color: INTENT_COLOR[run.intent],
        }}>
          {run.intent}
          <span style={{ opacity: 0.5, letterSpacing: "0.05em" }}>·</span>
          <span style={{ opacity: 0.75, fontWeight: 500 }}>
            {run.status === "running" ? "Running" : "Queued"}
          </span>
        </span>

        {/* Project name */}
        <span style={{
          fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em",
          color: "var(--atlas-muted)", opacity: 0.65,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: 120, flexShrink: 1,
        }}>
          {run.projectName}
        </span>

        <div style={{ flex: 1 }} />

        {/* Elapsed time */}
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em",
          color: "var(--atlas-muted)", opacity: 0.5, flexShrink: 0,
        }}>
          {isLive ? formatElapsed(elapsed) : formatAgo(now - (run.completedAt ?? run.createdAt))}
        </span>

        {/* Dismiss button (shown on hover for done runs) */}
        {!isLive && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            aria-label="Dismiss run"
            style={{
              background: "transparent", border: 0, padding: 2,
              color: "var(--atlas-muted)", cursor: "pointer",
              opacity: hovered ? 0.7 : 0,
              transition: "opacity 120ms ease",
              display: "inline-flex", flexShrink: 0,
            }}
          >
            <X size={11} />
          </button>
        )}

        {/* Enter arrow */}
        <span style={{
          display: "inline-flex", flexShrink: 0,
          color: hovered ? "var(--atlas-gold)" : "var(--atlas-muted)",
          opacity: hovered ? 1 : 0.35,
          transition: "color 140ms ease, opacity 140ms ease",
        }}>
          <ArrowRight size={12} strokeWidth={1.8} />
        </span>
      </div>

      {/* Prompt summary */}
      <div style={{
        fontSize: 12, color: "var(--atlas-fg)", opacity: 0.78, lineHeight: 1.45,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontFamily: "var(--app-font-sans)", paddingLeft: 17,
      }}>
        {run.prompt}
      </div>

      {/* Attachment names (if any) */}
      {run.attachmentNames.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 17,
        }}>
          {run.attachmentNames.map((name) => (
            <span key={name} style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 9.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.03em",
              color: "rgba(165,180,252,0.75)",
              padding: "1px 5px", borderRadius: 3,
              background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)",
            }}>
              <Paperclip size={8} />
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Error message */}
      {run.status === "failed" && run.error && (
        <div style={{
          fontSize: 11, color: "rgba(248,113,113,0.8)", lineHeight: 1.4,
          paddingLeft: 17, fontFamily: "var(--app-font-sans)",
        }}>
          {run.error}
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
            backgroundSize: "200% 100%",
          }} />
        </div>
      )}
    </div>
  );
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
