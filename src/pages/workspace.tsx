import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import type React from "react";
import { useParams, useLocation, Link } from "wouter";
import { useRequireAuth } from "@/hooks/useAuth";
import { useSound } from "@/hooks/useSound";
import { useProjectState } from "@/hooks/useProjectState";
import { useComposerDraft } from "@/hooks/useComposerDraft";
import { useChatStream } from "@/hooks/useChatStream";
import { useChatLens } from "@/hooks/useChatLens";
import { useComposerZip } from "@/hooks/useComposerZip";
import { useParkingLot } from "@/hooks/useParkingLot";
import { AxiomFlow } from "../components/AxiomFlow";
import type { ArchNode, NodeStateMap, HandoverSnapshot } from "../components/AxiomFlow";
import { SystemMap } from "../components/SystemMap";
import type { ArchNode as SystemMapNode } from "../components/SystemMap";
import { TheForge } from "../components/TheForge";
import { GlossaryTip } from "../components/GlossaryTip";
import { VisualVault } from "../components/VisualVault";
import { BlueprintsTab, GenerateBlueprintPill } from "../components/BlueprintsTab";

import { UnifiedContextDock } from "../components/UnifiedContextDock";
import { ProjectsDrawer } from "../components/ProjectsDrawer";
import { UserMenuDropdown } from "../components/UserMenuDropdown";
import { AccountHubPanel } from "../components/AccountHubPanel";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { PreviewPanel } from "../components/workspace/PreviewPanel";
import { LedgerPanel } from "../components/workspace/LedgerPanel";
import { FilesPanel } from "../components/workspace/FilesPanel";
import { FlowPanel, extractPersistedFlowNodes } from "../components/workspace/FlowPanel";
import { StatusGlyph } from "../components/StatusGlyph";
import { CapsuleTag } from "../components/CapsuleTag";
import { ZipDragOverlay, ZipPanel } from "../components/ZipImport";
import { ProjectSettingsPanel } from "../components/ProjectSettingsPanel";
import { LiveGenerationCard } from "../components/LiveGenerationCard";
import { Eye, RefreshCw, TerminalSquare } from "lucide-react";
import { useThemeMode } from "@/lib/theme";
import { fileToBase64Safe } from "@/lib/image-resize";
import { reportError } from "../lib/errorReporter";
import { loadProfile } from "@/lib/userProfile";
import type { Plan, PlanExecution } from "../lib/plan";
import {
  useGetProject,
  useListProjects,
  useListSessions,
  useListEntries,
  
  useCreateSession,
  useCreateEntry,
  useCreateProject,
  useUpdateProject,
  useUpdateEntry,
  useDeleteProject,
  useListReadinessSnapshots,
  useRecordReadinessSnapshot,
  getListReadinessSnapshotsQueryKey,
  getListEntriesQueryKey,
  getListSessionsQueryKey,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import type { Entry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ReadinessRing,
  ReadinessTrend,
  ReadinessMode,
  READINESS_MODE_KEY,
  computeBlendedScore,
  MODE_META,
} from "../components/ReadinessRing";
import { LongPressTip, haptic } from "@/lib/long-press-tip";
import { UserBubble } from "@/components/workspace/UserBubble";
import { AtlasActivityBar } from "@/components/workspace/AtlasActivityBar";


// ── Types ────────────────────────────────────────────────────────────────────
import { InsightChip } from "@/components/workspace/InsightChip";
import { GitHubPushModal } from "@/components/workspace/GitHubPushModal";
import { useGithubPushToken } from "@/hooks/useGithubPushToken";
import { AssistantBubble } from "@/components/workspace/AssistantBubble";
import { ChatStream } from "@/components/workspace/ChatStream";
import { ChatComposer } from "@/components/workspace/ChatComposer";
import { UnifiedConversationSurface } from "@/components/UnifiedConversationSurface";
import {
  type PlanState,
} from "@/components/workspace/chatShared";


export interface CatchPayload {
  v: number;
  against: { id: string; title: string };
  leadSentence: string;
}

export interface AlertPayload {
  type: string;
  headline: string;
  detail: string;
  action: string;
}

export interface FileEdit {
  path: string;
  language: string;
  content: string;
}

type HomeHandoffNode = {
  id?: string;
  label: string;
  type: string;
  details?: string;
  meta?: string;
  moscow?: string;
};

type HomeHandoffMeta = {
  parkedCount: number;
  flowNodeCount: number;
  goalLabel: string;
  nodes?: HomeHandoffNode[];
  parkedTitles?: string[];
};

export interface LinePatch {
  path: string;
  find: string;
  replace: string;
}

export interface PushRecord {
  id: string;
  path: string;
  filename: string;
  branch: string;
  commitUrl: string;
  originalContent: string | null;
  newContent: string;
  pushedAt: string;
  rolledBack: boolean;
}

export type AmbientSurface = {
  type: "MAP" | "WORKSPACE" | "DECISION";
  label: string;
  reason?: string | null;
  projectId?: number | null;
  workspaceId?: number | null;
} | null;

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  intentType?: string | null;
  plan?: Plan;
  planFromHome?: boolean;
  catchPayload?: CatchPayload | null;
  catchResolved?: boolean;
  alertPayload?: AlertPayload | null;
  alertResolved?: boolean;
  fileEdit?: FileEdit;
  fileEdits?: FileEdit[];
  linePatches?: LinePatch[];
  memoryChips?: MemoryChip[];
  sentAt?: string;
  imageB64?: string;
  imageMimeType?: string;
  autoFetchedFiles?: string[];
  model?: string;
  isDeepDive?: boolean;
  autoPushed?: boolean;
  surface?: AmbientSurface;
}

export type MemoryChip = { label: string; insight?: string };

export interface LinkedRepo {
  fullName: string;
  defaultBranch: string;
  name: string;
}

type RightTab = "ledger" | "blueprints" | "files" | "preview" | "memory" | "map" | "terminal";
type OnboardingCoachId = "chat" | "ledger" | "flow";
type WorkspaceLens = "flow" | "build" | "look" | "scenario";

type LiveGenerationMode = "plan" | "blueprint" | "edit" | "thinking";

type ForgeState = { forged: boolean; dismissed: boolean };


const LENS_CONFIG: Record<WorkspaceLens, {
  label: string;
  sub: string;
  color: string;
  borderColor: string;
  glowColor: string;
  bgTint: string;
  model: string;
}> = {
  flow:     { label: "Flow",     sub: "Think it through",            color: "#C9A24C", borderColor: "rgba(201,162,76,0.45)",  glowColor: "rgba(201,162,76,0.10)", bgTint: "transparent",                   model: "claude" },
  build:    { label: "Build",    sub: "Write code · push to GitHub", color: "#C4521A", borderColor: "rgba(196,82,26,0.45)",   glowColor: "rgba(196,82,26,0.10)",  bgTint: "transparent",                   model: "claude" },
  look:     { label: "Look",     sub: "CSS · animation · visual",    color: "#8B5CF6", borderColor: "rgba(139,92,246,0.40)",  glowColor: "rgba(139,92,246,0.10)", bgTint: "transparent",                   model: "gemini" },
  scenario: { label: "Scenario", sub: "What if — no commitment",     color: "#78716C", borderColor: "rgba(120,113,108,0.35)", glowColor: "rgba(120,113,108,0.06)", bgTint: "rgba(120,113,108,0.04)",       model: "" },
};

export interface ProjectScan {
  projectName: string;
  description: string;
  stack: string[];
  routes: string[];
  pages: string[];
  components: string[];
  tables: string[];
  authEnabled: boolean;
  summary: string;
  scannedAt: string;
  repo: string;
  branch: string;
  totalFiles: number;
}

// User profile helpers moved to @/lib/userProfile.

// ── Hooks ────────────────────────────────────────────────────────────────────
// URL override: ?desktop=1 forces desktop layout regardless of viewport width.
// Useful when the app is rendered inside a narrow preview iframe but the user
// is actually on a desktop/tablet and doesn't want the mobile bottom nav.
function useForceDesktop() {
  const [force, setForce] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("desktop") === "1" || p.get("view") === "desktop";
    } catch { return false; }
  });
  useEffect(() => {
    const handler = () => {
      try {
        const p = new URLSearchParams(window.location.search);
        setForce(p.get("desktop") === "1" || p.get("view") === "desktop");
      } catch {}
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return force;
}

function useIsMobile() {
  const forceDesktop = useForceDesktop();
  // Mobile = stacked single-column. Tablet (>=768) and desktop (>=1024) are side-by-side.
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile && !forceDesktop;
}

function useIsTinyScreen() {
  const forceDesktop = useForceDesktop();
  const [tiny, setTiny] = useState(() => window.innerWidth < 420);
  useEffect(() => {
    const handler = () => setTiny(window.innerWidth < 420);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return tiny && !forceDesktop;
}

// Desktop breakpoint — used to guarantee the mobile bottom-nav never appears
// on screens >= 1024px, independent of useIsMobile's narrower threshold.
function useIsDesktop() {
  const forceDesktop = useForceDesktop();
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => {
    const handler = () => setDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return desktop || forceDesktop;
}


// ── useVoiceInput ─────────────────────────────────────────────────────────────
function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const toggle = useCallback(() => {
    if (!isSupported) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join(" ");
      callbackRef.current(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [isSupported, listening]);

  return { listening, toggle, isSupported };
}

// ── MenuBtn — reusable dropdown menu item ─────────────────────────────────────
function MenuBtn({ icon, label, onClick, badge, disabled, style }: { icon: React.ReactNode; label: string; onClick?: () => void; badge?: string; disabled?: boolean; style?: React.CSSProperties }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: "none", padding: "9px 12px", borderRadius: 7, cursor: disabled ? "not-allowed" : "pointer", color: "var(--atlas-fg)", opacity: disabled ? 0.45 : 1, fontSize: "var(--ts-body)", textAlign: "left", ...style }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "color-mix(in oklab, var(--atlas-fg) 8%, transparent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ color: "var(--atlas-muted)", display: "flex", flexShrink: 0, opacity: 0.7 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.6, letterSpacing: "0.1em", flexShrink: 0 }}>{badge}</span>
      )}
    </button>
  );
}

// ── AtlasLogo ────────────────────────────────────────────────────────────────
const MODE_LABEL_COLORS: Record<string, string> = {
  THINK: "rgba(147,197,253,0.55)",
  PLAN:  "rgba(var(--atlas-gold-rgb),0.38)",
  BUILD: "rgba(74,222,128,0.45)",
};

function AtlasLogo({ small, mode }: { small?: boolean; mode?: "THINK" | "PLAN" | "BUILD" }) {
  const imgSize = small ? 22 : 26;
  const modeLabel = mode ? `${mode} MODE` : null;
  const modeColor = mode ? (MODE_LABEL_COLORS[mode] ?? "var(--atlas-muted)") : "var(--atlas-muted)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <img
        src="/axiom-logo.svg"
        alt="Axiom"
        width={imgSize}
        height={imgSize}
        style={{ borderRadius: "20%", flexShrink: 0 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 1.5, lineHeight: 1 }}>
        <span style={{
          fontFamily: "'IBM Plex Mono', var(--app-font-mono)",
          fontSize: small ? 10 : 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "var(--atlas-gold)",
          textTransform: "uppercase",
        }}>
          AXIOM
        </span>
        {modeLabel && (
          <span style={{
            fontFamily: "'IBM Plex Mono', var(--app-font-mono)",
            fontSize: "var(--ts-tiny)",
            fontWeight: 500,
            letterSpacing: "0.14em",
            color: modeColor,
            textTransform: "uppercase",
            transition: "color 300ms ease",
          }}>
            {modeLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// DecisionLogCard + ProactiveAlertCard moved to @/components/workspace/AssistantBubble

// ── Chat bubbles + Memory Chips ──────────────────────────────────────────────

// ── InsightChip ───────────────────────────────────────────────────────────────



// ── MemoryChips (session-level, above the input) ──────────────────────────────
function MemoryChips({
  chips,
  onDismiss,
  onPark,
}: {
  chips: MemoryChip[];
  onDismiss: (label: string) => void;
  onPark: (chip: MemoryChip) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "6px 14px 2px", flexShrink: 0 }}>
      {chips.map((chip) => (
        <InsightChip key={chip.label} chip={chip} onPark={onPark} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const LINE_HEIGHT_PX = 23.8; // 14px * 1.7 line-height






// ── GitHubPushModal ───────────────────────────────────────────────────────────



// ── StreamingText ─────────────────────────────────────────────────────────────
function StreamingText({
  text,
  speed = 35,
  animate = true,
  onComplete,
  onVisibleTextChange,
  style,
}: {
  text: string;
  speed?: number;
  animate?: boolean;
  onComplete?: () => void;
  onVisibleTextChange?: (visibleText: string) => void;
  style?: React.CSSProperties;
}) {
  const [visibleCount, setVisibleCount] = useState(animate ? 0 : Infinity);
  const words = useRef<string[]>([]);
  const completeCalled = useRef(false);

  useEffect(() => {
    words.current = text.match(/\S+|\n/g) ?? [];
    if (!animate) { setVisibleCount(Infinity); return; }
    setVisibleCount(0);
    completeCalled.current = false;
  }, [text, animate]);

  useEffect(() => {
    if (!animate) return;
    const total = words.current.length;
    if (visibleCount >= total) {
      if (!completeCalled.current) { completeCalled.current = true; onComplete?.(); }
      return;
    }
    const lastWord = words.current[visibleCount - 1] ?? "";
    const pause = /[.!?]$/.test(lastWord)
      ? speed * 4
      : speed * (0.6 + Math.random() * 0.8);
    const timer = setTimeout(() => {
      const burst = Math.random() > 0.7 ? 2 : 1;
      setVisibleCount((c) => Math.min(c + burst, total));
    }, pause);
    return () => clearTimeout(timer);
  }, [visibleCount, animate, speed, onComplete]);

  const done = !animate || visibleCount >= (words.current.length || Infinity);
  const visible = done ? text : words.current.slice(0, visibleCount).join(" ");
  useEffect(() => {
    onVisibleTextChange?.(visible);
  }, [visible, onVisibleTextChange]);

  if (done) {
    return <div style={style}>{text}</div>;
  }
  return (
    <div style={style}>
      {visible}
      <span className="atlas-cursor" />
    </div>
  );
}

function splitIntoChunks(text: string): string[] {
  if (text.length < 300) return [text];
  const raw = text.split(/\n{2,}/);
  const chunks: string[] = [];
  for (const segment of raw) {
    const trimmed = segment.trim();
    if (trimmed) chunks.push(trimmed);
  }
  return chunks.length > 0 ? chunks : [text];
}

// ── ChunkedBubbles ────────────────────────────────────────────────────────────
function ChunkedBubbles({
  text,
  isNew,
  textStyle,
  onStreamTextChange,
  onComplete,
}: {
  text: string;
  isNew: boolean;
  textStyle?: React.CSSProperties;
  onStreamTextChange?: (visibleText: string) => void;
  onComplete?: () => void;
}) {
  const chunks = splitIntoChunks(text);
  const [revealed, setRevealed] = useState(isNew ? 0 : chunks.length);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!isNew || revealed >= chunks.length) return;
    const timer = setTimeout(
      () => setRevealed((r) => r + 1),
      revealed === 0 ? 100 : 600 + Math.random() * 400,
    );
    return () => clearTimeout(timer);
  }, [revealed, chunks.length, isNew]);

  useEffect(() => {
    completedRef.current = false;
  }, [text, isNew]);

  const visibleChunks = chunks.slice(0, isNew ? Math.min(revealed + 1, chunks.length) : chunks.length);
  return (
    <>
      {visibleChunks.map((chunk, i) => (
        <StreamingText
          key={i}
          text={chunk}
          animate={isNew && i === revealed && revealed < chunks.length}
          onVisibleTextChange={(visible) => {
            if (!isNew) return;
            onStreamTextChange?.([...chunks.slice(0, i), visible].join("\n\n"));
          }}
          onComplete={() => {
            if (!isNew || i !== chunks.length - 1 || completedRef.current) return;
            completedRef.current = true;
            onComplete?.();
          }}
          style={{ ...textStyle, ...(i < visibleChunks.length - 1 ? { marginBottom: 12 } : {}) }}
        />
      ))}
    </>
  );
}

// ── LinePatchReviewCard ───────────────────────────────────────────────────────
function LinePatchReviewCard({
  linePatches,
  linkedRepo,
  projectId,
  onPushSuccess,
  onPrCreated,
}: {
  linePatches: LinePatch[];
  linkedRepo: LinkedRepo | null;
  projectId: number;
  onPushSuccess: (records: PushRecord[]) => void;
  onPrCreated?: (prUrl: string) => void;
}) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patchedEdits, setPatchedEdits] = useState<FileEdit[] | null>(null);
  const [showPushModal, setShowPushModal] = useState(false);

  const { data: project } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });
  const token = useGithubPushToken(project?.githubToken);

  const pathGroups = useMemo(() => {
    const groups: Record<string, LinePatch[]> = {};
    for (const p of linePatches) {
      if (!groups[p.path]) groups[p.path] = [];
      groups[p.path].push(p);
    }
    return groups;
  }, [linePatches]);

  const uniquePaths = Object.keys(pathGroups);
  const patchCount = linePatches.length;
  const fileCount = uniquePaths.length;

  const handleApply = async () => {
    if (!linkedRepo) { setError("No repo linked — connect a GitHub repo in the Files tab."); return; }
    if (!token) { setError("No GitHub token — add your personal token in the Files tab."); return; }
    setApplying(true);
    setError(null);
    try {
      const edits: FileEdit[] = [];
      for (const [filePath, patches] of Object.entries(pathGroups)) {
        const r = await fetch(
          `/api/github/file?repo=${encodeURIComponent(linkedRepo.fullName)}&path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(linkedRepo.defaultBranch)}`,
          { headers: { "x-github-token": token } }
        );
        if (!r.ok) throw new Error(`Could not fetch ${filePath.split("/").pop()} (${r.status})`);
        const data = await r.json() as { content: string };
        let content = data.content;
        for (const patch of patches) {
          const idx = content.indexOf(patch.find);
          if (idx === -1) throw new Error(
            `Anchor not found in ${filePath.split("/").pop()}. The file may have changed since Atlas last read it — ask Atlas to re-read the file first.`
          );
          content = content.slice(0, idx) + patch.replace + content.slice(idx + patch.find.length);
        }
        const ext = filePath.split(".").pop() ?? "";
        const lang = ["ts", "tsx"].includes(ext) ? "typescript" : ["js", "jsx"].includes(ext) ? "javascript" : ext;
        edits.push({ path: filePath, language: lang, content });
      }
      setPatchedEdits(edits);
      setShowPushModal(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div style={{
        marginTop: 12, padding: "11px 14px", borderRadius: 8,
        background: "rgba(201,162,76,0.05)", border: "1px solid rgba(201,162,76,0.2)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="4.5" cy="4.5" r="2" stroke="var(--atlas-gold)" strokeWidth="1.2" />
              <circle cx="4.5" cy="11.5" r="2" stroke="var(--atlas-gold)" strokeWidth="1.2" />
              <path d="M6.2 5.8L14 3M6.2 10.2L14 13M9 8H14" stroke="var(--atlas-gold)" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--ts-caption)", fontWeight: 600, color: "var(--atlas-gold)", marginBottom: 2 }}>
              {patchCount} patch{patchCount !== 1 ? "es" : ""} ready
            </div>
            <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", color: "var(--atlas-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {fileCount === 1
                ? uniquePaths[0]
                : `${fileCount} files — ${uniquePaths.map(p => p.split("/").pop()).join(", ")}`}
            </div>
          </div>
        </div>
        <button
          onClick={handleApply}
          disabled={applying}
          style={{
            flexShrink: 0, padding: "6px 13px", borderRadius: 5, fontSize: "var(--ts-caption)", fontWeight: 600,
            fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
            background: applying
              ? "rgba(201,162,76,0.25)"
              : "linear-gradient(180deg, var(--atlas-gold) 0%, color-mix(in oklab, var(--atlas-gold) 78%, #6a4a18) 100%)",
            color: applying ? "var(--atlas-gold)" : "var(--atlas-bg)",
            border: "none", cursor: applying ? "default" : "pointer",
            boxShadow: applying ? "none" : "0 0 12px -4px color-mix(in oklab, var(--atlas-gold) 50%, transparent)",
            transition: "opacity 160ms ease",
          }}
        >
          {applying ? "Applying…" : "Apply & Review →"}
        </button>
      </div>

      {error && (
        <div style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 6,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          fontSize: "var(--ts-caption)", color: "rgba(239,68,68,0.85)", fontFamily: "var(--app-font-mono)", lineHeight: 1.55,
        }}>
          {error}
        </div>
      )}

      {showPushModal && patchedEdits && patchedEdits.length > 0 && (
        <GitHubPushModal
          fileEdits={patchedEdits}
          linkedRepo={linkedRepo}
          projectId={projectId}
          onClose={() => setShowPushModal(false)}
          onPushSuccess={(records) => { onPushSuccess(records); setShowPushModal(false); }}
          onPrCreated={onPrCreated}
        />
      )}
    </>
  );
}

// InlineDiffCard moved to @/components/workspace/AssistantBubble

const LIVE_FILENAME_RE = /(?:[\w.-]+\/)+(?:[\w.-]+\.\w+)|\b[\w.-]+\.(?:tsx?|jsx?|css|scss|json|mdx?|html|py|go|rs|sql|ya?ml)\b/g;

function uniquePush(items: string[], item: string): void {
  if (!item || items.includes(item)) return;
  items.push(item);
}

function parseLiveGeneration(content: string, pending: boolean): { mode: LiveGenerationMode; steps: string[]; shouldShow: boolean } {
  const steps: string[] = [];
  let mode: LiveGenerationMode = "thinking";
  const filenames = [...content.matchAll(LIVE_FILENAME_RE)].map((match) => match[0]).slice(0, 4);
  for (const filename of filenames) {
    uniquePush(steps, `Reading ${filename.split("/").pop() ?? filename}...`);
  }

  const editMatch = content.match(/FILE_EDIT(?:_START)?[\s\S]{0,160}?(?:path:\s*)?((?:[\w.-]+\/)+(?:[\w.-]+\.\w+)|[\w.-]+\.\w+)/i);
  if (/FILE_EDIT/i.test(content)) {
    mode = "edit";
    uniquePush(steps, `Preparing changes to ${editMatch?.[1]?.split("/").pop() ?? filenames[0]?.split("/").pop() ?? "files"}...`);
  }

  const patchMatch = content.match(/LINE_PATCH(?:_START)?[\s\S]{0,160}?(?:path:\s*)?((?:[\w.-]+\/)+(?:[\w.-]+\.\w+)|[\w.-]+\.\w+)/i);
  if (/LINE_PATCH/i.test(content)) {
    mode = "edit";
    uniquePush(steps, `Patching ${patchMatch?.[1]?.split("/").pop() ?? filenames[0]?.split("/").pop() ?? "file"}...`);
  }

  const numbered = [...content.matchAll(/^\s*(\d+)[.)]\s+/gm)].map((match) => Number(match[1])).filter(Number.isFinite);
  if (numbered.length > 0) {
    mode = mode === "edit" ? "edit" : "plan";
    for (const n of numbered.slice(-5)) uniquePush(steps, `Drafting step ${n}...`);
  }

  if (/\b(analy[sz]ing|checking|inspect|reviewing)\b/i.test(content)) {
    if (mode === "thinking") mode = "plan";
    uniquePush(steps, "Analyzing codebase...");
  }

  if (/\b(git|push|github|commit)\b/i.test(content)) {
    mode = "edit";
    uniquePush(steps, "Preparing to push...");
  }

  if (/\b(blueprint|architecture|architectural|moscow|must|should|could|won't|wont)\b/i.test(content) && (numbered.length >= 3 || /BLUEPRINT/.test(content))) {
    mode = "blueprint";
  }

  const planStep = content.match(/PLAN_STEP:\s*(.+)/i)?.[1]?.trim();
  if (planStep) {
    mode = "edit";
    uniquePush(steps, planStep.endsWith("...") ? planStep : `${planStep}...`);
  }

  return {
    mode,
    steps,
    shouldShow: pending || steps.length > 0,
  };
}




// AssistantBubble + AmbientEmergenceCard moved to @/components/workspace/AssistantBubble

// ── Parking Lot entry ─────────────────────────────────────────────────────────
function timeAgo(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

export function ParkingLotEntry({ entry }: { entry: Entry }) {
  const queryClient = useQueryClient();
  const updateEntry = useUpdateEntry();
  const [done, setDone] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleResolve = () => {
    if (done) return;
    updateEntry.mutate(
      { id: entry.id, data: { status: "archived" } },
      { onSuccess: () => { setDone(true); queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(entry.projectId, {}) }); } }
    );
  };

  const handleCommit = () => {
    if (done) return;
    haptic.short();
    updateEntry.mutate(
      { id: entry.id, data: { status: "committed", severity: "committed" } },
      { onSuccess: () => { setDone(true); queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(entry.projectId, {}) }); } }
    );
  };

  const modeLabel = entry.mode ? entry.mode.toUpperCase() : "NOTE";
  const typeLabel = entry.verb ? entry.verb.toUpperCase() : "INSIGHT";
  const summary = entry.summary || "";
  const sentences = summary.split(/(?<=[.!?])\s+/);
  const shortDef = sentences.slice(0, 2).join(" ") || summary;
  const context = sentences.length > 2 ? sentences.slice(2).join(" ") : "";
  const hasDetails = !!(entry.details || (entry.touched && entry.touched.length > 0));

  return (
    <div style={{ marginBottom: 2, position: "relative", opacity: done ? 0.4 : 1, transition: "opacity 300ms ease" }}>
      {/* Gold timeline vertical line */}
      {expanded && (
        <div style={{ position: "absolute", left: 5, top: 22, bottom: 14, width: 1, background: "rgba(201,162,76,0.2)" }} />
      )}

      {/* Collapsed header row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px", cursor: "pointer" }}
      >
        {/* Gold dot */}
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--atlas-gold)", flexShrink: 0, zIndex: 1, boxShadow: "0 0 0 3px rgba(201,162,76,0.1)", display: "inline-block" }} />
        {/* Expand caret */}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          style={{ flexShrink: 0, color: "rgba(var(--atlas-muted-rgb),0.45)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 180ms ease" }}>
          <path d="M2 4l4 4 4-4" />
        </svg>
        {/* Title */}
        <Link
          href={`/entry/${entry.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, fontSize: "var(--ts-label)", color: "var(--atlas-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4, textDecoration: "none" }}
        >
          {entry.title}
        </Link>
        {/* NOTE badge */}
        <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.07em", background: "rgba(var(--atlas-muted-rgb),0.12)", color: "rgba(var(--atlas-muted-rgb),0.6)", padding: "2px 7px", borderRadius: 4, flexShrink: 0, textTransform: "uppercase" as const }}>
          NOTE
        </span>
      </div>

      {/* Source line (collapsed) */}
      {!expanded && (
        <div style={{ paddingLeft: 20, paddingBottom: 6, fontSize: "var(--ts-micro)", color: "rgba(var(--atlas-muted-rgb),0.38)", fontFamily: "var(--app-font-mono)" }}>
          chat message · {timeAgo(entry.createdAt)}
        </div>
      )}

      {/* Expanded definition card */}
      {expanded && (
        <div style={{ marginLeft: 20, marginBottom: 14, background: "var(--atlas-surface-alt)", border: "1px solid color-mix(in oklab, var(--atlas-gold) 12%, transparent)", borderRadius: 10, padding: "14px 16px" }}>
          {/* Category tags + status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" as const }}>
            <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "rgba(var(--atlas-muted-rgb),0.45)", textTransform: "uppercase" as const }}>
              {modeLabel} · {typeLabel}
            </span>
            {entry.buildId && (
              <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", background: "rgba(var(--atlas-muted-rgb),0.1)", border: "0.5px solid rgba(var(--atlas-muted-rgb),0.2)", color: "rgba(var(--atlas-muted-rgb),0.65)", padding: "1px 7px", borderRadius: 10 }}>
                #{entry.buildId}
              </span>
            )}
            {entry.costOfLesson && (
              <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", color: "rgba(var(--atlas-muted-rgb),0.55)" }}>
                cost: {entry.costOfLesson}
              </span>
            )}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", background: entry.isViolation ? "rgba(239,68,68,0.08)" : "rgba(74,222,128,0.07)", border: `1px solid ${entry.isViolation ? "rgba(239,68,68,0.18)" : "rgba(74,222,128,0.18)"}`, color: entry.isViolation ? "rgba(239,68,68,0.75)" : "rgba(74,222,128,0.75)", padding: "2px 9px", borderRadius: 20, textTransform: "uppercase" as const }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
              {entry.isViolation ? "OVERRIDE" : "REVERSIBLE"}
            </span>
          </div>

          {/* Title */}
          <Link
            href={`/entry/${entry.id}`}
            onClick={(e) => e.stopPropagation()}
            style={{ display: "block", fontSize: "var(--ts-md)", fontWeight: 600, color: "var(--atlas-fg)", marginBottom: 8, lineHeight: 1.35, textDecoration: "none" }}
          >
            {entry.title}
          </Link>

          {/* Short definition (italic intro) */}
          {shortDef && (
            <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-muted)", lineHeight: 1.65, marginBottom: context ? 12 : 10, fontStyle: "italic" }}>
              {shortDef}
            </div>
          )}

          {/* WHAT IT MEANS */}
          {context && (
            <>
              <div style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(var(--atlas-muted-rgb),0.45)", marginBottom: 5 }}>
                What it means
              </div>
              <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-muted)", lineHeight: 1.65, marginBottom: 12 }}>
                {context}
              </div>
            </>
          )}

          {/* Details toggle */}
          {hasDetails && (
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              style={{
                marginBottom: 10, background: "transparent", border: "none",
                cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 4,
                fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                color: "rgba(var(--atlas-muted-rgb),0.5)", textTransform: "uppercase" as const,
              }}
            >
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                style={{ transform: showDetails ? "rotate(180deg)" : "none", transition: "transform 160ms ease", flexShrink: 0 }}>
                <path d="M2 4l4 4 4-4" />
              </svg>
              Details
            </button>
          )}

          {/* Details panel */}
          {hasDetails && showDetails && (
            <div style={{
              marginBottom: 12,
              background: "var(--atlas-surface)",
              border: "1px solid rgba(201,162,76,0.1)",
              borderRadius: 6,
              padding: "10px 12px",
            }}>
              {entry.details && (
                <pre style={{
                  margin: 0, marginBottom: (entry.touched && entry.touched.length > 0) ? 10 : 0,
                  fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)",
                  color: "var(--atlas-muted)", lineHeight: 1.6,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {entry.details}
                </pre>
              )}
              {entry.touched && entry.touched.length > 0 && (
                <>
                  <div style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(var(--atlas-muted-rgb),0.45)", marginBottom: 6 }}>
                    Touched files
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                    {entry.touched.map((f, i) => (
                      <li key={i} style={{ fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", color: "rgba(201,162,76,0.6)", letterSpacing: "0.03em" }}>
                        · {f}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Source */}
          <div style={{ fontSize: "var(--ts-micro)", color: "rgba(var(--atlas-muted-rgb),0.35)", fontFamily: "var(--app-font-mono)", marginBottom: 12 }}>
            chat message · {timeAgo(entry.createdAt)}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleResolve} disabled={done || updateEntry.isPending}
              style={{ flex: 1, padding: "7px", borderRadius: 7, fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", background: "transparent", border: "1px solid rgba(var(--atlas-muted-rgb),0.22)", color: "var(--atlas-muted)", cursor: done ? "default" : "pointer", transition: "all 150ms ease" }}
              onMouseEnter={(e) => { if (!done) e.currentTarget.style.borderColor = "rgba(var(--atlas-muted-rgb),0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(var(--atlas-muted-rgb),0.22)"; }}
            >Resolve</button>
            <button onClick={handleCommit} disabled={done || updateEntry.isPending}
              style={{ flex: 1, padding: "7px", borderRadius: 7, fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", background: "rgba(201,162,76,0.08)", border: "1px solid rgba(201,162,76,0.2)", color: "var(--atlas-gold)", cursor: done ? "default" : "pointer", transition: "all 150ms ease" }}
              onMouseEnter={(e) => { if (!done) e.currentTarget.style.background = "rgba(201,162,76,0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.08)"; }}
            >Commit</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── PushHistoryEntry ──────────────────────────────────────────────────────────
// ── diff stat helper ──────────────────────────────────────────────────────────
function diffStat(original: string | null, next: string): { additions: number; deletions: number } {
  if (!original) return { additions: next.split("\n").filter(l => l.trim()).length, deletions: 0 };
  // Bag-of-lines approach: O(n), handles repeated lines correctly
  const bag = (s: string) => {
    const m = new Map<string, number>();
    for (const l of s.split("\n")) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const aBag = bag(original);
  const bBag = bag(next);
  let deletions = 0;
  for (const [l, c] of aBag) { const bc = bBag.get(l) ?? 0; if (c > bc) deletions += c - bc; }
  let additions = 0;
  for (const [l, c] of bBag) { const ac = aBag.get(l) ?? 0; if (c > ac) additions += c - ac; }
  return { additions, deletions };
}

// ── PushDiffCard ──────────────────────────────────────────────────────────────
// Groups one commit's worth of file pushes into a collapsible diff card.
export function PushDiffCard({ records, onRollbackAll }: { records: PushRecord[]; onRollbackAll: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [done, setDone] = useState(records.every(r => r.rolledBack));

  const first = records[0];
  const canRollback = records.some(r => r.originalContent && !r.rolledBack);

  const stats = records.map(r => ({ ...r, ...diffStat(r.originalContent, r.newContent) }));
  const totalAdded = stats.reduce((s, r) => s + r.additions, 0);
  const totalDeleted = stats.reduce((s, r) => s + r.deletions, 0);

  return (
    <div style={{ borderRadius: 8, background: "rgba(0,0,0,0.22)", border: "1px solid var(--atlas-border)", marginBottom: 7, overflow: "hidden" }}>
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ flexShrink: 0, transition: "transform 160ms ease", transform: open ? "rotate(90deg)" : "rotate(0deg)", opacity: 0.45 }}
        >
          <path d="M3 2l4 3-4 3" stroke="var(--atlas-fg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-sm)", color: "var(--atlas-fg)", flex: 1 }}>
          {records.length} File{records.length !== 1 ? "s" : ""} Changed
        </span>
        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "#4ade80", opacity: 0.8 }}>+{totalAdded}</span>
        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "#f87171", opacity: 0.8, marginRight: 4 }}>-{totalDeleted}</span>
        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-tiny)", color: "var(--atlas-muted)", opacity: 0.45 }}>
          {new Date(first.pushedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </button>

      {/* File list */}
      {open && (
        <div style={{ borderTop: "1px solid var(--atlas-border)" }}>
          {stats.map(r => {
            const ext = r.filename.split(".").pop()?.toLowerCase() ?? "";
            const iconColor =
              ext === "ts" || ext === "tsx" ? "#60a5fa"
              : ext === "js" || ext === "jsx" ? "#fbbf24"
              : ext === "css" || ext === "scss" ? "#a78bfa"
              : ext === "json" ? "#34d399"
              : ext === "md" ? "#C9A24C"
              : ext === "py" ? "#4ade80"
              : ext === "html" ? "#f97316"
              : ext === "sh" || ext === "bash" ? "#86efac"
              : "rgba(var(--atlas-muted-rgb),0.65)";
            const isNew = r.originalContent === null;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid var(--atlas-surface)" }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.8 }}>
                  <path d="M9 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6L9 1z" stroke={iconColor} strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M9 1v5h5" stroke={iconColor} strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <span style={{ flex: 1, fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-sm)", color: "var(--atlas-fg)", opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.filename}
                </span>
                <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", color: "#4ade80", flexShrink: 0 }}>+{r.additions}</span>
                {isNew ? (
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-tiny)", background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", padding: "0px 5px", borderRadius: 4, flexShrink: 0, letterSpacing: "0.04em" }}>New</span>
                ) : (
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", color: "#f87171", flexShrink: 0 }}>-{r.deletions}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", opacity: 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {first.branch}
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          {first.commitUrl && (
            <a href={first.commitUrl} target="_blank" rel="noopener noreferrer"
              style={{ padding: "3px 9px", borderRadius: 4, fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", background: "transparent", border: "1px solid var(--atlas-border)", color: "var(--atlas-muted)", textDecoration: "none", opacity: 0.75 }}
            >
              View →
            </a>
          )}
          {canRollback && !done && (
            <button
              disabled={rolling}
              onClick={async () => { setRolling(true); await onRollbackAll(); setRolling(false); setDone(true); }}
              style={{ padding: "3px 9px", borderRadius: 4, fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", background: rolling ? "rgba(255,255,255,0.03)" : "rgba(239,68,68,0.07)", border: `1px solid ${rolling ? "var(--atlas-border)" : "rgba(239,68,68,0.22)"}`, color: rolling ? "var(--atlas-muted)" : "rgba(252,165,165,0.8)", cursor: rolling ? "not-allowed" : "pointer", transition: "all 150ms ease" }}
            >
              {rolling ? "…" : "↺ Rollback"}
            </button>
          )}
          {done && <span style={{ padding: "3px 9px", fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45 }}>rolled back</span>}
        </div>
      </div>
    </div>
  );
}


// ── GitHub file browser ───────────────────────────────────────────────────────
export interface GhRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  language: string | null;
  defaultBranch: string;
  updatedAt: string;
}

export interface GhTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

export interface GhFileContent {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
  lines: number;
}

interface GhCommitFile {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
}

export interface GhCommitSummary {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  url: string;
  files: GhCommitFile[];
}


function FileIcon({ ext }: { ext?: string }) {
  const color =
    ext === "md" ? "#C9A24C"
    : ext === "ts" || ext === "tsx" ? "#60a5fa"
    : ext === "js" || ext === "jsx" ? "#fbbf24"
    : ext === "css" ? "#a78bfa"
    : ext === "json" ? "#34d399"
    : "rgba(var(--atlas-muted-rgb),0.7)";
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke={color} strokeWidth="1.1" />
      <path d="M10 2v3h3" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon({ open }: { open?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M1 4h5l1.5 1.5H15v8H1V4z"
        stroke={open ? "rgba(201,162,76,0.7)" : "rgba(201,162,76,0.45)"}
        strokeWidth="1.1"
        fill={open ? "rgba(201,162,76,0.07)" : "none"}
      />
    </svg>
  );
}

function formatCommitTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function CommitHistoryCard({ commit }: { commit: GhCommitSummary }) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = commit.message.split("\n")[0] || "(no commit message)";
  const displayMessage = expanded || firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77)}...`;
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 8,
        background: "var(--atlas-surface)",
        border: "1px solid var(--atlas-border)",
        color: "var(--atlas-fg)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: "left",
            padding: "10px 12px",
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-fg)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis" }}>
            {displayMessage}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
            <span style={{ fontSize: "var(--ts-sm)", color: "var(--atlas-muted)" }}>{commit.author}</span>
            <span style={{ fontSize: "var(--ts-micro)", color: "var(--atlas-muted)", opacity: 0.55 }}>·</span>
            <span style={{ fontSize: "var(--ts-sm)", color: "var(--atlas-muted)" }}>{formatCommitTimeAgo(commit.timestamp)}</span>
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", opacity: 0.65 }}>{commit.sha.slice(0, 7)}</span>
          </div>
        </button>
        <a
          href={commit.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View commit on GitHub"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: "var(--atlas-gold)",
            textDecoration: "none",
            fontSize: "var(--ts-h3)",
            lineHeight: 1,
            padding: "10px 12px",
            flexShrink: 0,
            opacity: 0.78,
          }}
        >
          ↗
        </a>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid var(--atlas-border)", padding: "9px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {commit.message || "(no commit message)"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {commit.files.length > 0 ? commit.files.map((file) => (
              <div key={file.filename} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--ts-sm)", color: "var(--atlas-fg)", fontFamily: "var(--app-font-mono)" }}>
                  {file.filename}
                </span>
                <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", color: "var(--atlas-phosphor)", flexShrink: 0 }}>
                  +{file.additions}
                </span>
                <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", color: "var(--atlas-ember)", flexShrink: 0 }}>
                  -{file.deletions}
                </span>
              </div>
            )) : (
              <div style={{ fontSize: "var(--ts-sm)", color: "var(--atlas-muted)", opacity: 0.65 }}>No file details available.</div>
            )}
          </div>
          <a
            href={commit.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.06em", color: "var(--atlas-gold)", textDecoration: "none", alignSelf: "flex-start" }}
          >
            View on GitHub →
          </a>
        </div>
      )}
    </div>
  );
}

