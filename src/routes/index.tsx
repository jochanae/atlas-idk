import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import {
  AtlasFrontDoor,
  SessionHistoryList,
  type ModeId,
  type RecentSession,
} from "@/components/atlas/AtlasFrontDoor";
import { AtlasSidebar, SidebarToggle } from "@/components/atlas/AtlasSidebar";
import { UserAvatar } from "@/components/atlas/UserAvatar";
import { UserMenu } from "@/components/atlas/UserMenu";
import { SessionBreadcrumb } from "@/components/atlas/SessionBreadcrumb";
import { SessionFooter } from "@/components/atlas/SessionFooter";
import { ArtifactDrawer } from "@/components/atlas/ArtifactDrawer";
import { WhisperGate, type WhisperAnswers } from "@/components/atlas/WhisperGate";
import { GlossaryCard, type KnowledgeEntry } from "@/components/atlas/GlossaryCard";
import { ThinkingPromptCard, type ThinkingPrompt } from "@/components/atlas/ThinkingPromptCard";
import { DesktopWorkspace, type SurfaceId as WorkspaceSurfaceId } from "@/components/atlas/DesktopWorkspace";
import { SeverityDot } from "@/components/atlas/StatusGlyph";
import { CapsuleTag } from "@/components/atlas/CapsuleTag";
import { CommitCard } from "@/components/atlas/CommitCard";
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
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [auditWarning, setAuditWarning] = useState(false);
  const [surface, setSurface] = useState<"chat" | "workspace" | "preview">("chat");
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [activeMode, setActiveMode] = useState<ModeId>("think");
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
  const [whisperOpen, setWhisperOpen] = useState(false);
  const [whisperSubmitting, setWhisperSubmitting] = useState(false);
  const [thinkingPrompts, setThinkingPrompts] = useState<ThinkingPrompt[]>([]);
  const [thinkingLoading, setThinkingLoading] = useState(false);
  const [isWideViewport, setIsWideViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : false,
  );

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
    const { data, error } = await parkedItemsTable()
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "parked")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setParkedItems((data ?? []) as ParkedItem[]);
  };
  useEffect(() => {
    loadParkedItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Ledger count for sidebar badge
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { count } = await supabase
        .from("ledger_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      setLedgerCount(count ?? 0);
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


  // Whisper Gate: check if active project already has a Compass
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

  const submitWhisper = async (answers: WhisperAnswers) => {
    if (!user || !activeProjectId) return;
    setWhisperSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("atlas-whisper", {
        body: {
          projectId: activeProjectId,
          audience: answers.audience,
          aesthetics: answers.aesthetics,
          seedMaterial: answers.seedMaterial,
          hasAttachment: answers.hasAttachment,
          attachmentHint: answers.attachmentHint,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const compassMd: string = data?.compass_md ?? "";

      // Open a fresh whisper-mode session and seed the chat with the Compass
      // so the Drawer auto-detects it as a structured doc artifact.
      const { data: sessionRow, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          project_id: activeProjectId,
          user_id: user.id,
          title: "Project Compass",
          mode: "whisper",
          status: "active",
        })
        .select("*")
        .single();
      if (sessionError) throw sessionError;

      const created = sessionRow as AtlasSession;

      const intro = `**Project Compass drafted.** Open in the Drawer →\n\n${compassMd}`;
      await supabase.from("chat_messages").insert({
        session_id: created.id,
        user_id: user.id,
        role: "assistant",
        content: intro,
        intent_type: "whisper_compass",
      });

      setSession(created);
      setEntrySurface(false);
      setSurface("chat");
      setHasCompass(true);
      setWhisperOpen(false);
      await refresh(created, activeProjectId);
      await loadRecents();
      toast.success("Compass drafted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Whisper Gate failed";
      toast.error(msg);
    } finally {
      setWhisperSubmitting(false);
    }
  };
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

  const ensureSession = async (text: string) => {
    if (session && activeProjectId) return { session, projectId: activeProjectId };
    if (!user || !activeProjectId) return null;

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        project_id: activeProjectId,
        user_id: user.id,
        title: "Session",
        mode: activeMode,
        status: "active",
      })
      .select("*")
      .single();
    if (error) throw error;

    const created = data as AtlasSession;
    setSession(created);
    setRecents((prev) => [
      {
        id: created.id,
        title: "Session",
        mode: activeMode,
        created_at: created.created_at,
      },
      ...prev.filter((recent) => recent.id !== created.id),
    ].slice(0, 8));
    return { session: created, projectId: activeProjectId };
  };

  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    setAuditWarning(false);
    setInput("");
    setTransitioning(true);
    setSurface("chat");

    try {
      const target = await ensureSession(text);
      if (!target) throw new Error("No project available");

      const optimistic: ChatMessage = {
        id: crypto.randomUUID(),
        session_id: target.session.id,
        user_id: user!.id,
        role: "user",
        content: text,
        intent_type: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      const { data, error } = await supabase.functions.invoke("atlas-chat", {
        body: {
          sessionId: target.session.id,
          projectId: target.projectId,
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
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
      await refresh(target.session, target.projectId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Atlas failed to respond";
      toast.error(msg);
      setAuditWarning(true);
      if (!session && messages.length === 0) setTransitioning(false);
    } finally {
      setSending(false);
    }
  };

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
      // Log to Architectural Ledger
      await supabase.from("ledger_entries").insert({
        user_id: user.id,
        project_id: rec.project_id,
        title: rec.content,
        description: `Accepted recommendation. ${rec.definition ?? ""}`.trim(),
        status: "Active",
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
      parkedItemsTable().insert({
        user_id: user.id,
        project_id: activeProjectId,
        session_id: session?.id ?? null,
        label: prompt.content,
        source_context: "thinking prompt",
        kind: "question",
        status: "parked",
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


  const isActive = (!!session || transitioning || messages.length > 0) && !entrySurface;
  const artifacts = useMemo(() => detectArtifacts(messages), [messages]);
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );
  const showWideDrawer = isActive && artifacts.length > 0 && isWideViewport;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-mono text-xs text-muted-foreground">loading…</span>
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
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <FooterAuditLine state={auditWarning ? "warning" : "healthy"} />
      <main className="relative min-h-screen overflow-hidden">

        <AtlasFrontDoor
          active={isActive}
          input={input}
          onInputChange={setInput}
          sending={sending}
          activeMode={activeMode}
          inputFocusSignal={inputFocusSignal}
          onModeChange={setActiveMode}
          onSend={send}
          userName={
            (user.user_metadata?.display_name as string | undefined) ||
            (user.user_metadata?.full_name as string | undefined) ||
            (user.user_metadata?.name as string | undefined) ||
            (user.email ? user.email.split("@")[0] : null)
          }
          sidebarToggle={<SidebarToggle onClick={() => setSidebarOpen(true)} />}
          onWordmarkClick={() => {
            if (session) {
              setEntrySurface(true);
              setSurface("chat");
              setHistoryOpen(false);
            }
          }}
          headerActions={
            <div className="flex items-center gap-3 min-w-0" style={{ height: 40 }}>
              {session && !entrySurface && (
                <>
                  <SessionBreadcrumb
                    projectName={activeProject?.name ?? null}
                    sessionTitle={session.title || "New session"}
                    onHomeClick={() => {
                      setEntrySurface(true);
                      setSurface("chat");
                      setHistoryOpen(false);
                    }}
                    onProjectClick={() => {
                      // Future: open project picker. For now, jump to ledger scoped view.
                      navigate({ to: "/ledger" });
                    }}
                    pulse={commitPulse}
                  />
                  <ParkingLotButton
                    count={parkedItems.length}
                    open={parkingOpen}
                    onClick={() => setParkingOpen((open) => !open)}
                  />
                </>
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
              <section className="absolute inset-x-0 top-12 bottom-24 z-20 bg-background/95 backdrop-blur-sm border-y border-border">
                {surface === "workspace" ? (
                  <WorkspacePanel nodes={nodes} />
                ) : (
                  <PreviewPanel
                    recs={pendingRecs}
                    expanded={expandedRec}
                    setExpanded={setExpandedRec}
                    onAction={updateRec}
                  />
                )}
              </section>
            ) : null
          }
          utilityBarLeft={
            session ? (
              <>
                <button
                  type="button"
                  aria-label="Add"
                  title="Add (coming soon)"
                  className="atlas-utility-btn"
                >
                  <svg viewBox="0 0 16 16" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={1.6}>
                    <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Attach file"
                  title="Attach file (coming soon)"
                  className="atlas-utility-btn"
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
              <UtilityBarSurfaces
                active={surface}
                historyOpen={historyOpen}
                onChange={(nextSurface) => {
                  setHistoryOpen(false);
                  setEntrySurface(false);
                  setSurface(nextSurface);
                }}
                onHistory={() => {
                  setEntrySurface(false);
                  setHistoryOpen((open) => !open);
                }}
              />
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
              messages={messages}
              sending={sending}
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
            />
            {isActive && (
              <SessionFooter artifactCount={artifacts.length} ledgerCount={ledgerCount} />
            )}
          </div>
        </AtlasFrontDoor>
        {isActive && <ArtifactDrawer artifacts={artifacts} />}
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
              const values =
                status === "resolved"
                  ? { status, resolved_at: new Date().toISOString() }
                  : { status };
              const { error } = await parkedItemsTable()
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

        {/* Whisper Gate — conceptual entry gate (§V) */}
        {!isActive && activeProject && hasCompass === false && !whisperOpen && (
          <button
            type="button"
            onClick={() => setWhisperOpen(true)}
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 24,
              zIndex: 25,
              background: "var(--surface)",
              border: "0.5px solid color-mix(in oklab, var(--accent-gold) 45%, var(--border))",
              color: "var(--accent-gold)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "8px 16px",
              borderRadius: 999,
              cursor: "pointer",
              boxShadow: "0 0 18px -6px color-mix(in oklab, var(--accent-gold) 50%, transparent)",
            }}
          >
            ◇ Begin Whisper Gate
          </button>
        )}
        {whisperOpen && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 60,
              background: "color-mix(in oklab, var(--background) 92%, transparent)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              paddingTop: 56,
            }}
          >
            <button
              type="button"
              onClick={() => !whisperSubmitting && setWhisperOpen(false)}
              aria-label="Close Whisper Gate"
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "transparent",
                border: "none",
                color: "var(--muted-text)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: whisperSubmitting ? "default" : "pointer",
                opacity: whisperSubmitting ? 0.3 : 0.7,
                padding: 8,
              }}
            >
              ✕ close
            </button>
            <WhisperGate
              projectName={activeProject?.name}
              submitting={whisperSubmitting}
              onSubmit={submitWhisper}
              onSkip={() => setWhisperOpen(false)}
            />
          </div>
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
      />
    </div>
  );

  return (
    <DesktopWorkspace
      activeSurface={desktopActiveSurface}
      onSurfaceChange={handleDesktopSurfaceChange}
      onOpenHistory={() => {
        setEntrySurface(false);
        setHistoryOpen((open) => !open);
      }}
      parkedCount={parkedItems.length}
      ledgerCount={ledgerCount}
      renderMobile={() => mainShell}
      renderCanvas={() => mainShell}
      renderInspectorPanes={() => ({
        whisper: activeProject ? (
          <div className="p-4">
            <WhisperGate
              projectName={activeProject.name}
              submitting={whisperSubmitting}
              onSubmit={submitWhisper}
              onSkip={() => {}}
            />
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-[11px] font-mono text-muted-foreground">
              Select a project to begin a Whisper.
            </p>
          </div>
        ),
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
      })}
    />
  );
}


/* -------- Chat Panel -------- */
function ChatPanel({
  messages,
  sending,
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
}: {
  messages: ChatMessage[];
  sending: boolean;
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
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const statusTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const parkedTimerRef = useRef<number | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [parkedMessageId, setParkedMessageId] = useState<string | null>(null);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
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

      const { error: insertError } = await supabase.from("ledger_entries").insert({
        user_id: userId,
        project_id: projectId,
        extracted_from_session_id: sessionId,
        title: extraction.title,
        description,
        status: "Active",
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
    const { error } = await supabase
      .from("ledger_entries")
      .update({ status: "Violated", is_violation: true })
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("title", committedOn);
    if (error) {
      toast.error(error.message);
      return;
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
    const { error } = await parkedItemsTable().insert({
      user_id: userId,
      project_id: projectId,
      session_id: sessionId,
      label,
      source_context: sourceContext,
      kind,
      status: "parked",
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
      const status =
        card.severity === "blocker"
          ? "Violated"
          : card.severity === "parked"
            ? "Active"
            : "Active";
      const buildId = card.build_id ?? null;
      const { data: entry, error } = await supabase
        .from("ledger_entries")
        .insert({
          project_id: projectId,
          user_id: userId,
          title: card.title,
          description: card.summary + (card.details ? `\n\n${card.details}` : ""),
          status,
          is_violation: card.severity === "blocker",
          severity: card.severity,
          verb: card.verb ?? null,
          build_id: buildId,
          card_schema_version: card.v,
          extracted_from_session_id: sessionId,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Lock the AI turn — server returns the updated row but optimistic UI
      // is enough; subsequent refresh() will rehydrate.
      await supabase
        .from("chat_messages")
        .update({ committed_card_id: entry.id })
        .eq("id", message.id);

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

  return (
    <>
      <div
        ref={scrollRef}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        className="relative flex-1 overflow-y-auto px-4 py-4 flex flex-col justify-end gap-4"
      >
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

            // Detect a CommitCard payload — prefer DB-stored payload over re-parsing prose.
            // Renderer branches on card_schema_version for backward compatibility.
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
                className={`space-y-2 ${isUser ? "ml-auto max-w-[85%] text-right" : "max-w-[92%]"}`}
              >
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60">
                  {isUser ? "YOU" : "ATLAS"} · {relativeTime(m.created_at)}
                </div>
                {conflict ? (
                  <ConflictWarningCard
                    conflict={conflict}
                    onProceed={() => proceedAnyway(m.id, conflict.committedOn)}
                    onUpdate={() => {
                      setInput(`Update the decision: ${conflict.committedOn}`);
                      reconsider(m.id);
                    }}
                    onReconsider={() => reconsider(m.id)}
                  />
                ) : (
                  <>
                    {proseForDisplay.trim() && (
                      <div
                        className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
                          isUser ? "text-foreground/80" : "text-foreground"
                        }`}
                      >
                        {proseForDisplay}
                      </div>
                    )}
                    {card && cardVersion !== null && (
                      <div className="pt-1">
                        <CommitCard
                          payload={card}
                          schemaVersion={cardVersion}
                          messageId={m.id}
                          locked={isLocked}
                          busy={committingCardId === m.id}
                          onCommit={() => commitCardMessage(m, card)}
                          onPark={() => parkCardMessage(m, card)}
                        />
                      </div>
                    )}
                  </>
                )}
                {showParkButton && (
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {showActionRow && (
                      <button
                        onClick={commitDecision}
                        disabled={extracting}
                        style={{
                          background: "transparent",
                          border: "0.5px solid #2C2926",
                          color: "#78716C",
                          fontFamily: "monospace",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          borderRadius: 6,
                          padding: "4px 10px",
                        }}
                      >
                        {extracting ? "extracting…" : "COMMIT DECISION →"}
                      </button>
                    )}
                    <ParkButton
                      parked={parkedMessageId === m.id}
                      onClick={() => parkMessage(m)}
                    />
                    {commitStatus && (
                      <div
                        style={{
                          color: commitStatus.color,
                          opacity: commitStatus.visible ? 1 : 0,
                          transition: "opacity 400ms ease",
                        }}
                        className="font-mono text-[10px]"
                      >
                        {commitStatus.text}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        {sending && (
          <div className="font-mono text-[10px] text-[color:var(--phosphor)] uppercase tracking-[0.15em]">
            atlas thinking…
          </div>
        )}
      </div>
    </>
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
    <>
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
    </>
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
