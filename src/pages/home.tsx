import { useState, useRef, useEffect, useCallback, useMemo, Fragment, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import {
  useListProjects,
  useCreateProject,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Project } from "@workspace/api-client-react";
import { ProjectsDrawer } from "../components/ProjectsDrawer";
import { TimelineRail } from "../components/TimelineRail";
import { UserMenuDropdown } from "../components/UserMenuDropdown";
import { UnifiedConversationSurface } from "../components/UnifiedConversationSurface";
import { UnifiedContextDock } from "../components/UnifiedContextDock";
import { AccountHubPanel } from "../components/AccountHubPanel";
import { BelowFoldDashboard } from "../components/BelowFoldDashboard";
import { TheForge } from "../components/TheForge";
import { VisualVault } from "../components/VisualVault";
import { InviteModal } from "../components/InviteModal";
import { extractApiErrorMessage } from "../lib/atlas-utils";
import { fileToBase64Safe } from "../lib/image-resize";
import { useRequireAuth } from "../hooks/useAuth";
import { useThemeMode } from "../lib/theme";
import { useSubscription } from "../hooks/useSubscription";
import { useProjectState } from "../hooks/useProjectState";
import { toast } from "sonner";
import { UpgradeModal } from "../components/UpgradeModal";
import { NewProjectModal } from "../components/NewProjectModal";
import { CompactReadinessRing, computeScoreFromNodeState } from "../components/ReadinessRing";
import { PlanCard } from "../components/PlanCard";
import { detectPlanFromText } from "../lib/plan";
import type { Plan } from "../lib/plan";
import { Briefcase, Lock, LockOpen, Search } from "lucide-react";
import type { RunStatus, RunAction, RunArtifact } from "../components/RunSummary";
import { useShellState } from "../components/UnifiedShell";

const PLACEHOLDERS = [
  "What are we actually trying to solve here…",
  "What decision do you keep circling back to…",
  "Where did the last session leave things…",
  "What's the constraint you haven't named yet…",
  "What would have to be true for this to work…",
];

const HOME_PENDING_PHRASES = [
  "Loading context…",
  "Reading your ledger…",
  "Thinking…",
  "Checking for conflicts…",
  "Reviewing your portfolio…",
  "Composing a response…",
];

type HomeHandoffSignal = {
  readyToHandoff: boolean;
  confidence: "high" | "medium" | "low";
  projectName: string | null;
  reason: string | null;
  projectId?: number | null;
};

type AmbientSurface = {
  type: "MAP" | "WORKSPACE" | "DECISION";
  label: string;
  reason?: string | null;
  projectId?: number | null;
  workspaceId?: number | null;
} | null;

type HomeMessage = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  model?: string;
  intentType?: string | null;
  isNew?: boolean;
  id?: string;
  streaming?: boolean;
  handoffSignal?: HomeHandoffSignal;
  plan?: Plan;
  createdAt?: string;
  executionTimeMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  runStatus?: RunStatus | null;
  runSummary?: string | null;
  runActions?: RunAction[] | null;
  runArtifacts?: RunArtifact[] | null;
  errorMessage?: string | null;
  surface?: AmbientSurface;
};

function formatMessageTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${date} · ${time}`;
}

function normalizeLoadedHomeMessages(
  msgs: Array<{ role: string; content: string; createdAt?: string; [k: string]: any }>,
  mapMessage?: (message: { role: "user" | "assistant"; content: string; createdAt?: string }, index: number) => HomeMessage,
): HomeMessage[] {
  const thread = msgs.filter(
    (message): message is { role: "user" | "assistant"; content: string; createdAt?: string; [k: string]: any } =>
      (message.role === "user" || message.role === "assistant") && typeof message.content === "string",
  );

  const firstUserIndex = thread.findIndex((message) => message.role === "user");
  if (firstUserIndex === -1) return [];

  const trimmed = thread.slice(firstUserIndex);
  const demoRunSummary =
    typeof window !== "undefined" &&
    (window.location.search.includes("demo=runsummary") ||
      window.localStorage.getItem("atlas_demo_runsummary") === "1");

  const enrich = (m: any): Partial<HomeMessage> => {
    const runStatus = (m.runStatus ?? m.run_status ?? null) as RunStatus | null;
    const runActions = (m.runActions ?? m.run_actions ?? null) as RunAction[] | null;
    const runArtifacts = (m.runArtifacts ?? m.run_artifacts ?? null) as RunArtifact[] | null;
    const runSummary = m.runSummary ?? m.run_summary ?? null;

    const shouldMock = demoRunSummary && m.role === "assistant" && !runStatus;
    return {
      executionTimeMs: m.executionTimeMs ?? m.execution_time_ms ?? null,
      inputTokens: m.inputTokens ?? m.input_tokens ?? null,
      outputTokens: m.outputTokens ?? m.output_tokens ?? null,
      costUsd: m.costUsd != null ? Number(m.costUsd) : m.cost_usd != null ? Number(m.cost_usd) : null,
      runStatus: shouldMock ? ("completed" as RunStatus) : runStatus,
      runSummary: shouldMock
        ? "Wired run metadata into the SSE done event and persisted to chat_messages."
        : runSummary,
      runActions: shouldMock
        ? ([
            { verb: "Read", target: "chat_messages.ts", status: "ok" },
            { verb: "Grepped", target: "codebase", status: "ok" },
            { verb: "Read", target: "nexus.ts L1180–1420", status: "ok" },
            { verb: "Updated", target: "nexus.ts", status: "ok" },
            { verb: "Skipped", target: "_journal.json (no changes needed)", status: "warn" },
            { verb: "Pushed", target: "main", status: "ok" },
          ] as RunAction[])
        : runActions,
      runArtifacts: shouldMock
        ? ([
            { type: "commit", label: "fa20782", href: "https://github.com/" },
            { type: "file", label: "nexus.ts", href: "https://github.com/" },
            { type: "url", label: "preview.lovable.app", href: "https://preview.lovable.app" },
          ] as RunArtifact[])
        : runArtifacts,
      errorMessage: m.errorMessage ?? m.error_message ?? null,
      surface: m.surface ?? null,
    };
  };
  return mapMessage
    ? trimmed.map((m, i) => ({ ...mapMessage(m, i), ...enrich(m) }))
    : trimmed.map((m) => ({ ...m, ...enrich(m) }));
}

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_: string, _lang: string, code: string) =>
      `<pre style="background:var(--atlas-surface);border:1px solid var(--atlas-surface);border-radius:6px;padding:9px 11px;overflow-x:auto;margin:6px 0"><code style="font-family:var(--app-font-mono);font-size:11px;color:var(--atlas-fg);white-space:pre">${code.trim().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</code></pre>`)
    .replace(/^### (.+)$/gm, '<div style="font-size:11px;font-weight:700;color:var(--atlas-gold);letter-spacing:0.07em;text-transform:uppercase;margin:10px 0 3px">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-size:13px;font-weight:700;color:var(--atlas-fg);margin:8px 0 3px">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-size:14px;font-weight:700;color:var(--atlas-fg);margin:8px 0 4px">$1</div>')
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, '<code style="font-family:var(--app-font-mono);font-size:11px;background:var(--atlas-surface);padding:1px 5px;border-radius:3px;color:rgba(201,162,76,0.9)">$1</code>')
    .replace(/^[-•*] (.+)$/gm, '<div style="display:flex;gap:7px;margin:2px 0"><span style="color:var(--atlas-gold);opacity:0.6;flex-shrink:0;margin-top:2px;font-size:10px">▸</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="display:flex;gap:7px;margin:2px 0"><span style="color:var(--atlas-muted);font-family:var(--app-font-mono);font-size:10px;flex-shrink:0;min-width:14px;margin-top:1px">$1.</span><span>$2</span></div>')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function HomeStreamingText({ text, animate, style }: { text: string; animate: boolean; style?: React.CSSProperties }) {
  const [visibleCount, setVisibleCount] = useState(animate ? 0 : Infinity);
  const words = useRef<string[]>([]);
  const animateRef = useRef(animate);

  // Reset only when animate flips, not on every text change.
  useEffect(() => {
    if (animateRef.current !== animate) {
      animateRef.current = animate;
      setVisibleCount(animate ? 0 : Infinity);
    }
  }, [animate]);

  // Keep the word list in sync with the (growing) text without resetting progress.
  words.current = text.match(/\S+|\n/g) ?? [];

  useEffect(() => {
    if (!animate) return;
    const total = words.current.length;
    if (visibleCount >= total) {
      // Wait for more tokens to arrive; re-check shortly.
      const t = setTimeout(() => setVisibleCount(c => c), 60);
      return () => clearTimeout(t);
    }
    const last = words.current[visibleCount - 1] ?? "";
    const pause = /[.!?]$/.test(last) ? 140 : 28 + Math.random() * 24;
    const t = setTimeout(
      () => setVisibleCount(c => Math.min(c + (Math.random() > 0.7 ? 2 : 1), words.current.length)),
      pause
    );
    return () => clearTimeout(t);
  }, [visibleCount, animate, text]);

  const total = words.current.length;
  const done = !animate || (visibleCount >= total && total > 0);
  if (done) return <div style={style} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
  const visible = words.current.slice(0, visibleCount).join(" ");
  return <div style={style}>{visible}<span className="atlas-cursor" /></div>;
}

function splitHomeChunks(text: string): string[] {
  if (text.length < 200) return [text];
  return text.split(/\n{2,}/).reduce((acc: string[], chunk) => {
    if (chunk.trim()) acc.push(chunk);
    return acc;
  }, []);
}

function HomeChunkedBubbles({ text, isNew }: { text: string; isNew: boolean }) {
  const chunks = splitHomeChunks(text);
  const [revealed, setRevealed] = useState(isNew ? 0 : chunks.length);

  useEffect(() => {
    if (!isNew || revealed >= chunks.length) return;
    const t = setTimeout(() => setRevealed(r => r + 1), revealed === 0 ? 80 : 500 + Math.random() * 300);
    return () => clearTimeout(t);
  }, [revealed, chunks.length, isNew]);

  const visible = chunks.slice(0, isNew ? Math.min(revealed + 1, chunks.length) : chunks.length);
  return (
    <>
      {visible.map((chunk, i) => (
        <HomeStreamingText
          key={i}
          text={chunk}
          animate={isNew && i === revealed && revealed < chunks.length}
          style={i < visible.length - 1 ? { marginBottom: 10 } : undefined}
        />
      ))}
    </>
  );
}

function AmbientEmergenceCard({ surface, onAction }: { surface: AmbientSurface; onAction: (surface: NonNullable<AmbientSurface>) => void }) {
  if (!surface) return null;
  const actionLabel = surface.type === "MAP"
    ? "View Structure"
    : surface.type === "WORKSPACE"
      ? "Continue Working"
      : surface.type === "DECISION"
        ? "Capture Decision"
        : null;
  if (!actionLabel) return null;

  return (
    <div
      style={{
        marginTop: 6,
        marginLeft: 14,
        maxWidth: 420,
        background: "var(--atlas-surface-alt)",
        border: "1px solid rgba(201,162,76,0.3)",
        borderRadius: 10,
        padding: "12px 16px",
        animation: "fadeIn 260ms ease forwards",
      }}
    >
      <div style={{ fontSize: "var(--ts-md)", lineHeight: 1.4, color: "var(--atlas-fg)", marginBottom: surface.reason ? 4 : 8 }}>
        {surface.label}
      </div>
      {surface.reason && (
        <div style={{ fontSize: "var(--ts-label)", lineHeight: 1.45, color: "var(--atlas-muted)", opacity: 0.72, marginBottom: 10 }}>
          {surface.reason}
        </div>
      )}
      <button
        type="button"
        onClick={() => onAction(surface)}
        style={{
          background: "transparent",
          border: "1px solid rgba(201,162,76,0.28)",
          borderRadius: 999,
          color: "var(--atlas-gold)",
          cursor: "pointer",
          fontFamily: "var(--app-font-mono)",
          fontSize: "var(--ts-micro)",
          letterSpacing: "0.08em",
          padding: "5px 10px",
          textTransform: "uppercase",
          opacity: 0.78,
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function HomeHandoffCard({
  signal,
  projectName,
  projectId,
  onProjectNameChange,
  onStart,
  onDismiss,
  loading,
  stage,
}: {
  signal: HomeHandoffSignal;
  projectName: string;
  projectId?: number | null;
  onProjectNameChange: (value: string) => void;
  onStart: () => void;
  onDismiss: () => void;
  loading: boolean;
  stage: string;
}) {
  const { setActiveProjectId } = useShellState();

  useEffect(() => {
    if (projectId != null) setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  return (
    <div
      style={{
        marginTop: 12,
        padding: "13px 14px",
        borderRadius: 10,
        background: "color-mix(in oklab, var(--atlas-gold) 7%, transparent)",
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 24%, transparent)",
      }}
    >
      <div style={{ fontSize: "var(--ts-body)", fontWeight: 700, color: "var(--atlas-fg)", marginBottom: 4 }}>
        This is ready to build.
      </div>
      <div style={{ fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", lineHeight: 1.55, marginBottom: 10 }}>
        {signal.reason ?? "Atlas has enough shape to start a workspace."}
      </div>
      <input
        value={projectName}
        onChange={(e) => onProjectNameChange(e.target.value)}
        disabled={loading}
        style={{
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 7,
          background: "var(--atlas-bg)",
          border: "1px solid var(--atlas-border)",
          color: "var(--atlas-fg)",
          outline: "none",
          fontFamily: "var(--app-font-sans)",
          fontSize: "var(--ts-label)",
        }}
      />
      {loading && (
        <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", color: "var(--atlas-gold)", marginBottom: 10, letterSpacing: "0.06em" }}>
          {stage || "Setting up your workspace..."}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onStart}
          disabled={loading}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 7,
            background: "var(--atlas-gold)",
            border: "1px solid var(--atlas-gold)",
            color: "var(--atlas-bg)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.55 : 1,
            fontFamily: "var(--app-font-mono)",
            fontSize: "var(--ts-sm)",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Start Building →
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 7,
            background: "transparent",
            border: "1px solid var(--atlas-border)",
            color: "var(--atlas-muted)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.55 : 1,
            fontFamily: "var(--app-font-mono)",
            fontSize: "var(--ts-sm)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Keep Talking
        </button>
      </div>
    </div>
  );
}

// ── Typewriter hook ──────────────────────────────────────────────────────────
function useTypewriter(phrases: string[], paused = false) {
  const [display, setDisplay] = useState("");
  const state = useRef({ phraseIdx: 0, charIdx: 0, phase: "typing" as "typing" | "erasing" });
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      const s = state.current;
      const phrase = phrasesRef.current[s.phraseIdx];

      if (s.phase === "typing") {
        if (s.charIdx < phrase.length) {
          s.charIdx++;
          setDisplay(phrase.slice(0, s.charIdx));
          timer = setTimeout(tick, 38);
        } else {
          timer = setTimeout(() => {
            s.phase = "erasing";
            tick();
          }, 2000);
        }
      } else {
        if (s.charIdx > 0) {
          s.charIdx--;
          setDisplay(phrase.slice(0, s.charIdx));
          timer = setTimeout(tick, 22);
        } else {
          s.phraseIdx = (s.phraseIdx + 1) % phrasesRef.current.length;
          s.phase = "typing";
          timer = setTimeout(tick, 200);
        }
      }
    }

    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [paused]);

  return display;
}

// ── InlineTimestamp ──────────────────────────────────────────────────────────
function InlineTimestamp() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const day = days[now.getDay()];
  const mon = months[now.getMonth()];
  const date = now.getDate();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return (
    <div
      aria-hidden
      style={{
        fontFamily: "var(--app-font-mono)",
        fontSize: "var(--ts-micro)",
        letterSpacing: "0.18em",
        color: "rgba(120,113,108,0.5)",
        userSelect: "none",
        textTransform: "uppercase",
      }}
    >
      {day} {mon} {date} · {h}:{m} {ampm}
    </div>
  );
}

// ── AtlasLogo ────────────────────────────────────────────────────────────────
function AtlasLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <img
        src="/axiom-logo.svg"
        alt="Axiom"
        width={26}
        height={26}
        style={{ borderRadius: "20%", flexShrink: 0 }}
      />
      <span
        style={{
          fontFamily: "'IBM Plex Mono', var(--app-font-mono)",
          fontSize: "var(--ts-label)",
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "var(--atlas-gold)",
          textTransform: "uppercase",
        }}
      >
        AXIOM
      </span>
    </div>
  );
}

// ── SettingsBtn ──────────────────────────────────────────────────────────────
function SettingsBtn({ onClick }: { onClick?: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title="Settings"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: hov ? 0.75 : 0.32,
        transition: "opacity 160ms ease",
        flexShrink: 0,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="2.6" stroke="var(--atlas-fg)" strokeWidth="1.25" />
        <path
          d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4.1 4.1l1.42 1.42M14.48 14.48l1.42 1.42M4.1 15.9l1.42-1.42M14.48 5.52l1.42-1.42"
          stroke="var(--atlas-fg)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

// ── UserAvatar ───────────────────────────────────────────────────────────────
function UserAvatar({ onClick }: { onClick?: () => void }) {
  const [hov, setHov] = useState(false);
  const photoUrl = (() => {
    try { const r = localStorage.getItem("atlas-user-profile"); return r ? JSON.parse(r).photoUrl ?? "" : ""; } catch { return ""; }
  })();
  return (
    <button
      title="Account"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        background: photoUrl ? "transparent" : hov ? "rgba(201,162,76,0.18)" : "rgba(201,162,76,0.08)",
        border: `1px solid ${hov ? "rgba(201,162,76,0.42)" : "rgba(201,162,76,0.2)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 160ms ease",
        flexShrink: 0,
        overflow: "hidden",
        padding: 0,
      }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="7.5" r="3.2" stroke="#C9A24C" strokeWidth="1.2" />
          <path d="M3 18.5c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="#C9A24C" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

// ── ProjectThumbnail ─────────────────────────────────────────────────────────
function ProjectThumbnail({ name, id }: { name: string; id: number }) {
  const hash = (name + id).split("").reduce((acc, c) => acc + c.charCodeAt(0), 17);
  const hue = hash % 360;
  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: `linear-gradient(145deg, hsla(${hue},28%,13%,1) 0%, hsla(${(hue + 45) % 360},18%,9%,1) 100%)`,
        border: `1px solid hsla(${hue},22%,20%,0.7)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* subtle diagonal stripe texture */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 5px,
            hsla(${hue},30%,50%,0.04) 5px,
            hsla(${hue},30%,50%,0.04) 6px
          )`,
        }}
      />
      <span
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: "var(--ts-h3)",
          fontWeight: 600,
          color: `hsla(${hue},52%,62%,0.9)`,
          letterSpacing: "-0.02em",
          position: "relative",
          zIndex: 1,
          lineHeight: 1,
        }}
      >
        {initial}
      </span>
    </div>
  );
}