export function CommitHistorySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <style>{`@keyframes atlas-history-pulse{0%,100%{opacity:.36}50%{opacity:.72}}`}</style>
      {[0, 1, 2].map((idx) => (
        <div key={idx} style={{ padding: "12px", borderRadius: 8, border: "1px solid var(--atlas-border)", background: "var(--atlas-surface)", animation: "atlas-history-pulse 1.4s ease-in-out infinite" }}>
          <div style={{ height: 12, width: "72%", borderRadius: 4, background: "var(--atlas-muted)", opacity: 0.28, marginBottom: 9 }} />
          <div style={{ height: 9, width: "42%", borderRadius: 4, background: "var(--atlas-muted)", opacity: 0.18 }} />
        </div>
      ))}
    </div>
  );
}

export function buildTree(items: GhTreeItem[]): GhTreeNode[] {
  const root: GhTreeNode[] = [];
  const map: Record<string, GhTreeNode> = {};

  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const item of sorted) {
    const parts = item.path.split("/");
    const name = parts[parts.length - 1];
    const ext = name.includes(".") ? name.split(".").pop() : undefined;
    const node: GhTreeNode = { name, path: item.path, type: item.type, ext, children: item.type === "tree" ? [] : undefined };
    map[item.path] = node;

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = map[parentPath];
      if (parent?.children) parent.children.push(node);
    }
  }

  return root;
}

export interface GhTreeNode {
  name: string;
  path: string;
  type: "blob" | "tree";
  ext?: string;
  children?: GhTreeNode[];
}

