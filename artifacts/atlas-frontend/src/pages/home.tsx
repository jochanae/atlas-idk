import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Project,
  getListProjectsQueryKey,
  useCreateProject,
  useCreateEntry,
  useListProjects,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { HistoryBookmarksSheet } from "@/components/HistoryBookmarksSheet";
import { ProjectsDrawer } from "../components/ProjectsDrawer";
import { ShellLogSheet } from "../components/ShellLogSheet";
import { AccountHubPanel } from "../components/AccountHubPanel";
import { BelowFoldDashboard } from "../components/BelowFoldDashboard";
import { WriteTab } from "@/components/workspace/WriteTab";
import { VisualVault } from "../components/VisualVault";
import { InviteModal } from "../components/InviteModal";
import { UpgradeModal } from "../components/UpgradeModal";
import { NewProjectModal } from "../components/NewProjectModal";
import { ParkSheet } from "@/components/ParkSheet";
import { UnifiedContextDock } from "../components/UnifiedContextDock";
import { normalizeGitHubRepoInput, serializeLinkedRepo } from "@/lib/githubRepo";
import { extractApiErrorMessage } from "../lib/atlas-utils";
import { ingestRepository } from "../lib/repoIngest";
import { useRequireAuth } from "../hooks/useAuth";
import { useSubscription } from "../hooks/useSubscription";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