// ── LiveThumbnail ─────────────────────────────────────────────────────────────
function LiveThumbnail({ url, name, id }: { url: string; name: string; id: number }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const src = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0, position: "relative" }}>
      {state !== "error" && (
        <img
          src={src}
          alt={name}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            display: state === "loaded" ? "block" : "none",
          }}
        />
      )}
      {state !== "loaded" && <ProjectThumbnail name={name} id={id} />}
    </div>
  );
}

// ── ProjectCard ──────────────────────────────────────────────────────────────
function ProjectCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  const date = new Date(project.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "11px 14px",
        borderRadius: 10,
        background: hov ? "rgba(201,162,76,0.04)" : "var(--atlas-surface)",
        border: `1px solid ${hov ? "rgba(201,162,76,0.28)" : "var(--atlas-surface)"}`,
        cursor: "pointer",
        transition: "all 180ms var(--ease-cinematic)",
        display: "flex",
        alignItems: "center",
        gap: 13,
      }}
    >
      {project.previewUrl
        ? <LiveThumbnail url={project.previewUrl} name={project.name} id={project.id} />
        : <ProjectThumbnail name={project.name} id={project.id} />
      }

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: "var(--ts-body)",
            fontWeight: 500,
            color: hov ? "var(--atlas-fg)" : "var(--atlas-fg)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: (project.description || project.linkedRepo) ? 3 : 0,
            transition: "color 180ms ease",
          }}
        >
          {project.name}
        </div>
        {project.description && (
          <div
            style={{
              fontSize: "var(--ts-caption)",
              color: "var(--atlas-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              opacity: 0.75,
              marginBottom: project.linkedRepo ? 4 : 0,
            }}
          >
            {project.description}
          </div>
        )}
        {project.linkedRepo ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="rgba(74,222,128,0.75)" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span style={{
              fontSize: "var(--ts-micro)",
              fontFamily: "var(--app-font-mono)",
              color: "rgba(74,222,128,0.65)",
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 140,
            }}>
              {(() => {
                try {
                  const r = JSON.parse(project.linkedRepo);
                  const full = typeof r === "string" ? r : (r.fullName ?? project.linkedRepo);
                  return full.includes("/") ? full.split("/")[1] : full;
                } catch {
                  return project.linkedRepo.includes("/") ? project.linkedRepo.split("/")[1] : project.linkedRepo;
                }
              })()}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="rgba(120,113,108,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              <circle cx="8" cy="10" r="1" fill="rgba(120,113,108,0.4)" stroke="none" />
              <circle cx="12" cy="10" r="1" fill="rgba(120,113,108,0.4)" stroke="none" />
            </svg>
            <span style={{
              fontSize: "var(--ts-micro)",
              fontFamily: "var(--app-font-mono)",
              color: "rgba(120,113,108,0.4)",
              letterSpacing: "0.02em",
            }}>
              Chat only
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <CompactReadinessRing score={project.latestSnapshotScore ?? computeScoreFromNodeState(project.nodeState)} />
        <span
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: "var(--ts-xs)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(120,113,108,0.5)",
          }}
        >
          {date}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{ opacity: hov ? 0.5 : 0.2, transition: "opacity 180ms ease" }}
        >
          <path d="M4.5 2.5L8.5 6L4.5 9.5" stroke="var(--atlas-gold)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}

type HomeRepo = { fullName: string; name: string; defaultBranch: string };