export function GhTreeNodeRow({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: GhTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isSelected = selectedPath === node.path;

  if (node.type === "tree") {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center",
            gap: 5, padding: `3px 8px 3px ${8 + depth * 12}px`,
            background: "transparent", border: "none", cursor: "pointer",
            borderRadius: 3, transition: "background 100ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(201,162,76,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0, opacity: 0.35, transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 130ms ease" }}>
            <path d="M2 1l4 3-4 3" stroke="var(--atlas-fg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <FolderIcon open={open} />
          <span style={{ fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", textAlign: "left" }}>
            {node.name}
          </span>
        </button>
        {open && node.children?.map((child) => (
          <GhTreeNodeRow key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        gap: 5, padding: `3px 8px 3px ${8 + depth * 12}px`,
        background: isSelected ? "rgba(201,162,76,0.09)" : "transparent",
        border: "none", cursor: "pointer", borderRadius: 3,
        transition: "background 100ms ease",
        borderLeft: isSelected ? "2px solid rgba(201,162,76,0.55)" : "2px solid transparent",
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
    >
      <FileIcon ext={node.ext} />
      <span style={{ fontSize: "var(--ts-caption)", color: isSelected ? "var(--atlas-fg)" : "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.name}
      </span>
    </button>
  );
}


// ── MemoryTab ─────────────────────────────────────────────────────────────────
function MemoryTab({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const { data: project, isLoading } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const updateProject = useUpdateProject();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const memory = project?.memory ?? "";

  const startEdit = () => {
    setDraft(memory);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    updateProject.mutate(
      { id: projectId, data: { memory: draft.trim() || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          setEditing(false);
        },
        onSettled: () => setSaving(false),
      }
    );
  };

  const clear = async () => {
    if (!window.confirm("Clear all project memory? This cannot be undone.")) return;
    setSaving(true);
    updateProject.mutate(
      { id: projectId, data: { memory: null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        },
        onSettled: () => setSaving(false),
      }
    );
  };

  const sMono: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner size="sm" color="atlas" />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "7px 10px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", color: "var(--atlas-muted)", opacity: 0.6 }}>
          {(() => {
            try {
              const p = memory ? JSON.parse(memory) : null;
              const count = p?.entries?.length ?? 0;
              return count > 0 ? `memory · ${count} entries` : "project memory";
            } catch { return "project memory"; }
          })()}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {!editing && memory && (
            <button
              onClick={clear}
              disabled={saving}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "var(--ts-xs)", ...sMono, letterSpacing: "0.06em", color: "var(--atlas-muted)", opacity: 0.35, padding: "2px 4px" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
            >
              clear
            </button>
          )}
          {!editing && (
            <button
              onClick={startEdit}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "var(--ts-xs)", ...sMono, letterSpacing: "0.06em", color: "var(--atlas-gold)", opacity: 0.55, padding: "2px 4px" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
            >
              edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => setEditing(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "var(--ts-xs)", ...sMono, color: "var(--atlas-muted)", opacity: 0.4, padding: "2px 4px" }}
              >
                cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{ background: "var(--atlas-ember)", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: "var(--ts-xs)", ...sMono, letterSpacing: "0.08em", color: "var(--atlas-fg)", padding: "2px 8px", borderRadius: 4, opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "saving…" : "save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }} className="scrollbar-none">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            style={{
              width: "100%", height: "100%", minHeight: 200, resize: "none",
              background: "var(--atlas-surface)", border: "1px solid rgba(201,162,76,0.25)",
              borderRadius: 6, color: "var(--atlas-fg)", fontSize: "var(--ts-caption)",
              ...sMono, lineHeight: 1.65, padding: "10px 12px",
              outline: "none", boxSizing: "border-box",
            }}
          />
        ) : (
          (() => {
            const tierConfig = [
              { tier: 1, label: "CORE", sublabel: "Never decays", color: "rgba(201,162,76,0.9)", bg: "rgba(201,162,76,0.08)", border: "rgba(201,162,76,0.25)" },
              { tier: 2, label: "PATTERNS", sublabel: "180 days", color: "rgba(99,130,239,0.9)", bg: "rgba(99,130,239,0.06)", border: "rgba(99,130,239,0.2)" },
              { tier: 3, label: "MILESTONES", sublabel: "90 days", color: "rgba(34,197,94,0.85)", bg: "rgba(34,197,94,0.06)", border: "rgba(34,197,94,0.18)" },
              { tier: 4, label: "CURRENT", sublabel: "30 days", color: "rgba(251,146,60,0.85)", bg: "rgba(251,146,60,0.06)", border: "rgba(251,146,60,0.18)" },
              { tier: 5, label: "FLEETING", sublabel: "7 days", color: "rgba(148,163,184,0.7)", bg: "rgba(148,163,184,0.04)", border: "rgba(148,163,184,0.15)" },
            ];

            let parsed: { v: number; entries: { tier: number; text: string; createdAt: string; retrievalCount: number }[] } | null = null;
            try { parsed = memory ? JSON.parse(memory) : null; } catch { parsed = null; }

            if (!parsed?.entries?.length) {
              return (
                <div style={{ padding: "48px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: "var(--ts-micro)", color: "var(--atlas-muted)", opacity: 0.4, lineHeight: 1.7, fontFamily: "var(--app-font-mono)" }}>
                    Nothing here yet.<br />Atlas builds memory as you work.
                  </div>
                </div>
              );
            }

            const totalCount = parsed.entries.length;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, letterSpacing: "0.08em", paddingBottom: 4, borderBottom: "1px solid var(--atlas-border)" }}>
                  {totalCount} MEMORY {totalCount === 1 ? "ENTRY" : "ENTRIES"} ACROSS {tierConfig.filter(t => parsed!.entries.some(e => e.tier === t.tier)).length} TIERS
                </div>
                {tierConfig.map(({ tier, label, sublabel, color, bg, border }) => {
                  const entries = parsed!.entries.filter(e => e.tier === tier);
                  if (entries.length === 0) return null;
                  return (
                    <div key={tier} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color, fontWeight: 600 }}>T{tier} · {label}</span>
                        <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.4 }}>{sublabel}</span>
                        <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", color, opacity: 0.5, marginLeft: "auto" }}>{entries.length}</span>
                      </div>
                      {entries.map((entry, i) => (
                        <div key={i} style={{ padding: "7px 10px", borderRadius: 6, background: bg, border: `1px solid ${border}`, fontSize: "var(--ts-caption)", color: "var(--atlas-fg)", lineHeight: 1.55, fontFamily: "var(--app-font-mono)", opacity: 0.85 }}>
                          {entry.text}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

// ── MapTab ────────────────────────────────────────────────────────────────────
function MapSection({ label, items, color = "var(--atlas-muted)" }: { label: string; items: string[]; color?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.5, marginBottom: 7,
      }}>
        {label} <span style={{ opacity: 0.5 }}>({items.length})</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {items.map((item) => (
          <span key={item} style={{
            padding: "3px 8px", borderRadius: 4,
            background: "var(--atlas-glass-bg)", border: "1px solid var(--atlas-border)",
            fontSize: "var(--ts-sm)", fontFamily: "var(--app-font-mono)",
            color, opacity: 0.8,
          }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function MapTab({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const { data: project } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });
  const updateProject = useUpdateProject();

  const scanKey = `atlas-scan-${projectId}`;
  const [scan, setScan] = useState<ProjectScan | null>(() => {
    try {
      const raw = localStorage.getItem(scanKey);
      return raw ? JSON.parse(raw) as ProjectScan : null;
    } catch { return null; }
  });
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToMemory, setSavedToMemory] = useState(false);

  const { data: mapProject } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });
  const token = mapProject?.githubToken ?? null;
  const linkedRepo = (() => { try { return mapProject?.linkedRepo ? JSON.parse(mapProject.linkedRepo) as { fullName: string; defaultBranch: string } : null; } catch { return null; } })();

  const saveMapToMemory = (data: ProjectScan, existingMemory: string) => {
    const scanBlock = [
      `[Project map — ${data.repo} — scanned ${data.scannedAt.slice(0, 10)}]`,
      data.description ? `Description: ${data.description}` : "",
      data.stack?.length ? `Stack: ${data.stack.join(", ")}` : "",
      data.routes?.length ? `Routes (${data.routes.length}): ${data.routes.slice(0, 12).join(", ")}` : "",
      data.pages?.length ? `Pages: ${data.pages.slice(0, 12).join(", ")}` : "",
      data.tables?.length ? `Tables: ${data.tables.join(", ")}` : "",
      `Auth: ${data.authEnabled ? "enabled" : "not found"}`,
      `Total files: ${data.totalFiles}`,
    ].filter(Boolean).join("\n");

    // Replace any previous project map block, or append
    const MAP_RE = /\[Project map —[^\]]*\][^\[]*/g;
    const stripped = existingMemory.replace(MAP_RE, "").trim();
    const updated = stripped ? `${stripped}\n\n${scanBlock}` : scanBlock;

    updateProject.mutate(
      { id: projectId, data: { memory: updated } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }); setSavedToMemory(true); } }
    );
  };

  const handleScan = async () => {
    if (!linkedRepo || !token) return;
    setScanning(true);
    setError(null);
    setSavedToMemory(false);
    try {
      const res = await fetch("/api/github/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-github-token": token },
        body: JSON.stringify({ repo: linkedRepo.fullName, branch: linkedRepo.defaultBranch }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as any;
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as ProjectScan;
      setScan(data);
      try { localStorage.setItem(scanKey, JSON.stringify(data)); } catch {}
      // Auto-save to Atlas memory so every future chat knows the structure
      saveMapToMemory(data, project?.memory ?? "");
    } catch (e: any) {
      setError(e.message ?? "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const sMono: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };

  if (!linkedRepo) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 18px", gap: 12 }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" opacity={0.2}>
          <rect x="1" y="1" width="30" height="30" rx="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 10h16M8 16h12M8 22h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div style={{ textAlign: "center", fontSize: "var(--ts-caption)", color: "var(--atlas-muted)", lineHeight: 1.7 }}>
          Link a repo in the <strong style={{ color: "var(--atlas-fg)", opacity: 0.65 }}>Files</strong> tab first,<br />
          then come back here to map your project.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid var(--atlas-border)",
        flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--ts-micro)", ...sMono, letterSpacing: "0.08em", color: "var(--atlas-muted)", opacity: 0.5 }}>
            {linkedRepo.fullName}
          </div>
          {scan && (
            <div style={{ fontSize: "var(--ts-xs)", ...sMono, color: "var(--atlas-muted)", opacity: 0.3, marginTop: 1 }}>
              Scanned {scan.scannedAt.slice(0, 10)} · {scan.totalFiles} files
            </div>
          )}
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            padding: "5px 12px", borderRadius: 5, fontSize: "var(--ts-micro)", fontWeight: 600,
            ...sMono, letterSpacing: "0.08em",
            background: scanning
              ? "rgba(var(--atlas-muted-rgb),0.15)"
              : "linear-gradient(180deg, var(--atlas-gold) 0%, color-mix(in oklab, var(--atlas-gold) 78%, #6a4a18) 100%)",
            color: scanning ? "var(--atlas-muted)" : "var(--atlas-bg)",
            border: "none", cursor: scanning ? "not-allowed" : "pointer",
            transition: "all 160ms ease", flexShrink: 0,
          }}
        >
          {scanning ? "Scanning…" : scan ? "Re-scan" : "Scan Project"}
        </button>
      </div>

      {/* Scanning spinner */}
      {scanning && (
        <div style={{ padding: "24px 14px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><LoadingSpinner size="sm" color="atlas" /></div>
          <div style={{ marginTop: 10, fontSize: "var(--ts-micro)", ...sMono, color: "var(--atlas-muted)", opacity: 0.45 }}>
            Reading key files and mapping structure…
          </div>
        </div>
      )}

      {/* Error */}
      {error && !scanning && (
        <div style={{
          margin: "10px 12px", padding: "9px 12px", borderRadius: 6,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          fontSize: "var(--ts-caption)", color: "rgba(252,165,165,0.8)",
        }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!scan && !scanning && !error && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 18px", gap: 10 }}>
          <div style={{ fontSize: "var(--ts-sm)", color: "var(--atlas-muted)", lineHeight: 1.8, textAlign: "center", opacity: 0.55, ...sMono }}>
            Click <strong style={{ color: "var(--atlas-gold)" }}>Scan Project</strong> to map<br />
            your routes, components, and tables.
          </div>
        </div>
      )}

      {/* Results */}
      {scan && !scanning && (
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 20px" }} className="scrollbar-none">
          {/* Project name + summary */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: "var(--ts-md)", fontWeight: 600, color: "var(--atlas-fg)", marginBottom: 5 }}>
              {scan.projectName}
            </div>
            <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-fg)", opacity: 0.65, lineHeight: 1.7 }}>
              {scan.summary}
            </div>
          </div>

          {/* Stack badges */}
          {scan.stack && scan.stack.length > 0 && (
            <div style={{ marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 5 }}>
              {scan.stack.map((s) => (
                <span key={s} style={{
                  padding: "3px 9px", borderRadius: 20,
                  background: "rgba(201,162,76,0.08)", border: "1px solid rgba(201,162,76,0.2)",
                  fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", opacity: 0.85,
                }}>
                  {s}
                </span>
              ))}
              {scan.authEnabled && (
                <span style={{
                  padding: "3px 9px", borderRadius: 20,
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
                  fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", color: "rgba(134,239,172,0.85)",
                }}>
                  Auth ✓
                </span>
              )}
            </div>
          )}

          <MapSection label="Routes" items={scan.routes || []} color="rgba(147,197,253,0.8)" />
          <MapSection label="Pages" items={scan.pages || []} color="rgba(216,180,254,0.8)" />
          <MapSection label="Components" items={scan.components || []} color="var(--atlas-fg)" />
          <MapSection label="Supabase Tables" items={scan.tables || []} color="rgba(110,231,183,0.8)" />

          {/* Stats row */}
          <div style={{
            marginTop: 4, marginBottom: 18, padding: "9px 12px", borderRadius: 7,
            background: "rgba(255,255,255,0.025)", border: "1px solid var(--atlas-border)",
            display: "flex", gap: 20,
          }}>
            {[
              ["Routes", scan.routes?.length ?? 0],
              ["Components", scan.components?.length ?? 0],
              ["Tables", scan.tables?.length ?? 0],
              ["Files", scan.totalFiles],
            ].map(([label, val]) => (
              <div key={label as string} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "var(--ts-h3)", fontWeight: 700, color: "var(--atlas-fg)" }}>{val}</div>
                <div style={{ fontSize: "var(--ts-xs)", ...sMono, color: "var(--atlas-muted)", opacity: 0.45, letterSpacing: "0.06em" }}>
                  {label as string}
                </div>
              </div>
            ))}
          </div>

          {/* Memory save status — auto-saved after every scan */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "8px 11px", borderRadius: 6,
            background: savedToMemory ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.025)",
            border: `1px solid ${savedToMemory ? "rgba(34,197,94,0.2)" : "var(--atlas-border)"}`,
            transition: "all 300ms ease",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: savedToMemory ? "#34d399" : "var(--atlas-muted)", opacity: savedToMemory ? 1 : 0.3 }} />
            <span style={{ fontSize: "var(--ts-micro)", ...sMono, color: savedToMemory ? "rgba(134,239,172,0.8)" : "var(--atlas-muted)", opacity: savedToMemory ? 1 : 0.45, letterSpacing: "0.04em" }}>
              {updateProject.isPending ? "Saving to memory…" : savedToMemory ? "Saved to Atlas memory — active in chat" : "Scan to save map to Atlas memory"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Platform detection ────────────────────────────────────────────────────────

// ── RightPanel (tabbed) ──────────────────────────────────────────────────────
function RightPanel({
  projectId,
  entries,
  activeCatch,
  onClose,
  fullscreen,
  onToggleFullscreen,
  onFileContext,
  onLinkedRepoChange,
  pushHistory,
  onRollbackPush,
  onHomeNav,
  forceTab,
  onSendIntent,
  onFillIntent,
  onBackToChat,
  isMobile,
  onMapReadinessChange,
  displayedReadinessScore,
  onSystemNodeMessage,
  onHandover,
  handoverPending,
  lastHandoverHash,
  resolvedNodeIds,
  onResolvedConsumed,
  currentSnapshot,
  onSnapshotChange,
  handoverOpen,
  onHandoverOpenChange,
  sandboxCode,
  onSandboxConsumed,
  previewRefreshTrigger,
  pendingTerminalCommand,
  onTerminalCommandConsumed,
  onCommandComplete,
  wsLens,
  onOpenForge,
  externalForgeNodes,
  onForgeNodesConsumed,
  onForgeCompleted,
  onContinueSession,
}: {
  projectId: number;
  entries: Entry[];
  activeCatch: CatchPayload | null;
  onClose?: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onFileContext: (ctx: string | null) => void;
  onLinkedRepoChange: (repo: LinkedRepo | null) => void;
  pushHistory: PushRecord[];
  onRollbackPush: (record: PushRecord) => Promise<void>;
  onHomeNav: () => void;
  forceTab?: RightTab;
  onSendIntent?: (text: string) => void;
  onFillIntent?: (text: string) => void;
  onBackToChat?: () => void;
  isMobile?: boolean;
  onMapReadinessChange?: (score: number) => void;
  displayedReadinessScore?: number;
  onSystemNodeMessage?: (text: string) => void;
  onHandover?: (payload: { snapshot: HandoverSnapshot; title: string }) => void;
  handoverPending?: boolean;
  lastHandoverHash?: string | null;
  resolvedNodeIds?: string[];
  onResolvedConsumed?: () => void;
  currentSnapshot?: HandoverSnapshot | null;
  onSnapshotChange?: (s: HandoverSnapshot | null) => void;
  handoverOpen?: boolean;
  onHandoverOpenChange?: (open: boolean) => void;
  sandboxCode?: string | null;
  onSandboxConsumed?: () => void;
  previewRefreshTrigger?: number;
  pendingTerminalCommand?: string | null;
  onTerminalCommandConsumed?: () => void;
  onCommandComplete?: (command: string, output: string, exitCode: number | null) => void;
  wsLens?: WorkspaceLens;
  onOpenForge?: () => void;
  externalForgeNodes?: ArchNode[];
  onForgeNodesConsumed?: () => void;
  onForgeCompleted?: () => void;
  onContinueSession?: (sessionId: number | string) => void;
}) {
  const [tab, setTab] = useState<RightTab>(() => {
    try {
      const stored = sessionStorage.getItem("atlas-open-tab");
      if (stored === "map") {
        sessionStorage.removeItem("atlas-open-tab");
        return "map";
      }
    } catch {}
    return "ledger";
  });
  const [ledgerSubTab, setLedgerSubTab] = useState<"entries" | "memory">("entries");

  useEffect(() => {
    if (forceTab) setTab(forceTab);
  }, [forceTab]);

  // Auto-fallback terminal tab when lens changes to one that hides it
  useEffect(() => {
    if (wsLens !== "build" && wsLens !== "scenario" && tab === "terminal") {
      setTab("ledger");
    }
  }, [wsLens, tab]);

  const tabs: { id: RightTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: "ledger",
      label: "Ledger",
      badge: entries.length || undefined,
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="3.5" cy="5" r="0.8" fill="currentColor" opacity={0.5} />
          <circle cx="3.5" cy="8" r="0.8" fill="currentColor" opacity={0.5} />
          <circle cx="3.5" cy="11" r="0.8" fill="currentColor" opacity={0.5} />
        </svg>
      ),
    },
    {
      id: "blueprints",
      label: "Blueprints",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="14" y2="17" />
        </svg>
      ),
    },
    {
      id: "files",
      label: "Files",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M1 5h6l2 2h6v7H1V5z" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1 5V3a1 1 0 011-1h4l2 2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ),
    },
    {
      id: "preview",
      label: "Preview",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1 6h14" stroke="currentColor" strokeWidth="1.1" />
          <circle cx="3.5" cy="4.5" r="0.7" fill="currentColor" opacity={0.5} />
          <circle cx="5.5" cy="4.5" r="0.7" fill="currentColor" opacity={0.5} />
        </svg>
      ),
    },
    {
      id: "memory" as RightTab,
      label: "Memory",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="3.2" cy="5.5" r="0.7" fill="currentColor" opacity={0.45} />
          <circle cx="3.2" cy="8" r="0.7" fill="currentColor" opacity={0.45} />
          <circle cx="3.2" cy="10.5" r="0.7" fill="currentColor" opacity={0.45} />
        </svg>
      ),
    },
    {
      id: "map" as RightTab,
      label: "Flow",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M1 3.5l4-1.5 5 2 4-1.5v9.5l-4 1.5-5-2-4 1.5V3.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M5 2v9.5M10 4v9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      ),
    },
    ...(wsLens === "build" || wsLens === "scenario" ? [{
      id: "terminal" as RightTab,
      label: "Terminal",
      icon: (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 6l3 2.5L4 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
    }] : []),
  ];

  return (
    <div
      style={{
        height: "100%", display: "flex", flexDirection: "column",
        background: "var(--atlas-surface-alt)", overflow: "hidden", minHeight: 0,
      }}
    >
      {/* Tab bar — desktop only; on mobile the MobileTabBar drives navigation */}
      <div
        style={{
          display: isMobile ? "none" : "flex", alignItems: "center",
          flexShrink: 0,
          paddingLeft: 6,
          overflowX: "auto",
          scrollbarWidth: "none",
          whiteSpace: "nowrap",
        }}
      >
        {!isMobile && tabs.filter(t => t.id !== "map").map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "10px 10px",
                background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? "var(--atlas-gold)" : "transparent"}`,
                cursor: "pointer",
                color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
                opacity: active ? 1 : 0.55,
                transition: "all 160ms ease",
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-xs)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: -1,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.opacity = "0.8"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = "0.55"; }}
            >
              {t.icon}
              {t.label}
              {t.badge !== undefined && (
                <span
                  style={{
                    padding: "1px 4px", borderRadius: 3,
                    background: active ? "rgba(201,162,76,0.15)" : "rgba(var(--atlas-muted-rgb),0.15)",
                    fontSize: "var(--ts-tiny)",
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
        {/* Desktop: hand the full thread off to Atlas as a Forge-ready snapshot.
            Distinct from the per-message Forge link — this commits the whole
            conversation. Sized to match neighboring tabs so it reads as a
            primary toolbar action, not a foreign element. */}
        {!isMobile && onHandover && (
          <>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => {
                setTab("map");
                onHandoverOpenChange?.(true);
              }}
              disabled={!currentSnapshot || (currentSnapshot?.definedCount ?? 0) === 0 || !!handoverPending}
              title={
                handoverPending
                  ? "Sending thread to Atlas…"
                  : !currentSnapshot || currentSnapshot.definedCount === 0
                    ? "Define at least one node to send the thread"
                    : "Send the entire conversation to Atlas as a Forge-ready snapshot"
              }
              style={{
                marginRight: 8,
                padding: "4px 10px",
                borderRadius: 4,
                background: "transparent",
                border: `1px solid ${
                  !currentSnapshot || currentSnapshot.definedCount === 0 || handoverPending
                    ? "rgba(var(--atlas-muted-rgb),0.3)"
                    : "rgba(146,64,14,0.55)"
                }`,
                color: !currentSnapshot || currentSnapshot.definedCount === 0 || handoverPending
                  ? "rgba(var(--atlas-muted-rgb),0.6)"
                  : "rgba(230,150,90,0.95)",
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-xs)",
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: !currentSnapshot || currentSnapshot.definedCount === 0 || handoverPending
                  ? "not-allowed"
                  : "pointer",
                transition: "all 160ms ease",
              }}
            >
              {handoverPending ? "Sending…" : "Forge Thread →"}
            </button>
          </>
        )}
        {!isMobile && !onHandover && <div style={{ flex: 1 }} />}

        {/* Mobile: spacer so close/fullscreen stay right-aligned */}
        {isMobile && <div style={{ flex: 1 }} />}

        {/* Fullscreen toggle (mobile only) */}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            title={fullscreen ? "Restore" : "Full screen"}
              aria-label={fullscreen ? "Collapse" : "Expand"}
            style={{
              marginLeft: onClose ? 0 : "auto", marginRight: 2,
              width: 28, height: 28, borderRadius: 6,
              background: "transparent", border: "none",
              color: "var(--atlas-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: 0.5, transition: "opacity 160ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
          >
            {fullscreen ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M5 1H1v4M11 1h4v4M1 11v4h4M15 11v4h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M1 5V1h4M11 1h4v4M1 11v4h4M15 11v4h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}

        {/* Close button (mobile only) */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Dismiss"
            style={{
              marginLeft: onToggleFullscreen ? 0 : "auto", marginRight: 6,
              width: 28, height: 28, borderRadius: 6,
              background: "transparent", border: "none",
              color: "var(--atlas-muted)", fontSize: "var(--ts-base)", lineHeight: 1,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              opacity: 0.5, transition: "opacity 160ms ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
          >
            ×
          </button>
        )}
      </div>

      {/* Tab content */}
      {tab === "ledger" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Sub-tab bar */}
          <div style={{ display: "flex", flexShrink: 0 }}>
            {(["entries", "memory"] as const).map(st => (
              <button
                key={st}
                onClick={() => setLedgerSubTab(st)}
                style={{
                  flex: 1, padding: "8px 0", background: "transparent", border: "none",
                  borderBottom: ledgerSubTab === st ? "2px solid var(--atlas-gold)" : "2px solid transparent",
                  fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: ledgerSubTab === st ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  cursor: "pointer", transition: "all 160ms ease",
                }}
              >
                {st === "entries" ? "Ledger" : "Memory"}
              </button>
            ))}
          </div>
          {/* Sub-tab content */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {ledgerSubTab === "entries"
              ? <LedgerPanel projectId={projectId} entries={entries} activeCatch={activeCatch} pushHistory={pushHistory} onRollbackPush={onRollbackPush} />
              : <MemoryTab projectId={projectId} />
            }
          </div>
        </div>
      )}
      {tab === "blueprints" && <BlueprintsTab projectId={projectId} onContinueSession={onContinueSession} />}
      {tab === "files" && <FilesPanel projectId={projectId} onFileContext={onFileContext} onLinkedRepoChange={onLinkedRepoChange} />}
      {tab === "preview" && <PreviewPanel projectId={projectId} sandboxCode={sandboxCode} onSandboxConsumed={onSandboxConsumed} refreshTrigger={previewRefreshTrigger} />}
      {tab === "memory" && <MemoryTab projectId={projectId} />}
      {tab === "map" && <FlowPanel projectId={projectId} onHomeNav={onHomeNav} onSendIntent={onSendIntent} onFillIntent={onFillIntent} onBackToChat={onBackToChat} onMapReadinessChange={onMapReadinessChange} displayedReadinessScore={displayedReadinessScore} onSystemNodeMessage={onSystemNodeMessage} onHandover={onHandover} handoverPending={handoverPending} lastHandoverHash={lastHandoverHash} resolvedNodeIds={resolvedNodeIds} onResolvedConsumed={onResolvedConsumed} onSnapshotChange={onSnapshotChange} handoverOpen={handoverOpen} onHandoverOpenChange={onHandoverOpenChange} isMobile={isMobile} onOpenForge={onOpenForge} externalForgeNodes={externalForgeNodes} onForgeNodesConsumed={onForgeNodesConsumed} onForgeCompleted={onForgeCompleted} />}
      {tab === "terminal" && (wsLens === "build" || wsLens === "scenario") && <TerminalPanel pendingCommand={pendingTerminalCommand} onCommandConsumed={onTerminalCommandConsumed} onCommandComplete={onCommandComplete} scenarioLens={wsLens === "scenario"} />}
    </div>
  );
}

// ── TerminalPanel ─────────────────────────────────────────────────────────────
type TerminalLine = { text: string; kind: "input" | "output" | "stderr" | "system" | "error" | "warning" | "commentary" };

const TERMINAL_DANGER_PATTERNS: { pattern: RegExp; warning: string }[] = [
  { pattern: /(?:^|\s)git\s+reset\s+--hard(?:\s|$)/, warning: "This will permanently discard all uncommitted changes." },
  { pattern: /(?:^|\s)git\s+push(?=.*(?:^|\s)(?:--force|-f)(?:\s|$))/, warning: "This will overwrite remote history. This cannot be undone." },
  { pattern: /(?:^|\s)rm\s+-rf(?:\s|$)/, warning: "This will permanently delete files." },
  { pattern: /(?:^|\s)git\s+clean\s+-fd(?:\s|$)/, warning: "This will delete all untracked files." },
];

const TERMINAL_SUCCESS_EXPLANATIONS: { pattern: RegExp; explanation: string }[] = [
  { pattern: /^git\s+status(?:\s|$)/, explanation: "[ATLAS] Shows current branch, staged changes, and untracked files." },
  { pattern: /^git\s+push(?:\s|$)/, explanation: "[ATLAS] Changes pushed to GitHub. Replit will pick up the latest commit." },
  { pattern: /^git\s+commit(?:\s|$)/, explanation: "[ATLAS] Snapshot saved to local git history." },
  { pattern: /^git\s+pull(?:\s|$)/, explanation: "[ATLAS] Latest changes pulled from GitHub into your local branch." },
  { pattern: /^ls(?:\s|$)/, explanation: "[ATLAS] Lists files and folders in the current directory." },
  { pattern: /^pwd(?:\s|$)/, explanation: "[ATLAS] Shows your current location in the file system." },
];

function getTerminalWarning(command: string) {
  return TERMINAL_DANGER_PATTERNS.find(({ pattern }) => pattern.test(command))?.warning;
}

function getTerminalSuccessExplanation(command: string) {
  return TERMINAL_SUCCESS_EXPLANATIONS.find(({ pattern }) => pattern.test(command))?.explanation;
}

function TerminalPanel({
  pendingCommand,
  onCommandConsumed,
  onCommandComplete,
  scenarioLens,
}: {
  pendingCommand?: string | null;
  onCommandConsumed?: () => void;
  onCommandComplete?: (command: string, output: string, exitCode: number | null) => void;
  scenarioLens?: boolean;
}) {
  const termTheme = useThemeMode();
  const isParchment = termTheme === "parchment";

  // ── Sync to GitHub state ──────────────────────────────────────────────────
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncFiles, setSyncFiles] = useState<string[]>([]);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncStatus, setSyncStatus] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const [syncResult, setSyncResult] = useState<{ url: string; shortSha: string; filesCommitted: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const poll = () => {
      fetch("/api/self/modified", { credentials: "include" })
        .then(r => r.ok ? r.json() : { files: [] })
        .then((d: any) => setSyncFiles(d.files ?? []))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, []);

  const handlePush = async () => {
    if (syncStatus === "pushing") return;
    setSyncStatus("pushing");
    setSyncError(null);
    setSyncResult(null);
    try {
      const r = await fetch("/api/self/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: syncMsg.trim() || "feat: atlas self-update", files: syncFiles.length > 0 ? syncFiles : undefined }),
      });
      const d = await r.json() as any;
      if (!r.ok) { setSyncStatus("error"); setSyncError(d.error ?? "Push failed"); return; }
      setSyncStatus("done");
      setSyncResult({ url: d.url, shortSha: d.shortSha, filesCommitted: d.filesCommitted });
      setSyncFiles([]);
      setSyncMsg("");
    } catch (err) {
      setSyncStatus("error");
      setSyncError(err instanceof Error ? err.message : "Network error");
    }
  };

  const [input, setInput] = useState("");
  const [lines, setLines] = useState<TerminalLine[]>([
    { text: scenarioLens ? "SCENARIO Terminal  —  explain mode (no execution)" : "Atlas Terminal  —  ready", kind: "system" },
    { text: scenarioLens ? "Commands are NOT executed. Atlas will explain what each command would do." : "Type a command or ask Atlas in Chat to run one for you.", kind: "system" },
    ...(scenarioLens ? [] : [{ text: "Type  help  or  clear  to get started.", kind: "system" as const }]),
  ]);
  const [running, setRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fromAtlasRef = useRef(false);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const killCommand = useCallback(() => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setRunning(false);
    setLines((prev) => [...prev, { text: "[killed]", kind: "system" as const }]);
  }, []);

  const addLine = useCallback((text: string, kind: TerminalLine["kind"]) => {
    const parts = text.split("\n");
    setLines((prev) => [
      ...prev,
      ...parts.filter((p) => p !== "").map((p) => ({ text: p, kind })),
    ]);
  }, []);

  const welcomeLines = useCallback((): TerminalLine[] => [
    { text: scenarioLens ? "SCENARIO Terminal  —  explain mode (no execution)" : "Atlas Terminal  —  ready", kind: "system" },
    { text: scenarioLens ? "Commands are NOT executed. Atlas will explain what each command would do." : "Type a command or ask Atlas in Chat to run one for you.", kind: "system" },
    ...(scenarioLens ? [] : [{ text: "Type  help  or  clear  to get started.", kind: "system" as const }]),
  ], [scenarioLens]);

  const runCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || running) return;

    // Built-in: clear / cls
    if (trimmed === "clear" || trimmed === "cls") {
      setLines(welcomeLines());
      return;
    }

    // Built-in: help
    if (trimmed === "help") {
      addLine(`$ ${trimmed}`, "input");
      addLine(
        `COMMON COMMANDS\n` +
        `───────────────────────────────\n` +
        `git status      see what changed in your repo\n` +
        `git push        send changes to GitHub → triggers deploy\n` +
        `git pull        get latest changes from GitHub\n` +
        `git log         see recent commits\n` +
        `git diff        see exact line changes\n` +
        `ls              list files in this folder\n` +
        `pwd             show current location\n` +
        `cat <file>      read a file's contents\n` +
        `clear           clear the terminal\n\n` +
        `ATLAS COMMANDS\n` +
        `───────────────────────────────\n` +
        `Ask Atlas in Chat and it can suggest\n` +
        `commands to run here automatically.`,
        "output"
      );
      return;
    }

    setRunning(true);
    setCmdHistory((h) => [trimmed, ...h.slice(0, 49)]);
    setHistIdx(-1);
    addLine(`$ ${trimmed}`, "input");

    // SCENARIO mode — explain rather than execute
    if (scenarioLens) {
      addLine("[SCENARIO] Asking Atlas what this command would do…", "system");
      try {
        const r = await fetch("/api/terminal/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: trimmed }),
          credentials: "include",
        });
        const data = await r.json() as { explanation?: string; error?: string };
        if (data.explanation) {
          addLine(`[ATLAS EXPLAINS] ${data.explanation}`, "commentary");
        } else {
          addLine(`Error: ${data.error ?? "Could not generate explanation"}`, "error");
        }
      } catch (err) {
        addLine(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
      setRunning(false);
      return;
    }

    const warning = getTerminalWarning(trimmed);
    if (warning) addLine(`[ATLAS WARNING] ${warning}`, "warning");

    const outputChunks: string[] = [];
    let finalExitCode: number | null = null;

    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;

    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: trimmed }),
        credentials: "include",
        signal: abortCtrl.signal,
      });

      if (!res.ok || !res.body) {
        addLine(`HTTP error: ${res.status}`, "error");
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          let evtName = "output";
          let evtData = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) evtName = line.slice(7).trim();
            else if (line.startsWith("data: ")) evtData = line.slice(6);
          }
          if (!evtData) continue;
          try {
            const payload = JSON.parse(evtData) as string;
            if (evtName === "output") { outputChunks.push(payload); addLine(payload, "output"); }
            else if (evtName === "stderr") { outputChunks.push(payload); addLine(payload, "stderr"); }
            else if (evtName === "error") { outputChunks.push(payload); addLine(payload, "error"); }
            else if (evtName === "done") {
              const meta = JSON.parse(payload) as { exitCode: number | null; durationMs: number };
              finalExitCode = meta.exitCode;
              addLine(`[exit ${meta.exitCode ?? "?"} · ${meta.durationMs}ms]`, "system");
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // user killed it — already handled by killCommand
      } else {
        addLine(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    }

    abortCtrlRef.current = null;

    if (finalExitCode === 0) {
      const explanation = getTerminalSuccessExplanation(trimmed);
      if (explanation) addLine(explanation, "commentary");
    }

    setRunning(false);

    if (fromAtlasRef.current && onCommandComplete) {
      const fullOutput = outputChunks.join("\n").trim();
      if (fullOutput) {
        onCommandComplete(trimmed, fullOutput.slice(0, 4000), finalExitCode);
      }
    }
    fromAtlasRef.current = false;
  }, [running, addLine, onCommandComplete, scenarioLens, welcomeLines]);

  useEffect(() => {
    if (pendingCommand) {
      fromAtlasRef.current = true;
      setInput("");
      runCommand(pendingCommand);
      onCommandConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCommand]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const cmd = input;
      setInput("");
      runCommand(cmd);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(next);
      setInput(cmdHistory[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setInput(next === -1 ? "" : cmdHistory[next] ?? "");
    }
  };

  // ── Theme-aware terminal palette ──────────────────────────────────────────
  const termBg      = isParchment ? "#F4EFE6" : "#0A0908";
  const termInputBg = isParchment ? "#EAE4D8" : "var(--atlas-bg)";
  const termBorder  = isParchment ? "rgba(160,130,90,0.28)" : "var(--atlas-surface)";
  const termPrompt  = isParchment ? "#8B3E0E" : "rgba(201,162,76,0.75)";
  const termCaret   = isParchment ? "rgba(139,62,14,0.9)" : "rgba(201,162,76,0.9)";
  const termFgText  = isParchment ? "#2A1A0E" : "var(--atlas-fg)";

  const colorFor = (kind: TerminalLine["kind"]) => {
    if (kind === "input")      return isParchment ? "rgba(146,64,14,0.88)"  : "rgba(201,162,76,0.92)";
    if (kind === "stderr")     return isParchment ? "rgba(160,70,10,0.9)"   : "rgba(252,165,100,0.88)";
    if (kind === "system")     return isParchment ? "rgba(100,70,40,0.55)"  : "rgba(var(--atlas-muted-rgb),0.65)";
    if (kind === "error")      return isParchment ? "rgba(170,30,30,0.9)"   : "rgba(252,100,100,0.88)";
    if (kind === "warning")    return isParchment ? "#8B3E0E"               : "var(--atlas-gold)";
    if (kind === "commentary") return isParchment ? "rgba(100,70,40,0.72)"  : "var(--muted-foreground)";
    return termFgText;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: termBg, overflow: "hidden" }}>
      {/* ── Sync to GitHub bar ─────────────────────────────────────────── */}
      {!scenarioLens && (
        <div style={{ borderBottom: `1px solid ${termBorder}`, flexShrink: 0 }}>
          {/* Collapsed bar */}
          <button
            onClick={() => { setSyncOpen(o => !o); setSyncStatus("idle"); setSyncError(null); setSyncResult(null); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 7,
              padding: "7px 13px", background: "transparent", border: "none",
              cursor: "pointer", textAlign: "left",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
              <path d="M5.5 1v9M1 5.5l4.5-4.5 4.5 4.5" stroke={isParchment ? "#8B5E3C" : "rgba(201,162,76,0.7)"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.1em", color: isParchment ? "#8B5E3C" : "rgba(201,162,76,0.7)", textTransform: "uppercase" }}>
              Sync to GitHub
            </span>
            {syncFiles.length > 0 && (
              <span style={{
                marginLeft: "auto", padding: "1px 6px", borderRadius: 3,
                background: "rgba(201,162,76,0.12)", border: "0.5px solid rgba(201,162,76,0.3)",
                fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                color: "var(--atlas-gold)",
              }}>
                {syncFiles.length} modified
              </span>
            )}
            {syncStatus === "done" && syncResult && (
              <span style={{
                marginLeft: "auto", padding: "1px 6px", borderRadius: 3,
                background: "rgba(52,211,153,0.08)", border: "0.5px solid rgba(52,211,153,0.25)",
                fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                color: "#34d399",
              }}>
                ✓ pushed {syncResult.shortSha}
              </span>
            )}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ marginLeft: syncFiles.length > 0 || (syncStatus === "done" && syncResult) ? 6 : "auto", flexShrink: 0, transform: syncOpen ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}>
              <path d="M1 2.5l3 3 3-3" stroke={isParchment ? "#8B5E3C" : "rgba(201,162,76,0.5)"} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Expanded panel */}
          {syncOpen && (
            <div style={{ padding: "0 13px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* File list */}
              {syncFiles.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {syncFiles.map(f => (
                    <div key={f} style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: isParchment ? "rgba(100,70,40,0.7)" : "rgba(var(--atlas-muted-rgb),0.7)", letterSpacing: "0.04em", padding: "2px 0" }}>
                      · {f}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: isParchment ? "rgba(100,70,40,0.5)" : "rgba(var(--atlas-muted-rgb),0.45)", letterSpacing: "0.05em" }}>
                  No tracked edits yet — Atlas writes files here when it self-updates.
                </div>
              )}

              {/* Commit message input */}
              <input
                value={syncMsg}
                onChange={e => setSyncMsg(e.target.value)}
                placeholder="Commit message (optional)"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  background: isParchment ? "rgba(240,228,210,0.6)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${termBorder}`,
                  borderRadius: 5, padding: "6px 9px",
                  fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-sm)",
                  color: termFgText, outline: "none",
                }}
              />

              {/* Error / result */}
              {syncStatus === "error" && syncError && (
                <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "rgba(252,100,100,0.88)", lineHeight: 1.5 }}>
                  ✗ {syncError}
                </div>
              )}
              {syncStatus === "done" && syncResult && (
                <a
                  href={syncResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "#34d399", letterSpacing: "0.04em", textDecoration: "none" }}
                >
                  ✓ {syncResult.filesCommitted} file{syncResult.filesCommitted !== 1 ? "s" : ""} pushed · {syncResult.shortSha} →
                </a>
              )}

              {/* Push button */}
              <button
                onClick={handlePush}
                disabled={syncStatus === "pushing" || syncFiles.length === 0}
                style={{
                  padding: "7px", borderRadius: 5,
                  background: syncFiles.length === 0 ? "transparent" : "rgba(146,64,14,0.22)",
                  border: `1px solid ${syncFiles.length === 0 ? termBorder : "rgba(146,64,14,0.4)"}`,
                  color: syncFiles.length === 0 ? "rgba(var(--atlas-muted-rgb),0.4)" : "rgba(230,150,90,0.9)",
                  fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em",
                  textTransform: "uppercase", cursor: syncFiles.length === 0 ? "not-allowed" : "pointer",
                  transition: "all 160ms ease",
                }}
              >
                {syncStatus === "pushing" ? "Pushing…" : "Push to GitHub"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Output log */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          flex: 1, overflowY: "auto", padding: "12px 14px",
          fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-label)", lineHeight: 1.7,
          cursor: "text",
        }}
      >
        {lines.map((ln, i) => (
          i === 0 && !scenarioLens && ln.text.includes("ready") ? (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, color: colorFor(ln.kind), whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: "#4ade80",
                boxShadow: "0 0 5px rgba(74,222,128,0.7)",
                display: "inline-block",
                animation: "atlas-pulse 2.4s ease-in-out infinite",
              }} />
              {ln.text}
            </div>
          ) : (
            <div key={i} style={{ color: colorFor(ln.kind), whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {ln.text}
            </div>
          )
        ))}
        {running && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, color: "rgba(var(--atlas-muted-rgb),0.6)" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(201,162,76,0.55)", display: "inline-block", animation: "atlas-pulse 1.2s ease-in-out infinite" }} />
            running…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {/* Input row */}
      <div style={{
        borderTop: `1px solid ${termBorder}`, padding: "9px 13px",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        background: termInputBg,
      }}>
        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-body)", color: termPrompt, flexShrink: 0 }}>$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={running}
          placeholder={running ? "running…" : "enter command"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-label)",
            color: termFgText,
            caretColor: termCaret,
          }}
        />
        {running ? (
          <button
            onClick={killCommand}
            title="Kill running command"
            style={{
              flexShrink: 0, padding: "3px 10px", borderRadius: 4,
              background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.4)",
              color: "rgba(252,100,100,0.9)", fontSize: "var(--ts-sm)", fontFamily: "var(--app-font-mono)",
              fontWeight: 600, letterSpacing: "0.08em", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="rgba(252,100,100,0.9)">
              <rect width="8" height="8" rx="1" />
            </svg>
            kill
          </button>
        ) : input.trim() && (
          <button
            onClick={() => { const cmd = input; setInput(""); runCommand(cmd); }}
            style={{
              flexShrink: 0, padding: "3px 10px", borderRadius: 4,
              background: "rgba(146,64,14,0.22)", border: "1px solid rgba(146,64,14,0.4)",
              color: "rgba(230,150,90,0.88)", fontSize: "var(--ts-sm)", fontFamily: "var(--app-font-mono)",
              fontWeight: 600, letterSpacing: "0.08em", cursor: "pointer",
            }}
          >
            run
          </button>
        )}
      </div>
    </div>
  );
}

