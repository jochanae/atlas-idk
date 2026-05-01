import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StreamingText, ChunkedBubbles } from "@/components/atlas/StreamingText";
import { supabase } from "@/integrations/supabase/client";
import { SystemMenu } from "@/components/atlas/SystemMenu";
import { useAuth } from "@/lib/auth";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import {
  AtlasFrontDoor,
  SessionHistoryList,
  MODES,
  ModeIcon,
  greetingFor,
  type ModeId,
  type RecentSession,
} from "@/components/atlas/AtlasFrontDoor";
import { AtlasSidebar, SidebarToggle } from "@/components/atlas/AtlasSidebar";
import { UserAvatar } from "@/components/atlas/UserAvatar";
import { UserMenu } from "@/components/atlas/UserMenu";
import { SessionBreadcrumb } from "@/components/atlas/SessionBreadcrumb";
import { SessionFooter } from "@/components/atlas/SessionFooter";
import { ArtifactDrawer } from "@/components/atlas/ArtifactDrawer";
import { LivePreview } from "@/components/atlas/LivePreview";
import { DoubleVisionLayout } from "@/components/atlas/DoubleVisionLayout";
import { StageLivingData } from "@/components/atlas/StageLivingData";
import { ProjectGallery } from "@/components/atlas/ProjectGallery";
import { BlueprintsDrawer } from "@/components/atlas/BlueprintsDrawer";
import { DesignSystemDrawer } from "@/components/atlas/DesignSystemDrawer";
import { ExportDrawer } from "@/components/atlas/ExportDrawer";
import { FileTreeDrawer } from "@/components/atlas/FileTreeDrawer";
import { FileTreePanel } from "@/components/atlas/FileTreePanel";
import { ProjectSettingsPanel } from "@/components/atlas/ProjectSettingsPanel";
import { DiffViewer } from "@/components/atlas/DiffViewer";
import { CodeEditor } from "@/components/atlas/CodeEditor";
import { SecretsManagerPanel } from "@/components/atlas/SecretsManagerPanel";
import { DiffPreview } from "@/components/atlas/DiffPreview";
// OnboardingFlow removed
import { CollaborationDrawer } from "@/components/atlas/CollaborationDrawer";
import { GitHubDrawer } from "@/components/atlas/GitHubDrawer";
import { StructuralIntegrityPanel } from "@/components/atlas/StructuralIntegrityPanel";
import { ContextualHUD } from "@/components/atlas/ContextualHUD";
import { BottomSheet } from "@/components/atlas/BottomSheet";
import { MobileSurfaceBar } from "@/components/atlas/MobileSurfaceBar";
import { ProjectHeaderCenter } from "@/components/atlas/ProjectHeaderCenter";
import { TaskQueue, type QueueItem } from "@/components/atlas/TaskQueue";
import { DependencyGraph, type PlanStep } from "@/components/atlas/DependencyGraph";
import { BuildStateTimeline, type BuildStateEntry } from "@/components/atlas/BuildStateTimeline";
import { LiveConsoleStream, type ConsoleEntry } from "@/components/atlas/LiveConsoleStream";
import { SovereignScrubRail, type ScrubNotch } from "@/components/atlas/SovereignScrubRail";

import { GlossaryCard, type KnowledgeEntry } from "@/components/atlas/GlossaryCard";
import { ThinkingPromptCard, type ThinkingPrompt } from "@/components/atlas/ThinkingPromptCard";
import { DesktopWorkspace, type SurfaceId as WorkspaceSurfaceId } from "@/components/atlas/DesktopWorkspace";

import { SeverityDot } from "@/components/atlas/StatusGlyph";
import { CapsuleTag } from "@/components/atlas/CapsuleTag";
import { CommitCard } from "@/components/atlas/CommitCard";
import { MemoryChips, type SurfacedMemory } from "@/components/atlas/MemoryChips";
import {
  parseAtlasMessage,
  type CommitCardPayload,
} from "@/lib/atlas-status";
import { detectArtifacts } from "@/lib/artifacts";
import {
  relativeTime,
  type ChatMessage,
  type Project,
  type Recommendation,
  type Session as AtlasSession,
  type WorkspaceNode,
} from "@/lib/atlas";
import { entriesTable, createEntryFromCard } from "@/lib/entries";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { useVoiceInput } from "@/hooks/useVoiceInput";

type CommitExtraction =
  | {
      decision_found: true;
      title: string;
      description: string;
      constraint: string;
      confidence: "high" | "medium" | "low";
    }
  | { decision_found: false };

type ConflictDetails = {
  conflict: string;
  committed: string;
  committedOn: string;
};

// Legacy ParkedItem shape used by existing UI code. We map Entry rows
// (status='parked') into this shape so the rest of the file keeps working
// without rewriting the consuming components.
type ParkedItem = {
  id: string;
  user_id: string;
  project_id: string;
  session_id: string | null;
  label: string;
  source_context: string;
  kind: string;
  status: "parked" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
};

type SelectionChip = {
  text: string;
  top: number;
  left: number;
};