// ── RepoSearchSheet ────────────────────────────────────────────────────────────
function RepoSearchSheet({
  current, onSelect, onClose,
}: {
  current: HomeRepo | null;
  onSelect: (r: HomeRepo) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<HomeRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/github/repos", { headers: { "x-github-token": "__server__" }, credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        if (cancelled) return;
        setRepos(data.map((r: any) => ({ fullName: r.fullName, name: r.name, defaultBranch: r.defaultBranch ?? "main" })));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = repos.filter(r =>
    !query || r.fullName.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 480,
        background: "var(--atlas-surface)", borderRadius: "16px 16px 0 0",
        borderTop: "1px solid rgba(201,162,76,0.18)",
        display: "flex", flexDirection: "column",
        maxHeight: "72dvh",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--atlas-border)", margin: "12px auto 4px" }} />
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 10px" }}>
          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--atlas-gold)" }}>
            Choose Repository
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(120,113,108,0.6)", fontSize: "var(--ts-display)", lineHeight: 1, padding: 4 }}>×</button>
        </div>
        {/* Search */}
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, background: "var(--atlas-surface-alt)", border: "1px solid var(--atlas-border)" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--atlas-muted)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="6.5" cy="6.5" r="4.5" /><path d="M11 11l2.5 2.5" />
            </svg>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search repositories..."
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--atlas-fg)", fontSize: "var(--ts-body)", fontFamily: "var(--app-font-sans)" }}
            />
          </div>
        </div>
        {/* List */}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 32px" }}>
          {loading && (
            <div style={{ padding: "24px 0", textAlign: "center", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", opacity: 0.5 }}>
              Loading...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", opacity: 0.5 }}>
              No repositories found
            </div>
          )}
          {filtered.map(r => (
            <button
              key={r.fullName}
              onClick={() => { onSelect(r); onClose(); }}
              style={{
                width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8,
                background: current?.fullName === r.fullName ? "rgba(201,162,76,0.06)" : "transparent",
                border: `1px solid ${current?.fullName === r.fullName ? "rgba(201,162,76,0.22)" : "transparent"}`,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2,
                transition: "all 140ms ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = current?.fullName === r.fullName ? "rgba(201,162,76,0.06)" : "transparent")}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="rgba(120,113,108,0.6)" style={{ flexShrink: 0 }}>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-label)", fontWeight: 500, color: "var(--atlas-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.name}
                </div>
                <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", color: "var(--atlas-muted)", opacity: 0.6, marginTop: 1 }}>
                  {r.fullName}
                </div>
              </div>
              {current?.fullName === r.fullName && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="var(--atlas-gold)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── BranchPickerSheet ─────────────────────────────────────────────────────────
function BranchPickerSheet({
  repo, current, onSelect, onClose,
}: {
  repo: HomeRepo | null; current: string;
  onSelect: (b: string) => void; onClose: () => void;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repo) return;
    setLoading(true);
    fetch(`/api/github/repos/${encodeURIComponent(repo.fullName)}/branches`, {
      headers: { "x-github-token": "__server__" }, credentials: "include",
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        const list = Array.isArray(data)
          ? data.map((b: any) => b.name ?? b)
          : [repo.defaultBranch ?? "main"];
        setBranches(list.length ? list : [repo.defaultBranch ?? "main"]);
        setLoading(false);
      })
      .catch(() => {
        setBranches([repo?.defaultBranch ?? "main"]);
        setLoading(false);
      });
  }, [repo]);

  const displayBranches = branches.length ? branches : (repo ? [repo.defaultBranch ?? "main"] : ["main"]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 480,
        background: "var(--atlas-surface)", borderRadius: "16px 16px 0 0",
        borderTop: "1px solid rgba(201,162,76,0.18)",
        maxHeight: "55dvh", display: "flex", flexDirection: "column",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--atlas-border)", margin: "12px auto 4px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 10px" }}>
          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--atlas-gold)" }}>
            Choose Branch
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(120,113,108,0.6)", fontSize: "var(--ts-display)", lineHeight: 1, padding: 4 }}>×</button>
        </div>
        {!repo && (
          <div style={{ padding: "20px 16px 32px", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", opacity: 0.5, textAlign: "center" }}>
            Link a repository first
          </div>
        )}
        {repo && (
          <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 32px" }}>
            {loading ? (
              <div style={{ padding: "20px 0", textAlign: "center", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", opacity: 0.5 }}>Loading...</div>
            ) : displayBranches.map(b => (
              <button
                key={b}
                onClick={() => { onSelect(b); onClose(); }}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8,
                  background: current === b ? "rgba(201,162,76,0.06)" : "transparent",
                  border: `1px solid ${current === b ? "rgba(201,162,76,0.22)" : "transparent"}`,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2,
                  transition: "all 140ms ease",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = current === b ? "rgba(201,162,76,0.06)" : "transparent")}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="rgba(120,113,108,0.6)" style={{ flexShrink: 0 }}>
                  <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
                </svg>
                <span style={{ fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-label)", fontWeight: 500, color: "var(--atlas-fg)" }}>{b}</span>
                {current === b && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: "auto" }}>
                    <path d="M2 6l3 3 5-5" stroke="var(--atlas-gold)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



// ── First-run overlay ────────────────────────────────────────────────────────
function FirstRunOverlay({
  loading,
  onSpecMode,
  onWorkspace,
  onDismiss,
}: {
  loading: boolean;
  onSpecMode: () => void;
  onWorkspace: () => void;
  onDismiss?: () => void;
}) {

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(8,6,5,0.97)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "atlas-overlay-fadein 500ms ease forwards",
        padding: "0 24px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: 340 }}>

        {/* Identity */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11, background: "rgba(201,162,76,0.1)",
            border: "1.5px solid rgba(201,162,76,0.35)", display: "flex", alignItems: "center",
            justifyContent: "center", margin: "0 auto 14px",
          }}>
            <svg viewBox="0 0 48 48" width="26" height="26">
              <polygon points="24,8 16,40 20,40 25.5,18" fill="#D4AF37" />
              <polygon points="24,8 32,40 28,40 22.5,18" fill="#D4AF37" />
              <rect x="16" y="27" width="16" height="4" rx="1" fill="#D4AF37" />
            </svg>
          </div>
          <div style={{ fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.22em", color: "rgba(201,162,76,0.7)", textTransform: "uppercase", marginBottom: 12 }}>
            AXIOM
          </div>
          <div style={{ fontSize: "var(--ts-body)", color: "rgba(120,113,108,0.6)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", lineHeight: 1.5 }}>
            Structure before speed.
          </div>
        </div>

        {/* CTA buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            disabled={loading}
            onClick={onWorkspace}
            style={{
              width: "100%", padding: "15px 24px",
              background: "#D4AF37", border: "none", borderRadius: 11,
              color: "#0C0A09", cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.55 : 1,
              animation: "atlas-btn-rise 500ms cubic-bezier(0.34,1.56,0.64,1) 480ms both, atlas-btn-glow 2.8s ease-in-out 1000ms infinite",
              transition: "background 160ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#C9A24C"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#D4AF37"; }}
          >
            <div style={{ fontSize: "var(--ts-md)", fontWeight: 700, fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em" }}>
              Start a project →
            </div>
            <div style={{ fontSize: "var(--ts-micro)", fontWeight: 400, opacity: 0.6, marginTop: 3, fontFamily: "var(--app-font-mono)" }}>
              Chat + Decision Ledger
            </div>
          </button>

          <button
            disabled={loading}
            onClick={onSpecMode}
            style={{
              width: "100%", padding: "14px 24px",
              background: "transparent", border: "1px solid rgba(201,162,76,0.4)",
              borderRadius: 11, color: "#D4AF37",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.55 : 1,
              animation: "atlas-btn-rise 500ms cubic-bezier(0.34,1.56,0.64,1) 560ms both",
              transition: "background 160ms ease, border-color 160ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,175,55,0.06)"; e.currentTarget.style.borderColor = "rgba(212,175,55,0.65)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.4)"; }}
          >
            <div style={{ fontSize: "var(--ts-md)", fontWeight: 700, fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em" }}>
              Map my architecture
            </div>
            <div style={{ fontSize: "var(--ts-micro)", fontWeight: 400, opacity: 0.55, marginTop: 3, fontFamily: "var(--app-font-mono)" }}>
              System Map + Intent Capture
            </div>
          </button>
        </div>

        {/* Skip */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(120,113,108,0.45)", fontSize: "var(--ts-caption)",
              fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em",
              marginTop: 18, textAlign: "center", padding: "4px 0",
              animation: "atlas-btn-rise 400ms ease 640ms both",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(120,113,108,0.75)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(120,113,108,0.45)"; }}
          >
            Skip for now
          </button>
        )}

      </div>
    </div>,
    document.body
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [input, setInput] = useState("");
  const [starterIdx, setStarterIdx] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const filePreviewUrls = useRef<Map<File, string>>(new Map());

  // Create/revoke Object URLs exactly once per file — never inside JSX
  useEffect(() => {
    const current = new Set(attachedFiles);
    // Revoke URLs for files that were removed
    for (const [file, url] of filePreviewUrls.current.entries()) {
      if (!current.has(file)) {
        URL.revokeObjectURL(url);
        filePreviewUrls.current.delete(file);
      }
    }
    // Create URLs for newly added files
    for (const file of attachedFiles) {
      if (file.type.startsWith("image/") && !filePreviewUrls.current.has(file)) {
        filePreviewUrls.current.set(file, URL.createObjectURL(file));
      }
    }
  }, [attachedFiles]);
  const [showVault, setShowVault] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isTinyScreen, setIsTinyScreen] = useState(() => window.innerWidth < 390);
  useEffect(() => {
    const handler = () => setIsTinyScreen(window.innerWidth < 390);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const isParchment = useThemeMode() === "parchment";
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [showDeepDiveMenu, setShowDeepDiveMenu] = useState(false);
  const [deepDiveCopied, setDeepDiveCopied] = useState(false);
  const [showQuickPrompt, setShowQuickPrompt] = useState(false);
  const { user: authUser } = useRequireAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  useEffect(() => {
    const open = () => setShowDrawer(true);
    window.addEventListener("axiom:open-projects-drawer", open);
    return () => window.removeEventListener("axiom:open-projects-drawer", open);
  }, []);
  useEffect(() => {
    const open = () => setShowProfile(true);
    window.addEventListener("axiom:open-account-hub", open);
    return () => window.removeEventListener("axiom:open-account-hub", open);
  }, []);
  const [showProjectsSheet, setShowProjectsSheet] = useState(false);
  const [showOverviewSheet, setShowOverviewSheet] = useState(false);
  const [isOverviewSheetClosing, setIsOverviewSheetClosing] = useState(false);
  const overviewCloseTimerRef = useRef<number | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [homeMessages, setHomeMessages] = useState<HomeMessage[]>([]);
  useEffect(() => {
    const active = homeMessages.length > 0;
    document.body.setAttribute("data-axiom-thread", active ? "active" : "empty");
    return () => { document.body.removeAttribute("data-axiom-thread"); };
  }, [homeMessages.length]);
  const [loadedHistoryCount, setLoadedHistoryCount] = useState(0);
  const [showConvSearch, setShowConvSearch] = useState(false);
  const [convSearchQuery, setConvSearchQuery] = useState("");
  const [convSearchResults, setConvSearchResults] = useState<Array<{ id: string; title: string; createdAt: string; messageCount: number }>>([]);
  const [convSearchLoading, setConvSearchLoading] = useState(false);
  const [isAtlasStreaming, setIsAtlasStreaming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingPhraseIdx, setPendingPhraseIdx] = useState(0);
  const [liveStep, setLiveStep] = useState<{ verb: string; target?: string; status?: "ok" | "warn" | "fail" } | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [threadLoading, setThreadLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const newId = crypto.randomUUID();
    try { sessionStorage.setItem("atlas-home-conversation-id", newId); } catch {}
    return newId;
  });
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; createdAt: string; messageCount: number }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [showBriefingPanel, setShowBriefingPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const greetingPhraseRef = useRef<string | null>(null);
  const { isFree } = useSubscription();
  const { setDepth, setActiveProjectId } = useShellState();
  const previousHomeMessageCountRef = useRef(0);

  useEffect(() => {
    const previousCount = previousHomeMessageCountRef.current;
    if (homeMessages.length === 0) {
      setDepth("ambient");
    } else if (previousCount === 0 && homeMessages.length === 1) {
      setDepth("active");
    }
    previousHomeMessageCountRef.current = homeMessages.length;
  }, [homeMessages.length, setDepth]);

  // Compute greeting phrase once on mount and never change it
  const greetingNameRef = useRef<string | null>(null);
  if (greetingPhraseRef.current === null) {
    const hasHistory = conversations.length > 0;
    const hour = new Date().getHours();
    const pool = hasHistory
      ? ["Where were we?", "Picking something back up?", "Still untangling it?"]
      : hour >= 5 && hour < 11
        ? ["Good morning.", "Morning."]
        : hour >= 11 && hour < 17
          ? ["Good afternoon.", "Afternoon."]
          : hour >= 17 && hour < 21
            ? ["Good evening.", "Still thinking about it?"]
            : ["Still at it.", "Night owl mode."];
    greetingPhraseRef.current = pool[Math.floor(Math.random() * pool.length)];

    // Name prefix: 30% chance, return sessions only, first name only
    try {
      const visitedKey = "atlas-home-visited";
      const isReturn = typeof localStorage !== "undefined" && localStorage.getItem(visitedKey) === "1";
      if (typeof localStorage !== "undefined") localStorage.setItem(visitedKey, "1");
      const fullName = (authUser?.name ?? "").trim();
      const first = fullName.split(/\s+/)[0] ?? "";
      if (isReturn && first && Math.random() < 0.3) {
        greetingNameRef.current = first;
      }
    } catch {}
  }

  // ── Home context: repo / branch / model ────────────────────────────────────
  const [homeFocus] = useState<number | null>(null);
  const [homeModel] = useState<string>("claude");
  const [homeMode] = useState<string>("strategic");
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffStage, setHandoffStage] = useState("");
  const [handoffCardDismissed, setHandoffCardDismissed] = useState(() => {
    try { return sessionStorage.getItem(`atlas-home-handoff-dismissed-${activeConversationId}`) === "1"; } catch { return false; }
  });
  const [handoffProjectName, setHandoffProjectName] = useState("");
  const [reviewingPlanIds, setReviewingPlanIds] = useState<Set<string>>(() => new Set());

  // ── Reflection mode ────────────────────────────────────────────────────────
  const [reflectionLocked, setReflectionLocked] = useState(false);
  const [showShredChoice, setShowShredChoice] = useState(false);
  const [isShredding, setIsShredding] = useState(false);
  const [showGoneFlash, setShowGoneFlash] = useState(false);

  const vibrate = useCallback((pattern: number | number[]) => {
    try { if (typeof navigator !== "undefined" && "vibrate" in navigator) (navigator as any).vibrate(pattern); } catch {}
  }, []);

  const callReflectionMode = useCallback(async (enabled: boolean) => {
    try {
      await fetch(`/api/sessions/${encodeURIComponent(activeConversationId)}/reflection-mode`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    } catch {}
  }, [activeConversationId]);

  const handleLockTap = useCallback(() => {
    vibrate(50);
    if (reflectionLocked) {
      setShowShredChoice(true);
    } else {
      setReflectionLocked(true);
      void callReflectionMode(true);
    }
  }, [reflectionLocked, vibrate, callReflectionMode]);

  const handleKeepIt = useCallback(() => {
    vibrate([50, 50, 50]);
    void callReflectionMode(false);
    setReflectionLocked(false);
    setShowShredChoice(false);
  }, [vibrate, callReflectionMode]);

  const handleShredIt = useCallback(() => {
    vibrate(200);
    void callReflectionMode(false);
    setShowShredChoice(false);
    setIsShredding(true);
    setTimeout(() => {
      setHomeMessages([]);
      setIsShredding(false);
      setReflectionLocked(false);
      setShowGoneFlash(true);
      setTimeout(() => setShowGoneFlash(false), 1500);
    }, 700);
  }, [vibrate, callReflectionMode]);


  // Cycle pending phrases while Atlas is generating
  useEffect(() => {
    if (!isAtlasStreaming) { setPendingPhraseIdx(0); return; }
    const t = setInterval(() => setPendingPhraseIdx(i => (i + 1) % HOME_PENDING_PHRASES.length), 2400);
    return () => clearInterval(t);
  }, [isAtlasStreaming]);

  // Demo: simulate live step events when ?demo=runsummary or localStorage flag is set
  useEffect(() => {
    if (!isAtlasStreaming) return;
    const demo = typeof window !== "undefined" &&
      (window.location.search.includes("demo=runsummary") ||
        window.localStorage.getItem("atlas_demo_runsummary") === "1");
    if (!demo) return;
    const fakeSteps: Array<{ verb: string; target: string; status?: "ok" | "warn" }> = [
      { verb: "Read", target: "chat_messages.ts" },
      { verb: "Grepped", target: "codebase" },
      { verb: "Read", target: "nexus.ts L1180–1420" },
      { verb: "Updated", target: "nexus.ts" },
      { verb: "Skipped", target: "_journal.json", status: "warn" },
      { verb: "Pushed", target: "main" },
    ];
    let i = 0;
    setLiveStep(fakeSteps[0]);
    const t = setInterval(() => {
      i = (i + 1) % fakeSteps.length;
      setLiveStep(fakeSteps[i]);
    }, 1600);
    return () => clearInterval(t);
  }, [isAtlasStreaming]);
  const [, setLocation] = useLocation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const queryClient = useQueryClient();

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      document.body.dataset.voiceActive = "false";
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let finalTranscript = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      // Only update input on final results to avoid per-syllable re-renders
      if (finalTranscript) {
        setInput(prev => {
          const base = prev.trimEnd();
          const join = base.length > 0 ? " " : "";
          return base + join + finalTranscript.trimStart();
        });
        finalTranscript = "";
      } else if (interim) {
        // Show interim text as a preview only — debounced via requestAnimationFrame
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.dataset.interim = interim;
          }
        });
      }
    };
    rec.onend = () => {
      setIsListening(false);
      document.body.dataset.voiceActive = "false";
      if (textareaRef.current) delete textareaRef.current.dataset.interim;
    };
    rec.onerror = () => {
      setIsListening(false);
      document.body.dataset.voiceActive = "false";
    };
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
    document.body.dataset.voiceActive = "true";
  }, [isListening]);

  const [typewriterPaused, setTypewriterPaused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const placeholder = useTypewriter(PLACEHOLDERS, typewriterPaused);

  const { data: projects, isLoading } = useListProjects();
  const mostRecentActiveProjectId = useMemo(() => {
    const activeProjects = (projects ?? []).filter((project: Project) => project.status === "active");
    const candidates = activeProjects.length > 0 ? activeProjects : projects ?? [];
    const latest = candidates.reduce<Project | null>((current, project: Project) => {
      if (!current) return project;
      return new Date(project.updatedAt).getTime() > new Date(current.updatedAt).getTime()
        ? project
        : current;
    }, null);
    return latest?.id ?? null;
  }, [projects]);
  const homeProjectState = useProjectState(mostRecentActiveProjectId);
  const createProject = useCreateProject();

  useEffect(() => {
    setBriefingLoading(true);
    fetch("/api/nexus/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    })
      .then(r => r.ok ? r.json() : { briefing: null })
      .then((data: any) => {
        setBriefing(data.briefing ?? null);
        setBriefingLoading(false);
      })
      .catch(() => setBriefingLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/nexus/conversations", { credentials: "include" })
      .then(r => r.ok ? r.json() : { conversations: [] })
      .then((data: any) => {
        const list = data.conversations ?? [];
        setConversations(list);
      })
      .catch(() => {});
  }, []);

  // ── Conversation search: debounced fetch with client-side fallback ───────
  useEffect(() => {
    if (!showConvSearch) return;
    const q = convSearchQuery.trim();
    setConvSearchLoading(true);
    const t = setTimeout(() => {
      const ctrl = new AbortController();
      const url = q
        ? `/api/nexus/conversations?search=${encodeURIComponent(q)}`
        : `/api/nexus/conversations`;
      fetch(url, { credentials: "include", signal: ctrl.signal })
        .then(r => r.ok ? r.json() : { conversations: [] })
        .then((data: any) => {
          const list: Array<{ id: string; title: string; createdAt: string; messageCount: number }> = data.conversations ?? [];
          // If the server doesn't filter, fall back to client-side filtering by title.
          const lower = q.toLowerCase();
          const filtered = q
            ? list.filter(c => (c.title ?? "").toLowerCase().includes(lower))
            : list;
          setConvSearchResults(filtered);
          setConvSearchLoading(false);
        })
        .catch(() => {
          // Fallback: filter from already-loaded conversations list
          const lower = q.toLowerCase();
          setConvSearchResults(q ? conversations.filter(c => (c.title ?? "").toLowerCase().includes(lower)) : conversations);
          setConvSearchLoading(false);
        });
      return () => ctrl.abort();
    }, 400);
    return () => { clearTimeout(t); };
  }, [convSearchQuery, showConvSearch, conversations]);

  // Escape + click-outside closes search bar
  useEffect(() => {
    if (!showConvSearch) return;
    const close = () => { setShowConvSearch(false); setConvSearchQuery(""); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-conv-search-root]")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [showConvSearch]);

  useEffect(() => {
    if (homeMessages.length === 0) return;
    const container = messagesEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [homeMessages]);

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (homeMessages.length >= 4) {
        await fetch("/api/nexus/conversation/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ messages: homeMessages }),
          keepalive: true,
        });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [homeMessages]);

  // Load the active conversation from DB (re-runs when conversationId changes)
  useEffect(() => {
    setHomeMessages([]);
    setLoadedHistoryCount(0);
    setThreadLoading(true);
    try {
      setHandoffCardDismissed(sessionStorage.getItem(`atlas-home-handoff-dismissed-${activeConversationId}`) === "1");
    } catch {
      setHandoffCardDismissed(false);
    }
    setHandoffProjectName("");
    fetch(`/api/nexus/thread?conversationId=${encodeURIComponent(activeConversationId)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(async (msgs: Array<{ role: string; content: string }>) => {
        const normalizedMessages = normalizeLoadedHomeMessages(msgs);
        if (normalizedMessages.length > 0) {
          setHomeMessages(normalizedMessages);
          setLoadedHistoryCount(normalizedMessages.length);
          return;
        }
      })
      .catch(() => {})
      .finally(() => setThreadLoading(false));
  }, [activeConversationId]);


  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const performCreateProject = useCallback((name: string, _githubRepo?: string) => {
    if (isFree && (projects?.length ?? 0) >= 1) {
      setShowNewProjectModal(false);
      setShowUpgrade(true);
      return;
    }
    createProject.mutate(
      { data: { name } },
      {
        onSuccess: (p) => {
          setShowNewProjectModal(false);
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setLocation(`/project/${p.id}`);
        },
        onError: (err: any) => {
          const msg = extractApiErrorMessage(err);
          if (msg?.includes("PROJECT_LIMIT_REACHED") || err?.status === 402) {
            setShowNewProjectModal(false);
            setShowUpgrade(true);
          } else {
            setCreateError(msg ?? "Failed to create project");
          }
        },
      }
    );
  }, [isFree, projects, createProject, queryClient, setLocation]);

  const handleNewProject = useCallback((_name = "New Project") => {
    if (isFree && (projects?.length ?? 0) >= 1) {
      setShowUpgrade(true);
      return;
    }
    setCreateError(null);
    setShowNewProjectModal(true);
  }, [isFree, projects]);

  useEffect(() => {
    try { sessionStorage.removeItem("atlas-from-landing"); } catch {}
  }, []);

  // First-run overlay — only for new users with no projects, only once per session
  const [overlayDismissed, setOverlayDismissed] = useState(() => {
    try { return !!sessionStorage.getItem("atlas-choice-shown"); } catch { return false; }
  });
  const dismissOverlay = () => {
    try { sessionStorage.setItem("atlas-choice-shown", "1"); } catch {}
    setOverlayDismissed(true);
  };
  const showOverlay = !isLoading && projects !== undefined && projects.length === 0 && !overlayDismissed;
  const firstHandoffMessageIndex = homeMessages.findIndex(m => m.role === "assistant" && !!m.handoffSignal);

  const navigateToProject = useCallback(
    (projectId: number) => {
      if (input.trim()) {
        sessionStorage.setItem(`atlas-initial-${projectId}`, input.trim());
      }
      setLocation(`/project/${projectId}`);
    },
    [input, setLocation]
  );

  const openOverviewSheet = useCallback(() => {
    if (overviewCloseTimerRef.current) {
      window.clearTimeout(overviewCloseTimerRef.current);
      overviewCloseTimerRef.current = null;
    }
    setIsOverviewSheetClosing(false);
    setShowOverviewSheet(true);
  }, []);

  const closeOverviewSheet = useCallback(() => {
    setIsOverviewSheetClosing(true);
    if (overviewCloseTimerRef.current) {
      window.clearTimeout(overviewCloseTimerRef.current);
    }
    overviewCloseTimerRef.current = window.setTimeout(() => {
      setShowOverviewSheet(false);
      setIsOverviewSheetClosing(false);
      overviewCloseTimerRef.current = null;
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (overviewCloseTimerRef.current) {
        window.clearTimeout(overviewCloseTimerRef.current);
      }
    };
  }, []);

  const renderOverviewDashboard = (closeOnNavigate = false) => (
    <BelowFoldDashboard
      projects={(projects ?? []).map((p: Project) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        updatedAt: p.createdAt,
        latestSnapshotScore: p.latestSnapshotScore ?? null,
      }))}
      onOpenProject={(id) => {
        if (closeOnNavigate) closeOverviewSheet();
        navigateToProject(id);
      }}
      onOpenLedger={() => {
        if (closeOnNavigate) closeOverviewSheet();
        const p = projects?.[0];
        if (p) setLocation(`/ledger/${p.id}`);
      }}
      onOpenParking={() => {
        if (closeOnNavigate) closeOverviewSheet();
        setLocation("/parking");
      }}
      parkedCount={0}
      committedCount={0}
      briefing={briefing}
      briefingLoading={briefingLoading}
    />
  );


  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    const hasImages = attachedFiles.some(f => f.type.startsWith("image/"));
    if ((!text && !hasImages) || isSending) return;
    // Block PTR and double-sends immediately — before any async work
    setIsSending(true);
    document.body.dataset.voiceActive = "true";
    const files = attachedFiles;
    setInput("");
    setAttachedFiles([]);

    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    const otherFiles = files.filter(f => !f.type.startsWith("image/"));
    const suffix = otherFiles.length > 0 ? `\n[Attached: ${otherFiles.map(f => f.name).join(", ")}]` : "";
    const fullText = text + suffix;

    // Use first image for display preview, safe-resize for API (always caps at 7000px — no raw fallback)
    const imageUrl = imageFiles.length > 0 ? URL.createObjectURL(imageFiles[0]) : undefined;
    // Append image count note if multiple were attached
    const imageNote = imageFiles.length > 1 ? ` [${imageFiles.length} images attached — showing first]` : "";
    const messageText = fullText + imageNote;

    const userMessageCreatedAt = new Date().toISOString();
    const userMessage: HomeMessage = { role: 'user', content: messageText, imageUrl, createdAt: userMessageCreatedAt };
    const appendUserMessageIfMissing = () => {
      setHomeMessages(prev =>
        prev.some(m => m.role === 'user' && m.content === messageText && m.createdAt === userMessageCreatedAt)
          ? prev
          : [...prev, userMessage]
      );
    };

    appendUserMessageIfMissing();

    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    if (imageFiles.length > 0) {
      try {
        const safe = await fileToBase64Safe(imageFiles[0]);
        imageBase64 = safe.base64;
        imageMimeType = safe.mediaType;
      } catch {
        // If resize fails entirely, skip the image and continue with text only
        setHomeMessages(prev => prev.map(m => (
          m === userMessage ? { ...m, imageUrl: undefined } : m
        )));
      }
    }

    setIsAtlasStreaming(true);
    const streamingId = Date.now().toString();
    try {
      const res = await fetch("/api/nexus/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: messageText,
          model: homeModel,
          focusProjectId: homeFocus,
          mode: homeMode,
          imageBase64,
          imageMimeType,
          conversationId: activeConversationId,
          projectContext: {
            projectId: mostRecentActiveProjectId,
            memorySummary: homeProjectState.memorySummary,
            decisions: homeProjectState.decisions,
          },
        }),
      });
      if (!res.ok) {
        const errText = res.status === 413 ? "Images are too large to send. Try fewer or smaller images." : "Something went wrong. Try again.";
        toast(errText);
        // Restore the input so she doesn't lose her message
        setInput(text);
        setAttachedFiles(files);
        return;
      }
      appendUserMessageIfMissing();
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let streamedText = "";

      // Add a streaming message bubble immediately
      setHomeMessages(prev => [...prev, { role: 'assistant', content: '', model: homeModel, intentType: null, isNew: true, id: streamingId, streaming: true, createdAt: new Date().toISOString() }]);


      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          let evtName = "";
          let evtData = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) evtName = line.slice(7).trim();
            else if (line.startsWith("data: ")) evtData = line.slice(6);
          }
          if (!evtData) continue;
          try {
            if (evtName === "token") {
              const token = JSON.parse(evtData) as string;
              streamedText += token;
              setHomeMessages(prev => prev.map(m =>
                (m as any).id === streamingId ? { ...m, content: streamedText } : m
              ));
            } else if (evtName === "step") {
              const step = JSON.parse(evtData) as { verb?: string; target?: string; status?: "ok" | "warn" | "fail" };
              if (step?.verb) setLiveStep({ verb: step.verb, target: step.target, status: step.status });
            } else if (evtName === "done") {
              const meta = JSON.parse(evtData) as {
                memoryUpdated: boolean; detectedMode: string; handoffSignal?: HomeHandoffSignal;
                executionTimeMs?: number; inputTokens?: number; outputTokens?: number; costUsd?: number;
                execution_time_ms?: number; input_tokens?: number; output_tokens?: number; cost_usd?: number;
                runStatus?: RunStatus; run_status?: RunStatus;
                runSummary?: string; run_summary?: string;
                runActions?: RunAction[]; run_actions?: RunAction[];
                runArtifacts?: RunArtifact[]; run_artifacts?: RunArtifact[];
                surface?: AmbientSurface;
              };
              const plan = detectPlanFromText(streamedText);
              const metrics = {
                executionTimeMs: meta.executionTimeMs ?? meta.execution_time_ms ?? null,
                inputTokens: meta.inputTokens ?? meta.input_tokens ?? null,
                outputTokens: meta.outputTokens ?? meta.output_tokens ?? null,
                costUsd: meta.costUsd ?? (meta.cost_usd != null ? Number(meta.cost_usd) : null),
              };
              const runFields = {
                runStatus: (meta.runStatus ?? meta.run_status ?? "completed") as RunStatus,
                runSummary: meta.runSummary ?? meta.run_summary ?? null,
                runActions: meta.runActions ?? meta.run_actions ?? null,
                runArtifacts: meta.runArtifacts ?? meta.run_artifacts ?? null,
              };
              setHomeMessages(prev => prev.map(m =>
                (m as any).id === streamingId ? { ...m, streaming: false, handoffSignal: meta.handoffSignal, surface: meta.surface ?? null, ...metrics, ...runFields, ...(plan ? { plan } : {}) } : m
              ));
              if (meta.handoffSignal?.projectName) setHandoffProjectName(meta.handoffSignal.projectName);
              if (meta.detectedMode === "deep-dive" && homeMessages.length + 2 >= 4) setShowHandoff(true);
            } else if (evtName === "error") {
              const errMsg = JSON.parse(evtData) as string;
              setHomeMessages(prev => prev.map(m =>
                (m as any).id === streamingId
                  ? { ...m, content: errMsg || "Something went wrong. Tap send again.", streaming: false, runStatus: "failed" as RunStatus, errorMessage: errMsg || "Unknown error" }
                  : m
              ));
            }
          } catch {}
        }
      }
    } catch {
      setHomeMessages(prev => prev.map(m =>
        (m as any).id === streamingId
          ? { ...m, streaming: false, runStatus: "failed" as RunStatus, errorMessage: "Connection dropped during run. Tap send again to retry." }
          : m
      ));
      toast("Connection error. Your message was not lost — tap send again.");
      setInput(text);
      setAttachedFiles(files);
    } finally {
      setIsAtlasStreaming(false);
      setIsSending(false);
      setLiveStep(null);
      document.body.dataset.voiceActive = "false";
    }
  }, [input, attachedFiles, isSending, homeModel, homeFocus, projects, activeConversationId, homeMessages.length, mostRecentActiveProjectId, homeProjectState.memorySummary, homeProjectState.decisions]);


  const handleHandoff = useCallback(async (signal?: HomeHandoffSignal, projectNameOverride?: string, plan?: Plan) => {
    if (!homeMessages.length) return;
    setHandoffLoading(true);
    setHandoffStage("Setting up your workspace...");
    try {
      let name = (projectNameOverride || signal?.projectName || "").trim();
      const DEFAULT_PROJECT_NAMES = new Set(["New Project", "New Idea", "My Project", ""]);
      if (DEFAULT_PROJECT_NAMES.has(name)) {
        const lastUserMsg = [...homeMessages].reverse().find(m => m.role === "user");
        if (lastUserMsg?.content) {
          try {
            const nameRes = await fetch("/api/nexus/name", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ message: lastUserMsg.content }),
            });
            if (nameRes.ok) {
              const nameData = await nameRes.json() as { name?: string };
              if (nameData.name?.trim()) name = nameData.name.trim();
            }
          } catch {}
        }
        if (!name) name = "New Project";
      }
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const project = await createRes.json();
      if (!createRes.ok || !project.id) throw new Error(project?.error ?? "Project creation failed");
      const projectId = Number(project.id);
      setActiveProjectId(projectId);
      const transcriptMessages = homeMessages.slice(-20).map(({ role, content }) => ({ role, content }));
      const transcript = transcriptMessages.map(m => `${m.role === "user" ? "User" : "Atlas"}: ${m.content}`).join("\n\n");
      const summary = signal?.reason || transcriptMessages.map(m => m.content).join(" ").slice(0, 800);

      setHandoffStage("Loading your conversation...");
      await fetch(`/api/projects/${projectId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tier: "episodic", summary, messages: transcriptMessages }),
      }).catch(() => {});

      setHandoffStage("Mapping your ideas...");
      const forgeRes = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ transcript, projectId, moscow: true }),
      });
      const forgeData = forgeRes.ok
        ? await forgeRes.json() as { nodes?: Array<{ id: string; label: string; type: string; x: number; y: number; resolved?: boolean; meta?: string; moscow?: string; details?: string; question?: string }> }
        : { nodes: [] };
      const nodes = (forgeData.nodes ?? []).map(n => ({ ...n, resolved: Boolean(n.resolved) }));
      const goal = nodes.find(n => n.type === "goal") ?? nodes[0];
      const edges = goal
        ? nodes.filter(n => n.id !== goal.id).map(n => ({ id: `e-${goal.id}-${n.id}`, from: goal.id, to: n.id }))
        : [];
      try {
        localStorage.setItem(`axiom-flow-nodes-${projectId}`, JSON.stringify(nodes));
        localStorage.setItem(`axiom-flow-nodes-${projectId}-edges`, JSON.stringify(edges));
      } catch {}
      const nodeState = Object.fromEntries(nodes.map(n => [n.id, {
        resolved: Boolean(n.resolved),
        label: n.label,
        type: n.type,
        x: n.x,
        y: n.y,
        ...(n.details ? { details: n.details } : {}),
        ...(n.meta ? { meta: n.meta } : {}),
        ...(n.moscow ? { moscow: n.moscow } : {}),
        ...(n.question ? { question: n.question } : {}),
      }]));
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nodeState }),
      }).catch(() => {});

      const ideaTexts = transcriptMessages
        .filter(m => m.role === "user" && m.content.trim().length > 20)
        .slice(-4)
        .map(m => m.content.replace(/\s+/g, " ").trim());
      await Promise.all(ideaTexts.map((idea, idx) => fetch(`/api/projects/${projectId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: idea.slice(0, 80),
          summary: idea.slice(0, 500),
          status: "parked",
          severity: "parked",
          mode: "home",
          verb: idx === 0 ? "home_handoff" : "idea",
        }),
      }).catch(() => null)));

      setHandoffStage("Ready.");
      try {
        sessionStorage.setItem(`atlas-home-handoff-${projectId}`, JSON.stringify({
          parkedCount: ideaTexts.length,
          flowNodeCount: nodes.length,
          goalLabel: goal?.label ?? "your goal",
          nodes: nodes.map(n => ({ id: n.id, label: n.label, type: n.type, details: n.details, meta: n.meta, moscow: n.moscow })),
          parkedTitles: ideaTexts.map(idea => idea.slice(0, 80)),
        }));
        sessionStorage.setItem("atlas-open-tab", "map");
        if (plan) {
          sessionStorage.setItem(`atlas-home-plan-${projectId}`, JSON.stringify(plan));
        }
      } catch {}

      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setLocation(`/project/${projectId}?source=home-handoff`);
      return;
    } catch {
      toast("Handoff failed — try again");
    } finally {
      setHandoffLoading(false);
      setHandoffStage("");
    }
  }, [homeMessages, queryClient, setActiveProjectId, setLocation]);

  const handleAmbientSurfaceAction = useCallback(async (surface: NonNullable<AmbientSurface>) => {
    if (surface.type === "MAP") {
      openOverviewSheet();
      return;
    }

    const activeProjectId = surface.projectId ?? surface.workspaceId ?? homeProjectState.project?.id ?? mostRecentActiveProjectId;

    if (surface.type === "WORKSPACE") {
      if (activeProjectId) {
        setLocation(`/project/${activeProjectId}`);
        return;
      }
      await handleHandoff(undefined, surface.label || "New Project");
      return;
    }

    if (surface.type === "DECISION") {
      if (!activeProjectId) return;
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: surface.label,
            status: "committed",
            severity: "committed",
            summary: "Logged from Atlas surface signal",
          }),
        });
        if (res.ok) {
          toast("Decision captured");
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        }
      } catch {
        // Surface actions stay ambient; failures should not interrupt the thread.
      }
    }
  }, [handleHandoff, homeProjectState.project?.id, mostRecentActiveProjectId, openOverviewSheet, queryClient, setLocation]);

  const handleClearThread = useCallback(async () => {
    await fetch(`/api/nexus/thread?conversationId=${encodeURIComponent(activeConversationId)}`, { method: "DELETE", credentials: "include" }).catch(() => {});
    setHomeMessages([]);
    setReviewingPlanIds(new Set());
    setShowClearConfirm(false);
    toast("Conversation cleared");
  }, [activeConversationId]);

  const handleNewConversation = useCallback(() => {
    const newId = crypto.randomUUID();
    try { localStorage.setItem("atlas-home-conversation-id", newId); } catch {}
    try { sessionStorage.setItem("atlas-home-conversation-id", newId); } catch {}
    setActiveConversationId(newId);
    setHomeMessages([]);
    setReviewingPlanIds(new Set());
    setShowHistory(false);
  }, []);

  const handleOpenHistory = useCallback(async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/nexus/conversations", { credentials: "include" });
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {} finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleSwitchConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/nexus/thread?conversationId=${encodeURIComponent(id)}`, { credentials: "include" });
      const msgs = await res.json() as Array<{ role: string; content: string }>;
      const normalizedMessages = Array.isArray(msgs)
        ? normalizeLoadedHomeMessages(msgs, (message, index) => {
            const plan = message.role === "assistant" ? detectPlanFromText(message.content) : null;
            return {
              role: message.role,
              content: message.content,
              id: `${id}-history-${index}`,
              ...(plan ? { plan } : {}),
            };
          })
        : [];

      if (normalizedMessages.length > 0) {
        setHomeMessages(normalizedMessages);
        setActiveConversationId(id);
        setReviewingPlanIds(new Set());
        try { localStorage.setItem("atlas-home-conversation-id", id); } catch {}
        try { sessionStorage.setItem("atlas-home-conversation-id", id); } catch {}
      } else {
        setHomeMessages([]);
        setActiveConversationId(id);
        setReviewingPlanIds(new Set());
        try { localStorage.setItem("atlas-home-conversation-id", id); } catch {}
        try { sessionStorage.setItem("atlas-home-conversation-id", id); } catch {}
      }
      setShowHistory(false);
    } catch {}
  }, [setActiveConversationId]);

  const handleDownloadThread = useCallback(() => {
    if (homeMessages.length === 0) return;
    const lines = homeMessages
      .map(m => `## ${m.role === 'user' ? 'You' : 'Atlas'}\n${m.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([`# Atlas Conversation\n${new Date().toLocaleDateString()}\n\n---\n\n${lines}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [homeMessages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Issue found: Enter submits were a no-op, and the send button was gated by project loading instead of chat sending.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    const currentH = parseFloat(el.style.height) || 0;
    // Only collapse to auto when shrinking — avoids the flash-collapse on every keystroke
    if (el.scrollHeight < currentH) {
      el.style.height = "auto";
    }
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const hasInput = input.trim().length > 0;

  return (
    <div
      className="atlas-home-bg"
      style={{
        height: "100vh",
        backgroundColor: "var(--atlas-bg)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* ATLAS subheader — always-visible bar beneath main header */}
      {homeMessages.length > 0 && (() => {
        const firstUserMsg = homeMessages.find(m => m.role === "user");
        const rawTitle = (firstUserMsg?.content ?? "").trim().replace(/\s+/g, " ");
        const conversationTitle = rawTitle
          ? (rawTitle.length > 38 ? rawTitle.slice(0, 36).trimEnd() + "…" : rawTitle)
          : "New conversation";
        return (
        <div className="atlas-chat-card-top" style={{ borderRadius: 0, padding: "5px 16px", zIndex: 20, position: "sticky", top: 50, height: 36, boxSizing: "border-box" }}>
          {/* Centered: conversation title + caret (opens thread menu) + lock */}
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex", alignItems: "center", gap: 6,
            pointerEvents: "auto", maxWidth: "60%",
          }}>
            <button
              onClick={() => setShowChatMenu(v => !v)}
              title="Conversation actions"
              aria-label="Conversation actions"
              style={{
                background: showChatMenu ? "rgba(201,162,76,0.10)" : "transparent",
                border: "none", padding: "3px 8px", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 5,
                borderRadius: 6, transition: "background 140ms",
                maxWidth: "100%", overflow: "hidden",
              }}
            >
              <span style={{
                fontSize: "var(--ts-label)", fontFamily: "var(--app-font-sans)",
                color: "var(--atlas-fg)", opacity: 0.85, fontWeight: 400,
                letterSpacing: "-0.005em",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                maxWidth: "100%",
              }}>
                {conversationTitle}
              </span>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--atlas-muted)", opacity: 0.7, flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <button
              onClick={handleLockTap}
              title={reflectionLocked ? "Reflection mode (locked)" : "Enter reflection mode"}
              aria-label="Toggle reflection mode"
              style={{
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                color: "var(--atlas-gold)",
                opacity: reflectionLocked ? 1 : 0.45,
                lineHeight: 0, display: "inline-flex", transition: "opacity 160ms",
                flexShrink: 0,
              }}
            >
              {reflectionLocked ? (
                <Lock size={10} strokeWidth={2} />
              ) : (
                <LockOpen size={10} strokeWidth={2} />
              )}
            </button>
            {/* Thread menu — drops from title */}
            {showChatMenu && (
              <>
                <div onClick={() => setShowChatMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", zIndex: 50, background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)", borderRadius: 10, padding: "4px 0", minWidth: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}>
                  {([
                    { label: "Rename", action: () => { setShowChatMenu(false); /* TODO: open rename */ } },
                    { label: "Conversation history", action: () => { handleOpenHistory(); setShowChatMenu(false); } },
                    { label: "New conversation", action: () => { handleNewConversation(); setShowChatMenu(false); } },
                    { label: "Download", action: () => { handleDownloadThread(); setShowChatMenu(false); } },
                    { label: "Clear conversation", action: () => { setShowClearConfirm(true); setShowChatMenu(false); }, danger: true },
                  ] as Array<{ label: string; action: () => void; danger?: boolean }>).map(item => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      style={{ display: "flex", width: "100%", background: "transparent", border: "none", padding: "9px 14px", cursor: "pointer", fontSize: "var(--ts-label)", fontFamily: "var(--app-font-mono)", color: item.danger ? "rgba(239,68,68,0.8)" : "var(--atlas-fg)", letterSpacing: "0.04em", textAlign: "left" }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Right-side utility cluster */}
          <div style={{ marginLeft: "auto", position: "relative" }}>
            {showClearConfirm ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", color: "rgba(239,68,68,0.65)", letterSpacing: "0.04em" }}>Clear conversation?</span>
                <button
                  onClick={handleClearThread}
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, padding: "3px 9px", fontSize: "var(--ts-micro)", color: "rgba(252,165,165,0.9)", cursor: "pointer", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}
                >
                  Clear
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{ background: "transparent", border: "none", padding: "3px 6px", fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  onClick={() => setShowVault(true)}
                  title="Visual Vault"
                  aria-label="Open visual vault"
                  style={{ background: "transparent", border: "none", padding: "4px 6px", cursor: "pointer", color: "var(--atlas-gold)", opacity: 0.6, lineHeight: 0, transition: "opacity 140ms", display: "inline-flex" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setShowConvSearch(v => {
                      const next = !v;
                      if (!next) setConvSearchQuery("");
                      return next;
                    });
                  }}
                  title="Search conversations"
                  aria-label="Search conversations"
                  data-conv-search-root
                  style={{ background: showConvSearch ? "rgba(201,162,76,0.12)" : "transparent", border: "none", padding: "4px 6px", cursor: "pointer", color: "var(--atlas-gold)", opacity: showConvSearch ? 1 : 0.7, lineHeight: 0, transition: "opacity 140ms, background 140ms", display: "inline-flex", borderRadius: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = showConvSearch ? "1" : "0.7")}
                >
                  <Search size={14} strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => setShowBriefingPanel(true)}
                  title="Show briefing"
                  aria-label="Show briefing"
                  style={{ background: "transparent", border: "none", padding: "4px 6px", cursor: "pointer", color: "var(--atlas-gold)", opacity: 0.7, lineHeight: 0, transition: "opacity 140ms", display: "inline-flex" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                >
                  <Briefcase size={13} strokeWidth={1.75} />
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Conversation search bar + results — slides below subheader */}
      {showConvSearch && homeMessages.length > 0 && (
        <div data-conv-search-root style={{ position: "sticky", top: 86, zIndex: 30, padding: "10px 14px 0", background: "var(--atlas-bg)", borderBottom: "1px solid var(--atlas-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)", borderRadius: 8, padding: "7px 10px" }}>
            <Search size={13} strokeWidth={1.75} color="var(--atlas-muted)" />
            <input
              autoFocus
              value={convSearchQuery}
              onChange={(e) => setConvSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-body)" }}
            />
            <button
              onClick={() => { setShowConvSearch(false); setConvSearchQuery(""); }}
              aria-label="Close search"
              style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer", color: "var(--atlas-muted)", fontSize: "var(--ts-md)", lineHeight: 1, opacity: 0.6 }}
            >
              ×
            </button>
          </div>
          <div style={{ marginTop: 6, marginBottom: 10, maxHeight: 300, overflowY: "auto", background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }}>
            {convSearchLoading ? (
              <div style={{ padding: "14px 12px", fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.6, textAlign: "center", letterSpacing: "0.06em" }}>
                Searching…
              </div>
            ) : convSearchResults.length === 0 ? (
              <div style={{ padding: "14px 12px", fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.6, textAlign: "center", letterSpacing: "0.04em" }}>
                {convSearchQuery.trim()
                  ? `Nothing matching '${convSearchQuery.trim()}'`
                  : "No conversations found."}
              </div>
            ) : (
              convSearchResults.map((c) => {
                const snippet = (c.title ?? "").slice(0, 60) + ((c.title ?? "").length > 60 ? "…" : "");
                const ago = (() => {
                  const ms = Date.now() - new Date(c.createdAt).getTime();
                  const s = Math.floor(ms / 1000);
                  if (s < 60) return `${s}s ago`;
                  const m = Math.floor(s / 60);
                  if (m < 60) return `${m}m ago`;
                  const h = Math.floor(m / 60);
                  if (h < 24) return `${h}h ago`;
                  const d = Math.floor(h / 24);
                  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
                  const mo = Math.floor(d / 30);
                  if (mo < 12) return `${mo}mo ago`;
                  return `${Math.floor(mo / 12)}y ago`;
                })();
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      try { sessionStorage.setItem("atlas-home-conversation-id", c.id); } catch {}
                      setActiveConversationId(c.id);
                      setShowConvSearch(false);
                      setConvSearchQuery("");
                    }}
                    style={{ display: "flex", width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 3, background: "transparent", border: "none", borderBottom: "1px solid var(--atlas-border)", padding: "10px 12px", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-fg)", fontFamily: "var(--app-font-sans)", lineHeight: 1.4 }}>
                      {snippet || "Untitled conversation"}
                    </div>
                    <div style={{ fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.6, letterSpacing: "0.05em" }}>
                      {ago}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}


      {/* First-run overlay — new users with no projects, once per session */}
      {showShredChoice && (
        <div
          onClick={() => setShowShredChoice(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 60, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)",
            animation: "fadeIn 160ms ease forwards",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--atlas-surface)",
              border: "1px solid rgba(201,162,76,0.45)",
              borderRadius: 12, padding: "20px 22px",
              minWidth: 260, maxWidth: "85vw",
              boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "var(--ts-md)", color: "var(--atlas-fg)", lineHeight: 1.5, marginBottom: 16, fontFamily: "var(--app-font-sans)" }}>
              Keep this conversation<br />or let it go?
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={handleKeepIt}
                style={{
                  background: "transparent", border: "1px solid rgba(201,162,76,0.4)",
                  borderRadius: 6, padding: "7px 14px", cursor: "pointer",
                  fontSize: "var(--ts-label)", color: "var(--atlas-gold)",
                  fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em",
                }}
              >Keep it</button>
              <button
                onClick={handleShredIt}
                style={{
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 6, padding: "7px 14px", cursor: "pointer",
                  fontSize: "var(--ts-label)", color: "rgba(252,165,165,0.95)",
                  fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em",
                }}
              >Shred it</button>
            </div>
          </div>
        </div>
      )}

      {showOverlay && (
        <FirstRunOverlay
          loading={isLoading}
          onSpecMode={() => {
            createProject.mutate({ data: { name: "My Project" } }, {
              onSuccess: (p) => {
                dismissOverlay();
                queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
                sessionStorage.setItem("atlas-open-tab", "map");
                setLocation(`/project/${p.id}`);
              },
            });
          }}
          onWorkspace={() => {
            createProject.mutate({ data: { name: "My Project" } }, {
              onSuccess: (p) => {
                dismissOverlay();
                queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
                setLocation(`/project/${p.id}`);
              },
            });
          }}
          onDismiss={dismissOverlay}
        />
      )}

      {/* Main content */}
      <div
        className="atlas-home-responsive-shell"
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <UnifiedConversationSurface
          mode={homeMessages.length > 0 ? "active" : "ambient"}
          hostShell={({ stream }) => (
            <div className="atlas-home-chat-column">
              <div className="atlas-home-chat-inner" style={{ width: "100%", maxWidth: 560, paddingBottom: "var(--atlas-dock-clearance)" }}>
                {stream}
              </div>
            </div>
          )}
          streamSlot={<>

          {/* Hero — fills the viewport above the mobile nav, content vertically centered */}
          <div style={{ minHeight: homeMessages.length > 0 ? 0 : "calc(100svh - var(--atlas-header-height) - env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", justifyContent: homeMessages.length > 0 ? "flex-start" : "center", position: "relative", paddingBottom: homeMessages.length > 0 ? 0 : "var(--atlas-dock-clearance)" }}>
            {/* Atmospheric pulse — behind everything, theme-aware */}
            <div className="atlas-home-atmosphere" style={{
              position: "absolute",
              top: "38%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "110%",
              height: 340,
              filter: "blur(28px)",
              pointerEvents: "none",
              animation: "homePurpleAtmosphere 7s ease-in-out infinite",
              zIndex: 0,
            }} />

            {/* Greeting */}
            {homeMessages.length === 0 && (
              <div style={{ textAlign: "center", marginBottom: 24, marginTop: 72, position: "relative", zIndex: 1 }}>
                <h1 style={{ fontSize: "var(--ts-display-xl)", fontWeight: 300, color: "var(--atlas-fg)", letterSpacing: "-0.025em", lineHeight: 1.2, opacity: 0.85, margin: "0 0 10px" }}>
                  {greetingNameRef.current && (
                    <><span style={{ fontWeight: 300 }}>{greetingNameRef.current}.</span><br /></>
                  )}
                  {greetingPhraseRef.current}
                </h1>
                <p style={{ fontSize: "var(--ts-body)", color: "var(--atlas-muted)", opacity: 0.55, margin: 0, fontStyle: "italic" }}>
                  I'm here. What's on your mind?
                </p>
              </div>
            )}

            {/* Chat thread */}
            <div style={{ margin: homeMessages.length > 0 ? "6px 0 26px" : "18px 0 26px", minHeight: homeMessages.length > 0 ? 60 : 0 }}>
              {homeMessages.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(180,83,9,0.18), transparent)" }} />
                </div>
              )}
            {homeMessages.length === 0 && !isAtlasStreaming && !threadLoading ? (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 10, opacity: 0.7, animation: "fadeIn 600ms ease forwards" }}>
                <LoadingSpinner size="sm" color="atlas" />
              </div>
            ) : homeMessages.length === 0 && !isAtlasStreaming ? (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <LoadingSpinner size="sm" color="atlas" />
              </div>
            ) : (
              <div>
                {/* Messages */}
                <div
                  ref={chatScrollRef}
                  className="atlas-home-chat-messages-scroll"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
                  }}
                  style={{
                    display: "flex", flexDirection: "column", gap: 12,
                    maxHeight: "min(55vh, 360px)", overflowY: "auto", overflowX: "hidden",
                    scrollbarWidth: "none", msOverflowStyle: "none",
                    paddingRight: 4, position: "relative",
                    border: reflectionLocked ? "0.5px solid rgba(201,162,76,0.15)" : undefined,
                    borderRadius: reflectionLocked ? 8 : undefined,
                    padding: reflectionLocked ? "10px 12px" : undefined,
                    transition: "border-color 200ms",
                  }}
                >
                  {showGoneFlash && homeMessages.length === 0 && (
                    <div style={{ textAlign: "center", padding: "24px 0", fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.6, letterSpacing: "0.08em", animation: "fadeOut 1500ms ease forwards" }}>
                      Gone.
                    </div>
                  )}
                  {homeMessages.map((msg, i) => (
                    <Fragment key={i}>
                      {loadedHistoryCount > 0 && i === loadedHistoryCount && homeMessages.length > loadedHistoryCount && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0", opacity: 0.3 }}>
                          <div style={{ flex: 1, height: 1, background: "var(--atlas-border)" }} />
                          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", letterSpacing: "0.14em", color: "var(--atlas-muted)", textTransform: "lowercase" }}>
                            — earlier —
                          </span>
                          <div style={{ flex: 1, height: 1, background: "var(--atlas-border)" }} />
                        </div>
                      )}
                    <div data-msg-idx={i} style={{ display: "flex", flexDirection: msg.role === 'user' ? "row-reverse" : "row", alignItems: "flex-start", gap: 6, animation: isShredding ? `atlas-shred 600ms ${i * 80}ms ease-in forwards` : "fadeIn 250ms ease forwards" }}>
                      {msg.role === 'assistant' ? (
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {/* Model label + intent badge */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                            <span style={{
                              fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                              textTransform: "uppercase", opacity: 0.45,
                              color: msg.model === "gpt4o" ? "#10a37f" : msg.model === "gemini" ? "#4285f4" : "var(--atlas-gold)",
                            }}>Atlas</span>
                            {msg.intentType && (
                              <span style={{
                                fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                                padding: "1px 6px", borderRadius: 3,
                                background: msg.intentType === "BUILD" ? "rgba(74,222,128,0.1)" : "rgba(201,162,76,0.1)",
                                border: `1px solid ${msg.intentType === "BUILD" ? "rgba(74,222,128,0.25)" : "rgba(201,162,76,0.25)"}`,
                                color: msg.intentType === "BUILD" ? "#4ade80" : "var(--atlas-gold)",
                              }}>{msg.intentType}</span>
                            )}
                          </div>
                          {/* Bubble */}
                          <div style={{
                            padding: "4px 0",
                            background: "transparent",
                            border: "none",
                            fontSize: "var(--ts-body)", lineHeight: 1.65, color: "var(--atlas-fg)",
                            fontFamily: "var(--app-font-sans)",
                          }}>
                            <HomeChunkedBubbles text={msg.content} isNew={!!msg.isNew} />
                          </div>
                          {!msg.streaming && (
                            <AmbientEmergenceCard
                              surface={msg.surface ?? null}
                              onAction={handleAmbientSurfaceAction}
                            />
                          )}
                          {msg.plan && !msg.streaming && (() => {
                            const planKey = msg.id ?? `home-plan-${i}`;
                            const isExpanded = reviewingPlanIds.has(planKey);
                            return (
                              <PlanCard
                                plan={msg.plan}
                                messageId={i}
                                projectId={homeFocus ?? 0}
                                displayMode="home"
                                isExecuting={false}
                                isExpanded={isExpanded}
                                onReview={() => {
                                  setReviewingPlanIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(planKey)) next.delete(planKey);
                                    else next.add(planKey);
                                    return next;
                                  });
                                }}
                                onSkip={() => {}}
                                onApprove={() => {}}
                                onTakeToWorkspace={() => void handleHandoff(
                                  msg.handoffSignal,
                                  handoffProjectName || msg.handoffSignal?.projectName || msg.plan?.title || "New Project",
                                  msg.plan
                                )}
                              />
                            );
                          })()}
                          {msg.handoffSignal && i === firstHandoffMessageIndex && !handoffCardDismissed && !msg.streaming && (
                            <HomeHandoffCard
                              signal={msg.handoffSignal}
                              projectName={handoffProjectName || msg.handoffSignal.projectName || "New Project"}
                              projectId={msg.handoffSignal.projectId ?? mostRecentActiveProjectId}
                              onProjectNameChange={setHandoffProjectName}
                              loading={handoffLoading}
                              stage={handoffStage}
                              onStart={() => void handleHandoff(msg.handoffSignal, handoffProjectName || msg.handoffSignal?.projectName || "New Project")}
                              onDismiss={() => {
                                try { sessionStorage.setItem(`atlas-home-handoff-dismissed-${activeConversationId}`, "1"); } catch {}
                                setHandoffCardDismissed(true);
                              }}
                            />
                          )}
                          {/* Copy button */}
                          {msg.content && (
                            <button
                              title={copiedMsgIdx === i ? "Copied!" : "Copy"}
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content).catch(() => {});
                                setCopiedMsgIdx(i);
                                setTimeout(() => setCopiedMsgIdx(prev => prev === i ? null : prev), 1800);
                              }}
                              style={{
                                background: "transparent", border: "none", padding: "3px 2px", cursor: "pointer",
                                opacity: copiedMsgIdx === i ? 0.9 : 0.28,
                                color: copiedMsgIdx === i ? "var(--atlas-gold)" : "var(--atlas-muted)",
                                lineHeight: 1, transition: "opacity 140ms, color 140ms", marginTop: 3,
                              }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = "0.65")}
                              onMouseLeave={e => (e.currentTarget.style.opacity = copiedMsgIdx === i ? "0.9" : "0.28")}
                            >
                              {copiedMsgIdx === i ? (
                                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l4 4 6-7"/></svg>
                              ) : (
                                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="1" width="10" height="13" rx="1.5"/><path d="M3 3H2a1 1 0 00-1 1v11a1 1 0 001 1h10a1 1 0 001-1v-1"/></svg>
                              )}
                            </button>
                          )}
                          {msg.createdAt && !msg.streaming && (
                            <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", letterSpacing: "0.08em", color: "var(--atlas-muted)", opacity: 0.45, marginTop: 4, textTransform: "lowercase" }}>
                              {formatMessageTime(msg.createdAt)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "80%", gap: 3 }}>
                          <div style={{
                            padding: "9px 13px", borderRadius: "12px 12px 4px 12px",
                            background: "rgba(201,162,76,0.12)",
                            border: "0.5px solid rgba(201,162,76,0.3)",
                            fontSize: "var(--ts-body)", lineHeight: 1.55, color: "var(--atlas-fg)",
                            fontFamily: "var(--app-font-sans)",
                          }}>
                            {msg.imageUrl && (
                              <img
                                src={msg.imageUrl}
                                alt="Attached"
                                style={{
                                  maxWidth: "100%", borderRadius: 8, display: "block",
                                  marginBottom: msg.content ? 8 : 0,
                                  maxHeight: 320, objectFit: "cover",
                                }}
                              />
                            )}
                            {msg.content}
                          </div>
                          {msg.createdAt && (
                            <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", letterSpacing: "0.08em", color: "var(--atlas-muted)", opacity: 0.45, textTransform: "lowercase" }}>
                              {formatMessageTime(msg.createdAt)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    </Fragment>
                  ))}

                  {/* Thinking indicator */}
                  {isAtlasStreaming && (
                    <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 6, animation: "fadeIn 200ms ease forwards" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.4, marginBottom: 6 }}>
                          Atlas
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <LoadingSpinner size="sm" color="atlas" />
                          {liveStep ? (
                            <span
                              key={`step-${liveStep.verb}-${liveStep.target ?? ""}`}
                              style={{
                                fontFamily: "var(--app-font-mono)",
                                fontSize: "var(--ts-micro)",
                                letterSpacing: "0.05em",
                                animation: "fadeIn 320ms ease",
                                display: "inline-flex",
                                alignItems: "baseline",
                                gap: 6,
                              }}
                            >
                              <span style={{
                                color: liveStep.status === "warn" ? "var(--atlas-gold)"
                                  : liveStep.status === "fail" ? "#e25b5b"
                                  : "var(--atlas-fg)",
                                opacity: 0.9,
                                fontWeight: 500,
                              }}>
                                {liveStep.verb}
                              </span>
                              {liveStep.target && (
                                <span style={{ color: "var(--atlas-muted)", opacity: 0.75 }}>
                                  {liveStep.target}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span
                              key={pendingPhraseIdx}
                              style={{
                                fontFamily: "var(--app-font-mono)",
                                fontSize: "var(--ts-micro)",
                                color: "var(--atlas-muted)",
                                letterSpacing: "0.07em",
                                opacity: 0.7,
                                animation: "fadeIn 360ms ease",
                                display: "inline-block",
                              }}
                            >
                              {HOME_PENDING_PHRASES[pendingPhraseIdx]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {showScrollBtn && (
                    <button
                      onClick={() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" })}
                      style={{
                        position: "sticky",
                        bottom: 8,
                        alignSelf: "center",
                        zIndex: 10,
                        background: "var(--atlas-surface)",
                        border: "1px solid var(--atlas-gold)",
                        borderRadius: 20,
                        padding: "6px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--atlas-gold)",
                        fontSize: "var(--ts-label)",
                        fontFamily: "var(--app-font-mono)",
                        cursor: "pointer",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      <span style={{ fontSize: "var(--ts-md)", lineHeight: 1 }}>↓</span> latest
                    </button>
                  )}
                  <div ref={messagesEndRef} />

                </div>
              </div>
            )}
          </div>

          {/* Continuity strip — moved below; anchors above quick-action pills */}


          {/* Input shell */}
          <div className="atlas-input-shell" style={{ position: "relative", padding: "18px 20px 14px" }}>
            {homeMessages.length > 0 && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: -48,
                  left: 0,
                  right: 0,
                  height: 48,
                  background: "linear-gradient(to bottom, transparent 0%, var(--atlas-bg) 100%)",
                  pointerEvents: "none",
                }}
              />
            )}
            {/* Hidden file input — uses id so label can trigger it natively on mobile */}
            <input
              ref={fileInputRef}
              id="home-file-input"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              style={{ position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none", overflow: "hidden" }}
              multiple
              onChange={(e) => {
                const incoming = Array.from(e.target.files ?? []);
                const combined = [...attachedFiles, ...incoming].slice(0, 10);
                if (incoming.length + attachedFiles.length > 10) {
                  toast("Max 10 images at a time");
                }
                setAttachedFiles(combined);
                e.target.value = "";
              }}
            />

            {/* Attached files preview strip */}
            {attachedFiles.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 2, flexShrink: 0 }}>
                {attachedFiles.map((file, idx) => (
                  <div key={idx} style={{ position: "relative", flexShrink: 0 }}>
                    {file.type.startsWith("image/") ? (
                      <img
                        src={filePreviewUrls.current.get(file)}
                        alt={file.name}
                        style={{ width: 54, height: 54, borderRadius: 7, objectFit: "cover", border: "1px solid rgba(201,162,76,0.25)", display: "block" }}
                      />
                    ) : (
                      <div style={{ width: 54, height: 54, borderRadius: 7, background: "rgba(201,162,76,0.07)", border: "1px solid rgba(201,162,76,0.2)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, overflow: "hidden" }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 7.5l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" stroke="rgba(201,162,76,0.6)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span style={{ fontSize: "var(--ts-tiny)", color: "rgba(201,162,76,0.55)", maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em" }}>{file.name.split(".").pop()?.toUpperCase() ?? "FILE"}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                      style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%", background: "var(--atlas-bg)", border: "1px solid rgba(201,162,76,0.3)", cursor: "pointer", color: "var(--atlas-fg)", fontSize: "var(--ts-micro)", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, zIndex: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ position: "relative" }}>
              {!hasInput && !inputFocused && (homeMessages.length === 0 || reflectionLocked) && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 44,
                    zIndex: 2,
                    color: "var(--atlas-muted)",
                    fontSize: "var(--ts-h3)",
                    lineHeight: 1.55,
                    opacity: typewriterPaused ? 0.4 : 0.65,
                    cursor: "text",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    fontFamily: "var(--app-font-sans)",
                    transition: "opacity 160ms ease",
                    pointerEvents: "none",
                  }}
                >
                  {reflectionLocked ? "This stays between us..." : placeholder}
                  {!reflectionLocked && !typewriterPaused && <span className="atlas-cursor" />}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(); if (createError) setCreateError(null); }}
                onKeyDown={handleKeyDown}
                onFocus={() => { setInputFocused(true); setTypewriterPaused(true); }}
                onBlur={() => setInputFocused(false)}
                rows={2}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--atlas-fg)",
                  fontSize: "var(--ts-h3)",
                  lineHeight: 1.6,
                  resize: "none",
                  fontFamily: "var(--app-font-sans)",
                  position: "relative",
                  zIndex: 1,
                  minHeight: 52,
                  maxHeight: 160,
                  overflowY: "hidden",
                  display: "block",
                }}
              />
            </div>

            {/* Bottom action bar */}
            <div style={{ display: "flex", alignItems: "center", marginTop: 12, gap: 2, position: "relative" }}>
              {/* History clock */}
              <button
                onClick={handleOpenHistory}
                title="Conversation history"
                style={{
                  width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none",
                  color: "rgba(120,113,108,0.45)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "color 160ms ease", flexShrink: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--atlas-gold)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(120,113,108,0.45)")}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </button>

              {/* Paperclip — label triggers file input natively; works on mobile Safari */}
              <label
                htmlFor="home-file-input"
                title="Attach image"
                style={{
                  width: 32, height: 32, borderRadius: 8, background: "transparent",
                  color: attachedFiles.length > 0 ? "var(--atlas-gold)" : "rgba(120,113,108,0.45)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "color 160ms ease", flexShrink: 0, userSelect: "none",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M13 7.5l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </label>

              {/* Vault — shown in input bar only on tiny screens */}
              {isTinyScreen && (
                <button
                  title="Visual Vault"
                  onClick={() => setShowVault(true)}
                  style={{
                    width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none",
                    color: "rgba(120,113,108,0.45)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "color 160ms ease", flexShrink: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--atlas-gold)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(120,113,108,0.45)")}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
              )}

              {/* Deep Dive button */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <button
                  onClick={() => setShowDeepDiveMenu(v => !v)}
                  title="Deep Dive — send this conversation to ChatGPT, Perplexity or Gemini"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: showDeepDiveMenu ? "rgba(201,162,76,0.1)" : "transparent",
                    border: showDeepDiveMenu ? "1px solid rgba(201,162,76,0.25)" : "none",
                    color: showDeepDiveMenu ? "var(--atlas-gold)" : "rgba(120,113,108,0.45)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "color 160ms ease, background 160ms ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--atlas-fg)")}
                  onMouseLeave={e => { if (!showDeepDiveMenu) e.currentTarget.style.color = "rgba(120,113,108,0.45)"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="6" r="4" />
                    <path d="M8 10v5M5 13h6" />
                    <path d="M5.5 4.5L3 2M10.5 4.5L13 2" />
                  </svg>
                </button>
                {showDeepDiveMenu && (
                  <>
                  <div onClick={() => setShowDeepDiveMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div
                    className="atlas-popover"
                    style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 60, minWidth: 210 }}
                  >
                    <div style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(201,162,76,0.5)", padding: "4px 10px 6px", borderBottom: "1px solid rgba(201,162,76,0.08)", marginBottom: 4 }}>
                      Deep Dive
                    </div>
                    {([
                      { id: "chatgpt", label: "ChatGPT", sub: "Context auto-fills" },
                      { id: "perplexity", label: "Perplexity", sub: "Context auto-fills" },
                      { id: "gemini", label: "Gemini", sub: deepDiveCopied ? "Copied — paste when it opens" : "Copies context, paste once" },
                    ] as const).map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          const recentMsgs = homeMessages.slice(-5).map((m: {role: string; content: string}) => `${m.role === "user" ? "Me" : "Atlas"}: ${m.content}`).join("\n\n");
                          const current = input.trim();
                          const ctx = [current ? `My question: ${current}` : "", recentMsgs].filter(Boolean).join("\n\n---\n\n").slice(0, 2000);
                          const encoded = encodeURIComponent(ctx);
                          setShowDeepDiveMenu(false);
                          if (p.id === "chatgpt") {
                            window.open(`https://chatgpt.com/?q=${encoded}`, "_blank");
                          } else if (p.id === "perplexity") {
                            window.open(`https://www.perplexity.ai/search?q=${encoded}`, "_blank");
                          } else {
                            navigator.clipboard.writeText(ctx).catch(() => {});
                            setDeepDiveCopied(true);
                            setTimeout(() => setDeepDiveCopied(false), 3000);
                            toast("Opening Gemini", {
                              description: "Your context is copied — just paste it when you arrive.",
                              duration: 4000,
                            });
                            setTimeout(() => window.open("https://gemini.google.com", "_blank"), 2500);
                          }
                        }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          background: "transparent", border: "none",
                          padding: "7px 10px", borderRadius: 5, cursor: "pointer",
                          transition: "background 120ms ease",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,162,76,0.07)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-fg)", fontWeight: 500 }}>{p.label}</div>
                        <div style={{ fontSize: "var(--ts-micro)", color: "var(--atlas-muted)", marginTop: 1, fontFamily: "var(--app-font-mono)" }}>{p.sub}</div>
                      </button>
                    ))}
                  </div>
                  </>
                )}
              </div>

              {/* Center hint — absolutely centered in the input row */}
              {!isTinyScreen && (
                <span style={{
                  position: "absolute", left: "50%", top: "50%",
                  transform: "translate(-50%, -50%)",
                  fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-sm)",
                  letterSpacing: "0.05em", color: "rgba(120,113,108,0.3)",
                  userSelect: "none", pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}>
                  type a message...
                </span>
              )}

              {/* Mic + Send — pinned to right via auto left margin */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                {/* Mic + waveform */}
                <button
                  title={isListening ? "Stop listening" : "Voice input"}
                  onClick={toggleVoice}
                  style={{
                    height: 32, borderRadius: 8, border: "none",
                    background: isListening ? "rgba(201,162,76,0.08)" : "transparent",
                    color: isListening ? "var(--atlas-gold)" : "rgba(120,113,108,0.45)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "0 8px", transition: "color 160ms ease, background 160ms ease", flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { if (!isListening) e.currentTarget.style.color = "var(--atlas-fg)"; }}
                  onMouseLeave={(e) => { if (!isListening) e.currentTarget.style.color = "rgba(120,113,108,0.45)"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="11" rx="3" />
                    <path d="M5 10a7 7 0 0014 0" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  <div className="atlas-waveform" style={{ color: "var(--atlas-gold)" }}>
                    <span /><span /><span />
                  </div>
                </button>

                {/* Send */}
                <button
                  className="atlas-send-btn"
                  onClick={handleSubmit}
                  disabled={isSending}
                  style={{
                    width: 40, height: 40, flexShrink: 0,
                    background: hasInput && !isSending ? "var(--atlas-ember)" : "var(--atlas-surface-alt)",
                    border: hasInput ? "none" : "1px solid var(--atlas-border)",
                    boxShadow: hasInput && !isSending ? "0 0 18px -3px rgba(146,64,14,0.55)" : "none",
                    opacity: isSending ? 0.5 : 1,
                  }}
                >
                  {isSending ? (
                    <LoadingSpinner size="sm" color="ember" />
                  ) : (
                    <svg viewBox="0 0 20 20" width={13} height={13}
                      fill={hasInput ? "var(--atlas-fg)" : "none"}
                      stroke={hasInput ? "var(--atlas-fg)" : "var(--atlas-muted)"}
                      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                    >
                      <path d="M2.5 10L17 3 13 17l-3.5-5.5z" />
                      <path d="M17 3 9.5 11.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>


          {/* Continuity strip — anchored right above the quick-action pills, acting as the lid for the bottom sheet */}
          {projects && projects.length > 0 && (() => {
            const activeProjects = (projects as Project[]).filter((p: Project) => p.status !== "archived");
            const mostRecent = [...activeProjects].sort((a, b) => {
              const at = new Date((a as any).updatedAt ?? a.createdAt ?? 0).getTime();
              const bt = new Date((b as any).updatedAt ?? b.createdAt ?? 0).getTime();
              return bt - at;
            })[0];
            const lastTs = mostRecent ? new Date((mostRecent as any).updatedAt ?? mostRecent.createdAt ?? Date.now()).getTime() : null;
            const formatAgo = (ts: number) => {
              const diff = Math.max(0, Date.now() - ts);
              const m = Math.floor(diff / 60000);
              if (m < 1) return "just now";
              if (m < 60) return `${m}m ago`;
              const h = Math.floor(m / 60);
              if (h < 24) return `${h}h ago`;
              const d = Math.floor(h / 24);
              return `${d}d ago`;
            };
            const lastTouched = lastTs ? formatAgo(lastTs) : null;
            return (
              <button
                type="button"
                aria-label="Pick up below"
                onClick={openOverviewSheet}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  margin: "14px 0 0",
                  padding: "7px 12px",
                  background: isParchment ? "rgba(220,210,195,0.55)" : "rgba(28,25,23,0.35)",
                  border: "none",
                  borderTop: isParchment ? "1px solid rgba(160,130,90,0.2)" : "1px solid rgba(201,162,76,0.08)",
                  borderBottom: isParchment ? "1px solid rgba(160,130,90,0.2)" : "1px solid rgba(201,162,76,0.08)",
                  backdropFilter: "blur(8px)",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                <span style={{ position: "relative", width: 6, height: 6, flexShrink: 0 }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: isParchment ? "rgba(146,64,14,0.45)" : "rgba(201,162,76,0.5)", animation: "atlas-pulse 2.4s ease-in-out infinite" }} />
                  <span style={{ position: "absolute", inset: 1, borderRadius: "50%", background: isParchment ? "var(--atlas-ember)" : "var(--atlas-gold)", opacity: 0.9 }} />
                </span>
                <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.18em", textTransform: "uppercase", color: isParchment ? "rgba(80,50,25,0.7)" : "var(--atlas-muted)", opacity: 0.9, whiteSpace: "nowrap" }}>
                  {lastTouched ? <>last touched {lastTouched}</> : <>{activeProjects.length} in motion</>}
                  &nbsp;·&nbsp; {activeProjects.length} open
                  &nbsp;·&nbsp; <span style={{ color: isParchment ? "rgba(146,64,14,0.8)" : "rgba(201,162,76,0.65)" }}>↓ pick up below</span>
                </span>
              </button>
            );
          })()}

          {/* Intent row — soft orientation under the input. Permission, not features. */}

          {homeMessages.length === 0 && (() => {
            const pickStarter = (starter: string) => {
              setInput(starter);
              setTimeout(() => {
                textareaRef.current?.focus();
                const el = textareaRef.current;
                if (el) el.setSelectionRange(starter.length, starter.length);
                autoResize();
              }, 0);
            };
            const intents: Array<{ label: string; action: () => void }> = [
              { label: "Think out loud", action: () => pickStarter("I've been turning something over and want to think it through out loud — ") },
              { label: "Untangle something", action: () => pickStarter("Something's tangled and I can't quite see the shape of it. Here's what I know: ") },
              { label: "Weigh a decision", action: () => pickStarter("I'm trying to decide between ") },
              { label: "Where were we", action: () => pickStarter("Where did we leave things last?") },
            ];
            const rotate = () => {
              const next = (starterIdx + 1) % PLACEHOLDERS.length;
              setStarterIdx(next);
              pickStarter(PLACEHOLDERS[next].replace(/…$/, ""));
            };
            return (
              <div style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}>
                <div className="suggestion-chips-row" style={{
                  display: "flex",
                  flexWrap: "nowrap",
                  justifyContent: "center",
                  gap: 6,
                  overflowX: "auto",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  WebkitOverflowScrolling: "touch",
                  fontFamily: "var(--app-font-sans)",
                  fontSize: "var(--ts-label)",
                  letterSpacing: "0.01em",
                  color: "var(--atlas-muted)",
                }}>
                  {intents.map((it, i) => (
                    <span key={it.label} style={{ display: "inline-flex", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={it.action}
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          backdropFilter: "blur(8px)",
                          WebkitBackdropFilter: "blur(8px)",
                          borderRadius: 20,
                          padding: "5px 12px",
                          color: "rgba(212,175,55,0.5)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: "var(--ts-caption)",
                          letterSpacing: "inherit",
                          transition: "color 160ms ease, box-shadow 160ms ease",
                        }}
                        onMouseEnter={(e) => { 
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(212,175,55,0.9)";
                          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 10px rgba(212,175,55,0.15)";
                        }}
                        onMouseLeave={(e) => { 
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(212,175,55,0.5)";
                          (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                        }}
                      >
                        {it.label}
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={rotate}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "2px 6px",
                    color: "rgba(212,175,55,0.5)",
                    cursor: "pointer",
                    fontFamily: "var(--app-font-sans)",
                    fontSize: "var(--ts-caption)",
                    letterSpacing: "0.01em",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    transition: "color 160ms ease",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(212,175,55,0.9)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(212,175,55,0.5)"; }}
                >
                  <span className="atlas-pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(212,175,55,0.7)", display: "inline-block" }} />
                  need a starting point? <span style={{ fontSize: "var(--ts-label)" }}>↻</span>
                </button>
              </div>
            );
          })()}

          {/* Inline create error */}
          {createError && (
            <div style={{
              marginTop: 8, padding: "6px 12px", borderRadius: 5, fontSize: "var(--ts-caption)",
              background: "rgba(146,64,14,0.1)",
              border: "0.5px solid rgba(146,64,14,0.35)",
              color: "var(--atlas-ember)",
              fontFamily: "var(--app-font-mono)",
              lineHeight: 1.4,
            }}>
              {createError}
            </div>
          )}

          {/* Gradient fade — clipped to hero, fades bottom into background */}
          <div aria-hidden style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: 56, pointerEvents: "none", zIndex: 1,
            background: "linear-gradient(to bottom, transparent, var(--atlas-bg))",
          }} />

          </div>{/* end hero */}

          </>}
        />

        <aside className="atlas-home-desktop-overview" aria-label="Overview">
          <div className="atlas-home-desktop-overview-scroll">
            {renderOverviewDashboard()}
          </div>
        </aside>
      </div>

      {/* Below-the-fold: Recent Activity / Discovery section */}
      <div className="atlas-home-tablet-overview" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 24px 140px" }}>
        <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(180,83,9,0.18), transparent)" }} />
        </div>
        {renderOverviewDashboard()}
      </div>

      {showBriefingPanel && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", justifyContent: "flex-end" }}
          onClick={() => setShowBriefingPanel(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--atlas-bg)", opacity: 0.4 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(420px, 92vw)",
              maxHeight: "100vh",
              background: "var(--atlas-surface)",
              borderLeft: "1px solid var(--atlas-border)",
              padding: "20px 18px",
              overflowY: "auto",
              animation: "fadeIn 200ms ease forwards",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Briefcase size={13} strokeWidth={1.75} color="var(--atlas-gold)" />
                <span style={{ fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", color: "var(--atlas-gold)", textTransform: "uppercase", opacity: 0.8 }}>
                  Briefing
                </span>
              </div>
              <button
                onClick={() => setShowBriefingPanel(false)}
                style={{ background: "transparent", border: "none", color: "var(--atlas-muted)", cursor: "pointer", fontSize: "var(--ts-h2)", lineHeight: 1, padding: 4 }}
                aria-label="Close briefing"
              >
                ×
              </button>
            </div>
            {briefingLoading ? (
              <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", opacity: 0.6 }}>
                Atlas is preparing your briefing…
              </div>
            ) : briefing ? (
              <p style={{ margin: 0, fontSize: "var(--ts-body)", color: "var(--atlas-fg)", lineHeight: 1.6, fontFamily: "var(--app-font-sans)", opacity: 0.9, whiteSpace: "pre-wrap" }}>
                {briefing}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: "var(--ts-label)", color: "var(--atlas-muted)", fontStyle: "italic", opacity: 0.6 }}>
                No briefing available yet.
              </p>
            )}
          </div>
        </div>
      )}

      {showHistory && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 500,
          display: "flex", alignItems: "flex-end",
        }} onClick={() => setShowHistory(false)}>
          <div style={{ position: "absolute", inset: 0, background: "var(--atlas-bg)", opacity: 0.4 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%", maxHeight: "70vh",
              background: "var(--atlas-surface)",
              borderRadius: "16px 16px 0 0",
              padding: "20px 16px",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-muted)" }}>
                CONVERSATION HISTORY
              </div>
              <button
                onClick={handleNewConversation}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "transparent",
                  border: "1px solid var(--atlas-border)",
                  borderRadius: 999,
                  padding: "6px 12px",
                  color: "var(--atlas-fg)",
                  fontSize: "var(--ts-caption)",
                  fontFamily: "var(--app-font-mono)",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                }}
                aria-label="Start new conversation"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                NEW
              </button>
            </div>
            {historyLoading ? (
              <div style={{ textAlign: "center", padding: 32, color: "var(--atlas-muted)", fontSize: "var(--ts-label)" }}>Loading...</div>
            ) : conversations.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "var(--atlas-muted)", fontSize: "var(--ts-label)", fontFamily: "var(--app-font-mono)" }}>No saved conversations yet.</div>
            ) : conversations.map(c => (
              <div
                key={c.id}
                onClick={() => handleSwitchConversation(c.id)}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--atlas-border)",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "var(--ts-body)", color: "var(--atlas-fg)", marginBottom: 2 }}>{c.title}</div>
                  <div style={{ fontSize: "var(--ts-micro)", color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)" }}>
                    {new Date(c.createdAt).toLocaleDateString()} · {c.messageCount} messages
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--atlas-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
      {showProfile && <AccountHubPanel onClose={() => setShowProfile(false)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} reason="project_limit" />}
      <NewProjectModal
        open={showNewProjectModal}
        onClose={() => { setShowNewProjectModal(false); setCreateError(null); }}
        onCreate={(name, repo) => performCreateProject(name, repo)}
        creating={createProject.isPending}
        error={createError}
      />


      {showProjectsSheet && (
        <ProjectsGridSheet
          projects={(projects ?? []).map((p: Project) => ({ id: p.id, name: p.name, description: p.description, latestSnapshotScore: p.latestSnapshotScore ?? null }))}
          onOpenProject={(id) => { setShowProjectsSheet(false); navigateToProject(id); }}
          onNewProject={() => {
            setShowProjectsSheet(false);
            handleNewProject("New Project");
          }}
          onClose={() => setShowProjectsSheet(false)}
        />
      )}

      {/* Right-edge timeline rail (ticks per assistant message, long-press for timeframe jump) */}
      <TimelineRail messages={homeMessages.map(m => ({ role: m.role, createdAt: m.createdAt }))} />

      {/* Projects Drawer (slide-in menu) */}
      <ProjectsDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        projects={(projects ?? []).map((p: Project) => ({ id: p.id, name: p.name, description: p.description, latestSnapshotScore: p.latestSnapshotScore ?? null }))}
        onOpenProject={navigateToProject}
        onNewProject={() => { setShowDrawer(false); handleNewProject("New Project"); }}
        onOpenLedger={(id) => setLocation(`/ledger/${id}`)}
        onOpenParking={() => setLocation("/parking")}
        onOpenQuickPrompt={() => { setShowDrawer(false); setShowQuickPrompt(true); }}
        userLabel={(() => { try { const r = localStorage.getItem("atlas-user-profile"); return r ? JSON.parse(r).name || null : null; } catch { return null; } })()}
      />

      {showVault && (
        <VisualVault
          projectId={homeFocus ?? undefined}
          onClose={() => setShowVault(false)}
        />
      )}


      {showQuickPrompt && (
        <TheForge
          defaultTab="prompt"
          projectId={homeFocus ?? undefined}
          activeProjectName={homeFocus ? (projects?.find(p => p.id === homeFocus)?.name ?? undefined) : undefined}
          onClose={() => setShowQuickPrompt(false)}
        />
      )}

      {showOverviewSheet && (
        <OverviewBottomSheet
          closing={isOverviewSheetClosing}
          onClose={closeOverviewSheet}
        >
          {renderOverviewDashboard(true)}
        </OverviewBottomSheet>
      )}

      {/* Fixed 5-item bottom nav — true flex row, even spacing */}
      <style>{`
        @keyframes homePurpleAtmosphere {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 1; }
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes homeAxiomPulse {
          0%, 100% {
            box-shadow:
              0 0 0 2px rgba(212,175,55,0.55),
              0 0 10px 2px rgba(212,175,55,0.20),
              0 0 28px 6px rgba(212,175,55,0.08);
          }
          50% {
            box-shadow:
              0 0 0 2px rgba(212,175,55,0.90),
              0 0 16px 4px rgba(212,175,55,0.38),
              0 0 44px 12px rgba(212,175,55,0.14);
          }
        }
        .atlas-home-chat-messages-scroll::-webkit-scrollbar {
          display: none;
        }
        @keyframes atlasOverviewSheetUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes atlasOverviewSheetDown {
          from { transform: translateY(0); }
          to   { transform: translateY(100%); }
        }
        .atlas-home-chat-column {
          width: 100%;
          display: flex;
          justify-content: center;
          min-width: 0;
        }
        .atlas-home-desktop-overview {
          display: none;
        }
        .atlas-overview-sheet-layer {
          position: fixed;
          inset: 0;
          z-index: 220;
          display: flex;
          align-items: flex-end;
        }
        .atlas-overview-scrim {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.5);
        }
        .atlas-overview-bottom-sheet {
          position: relative;
          width: 100%;
          height: 78dvh;
          background: var(--atlas-bg);
          border: 1px solid var(--atlas-border);
          border-bottom: none;
          border-radius: 20px 20px 0 0;
          display: flex;
          flex-direction: column;
          animation: atlasOverviewSheetUp 300ms ease-out both;
        }
        .atlas-overview-bottom-sheet.is-closing {
          animation: atlasOverviewSheetDown 250ms ease-in both;
        }
        .atlas-overview-sheet-handle {
          width: 40px;
          height: 4px;
          border-radius: 999px;
          background: var(--atlas-border);
          margin: 12px auto 8px;
          flex-shrink: 0;
        }
        .atlas-overview-sheet-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0 16px max(20px, env(safe-area-inset-bottom));
        }
        .atlas-overview-sheet-scroll > .atlas-below-fold-dashboard {
          max-width: none !important;
          padding-bottom: 0 !important;
        }
        @media (max-width: 767px) {
          .atlas-home-tablet-overview {
            display: none !important;
          }
        }
        @media (min-width: 768px) {
          .atlas-overview-sheet-layer {
            display: none;
          }
        }
        @media (min-width: 1024px) {
          .atlas-home-responsive-shell {
            width: min(calc(100% - 48px), 1100px);
            max-width: 1100px;
            margin: 0 auto;
            padding: 0 !important;
            display: grid !important;
            grid-template-columns: minmax(0, 62fr) minmax(0, 38fr);
            gap: 20px;
            align-items: start;
            justify-content: initial !important;
          }
          .atlas-home-chat-column {
            justify-content: stretch;
          }
          .atlas-home-chat-inner {
            max-width: none !important;
            padding-bottom: 48px !important;
          }
          .atlas-home-desktop-overview {
            display: block;
            min-width: 0;
            max-height: calc(100svh - 32px);
            position: sticky;
            top: 16px;
          }
          .atlas-home-desktop-overview-scroll {
            max-height: inherit;
            overflow-y: auto;
            padding-right: 4px;
          }
          .atlas-home-desktop-overview-scroll > .atlas-below-fold-dashboard {
            max-width: none !important;
            padding-bottom: 24px !important;
          }
          .atlas-home-tablet-overview,
          .atlas-home-bottom-nav {
            display: none !important;
          }
        }
      `}</style>
      <div className="atlas-home-bottom-nav">
        <UnifiedContextDock
          mode={homeMessages.length > 0 ? "active" : "ambient"}
          onAtlasCore={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          onProjects={() => setShowProjectsSheet(true)}
          onDecisions={() => setLocation("/ledger")}
          onYou={() => setShowProfile(true)}
          onMap={() => setLocation("/map")}
          onFiles={() => setShowProjectsSheet(true)}
          onForge={() => setLocation(projects && projects.length > 0 ? `/project/${projects[0]?.id}` : "/projects")}
        />
      </div>
    </div>
  );
}

function OverviewBottomSheet({
  closing,
  onClose,
  children,
}: {
  closing: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartScrollTopRef = useRef(0);

  return (
    <div className="atlas-overview-sheet-layer" role="presentation">
      <div className="atlas-overview-scrim" onClick={onClose} />
      <section
        className={`atlas-overview-bottom-sheet${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Overview"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchStartYRef.current = e.touches[0]?.clientY ?? null;
          touchStartScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
        }}
        onTouchEnd={(e) => {
          const startY = touchStartYRef.current;
          if (startY === null) return;
          const endY = e.changedTouches[0]?.clientY ?? startY;
          if (endY - startY > 70 && touchStartScrollTopRef.current <= 0) {
            onClose();
          }
          touchStartYRef.current = null;
        }}
      >
        <div className="atlas-overview-sheet-handle" aria-hidden />
        <div ref={scrollRef} className="atlas-overview-sheet-scroll">
          {children}
        </div>
      </section>
    </div>
  );
}

// ── Projects Grid Sheet ───────────────────────────────────────────────────────
type SheetProject = { id: number; name: string; description?: string | null; latestSnapshotScore?: number | null };

function ProjectsGridSheet({
  projects,
  onOpenProject,
  onNewProject,
  onClose,
}: {
  projects: SheetProject[];
  onOpenProject: (id: number) => void;
  onNewProject: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const COLORS = ["#92400E", "#1e3a5f", "#1a3a2a", "#3b1f4e", "#3b2a0e", "#1f3b3b"];
  const ICONS = [
    <path key="a" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />,
    <path key="b" d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7" />,
    <g key="c"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></g>,
    <path key="d" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" />,
    <g key="e"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></g>,
    <path key="f" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
  ];

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", zIndex: 200 }}
      />

      {/* Sheet — slides up from bottom */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          zIndex: 201,
          background: "var(--atlas-surface)",
          borderTop: "1px solid rgba(212,175,55,0.18)",
          borderRadius: "20px 20px 0 0",
          maxHeight: "80dvh",
          display: "flex", flexDirection: "column",
          animation: "projectSheetSlideUp 220ms cubic-bezier(0.32,0.72,0,1) both",
        }}
      >
        <style>{`
          @keyframes projectSheetSlideUp {
            from { transform: translateY(100%); opacity: 0.5; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(120,113,108,0.35)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 12px" }}>
          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-caption)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-gold)" }}>
            Projects
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(120,113,108,0.6)", fontSize: "var(--ts-display)", lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* Grid */}
        <div style={{ overflowY: "auto", padding: "0 16px 32px", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            {/* New Project card */}
            <button
              onClick={onNewProject}
              style={{
                background: "none", border: "1px dashed rgba(212,175,55,0.3)", borderRadius: 14,
                cursor: "pointer", padding: 0, overflow: "hidden", textAlign: "left",
                transition: "border-color 160ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,55,0.65)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,55,0.3)")}
            >
              <div style={{ height: 90, background: "rgba(212,175,55,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "var(--ts-display-lg)", color: "rgba(212,175,55,0.45)", lineHeight: 1 }}>+</span>
              </div>
              <div style={{ padding: "10px 12px 12px" }}>
                <p style={{ margin: 0, fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-label)", fontWeight: 600, color: "rgba(212,175,55,0.7)" }}>New Project</p>
                <p style={{ margin: "3px 0 0", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "rgba(120,113,108,0.5)", letterSpacing: "0.05em" }}>Start fresh</p>
              </div>
            </button>

            {/* Project cards */}
            {projects.map((p, i) => {
              const bg = COLORS[i % COLORS.length];
              const icon = ICONS[i % ICONS.length];
              const initials = p.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
              return (
                <button
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  style={{
                    background: "none", border: "1px solid var(--atlas-glass-bg)", borderRadius: 14,
                    cursor: "pointer", padding: 0, overflow: "hidden", textAlign: "left",
                    transition: "border-color 160ms, transform 120ms",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,55,0.3)"; e.currentTarget.style.transform = "scale(1.02)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--atlas-glass-bg)"; e.currentTarget.style.transform = "scale(1)"; }}
                >
                  {/* Colored thumbnail with subtle grid texture */}
                  <div style={{ height: 90, background: bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                    <div style={{
                      position: "absolute", inset: 0, opacity: 0.12,
                      backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
                      backgroundSize: "14px 14px",
                    }} />
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative", zIndex: 1 }}>
                      {icon}
                    </svg>
                    <div style={{ position: "absolute", top: 8, right: 8, fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)" }}>
                      {initials}
                    </div>
                  </div>
                  <div style={{ padding: "10px 12px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                      <p style={{ margin: 0, fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-label)", fontWeight: 600, color: "var(--atlas-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
                        {p.name}
                      </p>
                      <CompactReadinessRing score={p.latestSnapshotScore ?? 0} />
                    </div>
                    <p style={{ margin: 0, fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", letterSpacing: "0.05em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.description ?? "No description"}
                    </p>
                  </div>
                </button>
              );
            })}

          </div>
        </div>

        {/* Footer — manage link */}
        <div style={{ flexShrink: 0, borderTop: "1px solid rgba(120,113,108,0.15)", padding: "12px 20px", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <button
            onClick={() => { onClose(); window.location.href = "/projects"; }}
            style={{
              width: "100%", padding: "11px 0", borderRadius: 10,
              background: "transparent", border: "1px solid rgba(201,162,76,0.25)",
              cursor: "pointer", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-caption)",
              fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              color: "var(--atlas-gold)", transition: "all 160ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.08)"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.5)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.25)"; }}
          >
            Manage all projects →
          </button>
        </div>
      </div>
    </>
  );
}