// ── MobileTabBar ─────────────────────────────────────────────────────────────
function MobileTabBar({
  activeTab,
  onTabChange,
  entryCount,
  activeCatch,
}: {
  activeTab: "chat" | "ledger" | "blueprints" | "files" | "map" | "preview";
  onTabChange: (tab: "chat" | "ledger" | "blueprints" | "files" | "map" | "preview") => void;
  entryCount: number;
  activeCatch: boolean;
}) {
  const [, navTo] = useLocation();
  const tabs: { id: "chat" | "ledger" | "blueprints" | "files" | "map" | "preview"; label: string; icon: React.ReactNode; badge?: number; alert?: boolean }[] = [
    {
      id: "chat",
      label: "Chat",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: "ledger",
      label: "Ledger",
      badge: entryCount > 0 ? entryCount : undefined,
      alert: activeCatch,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <line x1="9" y1="12" x2="15" y2="12" />
          <line x1="9" y1="16" x2="13" y2="16" />
        </svg>
      ),
    },
    {
      id: "files",
      label: "Files",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: "preview",
      label: "Preview",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="15" rx="2" />
          <path d="M2 8h20" />
          <circle cx="5" cy="5.5" r="0.9" fill="currentColor" opacity={0.5} />
          <circle cx="8" cy="5.5" r="0.9" fill="currentColor" opacity={0.5} />
          <path d="M8 22h8M12 18v4" />
        </svg>
      ),
    },
    {
      id: "map",
      label: "Flow",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="2" />
          <circle cx="4" cy="4" r="1.5" />
          <circle cx="20" cy="4" r="1.5" />
          <circle cx="4" cy="20" r="1.5" />
          <circle cx="20" cy="20" r="1.5" />
          <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
          <line x1="18.5" y1="5.5" x2="13.5" y2="10.5" />
          <line x1="5.5" y1="18.5" x2="10.5" y2="13.5" />
          <line x1="18.5" y1="18.5" x2="13.5" y2="13.5" />
        </svg>
      ),
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        zIndex: 200,
        background: "var(--atlas-surface)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderTop: "1px solid rgba(var(--atlas-gold-rgb),0.12)",
        display: "flex",
        alignItems: "stretch",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map(({ id, label, icon, badge, alert }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => { if (id === "map") { navTo("/map"); } else { onTabChange(id); } }}
            aria-label={id === "chat" ? "Open chat" : id === "ledger" ? "Open ledger" : id === "files" ? "Open files" : id === "preview" ? "Toggle preview" : "Open map"}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
              transition: "color 180ms ease",
              position: "relative",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {/* Active indicator bar at top */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "20%",
                right: "20%",
                height: 2,
                borderRadius: "0 0 2px 2px",
                background: active ? "var(--atlas-gold)" : "transparent",
                transition: "background 180ms ease",
              }}
            />
            {/* Badge / alert dot */}
            {(badge !== undefined || alert) && (
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  right: "calc(50% - 14px)",
                  minWidth: 14,
                  height: 14,
                  borderRadius: 7,
                  background: alert ? "var(--atlas-ember)" : "rgba(201,162,76,0.8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--ts-tiny)",
                  fontFamily: "var(--app-font-mono)",
                  color: "#fff",
                  fontWeight: 700,
                  padding: "0 3px",
                  boxShadow: alert ? "0 0 8px rgba(146,64,14,0.6)" : "none",
                }}
              >
                {badge !== undefined ? (badge > 9 ? "9+" : String(badge)) : "!"}
              </div>
            )}
            {icon}
            <span
              style={{
                fontSize: "var(--ts-xs)",
                fontFamily: "var(--app-font-mono)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WorkspaceOnboardingCoach({
  isMobile,
  dismissed,
  onDismiss,
}: {
  isMobile: boolean;
  dismissed: Record<OnboardingCoachId, boolean>;
  onDismiss: (id: OnboardingCoachId) => void;
}) {
  const marks: Array<{ id: OnboardingCoachId; label: string; text: string }> = [
    { id: "chat", label: "Chat tab", text: "Talk to Atlas. Describe what you're building." },
    { id: "ledger", label: "Ledger tab", text: "Every decision you make gets logged here." },
    { id: "flow", label: "Flow tab", text: "Your thinking becomes a visual map." },
  ];
  const visibleMarks = marks.filter((mark) => !dismissed[mark.id]);
  if (visibleMarks.length === 0) return null;

  const placement: Record<OnboardingCoachId, React.CSSProperties> = isMobile
    ? {
        chat: { left: 8, bottom: 78, width: "30%" },
        ledger: { left: "35%", bottom: 78, width: "30%" },
        flow: { right: 8, bottom: 78, width: "30%" },
      }
    : {
        chat: { left: "6vw", bottom: 112, width: 260 },
        ledger: { right: 300, top: 94, width: 260 },
        flow: { right: 24, top: 94, width: 260 },
      };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 700, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--atlas-bg)", opacity: 0.72 }} />
      {visibleMarks.map((mark) => (
        <div
          key={mark.id}
          style={{
            position: "absolute",
            ...placement[mark.id],
            background: "var(--atlas-surface)",
            border: "1px solid var(--atlas-border)",
            borderRadius: 12,
            padding: isMobile ? "10px 9px" : "14px 15px",
            color: "var(--atlas-fg)",
            pointerEvents: "auto",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--atlas-gold)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: isMobile ? 9 : 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-gold)" }}>
              {mark.label}
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--atlas-fg)", fontSize: isMobile ? 11 : 13, lineHeight: 1.45 }}>
            {mark.text}
          </p>
          <button
            type="button"
            onClick={() => onDismiss(mark.id)}
            style={{
              marginTop: 10,
              width: "100%",
              border: "1px solid var(--atlas-gold)",
              background: "var(--atlas-gold)",
              color: "var(--atlas-bg)",
              borderRadius: 999,
              padding: isMobile ? "7px 8px" : "8px 10px",
              fontSize: isMobile ? 9 : 10,
              fontWeight: 800,
              fontFamily: "var(--app-font-mono)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Got it
          </button>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: isMobile ? undefined : "100%",
              bottom: isMobile ? "100%" : undefined,
              width: 1,
              height: 18,
              background: "var(--atlas-gold)",
              opacity: 0.8,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Workspace ────────────────────────────────────────────────────────────────
export default function Workspace() {
  const { projectId } = useParams();
  const [, setLocation] = useLocation();
  const id = Number(projectId);
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const isMobile = useIsMobile() && !isDesktop;
  const isTinyScreen = useIsTinyScreen();
  useRequireAuth();

  const {
    input, setInput,
    attachedFiles, setAttachedFiles,
    inputFocused, setInputFocused,
    firstRunDismissed, setFirstRunDismissed,
    firstRunInput, setFirstRunInput,
    textareaRef,
    fileInputRef,
  } = useComposerDraft();


  const [planStates, setPlanStates] = useState<Map<number, PlanState>>(() => new Map());
  const [planExecutions, setPlanExecutions] = useState<Map<number, PlanExecution>>(() => new Map());
  const [activeCatch, setActiveCatch] = useState<CatchPayload | null>(null);

  // Session bootstrap deps for useChatStream — moved up from below so the hook
  // can own sessionId/ensureSessionId. project/projectLoading/hasForgeNodes etc.
  // still live in their original spot below.
  const projectState = useProjectState(Number.isFinite(id) ? id : null);
  const useProjectStateFallback = !!projectState.error;
  const { data: fallbackSessions, isLoading: fallbackSessionsLoading } = useListSessions(id, {
    query: { enabled: !!id && useProjectStateFallback, queryKey: getListSessionsQueryKey(id) },
  });
  const sessions = projectState.activeSession ? [projectState.activeSession] : fallbackSessions;
  const sessionsLoading = projectState.loading && !projectState.activeSession && !useProjectStateFallback
    ? true
    : fallbackSessionsLoading;
  const createSession = useCreateSession();

  // ── Hoisted deps for useChatStream (B2c) ────────────────────────────────────
  const { playSend, playCatch, playCommit, playPark, playNavigate } = useSound();
  const {
    wsModel, setWsModel,
    wsLens, setWsLensRaw,
    showLensPicker, setShowLensPicker,
    detectedLens, setDetectedLens,
    showScenarioPrompt, setShowScenarioPrompt,
    pendingLensSwitch, setPendingLensSwitch,
    scenarioBuffer, setScenarioBuffer,
    showWsModelSheet, setShowWsModelSheet,
    sendCtxRef,
    scenarioStartIdxRef,
  } = useChatLens(id);
  const [leftTab, setLeftTab] = useState<"chat" | "diff" | "blueprints" | "terminal">("chat");
  const [mobileTab, setMobileTab] = useState<"chat" | "ledger" | "blueprints" | "files" | "map" | "preview">(() =>
    new URLSearchParams(window.location.search).get("view") === "flow" ? "map" : "chat"
  );
  const [autoNameKey, setAutoNameKey] = useState(0);
  const [pendingResolvedNodeIds, setPendingResolvedNodeIds] = useState<string[]>([]);
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [forgeContext, setForgeContext] = useState<string | null>(() => {
    try { return sessionStorage.getItem(`atlas-forge-ctx-${id}`) ?? null; } catch { return null; }
  });
  useEffect(() => {
    try { setForgeContext(sessionStorage.getItem(`atlas-forge-ctx-${id}`) ?? null); } catch { setForgeContext(null); }
  }, [id]);
  const { data: fallbackEntries } = useListEntries(id, {}, {
    query: { enabled: !!id && useProjectStateFallback, queryKey: getListEntriesQueryKey(id, {}) },
  });
  const entries = useMemo<Entry[]>(() => {
    if (!projectState.state) return fallbackEntries ?? [];
    const entryMap = new Map<number, Entry>();
    [...projectState.decisions, ...projectState.parked].forEach((entry) => {
      entryMap.set(entry.id, entry);
    });
    return [...entryMap.values()];
  }, [fallbackEntries, projectState.decisions, projectState.parked, projectState.state]);

  const {
    messages,
    setMessages,
    messagesRef,
    historyMsgCountRef,
    priorLoadedRef: priorLoaded,
    sessionId,
    setSessionId,
    ensureSessionId,
    chatPending,
    setChatPending,
    activityStream,
    setActivityStream,
    abortControllerRef,
    handleStop,
    memoryChips,
    setMemoryChips,
    doSend,
    handleRegenerate,
  } = useChatStream(id, {
    sessions,
    sessionsLoading,
    createSession,
    queryClient,
    getListSessionsQueryKey,
    mapPriorMessage: (m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      intentType: m.intentType,
      sentAt: m.createdAt,
    }),
    entries,
    fileContext,
    forgeContext,
    sendCtxRef,
    setDetectedLens,
    setScenarioBuffer,
    setLeftTab,
    setMobileTab,
    setActiveCatch,
    setPendingResolvedNodeIds,
    setAutoNameKey,
    playCatch,
    getGetProjectQueryKey,
    getListProjectsQueryKey,
    reportError,
  });

  // Reset workspace-owned chat state when the project changes.
  // (messages / sessionId / priorLoaded / historyMsgCountRef portion lives in useChatStream)
  useEffect(() => {
    setPlanStates(new Map());
    setPlanExecutions(new Map());
    setActiveCatch(null);
    homePlanLoadedRef.current = false;
    // Note: abort/chatPending/activityStream reset is owned by useChatStream.
    // Reset auto-prime guards so a fresh ?source=handoff load can seed its first message.
    initialSent.current = false;
    importPrimed.current = false;
    homeHandoffPrimed.current = false;
  }, [id]);
  // useSound / memoryChips / leftTab moved above (consumed by useChatStream).
  const [pushHistory, setPushHistory] = useState<PushRecord[]>([]);
  const [sessionPrUrl, setSessionPrUrl] = useState<string | null>(null);
  const [rightOpen, setRightOpen] = useState(() =>
    new URLSearchParams(window.location.search).get("view") === "flow"
  );
  const [showProfile, setShowProfile] = useState(false);
  useEffect(() => {
    const open = () => setShowProfile(true);
    window.addEventListener("axiom:open-account-hub", open);
    return () => window.removeEventListener("axiom:open-account-hub", open);
  }, []);

  // Atlas Core center-button → switch to chat tab + focus composer
  useEffect(() => {
    const onFocus = () => {
      setMobileTab("chat");
      setRightOpen(false);
      const el = textareaRef.current;
      if (!el) return;
      setTimeout(() => {
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
        el.focus();
      }, 80);
    };
    window.addEventListener("atlas:focus-composer", onFocus);
    return () => window.removeEventListener("atlas:focus-composer", onFocus);
  }, []);

  const [chatWidthPct, setChatWidthPct] = useState(45);
  const resizeDrag = useRef({ active: false, startX: 0, startPct: 45 });
  const containerRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback((clientX: number) => {
    resizeDrag.current = { active: true, startX: clientX, startPct: chatWidthPct };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [chatWidthPct]);

  const doResize = useCallback((clientX: number) => {
    if (!resizeDrag.current.active || !containerRef.current) return;
    const totalW = containerRef.current.offsetWidth;
    const delta = clientX - resizeDrag.current.startX;
    const newPct = Math.min(70, Math.max(25, resizeDrag.current.startPct + (delta / totalW) * 100));
    setChatWidthPct(newPct);
  }, []);

  const endResize = useCallback(() => {
    resizeDrag.current.active = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => doResize(e.clientX);
    const onTouchMove = (e: TouchEvent) => { if (resizeDrag.current.active) { e.preventDefault(); doResize(e.touches[0].clientX); } };
    const onUp = () => endResize();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [doResize, endResize]);

  // useChatLens destructure moved above (consumed by useChatStream).
  const [rightFullscreen, setRightFullscreen] = useState(false);
  const [desktopRightFull, setDesktopRightFull] = useState(false);
  const [showSrcPicker, setShowSrcPicker] = useState(false);
  const [srcReadLoading, setSrcReadLoading] = useState(false);
  const [showDeepDiveMenu, setShowDeepDiveMenu] = useState(false);
  const [deepDiveCopied, setDeepDiveCopied] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [switchToExpanded, setSwitchToExpanded] = useState(false);
  const [switchProjectDeleteId, setSwitchProjectDeleteId] = useState<number | null>(null);
  const projectBtnRef = useRef<HTMLButtonElement>(null);
  const [showViewMenu, setShowViewMenu] = useState(false);
  // Close portaled header dropdowns on scroll/resize so they don't float off their anchors.
  useEffect(() => {
    if (!showProjectMenu) return;
    const close = () => { setShowProjectMenu(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showProjectMenu]);

  const setWsLens = useCallback((newLens: WorkspaceLens) => {
    const currentMessages = messages;
    if (wsLens === "scenario" && scenarioStartIdxRef.current >= 0 && currentMessages.length > scenarioStartIdxRef.current) {
      setPendingLensSwitch(newLens);
      setShowScenarioPrompt(true);
      return;
    }
    setWsLensRaw(newLens);
    setDetectedLens(null);
    try { localStorage.setItem(`atlas-ws-lens-v2-${id}`, newLens); } catch {}
    if (newLens === "scenario") {
      scenarioStartIdxRef.current = currentMessages.length;
    } else {
      scenarioStartIdxRef.current = -1;
    }
    const cfg = LENS_CONFIG[newLens];
    if (cfg.model) setWsModel(cfg.model);
    setShowLensPicker(false);
  }, [wsLens, messages, id]);

  // Warn on page-leave if an unsaved scenario is in progress
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (wsLens === "scenario" && scenarioStartIdxRef.current >= 0) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [wsLens]);

  // Auto-fallback terminal tab when switching to lenses that don't support it
  useEffect(() => {
    if (wsLens !== "build" && wsLens !== "scenario" && leftTab === "terminal") {
      setLeftTab("chat");
    }
  }, [wsLens, leftTab]);

  // mobileTab moved above (consumed by useChatStream).
  const [onboardingCoachVisible, setOnboardingCoachVisible] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("onboarding") === "true"
        && !localStorage.getItem("axiom_onboarding_complete");
    } catch {
      return false;
    }
  });
  const [onboardingCoachDismissed, setOnboardingCoachDismissed] = useState<Record<OnboardingCoachId, boolean>>({
    chat: false,
    ledger: false,
    flow: false,
  });
  const [showDrawer, setShowDrawer] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [showForgeExternal, setShowForgeExternal] = useState(false);
  const [forgePreloadContent, setForgePreloadContent] = useState<string | undefined>(undefined);
  const [externalForgeNodes, setExternalForgeNodes] = useState<ArchNode[]>([]);
  const [forgeState, setForgeState] = useState<ForgeState | null>(null);
  // forgeContext state + reload effect moved above (consumed by useChatStream).
  // Explicit state captured at pill-open time so TheForge always gets a stable context snapshot
  const [forgeActiveProjectName, setForgeActiveProjectName] = useState<string | undefined>(undefined);
  const [forgeActiveProjectId, setForgeActiveProjectId] = useState<number | undefined>(undefined);
  // autoNameKey moved above (consumed by useChatStream).
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [trustMode, setTrustMode] = useState<"review" | "auto">("review");
  const [autoRunCmd] = useState<string>("");
  const [previewRefreshTrigger, setPreviewRefreshTrigger] = useState(0);

  const importSource = (() => {
    try { return new URLSearchParams(window.location.search).get("source") ?? null; } catch { return null; }
  })();
  const isHomeHandoff = importSource === "home-handoff";
  const [homeHandoffMeta, setHomeHandoffMeta] = useState<HomeHandoffMeta | null>(() => {
    try {
      const raw = sessionStorage.getItem(`atlas-home-handoff-${id}`);
      return raw ? JSON.parse(raw) as HomeHandoffMeta : null;
    } catch { return null; }
  });
  const [showHomeHandoffBanner, setShowHomeHandoffBanner] = useState(() => {
    try { return isHomeHandoff && sessionStorage.getItem(`atlas-home-handoff-banner-${id}`) !== "1"; } catch { return isHomeHandoff; }
  });
  const [showHomeHandoffDrawer, setShowHomeHandoffDrawer] = useState(false);
  const importSourceLabel = importSource === "compani" ? "Compani Blueprints" : importSource === "axiom" ? "Axiom" : importSource ? importSource.charAt(0).toUpperCase() + importSource.slice(1) : null;
  const [showAxiomBanner, setShowAxiomBanner] = useState(() => {
    try {
      const dismissed = localStorage.getItem(`atlas-axiom-banner-${id}`);
      if (dismissed) return false;
      return !!new URLSearchParams(window.location.search).get("source");
    } catch { return false; }
  });
  const dismissAxiomBanner = () => {
    try { localStorage.setItem(`atlas-axiom-banner-${id}`, "1"); } catch { /* ignore */ }
    setShowAxiomBanner(false);
  };

  useEffect(() => {
    if (!isHomeHandoff) return;
    let meta = homeHandoffMeta;
    if (!meta) {
      try {
        const raw = sessionStorage.getItem(`atlas-home-handoff-${id}`);
        meta = raw ? JSON.parse(raw) as HomeHandoffMeta : null;
        setHomeHandoffMeta(meta);
      } catch {}
    }
    try { sessionStorage.setItem(`atlas-home-handoff-banner-${id}`, "1"); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isHomeHandoff]);

  useEffect(() => {
    if (!showHomeHandoffBanner || showHomeHandoffDrawer) return;
    const timer = setTimeout(() => setShowHomeHandoffBanner(false), 4000);
    return () => clearTimeout(timer);
  }, [showHomeHandoffBanner, showHomeHandoffDrawer]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    try { sessionStorage.setItem("atlas-active-project-id", String(id)); } catch {}
  }, [id]);

  const dismissOnboardingCoach = useCallback((markId: OnboardingCoachId) => {
    setOnboardingCoachDismissed((prev) => {
      const next = { ...prev, [markId]: true };
      if (next.chat && next.ledger && next.flow) {
        setOnboardingCoachVisible(false);
        try {
          localStorage.setItem("axiom_onboarding_complete", "true");
          const url = new URL(window.location.href);
          url.searchParams.delete("onboarding");
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        } catch {}
      }
      return next;
    });
  }, []);

  // Spec → Build handoff modal state
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [handoffSelected, setHandoffSelected] = useState<Set<number>>(new Set());


  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameEscapeRef = useRef(false);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [cloningProject, setCloningProject] = useState(false);
  const updateProjectHeader = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const createProjectMutation = useCreateProject();

  const handleDeleteProjectFromSwitcher = useCallback((projectToDeleteId: number) => {
    deleteProjectMutation.mutate({ id: projectToDeleteId }, {
      onSuccess: () => {
        queryClient.setQueryData(getListProjectsQueryKey(), (current: unknown) => (
          Array.isArray(current) ? current.filter((p: any) => p?.id !== projectToDeleteId) : current
        ));
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setSwitchProjectDeleteId(null);
        if (projectToDeleteId === id) {
          setShowProjectMenu(false);
          setLocation("/home");
        }
      },
      onError: () => {
        toast.error("Project could not be deleted.");
      },
    });
  }, [deleteProjectMutation, id, queryClient, setLocation]);

  const ATLAS_SRC_FILES = [
    { label: "workspace.tsx", path: "artifacts/atlas/src/pages/workspace.tsx", hint: "main UI · ~4k lines" },
    { label: "home.tsx", path: "artifacts/atlas/src/pages/home.tsx", hint: "home page" },
    { label: "chat.ts", path: "artifacts/api-server/src/routes/chat.ts", hint: "AI + memory route" },
    { label: "self.ts", path: "artifacts/api-server/src/routes/self.ts", hint: "self-repair route" },
    { label: "projects.ts", path: "artifacts/api-server/src/routes/projects.ts", hint: "projects API" },
  ];

  const handleReadSrc = async (filePath: string) => {
    setShowSrcPicker(false);
    setSrcReadLoading(true);
    try {
      const res = await fetch(`/api/self/read?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { content: string; lines: number };
      const label = filePath.split("/").pop() ?? filePath;
      setFileContext(`// ${label} (${json.lines} lines)\n${json.content}`);
    } catch {
      // silent
    } finally {
      setSrcReadLoading(false);
    }
  };

  // fileContext moved above (consumed by useChatStream).
  // chatPending owned by useChatStream.
  const [agenticMode, setAgenticMode] = useState(true);
  const [agenticIterCount, setAgenticIterCount] = useState(0);
  useEffect(() => { setAgenticIterCount(0); }, [sessionId]);
  useEffect(() => { if (!agenticMode) setAgenticIterCount(0); }, [agenticMode]);
  // activityStream owned by useChatStream.
  const [pendingPhraseIdx, setPendingPhraseIdx] = useState(0);
  const [linkedRepo, setLinkedRepo] = useState<LinkedRepo | null>(null);

  const PENDING_PHRASES = [
    "Loading context…",
    "Reviewing your decisions…",
    "Thinking…",
    "Composing a response…",
  ];

  useEffect(() => {
    if (!chatPending) { setPendingPhraseIdx(0); return; }
    const t = setInterval(() => setPendingPhraseIdx(i => (i + 1) % PENDING_PHRASES.length), 2400);
    return () => clearInterval(t);
  }, [chatPending]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatPanelScrollRef = useRef<HTMLDivElement>(null);
  const [showWsScrollBtn, setShowWsScrollBtn] = useState(false);
  const initialSent = useRef(false);
  // abortControllerRef owned by useChatStream.
  const importPrimed = useRef(false);
  const touchStartX = useRef(0);
  const homeHandoffDbLoadedRef = useRef<number | null>(null);
  const homePlanLoadedRef = useRef(false);

  const { data: allProjects } = useListProjects();
  // projectState / useProjectStateFallback moved above (consumed by useChatStream).
  const { data: fallbackProject, isLoading: fallbackProjectLoading } = useGetProject(id, {
    query: { enabled: !!id && useProjectStateFallback, queryKey: getGetProjectQueryKey(id) },
  });
  const project = projectState.project ?? fallbackProject;
  const projectLoading = projectState.loading && !project ? true : fallbackProjectLoading;
  const githubPushToken = useGithubPushToken(project?.githubToken);
  // True when forge has run this session OR when saved AxiomFlow nodes exist for this project
  const hasForgeNodes = forgeContext !== null ||
    Object.keys((project?.nodeState ?? {}) as Record<string, unknown>)
      .some(k => !["auth", "db", "api", "state", "ui", "logic"].includes(k));
  const isBrandNewProject = messages.length === 0 && !hasForgeNodes;

  useEffect(() => {
    if (projectState.forgeState) {
      setForgeState({
        forged: !!projectState.forgeState.forged,
        dismissed: !!projectState.forgeState.dismissed,
      });
    } else if (projectState.state && !projectState.loading) {
      setForgeState({ forged: hasForgeNodes, dismissed: false });
    }
  }, [hasForgeNodes, projectState.forgeState, projectState.loading, projectState.state]);

  const updateForgeState = useCallback(async (action: "forged" | "dismissed") => {
    if (!Number.isFinite(id)) return;
    try {
      const res = await fetch(`/api/projects/${id}/forge-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`Forge state update failed: HTTP ${res.status}`);
      const data = await res.json() as { forgedAt?: string | null; dismissedAt?: string | null; forged?: boolean; dismissed?: boolean };
      setForgeState({
        forged: action === "forged" || !!data.forgedAt || !!data.forged,
        dismissed: action === "dismissed" || !!data.dismissedAt || !!data.dismissed,
      });
    } catch (error) {
      void reportError(error, { projectId: id });
      setForgeState((prev) => ({
        forged: action === "forged" ? true : prev?.forged ?? hasForgeNodes,
        dismissed: action === "dismissed" ? true : prev?.dismissed ?? false,
      }));
    }
  }, [hasForgeNodes, id]);

  // fallbackEntries + entries moved above (consumed by useChatStream).
  // createSession moved above (consumed by useChatStream).
  const createEntry = useCreateEntry();
  // creatingSessionRef + ensureSessionId now owned by useChatStream.
  const { showParkingDrawer, setShowParkingDrawer, refreshParkedEntries } = useParkingLot(id, {
    projectState,
    queryClient,
    useProjectStateFallback,
    getListEntriesQueryKey,
    getListSessionsQueryKey,
  });

  const parkedEntries = projectState.state
    ? projectState.parked
    : entries.filter((entry) => entry.status === "parked");

  const homeHandoffNodes = useMemo<HomeHandoffNode[]>(() => {
    if (homeHandoffMeta?.nodes?.length) return homeHandoffMeta.nodes;
    try {
      const raw = localStorage.getItem(`axiom-flow-nodes-${id}`);
      const stored = raw ? JSON.parse(raw) as HomeHandoffNode[] : [];
      return stored
        .filter((node) => node && typeof node.label === "string" && typeof node.type === "string")
        .map((node) => ({
          id: node.id,
          label: node.label,
          type: node.type,
          details: node.details,
          meta: node.meta,
          moscow: node.moscow,
        }));
    } catch {
      return [];
    }
  }, [homeHandoffMeta, id]);

  const homeHandoffParkedTitles = useMemo(() => {
    if (homeHandoffMeta?.parkedTitles?.length) return homeHandoffMeta.parkedTitles;
    return parkedEntries.flatMap((entry) => entry.title ? [entry.title] : []);
  }, [homeHandoffMeta, parkedEntries]);

  const handlePushAll = useCallback(async (fileEdits: FileEdit[]) => {
    if (!linkedRepo) return;
    const token = githubPushToken;
    if (!token) return;
    const today = new Date().toISOString().slice(0, 10);
    const branch = `atlas/auto-${today}-${Date.now().toString(36).slice(-4)}`;
    try {
      await fetch("/api/github/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-github-token": token },
        body: JSON.stringify({ repo: linkedRepo.fullName, branch, baseBranch: linkedRepo.defaultBranch }),
      });
      for (let i = 0; i < fileEdits.length; i++) {
        const fe = fileEdits[i];
        await fetch("/api/github/commit", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-github-token": token },
          body: JSON.stringify({
            repo: linkedRepo.fullName, branch, path: fe.path, content: fe.content,
            message: fileEdits.length === 1
              ? `Atlas: update ${fe.path.split("/").pop()}`
              : `Atlas: update ${fileEdits.length} files (${i + 1}/${fileEdits.length})`,
          }),
        });
      }
      toast.success(`AUTO: pushed ${fileEdits.length} file${fileEdits.length > 1 ? "s" : ""} to ${branch}`);
      if (autoRunCmd.trim()) {
        try {
          const termRes = await fetch("/api/terminal/exec", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ command: autoRunCmd }),
          });
          const reader = termRes.body?.getReader();
          const decoder = new TextDecoder();
          let termOutput = "";
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              termOutput += decoder.decode(value);
            }
          }
          if (termOutput.toLowerCase().includes("error")) {
            toast.error("Post-push typecheck found issues — check Terminal tab");
          } else {
            toast.success("✓ typecheck passed");
          }
        } catch {
          // terminal exec failed silently
        }
      }
    } catch (e: unknown) {
      toast.error(`AUTO push failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }, [linkedRepo, githubPushToken, autoRunCmd]);

  useEffect(() => {
    if (trustMode !== "auto") return;
    messages.forEach(msg => {
      if (msg.fileEdits?.length && !msg.autoPushed) {
        msg.autoPushed = true;
        handlePushAll(msg.fileEdits);
      }
    });
  }, [messages, trustMode, handlePushAll]);

  // Prior-message hydration moved into useChatStream.

  // Sync linkedRepo from project DB when project loads
  useEffect(() => {
    if (!project?.linkedRepo) return;
    try {
      const repo = JSON.parse(project.linkedRepo) as LinkedRepo;
      setLinkedRepo(repo);
    } catch {}
  }, [project?.linkedRepo]);

  // Load push history from DB on project load (FIX 2)
  const pushHistoryLoaded = useRef(false);
  useEffect(() => {
    if (pushHistoryLoaded.current) return;
    const hist = project?.pushHistory;
    if (!Array.isArray(hist) || hist.length === 0) return;
    pushHistoryLoaded.current = true;
    setPushHistory(hist as PushRecord[]);
  }, [project?.pushHistory]);

  // Auto-load key repo files into AI context on session start.
  // Fires once per project whenever a linked repo exists — regardless
  // of which tab the user has open.  The user never has to manually open files.
  const repoCtxLoadedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!project?.linkedRepo) return;
    if (repoCtxLoadedFor.current === id) return;

    // Token resolution: DB record → localStorage → server-side GITHUB_TOKEN
    const token =
      project?.githubToken ??
      (() => { try { return localStorage.getItem("atlas-github-token"); } catch { return null; } })() ??
      "__server__";

    let cancelled = false;
    const parsedRepo = (() => {
      try {
        const r = JSON.parse(project.linkedRepo);
        // Handle both plain-string "owner/repo" and JSON { fullName, defaultBranch } formats
        if (typeof r === "string") return { fullName: r, defaultBranch: "main" };
        return r as { fullName: string; defaultBranch: string };
      }
      catch { return null; }
    })();
    if (!parsedRepo) return;

    const branch = parsedRepo.defaultBranch ?? "main";

    // Priority-ordered key files — first ones win when we cap at 5
    const KEY_FILES = [
      "package.json",
      "README.md", "readme.md", "README.mdx",
      "tsconfig.json", "tsconfig.app.json",
      "vite.config.ts", "vite.config.js",
      "next.config.js", "next.config.ts", "next.config.mjs",
      // src/ layout (Vite, CRA)
      "src/main.tsx", "src/main.ts",
      "src/index.tsx", "src/index.ts",
      "src/App.tsx", "src/App.ts",
      "src/app.tsx", "src/app.ts",
      // app/ layout (Next.js, TanStack Start, Remix)
      "app/root.tsx", "app/root.ts",
      "app/routes/__root.tsx", "app/routes/__root.ts",
      "app/app.tsx", "app/app.ts",
      "app/layout.tsx", "app/layout.ts",
      "app/page.tsx", "app/page.ts",
      // pages/ layout
      "pages/_app.tsx", "pages/_app.js",
      "pages/index.tsx", "pages/index.js",
      // root fallbacks
      "index.ts", "index.tsx", "index.js",
      "main.ts", "main.tsx",
    ];

    (async () => {
      try {
        // 1. Fetch flat tree
        const treeRes = await fetch(
          `/api/github/tree?repo=${encodeURIComponent(parsedRepo.fullName)}&branch=${encodeURIComponent(branch)}`,
          { headers: { "x-github-token": token } }
        );
        if (!treeRes.ok || cancelled) return;
        const treeData = await treeRes.json() as { branch: string; tree: Array<{ path: string; type: string }> };
        const resolvedBranch = treeData.branch ?? branch;
        const allBlobs = treeData.tree.filter(i => i.type === "blob").map(i => i.path);
        const blobSet = new Set(allBlobs);

        // 2. Identify up to 5 priority files that actually exist
        const toFetch = KEY_FILES.filter(p => blobSet.has(p)).slice(0, 5);
        if (cancelled) return;

        // 3. Fetch priority files in parallel (may be empty — tree alone is still useful)
        const results = await Promise.allSettled(
          toFetch.map(p =>
            fetch(
              `/api/github/file?repo=${encodeURIComponent(parsedRepo.fullName)}&path=${encodeURIComponent(p)}&branch=${encodeURIComponent(resolvedBranch)}`,
              { headers: { "x-github-token": token } }
            ).then(r => r.ok ? r.json() as Promise<{ path: string; content: string; lines: number }> : null)
          )
        );

        if (cancelled) return;

        // 4. Build combined context: header + full file tree + file contents
        const treelisting = allBlobs.join("\n");
        const parts: string[] = [
          `Repo: ${parsedRepo.fullName} (branch: ${resolvedBranch})\n\nFull file tree:\n${treelisting}`,
        ];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled" && r.value) {
            const file = r.value;
            const lines = file.content.split("\n");
            const body = lines.length > 200
              ? lines.slice(0, 200).join("\n") + "\n// ... (truncated)"
              : file.content;
            parts.push(`File: ${file.path}\n\`\`\`\n${body}\n\`\`\``);
          }
        }

        if (!cancelled && parts.length > 0) {
          repoCtxLoadedFor.current = id;
          setFileContext(parts.join("\n\n"));
        }
      } catch {
        // Silent — never break the workspace if GitHub fetch fails
      }
    })();

    return () => { cancelled = true; };
  }, [id, project?.linkedRepo, project?.githubToken]);

  // Auto-run analyze scan at workspace level so Atlas knows the full codebase
  // structure the moment a project opens — no FILES tab visit required.
  // Skips if a fresh scan (< 24h) already exists in localStorage.
  useEffect(() => {
    if (!project?.linkedRepo) return;
    const parsedRepo = (() => {
      try {
        const r = JSON.parse(project.linkedRepo);
        if (typeof r === "string") return { fullName: r, defaultBranch: "main" };
        return r as { fullName: string; defaultBranch: string };
      } catch { return null; }
    })();
    if (!parsedRepo?.fullName) return;

    const scanKey = `atlas-scan-${id}`;
    try {
      const cached = localStorage.getItem(scanKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { scannedAt?: string };
        if (parsed.scannedAt) {
          const ageMs = Date.now() - new Date(parsed.scannedAt).getTime();
          if (ageMs < 24 * 60 * 60 * 1000) return; // fresh — skip
        }
      }
    } catch { /* no cache or parse error — proceed */ }

    const token =
      project?.githubToken ??
      (() => { try { return localStorage.getItem("atlas-github-token"); } catch { return null; } })() ??
      "__server__";

    fetch("/api/github/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-github-token": token },
      body: JSON.stringify({ repo: parsedRepo.fullName, branch: parsedRepo.defaultBranch ?? "main" }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        try { localStorage.setItem(scanKey, JSON.stringify(data)); } catch {}
      })
      .catch(() => { /* silent — never break the workspace */ });
  }, [id, project?.linkedRepo, project?.githubToken]);

  // Persist last visited project for footer LEDGER shortcut
  useEffect(() => {
    if (id) { try { localStorage.setItem("atlas-last-project", String(id)); } catch {} }
  }, [id]);

  // ensureSessionId + session bootstrap effect now owned by useChatStream.

  // Always-current ref so doSend doesn't capture stale state
  sendCtxRef.current = { wsLens, wsModel };

  // doSend / handleRegenerate owned by useChatStream.
  // handleStop owned by useChatStream.



  const handleAmbientSurfaceAction = useCallback(async (surface: NonNullable<AmbientSurface>) => {
    const targetProjectId = surface.projectId ?? surface.workspaceId ?? id;

    if (surface.type === "MAP") {
      if (isMobile) {
        setMobileTab("map");
        setRightOpen(true);
      } else {
        setDesktopForceTab("map");
        setTimeout(() => setDesktopForceTab(undefined), 120);
      }
      return;
    }

    if (surface.type === "WORKSPACE") {
      if (targetProjectId && targetProjectId !== id) {
        setLocation(`/project/${targetProjectId}`);
        return;
      }
      setLeftTab("chat");
      setMobileTab("chat");
      setRightOpen(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }

    if (surface.type === "DECISION") {
      if (!targetProjectId) return;
      try {
        const res = await fetch(`/api/projects/${targetProjectId}/entries`, {
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
          queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(targetProjectId, {}) });
          if (targetProjectId === id) void refreshParkedEntries();
        }
      } catch {
        // Surface actions stay ambient; failures should not interrupt the thread.
      }
    }
  }, [id, isMobile, queryClient, refreshParkedEntries, setLocation]);

  const updatePlanState = useCallback((messageId: number, state: PlanState) => {
    setPlanStates((prev) => {
      const next = new Map(prev);
      next.set(messageId, state);
      return next;
    });
  }, []);

  const updatePlanExecution = useCallback((messageId: number, execution: PlanExecution | null) => {
    setPlanExecutions((prev) => {
      const next = new Map(prev);
      if (execution) next.set(messageId, execution);
      else next.delete(messageId);
      return next;
    });
  }, []);

  const executeHomePlan = useCallback((plan: Plan) => {
    if (!sessionId || chatPending) return;
    const planText = [
      `Approved plan from home: ${plan.title}`,
      ...plan.steps.map((step) => `${step.order}. [${step.type}] ${step.file ? `${step.file} - ` : ""}${step.description}`),
    ].join("\n");
    doSend(
      `${planText}\n\nExecute this plan in this workspace. Read the relevant files first if needed, then return FILE_EDIT or LINE_PATCH blocks for any code changes so I can review and push them.`,
      sessionId,
      messages
    );
  }, [chatPending, doSend, messages, sessionId]);

  useEffect(() => {
    if (!sessionId || homePlanLoadedRef.current || messages.length > 0) return;
    let plan: Plan | null = null;
    try {
      const raw = sessionStorage.getItem(`atlas-home-plan-${id}`);
      plan = raw ? JSON.parse(raw) as Plan : null;
      if (raw) sessionStorage.removeItem(`atlas-home-plan-${id}`);
    } catch {
      plan = null;
    }
    if (!plan) return;
    homePlanLoadedRef.current = true;
    initialSent.current = true;
    const messageId = -Date.now();
    setPlanStates((prev) => {
      const next = new Map(prev);
      next.set(messageId, "pending");
      return next;
    });
    setMessages([{
      id: messageId,
      role: "assistant",
      content: "This plan came over from Home. Review it here, then approve it when you want Atlas to execute it inside this workspace.",
      intentType: "PLAN",
      plan,
      planFromHome: true,
      sentAt: new Date().toISOString(),
    }]);
  }, [id, messages.length, sessionId]);

  useEffect(() => {
    if (!sessionId || initialSent.current) return;
    const key = `atlas-initial-${id}`;
    const initial = sessionStorage.getItem(key);
    if (initial) {
      sessionStorage.removeItem(key);
      initialSent.current = true;
      setTimeout(() => {
        setInput("");
        doSend(initial, sessionId, []);
      }, 80);
    }
  }, [sessionId, id, doSend]);

  // Auto-prime AI context when arriving via external import (Compani, Axiom, etc.)
  // Only fires once, only when no messages exist, only when project has memory
  useEffect(() => {
    if (!sessionId || importPrimed.current || initialSent.current) return;
    const src = (() => { try { return new URLSearchParams(window.location.search).get("source"); } catch { return null; } })();
    if (!src) return;
    if (messages.length > 0) { importPrimed.current = true; return; }
    if (!project?.memory) return;
    importPrimed.current = true;
    const sourceLabel = src === "compani" ? "Compani Blueprints" : src === "axiom" ? "Axiom" : src;
    setTimeout(() => {
      doSend(`I just imported this project from ${sourceLabel}. Please read the spec you have in your memory and give me a brief summary of the project — what it is, what's been decided, and what we're building.`, sessionId, []);
    }, 200);
  }, [sessionId, messages.length, project?.memory, doSend]);

  // Home-to-workspace handoff — fires when arriving via "Take to workspace" on home page
  const homeHandoffPrimed = useRef(false);
  useEffect(() => {
    if (!sessionId || homeHandoffPrimed.current || initialSent.current) return;
    const fromHome = (() => { try { return new URLSearchParams(window.location.search).get("from") === "home"; } catch { return false; } })();
    if (!fromHome) return;
    if (messages.length > 0) { homeHandoffPrimed.current = true; return; }
    if (!project?.memory) return;
    try {
      const mem = JSON.parse(project.memory);
      const briefEntry = mem?.entries?.find((e: any) =>
        e.tier === 1 && typeof e.text === "string" && e.text.startsWith("Project brief from home conversation:")
      );
      if (!briefEntry) { homeHandoffPrimed.current = true; return; }
      homeHandoffPrimed.current = true;
      const briefText = (briefEntry.text as string).replace("Project brief from home conversation: ", "");
      setTimeout(() => {
        doSend(`I've just arrived from our home conversation. You have my project brief in memory: "${briefText}". Acknowledge what we discussed and where we're starting — then ask what's first.`, sessionId, []);
      }, 300);
    } catch { homeHandoffPrimed.current = true; }
  }, [sessionId, messages.length, project?.memory, doSend]);

  const sendFromIntentCapture = useCallback((text: string) => {
    if (!text.trim() || !sessionId || chatPending) return;
    doSend(text.trim(), sessionId, messages);
  }, [sessionId, chatPending, messages, doSend]);

  // Mirror an unanswered Intel Panel question into the chat as an assistant
  // message — does not call the AI, just appends to the visible thread.
  const lastNodeMirrorRef = useRef<string | null>(null);
  const pushSystemNodeMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (lastNodeMirrorRef.current === trimmed) return;
    lastNodeMirrorRef.current = trimmed;
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: trimmed,
        intentType: "node_question",
        sentAt: new Date().toISOString(),
      },
    ]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatPending]);

  // Close mobile panel on mobile→desktop resize
  useEffect(() => {
    if (!isMobile) setRightOpen(false);
  }, [isMobile]);

  // Surface tab drives right panel on both mobile and desktop
  useEffect(() => {
    if (mobileTab === "chat") setRightOpen(false);
    else setRightOpen(true);
  }, [mobileTab]);

  // When panel closes (swipe), reset tab to chat
  useEffect(() => {
    if (!rightOpen && isMobile) setMobileTab("chat");
  }, [rightOpen, isMobile]);

  // Clean ?view=flow from URL after reading it on mount
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "flow") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Pinch-to-zoom-out → return to Master Map (satellite view)
  useEffect(() => {
    if (!isMobile) return;
    let startDist = 0;
    let fired = false;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        startDist = Math.hypot(dx, dy);
        fired = false;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDist === 0 || fired) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (dist - startDist > 90) {
        fired = true;
        startDist = 0;
        try { navigator.vibrate?.([6, 40, 6]); } catch {}
        setLocation("/map");
      }
    };
    const onEnd = () => { startDist = 0; fired = false; };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, [isMobile, setLocation]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  };

  const sendPreparingSession = !sessionId && (sessionsLoading || createSession.isPending);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || chatPending) return;
    const sid = sessionId ?? await ensureSessionId().catch(() => null);
    if (!sid) return;
    setShowHomeHandoffBanner(false);
    // Auto-dismiss any active catch — user chose to keep moving
    if (activeCatch) {
      setMessages((prev) => prev.map((m) =>
        m.catchPayload && !m.catchResolved ? { ...m, catchResolved: true } : m
      ));
      setActiveCatch(null);
    }
    playSend();
    const current = messages;
    const files = attachedFiles;
    setInput("");
    setAttachedFiles([]);
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    const imageFile = files.find(f => f.type.startsWith("image/"));
    const otherFiles = files.filter(f => f !== imageFile);
    const suffix = otherFiles.length > 0 ? `\n[Attached: ${otherFiles.map(f => f.name).join(", ")}]` : "";
    const fullText = text + suffix;

    if (imageFile) {
      fileToBase64Safe(imageFile)
        .then(({ base64, mediaType }) => doSend(fullText, sid, current, undefined, { base64, mediaType }))
        .catch(() => doSend(fullText, sid, current));
    } else {
      doSend(fullText, sid, current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handlePark = useCallback(
    (content: string) => {
      if (!sessionId) return;
      haptic.short();
      playPark();
      const title = content.replace(/\n/g, " ").slice(0, 80).trim();
      createEntry.mutate(
        { projectId: id, data: { title, summary: content.slice(0, 500), status: "parked", severity: "parked", mode: "think", sessionId } },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(id, {}) }); void refreshParkedEntries(); } }
      );
    },
    [id, sessionId, createEntry, queryClient, refreshParkedEntries]
  );

  const handleCommit = useCallback(
    (content: string) => {
      if (!sessionId) return;
      const title = content
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/`(.+?)`/g, "$1")
        .replace(/\[(.+?)\]\(.+?\)/g, "$1")
        .replace(/\n/g, " ")
        .replace(/\s{2,}/g, " ")
        .slice(0, 80)
        .trim();
      createEntry.mutate(
        { projectId: id, data: { title, summary: content.slice(0, 500), status: "committed", severity: "committed", mode: "think", sessionId } },
        { onSuccess: () => { haptic.short(); playCommit(); queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(id, {}) }); void refreshParkedEntries(); } }
      );
    },
    [id, sessionId, createEntry, queryClient, playCommit, refreshParkedEntries]
  );

  const handleRollbackPush = useCallback(async (record: PushRecord) => {
    const token = githubPushToken;
    if (!linkedRepo || !token || !record.originalContent) return;
    await fetch("/api/github/commit", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-github-token": token },
      body: JSON.stringify({
        repo: linkedRepo.fullName, branch: record.branch,
        path: record.path, content: record.originalContent,
        message: `Atlas: rollback ${record.filename}`,
      }),
    });
    setPushHistory((prev) => prev.map((r) => r.id === record.id ? { ...r, rolledBack: true } : r));
  }, [linkedRepo, githubPushToken]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
    setTimeout(() => autoResize(), 0);
  }, []);

  const { listening: voiceListening, toggle: toggleVoice, isSupported: voiceSupported } =
    useVoiceInput(handleVoiceTranscript);

  const handleCatchProceed = (msgId?: number) => {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, catchResolved: true } : m));
    setActiveCatch(null);
    queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(id, {}) });
  };

  const handleCatchAdjust = (msgId?: number) => {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, catchResolved: true } : m));
    setActiveCatch(null);
    textareaRef.current?.focus();
  };

  const dismissChip = useCallback((label: string) => {
    setMemoryChips((prev) => prev.filter((c) => c.label !== label));
  }, []);


  const hasInput = input.trim().length > 0;
  
  const entryCount = entries?.length ?? 0;
  const parkedCount = parkedEntries.length;
  const committedCount = entries?.filter((e) => e.status === "committed").length ?? 0;
  const healthPct = entryCount > 0 ? Math.round((committedCount / entryCount) * 100) : 0;
  const [mapReadiness, setMapReadiness] = useState(0);
  const [readinessMode, setReadinessMode] = useState<ReadinessMode>(() => {
    const stored = localStorage.getItem(READINESS_MODE_KEY);
    return (stored === "arch" || stored === "decisions" || stored === "blended") ? stored : "blended";
  });
  const handleReadinessModeChange = (m: ReadinessMode) => {
    setReadinessMode(m);
    localStorage.setItem(READINESS_MODE_KEY, m);
  };
  const blendedReadiness = computeBlendedScore(mapReadiness, healthPct);
  const displayedReadinessScore =
    readinessMode === "arch" ? mapReadiness :
    readinessMode === "decisions" ? healthPct :
    blendedReadiness;

  // ── Manual + auto readiness rescan ────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const autoScanTriggeredRef = useRef<Set<number>>(new Set());
  const hasLinkedRepo = !!project?.linkedRepo;
  const runScan = useCallback(async (silent: boolean) => {
    if (!Number.isFinite(id)) return;
    if (!silent) setIsScanning(true);
    try {
      const r = await fetch(`/api/projects/${id}/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "github" }),
      });
      if (!r.ok) {
        if (!silent) {
          if (r.status === 400 || r.status === 404) {
            toast.error("No GitHub repo linked", {
              description: "Connect one in the Files tab.",
              className: "atlas-toast-pill",
            });
          } else {
            toast.error("Scan failed", {
              description: "Try again in a moment.",
              className: "atlas-toast-pill",
            });
          }
        }
        return;
      }
      const body = await r.json().catch(() => ({} as any));
      const newScore =
        typeof body?.score === "number" ? body.score :
        typeof body?.snapshot?.score === "number" ? body.snapshot.score :
        typeof body?.latestSnapshotScore === "number" ? body.latestSnapshotScore :
        null;
      const prev = mapReadiness;
      let rounded: number | null = null;
      if (newScore != null) {
        rounded = Math.round(newScore);
        setMapReadiness(rounded);
        if (prev > 0 && rounded < prev) haptic.warn();
      }
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
      if (!silent) {
        if (rounded != null) {
          const delta = prev > 0 ? rounded - prev : 0;
          const deltaStr = delta > 0 ? ` ↑${delta}` : delta < 0 ? ` ↓${Math.abs(delta)}` : "";
          toast.success(`${rounded}%${deltaStr}`, {
            description: "Readiness updated",
            className: "atlas-toast-pill",
          });
        } else {
          toast.success("Scanned", { className: "atlas-toast-pill" });
        }
      }
    } catch {
      if (!silent) toast.error("Scan failed", {
        description: "Check your connection.",
        className: "atlas-toast-pill",
      });
    } finally {
      if (!silent) setIsScanning(false);
    }
  }, [id, queryClient, mapReadiness]);

  useEffect(() => {
    if (!Number.isFinite(id) || !hasLinkedRepo) return;
    if (autoScanTriggeredRef.current.has(id)) return;
    if (project?.latestSnapshotScore != null) return;
    autoScanTriggeredRef.current.add(id);
    void runScan(true);
  }, [id, hasLinkedRepo, project?.latestSnapshotScore, runScan]);

  // pendingResolvedNodeIds moved above (consumed by useChatStream).
  const [desktopForceTab, setDesktopForceTab] = useState<RightTab | undefined>(() =>
    new URLSearchParams(window.location.search).get("view") === "flow" ? "map" : undefined
  );
  useEffect(() => {
    if (!isHomeHandoff || !Number.isFinite(id) || homeHandoffDbLoadedRef.current === id) return;
    homeHandoffDbLoadedRef.current = id;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`, { credentials: "include", signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json() as { nodeState?: unknown };
        const persistedNodes = extractPersistedFlowNodes(data.nodeState);
        if (persistedNodes.length === 0) return;
        setExternalForgeNodes(persistedNodes);
        setHomeHandoffMeta((prev) => ({
          parkedCount: prev?.parkedCount ?? parkedEntries.length,
          flowNodeCount: persistedNodes.length,
          goalLabel: persistedNodes.find(n => n.type === "goal")?.label ?? prev?.goalLabel ?? persistedNodes[0]?.label ?? "your goal",
          parkedTitles: prev?.parkedTitles,
          nodes: persistedNodes.map(n => ({
            id: n.id,
            label: n.label,
            type: n.type,
            details: n.details,
            meta: n.meta,
            moscow: n.moscow,
          })),
        }));
        if (isMobile) {
          setMobileTab("map");
          setRightOpen(true);
        } else {
          setDesktopForceTab("map");
          setTimeout(() => setDesktopForceTab(undefined), 120);
        }
      } catch {
        // Handoff details are a progressive enhancement; keep the workspace usable.
      }
    })();
    return () => controller.abort();
  }, [id, isHomeHandoff, isMobile, parkedEntries.length]);
  const openPreviewPanel = useCallback(() => {
    if (isMobile) {
      setMobileTab("preview");
      setRightOpen(true);
    } else {
      setDesktopForceTab("preview");
      setTimeout(() => setDesktopForceTab(undefined), 120);
    }
  }, [isMobile]);
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);
  const handlePreviewCode = useCallback((code: string) => {
    setSandboxCode(code);
    openPreviewPanel();
  }, [openPreviewPanel]);

  const [pendingTerminalCommand, setPendingTerminalCommand] = useState<string | null>(null);
  const handleRunCommand = useCallback((command: string) => {
    setPendingTerminalCommand(command);
    setLeftTab("terminal");
  }, []);

  // messagesRef + summarize effect owned by useChatStream.


  const handleTerminalComplete = useCallback((command: string, output: string, exitCode: number | null) => {
    if (!sessionId) return;
    const truncated = output.length > 3500 ? output.slice(0, 3500) + "\n[...output truncated]" : output;
    const formattedText = `Terminal output for \`${command}\`:\n\`\`\`\n${truncated}\n\`\`\`\nExit code: ${exitCode ?? "unknown"}`;
    doSend(formattedText, sessionId, messagesRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Readiness Snapshots ───────────────────────────────────────────────────
  const { data: readinessSnapshots } = useListReadinessSnapshots(
    id ? Number(id) : 0,
    { query: { enabled: !!id, queryKey: getListReadinessSnapshotsQueryKey(id ? Number(id) : 0) } }
  );
  const recordSnapshot = useRecordReadinessSnapshot();
  const lastRecordedScoreRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id || blendedReadiness === 0) return;
    const timer = setTimeout(() => {
      if (lastRecordedScoreRef.current === blendedReadiness) return;
      lastRecordedScoreRef.current = blendedReadiness;
      recordSnapshot.mutate({ id: Number(id), data: { score: blendedReadiness } });
    }, 2000);
    return () => clearTimeout(timer);
  }, [id, blendedReadiness]);

  const readinessTrend: ReadinessTrend | undefined = (() => {
    if (!readinessSnapshots || readinessSnapshots.length < 2) return undefined;
    const sorted = [...readinessSnapshots].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
    );
    const current = sorted[0];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const baseline24h = sorted.find(s => new Date(s.recordedAt) <= oneDayAgo);
    const baseline7d = sorted.find(s => new Date(s.recordedAt) <= sevenDaysAgo);
    const baseline = baseline24h ?? baseline7d ?? sorted[sorted.length - 1];
    if (!baseline || baseline.id === current?.id) return undefined;
    const label = baseline24h ? "today" : baseline7d ? "this week" : "since start";
    return {
      delta: (current?.score ?? blendedReadiness) - baseline.score,
      label,
      history: sorted.map(s => ({ score: s.score, recordedAt: s.recordedAt })),
    };
  })();

  // ── Handover (Flow → Workspace) ──────────────────────────────────────────
  const updateProjectFromHandover = useUpdateProject();
  const [handoverPending, setHandoverPending] = useState(false);
  // Live snapshot streamed up from AxiomFlow — drives the workspace-header
  // drift pill and the desktop "→ Atlas" trigger button in RightPanel.
  const [currentSnapshot, setCurrentSnapshot] = useState<HandoverSnapshot | null>(null);
  // Controlled state for the handover popover so a desktop trigger in the
  // tab bar can open the same popover that lives inside AxiomFlow.
  const [handoverOpen, setHandoverOpen] = useState(false);
  // Reset handover-derived UI when the active project changes, otherwise the
  // header drift pill and tab-bar button can briefly reflect the previous
  // project's snapshot until AxiomFlow remounts and streams a fresh one.
  useEffect(() => {
    setCurrentSnapshot(null);
    setHandoverOpen(false);
  }, [id]);

  const handleHandover = useCallback(({ snapshot, title }: { snapshot: HandoverSnapshot; title: string }) => {
    if (!id || handoverPending) return;
    setHandoverPending(true);
    createSession.mutate(
      {
        projectId: id,
        data: {
          title: title || snapshot.title,
          mode: "think",
          seedMessage: snapshot.summary,
          seedIntentType: "handover_snapshot",
        },
      },
      {
        onSuccess: (newSession) => {
          // Switch active session and seed the visible thread with the same
          // assistant message we just persisted server-side.
          setSessionId(newSession.id);
          setMessages([{
            role: "assistant",
            content: snapshot.summary,
            intentType: "handover_snapshot",
            sentAt: new Date().toISOString(),
          }]);
          // Stamp the project with the handover marker + content hash so the
          // Workspace can later detect drift.
          updateProjectFromHandover.mutate(
            {
              id,
              data: {
                lastHandoverAt: new Date().toISOString(),
                lastHandoverHash: snapshot.hash,
              },
            },
            {
              onSettled: () => {
                queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
              },
            }
          );
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey(id) });
          // Surface the chat thread so the user sees the seeded snapshot.
          if (isMobile) {
            setMobileTab("chat");
            setRightOpen(false);
          }
          // Close the popover on success regardless of which trigger opened it.
          setHandoverOpen(false);
        },
        onSettled: () => setHandoverPending(false),
      }
    );
  }, [id, handoverPending, createSession, updateProjectFromHandover, queryClient, isMobile]);

  const focusSystemMap = useCallback(() => {
    if (isMobile) {
      setMobileTab("map");
      setRightOpen(true);
    } else {
      setDesktopForceTab("map");
      setTimeout(() => setDesktopForceTab(undefined), 80);
    }
  }, [isMobile]);

  // ── ZIP import ─────────────────────────────────────────────────────────────
  const {
    zipFiles, setZipFiles,
    zipName, setZipName,
    zipTruncated, setZipTruncated,
    isDragOver, setIsDragOver,
    processZip, clearZip, toggleZipFile, setAllZip,
  } = useComposerZip(id, setFileContext);

  const liveGeneration = useMemo(
    () => parseLiveGeneration(activityStream.content, chatPending),
    [activityStream.content, chatPending]
  );

  // ── Project not found ────────────────────────────────────────────────────
  if (!projectLoading && !sessionsLoading && id && !project) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--atlas-bg)", gap: 20 }}>
        <div style={{ fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.35em", color: "var(--atlas-gold)", opacity: 0.4, textTransform: "uppercase" }}>Axiom</div>
        <div style={{ fontSize: "var(--ts-display)", fontWeight: 300, color: "var(--atlas-fg)", letterSpacing: "0.04em" }}>Project not found.</div>
        <button
          onClick={() => setLocation("/home")}
          style={{ padding: "10px 24px", borderRadius: 9, cursor: "pointer", background: "linear-gradient(180deg, var(--atlas-gold) 0%, #B8942A 100%)", border: "1px solid rgba(var(--atlas-gold-rgb),0.4)", color: "#0C0A09", fontSize: "var(--ts-caption)", fontWeight: 700, fontFamily: "var(--app-font-mono)", letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          Go home
        </button>
      </div>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (projectLoading || (sessionsLoading && !sessionId)) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--atlas-bg)", overflow: "hidden" }}>
        <style>{`
          @keyframes shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }
          .ws-shimmer { background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%); background-size: 600px 100%; animation: shimmer 1.6s infinite linear; border-radius: 6px; }
          @keyframes atlas-name-fresh { from { opacity: 0; transform: translateY(-2px); } to { opacity: 0.92; transform: translateY(0); } }
          .atlas-name-fresh { animation: atlas-name-fresh 0.5s ease forwards; }
          .atlas-name-pencil { opacity: 0; transition: opacity 150ms ease; }
          button:hover .atlas-name-pencil, button:focus .atlas-name-pencil { opacity: 0.4; }
        `}</style>
        {/* Header skeleton */}
        <div style={{ height: 46, flexShrink: 0, borderBottom: "1px solid rgba(201,162,76,0.08)", display: "flex", alignItems: "center", padding: "0 16px", gap: 10 }}>
          <div className="ws-shimmer" style={{ width: 28, height: 28, borderRadius: 7 }} />
          <div className="ws-shimmer" style={{ width: 60, height: 14 }} />
          <div style={{ flex: 1 }} />
          <div className="ws-shimmer" style={{ width: 80, height: 14 }} />
          <div className="ws-shimmer" style={{ width: 28, height: 28, borderRadius: "50%" }} />
        </div>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Chat area skeleton */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px", gap: 18 }}>
            <div className="ws-shimmer" style={{ height: 14, width: "65%" }} />
            <div className="ws-shimmer" style={{ height: 14, width: "80%" }} />
            <div className="ws-shimmer" style={{ height: 14, width: "50%" }} />
            <div style={{ marginTop: 12 }}>
              <div className="ws-shimmer" style={{ height: 14, width: "72%", marginBottom: 10 }} />
              <div className="ws-shimmer" style={{ height: 14, width: "58%" }} />
            </div>
          </div>
          {/* Right panel skeleton (desktop only) */}
          {!isMobile && (
            <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid rgba(201,162,76,0.08)", background: "var(--atlas-surface-alt)", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="ws-shimmer" style={{ height: 12, width: "60%" }} />
              <div className="ws-shimmer" style={{ height: 56, borderRadius: 8 }} />
              <div className="ws-shimmer" style={{ height: 56, borderRadius: 8 }} />
              <div className="ws-shimmer" style={{ height: 56, borderRadius: 8 }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--atlas-bg)", overflow: "hidden", zIndex: 0, paddingBottom: isMobile ? "calc(var(--atlas-dock-height) + env(safe-area-inset-bottom, 0px))" : 0 }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith(".zip")) await processZip(file);
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: "var(--atlas-home-atmosphere)",
          opacity: 0.6,
        }}
      />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* ── Workspace header restored below the unified shell ── */}
      <div
        className="atlas-workspace-header"
        style={{
          marginTop: 50,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "rgba(var(--atlas-bg-rgb),0.78)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(var(--atlas-gold-rgb),0.12)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        }}
      >
        <div
          className="atlas-app-header-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 42,
            padding: isMobile ? "5px 10px" : "5px 14px",
          }}
        >
          <nav aria-label="Workspace sections" style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
            {(["chat", "diff", "blueprints", ...((wsLens === "build" || wsLens === "scenario") ? ["terminal"] : [])] as Array<"chat" | "diff" | "blueprints" | "terminal">).map((tab) => {
              const active = leftTab === tab;
              const label = tab === "chat" ? "Chat" : tab === "diff" ? "Diff" : tab === "blueprints" ? "Blueprints" : "Terminal";
              const badge = tab === "diff" && pushHistory.length > 0 ? pushHistory.length : undefined;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLeftTab(tab)}
                  aria-label={tab === "terminal" ? "Open terminal" : tab === "diff" ? "View diff" : tab === "blueprints" ? "Open blueprints" : "Open chat"}
                  style={{
                    padding: isTinyScreen ? "7px 8px" : "8px 12px",
                    background: active ? "rgba(var(--atlas-gold-rgb),0.08)" : "transparent",
                    border: "none",
                    borderBottom: `2px solid ${active ? "var(--atlas-gold)" : "transparent"}`,
                    color: active ? "var(--atlas-fg)" : "var(--atlas-muted)",
                    fontSize: isTinyScreen ? 11 : 12,
                    fontFamily: "var(--app-font-sans)",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    transition: "color 160ms ease, border-color 160ms ease, opacity 160ms ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: active ? 1 : 0.62,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.opacity = "0.9"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = "0.62"; }}
                >
                  {tab === "terminal" && <TerminalSquare size={13} strokeWidth={1.7} />}
                  {label}
                  {badge !== undefined && (
                    <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", background: "rgba(201,162,76,0.15)", border: "1px solid rgba(201,162,76,0.3)", color: "var(--atlas-gold)", padding: "0 4px", borderRadius: 8, lineHeight: "15px" }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: isTinyScreen ? 4 : 7, minWidth: 0 }}>
            <button
              type="button"
              onClick={focusSystemMap}
              title="Open Flow"
              aria-label="Open Flow"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: isTinyScreen ? "4px 7px" : "5px 10px",
                borderRadius: 999,
                background: "rgba(var(--atlas-gold-rgb),0.08)",
                border: "1px solid rgba(var(--atlas-gold-rgb),0.24)",
                color: "var(--atlas-gold)",
                cursor: "pointer",
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-xs)",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--atlas-gold)", display: "inline-block" }} />
              Flow
            </button>

            {sessionPrUrl ? (
              <a
                href={sessionPrUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="View Pull Request"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 8px", borderRadius: 6,
                  background: "rgba(134,239,172,0.08)",
                  border: "1px solid rgba(134,239,172,0.25)",
                  color: "rgba(134,239,172,0.85)",
                  fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)",
                  textDecoration: "none", letterSpacing: "0.06em",
                  flexShrink: 0,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/>
                </svg>
                PR
              </a>
            ) : pushHistory.length > 0 ? (
              <button
                type="button"
                onClick={() => setLeftTab("diff")}
                title="Open Pull Request"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 8px", borderRadius: 6,
                  background: "rgba(201,162,76,0.06)",
                  border: "1px solid rgba(201,162,76,0.2)",
                  color: "var(--atlas-gold)",
                  fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)",
                  cursor: "pointer", letterSpacing: "0.06em",
                  flexShrink: 0,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/>
                </svg>
                PR
              </button>
            ) : null}

            <LongPressTip tip="Readiness mode: tap to cycle Blended · Architecture · Decisions">
              <button
                type="button"
                onClick={() => {
                  const modes: ReadinessMode[] = ["blended", "arch", "decisions"];
                  const next = modes[(modes.indexOf(readinessMode) + 1) % modes.length];
                  handleReadinessModeChange(next);
                }}
                title={`Mode: ${MODE_META[readinessMode].description}`}
                aria-label={`Readiness mode: ${MODE_META[readinessMode].label}`}
                style={{
                  background: "rgba(201,162,76,0.08)",
                  border: "1px solid rgba(201,162,76,0.22)",
                  borderRadius: 4,
                  cursor: "pointer",
                  padding: isTinyScreen ? "3px 5px" : "3px 7px",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: "var(--ts-xs)",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "var(--atlas-muted)",
                  lineHeight: 1,
                  flexShrink: 0,
                  transition: "color 150ms ease, border-color 150ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--atlas-gold)"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.5)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--atlas-muted)"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.22)"; }}
              >
                {MODE_META[readinessMode].abbr}
              </button>
            </LongPressTip>

            <ReadinessRing
              archScore={mapReadiness}
              decisionsScore={healthPct}
              mode={readinessMode}
              onModeChange={handleReadinessModeChange}
              onClick={focusSystemMap}
              trend={readinessTrend}
              hideModePill
            />

            {!isMobile && (
              <button
                title="Open Preview"
                aria-label="Toggle preview"
                type="button"
                onClick={openPreviewPanel}
                style={{
                  width: 26,
                  height: 26,
                  padding: 0,
                  borderRadius: 7,
                  background: "transparent",
                  border: "none",
                  color: "var(--atlas-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 160ms ease, opacity 160ms ease",
                  flexShrink: 0,
                  opacity: 0.65,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--atlas-gold)"; e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--atlas-muted)"; e.currentTarget.style.opacity = "0.65"; }}
              >
                <Eye size={15} strokeWidth={1.7} />
              </button>
            )}

            {!isMobile && (
              <LongPressTip tip="Dashboard view">
                <button
                  title="Visual Vault"
                  aria-label="Open visual vault"
                  type="button"
                  onClick={() => setShowVault(true)}
                  style={{
                    width: 26,
                    height: 26,
                    padding: 0,
                    borderRadius: 6,
                    background: "transparent",
                    border: "none",
                    color: "rgba(201,162,76,0.55)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color 160ms ease",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--atlas-gold)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(201,162,76,0.55)")}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
              </LongPressTip>
            )}

            {hasLinkedRepo && (
              <LongPressTip tip="Rescan GitHub repo and update readiness score">
                <button
                  type="button"
                  onClick={() => { if (!isScanning) void runScan(false); }}
                  disabled={isScanning}
                  title={isScanning ? "Scanning…" : "Rescan readiness from GitHub"}
                  aria-label="Rescan readiness"
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "1px solid rgba(201,162,76,0.25)",
                    borderRadius: "50%",
                    color: "var(--atlas-gold)",
                    cursor: isScanning ? "default" : "pointer",
                    opacity: isScanning ? 1 : 0.6,
                    transition: "opacity 160ms ease, border-color 160ms ease",
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw
                    size={11}
                    style={{ animation: isScanning ? "atlas-rescan-spin 1.4s linear infinite" : undefined }}
                  />
                </button>
              </LongPressTip>
            )}
          </div>
        </div>

        {!isMobile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 32,
            padding: "0 14px 7px",
            borderTop: "1px solid rgba(var(--atlas-gold-rgb),0.06)",
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            <span className={sessionId ? "atlas-pulse-dot" : undefined} style={{ width: 6, height: 6, borderRadius: "50%", background: sessionId ? "#4ade80" : "rgba(var(--atlas-muted-rgb),0.4)", flexShrink: 0, display: "inline-block" }} />
            {renaming ? (
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                <input
                  ref={renameInputRef}
                  autoFocus
                  value={renameDraft}
                  disabled={updateProjectHeader.isPending}
                  onChange={(e) => { setRenameDraft(e.target.value); setRenameError(null); }}
                  onKeyDown={(e) => {
                    if (updateProjectHeader.isPending) return;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const newName = renameDraft.trim() || (project?.name ?? "");
                      updateProjectHeader.mutate({ id, data: { name: newName } }, {
                        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) }); setRenaming(false); setRenameError(null); },
                        onError: (err) => { setRenameError((err as Error)?.message ?? "Failed to rename."); setTimeout(() => renameInputRef.current?.focus(), 0); },
                      });
                    }
                    if (e.key === "Escape") { renameEscapeRef.current = true; setRenaming(false); setRenameError(null); }
                  }}
                  onBlur={() => {
                    if (updateProjectHeader.isPending) return;
                    if (renameEscapeRef.current) { renameEscapeRef.current = false; return; }
                    const newName = renameDraft.trim() || (project?.name ?? "");
                    updateProjectHeader.mutate({ id, data: { name: newName } }, {
                      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) }); setRenaming(false); setRenameError(null); },
                      onError: (err) => { setRenameError((err as Error)?.message ?? "Failed to rename."); setTimeout(() => renameInputRef.current?.focus(), 0); },
                    });
                  }}
                  style={{ background: "transparent", border: "none", outline: "none", color: "var(--atlas-fg)", fontSize: "var(--ts-body)", fontWeight: 500, fontFamily: "var(--app-font-sans)", width: 180, opacity: updateProjectHeader.isPending ? 0.5 : 1, transition: "opacity 150ms ease" }}
                />
                {renameError && (
                  <span style={{ fontSize: "var(--ts-sm)", color: "rgba(252,165,165,0.85)", fontFamily: "var(--app-font-mono)", marginTop: 2, lineHeight: 1.3, pointerEvents: "none" }}>
                    {renameError}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setRenameDraft(project?.name ?? ""); setRenaming(true); }}
                title="Tap to rename"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: isMobile ? 180 : 320, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--atlas-fg)" }}
              >
                <span
                  key={autoNameKey}
                  className={autoNameKey > 0 ? "atlas-name-fresh" : undefined}
                  style={{ fontSize: "var(--ts-body)", opacity: 0.92, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
                >
                  {(() => {
                    const n = project?.name ?? "…";
                    return isTinyScreen && n.length > 12 ? n.slice(0, 12) + "…" : n;
                  })()}
                </span>
                <span className="atlas-name-pencil" style={{ fontSize: "var(--ts-micro)", color: "var(--atlas-muted)", flexShrink: 0, lineHeight: 1 }}>✎</span>
              </button>
            )}

            {!!project?.lastHandoverHash && !!currentSnapshot && currentSnapshot.hash !== project.lastHandoverHash && (
              <button
                type="button"
                title="Architecture flow has changed since last Atlas handover"
                onClick={focusSystemMap}
                style={{
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: "rgba(146,64,14,0.18)",
                  border: "1px solid rgba(146,64,14,0.55)",
                  color: "rgba(230,150,90,0.95)",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: "var(--ts-tiny)",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Updated since handover
              </button>
            )}
          </div>




          {!isMobile && (
            <div role="group" aria-label="Workspace lens" style={{ display: "flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 999, background: "rgba(var(--atlas-muted-rgb),0.05)", border: "1px solid rgba(var(--atlas-muted-rgb),0.14)", flexShrink: 0 }}>
              {([
                ["flow", "THINK"],
                ["scenario", "PLAN"],
                ["build", "BUILD"],
                ["look", "LOOK"],
              ] as Array<[WorkspaceLens, string]>).map(([lensId, label]) => {
                const active = wsLens === lensId;
                const detected = detectedLens === lensId;
                const cfg = LENS_CONFIG[lensId];
                return (
                  <button
                    key={lensId}
                    type="button"
                    onClick={() => setWsLens(lensId)}
                    title={cfg.sub}
                    aria-label={`${label} lens`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 7px",
                      borderRadius: 999,
                      background: active ? cfg.glowColor : "transparent",
                      border: `1px solid ${active || detected ? cfg.borderColor : "transparent"}`,
                      color: active || detected ? cfg.color : "var(--atlas-muted)",
                      cursor: "pointer",
                      fontFamily: "var(--app-font-mono)",
                      fontSize: "var(--ts-tiny)",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      transition: "all 160ms ease",
                      opacity: active ? 1 : 0.72,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: active || detected ? cfg.color : "rgba(var(--atlas-muted-rgb),0.45)", display: "inline-block" }} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Spec → Build handoff modal ── */}
      {showHandoffModal && (() => {
        const planMsgs = messages.filter(msg => msg.role === "assistant" && msg.intentType === "PLAN" && msg.content.trim().length > 0);
        const commitSelected = async () => {
          const toCommit = planMsgs.filter((_, i) => handoffSelected.has(i));
          for (const msg of toCommit) {
            const summary = msg.content.replace(/#{1,3}\s*/g, "").split("\n").find(l => l.trim().length > 15)?.trim().slice(0, 120) ?? msg.content.slice(0, 120);
            await createEntry.mutateAsync({ projectId: id, data: { title: summary.slice(0, 80), summary, status: "committed", severity: "committed", mode: "plan", sessionId: sessionId ?? undefined } }).catch(() => {});
          }
          setShowHandoffModal(false);
        };
        const skipAndBuild = () => {
          setShowHandoffModal(false);
        };
        return createPortal(
          <>
            <div onClick={skipAndBuild} style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} />
            <div style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              zIndex: 9991, width: "min(520px, calc(100vw - 32px))",
              background: "var(--atlas-surface)", border: "1px solid rgba(74,222,128,0.28)",
              borderRadius: 16, padding: "28px 28px 24px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
            }}>
              {/* Header */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#4ade80" }}>Switching to Build Mode</span>
                </div>
                <p style={{ fontSize: "var(--ts-body)", color: "var(--atlas-fg)", margin: 0, lineHeight: 1.6, opacity: 0.85 }}>
                  You have {planMsgs.length} planning {planMsgs.length === 1 ? "response" : "responses"} from this session. Commit the key decisions to your ledger before you start building?
                </p>
              </div>

              {/* Decision list */}
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 22, maxHeight: 280, overflowY: "auto" as const }}>
                {planMsgs.map((msg, i) => {
                  const preview = msg.content.replace(/#{1,3}\s*/g, "").split("\n").find(l => l.trim().length > 15)?.trim().slice(0, 100) ?? msg.content.slice(0, 100);
                  const selected = handoffSelected.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => setHandoffSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      })}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "10px 12px", borderRadius: 9,
                        background: selected ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.025)",
                        border: `1px solid ${selected ? "rgba(74,222,128,0.3)" : "rgba(var(--atlas-muted-rgb),0.15)"}`,
                        cursor: "pointer", textAlign: "left" as const, transition: "all 140ms ease",
                      }}
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginTop: 1,
                        border: `1.5px solid ${selected ? "#4ade80" : "rgba(var(--atlas-muted-rgb),0.4)"}`,
                        background: selected ? "#4ade80" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 140ms ease",
                      }}>
                        {selected && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#0C0A09" strokeWidth="2.2" strokeLinecap="round"><path d="M2 6l3 3 5-5" /></svg>}
                      </span>
                      <span style={{ fontSize: "var(--ts-label)", color: selected ? "var(--atlas-fg)" : "var(--atlas-muted)", lineHeight: 1.55, transition: "color 140ms" }}>
                        {preview}{preview.length >= 100 ? "…" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={commitSelected}
                  disabled={handoffSelected.size === 0}
                  style={{
                    flex: 1, padding: "11px 16px", borderRadius: 9, cursor: handoffSelected.size === 0 ? "not-allowed" : "pointer",
                    background: handoffSelected.size === 0 ? "rgba(74,222,128,0.08)" : "rgba(74,222,128,0.14)",
                    border: `1px solid ${handoffSelected.size === 0 ? "rgba(74,222,128,0.12)" : "rgba(74,222,128,0.4)"}`,
                    color: handoffSelected.size === 0 ? "rgba(74,222,128,0.3)" : "#4ade80",
                    fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const,
                    transition: "all 160ms ease",
                  }}
                >
                  Lock in {handoffSelected.size > 0 ? `${handoffSelected.size} ` : ""}& Start Building
                </button>
                <button
                  onClick={skipAndBuild}
                  style={{
                    padding: "11px 16px", borderRadius: 9, cursor: "pointer",
                    background: "transparent", border: "1px solid rgba(var(--atlas-muted-rgb),0.2)",
                    color: "var(--atlas-muted)", fontSize: "var(--ts-caption)", fontFamily: "var(--app-font-mono)",
                    fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const,
                    opacity: 0.7,
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          </>,
          document.body
        );
      })()}

      {/* ── Axiom handoff banner ── */}
      {showAxiomBanner && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "9px 18px",
            background: "rgba(201,162,76,0.07)",
            borderBottom: "1px solid rgba(201,162,76,0.18)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--atlas-gold)", flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: "var(--ts-label)", color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.03em" }}>
              Spec loaded from {importSourceLabel ?? "external source"} — your architecture decisions are committed.
            </span>
          </div>
          <button
            onClick={dismissAxiomBanner}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(201,162,76,0.5)", fontSize: "var(--ts-base)", lineHeight: 1, padding: "2px 4px", flexShrink: 0 }}
            title="Dismiss"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {(showHomeHandoffBanner || showHomeHandoffDrawer) && (
        <style>{`
          @keyframes atlas-handoff-drawer-in {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      )}

      {(showHomeHandoffBanner || showHomeHandoffDrawer) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "9px 18px",
            background: "color-mix(in oklab, var(--atlas-gold) 8%, transparent)",
            borderBottom: "1px solid color-mix(in oklab, var(--atlas-gold) 20%, transparent)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--atlas-gold)", flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: "var(--ts-label)", color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {homeHandoffMeta?.parkedCount ?? 0} ideas parked · {homeHandoffMeta?.flowNodeCount ?? 0} flow nodes mapped · conversation memory loaded
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setShowHomeHandoffDrawer(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--atlas-gold)",
                cursor: "pointer",
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-caption)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "2px 0",
                textTransform: "uppercase",
              }}
            >
              View →
            </button>
            {!showHomeHandoffDrawer && (
              <button
                onClick={() => setShowHomeHandoffBanner(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--atlas-gold)", fontSize: "var(--ts-base)", lineHeight: 1, padding: "2px 4px", flexShrink: 0, opacity: 0.55 }}
                title="Dismiss"
                aria-label="Dismiss"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {showHomeHandoffDrawer && (
        <div
          role="region"
          aria-label="Home handoff details"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 95,
            background: "rgba(var(--atlas-bg-rgb),0.98)",
            borderTop: "1px solid rgba(var(--atlas-gold-rgb),0.24)",
            boxShadow: "0 -18px 48px rgba(var(--atlas-bg-rgb),0.85)",
            borderRadius: "18px 18px 0 0",
            padding: "18px 18px calc(18px + env(safe-area-inset-bottom))",
            animation: "atlas-handoff-drawer-in 220ms ease-out",
          }}
        >
          <div style={{ width: 36, height: 3, borderRadius: 999, background: "rgba(var(--atlas-muted-rgb),0.65)", margin: "0 auto 16px" }} />
          <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--atlas-gold)", marginBottom: 4 }}>
                  Home handoff
                </div>
                <div style={{ color: "var(--atlas-fg)", fontSize: "var(--ts-h3)", fontWeight: 600 }}>
                  Picked up from your home session
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
              <section style={{ border: "1px solid rgba(var(--atlas-gold-rgb),0.16)", borderRadius: 12, padding: 12, background: "rgba(var(--atlas-surface-rgb),0.78)" }}>
                <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-gold)", marginBottom: 10 }}>
                  Flow Nodes
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                  {homeHandoffNodes.length > 0 ? homeHandoffNodes.map((node) => (
                    <div key={node.id ?? `${node.type}-${node.label}`} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                        <span style={{ color: "var(--atlas-fg)", fontSize: "var(--ts-label)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</span>
                        <span style={{ color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>{node.type}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        {(node.moscow ?? node.meta) && (
                          <span style={{ flexShrink: 0, color: "var(--atlas-gold)", border: "1px solid rgba(var(--atlas-gold-rgb),0.28)", background: "rgba(var(--atlas-gold-rgb),0.08)", borderRadius: 999, padding: "1px 6px", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-tiny)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {node.moscow ?? node.meta}
                          </span>
                        )}
                        {node.details && (
                          <span style={{ minWidth: 0, color: "var(--atlas-muted)", fontSize: "var(--ts-caption)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {node.details}
                          </span>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: "var(--atlas-muted)", fontSize: "var(--ts-label)", lineHeight: 1.5 }}>No flow node details were saved for this handoff.</div>
                  )}
                </div>
              </section>

              <section style={{ border: "1px solid rgba(var(--atlas-gold-rgb),0.16)", borderRadius: 12, padding: 12, background: "rgba(var(--atlas-surface-rgb),0.78)" }}>
                <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-gold)", marginBottom: 10 }}>
                  Parked Ideas
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                  {homeHandoffParkedTitles.length > 0 ? homeHandoffParkedTitles.map((title) => (
                    <div key={title} style={{ color: "var(--atlas-fg)", fontSize: "var(--ts-label)", lineHeight: 1.45 }}>
                      {title}
                    </div>
                  )) : (
                    <div style={{ color: "var(--atlas-muted)", fontSize: "var(--ts-label)", lineHeight: 1.5 }}>No parked ideas were saved for this handoff.</div>
                  )}
                </div>
              </section>

              <section style={{ border: "1px solid rgba(var(--atlas-gold-rgb),0.16)", borderRadius: 12, padding: 12, background: "rgba(var(--atlas-surface-rgb),0.78)" }}>
                <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-gold)", marginBottom: 10 }}>
                  Memory
                </div>
                <div style={{ color: "var(--atlas-fg)", fontSize: "var(--ts-label)", lineHeight: 1.5 }}>
                  Conversation memory loaded from home session
                </div>
              </section>
            </div>

            <button
              type="button"
              onClick={() => { setShowHomeHandoffDrawer(false); setShowHomeHandoffBanner(false); }}
              style={{
                width: "100%",
                borderRadius: 12,
                border: "1px solid rgba(var(--atlas-gold-rgb),0.35)",
                background: "rgba(var(--atlas-gold-rgb),0.14)",
                color: "var(--atlas-gold)",
                cursor: "pointer",
                fontFamily: "var(--app-font-mono)",
                fontSize: "var(--ts-label)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "12px 14px",
                textTransform: "uppercase",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Two-pane body (owned by UnifiedConversationSurface on desktop) ── */}
      <UnifiedConversationSurface
        mode="operational"
        projectId={id}
        flowPanel={!isMobile ? (
          <RightPanel
            projectId={id}
            entries={entries || []}
            activeCatch={activeCatch}
            onFileContext={setFileContext}
            onLinkedRepoChange={setLinkedRepo}
            pushHistory={pushHistory}
            onRollbackPush={handleRollbackPush}
            onHomeNav={() => setLocation("/home")}
            forceTab={isMobile && mobileTab === "map" ? "map" : isMobile && mobileTab === "files" ? "files" : isMobile && mobileTab === "blueprints" ? "blueprints" : desktopForceTab}
            onSendIntent={sendFromIntentCapture}
            onFillIntent={(text) => { setInput(text); setTimeout(() => autoResize(), 0); }}
            onMapReadinessChange={setMapReadiness}
            displayedReadinessScore={displayedReadinessScore}
            onSystemNodeMessage={pushSystemNodeMessage}
            onHandover={handleHandover}
            handoverPending={handoverPending}
            lastHandoverHash={project?.lastHandoverHash ?? null}
            isMobile={false}
            fullscreen={desktopRightFull}
            onToggleFullscreen={() => setDesktopRightFull((v) => !v)}
            resolvedNodeIds={pendingResolvedNodeIds}
            onResolvedConsumed={() => setPendingResolvedNodeIds([])}
            currentSnapshot={currentSnapshot}
            onSnapshotChange={setCurrentSnapshot}
            handoverOpen={handoverOpen}
            onHandoverOpenChange={setHandoverOpen}
            sandboxCode={sandboxCode}
            onSandboxConsumed={() => setSandboxCode(null)}
            previewRefreshTrigger={previewRefreshTrigger}
            pendingTerminalCommand={pendingTerminalCommand}
            onTerminalCommandConsumed={() => setPendingTerminalCommand(null)}
            onCommandComplete={handleTerminalComplete}
            wsLens={wsLens}
            onOpenForge={() => setShowForgeExternal(true)}
            externalForgeNodes={externalForgeNodes}
            onForgeNodesConsumed={() => setExternalForgeNodes([])}
            onForgeCompleted={() => void updateForgeState("forged")}
            onContinueSession={(sid) => { setSessionId(Number(sid)); setMobileTab("chat"); setRightOpen(false); }}
          />
        ) : undefined}
        showFlow={!isMobile}
        hostShell={({ stream, panels }) => (
          <div ref={containerRef} style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative", ...(isMobile ? null : { margin: "8px", borderRadius: 14, border: "1px solid var(--atlas-border)", background: "var(--atlas-surface-alt)", boxShadow: "0 4px 18px rgba(0,0,0,0.25)" }) }}>
            {stream}
            {!isMobile && (
              <>
                {!desktopRightFull && (
                  <div
                    onMouseDown={(e) => { e.preventDefault(); startResize(e.clientX); }}
                    onTouchStart={(e) => { startResize(e.touches[0].clientX); }}
                    onDoubleClick={() => setChatWidthPct(45)}
                    title="Drag to resize · Double-tap to reset"
                    style={{
                      width: 12, flexShrink: 0, cursor: "col-resize",
                      background: "transparent",
                      zIndex: 10,
                      touchAction: "none",
                      display: "flex",
                      alignItems: "stretch",
                      justifyContent: "center",
                    }}
                  >
                    <div className="atlas-resize-thread" style={{
                      width: 1,
                      transition: "background 200ms",
                      pointerEvents: "none",
                    }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 240, overflow: "hidden", background: "transparent", position: "relative" }}>
                  {panels.flow}
                </div>
              </>
            )}
          </div>
        )}
      >
        {/* Children below become `stream` inside hostShell. */}
        <>


        {/* ZIP drag overlay */}
        <ZipDragOverlay visible={isDragOver} />

        {/* Left: Chat */}
        <div
          style={{
            width: isMobile ? "100%" : (desktopRightFull ? 0 : `${chatWidthPct}%`),
            minWidth: isMobile ? 0 : (desktopRightFull ? 0 : 300),
            flexShrink: 0,
            display: desktopRightFull && !isMobile ? "none" : "flex",
            flexDirection: "column",
            background: "transparent",
            overflow: "hidden",
            position: "relative",
            // Desktop card chrome lifted onto the outer
            // UnifiedConversationSurface wrapper so left + right read as
            // one unified surface (no inner seam). Mobile keeps its
            // existing edge-to-edge presentation.
            margin: 0,
            borderRadius: 0,
            border: "none",
            boxShadow: "none",
          }}
        >
          {leftTab === "diff" ? (
            <div style={{ flex: 1, height: "100%", overflowY: "auto", padding: "16px 14px" }} className="scrollbar-none">
                    {pushHistory.length === 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, paddingBottom: 40 }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--atlas-muted)" strokeWidth="1.2" strokeLinecap="round" style={{ opacity: 0.25 }}>
                          <path d="M9 1H3a1 1 0 00-1 1v18a1 1 0 001 1h18a1 1 0 001-1V9L13 1z"/><path d="M13 1v8h8"/><path d="M8 13h8M8 17h5"/>
                        </svg>
                        <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-muted)", opacity: 0.4, textAlign: "center", lineHeight: 1.65 }}>
                          No code changes this session yet.<br />
                          <span style={{ fontSize: "var(--ts-sm)" }}>Push files from a Build response to see diffs here.</span>
                        </div>
                      </div>
                    ) : (() => {
                      const groups: PushRecord[][] = [];
                      const seen = new Map<string, PushRecord[]>();
                      for (const r of [...pushHistory].reverse()) {
                        const key = r.commitUrl || r.id;
                        if (!seen.has(key)) { seen.set(key, []); groups.push(seen.get(key)!); }
                        seen.get(key)!.push(r);
                      }
                      return groups.map((group) => (
                        <PushDiffCard
                          key={group[0].commitUrl || group[0].id}
                          records={group}
                          onRollbackAll={async () => { for (const r of group) await handleRollbackPush(r); }}
                        />
                      ));
                    })()}
            </div>
          ) : leftTab === "terminal" ? (
            <TerminalPanel pendingCommand={pendingTerminalCommand} onCommandConsumed={() => setPendingTerminalCommand(null)} onCommandComplete={handleTerminalComplete} scenarioLens={wsLens === "scenario"} />
          ) : leftTab === "blueprints" ? (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <BlueprintsTab
                projectId={id}
                onContinueSession={(sid) => { setSessionId(Number(sid)); setLeftTab("chat"); }}
              />
            </div>
          ) : null}

          <UnifiedConversationSurface
            mode="operational"
            projectId={id}
            chatStreamProps={leftTab !== "diff" && leftTab !== "terminal" && leftTab !== "blueprints" ? {
              scrollRef: chatPanelScrollRef,
              bottomRef: bottomRef,
              onScroll: (e) => {
                const el = e.currentTarget;
                setShowWsScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
              },
              showScrollBtn: showWsScrollBtn,
              onScrollToLatest: () => chatPanelScrollRef.current?.scrollTo({ top: chatPanelScrollRef.current.scrollHeight, behavior: "smooth" }),
              messages,
              chatPending,
              activityStream,
              liveGeneration,
              historyMsgCountRef,
              isHomeHandoff,
              homeHandoffMeta,
              isBrandNewProject,
              project,
              onStarterPrompt: (label) => {
                setInput(label);
                setTimeout(() => textareaRef.current?.focus(), 0);
              },
              wsModel,
              onSwitchToGemini: () => { setWsModel("gemini"); },
              onEditUserMessage: (content) => {
                setInput(content);
                setTimeout(() => textareaRef.current?.focus(), 50);
              },
              projectId: id,
              sessionId,
              linkedRepo,
              trustMode,
              onCatchProceed: (msg) => handleCatchProceed(msg.id),
              onCatchAdjust: (msg) => handleCatchAdjust(msg.id),
              onPark: handlePark,
              onCommit: handleCommit,
              onRegenerate: (i) => handleRegenerate(i),
              onPreviewCode: handlePreviewCode,
              onRunCommand: handleRunCommand,
              onPrCreated: (url) => { setSessionPrUrl(url); setLeftTab("diff"); },
              onExtractToForge: (content) => { setForgePreloadContent(content); setShowForgeExternal(true); },
              onReviewDiff: () => setLeftTab("diff"),
              onEditDeclined: () => {
                if (sessionId) {
                  const editsInFlight = messages
                    .filter((m) => m.role === "assistant" && m.fileEdits && m.fileEdits.length > 0)
                    .slice(-1)[0]?.fileEdits?.map((e) => e.path.split("/").pop()).join(", ") ?? "the proposed changes";
                  doSend(
                    `FILE_EDIT_DECLINED: User reviewed but did not push ${editsInFlight}. Awaiting further instruction.`,
                    sessionId,
                    messagesRef.current,
                  );
                }
              },
              onAlertDismiss: (msg) => {
                setMessages((prev) => prev.map((m) =>
                  m.id === msg.id ? { ...m, alertResolved: true } : m
                ));
              },
              onStreamActivityUpdate: (msg, content) => {
                const markers = [
                  msg.autoFetchedFiles && msg.autoFetchedFiles.length > 0 ? "FILE_READ" : "",
                  msg.fileEdits && msg.fileEdits.length > 0 ? "FILE_EDIT" : "",
                  msg.linePatches && msg.linePatches.length > 0 ? "LINE_PATCH" : "",
                ].filter(Boolean).join("\n");
                setActivityStream({ active: true, content: [content, markers].filter(Boolean).join("\n") });
              },
              onStreamActivityComplete: () => setActivityStream({ active: false, content: "" }),
              onCommitCardDone: () => {
                queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(id, {}) });
                void refreshParkedEntries();
              },
              onSurfaceAction: handleAmbientSurfaceAction,
              planStates,
              planExecutions,
              onPlanStateChange: updatePlanState,
              onPlanExecutionChange: updatePlanExecution,
              onExecuteHomePlan: executeHomePlan,
              onPushSuccess: (records) => {
                haptic.double();
                setPushHistory((prev) => {
                  const next = [...prev, ...records].slice(-20);
                  updateProjectHeader.mutate({ id, data: { pushHistory: next } });
                  return next;
                });
                const filenames = records.map((r) => r.filename).join(", ");
                const branch = records[0]?.branch ?? "unknown";
                const commitUrl = records[0]?.commitUrl ?? "";
                createEntry.mutate(
                  {
                    projectId: id,
                    data: {
                      title: `Code pushed: ${filenames}`,
                      summary: `Branch: ${branch} · Files: ${filenames} · Commit: ${commitUrl}`,
                      status: "committed",
                      severity: "committed",
                      mode: "BUILD",
                      verb: "github_push",
                    },
                  },
                  { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(id, {}) }); void refreshParkedEntries(); } }
                );
                setPreviewRefreshTrigger((t) => t + 1);
                setTimeout(() => setPreviewRefreshTrigger((t) => t + 1), 25000);
                setTimeout(() => setPreviewRefreshTrigger((t) => t + 1), 55000);
                if (sessionId) {
                  if (agenticMode && agenticIterCount >= 8) {
                    // hard-stop at 8 iterations
                  } else {
                    const plural = records.length > 1 ? `${records.length} files` : `"${records[0]?.filename}"`;
                    const confirmNote = commitUrl ? ` Commit: ${commitUrl}` : "";
                    if (agenticMode) setAgenticIterCount((n) => n + 1);
                    doSend(
                      `FILE_EDIT_CONFIRMED: ${plural} pushed to ${branch}.${confirmNote} Continue.`,
                      sessionId,
                      messagesRef.current,
                    );
                  }
                }
              },
            } : null}
            betweenSlot={
              agenticMode && agenticIterCount > 0 ? (
                <div className="atlas-ledger-bar" style={{ opacity: 0.55 }}>
                  <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: "var(--ts-xs)", letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(201,162,76,0.85)' }}>
                    <svg width='8' height='8' viewBox='0 0 24 24' fill='currentColor' style={{ opacity: 0.9, flexShrink: 0 }}>
                      <path d='M13 2L3 14h9l-1 8 10-12h-9l1-8z' />
                    </svg>
                    Agent · Loop {agenticIterCount} / 8
                  </span>
                </div>
              ) : null
            }
            composerProps={{
              leftTab,
              fileInputRef,
              processZip,
              attachedFiles,
              setAttachedFiles,
              zipFiles,
              zipName,
              zipTruncated,
              toggleZipFile,
              setAllZip,
              clearZip,
              firstRunDismissed,
              setFirstRunDismissed,
              sessionsLoading,
              projectLoading,
              sessions,
              messages,
              entries,
              linkedRepo,
              firstRunInput,
              setFirstRunInput,
              sessionId,
              doSend,
              projectId: id,
              isMobile,
              setMobileTab,
              setDesktopForceTab,
              hasInput,
              inputFocused,
              setInputFocused,
              wsLens,
              textareaRef,
              input,
              setInput,
              autoResize,
              handleKeyDown,
              isTinyScreen,
              setShowVault,
              showSrcPicker,
              setShowSrcPicker,
              srcReadLoading,
              ATLAS_SRC_FILES,
              handleReadSrc,
              showDeepDiveMenu,
              setShowDeepDiveMenu,
              deepDiveCopied,
              setDeepDiveCopied,
              setShowWsModelSheet,
              wsModel,
              voiceSupported,
              voiceListening,
              toggleVoice,
              chatPending,
              handleStop,
              handleSend,
              createSessionPending: createSession.isPending,
              sendPreparingSession,
              parkedCount,
              showParkingDrawer,
              setShowParkingDrawer,
              refreshParkedEntries,
            }}
          />

          {showParkingDrawer && (
            <>
              <div
                onClick={() => setShowParkingDrawer(false)}
                style={{ position: "absolute", inset: 0, zIndex: 44, background: "color-mix(in oklab, var(--atlas-bg) 56%, transparent)" }}
              />
              <div
                className="atlas-slide-in-right"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 45,
                  width: "min(360px, 92%)",
                  background: "var(--atlas-bg)",
                  borderLeft: "1px solid var(--atlas-border)",
                  boxShadow: "-24px 0 60px -38px var(--atlas-gold)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ padding: "13px 14px", borderBottom: "1px solid var(--atlas-border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--atlas-gold)", display: "inline-block" }} />
                  <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-gold)" }}>
                    Parking Lot
                  </span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", opacity: 0.65 }}>
                    {parkedCount} items
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowParkingDrawer(false)}
                    style={{ background: "transparent", border: "none", color: "var(--atlas-muted)", cursor: "pointer", fontSize: "var(--ts-base)", lineHeight: 1, padding: "0 3px", opacity: 0.65 }}
                    aria-label="Close parking lot"
                  >
                    ×
                  </button>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px" }} className="scrollbar-none">
                  {parkedEntries.length === 0 ? (
                    <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--atlas-muted)", fontSize: "var(--ts-label)", opacity: 0.6 }}>
                      Nothing parked right now.
                    </div>
                  ) : (
                    parkedEntries.map((entry) => <ParkingLotEntry key={entry.id} entry={entry} />)
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Desktop resize handle + right panel now live in the outer
            UnifiedConversationSurface hostShell above (RightPanel is the
            `flowPanel` slot). Mobile overlay stays here. */}



        {/* Mobile: overlay panel */}
        {isMobile && rightOpen && (
          <div
            style={{ position: "fixed", top: 46, left: 0, right: 0, bottom: mobileTab === "map" ? 0 : 64, zIndex: 50, display: "flex", justifyContent: "flex-end" }}
          >
            {/* Backdrop — hidden in fullscreen */}
            {!rightFullscreen && (
              <div
                onClick={() => setRightOpen(false)}
                style={{
                  position: "absolute", inset: 0,
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(2px)",
                }}
              />
            )}
            {/* Sheet — slide in from right; expands to full when fullscreen */}
            <div
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (rightFullscreen) return;
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                if (dx > 60) setRightOpen(false);
              }}
              className="atlas-slide-in-right"
              style={{
                position: "relative", zIndex: 1,
                width: "100vw",
                maxWidth: "none",
                height: "100%",
                transition: "width 220ms ease, max-width 220ms ease",
              }}
            >
              <RightPanel
                projectId={id}
                entries={entries || []}
                activeCatch={activeCatch}
                onClose={() => { setRightOpen(false); setRightFullscreen(false); }}
                fullscreen={rightFullscreen}
                onToggleFullscreen={() => setRightFullscreen((f) => !f)}
                onFileContext={setFileContext}
                onLinkedRepoChange={setLinkedRepo}
                pushHistory={pushHistory}
                onRollbackPush={handleRollbackPush}
                onHomeNav={() => setLocation("/home")}
                forceTab={mobileTab === "map" ? "map" : mobileTab === "files" ? "files" : mobileTab === "preview" ? "preview" : mobileTab === "blueprints" ? "blueprints" : undefined}
                onSendIntent={sendFromIntentCapture}
                onFillIntent={(text) => { setInput(text); setTimeout(() => autoResize(), 0); }}
                onBackToChat={mobileTab === "map" ? () => { setMobileTab("chat"); setRightOpen(false); } : undefined}
                onMapReadinessChange={setMapReadiness}
                displayedReadinessScore={displayedReadinessScore}
                onSystemNodeMessage={pushSystemNodeMessage}
                onHandover={handleHandover}
                handoverPending={handoverPending}
                lastHandoverHash={project?.lastHandoverHash ?? null}
                isMobile
                resolvedNodeIds={pendingResolvedNodeIds}
                onResolvedConsumed={() => setPendingResolvedNodeIds([])}
                currentSnapshot={currentSnapshot}
                onSnapshotChange={setCurrentSnapshot}
                handoverOpen={handoverOpen}
                onHandoverOpenChange={setHandoverOpen}
                sandboxCode={sandboxCode}
                onSandboxConsumed={() => setSandboxCode(null)}
                previewRefreshTrigger={previewRefreshTrigger}
                pendingTerminalCommand={pendingTerminalCommand}
                onTerminalCommandConsumed={() => setPendingTerminalCommand(null)}
                onCommandComplete={handleTerminalComplete}
                wsLens={wsLens}
                onOpenForge={() => setShowForgeExternal(true)}
                externalForgeNodes={externalForgeNodes}
                onForgeNodesConsumed={() => setExternalForgeNodes([])}
                onForgeCompleted={() => void updateForgeState("forged")}
                onContinueSession={(sid) => { setSessionId(Number(sid)); setMobileTab("chat"); setRightOpen(false); }}
              />
            </div>
          </div>
        )}
        </>
      </UnifiedConversationSurface>


      {isMobile && mobileTab !== "map" && (
        <UnifiedContextDock
          mode="operational"
          activeOperationalTab={mobileTab as "chat" | "ledger" | "preview" | "map" | "files"}
          onAtlasCore={() => { setMobileTab("chat"); setRightOpen(false); }}
          onChat={() => setMobileTab("chat")}
          onLedger={() => setMobileTab("ledger")}
          onPreview={() => setMobileTab("preview")}
          onFlow={() => setLocation("/map")}
          entryCount={entryCount}
          activeCatch={!!activeCatch}
        />
      )}

      {onboardingCoachVisible && (
        <WorkspaceOnboardingCoach
          isMobile={isMobile}
          dismissed={onboardingCoachDismissed}
          onDismiss={dismissOnboardingCoach}
        />
      )}

      {/* Terms · Privacy fixed link */}
      {!isMobile && (
        <div style={{ position: "fixed", bottom: 10, left: 12, display: "flex", gap: 12, zIndex: 10, pointerEvents: "none" }}>
          {[["Terms", "/terms"], ["Privacy", "/privacy"]].map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: "var(--ts-micro)", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.25, letterSpacing: "0.08em", textDecoration: "none", pointerEvents: "auto" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.5")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.25")}
            >{label}</a>
          ))}
        </div>
      )}

      {/* User Profile Panel */}
      {showProfile && <AccountHubPanel onClose={() => setShowProfile(false)} isMobile={isMobile} />}

      {/* Project Settings Panel */}
      {showProjectSettings && project && (
        <ProjectSettingsPanel
          project={project}
          onClose={() => setShowProjectSettings(false)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }); }}
        />
      )}

      {showForgeExternal && (
        <TheForge
          projectId={forgeActiveProjectId ?? id}
          activeProjectName={forgeActiveProjectName ?? project?.name}
          preloadContent={forgePreloadContent}
          onClose={() => { setShowForgeExternal(false); setForgePreloadContent(undefined); }}
          onNodesReady={(nodes) => {
            // Push nodes to Flow canvas
            setExternalForgeNodes(nodes);
            // Store forge context for chat system prompt injection
            const ctx = nodes.map(n => `[${n.type}] ${n.label}`).join(" | ");
            setForgeContext(ctx);
            try { sessionStorage.setItem(`atlas-forge-ctx-${id}`, ctx); } catch {}
            void updateForgeState("forged");
            // Also switch right panel to the map tab so nodes are visible
            setDesktopForceTab("map");
            setTimeout(() => setDesktopForceTab(undefined), 80);
            if (isMobile) setMobileTab("map");
            setShowForgeExternal(false);
            setForgePreloadContent(undefined);
          }}
        />
      )}

      {/* Projects Drawer */}
      <ProjectsDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        projects={(allProjects ?? []).map((p: any) => ({ id: p.id, name: p.name, description: p.description, latestSnapshotScore: p.latestSnapshotScore ?? null }))}
        activeProjectId={id}
        onOpenProject={(projectId) => { setLocation(`/project/${projectId}`); setShowDrawer(false); }}
        onNewProject={() => {
          setShowDrawer(false);
          createProjectMutation.mutate({ data: { name: "New Project" } }, {
            onSuccess: (p) => {
              queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
              setLocation(`/project/${p.id}`);
            },
          });
        }}
        onOpenLedger={(projectId) => { setLocation(`/ledger/${projectId}`); setShowDrawer(false); }}
        onOpenParking={() => { setLocation(`/parking?project=${id}`); setShowDrawer(false); }}
        onOpenQuickPrompt={() => { setShowDrawer(false); setShowForgeExternal(true); }}
        userLabel={loadProfile().name || null}
      />


      {/* ── Workspace model picker sheet ── */}
      {showWsModelSheet && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={() => setShowWsModelSheet(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
          <div style={{
            position: "relative", zIndex: 1, width: "100%", maxWidth: 480,
            background: "var(--atlas-surface)", borderRadius: "16px 16px 0 0",
            borderTop: "1px solid rgba(201,162,76,0.18)",
            boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", paddingBottom: 32,
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--atlas-border)", margin: "12px auto 4px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 10px" }}>
              <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--atlas-gold)" }}>Model</span>
              <button onClick={() => setShowWsModelSheet(false)} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(var(--atlas-muted-rgb),0.6)", fontSize: "var(--ts-display)", lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ padding: "0 14px" }}>
              {([
                { id: "claude", label: "Claude", sub: "Architect · Nuance & Strategy", available: true, icon: "C" },
                { id: "gpt4o", label: "GPT-4o", sub: "Mechanic · Speed & Logic", available: true, icon: "G" },
                { id: "gemini", label: "Gemini", sub: "Strategy · Long Context", available: true, icon: "Ge" },
              ]).map(m => (
                <button
                  key={m.id}
                  disabled={!m.available}
                  onClick={() => { if (m.available) { setWsModel(m.id); setShowWsModelSheet(false); } }}
                  style={{
                    width: "100%", textAlign: "left", padding: "11px 12px", borderRadius: 8,
                    background: wsModel === m.id ? "rgba(201,162,76,0.06)" : "transparent",
                    border: `1px solid ${wsModel === m.id ? "rgba(201,162,76,0.22)" : "transparent"}`,
                    cursor: m.available ? "pointer" : "default",
                    display: "flex", alignItems: "center", gap: 10, marginBottom: 2,
                    opacity: m.available ? 1 : 0.32, transition: "all 140ms ease",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: m.available ? "rgba(201,162,76,0.1)" : "var(--atlas-surface)",
                    border: `1px solid ${m.available ? "rgba(201,162,76,0.25)" : "var(--atlas-surface)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", fontWeight: 700,
                    color: m.available ? "rgba(201,162,76,0.85)" : "rgba(var(--atlas-muted-rgb),0.4)",
                    letterSpacing: "0.02em",
                  }}>
                    {m.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-body)", fontWeight: 500, color: "var(--atlas-fg)", display: "flex", alignItems: "center", gap: 6 }}>
                      {m.label}
                      {!m.available && (
                        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-tiny)", color: "var(--atlas-muted)", letterSpacing: "0.1em", opacity: 0.55, border: "1px solid rgba(var(--atlas-muted-rgb),0.2)", borderRadius: 3, padding: "1px 4px" }}>KEY NEEDED</span>
                      )}
                    </div>
                    <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", letterSpacing: "0.05em", marginTop: 2, opacity: m.available ? 0.7 : 0.4 }}>{m.sub}</div>
                  </div>
                  {wsModel === m.id && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="var(--atlas-gold)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
              <div style={{ margin: "12px 0 4px", padding: "8px 12px", background: "rgba(201,162,76,0.04)", borderRadius: 6, border: "1px solid rgba(201,162,76,0.1)" }}>
                <p style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", letterSpacing: "0.07em", margin: 0, lineHeight: 1.6 }}>
                  TIP: Type <span style={{ color: "rgba(201,162,76,0.7)" }}>/deep [topic]</span> in any message to run a structured research analysis via Gemini — regardless of selected model.
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Lens picker sheet ── */}
      {showLensPicker && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={() => setShowLensPicker(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
          <div style={{
            position: "relative", zIndex: 1, width: "100%", maxWidth: 480,
            background: "var(--atlas-surface)", borderRadius: "16px 16px 0 0",
            borderTop: "1px solid rgba(201,162,76,0.18)",
            boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", paddingBottom: 32,
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--atlas-border)", margin: "12px auto 4px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 10px" }}>
              <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--atlas-gold)" }}>Lens</span>
              <button onClick={() => setShowLensPicker(false)} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(var(--atlas-muted-rgb),0.6)", fontSize: "var(--ts-display)", lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <div style={{ padding: "0 14px" }}>
              {(Object.entries(LENS_CONFIG) as [WorkspaceLens, typeof LENS_CONFIG[WorkspaceLens]][]).map(([lensId, cfg]) => (
                <button
                  key={lensId}
                  onClick={() => setWsLens(lensId)}
                  style={{
                    width: "100%", textAlign: "left", padding: "11px 12px", borderRadius: 8,
                    background: wsLens === lensId ? `${cfg.glowColor}` : "transparent",
                    border: `1px solid ${wsLens === lensId ? cfg.borderColor : "transparent"}`,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2,
                    transition: "all 140ms ease",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: `${cfg.glowColor}`,
                    border: `1px solid ${cfg.borderColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, display: "block" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-body)", fontWeight: 500, color: "var(--atlas-fg)" }}>
                      <span style={{ color: cfg.color }}>{cfg.label}</span>
                      {cfg.model && (
                        <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-tiny)", color: "var(--atlas-muted)", letterSpacing: "0.1em", opacity: 0.6, border: "1px solid rgba(var(--atlas-muted-rgb),0.2)", borderRadius: 3, padding: "1px 4px" }}>
                          {cfg.model === "claude" ? "Claude" : "Gemini"}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", letterSpacing: "0.05em", marginTop: 2, opacity: 0.7 }}>{cfg.sub}</div>
                  </div>
                  {wsLens === lensId && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="var(--atlas-gold)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {detectedLens === lensId && wsLens !== lensId && (
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-tiny)", color: cfg.color, letterSpacing: "0.1em", border: `1px solid ${cfg.borderColor}`, borderRadius: 3, padding: "1px 5px", opacity: 0.85 }}>SUGGESTED</span>
                  )}
                </button>
              ))}
              <div style={{ margin: "10px 0 2px", padding: "8px 12px", background: "rgba(201,162,76,0.04)", borderRadius: 6, border: "1px solid rgba(201,162,76,0.1)" }}>
                <p style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", letterSpacing: "0.07em", margin: 0, lineHeight: 1.6 }}>
                  Lens shapes how Atlas responds — and sets the model. <span style={{ color: "rgba(201,162,76,0.7)" }}>Scenario</span> keeps the model you're already using.
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Scenario exit prompt ── */}
      {showScenarioPrompt && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
          <div onClick={() => setShowScenarioPrompt(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} />
          <div style={{
            position: "relative", zIndex: 1, width: "100%", maxWidth: 360,
            background: "var(--atlas-surface)", borderRadius: 14,
            border: "1px solid rgba(120,113,108,0.35)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: "20px 20px 18px",
          }}>
            <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(120,113,108,0.7)", marginBottom: 8 }}>Leaving Scenario</div>
            <div style={{ fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-md)", color: "var(--atlas-fg)", lineHeight: 1.5, marginBottom: 16 }}>
              What do you want to do with the scenario messages?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={async () => {
                  // Keep: persist buffered scenario messages to session DB
                  if (scenarioBuffer.length > 0 && sessionId) {
                    try {
                      await fetch("/api/chat/scenario-keep", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId, messages: scenarioBuffer }),
                      });
                    } catch { /* non-fatal — messages stay in client state */ }
                  }
                  setScenarioBuffer([]);
                  if (pendingLensSwitch) {
                    setWsLensRaw(pendingLensSwitch);
                    setDetectedLens(null);
                    try { localStorage.setItem(`atlas-ws-lens-v2-${id}`, pendingLensSwitch); } catch {}
                    const cfg = LENS_CONFIG[pendingLensSwitch];
                    if (cfg.model) setWsModel(cfg.model);
                    scenarioStartIdxRef.current = -1;
                    setPendingLensSwitch(null);
                  }
                  setShowScenarioPrompt(false);
                  setShowLensPicker(false);
                }}
                style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(201,162,76,0.08)", border: "1px solid rgba(201,162,76,0.25)", color: "var(--atlas-gold)", cursor: "pointer", fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-body)", textAlign: "left" }}
              >
                Keep — bring it into the project
              </button>
              <button
                onClick={() => {
                  // Discard: remove scenario messages from client state (already not in DB)
                  if (scenarioStartIdxRef.current >= 0) {
                    setMessages(prev => prev.slice(0, scenarioStartIdxRef.current));
                  }
                  setScenarioBuffer([]);
                  if (pendingLensSwitch) {
                    setWsLensRaw(pendingLensSwitch);
                    setDetectedLens(null);
                    try { localStorage.setItem(`atlas-ws-lens-v2-${id}`, pendingLensSwitch); } catch {}
                    const cfg = LENS_CONFIG[pendingLensSwitch];
                    if (cfg.model) setWsModel(cfg.model);
                    setPendingLensSwitch(null);
                  }
                  scenarioStartIdxRef.current = -1;
                  setShowScenarioPrompt(false);
                  setShowLensPicker(false);
                }}
                style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", border: "1px solid rgba(var(--atlas-muted-rgb),0.2)", color: "var(--atlas-muted)", cursor: "pointer", fontFamily: "var(--app-font-sans)", fontSize: "var(--ts-body)", textAlign: "left" }}
              >
                Discard — remove from this session
              </button>
              <button
                onClick={() => { setShowScenarioPrompt(false); setPendingLensSwitch(null); }}
                style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "none", color: "var(--atlas-muted)", cursor: "pointer", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", letterSpacing: "0.06em", opacity: 0.55 }}
              >
                Stay in Scenario
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showVault && (
        <VisualVault
          projectId={id}
          onClose={() => setShowVault(false)}
        />
      )}

      </div>
    </div>
  );
}