type UntypedTable = {
  select: (columns?: string) => UntypedTable;
  insert: (values: Record<string, unknown>) => Promise<{ error: Error | null }>;
  update: (values: Record<string, unknown>) => UntypedTable;
  eq: (column: string, value: unknown) => UntypedTable;
  order: (column: string, options?: { ascending?: boolean }) => UntypedTable;
  then: <TResult1 = { data: unknown; error: Error | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
};

function compassTable() {
  return (supabase as unknown as { from: (table: "project_compass") => UntypedTable }).from("project_compass");
}

export const Route = createFileRoute("/")({
  component: WorkspacePage,
  head: () => ({
    meta: [
      { title: "Atlas — Workspace" },
      {
        name: "description",
        content: "Atlas Workspace — chat, workspace, and preview surfaces.",
      },
    ],
  }),
});

function WorkspacePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [session, setSession] = useState<AtlasSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessageIds] = useState(() => new Set<string>());
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const voice = useVoiceInput((transcript) => {
    setInput((prev) => (prev ? prev + " " + transcript : transcript));
    setInputFocusSignal((v) => v + 1);
  });
  // Holds the AbortController for the in-flight atlas-chat call so the user
  // can cancel mid-flight via the Stop button.
  const sendAbortRef = useRef<AbortController | null>(null);
  const [auditWarning, setAuditWarning] = useState(false);
  const [surface, setSurface] = useState<"chat" | "workspace" | "preview">("chat");
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [activeMode, setActiveModeRaw] = useState<ModeId>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("atlas-active-mode");
      if (stored && ["think", "plan", "build", "explore", "decide", "audit"].includes(stored)) return stored as ModeId;
    }
    return "think";
  });
  const setActiveMode = useCallback((mode: ModeId) => {
    setActiveModeRaw(mode);
    try { localStorage.setItem("atlas-active-mode", mode); } catch {}
  }, []);
  const [recents, setRecents] = useState<RecentSession[]>([]);
  const [inputFocusSignal, setInputFocusSignal] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [entrySurface, setEntrySurface] = useState(false);
  const [parkingOpen, setParkingOpen] = useState(false);
  const [parkedItems, setParkedItems] = useState<ParkedItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"obsidian" | "parchment">("obsidian");
  const [ledgerCount, setLedgerCount] = useState(0);
  const [commitPulse, setCommitPulse] = useState(false);
  const [hasCompass, setHasCompass] = useState<boolean | null>(null);
  const [thinkingPrompts, setThinkingPrompts] = useState<ThinkingPrompt[]>([]);
  const [thinkingLoading, setThinkingLoading] = useState(false);
  const [isWideViewport, setIsWideViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : false,
  );
  const [mobileArtifactDrawerOpen, setMobileArtifactDrawerOpen] = useState(false);
  // Code generation / preview state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedFilename, setGeneratedFilename] = useState<string | null>(null);
  const [codegenLoading, setCodegenLoading] = useState(false);
  const [codegenError, setCodegenError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; url: string; type: string }>>([]);
  // Feature drawer state
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);
  const [designSystemOpen, setDesignSystemOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<Array<{ filename: string; language: string; content: string }>>([]);
  // Build state history & console stream
  const [buildHistory, setBuildHistory] = useState<BuildStateEntry[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  // New feature state (items 7–10)
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffOldCode, setDiffOldCode] = useState("");
  const [diffNewCode, setDiffNewCode] = useState("");
  const [diffLabels, setDiffLabels] = useState<{ old: string; new: string }>({ old: "Before", new: "After" });
  const [collaborateOpen, setCollaborateOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  // showOnboarding removed — no welcome card
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueExecuting, setQueueExecuting] = useState(false);
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [depGraphOpen, setDepGraphOpen] = useState(false);
  const [adaptivePlaceholder, setAdaptivePlaceholder] = useState<string | null>(null);
  // Rollback & History system
  type Snapshot = { id: string; name: string; messageId: string; messagesAtPoint: ChatMessage[]; createdAt: string };
  const [rollbackPreview, setRollbackPreview] = useState<{ messageId: string; snapshotLabel: string; messagesAtPoint: ChatMessage[] } | null>(null);
  const [recentRollbackMsgId, setRecentRollbackMsgId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [preRollbackMessages, setPreRollbackMessages] = useState<ChatMessage[] | null>(null);
  const [snapshotBrowserOpen, setSnapshotBrowserOpen] = useState(false);
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [rollbackNaming, setRollbackNaming] = useState(false);
  const [rollbackNameInput, setRollbackNameInput] = useState("");
  const [snapshotCompareA, setSnapshotCompareA] = useState<string | null>(null);
  const [snapshotCompareB, setSnapshotCompareB] = useState<string | null>(null);

  // Track viewport for adaptive shell padding (drawer right-pane reserves space)
  useEffect(() => {
    const onResize = () => setIsWideViewport(window.innerWidth >= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Pulse the breadcrumb gold dot briefly when ledger count grows
  const prevLedgerCount = useRef(ledgerCount);
  useEffect(() => {
    if (ledgerCount > prevLedgerCount.current) {
      setCommitPulse(true);
      const t = window.setTimeout(() => setCommitPulse(false), 4000);
      return () => window.clearTimeout(t);
    }
    prevLedgerCount.current = ledgerCount;
  }, [ledgerCount]);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-obsidian", "theme-parchment");
    root.classList.add(theme === "obsidian" ? "theme-obsidian" : "theme-parchment");
  }, [theme]);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  // Load projects
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .order("created_at");
      const list = (data ?? []) as Project[];
      setProjects(list);
      if (list[0] && !activeProjectId) setActiveProjectId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadRecents = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("sessions")
      .select("id, title, mode, created_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(8);
    setRecents((data ?? []) as RecentSession[]);
  };
  useEffect(() => {
    loadRecents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadParkedItems = async () => {
    if (!user) return;
    // Parking Lot = entries with status='parked'. Same object as Ledger,
    // different state. We map Entry rows back to the legacy ParkedItem
    // shape so existing UI components keep rendering unchanged.
    const { data, error } = await entriesTable()
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "parked")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = ((data ?? []) as unknown as Array<{
      id: string;
      user_id: string;
      project_id: string;
      session_id: string | null;
      title: string;
      summary: string | null;
      verb: string | null;
      created_at: string;
    }>).map<ParkedItem>((e) => ({
      id: e.id,
      user_id: e.user_id,
      project_id: e.project_id,
      session_id: e.session_id,
      label: e.title,
      source_context: e.summary ?? "",
      kind: e.verb ?? "other",
      status: "parked",
      created_at: e.created_at,
      resolved_at: null,
    }));
    setParkedItems(rows);
  };
  useEffect(() => {
    loadParkedItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Ledger count for sidebar badge — counts committed entries.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await entriesTable()
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "committed");
      setLedgerCount((data ?? []).length);
    })();
  }, [user, session?.id]);

  // §XI Phase 3 — Load pending thinking prompts for the active project
  const loadThinkingPrompts = async (projectId?: string | null) => {
    const pid = projectId ?? activeProjectId;
    if (!user || !pid) {
      setThinkingPrompts([]);
      return;
    }
    const { data, error } = await supabase
      .from("recommendations")
      .select("id, content, definition, benefit")
      .eq("project_id", pid)
      .eq("user_id", user.id)
      .eq("kind", "thinking_prompt")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(3);
    if (error) return;
    setThinkingPrompts(
      ((data ?? []) as Array<{
        id: string;
        content: string;
        definition: string | null;
        benefit: string | null;
      }>).map((r) => ({
        id: r.id,
        content: r.content,
        definition: r.definition ?? "",
        benefit: r.benefit ?? "",
      })),
    );
  };

  const regenerateThinkingPrompts = async () => {
    if (!user || !activeProjectId) return;
    setThinkingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "atlas-thinking",
        {
          body: { projectId: activeProjectId, sessionId: session?.id ?? null },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await loadThinkingPrompts(activeProjectId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to refresh prompts";
      toast.error(msg);
    } finally {
      setThinkingLoading(false);
    }
  };

  // Load prompts when project changes; regenerate on key state shifts
  useEffect(() => {
    loadThinkingPrompts(activeProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeProjectId]);

  // Auto-regenerate when ledger grows or compass is created (debounced via deps)
  const lastTriggerRef = useRef<{ ledger: number; compass: boolean | null }>({
    ledger: 0,
    compass: null,
  });
  useEffect(() => {
    if (!user || !activeProjectId || hasCompass !== true) return;
    const prev = lastTriggerRef.current;
    const ledgerGrew = ledgerCount > prev.ledger && prev.ledger > 0;
    const compassJustAppeared = prev.compass === false && hasCompass === true;
    lastTriggerRef.current = { ledger: ledgerCount, compass: hasCompass };
    if (ledgerGrew || compassJustAppeared) {
      regenerateThinkingPrompts();
    } else if (prev.ledger === 0 && ledgerCount === 0 && thinkingPrompts.length === 0 && !thinkingLoading) {
      // First-load opportunity when compass exists
      regenerateThinkingPrompts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerCount, hasCompass, activeProjectId, user?.id]);

  // ── Rollback & History ──
  const handleRollback = useCallback((targetMessage: ChatMessage) => {
    if (!user || !activeProjectId || !session) return;
    // Permission check: only session owner can rollback
    if (session.user_id !== user.id) {
      toast.error("Only the session owner can rollback.");
      return;
    }
    const idx = messages.findIndex((m) => m.id === targetMessage.id);
    if (idx < 0) return;
    const snapshotMessages = messages.slice(0, idx + 1);
    const autoName = `Snapshot @ ${targetMessage.content.slice(0, 40).replace(/\n/g, " ")}…`;
    const currentSummary = messages.map((m) => `[${m.role}] ${m.content.slice(0, 80)}`).join("\n");
    const historicalSummary = snapshotMessages.map((m) => `[${m.role}] ${m.content.slice(0, 80)}`).join("\n");
    setDiffOldCode(currentSummary);
    setDiffNewCode(historicalSummary);
    setDiffLabels({ old: "Current State", new: "Rollback Target" });
    setRollbackPreview({ messageId: targetMessage.id, snapshotLabel: autoName, messagesAtPoint: snapshotMessages });
    setRollbackNameInput(autoName);
    setRollbackNaming(true);
    setDiffOpen(true);
  }, [messages, user, activeProjectId, session]);

  const confirmRollback = useCallback(async () => {
    if (!rollbackPreview || !user || !activeProjectId || !session) return;
    const snapshotName = rollbackNameInput.trim() || rollbackPreview.snapshotLabel;
    // Save pre-rollback state for undo
    setPreRollbackMessages([...messages]);
    // Save as a named snapshot
    setSnapshots((prev) => [
      {
        id: crypto.randomUUID(),
        name: snapshotName,
        messageId: rollbackPreview.messageId,
        messagesAtPoint: rollbackPreview.messagesAtPoint,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    // Execute rollback
    setMessages(rollbackPreview.messagesAtPoint);
    try {
      await createEntryFromCard({
        userId: user.id,
        projectId: activeProjectId,
        sessionId: session.id,
        sourceMessageId: rollbackPreview.messageId,
        payload: {
          v: 1,
          title: "System Reversion",
          summary: `Rolled back to: ${snapshotName}`,
          severity: "neutral",
          verb: "audit",
        },
        status: "committed",
        mode: activeMode,
      });
      setLedgerCount((c) => c + 1);
    } catch (e) {
      console.error("Rollback ledger entry failed", e);
    }
    setAdaptivePlaceholder(`Code reverted to ${snapshotName.slice(0, 50)}. What's next?`);
    setRecentRollbackMsgId(rollbackPreview.messageId);
    setTimeout(() => setRecentRollbackMsgId(null), 3000);
    setRollbackPreview(null);
    setRollbackNaming(false);
    setDiffOpen(false);
    toast.success("Rolled back successfully");
  }, [rollbackPreview, rollbackNameInput, messages, user, activeProjectId, session]);

  const cancelRollback = useCallback(() => {
    setRollbackPreview(null);
    setRollbackNaming(false);
    setDiffOpen(false);
  }, []);

  // Undo last rollback — restores pre-rollback message state
  const undoRollback = useCallback(() => {
    if (!preRollbackMessages) return;
    setMessages(preRollbackMessages);
    setPreRollbackMessages(null);
    setAdaptivePlaceholder(null);
    toast.success("Rollback undone");
  }, [preRollbackMessages]);

  // Restore from a named snapshot
  const restoreSnapshot = useCallback((snapshot: Snapshot) => {
    setPreRollbackMessages([...messages]);
    setMessages(snapshot.messagesAtPoint);
    setSnapshotBrowserOpen(false);
    setAdaptivePlaceholder(`Restored "${snapshot.name}". What's next?`);
    toast.success(`Restored: ${snapshot.name}`);
  }, [messages]);
  const [autoRunEnabled, setAutoRunEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("atlas-auto-run") === "true"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("atlas-auto-run", String(autoRunEnabled)); } catch {} }, [autoRunEnabled]);
  type CanvasViewport = "desktop" | "tablet" | "mobile";
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport>("desktop");
  const CANVAS_WIDTHS: Record<CanvasViewport, number | null> = { desktop: null, tablet: 768, mobile: 375 };

  // Secrets manager state
  type SecretEntry = { name: string; isSet: boolean };
  const [projectSecrets, setProjectSecrets] = useState<SecretEntry[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const loadProjectSecrets = useCallback(async () => {
    setSecretsLoading(true);
    // Known secrets from project config — in a real integration this would query the backend
    const knownSecrets: SecretEntry[] = [
      { name: "ANTHROPIC_API_KEY", isSet: true },
      { name: "SUPABASE_SERVICE_ROLE_KEY", isSet: true },
      { name: "SUPABASE_URL", isSet: true },
      { name: "SUPABASE_ANON_KEY", isSet: true },
      { name: "SUPABASE_DB_URL", isSet: true },
      { name: "LOVABLE_API_KEY", isSet: true },
    ];
    setProjectSecrets(knownSecrets);
    setSecretsLoading(false);
  }, []);
  useEffect(() => { loadProjectSecrets(); }, [loadProjectSecrets]);

  // Diff preview state for canvas
  const [diffPreviewActive, setDiffPreviewActive] = useState(false);
  const [previousCode, setPreviousCode] = useState<string | null>(null);

  // Persistent editor state — selected file, editor content, open tabs
  const [editorOpenTabs, setEditorOpenTabs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { const v = localStorage.getItem("atlas-editor-tabs"); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [editorActiveFile, setEditorActiveFile] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem("atlas-editor-active-file") || null; } catch { return null; }
  });
  useEffect(() => { try { localStorage.setItem("atlas-editor-tabs", JSON.stringify(editorOpenTabs)); } catch {} }, [editorOpenTabs]);
  useEffect(() => { try { localStorage.setItem("atlas-editor-active-file", editorActiveFile ?? ""); } catch {} }, [editorActiveFile]);

  // Build secrets sync state
  const [buildSecrets, setBuildSecrets] = useState<Array<{ name: string; value: string }>>(() => {
    if (typeof window === "undefined") return [];
    try { const v = localStorage.getItem("atlas-build-secrets"); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("atlas-build-secrets", JSON.stringify(buildSecrets)); } catch {} }, [buildSecrets]);

  // Diff accept/reject via keyboard when diff is active
  useEffect(() => {
    if (!diffPreviewActive || !previousCode || !generatedCode) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        setPreviousCode(generatedCode);
        setDiffPreviewActive(false);
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        setGeneratedCode(previousCode);
        setDiffPreviewActive(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [diffPreviewActive, previousCode, generatedCode]);


  // Track whether the active project already has a Compass (used by thinking prompts)
  useEffect(() => {
    if (!user || !activeProjectId) {
      setHasCompass(null);
      return;
    }
    (async () => {
      const { data, error } = await compassTable()
        .select("id")
        .eq("project_id", activeProjectId)
        .eq("user_id", user.id)
        .order("version", { ascending: false });
      if (error) {
        setHasCompass(null);
        return;
      }
      const list = (data ?? []) as Array<{ id: string }>;
      setHasCompass(list.length > 0);
    })();
  }, [user, activeProjectId]);

  const refresh = async (
    targetSession = session,
    targetProjectId = activeProjectId,
  ) => {
    if (!targetSession || !targetProjectId) return;
    const [m, n, r] = await Promise.all([
      supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", targetSession.id)
        .order("created_at"),
      supabase
        .from("workspace_nodes")
        .select("*")
        .eq("project_id", targetProjectId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false }),
      supabase
        .from("recommendations")
        .select("*")
        .eq("project_id", targetProjectId)
        .order("created_at", { ascending: false }),
    ]);
    if (m.data) setMessages(m.data as ChatMessage[]);
    if (n.data) setNodes(n.data as unknown as WorkspaceNode[]);
    if (r.data) setRecs(r.data as Recommendation[]);
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const pendingRecs = useMemo(
    () => recs.filter((r) => r.status === "pending"),
    [recs],
  );

  const continueAfterConflict = async (conflictMessageId: string) => {
    const conflictIndex = messages.findIndex((m) => m.id === conflictMessageId);
    const previousUserMessage = [...messages]
      .slice(0, conflictIndex)
      .reverse()
      .find((m) => m.role === "user");
    if (!previousUserMessage) return;
    await send(`Proceed anyway. Continue with the original request: ${previousUserMessage.content}`);
  };

  /** Derive a short project name from the user's first message */
  const deriveProjectName = (text: string): string => {
    // Strip commands
    const cleaned = text.replace(/^\/(build|research|plan)\s+/i, "").trim();
    // Take first sentence or first 50 chars
    const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim() ?? cleaned;
    const name = firstSentence.slice(0, 50).trim();
    return name || "Untitled Project";
  };

  /** Create a brand-new project + session from the user's first message */
  const createProjectFromMessage = async (text: string): Promise<{ session: AtlasSession; projectId: string }> => {
    if (!user) throw new Error("Not authenticated");
    const projectName = deriveProjectName(text);

    // 1. Create project
    const { data: projData, error: projErr } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name: projectName, status: "Active" })
      .select("*")
      .single();
    if (projErr) throw projErr;
    const newProject = projData as Project;

    // 2. Update local state
    setProjects((prev) => [...prev, newProject]);
    setActiveProjectId(newProject.id);

    // 3. Create session under the new project
    const { data: sessData, error: sessErr } = await supabase
      .from("sessions")
      .insert({
        project_id: newProject.id,
        user_id: user.id,
        title: projectName,
        mode: activeMode,
        status: "active",
      })
      .select("*")
      .single();
    if (sessErr) throw sessErr;

    const newSession = sessData as AtlasSession;
    setSession(newSession);
    setRecents((prev) => [
      {
        id: newSession.id,
        title: projectName,
        mode: activeMode,
        created_at: newSession.created_at,
      },
      ...prev.filter((r) => r.id !== newSession.id),
    ].slice(0, 8));

    return { session: newSession, projectId: newProject.id };
  };

  const ensureSession = async (text: string) => {
    if (session && activeProjectId) return { session, projectId: activeProjectId };
    if (!user) return null;

    // No active session → auto-create a new project + session
    return createProjectFromMessage(text);
  };

  const send = async (text: string) => {
    if (!text.trim() || sending) return;

    // Detect /build command → route to code generation
    const buildMatch = text.match(/^\/build\s+(.+)/is);
    if (buildMatch) {
      setInput("");
      generateCode(buildMatch[1].trim());
      return;
    }

    // Detect /research command → route to sovereign research
    const researchMatch = text.match(/^\/research\s+(.+)/is);
    if (researchMatch) {
      setInput("");
      setSending(true);
      setTransitioning(true);
      setSurface("chat");
      const query = researchMatch[1].trim();
      const optimisticId = crypto.randomUUID();
      try {
        const target = await ensureSession(query);
        if (!target) throw new Error("No project available");
        const optimistic: ChatMessage = {
          id: optimisticId,
          session_id: target.session.id,
          user_id: user!.id,
          role: "user",
          content: `/research ${query}`,
          intent_type: "research",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimistic]);
        const { data, error } = await supabase.functions.invoke("atlas-research", {
          body: { projectId: target.projectId, query },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const researchContent = data?.research ?? "No results returned.";
        const contextNote = data?.context
          ? `\n\n---\n*Research context: ${data.context.project} · Compass: ${data.context.compassLoaded ? "✓" : "✗"} · ${data.context.ledgerEntriesUsed} ledger entries applied*`
          : "";
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          session_id: target.session.id,
          user_id: user!.id,
          role: "assistant",
          content: researchContent + contextNote,
          intent_type: "research",
          created_at: new Date().toISOString(),
        };
        newMessageIds.add(assistantMsg.id);
        setMessages((prev) => [...prev, assistantMsg]);
        setAdaptivePlaceholder("Follow up on the research, or ask something new…");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Research failed";
        toast.error(msg);
      } finally {
        setSending(false);
        setTransitioning(false);
      }
      return;
    }

    setSending(true);
    setAuditWarning(false);
    setInput("");
    setAdaptivePlaceholder(null);
    setTransitioning(true);
    setSurface("chat");

    const controller = new AbortController();
    sendAbortRef.current = controller;
    const optimisticId = crypto.randomUUID();

    try {
      const target = await ensureSession(text);
      if (!target) throw new Error("No project available");

      const optimistic: ChatMessage = {
        id: optimisticId,
        session_id: target.session.id,
        user_id: user!.id,
        role: "user",
        content: text,
        intent_type: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      const planModeHint = activeMode === "plan"
        ? "\n\n[SYSTEM: User is in Plan Mode. Respond with an architectural breakdown. Format steps as a numbered list. Each step should be a clear, actionable phase. If steps depend on each other, mention the dependency explicitly (e.g. 'depends on step 1'). Do NOT write code.]"
        : "";

      const thinkStart = Date.now();
      const { data, error } = await supabase.functions.invoke("atlas-chat", {
        body: {
          sessionId: target.session.id,
          projectId: target.projectId,
          message: text + planModeHint,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
        signal: controller.signal,
      });
      const thinkSeconds = Math.round((Date.now() - thinkStart) / 1000);
      if (controller.signal.aborted) return;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Automated ledger logging — "Thought for Xs" timeline entry
      try {
        await entriesTable().insert({
          user_id: user!.id,
          project_id: target.projectId,
          session_id: target.session.id,
          status: "committed",
          severity: "neutral",
          title: `Thought for ${thinkSeconds}s`,
          summary: `Atlas processed: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`,
          verb: "note",
        });
        setLedgerCount((c) => c + 1);
      } catch {
        // Non-critical — don't block chat flow
      }
      // Mark the new assistant message for streaming animation
      if (data?.message?.id) newMessageIds.add(data.message.id);
      const updatedTitle = text.slice(0, 60);
      setSession((current) =>
        current && current.id === target.session.id
          ? { ...current, title: updatedTitle }
          : current,
      );
      setRecents((prev) =>
        prev.map((recent) =>
          recent.id === target.session.id
            ? { ...recent, title: updatedTitle }
            : recent,
        ),
      );
      // If in Plan mode, extract numbered steps from the response
      if (activeMode === "plan" && data?.message?.content) {
        const content = data.message.content as string;
        const stepRegex = /(?:^|\n)\s*(\d+)\.\s+\*{0,2}(.+?)\*{0,2}(?=\n|$)/g;
        const extracted: PlanStep[] = [];
        let match: RegExpExecArray | null;
        while ((match = stepRegex.exec(content)) !== null) {
          const label = match[2].replace(/\*+/g, "").trim().slice(0, 60);
          const stepNum = match[1];
          // Check for "depends on step N" mentions
          const depMatch = match[2].match(/depends?\s+on\s+step\s+(\d+)/i);
          const deps: string[] = [];
          if (depMatch) {
            const depIdx = extracted.findIndex((s) => s.id.endsWith(`-${depMatch[1]}`));
            if (depIdx >= 0) deps.push(extracted[depIdx].id);
          } else if (extracted.length > 0) {
            // Default: each step depends on the previous
            deps.push(extracted[extracted.length - 1].id);
          }
          extracted.push({ id: `plan-${stepNum}`, label, dependsOn: deps });
        }
        if (extracted.length > 0) setPlanSteps(extracted);
      }

      // ═══ BUILD auto-codegen: when WhisperGate classifies as BUILD,
      // automatically generate a component and show it in LivePreview ═══
      if (data?.intent?.mode === "BUILD") {
        generateCode(text).catch((err) => {
          const msg = err instanceof Error ? err.message : "Build failed";
          console.error("auto-codegen error:", msg);
          toast.error(msg);
          setCodegenLoading(false);
        });
      }

      await refresh(target.session, target.projectId);
    } catch (e) {
      // User-initiated abort — clean up quietly, don't show an error toast.
      if (controller.signal.aborted || (e instanceof Error && e.name === "AbortError")) {
        // Drop the optimistic user message so the unsent prompt doesn't linger
        // in the transcript pretending it was delivered.
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        // Restore the text so they can edit and resend.
        setInput(text);
        toast("Atlas stopped.", { description: "Your message was not sent." });
        if (!session && messages.length === 0) setTransitioning(false);
        return;
      }
      const msg = e instanceof Error ? e.message : "Atlas failed to respond";
      toast.error(msg);
      setAuditWarning(true);
      if (!session && messages.length === 0) setTransitioning(false);
    } finally {
      sendAbortRef.current = null;
      setSending(false);
    }
  };

  /** Cancel the in-flight atlas-chat request, if any. */
  const stopSending = () => {
    sendAbortRef.current?.abort();
  };

  /** Push a build state entry and a console log */
  const pushBuildState = useCallback((state: BuildStateEntry["state"], label: string) => {
    const entry: BuildStateEntry = { id: crypto.randomUUID(), state, label, timestamp: Date.now() };
    setBuildHistory((prev) => {
      // Close duration on previous entry
      const updated = prev.length > 0
        ? prev.map((e, i) => i === prev.length - 1 && !e.duration_ms ? { ...e, duration_ms: Date.now() - e.timestamp } : e)
        : prev;
      return [...updated, entry];
    });
    setConsoleLogs((prev) => [...prev, { id: crypto.randomUUID(), level: "system", message: label, timestamp: Date.now(), source: "build" }]);
  }, []);

  const pushConsole = useCallback((level: ConsoleEntry["level"], message: string, source?: string) => {
    setConsoleLogs((prev) => [...prev, { id: crypto.randomUUID(), level, message, timestamp: Date.now(), source }]);
  }, []);

  /** Generate a React component via atlas-codegen */
  const generateCode = useCallback(async (prompt: string) => {
    if (!user || !activeProjectId) {
      toast.error("No active project — cannot generate code.");
      return;
    }
    setCodegenLoading(true);
    setCodegenError(null);
    setSurface("preview");
    pushBuildState("building", `Building: ${prompt.slice(0, 60)}…`);
    pushConsole("info", `▶ /build ${prompt.slice(0, 80)}`);
    try {
      const { data, error } = await supabase.functions.invoke("atlas-codegen", {
        body: {
          projectId: activeProjectId,
          sessionId: session?.id ?? null,
          prompt,
          context: attachedFiles.length > 0
            ? `Attached files: ${attachedFiles.map(f => f.name).join(", ")}`
            : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      pushBuildState("verifying", "Verifying output…");
      pushConsole("info", `✓ Generated ${data.file?.filename ?? "component"}`);
      if (generatedCode) setPreviousCode(generatedCode);
      setGeneratedCode(data.file?.content ?? null);
      setGeneratedFilename(data.file?.filename ?? null);
      if (data.file?.content && data.file?.filename) {
        setGeneratedFiles((prev) => [...prev, { filename: data.file.filename, language: data.file.language ?? "tsx", content: data.file.content }]);
        try {
          await entriesTable().insert({
            user_id: user!.id,
            project_id: activeProjectId!,
            session_id: session?.id ?? null,
            status: "committed",
            severity: "neutral",
            title: `Applied Patch — ${data.file.filename}`,
            summary: `Generated ${data.file.language ?? "tsx"} file via /build command.`,
            verb: "build",
          });
          setLedgerCount((c) => c + 1);
        } catch {
          // Non-critical
        }
      }
      pushBuildState("idle", "Build complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Code generation failed";
      pushBuildState("idle", `Build failed: ${msg.slice(0, 60)}`);
      pushConsole("error", msg);
      setCodegenError(msg);
      toast.error(msg);
    } finally {
      setCodegenLoading(false);
    }
  }, [user, activeProjectId, session?.id, attachedFiles]);

  const openSession = async (targetSessionId: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", targetSessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return toast.error(error.message);
    if (!data) return;
    const selected = data as AtlasSession;
    setSession(selected);
    setActiveProjectId(selected.project_id);
    setSurface("chat");
    setEntrySurface(false);
    setHistoryOpen(false);
    await refresh(selected, selected.project_id);
  };

  const updateRec = async (id: string, status: Recommendation["status"]) => {
    const rec = recs.find((r) => r.id === id);
    if (!rec) return;
    const { error } = await supabase
      .from("recommendations")
      .update({ status })
      .eq("id", id);
    if (error) return toast.error(error.message);

    if (status === "accepted" && user) {
      // Log to Architectural Ledger as a committed Entry.
      await entriesTable().insert({
        user_id: user.id,
        project_id: rec.project_id,
        status: "committed",
        severity: "committed",
        verb: "note",
        title: rec.content,
        summary: `Accepted recommendation. ${rec.definition ?? ""}`.trim(),
      });
      toast.success("Accepted — logged to ledger");
    } else if (status === "parked") {
      toast.success("Parked");
    } else {
      toast.success("Dismissed");
    }
    setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  // §XI Phase 3 — actions on a thinking prompt
  const askThinkingPrompt = async (prompt: ThinkingPrompt) => {
    setThinkingPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
    await supabase
      .from("recommendations")
      .update({ status: "accepted" })
      .eq("id", prompt.id);
    setInput(prompt.content);
    setInputFocusSignal((v) => v + 1);
    void send(prompt.content);
  };

  const parkThinkingPrompt = async (prompt: ThinkingPrompt) => {
    if (!user || !activeProjectId) return;
    setThinkingPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
    await Promise.all([
      supabase
        .from("recommendations")
        .update({ status: "parked" })
        .eq("id", prompt.id),
      entriesTable().insert({
        user_id: user.id,
        project_id: activeProjectId,
        session_id: session?.id ?? null,
        status: "parked",
        title: prompt.content,
        summary: "thinking prompt",
        severity: "parked",
        verb: "note",
      }),
    ]);
    await loadParkedItems();
    toast.success("Parked");
  };

  const dismissThinkingPrompt = async (prompt: ThinkingPrompt) => {
    setThinkingPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
    await supabase
      .from("recommendations")
      .update({ status: "dismissed" })
      .eq("id", prompt.id);
  };

  // ── Task Queue handlers ──
  const addToQueue = useCallback((text: string) => {
    setQueueItems((prev) => [...prev, { id: crypto.randomUUID(), text, status: "pending" as const }]);
    haptic("light");
  }, []);

  const executeQueueItem = useCallback(async (id: string) => {
    setQueueItems((prev) => prev.map((i) => i.id === id ? { ...i, status: "running" as const } : i));
    const item = queueItems.find((i) => i.id === id);
    if (!item) return;
    try { await send(item.text); setQueueItems((prev) => prev.map((i) => i.id === id ? { ...i, status: "done" as const } : i)); }
    catch { setQueueItems((prev) => prev.map((i) => i.id === id ? { ...i, status: "failed" as const } : i)); }
  }, [queueItems]);

  const executeAllQueue = useCallback(async () => {
    const pending = queueItems.filter((i) => i.status === "pending");
    if (!pending.length) return;
    setQueueExecuting(true);
    for (const item of pending) { await executeQueueItem(item.id); }
    setQueueExecuting(false);
  }, [queueItems, executeQueueItem]);

  // Promote a plan step to the queue — with full dependency context
  const [autoExpandQueueId, setAutoExpandQueueId] = useState<string | null>(null);

  const promoteStepToQueue = useCallback((step: PlanStep, context?: import("@/components/atlas/DependencyGraph").PromoteContext) => {
    const contextSuffix = context
      ? [
          context.dependencyLabels.length ? ` [depends on: ${context.dependencyLabels.join(", ")}]` : "",
          context.dependentLabels.length ? ` [unlocks: ${context.dependentLabels.join(", ")}]` : "",
        ].join("")
      : "";
    const newId = crypto.randomUUID();
    setQueueItems((prev) => [
      ...prev,
      {
        id: newId,
        text: step.label + contextSuffix,
        status: "pending" as const,
        planStepId: step.id,
        dependsOn: step.dependsOn,
      },
    ]);
    setAutoExpandQueueId(newId);
    haptic("light");
  }, []);

  const jumpToPlanStep = useCallback((planStepId: string) => {
    setActiveMode("plan");
    haptic("light");
    const step = planSteps.find((s) => s.id === planStepId);
    if (step) {
      setAdaptivePlaceholder(`expand on "${step.label}"…`);
      setInput(`Expand on the plan step: ${step.label}`);
      setInputFocusSignal((v) => v + 1);
      setTimeout(() => setAdaptivePlaceholder(null), 5000);
    }
  }, [planSteps, setActiveMode]);

  // Keyboard shortcuts: Cmd+Shift+Enter = run all queue, Cmd+Backspace = remove last pending
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const pending = queueItems.filter((i) => i.status === "pending");
      if (e.shiftKey && e.key === "Enter" && pending.length) {
        e.preventDefault();
        executeAllQueue();
        return;
      }
      if (e.key === "Backspace" && pending.length) {
        e.preventDefault();
        setQueueItems((prev) => {
          const lastPending = [...prev].reverse().find((i) => i.status === "pending");
          return lastPending ? prev.filter((i) => i.id !== lastPending.id) : prev;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queueItems, executeAllQueue]);

  const isActive = (!!session || transitioning || messages.length > 0) && !entrySurface;
  const artifacts = useMemo(() => detectArtifacts(messages), [messages]);
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  // Export plan steps as JSON blueprint
  const exportPlanJSON = useCallback(() => {
    if (!planSteps.length) return;
    const blueprint = {
      exportedAt: new Date().toISOString(),
      project: activeProject?.name ?? "Unknown",
      steps: planSteps.map((s) => ({
        id: s.id,
        label: s.label,
        dependsOn: s.dependsOn,
      })),
    };
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-blueprint-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Blueprint downloaded");
  }, [planSteps, activeProject]);

  const showWideDrawer = isActive && artifacts.length > 0 && isWideViewport;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Map current 3-mode surface state ("chat"|"workspace"|"preview") + parking drawer
  // onto the canonical 4-surface nav for the desktop workspace.
  const desktopActiveSurface: WorkspaceSurfaceId = parkingOpen
    ? "parking"
    : surface === "workspace"
      ? "compass"
      : surface === "preview"
        ? "ledger"
        : "chat";

  const handleDesktopSurfaceChange = (next: WorkspaceSurfaceId) => {
    setHistoryOpen(false);
    setEntrySurface(false);
    if (next === "parking") {
      setParkingOpen(true);
      return;
    }
    setParkingOpen(false);
    if (next === "ledger") {
      navigate({ to: "/ledger" });
      return;
    }
    if (next === "compass") {
      setSurface("workspace");
      return;
    }
    setSurface("chat");
  };

  const mainShell = (
    <div className="atlas-shell-host min-h-screen h-full bg-background text-foreground flex flex-col" style={{ overflow: "visible" }}>
      <FooterAuditLine state={auditWarning ? "warning" : "healthy"} />
      <main className="relative flex-1 min-h-0" style={{ overflow: "visible" }}>

        <AtlasFrontDoor
          active={isActive}
          input={input}
          onInputChange={(v) => { setInput(v); if (adaptivePlaceholder) setAdaptivePlaceholder(null); }}
          sending={sending}
          activeMode={activeMode}
          inputFocusSignal={inputFocusSignal}
          onModeChange={setActiveMode}
          onSend={send}
          onStop={stopSending}
          recents={recents}
          onOpenSession={openSession}
          onViewAllRecents={() => {
            setEntrySurface(false);
            setHistoryOpen(true);
          }}
          userName={
            (user.user_metadata?.display_name as string | undefined) ||
            (user.user_metadata?.full_name as string | undefined) ||
            (user.user_metadata?.name as string | undefined) ||
            (user.email ? user.email.split("@")[0] : null)
          }
          userId={user.id}
          projectId={activeProjectId}
          onFilesUploaded={(files) => setAttachedFiles((prev) => [...prev, ...files])}
          onGenerateCode={generateCode}
          onSystemMenuSelect={(id) => {
            if (id === "blueprints") setBlueprintsOpen(true);
            else if (id === "design") setDesignSystemOpen(true);
            else if (id === "connectors") setExportOpen(true);
            else if (id === "filetree") setFileTreeOpen(true);
            else if (id === "diff") {
              // Show diff of the last two generated files if available
              if (generatedFiles.length >= 2) {
                const prev = generatedFiles[generatedFiles.length - 2];
                const curr = generatedFiles[generatedFiles.length - 1];
                setDiffOldCode(prev.content);
                setDiffNewCode(curr.content);
                setDiffLabels({ old: prev.filename, new: curr.filename });
              } else if (generatedFiles.length === 1) {
                setDiffOldCode("");
                setDiffNewCode(generatedFiles[0].content);
                setDiffLabels({ old: "(empty)", new: generatedFiles[0].filename });
              }
              setDiffOpen(true);
            }
            else if (id === "collaborate") setCollaborateOpen(true);
            else if (id === "github") setGithubOpen(true);
            else if (id === "snapshots") setSnapshotBrowserOpen(true);
            else if (id === "integrity") setIntegrityOpen(true);
            else if (id === "research") {
              setInput("/research ");
              setSurface("chat");
              setInputFocusSignal((s) => s + 1);
            }
            else if (id === "databases") {
              navigate({ to: "/ledger" });
            }
          }}
          taskQueue={
            session ? (
              <TaskQueue
                items={queueItems}
                onReorder={setQueueItems}
                onEdit={(id, text) => setQueueItems((prev) => prev.map((i) => i.id === id ? { ...i, text } : i))}
                onRemove={(id) => setQueueItems((prev) => prev.filter((i) => i.id !== id))}
                onDuplicate={(id) => { const item = queueItems.find((i) => i.id === id); if (item) addToQueue(item.text); }}
                onExecuteAll={executeAllQueue}
                onExecuteOne={executeQueueItem}
                executing={queueExecuting}
                onJumpToPlanStep={jumpToPlanStep}
                autoExpandId={autoExpandQueueId}
              />
            ) : undefined
          }
          onAddToQueue={addToQueue}
          queueActive={queueItems.some((i) => i.status === "pending")}
          adaptivePlaceholder={adaptivePlaceholder}
          voiceListening={voice.listening}
          onVoiceToggle={() => { voice.toggle(); haptic("light"); }}
          mobileSurfaceBar={
            session ? (
              <MobileSurfaceBar
                active={surface === "workspace" ? "chat" : surface === "preview" ? "preview" : "chat"}
                buildState={
                  codegenLoading ? "building" :
                  sending ? "thinking" :
                  "idle"
                }
                onChange={(s) => {
                  if (s === "ledger") {
                    navigate({ to: "/ledger" });
                  } else if (s === "preview") {
                    setSurface("preview");
                  } else {
                    setSurface("chat");
                  }
                }}
              />
            ) : undefined
          }
          planGraph={
            <DependencyGraph
              steps={planSteps}
              onPromoteToQueue={promoteStepToQueue}
              onExportJSON={planSteps.length > 0 ? exportPlanJSON : undefined}
              onStepTap={(step) => {
                setAdaptivePlaceholder(`expand on "${step.label}"…`);
                setInput(`Expand on the plan step: ${step.label}`);
                setInputFocusSignal((v) => v + 1);
                setTimeout(() => setAdaptivePlaceholder(null), 5000);
              }}
            />
          }
          planSteps={planSteps}
          onQueuePlanStep={(step) => promoteStepToQueue(step)}
          onQueueAllPlanSteps={planSteps.length > 0 ? () => {
            for (const step of planSteps) promoteStepToQueue(step);
            haptic("medium");
            toast.success(`${planSteps.length} steps queued`);
          } : undefined}
          onExpandPlanStep={(step) => {
            setAdaptivePlaceholder(`expand on "${step.label}"…`);
            setInput(`Expand on the plan step: ${step.label}`);
            setInputFocusSignal((v) => v + 1);
            setTimeout(() => setAdaptivePlaceholder(null), 5000);
          }}
          contextualHUD={
            session && messages.length > 0 ? (
              <ContextualHUD
                messages={messages.map((m) => ({ role: m.role, content: m.content }))}
                recommendations={recs}
                onTap={(text) => {
                  setInput(text);
                  setAdaptivePlaceholder(text.slice(0, 40) + "…");
                  setInputFocusSignal((v) => v + 1);
                  setTimeout(() => setAdaptivePlaceholder(null), 5000);
                }}
                onDiffRequest={() => {
                  const lastUser = [...messages].reverse().find((m) => m.role === "user");
                  const lastAtlas = [...messages].reverse().find((m) => m.role === "assistant");
                  setDiffOldCode(lastUser?.content ?? "(no user message)");
                  setDiffNewCode(lastAtlas?.content ?? "(no response)");
                  setDiffLabels({ old: "Your prompt", new: "Atlas response" });
                  setDiffOpen(true);
                }}
                onParkMultiple={async (items) => {
                  const entryIds: string[] = [];
                  for (const item of items) {
                    const { data, error } = await entriesTable().insert({
                      user_id: user.id,
                      project_id: activeProjectId!,
                      session_id: session.id,
                      status: "parked",
                      severity: "parked",
                      title: item.text.slice(0, 120),
                      summary: `From contextual HUD (${item.source})`,
                      verb: "note",
                    }).select("id").single() as { data: { id: string } | null; error: Error | null };
                    if (!error && data) entryIds.push(data.id);
                  }
                  await loadParkedItems();
                  return { entryIds };
                }}
                onUndoPark={async (entryIds) => {
                  for (const id of entryIds) {
                    await entriesTable()
                      .delete()
                      .eq("id", id)
                      .eq("user_id", user.id);
                  }
                  await loadParkedItems();
                }}
              />
            ) : undefined
          }
          sidebarToggle={<SidebarToggle onClick={() => setSidebarOpen(true)} />}
          onWordmarkClick={() => {
            if (session) {
              setEntrySurface(true);
              setSurface("chat");
              setHistoryOpen(false);
            }
          }}
          headerCenter={
            isActive && activeProject ? (
              <ProjectHeaderCenter
                projectName={activeProject.name}
                sessionActive={!!session && !entrySurface}
                onRename={async (newName) => {
                  const { error } = await supabase
                    .from("projects")
                    .update({ name: newName })
                    .eq("id", activeProject.id)
                    .eq("user_id", user.id);
                  if (error) {
                    toast.error(error.message);
                  } else {
                    setProjects((prev) =>
                      prev.map((p) => (p.id === activeProject.id ? { ...p, name: newName } : p)),
                    );
                  }
                }}
                onOpenParking={() => setParkingOpen(true)}
                onNavigateLedger={() => navigate({ to: "/ledger" })}
                activeMode={activeMode}
                onModeChange={setActiveMode}
                activeSurface={surface === "workspace" ? "ledger" : surface}
                onSurfaceChange={(s) => setSurface(s === "ledger" ? "workspace" : s)}
              />
            ) : undefined
          }
          headerActions={
            <div className="flex items-center gap-2 min-w-0" style={{ height: 44 }}>
              <button
                type="button"
                onClick={() => setGalleryOpen(true)}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                aria-label="All Projects"
                title="All Projects"
              >
                <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="rgba(201,162,76,0.6)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4l3-2h4l1 1h5l1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" />
                </svg>
              </button>
              {session && !entrySurface && (
                <ParkingLotButton
                  count={parkedItems.length}
                  open={parkingOpen}
                  onClick={() => setParkingOpen((open) => !open)}
                />
              )}
              <UserMenu
                user={user}
                theme={theme}
                onThemeChange={setTheme}
                onSignOut={signOut}
              />
            </div>
          }
          secondaryPanel={
            session && surface !== "chat" ? (
              <section className="absolute inset-x-0 top-12 bottom-0 z-50 bg-background/95 backdrop-blur-sm border-y border-border">
                {surface === "workspace" ? (
                  <WorkspacePanel nodes={nodes} />
                ) : (
                  <LivePreview
                    code={generatedCode}
                    filename={generatedFilename ?? undefined}
                    loading={codegenLoading}
                    error={codegenError}
                    onElementSelect={(selector) => {
                      pushConsole("info", `↗ Selected: ${selector}`, "preview");
                    }}
                  />
                )}
              </section>
            ) : null
          }
          utilityBarLeft={
            session ? (
              <>
                <SystemMenu
                  onSelect={(id) => {
                    if (id === "blueprints") setBlueprintsOpen(true);
                    else if (id === "design") setDesignSystemOpen(true);
                    else if (id === "connectors") setExportOpen(true);
                    else if (id === "filetree") setFileTreeOpen(true);
                    else if (id === "diff") {
                      if (generatedFiles.length >= 2) {
                        const prev = generatedFiles[generatedFiles.length - 2];
                        const curr = generatedFiles[generatedFiles.length - 1];
                        setDiffOldCode(prev.content);
                        setDiffNewCode(curr.content);
                        setDiffLabels({ old: prev.filename, new: curr.filename });
                      } else if (generatedFiles.length === 1) {
                        setDiffOldCode("");
                        setDiffNewCode(generatedFiles[0].content);
                        setDiffLabels({ old: "(empty)", new: generatedFiles[0].filename });
                      }
                      setDiffOpen(true);
                    }
                    else if (id === "collaborate") setCollaborateOpen(true);
                    else if (id === "github") setGithubOpen(true);
                    else if (id === "snapshots") setSnapshotBrowserOpen(true);
                    else if (id === "integrity") setIntegrityOpen(true);
                    else if (id === "research") {
                      setInput("/research ");
                      setSurface("chat");
                      setInputFocusSignal((s) => s + 1);
                    }
                    else if (id === "databases") {
                      navigate({ to: "/ledger" });
                    }
                  }}
                  userId={user.id}
                  projectId={activeProjectId}
                  onFilesUploaded={(files) => setAttachedFiles((prev) => [...prev, ...files])}
                />
                <button
                  type="button"
                  aria-label="Attach file"
                  title="Attach file"
                  className="atlas-utility-btn"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.multiple = true;
                    input.accept = "image/*,application/pdf,.doc,.docx,.txt,.csv,.json";
                    input.onchange = async () => {
                      if (!input.files?.length) return;
                      const uploaded: Array<{ name: string; url: string; type: string }> = [];
                      for (const file of Array.from(input.files)) {
                        const path = `${user.id}/${activeProjectId ?? "general"}/${Date.now()}-${file.name}`;
                        const { error } = await supabase.storage
                          .from("project-assets")
                          .upload(path, file, { upsert: false });
                        if (error) {
                          toast.error(`Upload failed: ${file.name}`);
                          continue;
                        }
                        const { data: urlData } = supabase.storage
                          .from("project-assets")
                          .getPublicUrl(path);
                        uploaded.push({ name: file.name, url: urlData.publicUrl, type: file.type });
                      }
                      if (uploaded.length > 0) {
                        toast.success(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} attached`);
                        setAttachedFiles((prev) => [...prev, ...uploaded]);
                      }
                    };
                    input.click();
                  }}
                >
                  <svg viewBox="0 0 16 16" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13.2 7.3 8 12.5a3 3 0 1 1-4.2-4.2l5.6-5.6a2 2 0 1 1 2.8 2.8L6.6 11.1a1 1 0 1 1-1.4-1.4l4.9-4.9" />
                  </svg>
                </button>
              </>
            ) : null
          }
          utilityBarRight={
            session ? (
              <>
                <button
                  type="button"
                  aria-label={voice.listening ? "Stop listening" : "Voice input"}
                  title={voice.listening ? "Stop listening" : "Voice input"}
                  className="atlas-utility-btn"
                  data-active={voice.listening ? "true" : "false"}
                  onClick={() => { voice.toggle(); haptic("light"); }}
                >
                  <svg viewBox="0 0 16 16" width={13} height={13} stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
                    <path d="M3 7.5a5 5 0 0010 0" />
                    <path d="M8 12.5v2" />
                  </svg>
                </button>
                <UtilityOverflowMenu
                  activeSurface={surface}
                  historyOpen={historyOpen}
                  onSurfaceChange={(nextSurface) => {
                    setHistoryOpen(false);
                    setEntrySurface(false);
                    setSurface(nextSurface);
                  }}
                  onHistory={() => {
                    setEntrySurface(false);
                    setHistoryOpen((open) => !open);
                  }}
                />
              </>
            ) : null
          }
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: 800,
              margin: "0 auto",
              paddingRight: showWideDrawer ? "min(420px, 38vw)" : 0,
              transition: "padding-right 360ms cubic-bezier(0.4, 0, 0.2, 1)",
              boxSizing: "content-box",
            }}
          >
            <ChatPanel
              newMessageIds={newMessageIds}
              messages={messages}
              sending={sending}
              onStop={stopSending}
              setInput={setInput}
              sessionId={session?.id ?? ""}
              projectId={activeProjectId}
              userId={user.id}
              onRefresh={refresh}
              onParkedChange={loadParkedItems}
              onContinueAfterConflict={continueAfterConflict}
              onRequestInputFocus={() => setInputFocusSignal((value) => value + 1)}
              thinkingPrompts={thinkingPrompts}
              thinkingLoading={thinkingLoading}
              onAskThinkingPrompt={askThinkingPrompt}
              onParkThinkingPrompt={parkThinkingPrompt}
              onDismissThinkingPrompt={dismissThinkingPrompt}
              onRefreshThinkingPrompts={regenerateThinkingPrompts}
              onRollback={handleRollback}
              recentRollbackMsgId={recentRollbackMsgId}
              onOpenDiff={(userContent, assistantContent) => {
                setDiffOldCode(userContent);
                setDiffNewCode(assistantContent);
                setDiffLabels({ old: "Your prompt", new: "Atlas response" });
                setDiffOpen(true);
              }}
              onRegenerate={(userMessage) => send(userMessage)}
              activeMode={activeMode}
              buildHistory={buildHistory}
            />
            {isActive && (
              <SessionFooter artifactCount={artifacts.length} ledgerCount={ledgerCount} />
            )}
          </div>
        </AtlasFrontDoor>
        {isActive && (
          <ArtifactDrawer
            artifacts={artifacts}
            forceOpen={mobileArtifactDrawerOpen}
            onForceOpenChange={setMobileArtifactDrawerOpen}
          />
        )}
        {session && (
          <HistoryPanel
            open={historyOpen}
            recents={recents}
            onOpenSession={openSession}
          />
        )}
        {session && (
          <ParkingLotDrawer
            open={parkingOpen}
            items={parkedItems}
            projects={projects}
            onClose={() => setParkingOpen(false)}
            onAction={async (itemId, status) => {
              // Drawer surfaces "resolved" / "dismissed". In the unified
              // model "resolved" means the user committed it; "dismissed"
              // means archive. Both are status flips on the same Entry row.
              const newStatus =
                status === "resolved" ? "committed" : "archived";
              const values: Record<string, unknown> =
                newStatus === "committed"
                  ? { status: "committed", severity: "committed" }
                  : { status: "archived" };
              const { error } = await entriesTable()
                .update(values)
                .eq("id", itemId)
                .eq("user_id", user.id);
              if (error) {
                toast.error(error.message);
                return;
              }
              setParkedItems((prev) => prev.filter((item) => item.id !== itemId));
            }}
          />
        )}

      </main>
      <AtlasSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        recents={recents}
        parkedCount={parkedItems.length}
        ledgerCount={ledgerCount}
        onNewSession={() => {
          setSession(null);
          setMessages([]);
          setActiveProjectId(null);
          setEntrySurface(true);
          setSidebarOpen(false);
          setInputFocusSignal((v) => v + 1);
        }}
        onOpenSession={(id) => {
          setSidebarOpen(false);
          openSession(id);
        }}
        onOpenParking={() => {
          setSidebarOpen(false);
          setParkingOpen(true);
        }}
        email={user?.email ?? null}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "obsidian" ? "parchment" : "obsidian"))}
        onSignOut={signOut}
        user={user}
        projects={projects.map((p) => ({ id: p.id, name: p.name, thumbnailUrl: null }))}
        buildHistory={buildHistory}
      />
      <BlueprintsDrawer
        open={blueprintsOpen}
        onClose={() => setBlueprintsOpen(false)}
        onDeploy={(item) => generateCode(item.codegenPrompt)}
      />
      <DesignSystemDrawer
        open={designSystemOpen}
        onClose={() => setDesignSystemOpen(false)}
        activeTheme={theme as "obsidian" | "parchment" | "midnight" | "ember"}
        onThemeChange={(t) => setTheme(t as "obsidian" | "parchment")}
      />
      <ExportDrawer
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        files={generatedFiles}
        projectName={activeProject?.name}
      />
      <FileTreeDrawer
        open={fileTreeOpen}
        onClose={() => setFileTreeOpen(false)}
        files={generatedFiles}
        onFileSelect={(file) => {
          setGeneratedCode(file.content);
          setGeneratedFilename(file.filename);
          setSurface("preview");
          setFileTreeOpen(false);
        }}
        onLockToLedger={async (lockedFiles) => {
          if (!user || !activeProjectId) return;
          try {
            const fileList = lockedFiles.map((f) => f.filename).join(", ");
            await createEntryFromCard({
              userId: user.id,
              projectId: activeProjectId,
              sessionId: session?.id ?? null,
              sourceMessageId: messages[messages.length - 1]?.id ?? crypto.randomUUID(),
              payload: {
                v: 1,
                title: `Architecture lock: ${lockedFiles.length} file${lockedFiles.length > 1 ? "s" : ""}`,
                summary: `Locked file architecture as a constraint: ${fileList}`,
                details: lockedFiles.map((f) => `### ${f.filename}\n\`\`\`${f.language}\n${f.content.slice(0, 500)}\n\`\`\``).join("\n\n"),
                severity: "committed",
                verb: "audit",
                touched: lockedFiles.map((f) => f.filename),
              },
              status: "committed",
              mode: activeMode,
            });
            setLedgerCount((c) => c + 1);
            setFileTreeOpen(false);
            toast.success(`${lockedFiles.length} file${lockedFiles.length > 1 ? "s" : ""} locked to Ledger`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to lock files");
          }
        }}
      />
      {diffOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            onClick={cancelRollback}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
          />
          <div
            style={{
              position: "relative",
              margin: "40px auto",
              width: "min(700px, 95vw)",
              height: "calc(100vh - 80px)",
              background: "var(--surface)",
              borderRadius: 12,
              border: "0.5px solid var(--glass-border)",
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Snapshot naming bar — shown during rollback */}
            {rollbackNaming && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderBottom: "0.5px solid var(--glass-border)",
                  background: "color-mix(in oklab, var(--accent-gold) 6%, var(--surface))",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent-gold)", whiteSpace: "nowrap" }}>
                  Snapshot Name
                </span>
                <input
                  value={rollbackNameInput}
                  onChange={(e) => setRollbackNameInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: "var(--background)",
                    border: "0.5px solid var(--glass-border)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--foreground)",
                    outline: "none",
                  }}
                  placeholder="Name this snapshot…"
                  onKeyDown={(e) => { if (e.key === "Enter") confirmRollback(); }}
                />
              </div>
            )}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <DiffViewer
                oldCode={diffOldCode}
                newCode={diffNewCode}
                oldLabel={diffLabels.old}
                newLabel={diffLabels.new}
                acceptLabel={rollbackPreview ? "Revert" : "Accept"}
                rejectLabel={rollbackPreview ? "Cancel" : "Reject"}
                onAccept={rollbackPreview ? confirmRollback : () => {
                  toast.success("Changes accepted");
                  setDiffOpen(false);
                }}
                onReject={rollbackPreview ? cancelRollback : () => {
                  toast("Changes rejected");
                  setDiffOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
      {/* Snapshot Browser Drawer */}
      {snapshotBrowserOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 75,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={() => setSnapshotBrowserOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)" }}
          />
          <div
            style={{
              position: "relative",
              width: "min(360px, 90vw)",
              height: "100%",
              background: "var(--surface)",
              borderLeft: "0.5px solid var(--glass-border)",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              animation: "atlas-bubble-in 200ms ease forwards",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "0.5px solid var(--glass-border)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent-gold)" }}>
                Snapshots · {snapshots.length}
              </span>
              <button onClick={() => setSnapshotBrowserOpen(false)} style={{ background: "none", border: "none", color: "var(--muted-text)", cursor: "pointer", fontSize: 16, padding: 4 }}>×</button>
            </div>
            {/* Undo bar */}
            {preRollbackMessages && (
              <button
                onClick={undoRollback}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  margin: "8px 12px",
                  padding: "8px 12px",
                  background: "color-mix(in oklab, var(--ember) 10%, var(--surface))",
                  border: "0.5px solid color-mix(in oklab, var(--ember) 30%, var(--border))",
                  borderRadius: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  color: "var(--ember)",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                ↶ Undo Last Rollback
              </button>
            )}
            {/* Compare bar */}
            {snapshots.length >= 2 && (
              <div style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--glass-border)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)" }}>Compare</span>
                <select
                  value={snapshotCompareA ?? ""}
                  onChange={(e) => setSnapshotCompareA(e.target.value || null)}
                  style={{ flex: 1, minWidth: 80, padding: "4px 6px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                >
                  <option value="">Select A…</option>
                  {snapshots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <span style={{ color: "var(--muted-text)", fontSize: 10 }}>↔</span>
                <select
                  value={snapshotCompareB ?? ""}
                  onChange={(e) => setSnapshotCompareB(e.target.value || null)}
                  style={{ flex: 1, minWidth: 80, padding: "4px 6px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                >
                  <option value="">Select B…</option>
                  {snapshots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  onClick={() => {
                    const snapA = snapshots.find((s) => s.id === snapshotCompareA);
                    const snapB = snapshots.find((s) => s.id === snapshotCompareB);
                    if (!snapA || !snapB) return;
                    const summaryA = snapA.messagesAtPoint.map((m) => `[${m.role}] ${m.content.slice(0, 120)}`).join("\n");
                    const summaryB = snapB.messagesAtPoint.map((m) => `[${m.role}] ${m.content.slice(0, 120)}`).join("\n");
                    setDiffOldCode(summaryA);
                    setDiffNewCode(summaryB);
                    setDiffLabels({ old: snapA.name, new: snapB.name });
                    setDiffOpen(true);
                    setSnapshotBrowserOpen(false);
                    haptic("medium");
                  }}
                  disabled={!snapshotCompareA || !snapshotCompareB || snapshotCompareA === snapshotCompareB}
                  style={{
                    padding: "4px 10px", borderRadius: 6,
                    background: (snapshotCompareA && snapshotCompareB && snapshotCompareA !== snapshotCompareB) ? "color-mix(in oklab, var(--accent-gold) 15%, var(--surface))" : "var(--surface)",
                    border: `0.5px solid ${(snapshotCompareA && snapshotCompareB && snapshotCompareA !== snapshotCompareB) ? "var(--accent-gold)" : "var(--border)"}`,
                    color: (snapshotCompareA && snapshotCompareB && snapshotCompareA !== snapshotCompareB) ? "var(--accent-gold)" : "var(--muted-text)",
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: (snapshotCompareA && snapshotCompareB && snapshotCompareA !== snapshotCompareB) ? "pointer" : "default",
                    opacity: (snapshotCompareA && snapshotCompareB && snapshotCompareA !== snapshotCompareB) ? 1 : 0.4,
                  }}
                >
                  Diff
                </button>
              </div>
            )}
            {/* Snapshot list */}
            <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
              {snapshots.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted-text)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  No snapshots yet. Rollback a message to create one.
                </div>
              ) : (
                snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    style={{
                      padding: "10px 12px",
                      marginBottom: 6,
                      borderRadius: 8,
                      border: `0.5px solid ${(snapshotCompareA === snap.id || snapshotCompareB === snap.id) ? "var(--accent-gold)" : "var(--glass-border)"}`,
                      background: (snapshotCompareA === snap.id || snapshotCompareB === snap.id) ? "color-mix(in oklab, var(--accent-gold) 6%, var(--background))" : "var(--background)",
                      cursor: "pointer",
                      transition: "border-color 160ms ease",
                    }}
                    onClick={() => restoreSnapshot(snap)}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-gold)"; }}
                    onMouseLeave={(e) => { if (snapshotCompareA !== snap.id && snapshotCompareB !== snap.id) e.currentTarget.style.borderColor = "var(--glass-border)"; }}
                  >
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--foreground)", marginBottom: 4 }}>
                      {snap.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted-text)", display: "flex", gap: 8 }}>
                      <span>{snap.messagesAtPoint.length} messages</span>
                      <span>{new Date(snap.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <CollaborationDrawer
        open={collaborateOpen}
        onClose={() => setCollaborateOpen(false)}
        projectName={activeProject?.name}
        sessionId={session?.id}
        projectId={activeProjectId}
        userId={user.id}
      />
      <GitHubDrawer
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        projectId={activeProjectId}
        generatedFiles={generatedFiles}
      />
      <StructuralIntegrityPanel
        open={integrityOpen}
        onClose={() => setIntegrityOpen(false)}
        onHarden={(command) => {
          setInput(command);
          setIntegrityOpen(false);
          setSurface("chat");
          setInputFocusSignal((s) => s + 1);
          toast.success("Fix command loaded — review and send.");
        }}
      />
      {/* OnboardingFlow removed — context refinement happens conversationally */}
    </div>
  );

  return (
    <>
    <DesktopWorkspace
      activeSurface={desktopActiveSurface}
      onSurfaceChange={handleDesktopSurfaceChange}
      onOpenHistory={() => {
        setEntrySurface(false);
        setHistoryOpen((open) => !open);
      }}
      onOpenGallery={() => setGalleryOpen(true)}
      parkedCount={parkedItems.length}
      ledgerCount={ledgerCount}
      buildStatus={codegenLoading ? "building" : codegenError ? "error" : generatedCode ? "success" : "idle"}
      autoRun={autoRunEnabled}
      onAutoRunChange={setAutoRunEnabled}
      onRun={() => {
        if (generatedCode) {
          const code = generatedCode;
          setGeneratedCode(null);
          requestAnimationFrame(() => setGeneratedCode(code));
        }
      }}
      onBuild={() => { if (!sending && session) send("/build"); }}
      renderMobile={() => (
        <DoubleVisionLayout
          stage={
            generatedCode ? (
              <LivePreview
                code={generatedCode}
                filename={generatedFilename ?? "Component.tsx"}
                loading={codegenLoading}
                error={codegenError}
              />
            ) : (
              <StageLivingData
                filesCreated={generatedFiles.length}
                deployStatus={codegenLoading ? "building" : generatedCode ? "deployed" : "idle"}
                healthScore={100}
                recentFiles={generatedFiles.slice(-3).reverse().map((f) => ({ name: f.filename, updatedAt: "just now" }))}
              />
            )
          }
          commandCenter={mainShell}
        />
      )}
      renderChatPane={() => (
        <div className="h-full flex flex-col bg-background">
          {/* Mode chips */}
          <div className="flex-shrink-0 px-2 py-2 border-b border-border/40 flex items-center gap-1 overflow-x-auto scrollbar-none">
            {MODES.map((m) => {
              const isOn = activeMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { setActiveMode(m.id); haptic("light"); }}
                  className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-mono uppercase tracking-wider border transition-colors ${
                    isOn
                      ? "border-accent text-accent-foreground bg-accent/10"
                      : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  <ModeIcon mode={m.id} size={10} />
                  {m.label}
                </button>
              );
            })}
          </div>
          {/* Chat messages */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-3">
                <div className="max-w-full overflow-hidden">
                  <p className="text-sm text-muted-foreground mb-2 break-words whitespace-normal leading-snug">
                    {greetingFor(new Date(), user?.user_metadata?.display_name as string | undefined || user?.user_metadata?.full_name as string | undefined || user?.email?.split("@")[0] || null)}
                  </p>
                  <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                    Type below to start a session
                  </p>
                </div>
              </div>
            ) : (
              <ChatPanel
                newMessageIds={newMessageIds}
                messages={messages}
                sending={sending}
                onStop={stopSending}
                setInput={setInput}
                sessionId={session?.id ?? ""}
                projectId={activeProjectId}
                userId={user.id}
                onRefresh={refresh}
                onParkedChange={loadParkedItems}
                onContinueAfterConflict={continueAfterConflict}
                onRequestInputFocus={() => setInputFocusSignal((v) => v + 1)}
                thinkingPrompts={thinkingPrompts}
                thinkingLoading={thinkingLoading}
                onAskThinkingPrompt={askThinkingPrompt}
                onParkThinkingPrompt={parkThinkingPrompt}
                onDismissThinkingPrompt={dismissThinkingPrompt}
                onRefreshThinkingPrompts={regenerateThinkingPrompts}
                onRollback={handleRollback}
                recentRollbackMsgId={recentRollbackMsgId}
                onOpenDiff={(userContent, assistantContent) => {
                  setDiffOldCode(userContent);
                  setDiffNewCode(assistantContent);
                  setDiffLabels({ old: "Your prompt", new: "Atlas response" });
                  setDiffOpen(true);
                }}
                onRegenerate={(userMessage) => send(userMessage)}
                activeMode={activeMode}
                buildHistory={buildHistory}
              />
            )}
          </div>
          {/* Input bar */}
          <div className="flex-shrink-0 border-t border-border/40 px-3 py-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) send(input);
                  }
                }}
                placeholder={`${activeMode.charAt(0).toUpperCase() + activeMode.slice(1)} mode — type here…`}
                className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-card/50 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
                rows={1}
              />
              <button
                type="button"
                onClick={() => { if (input.trim()) send(input); }}
                disabled={!input.trim() || sending}
                className="flex-shrink-0 p-2 rounded-lg bg-accent/10 text-accent-foreground hover:bg-accent/20 disabled:opacity-30 transition-colors"
                aria-label="Send"
              >
                <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor">
                  <path d="M1.7 1.4a.5.5 0 0 1 .6-.1l12 6a.5.5 0 0 1 0 .9l-12 6a.5.5 0 0 1-.7-.5V8.5L9 8 1.6 7.5V1.9a.5.5 0 0 1 .1-.5z" />
                </svg>
              </button>
            </div>
            {sending && (
              <div className="flex items-center gap-2 mt-1.5">
                <LoadingSpinner size="sm" />
                <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Atlas is thinking…</span>
                <button
                  type="button"
                  onClick={stopSending}
                  className="ml-auto text-[9px] font-mono text-destructive/70 hover:text-destructive uppercase tracking-wider"
                >
                  Stop
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      renderCanvas={() => (
        <div className="h-full flex flex-col bg-background">
          {/* Canvas header */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {codegenLoading ? "Building…" : generatedCode ? (generatedFilename ?? "Preview") : "Canvas"}
              </span>
              {/* Responsive view switcher */}
              <div className="flex items-center gap-0.5 border border-border/30 rounded-md p-0.5">
                {([
                  { id: "desktop" as const, w: 1280, label: "Desktop", icon: <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={1.3}><rect x="1" y="2" width="14" height="10" rx="1.5"/><path d="M5 14h6M8 12v2"/></svg> },
                  { id: "tablet" as const, w: 768, label: "Tablet", icon: <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={1.3}><rect x="3" y="1" width="10" height="14" rx="1.5"/><path d="M7 13h2"/></svg> },
                  { id: "mobile" as const, w: 375, label: "Mobile", icon: <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={1.3}><rect x="4" y="1" width="8" height="14" rx="1.5"/><path d="M7 13h2"/></svg> },
                ] as const).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setCanvasViewport(v.id)}
                    className={`p-1 rounded transition-colors ${canvasViewport === v.id ? "bg-accent/20 text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
                    title={`${v.label} (${v.w}px)`}
                    aria-label={v.label}
                  >
                    {v.icon}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Run button — refreshes current preview */}
              <button
                type="button"
                onClick={() => {
                  if (generatedCode) {
                    const code = generatedCode;
                    setGeneratedCode(null);
                    requestAnimationFrame(() => setGeneratedCode(code));
                  }
                }}
                disabled={!generatedCode || codegenLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider bg-accent/10 text-accent-foreground hover:bg-accent/20 disabled:opacity-30 transition-colors"
                title="Re-run preview"
              >
                <svg viewBox="0 0 16 16" width={10} height={10} fill="currentColor"><path d="M4 2l10 6-10 6z"/></svg>
                Run
              </button>
              {/* Build button — sends /build to chat */}
              <button
                type="button"
                onClick={() => { if (!sending) send("/build"); }}
                disabled={sending || !session}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider bg-accent/15 text-accent-foreground hover:bg-accent/25 disabled:opacity-30 transition-colors border border-accent/20"
                title="Trigger build"
              >
                <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M2 14V6l6-4 6 4v8" strokeLinejoin="round"/><path d="M6 14v-4h4v4"/></svg>
                Build
              </button>
              {generatedCode && (
                <button
                  type="button"
                  onClick={() => { setGeneratedCode(null); setGeneratedFilename(null); }}
                  className="text-[9px] font-mono text-muted-foreground hover:text-foreground px-2 py-0.5 rounded"
                >
                  Clear
                </button>
              )}
              {/* Diff toggle */}
              {generatedCode && previousCode && (
                <button
                  type="button"
                  onClick={() => setDiffPreviewActive((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors ${
                    diffPreviewActive
                      ? "bg-accent/20 text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                  title="Toggle diff view"
                >
                  Diff
                </button>
              )}
            </div>
          </div>
          {/* Canvas content — viewport-constrained */}
          <div className="flex-1 min-h-0 flex items-start justify-center overflow-auto bg-muted/10">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: CANVAS_WIDTHS[canvasViewport] ? `${CANVAS_WIDTHS[canvasViewport]}px` : "100%",
                maxWidth: "100%",
                boxShadow: canvasViewport !== "desktop" ? "0 0 0 1px var(--border)" : undefined,
              }}
            >
            {codegenLoading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <LoadingSpinner size="lg" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider animate-pulse">
                  Generating component…
                </span>
              </div>
            ) : diffPreviewActive && generatedCode && previousCode ? (
              <DiffPreview
                oldCode={previousCode}
                newCode={generatedCode}
                filename={generatedFilename ?? "Component.tsx"}
                oldLabel="Previous"
                newLabel="Current"
                onAccept={() => {
                  setPreviousCode(generatedCode);
                  setDiffPreviewActive(false);
                }}
                onReject={() => {
                  setGeneratedCode(previousCode);
                  setDiffPreviewActive(false);
                }}
              />
            ) : generatedCode ? (
              <LivePreview
                code={generatedCode}
                filename={generatedFilename ?? "Component.tsx"}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-center px-8">
                <div className="max-w-sm">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-card/50 border border-border/30 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1} className="text-muted-foreground/40">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">No preview yet</p>
                  <p className="text-[10px] font-mono text-muted-foreground/50 leading-relaxed">
                    Send a BUILD request in the chat to generate a component. It will render here live.
                  </p>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}
      renderHeader={() => (
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide text-foreground">Atlas</span>
            {activeProject && (
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {activeProject.name}
              </span>
            )}
            {session && (
              <span className="text-[9px] font-mono text-accent/60 uppercase tracking-wider">
                Session active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {session && (
              <button
                type="button"
                onClick={() => {
                  setSession(null);
                  setMessages([]);
                  setActiveProjectId(null);
                  setEntrySurface(true);
                }}
                className="text-[9px] font-mono text-muted-foreground hover:text-foreground uppercase tracking-wider px-2 py-1 rounded hover:bg-muted/30 transition-colors"
              >
                New Project
              </button>
            )}
            <UserMenu
              user={user}
              theme={theme}
              onThemeChange={setTheme}
              onSignOut={signOut}
            />
          </div>
        </div>
      )}
      renderFooter={() => <FooterAuditLine state={auditWarning ? "warning" : "healthy"} />}
      renderInspectorPanes={() => ({
        files: (
          <FileTreePanel
            files={generatedFiles}
            onFileSelect={(file: { filename: string; content: string }) => {
              setGeneratedCode(file.content);
              setGeneratedFilename(file.filename);
              setEditorActiveFile(file.filename);
              if (!editorOpenTabs.includes(file.filename)) {
                setEditorOpenTabs(prev => [...prev, file.filename]);
              }
            }}
          />
        ),
        console: (
          <LiveConsoleStream
            entries={consoleLogs}
            visible={true}
            onToggle={() => {}}
          />
        ),
        code: (
          <div className="h-full flex flex-col">
            {/* Open tabs bar */}
            {editorOpenTabs.length > 0 && (
              <div className="flex-shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-border/30 overflow-x-auto scrollbar-none">
                {editorOpenTabs.map(tab => (
                  <div key={tab} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono transition-colors cursor-pointer ${
                    editorActiveFile === tab ? "bg-accent/20 text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}>
                    <span onClick={() => {
                      setEditorActiveFile(tab);
                      const f = generatedFiles.find(f => f.filename === tab);
                      if (f) { setGeneratedCode(f.content); setGeneratedFilename(f.filename); }
                    }}>{tab.split("/").pop()}</span>
                    <button type="button" onClick={(e) => {
                      e.stopPropagation();
                      setEditorOpenTabs(prev => prev.filter(t => t !== tab));
                      if (editorActiveFile === tab) {
                        const remaining = editorOpenTabs.filter(t => t !== tab);
                        if (remaining.length > 0) {
                          setEditorActiveFile(remaining[remaining.length - 1]);
                          const f = generatedFiles.find(f => f.filename === remaining[remaining.length - 1]);
                          if (f) { setGeneratedCode(f.content); setGeneratedFilename(f.filename); }
                        } else { setEditorActiveFile(null); }
                      }
                    }} className="opacity-40 hover:opacity-100 text-[8px]">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 min-h-0">
              {generatedCode ? (
                <CodeEditor
                  code={generatedCode}
                  filename={generatedFilename ?? "Component.tsx"}
                  onChange={(newCode) => setGeneratedCode(newCode)}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-[10px] font-mono text-muted-foreground/50">Select a file to edit</div>
              )}
            </div>
          </div>
        ),
        github: undefined,
        recs:
          pendingRecs.length === 0 ? undefined : (
            <div className="p-3 space-y-2">
              {pendingRecs.map((rec) => (
                <div
                  key={rec.id}
                  className="rounded border border-border/50 bg-card/40 p-3"
                >
                  <p className="text-[11px] font-mono text-foreground leading-relaxed">
                    {rec.content}
                  </p>
                  {rec.definition && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-1.5 leading-relaxed">
                      {rec.definition}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ),
        settings: (
          <div className="h-full flex flex-col">
            <ProjectSettingsPanel
              project={activeProject ?? null}
              onProjectUpdate={(updated) => {
                setProjects((prev) => prev.map((p) => p.id === updated.id ? updated : p));
              }}
            />
            {/* Build Secrets Sync */}
            <div className="border-t border-border/40 px-3 py-2">
              <p className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-1.5">Build Secrets</p>
              <p className="text-[9px] font-mono text-muted-foreground/50 mb-2 leading-relaxed">
                Build secrets are injected as env vars during install. Configure in Workspace Settings → Build Secrets.
              </p>
              {buildSecrets.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 mb-1">
                  <span className="flex-1 text-[10px] font-mono text-foreground/70 truncate">{s.name}</span>
                  <button type="button" onClick={() => setBuildSecrets(prev => prev.filter((_, j) => j !== i))}
                    className="text-[8px] text-muted-foreground hover:text-destructive">×</button>
                </div>
              ))}
              <button type="button" onClick={() => {
                const name = prompt("Build secret name (e.g. NPM_TOKEN):");
                if (name) setBuildSecrets(prev => [...prev, { name: name.toUpperCase().replace(/[^A-Z0-9_]/g, "_"), value: "" }]);
              }} className="text-[9px] font-mono text-accent-foreground/60 hover:text-accent-foreground mt-1">+ Add build secret</button>
            </div>
          </div>
        ),
        secrets: (
          <SecretsManagerPanel
            secrets={projectSecrets}
            onAddSecret={(name) => {
              setProjectSecrets((prev) => [...prev, { name, isSet: false }]);
            }}
            onDeleteSecret={(name) => {
              setProjectSecrets((prev) => prev.filter((s) => s.name !== name));
            }}
            onRefresh={loadProjectSecrets}
            loading={secretsLoading}
          />
        ),
      })}
    />
    <ProjectGallery
      open={galleryOpen}
      onClose={() => setGalleryOpen(false)}
      projects={projects}
      activeProjectId={activeProjectId}
      onSelectProject={(id) => { setActiveProjectId(id); }}
      onNewProject={() => {
        setSession(null);
        setMessages([]);
        setActiveProjectId(null);
        setEntrySurface(true);
        setGalleryOpen(false);
        setInputFocusSignal((v) => v + 1);
      }}
    />
    </>
  );
}


/* -------- Chat Panel -------- */
function ChatPanel({
  newMessageIds,
  messages,
  sending,
  onStop,
  setInput,
  sessionId,
  projectId,
  userId,
  onRefresh,
  onParkedChange,
  onContinueAfterConflict,
  onRequestInputFocus,
  thinkingPrompts,
  thinkingLoading,
  onAskThinkingPrompt,
  onParkThinkingPrompt,
  onDismissThinkingPrompt,
  onRefreshThinkingPrompts,
  onRollback,
  recentRollbackMsgId,
  onOpenDiff,
  onRegenerate,
  activeMode,
  buildHistory,
}: {
  newMessageIds: Set<string>;
  messages: ChatMessage[];
  sending: boolean;
  onStop: () => void;
  setInput: (v: string) => void;
  sessionId: string;
  projectId: string | null;
  userId: string;
  onRefresh: () => Promise<void>;
  onParkedChange: () => Promise<void>;
  onContinueAfterConflict: (messageId: string) => Promise<void>;
  onRequestInputFocus: () => void;
  thinkingPrompts: ThinkingPrompt[];
  thinkingLoading: boolean;
  onAskThinkingPrompt: (p: ThinkingPrompt) => void | Promise<void>;
  onParkThinkingPrompt: (p: ThinkingPrompt) => void | Promise<void>;
  onDismissThinkingPrompt: (p: ThinkingPrompt) => void | Promise<void>;
  onRefreshThinkingPrompts: () => void | Promise<void>;
  onRollback: (m: ChatMessage) => void;
  recentRollbackMsgId: string | null;
  onOpenDiff?: (userContent: string, assistantContent: string) => void;
  onRegenerate?: (userMessage: string) => void;
  activeMode?: string;
  buildHistory?: BuildStateEntry[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const statusTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const parkedTimerRef = useRef<number | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [parkedMessageId, setParkedMessageId] = useState<string | null>(null);
  const [moreMenuOpenId, setMoreMenuOpenId] = useState<string | null>(null);
  // Track which user messages are expanded (all auto-collapse by default)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(() => new Set());
  const [selectionChip, setSelectionChip] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const [commitStatus, setCommitStatus] = useState<{
    text: string;
    color: string;
    visible: boolean;
  } | null>(null);
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(
    () => new Set(),
  );
  const latestAtlasResponseId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, sending]);

  // Auto-scroll during streaming: observe content height changes
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const isNearBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      return scrollHeight - scrollTop - clientHeight < 120;
    };
    const ro = new ResizeObserver(() => {
      if (isNearBottom()) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      }
    });
    // Observe the scroll container's content
    for (const child of Array.from(container.children)) {
      ro.observe(child);
    }
    return () => ro.disconnect();
  }, [messages.length, sending]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      if (parkedTimerRef.current) window.clearTimeout(parkedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const closeChip = (event: MouseEvent) => {
      if (chipRef.current?.contains(event.target as Node)) return;
      setSelectionChip(null);
    };
    document.addEventListener("mousedown", closeChip);
    return () => document.removeEventListener("mousedown", closeChip);
  }, []);

  const showCommitStatus = (text: string, color: string) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    setCommitStatus({ text, color, visible: true });
    statusTimerRef.current = window.setTimeout(() => {
      setCommitStatus((current) =>
        current ? { ...current, visible: false } : current,
      );
    }, 2600);
    fadeTimerRef.current = window.setTimeout(() => {
      setCommitStatus(null);
    }, 3000);
  };

  const commitDecision = async () => {
    if (!projectId || extracting) return;
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("atlas-commit", {
        body: { sessionId, projectId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extraction = data as CommitExtraction;
      if (!extraction.decision_found) {
        showCommitStatus("No clear decision found", "#78716C");
        return;
      }

      const description = [
        extraction.description,
        extraction.constraint ? `Constraint: ${extraction.constraint}` : "",
        extraction.confidence ? `Confidence: ${extraction.confidence}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const { error: insertError } = await entriesTable().insert({
        user_id: userId,
        project_id: projectId,
        session_id: sessionId,
        status: "committed",
        severity: "committed",
        verb: "note",
        title: extraction.title,
        summary: description,
      });
      if (insertError) throw insertError;

      showCommitStatus("Decision logged to ledger", "#EA580C");
      await onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to commit decision";
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  };

  const proceedAnyway = async (messageId: string, committedOn: string) => {
    if (!projectId) return;
    // Mark the matching committed entry as a violation. Locked rows are
    // immutable except for archiving — but is_violation is metadata on
    // the original committed row that we tolerate updating in the trigger
    // by not changing any of the guarded fields. To avoid the trigger,
    // we instead create a new draft entry that supersedes the original.
    const { data: original } = await entriesTable()
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "committed")
      .eq("title", committedOn)
      .limit(1);
    if (original && original.length > 0) {
      const orig = original[0];
      const { error } = await entriesTable().insert({
        user_id: userId,
        project_id: projectId,
        session_id: sessionId,
        status: "committed",
        severity: "blocker",
        verb: "audit",
        is_violation: true,
        title: `VIOLATION: ${orig.title}`,
        summary: `Violation logged against committed decision "${orig.title}".`,
        supersedes_id: orig.id,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    setDismissedConflicts((prev) => new Set(prev).add(messageId));
    await onRefresh();
    await onContinueAfterConflict(messageId);
  };

  const reconsider = (messageId: string) => {
    setDismissedConflicts((prev) => new Set(prev).add(messageId));
    onRequestInputFocus();
  };

  const insertParkedItem = async ({
    label,
    sourceContext,
    kind,
  }: {
    label: string;
    sourceContext: string;
    kind: string;
  }) => {
    if (!projectId || !sessionId) return false;
    // Park = create an Entry with status='parked'. Same object the Ledger
    // uses; only `status` differs. We map the legacy (label, sourceContext,
    // kind) shape onto (title, summary, verb).
    const verbMap: Record<string, string> = {
      suggestion: "note",
      term: "note",
      question: "note",
      commit_card: "wip",
      other: "note",
    };
    const { error } = await entriesTable().insert({
      user_id: userId,
      project_id: projectId,
      session_id: sessionId,
      status: "parked",
      severity: "parked",
      title: label,
      summary: sourceContext,
      verb: verbMap[kind] ?? "note",
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    await onParkedChange();
    return true;
  };

  const parkMessage = async (message: ChatMessage) => {
    const ok = await insertParkedItem({
      label: message.content.slice(0, 120),
      sourceContext: "chat message",
      kind: "suggestion",
    });
    if (!ok) return;
    setParkedMessageId(message.id);
    if (parkedTimerRef.current) window.clearTimeout(parkedTimerRef.current);
    parkedTimerRef.current = window.setTimeout(() => {
      setParkedMessageId(null);
    }, 2000);
  };

  const [committingCardId, setCommittingCardId] = useState<string | null>(null);

  const commitCardMessage = async (message: ChatMessage, card: CommitCardPayload) => {
    if (!projectId) return;
    setCommittingCardId(message.id);
    try {
      // Use the unified createEntryFromCard helper. It writes to entries
      // (status='committed'), stamps locked_at via trigger, AND locks the
      // originating chat turn by setting committed_card_id.
      await createEntryFromCard({
        userId,
        projectId,
        sessionId,
        sourceMessageId: message.id,
        payload: card,
        status: "committed",
        mode: activeMode,
      });

      toast.success("Committed to ledger");
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setCommittingCardId(null);
    }
  };

  const parkCardMessage = async (message: ChatMessage, card: CommitCardPayload) => {
    const ok = await insertParkedItem({
      label: card.title,
      sourceContext: card.summary,
      kind: "commit_card",
    });
    if (!ok) return;
    toast.success("Parked");
  };


  const captureSelection = () => {
    const selection = document.getSelection();
    const selectedText = selection?.toString().trim();
    const container = scrollRef.current;
    if (!selection || !selectedText || !container || selection.rangeCount === 0) {
      setSelectionChip(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setSelectionChip(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setSelectionChip({
      text: selectedText.slice(0, 200),
      top: rect.top - containerRect.top + container.scrollTop - 34,
      left: rect.left - containerRect.left + container.scrollLeft,
    });
  };

  const parkSelection = async () => {
    if (!selectionChip) return;
    const ok = await insertParkedItem({
      label: selectionChip.text,
      sourceContext: "text selection",
      kind: "term",
    });
    if (!ok) return;
    document.getSelection()?.removeAllRanges();
    setSelectionChip(null);
  };

  const moreMenuActionStyle: import("react").CSSProperties = {
    width: "100%",
    minHeight: 46,
    padding: "10px 12px",
    borderRadius: 14,
    border: "none",
    background: "transparent",
    color: "var(--foreground)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    lineHeight: 1.4,
    cursor: "pointer",
    textAlign: "left" as const,
  };
  const moreMenuIconStyle: import("react").CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
    color: "var(--accent-gold)",
    flexShrink: 0,
  };

  return (
    <>
      <div
        ref={scrollRef}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        className="relative flex-1 overflow-y-auto px-5 pt-6 pb-44 flex flex-col"
        style={{ gap: "var(--bubble-gap, 20px)", overflowAnchor: "none" }}
      >
        {/* Spacer pushes messages to bottom when few, scrolls normally when many */}
        <div style={{ flex: 1, minHeight: 0 }} />
        {selectionChip && (
          <button
            ref={chipRef}
            onClick={parkSelection}
            style={{
              position: "absolute",
              top: selectionChip.top,
              left: selectionChip.left,
              zIndex: 30,
              background: "#0C0A09",
              border: "0.5px solid #2C2926",
              color: "#78716C",
              fontFamily: "monospace",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              borderRadius: 6,
              padding: "4px 10px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#EA580C";
              e.currentTarget.style.color = "#EA580C";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#2C2926";
              e.currentTarget.style.color = "#78716C";
            }}
          >
            Park this
          </button>
        )}
        {(thinkingPrompts.length > 0 || thinkingLoading) && (
          <ThinkingPromptCard
            prompts={thinkingPrompts}
            loading={thinkingLoading}
            onAsk={onAskThinkingPrompt}
            onPark={onParkThinkingPrompt}
            onDismiss={onDismissThinkingPrompt}
            onRefresh={onRefreshThinkingPrompts}
          />
        )}
        {messages.map((m) => {
            const parsedConflict =
              m.role === "assistant" ? parseConflictResponse(m.content) : null;
            if (parsedConflict && dismissedConflicts.has(m.id)) return null;
            const conflict = parsedConflict;
            const isUser = m.role === "user";

            const dbCard = m.card_payload as CommitCardPayload | null | undefined;
            const dbVersion = m.card_schema_version ?? null;
            const parsed = !dbCard && m.role === "assistant" && !conflict
              ? parseAtlasMessage(m.content)
              : null;
            const card = dbCard ?? parsed?.card ?? null;
            const cardVersion = dbVersion ?? parsed?.schemaVersion ?? null;
            const proseForDisplay = parsed ? parsed.prose : m.content;
            const isLocked = Boolean(m.committed_card_id);

            const showActionRow =
              !card && m.role === "assistant" && m.id === latestAtlasResponseId && !conflict;
            const showParkButton = !card && m.role === "assistant" && !conflict;

            return (
              <div
                key={m.id}
                className={`${isUser ? "ml-auto max-w-[85%]" : "max-w-[92%]"}`}
              >
                {isUser ? (() => {
                    const isExpanded = expandedMessages.has(m.id);
                    const isLongMessage = m.content.length > 140 || m.content.split("\n").length > 3;
                    const toggleExpand = () => {
                      setExpandedMessages((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.id)) next.delete(m.id);
                        else next.add(m.id);
                        return next;
                      });
                    };
                    return (
                      <>
                        {/* User message card — collapsible */}
                        <div
                          onClick={isLongMessage ? toggleExpand : undefined}
                          style={{
                            background: "rgba(28, 28, 32, 0.85)",
                            borderRadius: "16px 4px 16px 16px",
                            padding: "var(--bubble-padding-y) var(--bubble-padding-x)",
                            paddingLeft: "calc(var(--bubble-padding-x) + 8px)",
                            cursor: isLongMessage ? "pointer" : "default",
                            position: "relative",
                            borderLeft: "2px solid var(--accent-gold)",
                            border: "none",
                            transition: "all 280ms cubic-bezier(0.4, 0, 0.2, 1)",
                          }}
                        >
                          {/* Gold accent bar */}
                          <div style={{
                            position: "absolute",
                            left: 0,
                            top: 8,
                            bottom: 8,
                            width: 2,
                            borderRadius: 1,
                            background: "var(--accent-gold)",
                            opacity: 0.6,
                          }} />
                          <div
                            className="font-mono text-[9px] uppercase tracking-[0.15em]"
                            style={{ color: "var(--muted-text)", opacity: 0.5, marginBottom: 8, textAlign: "right" }}
                          >
                            YOU · {relativeTime(m.created_at)}
                          </div>
                          <div
                            className="text-[15px] leading-[1.7] whitespace-pre-wrap"
                            style={{
                              textAlign: "left",
                              fontFamily: "var(--font-mono)",
                              letterSpacing: "-0.01em",
                              color: "rgba(255, 255, 255, 0.75)",
                              ...(isLongMessage && !isExpanded
                                ? {
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical" as const,
                                    overflow: "hidden",
                                    whiteSpace: "pre-wrap",
                                  }
                                : {}),
                              transition: "max-height 280ms cubic-bezier(0.4, 0, 0.2, 1)",
                            }}
                          >
                            {m.content}
                          </div>
                          {isLongMessage && (
                            <div
                              style={{
                                position: "absolute",
                                right: 12,
                                bottom: 10,
                                color: "var(--accent-gold)",
                                opacity: 0.4,
                                transition: "transform 200ms ease, opacity 160ms ease",
                                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                              }}
                            >
                              <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 6l4 4 4-4" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 6 }}>
                          <MessageActionButton
                            label="Copy"
                            onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }}
                          />
                          <MessageActionButton
                            label="Edit"
                            onClick={() => { setInput(m.content); onRequestInputFocus(); }}
                          />
                        </div>
                      </>
                    );
                  })() : (
                  <>
                    {/* Atlas response — no card, formatted text */}
                    <div style={{ padding: "10px 6px" }}>
                      <div
                        className="font-mono text-[9px] uppercase tracking-[0.15em]"
                        style={{ color: "var(--muted-text)", opacity: 0.6, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}
                      >
                        <span>ATLAS · {relativeTime(m.created_at)}</span>
                        {m.intent_type && (
                          <span
                            title={m.output_guard_violation ? `Guard: ${m.output_guard_violation}${m.output_guard_repaired ? " (repaired)" : ""}` : undefined}
                            style={{
                              fontSize: 8,
                              letterSpacing: "0.1em",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: m.intent_type === "BUILD" ? "rgba(59,130,246,0.15)" : m.intent_type === "DECIDE" ? "rgba(245,158,11,0.15)" : "rgba(139,92,246,0.15)",
                              color: m.intent_type === "BUILD" ? "#60a5fa" : m.intent_type === "DECIDE" ? "#fbbf24" : "#a78bfa",
                              border: `1px solid ${m.intent_type === "BUILD" ? "rgba(59,130,246,0.25)" : m.intent_type === "DECIDE" ? "rgba(245,158,11,0.25)" : "rgba(139,92,246,0.25)"}`,
                            }}
                          >
                            {m.intent_type}
                          </span>
                        )}
                        {m.output_guard_repaired && (
                          <span
                            style={{
                              fontSize: 8,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "rgba(234,179,8,0.12)",
                              color: "#fbbf24",
                              border: "1px solid rgba(234,179,8,0.2)",
                              cursor: "default",
                            }}
                            title={m.output_guard_violation ? `Violation: ${m.output_guard_violation} — auto-repaired` : "Output was auto-corrected by the guard"}
                          >
                            🔧 {m.output_guard_violation ?? "repaired"}
                          </span>
                        )}
                        {m.output_guard_violation && !m.output_guard_repaired && (
                          <span
                            style={{
                              fontSize: 8,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "rgba(239,68,68,0.12)",
                              color: "#f87171",
                              border: "1px solid rgba(239,68,68,0.2)",
                              cursor: "default",
                            }}
                            title={`Guard violation: ${m.output_guard_violation} — not repaired`}
                          >
                            ⚠ {m.output_guard_violation}
                          </span>
                        )}
                      </div>
                      {Array.isArray(m.surfaced_memories) && m.surfaced_memories.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <MemoryChips memories={m.surfaced_memories as SurfacedMemory[]} />
                        </div>
                      )}
                      {conflict ? (
                        <ConflictWarningCard
                          conflict={conflict}
                          onProceed={() => proceedAnyway(m.id, conflict.committedOn)}
                          onUpdate={() => { setInput(`Update the decision: ${conflict.committedOn}`); reconsider(m.id); }}
                          onReconsider={() => reconsider(m.id)}
                        />
                      ) : (
                        <>
                          {proseForDisplay.trim() && (
                            newMessageIds.has(m.id) ? (
                              <ChunkedBubbles
                                text={proseForDisplay}
                                isNew
                                renderBubble={(chunk, idx, isNewChunk) => (
                                  <div
                                    key={idx}
                                    style={{
                                      marginBottom: 10,
                                      animation: isNewChunk ? undefined : "atlas-bubble-in 300ms ease forwards",
                                    }}
                                  >
                                    <StreamingText
                                      text={chunk}
                                      animate={isNewChunk}
                                      speed={30}
                                      onComplete={() => {
                                        // After last chunk finishes, remove from new set
                                        // so re-renders don't re-animate
                                      }}
                                     className="text-[16px] leading-[1.75] whitespace-pre-wrap text-foreground atlas-prose"
                                      style={{ textAlign: "left" }}
                                    />
                                  </div>
                                )}
                              />
                            ) : (
                              <div className="text-[16px] leading-[1.75] whitespace-pre-wrap text-foreground atlas-prose" style={{ textAlign: "left" }}>
                                {proseForDisplay}
                              </div>
                            )
                          )}
                          {card && cardVersion !== null && (
                            <div className="pt-2">
                              <CommitCard payload={card} schemaVersion={cardVersion} messageId={m.id} locked={isLocked} busy={committingCardId === m.id} onCommit={() => commitCardMessage(m, card)} onPark={() => parkCardMessage(m, card)} />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {showParkButton && (
                       <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                          {/* Rollback — always visible */}
                          <MessageActionButton label="Rollback" onClick={() => { onRollback(m); }} />
                          {/* History — diff view of this exchange */}
                          <MessageActionButton label="History" onClick={() => {
                            const idx = messages.findIndex((msg) => msg.id === m.id);
                            const prevUser = idx > 0 ? [...messages].slice(0, idx).reverse().find((msg) => msg.role === "user") : null;
                            if (prevUser && onOpenDiff) {
                              onOpenDiff(prevUser.content, m.content);
                            } else {
                              toast("No prior exchange to compare");
                            }
                          }} />
                          {/* Regenerate — re-send the user prompt */}
                          <MessageActionButton label="Regenerate" onClick={() => {
                            const idx = messages.findIndex((msg) => msg.id === m.id);
                            const prevUser = idx > 0 ? [...messages].slice(0, idx).reverse().find((msg) => msg.role === "user") : null;
                            if (prevUser && onRegenerate) {
                              onRegenerate(prevUser.content);
                            } else {
                              toast("No prior prompt to regenerate from");
                            }
                          }} />
                          {/* Copy — always visible */}
                          <MessageActionButton label="Copy" onClick={() => { navigator.clipboard.writeText(proseForDisplay); toast.success("Copied"); }} />
                          {/* Three-dot more menu */}
                          <div style={{ position: "relative" }}>
                            <button
                              onClick={() => setMoreMenuOpenId((cur) => cur === m.id ? null : m.id)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--muted-text)",
                                cursor: "pointer",
                                padding: 6,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 999,
                                minWidth: 34,
                                minHeight: 34,
                              }}
                              aria-label="More actions"
                            >
                              <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor">
                                <circle cx="3.25" cy="8" r="1.25" />
                                <circle cx="8" cy="8" r="1.25" />
                                <circle cx="12.75" cy="8" r="1.25" />
                              </svg>
                            </button>
                            {moreMenuOpenId === m.id && (
                              <BottomSheet open onClose={() => setMoreMenuOpenId(null)}>
                                {onOpenDiff && (
                                  <button
                                    onClick={() => {
                                      const prevUser = [...messages].slice(0, messages.indexOf(m)).reverse().find((msg) => msg.role === "user");
                                      onOpenDiff(prevUser?.content ?? "(no user message)", proseForDisplay);
                                      setMoreMenuOpenId(null);
                                    }}
                                    style={moreMenuActionStyle}
                                  >
                                    <span style={moreMenuIconStyle}>
                                      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}>
                                        <rect x="2.5" y="3" width="4.5" height="4.5" rx="0.75" />
                                        <rect x="9" y="8.5" width="4.5" height="4.5" rx="0.75" />
                                        <path d="M7 5.25h2M8 6.25v2" strokeLinecap="round" />
                                      </svg>
                                    </span>
                                    View Differential
                                  </button>
                                )}
                                {showActionRow && (
                                  <button onClick={() => { commitDecision(); setMoreMenuOpenId(null); }} disabled={extracting} style={moreMenuActionStyle}>
                                    <span style={moreMenuIconStyle}>
                                      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 8l3 3 5-6" />
                                      </svg>
                                    </span>
                                    {extracting ? "Extracting…" : "Commit to Ledger"}
                                  </button>
                                )}
                                <button
                                  onClick={() => { parkMessage(m); setMoreMenuOpenId(null); }}
                                  style={moreMenuActionStyle}
                                >
                                  <span style={moreMenuIconStyle}>
                                    <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}>
                                      <path d="M2.5 5.5h11v7.5h-11z" />
                                      <path d="M2.5 5.5 4.5 3.5h3" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </span>
                                  {parkedMessageId === m.id ? "Parked ✓" : "Send to Parking Lot"}
                                </button>
                              </BottomSheet>
                            )}
                          </div>
                          {commitStatus && (
                            <div style={{ color: commitStatus.color, opacity: commitStatus.visible ? 1 : 0, transition: "opacity 400ms ease" }} className="font-mono text-[10px]">
                              {commitStatus.text}
                            </div>
                          )}
                        </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        {sending && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              width: "fit-content",
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: "var(--accent-gold)", opacity: 0.6 }}>
              processing
            </span>
            <button
              type="button"
              onClick={onStop}
              className="font-mono text-[10px] uppercase tracking-[0.15em] rounded-sm px-2 py-0.5 transition-colors"
              style={{
                background: "transparent",
                border: "0.5px solid var(--ember)",
                color: "var(--ember)",
              }}
              aria-label="Stop Atlas"
              title="Stop Atlas"
            >
              ◼ Stop
            </button>
          </div>
        )}
        {/* Scroll anchor — browser pins to this */}
        <div ref={bottomAnchorRef} style={{ overflowAnchor: "auto", height: 1, flexShrink: 0 }} />
      </div>
      {/* Sovereign Scrub Rail — always visible when chat has messages */}
      {messages.length > 0 && (
        <SovereignScrubRail
          notches={
            (buildHistory ?? []).length > 0
              ? (buildHistory ?? []).map((e, i, arr) => ({
                  id: e.id,
                  label: e.label || e.state,
                  position: arr.length > 1 ? i / (arr.length - 1) : 0.5,
                  kind: e.state === "idle" ? "message" as const : e.state as ScrubNotch["kind"],
                }))
              : messages.map((m, i, arr) => ({
                  id: m.id,
                  label: m.role === "user" ? "You" : "Atlas",
                  position: arr.length > 1 ? i / (arr.length - 1) : 0.5,
                  kind: "message" as const,
                }))
          }
          scrollContainerRef={scrollRef}
        />
      )}
    </>
  );
}

const ACTION_ICONS: Record<string, { svg: React.ReactNode; title: string }> = {
  History: {
    title: "History",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
        <path d="M8 4.5V8l2.5 1.5" />
      </svg>
    ),
  },
  Rollback: {
    title: "Rollback to this point",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7l-2.5 2.5L4 12" />
        <path d="M1.5 9.5H9a4 4 0 100-8H6" />
      </svg>
    ),
  },
  Copy: {
    title: "Copy",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="5" width="8" height="8" rx="1.5" />
        <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" />
      </svg>
    ),
  },
  Edit: {
    title: "Edit",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.5 1.5l3 3L5 14H2v-3z" />
      </svg>
    ),
  },
  Regenerate: {
    title: "Regenerate",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 8a7 7 0 0112.9-3.7M15 1v4h-4" />
        <path d="M15 8a7 7 0 01-12.9 3.7M1 15v-4h4" />
      </svg>
    ),
  },
  Commit: {
    title: "Commit to Ledger",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2h8a2 2 0 012 2v8l-3-2-3 2-3-2-3 2V4a2 2 0 012-2z" />
        <path d="M6 6h4M6 9h2" />
      </svg>
    ),
  },
  Park: {
    title: "Park",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6" />
        <path d="M6 5h2.5a2 2 0 010 4H6V5z" />
        <path d="M6 9v3" />
      </svg>
    ),
  },
  "Extracting…": {
    title: "Extracting…",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
        <path d="M8 2v4M8 10v4M2 8h4M10 8h4" style={{ animation: "atlas-pulse 1.2s ease-in-out infinite" }} />
      </svg>
    ),
  },
  "Parked ✓": {
    title: "Parked",
    svg: (
      <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="var(--ember)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8.5l3 3 7-7" />
      </svg>
    ),
  },
};

function MessageActionButton({
  label,
  onClick,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const iconData = ACTION_ICONS[label];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={iconData?.title ?? label}
      title={iconData?.title ?? label}
      style={{
        background: "transparent",
        border: "none",
        color: active ? "var(--ember)" : "var(--muted-text)",
        minWidth: 40,
        minHeight: 40,
        padding: 8,
        borderRadius: 10,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 0.55,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 160ms ease, color 160ms ease",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.color = "var(--accent-gold)";
          e.currentTarget.style.filter = "drop-shadow(0 0 6px color-mix(in oklab, var(--accent-gold) 50%, transparent))";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = disabled ? "0.4" : "0.55";
        e.currentTarget.style.color = active ? "var(--ember)" : "var(--muted-text)";
        e.currentTarget.style.filter = "none";
      }}
      onPointerDown={() => {
        try { if ("vibrate" in navigator) navigator.vibrate(10); } catch {}
      }}
    >
      {iconData?.svg ?? <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>}
    </button>
  );
}

function ParkButton({
  parked,
  onClick,
}: {
  parked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "0.5px solid #2C2926",
        color: parked ? "#EA580C" : "#78716C",
        fontFamily: "monospace",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        borderRadius: 6,
        padding: "4px 10px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#EA580C";
        e.currentTarget.style.color = "#EA580C";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#2C2926";
        e.currentTarget.style.color = parked ? "#EA580C" : "#78716C";
      }}
    >
      {parked ? "PARKED ✓" : "PARK →"}
    </button>
  );
}

function parseConflictResponse(content: string): ConflictDetails | null {
  if (!content.startsWith("CONFLICT_DETECTED:")) return null;

  const lines = content.split("\n").map((line) => line.trim());
  const readValue = (prefix: string) =>
    lines.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim() ?? "";

  return {
    conflict: readValue("CONFLICT_DETECTED:"),
    committed: readValue("COMMITTED:"),
    committedOn: readValue("COMMITTED_ON:"),
  };
}

function ConflictWarningCard({
  conflict,
  onProceed,
  onUpdate,
  onReconsider,
}: {
  conflict: ConflictDetails;
  onProceed: () => void;
  onUpdate: () => void;
  onReconsider: () => void;
}) {
  const buttonStyle = {
    width: "100%",
    background: "transparent",
    border: "0.5px solid #2C2926",
    color: "#78716C",
    fontFamily: "monospace",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    borderRadius: 6,
    padding: "7px 10px",
    textAlign: "left" as const,
  };

  return (
    <div
      style={{
        borderTop: "2px solid #EA580C",
        background: "#1C1917",
        borderRadius: 8,
        padding: "12px 16px",
      }}
      className="space-y-3"
    >
      <div style={{ color: "#EA580C", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        COMMITMENT CONFLICT
      </div>
      <div style={{ color: "#E7E5E4", fontSize: 14 }}>
        {conflict.conflict}
      </div>
      <div style={{ color: "#78716C", fontSize: 12, fontFamily: "monospace" }}>
        {conflict.committedOn || conflict.committed}
      </div>
      <div className="space-y-2">
        <button onClick={onProceed} style={buttonStyle}>
          Proceed anyway
        </button>
        <button onClick={onUpdate} style={buttonStyle}>
          Update the decision
        </button>
        <button onClick={onReconsider} style={buttonStyle}>
          Reconsider
        </button>
      </div>
    </div>
  );
}

function ParkingLotButton({
  count,
  open,
  onClick,
}: {
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Parking Lot"
      className="relative flex h-7 w-7 items-center justify-center bg-transparent font-mono text-[12px]"
      style={{ color: open ? "#EA580C" : "#78716C" }}
    >
      P
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: -5,
            right: -6,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#EA580C",
            color: "#0C0A09",
            fontSize: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function UtilityBarSurfaces({
  active,
  historyOpen,
  onChange,
  onHistory,
}: {
  active: "chat" | "workspace" | "preview";
  historyOpen: boolean;
  onChange: (surface: "chat" | "workspace" | "preview") => void;
  onHistory: () => void;
}) {
  const items: Array<{
    id: "chat" | "workspace" | "preview" | "history";
    label: string;
    icon: ReactNode;
  }> = [
    {
      id: "history",
      label: "History",
      icon: (
        <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M5 4.5h10M5 8h10M5 11.5h7M4 15h9" />
        </svg>
      ),
    },
    {
      id: "workspace",
      label: "Workspace",
      icon: (
        <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3.5 4.5h13v11h-13z" />
          <path d="M7.5 4.5v11M3.5 8h13" />
        </svg>
      ),
    },
    {
      id: "preview",
      label: "Preview",
      icon: (
        <svg viewBox="0 0 20 20" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M2.5 10s2.5-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.5 4.5-7.5 4.5S2.5 10 2.5 10Z" />
          <circle cx="10" cy="10" r="2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="atlas-utility-row">
      {items.map((item) => {
        const isHistory = item.id === "history";
        const isActive = isHistory ? historyOpen : active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            title={item.label}
            data-active={isActive ? "true" : "false"}
            onClick={() => {
              if (item.id === "history") {
                onHistory();
              } else {
                onChange(item.id as "chat" | "workspace" | "preview");
              }
            }}
            className="atlas-utility-btn"
          >
            {item.icon}
          </button>
        );
      })}
    </div>
  );
}

function UtilityOverflowMenu({
  activeSurface,
  historyOpen,
  onSurfaceChange,
  onHistory,
}: {
  activeSurface: "chat" | "workspace" | "preview";
  historyOpen: boolean;
  onSurfaceChange: (surface: "chat" | "workspace" | "preview") => void;
  onHistory: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items: Array<{ id: "history" | "chat" | "workspace" | "preview"; label: string; icon: ReactNode }> = [
    {
      id: "history",
      label: "History",
      icon: (
        <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M5 4.5h10M5 8h10M5 11.5h7M4 15h9" />
        </svg>
      ),
    },
    {
      id: "workspace",
      label: "Workspace",
      icon: (
        <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3.5 4.5h13v11h-13z" />
          <path d="M7.5 4.5v11M3.5 8h13" />
        </svg>
      ),
    },
    {
      id: "preview",
      label: "Preview",
      icon: (
        <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M2.5 10s2.5-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.5 4.5-7.5 4.5S2.5 10 2.5 10Z" />
          <circle cx="10" cy="10" r="2" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="More options"
        title="More"
        className="atlas-utility-btn"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          ref={ref}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            zIndex: 92,
            minWidth: 160,
            background: "rgba(28, 25, 23, 0.92)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid color-mix(in oklab, var(--accent-gold) 25%, transparent)",
            borderRadius: 12,
            padding: "6px 0",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(201,162,76,0.12)",
            animation: "atlas-sys-menu-in 180ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            transformOrigin: "bottom right",
          }}
        >
          {items.map((item) => {
            const isHistory = item.id === "history";
            const isActive = isHistory ? historyOpen : activeSurface === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === "history") onHistory();
                  else onSurfaceChange(item.id as "chat" | "workspace" | "preview");
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: isActive ? "color-mix(in oklab, var(--accent-gold) 12%, transparent)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: isActive ? "var(--accent-gold)" : "var(--foreground)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in oklab, var(--accent-gold) 8%, transparent)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ParkingLotDrawer({
  open,
  items,
  projects,
  onClose,
  onAction,
}: {
  open: boolean;
  items: ParkedItem[];
  projects: Project[];
  onClose: () => void;
  onAction: (itemId: string, status: "resolved" | "dismissed") => Promise<void>;
}) {
  const [fadingIds, setFadingIds] = useState<Set<string>>(() => new Set());
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const groupedItems = items.reduce<Record<string, ParkedItem[]>>((groups, item) => {
    const key = item.project_id;
    groups[key] = groups[key] ? [...groups[key], item] : [item];
    return groups;
  }, {});

  const handleAction = (itemId: string, status: "resolved" | "dismissed") => {
    setFadingIds((current) => new Set(current).add(itemId));
    window.setTimeout(() => {
      onAction(itemId, status);
      setFadingIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }, 160);
  };

  return (
    <>
      {open && (
        <button
          aria-label="Close parking lot"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-transparent"
        />
      )}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(360px, 100vw)",
          background: "#0C0A09",
          borderLeft: "0.5px solid #2C2926",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease",
          zIndex: 50,
        }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#78716C", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            PARKING LOT
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#3C3530", fontSize: 18 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "0 16px 12px", fontFamily: "monospace", fontSize: 10, color: "#3C3530" }}>
          {items.length} waiting · 0 resolved
        </div>
        <div className="space-y-3 overflow-y-auto px-4 pb-6">
          {items.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center text-center">
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#3C3530", maxWidth: 220 }}>
                Nothing parked yet. Tap Park on any message or select text to save it.
              </p>
            </div>
          ) : (
            Object.entries(groupedItems).map(([projectId, group]) => (
              <div key={projectId} className="space-y-1.5">
                {Object.keys(groupedItems).length > 1 && (
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: "#57524E", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 0" }}>
                    {projectNames.get(projectId) ?? "Project"}
                  </div>
                )}
                {group.map((item) => (
                  <ParkedRow
                    key={item.id}
                    item={item}
                    projectName={projectNames.get(item.project_id) ?? null}
                    fading={fadingIds.has(item.id)}
                    onAction={handleAction}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

/* -------- Parked Row with Glossary-in-Context (§XI Phase 2) -------- */
function ParkedRow({
  item,
  projectName,
  fading,
  onAction,
}: {
  item: ParkedItem;
  projectName: string | null;
  fading: boolean;
  onAction: (itemId: string, status: "resolved" | "dismissed") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null);
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLooked, setHasLooked] = useState(false);

  // First expand: cache lookup by slug
  useEffect(() => {
    if (!expanded || hasLooked) return;
    setHasLooked(true);
    (async () => {
      setLoading(true);
      setError(null);
      const slug = slugifyTerm(item.label);
      const { data, error: fetchError } = await supabase
        .from("knowledge_entries")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (fetchError) {
        setError(fetchError.message);
      } else if (data) {
        setEntry(data as KnowledgeEntry);
      }
      setLoading(false);
    })();
  }, [expanded, hasLooked, item.label]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("atlas-glossary", {
        body: {
          term: item.label,
          projectName,
          projectContext: item.source_context,
        },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setEntry(data.entry as KnowledgeEntry);
      setGenerated(!!data.generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="transition-opacity duration-150"
      style={{
        opacity: fading ? 0 : 1,
        padding: "8px 0",
        borderTop: "0.5px solid color-mix(in oklab, var(--border) 40%, transparent)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            minWidth: 0,
            flex: 1,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            padding: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--foreground)",
              fontSize: 13,
            }}
          >
            <SeverityDot severity="parked" size={7} />
            <span
              aria-hidden
              style={{
                color: "var(--accent-gold)",
                opacity: 0.55,
                fontSize: 9,
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 160ms var(--ease-cinematic)",
                display: "inline-block",
                width: 8,
              }}
            >
              ▶
            </span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.label}
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--muted-text)",
              opacity: 0.55,
              marginTop: 2,
              paddingLeft: 14,
            }}
          >
            {item.source_context} · {relativeTime(item.created_at)}
          </div>
        </button>
        <CapsuleTag severity="parked" size="xs">
          {item.kind === "commit_card" ? "PARKED" : item.kind}
        </CapsuleTag>
      </div>

      {expanded && (
        <div style={{ paddingLeft: 14, marginTop: 4 }}>
          {loading && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--muted-text)",
                opacity: 0.7,
                padding: "8px 0",
              }}
            >
              {entry ? "refreshing…" : "looking up…"}
            </div>
          )}
          {error && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ember)",
                padding: "6px 0",
              }}
            >
              {error}
            </div>
          )}
          {!loading && !entry && !error && (
            <button
              type="button"
              onClick={generate}
              style={{
                marginTop: 6,
                background: "transparent",
                border: "0.5px dashed color-mix(in oklab, var(--accent-gold) 45%, var(--border))",
                color: "var(--accent-gold)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "8px 12px",
                borderRadius: 8,
                cursor: "pointer",
                width: "100%",
                opacity: 0.85,
              }}
            >
              ◇ Generate explanation
            </button>
          )}
          {entry && <GlossaryCard entry={entry} generated={generated} />}

          <div
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button
              onClick={() => onAction(item.id, "resolved")}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted-text)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--ember)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--muted-text)";
              }}
            >
              RESOLVE
            </button>
            <button
              onClick={() => onAction(item.id, "dismissed")}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted-text)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              DISMISS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function slugifyTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function HistoryPanel({
  open,
  recents,
  onOpenSession,
}: {
  open: boolean;
  recents: RecentSession[];
  onOpenSession: (sessionId: string) => void;
}) {
  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        width: 280,
        background: "#0C0A09",
        borderRight: "0.5px solid #2C2926",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 200ms ease",
        zIndex: 40,
      }}
    >
      <div style={{ padding: "16px 20px 12px", fontFamily: "monospace", fontSize: 10, color: "#78716C", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Conversation history
      </div>
      <SessionHistoryList sessions={recents} onOpenSession={onOpenSession} />
    </aside>
  );
}

/* -------- Workspace Panel -------- */
function WorkspacePanel({ nodes }: { nodes: WorkspaceNode[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Workspace
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {nodes.length} nodes
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {nodes.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-muted-foreground">
              Nothing here yet.
            </p>
            <p className="text-[11px] text-muted-foreground/70 font-mono mt-2">
              Start a conversation and Atlas will build here.
            </p>
          </div>
        ) : (
          nodes.map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              expanded={open === n.id}
              onToggle={() => setOpen(open === n.id ? null : n.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function NodeCard({
  node,
  expanded,
  onToggle,
}: {
  node: WorkspaceNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const accent = (() => {
    switch (node.type) {
      case "file":
        return { color: "var(--ember)", border: "border-[color:var(--ember)]/30" };
      case "component":
        return {
          color: "var(--phosphor)",
          border: "border-[color:var(--phosphor)]/30",
        };
      case "draft":
        return { color: "var(--muted-text)", border: "border-dashed border-border" };
      case "output":
        return { color: "var(--foreground)", border: "border-border" };
      default:
        return { color: "var(--muted-text)", border: "border-border" };
    }
  })();

  const body =
    typeof node.content === "object" && node.content !== null
      ? ((node.content as { body?: string }).body ?? JSON.stringify(node.content, null, 2))
      : String(node.content ?? "");

  return (
    <div
      className={`bg-[color:var(--surface)] rounded-sm border ${accent.border} cursor-pointer transition-all`}
      onClick={onToggle}
    >
      <div className="px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.15em]"
              style={{ color: accent.color }}
            >
              {node.type}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground/60">
              v{node.version}
            </span>
          </div>
          <div
            className={`text-[13px] mt-0.5 truncate ${
              node.type === "file" ? "font-mono" : ""
            }`}
          >
            {node.title}
          </div>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0">
          {relativeTime(node.updated_at)}
        </span>
      </div>
      {expanded && body && (
        <div className="px-3 pb-3 pt-1 border-t border-border/50">
          <pre className="text-[12px] text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
            {body}
          </pre>
        </div>
      )}
    </div>
  );
}

/* -------- Preview Panel -------- */
function PreviewPanel({
  recs,
  expanded,
  setExpanded,
  onAction,
}: {
  recs: Recommendation[];
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onAction: (id: string, status: Recommendation["status"]) => void;
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Preview · Recommendations
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {recs.length} pending
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {recs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13px] text-muted-foreground">No pending recommendations.</p>
            <p className="text-[11px] text-muted-foreground/70 font-mono mt-2">
              Atlas will surface suggestions here as you build.
            </p>
          </div>
        ) : (
          recs.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <div
                key={r.id}
                className="bg-[color:var(--surface)] border border-border rounded-sm"
              >
                <div
                  className="px-3 py-2.5 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`font-mono text-[9px] uppercase tracking-[0.15em] ${
                        r.priority === "high"
                          ? "text-[color:var(--ember)]"
                          : "text-muted-foreground"
                      }`}
                    >
                      {r.priority}
                    </span>
                  </div>
                  <div className="text-[13px] leading-snug">{r.content}</div>
                </div>
                {isOpen && (
                  <div className="px-3 pb-3 border-t border-border/50 space-y-2 pt-2">
                    {r.definition && (
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground mb-0.5">
                          What
                        </div>
                        <div className="text-[12px] text-foreground/80">
                          {r.definition}
                        </div>
                      </div>
                    )}
                    {r.benefit && (
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground mb-0.5">
                          Why
                        </div>
                        <div className="text-[12px] text-foreground/80">
                          {r.benefit}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(r.id, "accepted");
                        }}
                        className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] bg-[color:var(--ember)] text-[color:var(--background)] rounded-sm hover:brightness-110"
                      >
                        Accept
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(r.id, "parked");
                        }}
                        className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] border border-border text-foreground hover:border-[color:var(--phosphor)] rounded-sm"
                      >
                        Park
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(r.id, "dismissed");
                        }}
                        className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground rounded-sm"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