// Home is a pure project dashboard/launcher. All conversation happens in
// the Workspace — there is no chat surface here (Ask Atlas removed).
export default function Home() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { user: authUser } = useRequireAuth();
  const { isFree } = useSubscription();

  const { data: projectsRaw, isLoading } = useListProjects({
    query: {
      queryKey: getListProjectsQueryKey(),
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      enabled: !!authUser,
    },
  });
  const projects = useMemo(() => (Array.isArray(projectsRaw) ? projectsRaw : []), [projectsRaw]);

  const createProject = useCreateProject();
  const createEntry = useCreateEntry();

  const logProjectInitialized = useCallback((projectId: number) => {
    createEntry.mutate({
      projectId,
      data: {
        title: "Project initialized: Sovereign context anchored.",
        summary: "Genesis anchor — the project exists; context is bound and ready for Forge.",
        status: "committed",
        severity: "committed",
        mode: "decide",
      },
    });
  }, [createEntry]);

  // Silent, non-blocking repo scan: derive architecture nodes from a public
  // GitHub URL and PATCH them straight into project.nodeState. Failures
  // never interrupt routing.
  const runRepoScan = useCallback((projectId: number, rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    ingestRepository(trimmed)
      .then(async (result) => {
        if (result.nodes.length === 0) return;
        const nodeState: Record<string, unknown> = {};
        result.nodes.forEach((n) => {
          nodeState[n.id] = {
            resolved: n.resolved,
            label: n.label,
            type: n.type,
            x: n.x,
            y: n.y,
            ...(n.details ? { details: n.details } : {}),
            ...(n.strategicAnswer ? { strategicAnswer: n.strategicAnswer } : {}),
          };
        });
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ nodeState }),
        }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const performCreateProject = useCallback((name: string, githubRepo?: string, initialThought?: string) => {
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
          logProjectInitialized(p.id);
          const normalizedRepo = normalizeGitHubRepoInput(githubRepo);
          if (normalizedRepo) {
            void fetch(`/api/projects/${p.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ linkedRepo: serializeLinkedRepo({ fullName: normalizedRepo }) }),
            }).catch(() => {});
            if (/^https?:\/\//i.test(githubRepo ?? "")) {
              runRepoScan(p.id, githubRepo!.trim());
            }
          }
          if (initialThought?.trim()) {
            try { sessionStorage.setItem(`atlas-post-intake-${p.id}`, initialThought.trim()); } catch {}
          }
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
  }, [isFree, projects, createProject, queryClient, runRepoScan, setLocation, logProjectInitialized]);

  const requestNewProject = useCallback(() => {
    if (isFree && (projects?.length ?? 0) >= 1) {
      setShowUpgrade(true);
      return;
    }
    setCreateError(null);
    setShowNewProjectModal(true);
  }, [isFree, projects]);

  const navigateToProject = useCallback((projectId: number) => {
    setLocation(`/project/${projectId}`);
  }, [setLocation]);

  // ── Shell-dispatched sheet/drawer wiring ────────────────────────────────
  // UnifiedShell owns the persistent nav chrome and dispatches these events;
  // each page (Home, Workspace) independently renders the corresponding
  // sheet/drawer content.
  const [showDrawer, setShowDrawer] = useState(false);
  const [showShellSheet, setShowShellSheet] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [showParkSheet, setShowParkSheet] = useState(false);
  const [showTimeTravel, setShowTimeTravel] = useState(false);
  const [writeOverlayProjectId, setWriteOverlayProjectId] = useState<number | null>(null);

  useEffect(() => {
    const onProjectsDrawer = () => setShowDrawer(true);
    const onNavDrawer = () => setShowDrawer(true);
    const onAccountHub = () => setShowProfile(true);
    const onInvite = () => setShowInvite(true);
    const onShell = () => setShowShellSheet(true);
    window.addEventListener("axiom:open-projects-drawer", onProjectsDrawer);
    window.addEventListener("axiom:open-nav-drawer", onNavDrawer);
    window.addEventListener("axiom:open-account-hub", onAccountHub);
    window.addEventListener("axiom:open-invite", onInvite);
    window.addEventListener("axiom:open-shell", onShell);
    return () => {
      window.removeEventListener("axiom:open-projects-drawer", onProjectsDrawer);
      window.removeEventListener("axiom:open-nav-drawer", onNavDrawer);
      window.removeEventListener("axiom:open-account-hub", onAccountHub);
      window.removeEventListener("axiom:open-invite", onInvite);
      window.removeEventListener("axiom:open-shell", onShell);
    };
  }, []);

  const committedProjects = useMemo(
    () => projects.filter((p: Project) => (p as any).status === "committed"),
    [projects],
  );

  if (isLoading && projects.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        maxWidth: 1400,
        margin: "0 auto",
        padding: "24px 20px 140px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--app-font-mono)", fontSize: 20, fontWeight: 700, letterSpacing: "0.02em", color: "var(--atlas-fg)" }}>
            Your Projects
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--atlas-muted)" }}>
            Pick up a project, or start something new.
          </p>
        </div>
        <button
          type="button"
          onClick={requestNewProject}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "1px solid var(--atlas-gold)",
            background: "var(--atlas-gold)",
            color: "#0D0B09",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          New Project
        </button>
      </div>

      <BelowFoldDashboard
        projects={projects.map((p: Project) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          updatedAt: p.createdAt,
          latestSnapshotScore: p.latestSnapshotScore ?? null,
        }))}
        onOpenProject={navigateToProject}
        onOpenLedger={() => {
          const p = projects?.[0];
          if (p) setLocation(`/ledger/${p.id}`);
        }}
        onOpenParking={() => setLocation("/parking")}
        onCreateProject={requestNewProject}
        parkedCount={0}
        committedCount={0}
      />

      <NewProjectModal
        open={showNewProjectModal}
        onClose={() => { setShowNewProjectModal(false); setCreateError(null); }}
        onCreate={(name, repo, thought) => performCreateProject(name, repo, thought)}
        creating={createProject.isPending}
        error={createError}
      />

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} reason="project_limit" />}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
      {showProfile && <AccountHubPanel onClose={() => setShowProfile(false)} />}

      <ProjectsDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        projects={committedProjects.map((p: Project) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          latestSnapshotScore: p.latestSnapshotScore ?? null,
          status: (p as { status?: "shaping" | "committed" | "archived" }).status,
        }))}
        onOpenProject={navigateToProject}
        onNewProject={() => { setShowDrawer(false); requestNewProject(); }}
        onOpenLedger={(id) => setLocation(`/ledger/${id}`)}
        onOpenParking={() => setLocation("/parking")}
        onOpenSpecify={() => { setShowDrawer(false); window.dispatchEvent(new CustomEvent("axiom:open-specify")); }}
        onOpenWrite={() => {
          setShowDrawer(false);
          const target = committedProjects[0]?.id ?? projects[0]?.id ?? null;
          if (target != null) setWriteOverlayProjectId(target);
        }}
        onOpenShell={() => { setShowDrawer(false); setShowShellSheet(true); }}
        onSelectConversation={(id) => { setShowDrawer(false); setLocation(`/workspace/${id}`); }}
        userLabel={(() => { try { const r = localStorage.getItem("atlas-user-profile"); return r ? JSON.parse(r).name || null : null; } catch { return null; } })()}
      />

      <ShellLogSheet open={showShellSheet} onClose={() => setShowShellSheet(false)} />

      {writeOverlayProjectId != null && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Write"
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--atlas-bg, #0a0a0c)", display: "flex", flexDirection: "column" }}
        >
          <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", padding: "10px 14px" }}>
            <button
              type="button"
              onClick={() => setWriteOverlayProjectId(null)}
              aria-label="Close Write"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: "color-mix(in oklab, var(--atlas-gold) 8%, transparent)",
                border: "1px solid color-mix(in oklab, var(--atlas-gold) 28%, transparent)",
                color: "var(--atlas-gold)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={16} strokeWidth={1.7} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <WriteTab projectId={writeOverlayProjectId} isMobile />
          </div>
        </div>,
        document.body,
      )}

      {showVault && <VisualVault projectId={projects[0]?.id ?? undefined} onClose={() => setShowVault(false)} />}

      <HistoryBookmarksSheet
        projectId={projects[0]?.id ?? 0}
        open={showTimeTravel}
        onClose={() => setShowTimeTravel(false)}
      />

      {showParkSheet && (
        <ParkSheet
          projectId={projects[0]?.id ?? null}
          projects={projects.map((p: Project) => ({ id: p.id, name: p.name }))}
          onClose={() => setShowParkSheet(false)}
          onOpenFull={() => {
            setShowParkSheet(false);
            setLocation("/parking");
          }}
        />
      )}

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60 }}>
        <UnifiedContextDock
          mode="ambient"
          onAtlasCore={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          onProjects={() => setLocation("/projects")}
          onDecisions={() => setLocation("/ledger")}
          onYou={() => setShowProfile(true)}
          onMap={() => setLocation("/map")}
          onFiles={() => setShowDrawer(true)}
          onSpecify={() => window.dispatchEvent(new CustomEvent("axiom:open-specify"))}
        />
      </div>
    </div>
  );
}
