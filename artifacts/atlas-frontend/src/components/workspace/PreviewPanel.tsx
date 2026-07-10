import { useState, useEffect, useMemo, useRef } from "react";
import { useWorkspaceEvent } from "@/lib/workspaceEventBus";
import { createPortal } from "react-dom";
import { useGetProject, getGetProjectQueryKey, updateProject, useUpdateProject } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { LoadingSpinner } from "../ui/loading-spinner";
import { parseLinkedRepo } from "@/lib/githubRepo";
import { useIsMobile } from "@/hooks/useBreakpoints";
import { useStageArtifact } from "@/hooks/useComposerVisibility";
import { useApplicationModel } from "@/hooks/useApplicationModel";
import { cacheScannedRoutes, detectRouterType, scanRoutesFromSource, type RouterType } from "@/lib/scanRoutes";

export type ManifestDecision = {
  firstArtifact: { name: string; description: string; steps: string[] };
  activeEngine: string;
  suggestedEngine: string;
  engineReason: string;
  complexity: "low" | "medium" | "high";
  deploymentRequired: boolean;
};

type PreviewRoute = { label: string; path: string; description?: string };

function routeLabelFromPath(path: string): string {
  if (path === "/") return "Home";
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeRoutePath(route?: string | null, fallbackName?: string): string {
  const raw = route?.trim();
  if (raw) return raw.startsWith("/") ? raw : `/${raw}`;
  const name = fallbackName?.trim().toLowerCase() ?? "";
  if (!name || name === "home" || name === "index" || name === "landing") return "/";
  return `/${name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function buildPreviewTarget(base: string, route: string, routerType: RouterType): string {
  const path = route.startsWith("/") ? route : `/${route}`;
  try {
    const url = new URL(base, window.location.origin);
    if (routerType === "hash") {
      return `${url.origin}${url.pathname}#${path}`;
    }
    if (path === "/") return url.toString();
    url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
    return url.toString();
  } catch {
    if (routerType === "hash") return `${base.replace(/#.*$/, "")}#${path}`;
    return path === "/" ? base : `${base.replace(/\/$/, "")}${path}`;
  }
}

function RoutePickerButton({ routes, selected, onSelect }: {
  routes: PreviewRoute[];
  selected: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const updateRect = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 4, left: r.right, width: r.width });
    };
    updateRect();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open]);
  const current = routes.find((r) => r.path === selected) ?? routes[0];
  const label = current ? current.label : "Home";
  const sMono: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };
  const menuWidth = 200;
  const menu = open && rect ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        top: rect.top,
        left: Math.max(8, Math.min(rect.left - menuWidth, window.innerWidth - menuWidth - 8)),
        zIndex: 9999,
        width: menuWidth, maxHeight: 280, overflowY: "auto",
        background: "var(--atlas-surface)",
        border: "1px solid var(--atlas-border)",
        borderRadius: 6,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        padding: 4,
      }}
    >
      <div style={{ padding: "4px 8px", fontSize: 8.5, ...sMono, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.45 }}>
        Pages
      </div>
      {routes.length === 0 && (
        <div style={{ padding: "6px 8px", fontSize: 10, ...sMono, color: "var(--atlas-muted)", opacity: 0.55 }}>
          No pages detected
        </div>
      )}
      {routes.map((route) => {
        const active = route.path === selected;
        return (
          <button
            key={route.path}
            role="menuitem"
            type="button"
            onClick={() => { onSelect(route.path); setOpen(false); }}
            title={route.description || route.path}
            style={{
              display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
              gap: 8, padding: "6px 8px", borderRadius: 4,
              background: active ? "rgba(201,162,76,0.12)" : "transparent",
              border: "none",
              color: active ? "var(--atlas-gold)" : "var(--atlas-fg)",
              cursor: "pointer", fontSize: 10.5, ...sMono, letterSpacing: "0.02em",
              textAlign: "left",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{route.label}</span>
            <span style={{ fontSize: 9, opacity: 0.5 }}>{route.path}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  ) : null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Choose page"
        aria-label="Choose page"
        aria-expanded={open}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
          padding: "5px 8px", borderRadius: 5,
          background: "transparent",
          border: "1px solid var(--atlas-border)",
          color: "var(--atlas-muted)",
          fontSize: 9.5, ...sMono, letterSpacing: "0.04em",
          cursor: "pointer", maxWidth: 140, whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
      </button>
      {menu}
    </>
  );
}

export function PreviewPanel({ projectId, sandboxCode, onSandboxConsumed, refreshTrigger, rebuildTrigger, onWsRunningChange, sessionId, onSwitchToFiles, onOpenRuntime, manifestDecision, manifestPreviewHtml }: {
  projectId: number;
  sandboxCode?: string | null;
  onSandboxConsumed?: () => void;
  refreshTrigger?: number;
  rebuildTrigger?: number;
  onWsRunningChange?: (running: boolean) => void;
  sessionId?: number;
  onSwitchToFiles?: () => void;
  onOpenRuntime?: () => void;
  manifestDecision?: ManifestDecision | null;
  manifestPreviewHtml?: string | null;
}) {

  // Composer modes: Preview is a stage artifact — mobile=hidden, desktop=compact.
  useStageArtifact("preview");

  const queryClient = useQueryClient();
  const { data: project } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });
  const { model: applicationModel } = useApplicationModel(projectId);
  const updateProject = useUpdateProject();

  // Mode toggle
  const [previewMode, setPreviewMode] = useState<"url" | "sandbox" | "stackblitz" | "local" | "generated">("url");
  const [generatedPreviewUrl, setGeneratedPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setGeneratedPreviewUrl(null);
      return;
    }
    setGeneratedPreviewUrl(`/api/preview/session/${sessionId}`);
  }, [sessionId]);

  useEffect(() => {
    if (generatedPreviewUrl) {
      setPreviewMode("generated");
    }
  }, [generatedPreviewUrl]);

  // ── Artifact gallery ──────────────────────────────────────────────────────
  type ProjectArtifact = {
    id: number;
    projectId: number;
    type: string;
    version: number;
    title: string;
    metadata: Record<string, unknown>;
    payload: Record<string, unknown>;
    createdAt: string;
  };

  const { data: artifactsData, isLoading: artifactsLoading, refetch: refetchArtifacts } = useQuery({
    queryKey: ["project-artifacts", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/artifacts`);
      if (!res.ok) throw new Error("Failed to load artifacts");
      return res.json() as Promise<{ artifacts: ProjectArtifact[] }>;
    },
    enabled: previewMode === "generated",
    staleTime: 20_000,
    refetchInterval: previewMode === "generated" ? 15_000 : false,
  });

  const artifacts = artifactsData?.artifacts ?? [];
  const [expandedArtifactId, setExpandedArtifactId] = useState<number | null>(null);
  const [artifactBucket, setArtifactBucket] = useState<string>("all");

  // Group each artifact type into a coarse bucket for the filter chips.
  const bucketOf = (t: string): "history" | "sketch" | "build" | "design" | "preview" | "other" => {
    if (t.startsWith("history") || t.includes("message") || t.includes("response") || t.includes("thought")) return "history";
    if (t === "visual_sketch" || t === "pipeline_sketch" || t.includes("sketch")) return "sketch";
    if (t === "build_output" || t.includes("build")) return "build";
    if (t === "design_plan" || t === "blueprint_snapshot") return "design";
    if (t === "html_preview" || t === "html" || t === "landing_draft" || t === "export_package") return "preview";
    return "other";
  };

  // Device switcher
  type DeviceSize = "phone" | "tablet" | "desktop";
  const [deviceSize, setDeviceSize] = useState<DeviceSize>(() => {
    // Default to "phone" on small screens so the iframe renders at a real
    // mobile viewport (390px) instead of a 1440px desktop layout scaled to ~36%.
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 768px)").matches) return "phone";
    return "desktop";
  });
  const [isLandscape, setIsLandscape] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sandbox state
  const [sandboxInput, setSandboxInput] = useState("");
  const [sandboxRendered, setSandboxRendered] = useState<string | null>(null);
  const [sandboxExpanded, setSandboxExpanded] = useState(false);
  // When a persisted HTML deliverable is flagged incomplete/unsafe, hold it here
  // instead of auto-rendering — the user sees a review banner with a Render action.
  const [pendingReview, setPendingReview] = useState<{ content: string; reasons: string[] } | null>(null);

  // ── URL mode state ──────────────────────────────────────────────────────────
  const storageKey = `atlas-preview-${projectId}`;
  const [urlInput, setUrlInput] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("/");
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectResults, setDetectResults] = useState<Array<{ url: string; platform: string; confidence: string }>>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [savedIndicator, setSavedIndicator] = useState(false);
  // URL-mode chrome collapse + status auto-hide
  const [chromeVisible, setChromeVisible] = useState(true);
  const [statusVisible, setStatusVisible] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const deviceBtnRef = useRef<HTMLButtonElement | null>(null);
  const [deviceMenuPos, setDeviceMenuPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!deviceMenuOpen) return;
    const update = () => {
      const r = deviceBtnRef.current?.getBoundingClientRect();
      if (r) setDeviceMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [deviceMenuOpen]);
  const [detectMenuOpen, setDetectMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const [mobileFullscreen, setMobileFullscreen] = useState(false);
  const [contentFullscreen, setContentFullscreen] = useState(false);
  const [cachedScanRoutes, setCachedScanRoutes] = useState<PreviewRoute[]>([]);
  const [routerType, setRouterType] = useState<RouterType>("browser");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const scanKey = `atlas-scan-${projectId}`;
    const loadCachedScanRoutes = () => {
      try {
        const raw = localStorage.getItem(scanKey);
        const scan = raw ? JSON.parse(raw) as { routes?: string[]; pages?: string[]; routerType?: RouterType } : null;
        const routes = Array.isArray(scan?.routes) ? scan.routes : [];
        setCachedScanRoutes(routes.map((route) => {
          const path = normalizeRoutePath(route);
          return { label: routeLabelFromPath(path), path, description: path };
        }));
        if (scan?.routerType === "hash" || scan?.routerType === "browser") {
          setRouterType(scan.routerType);
        }
      } catch {
        setCachedScanRoutes([]);
      }
    };
    loadCachedScanRoutes();
    const onStorage = (e: StorageEvent) => {
      if (e.key === scanKey || e.key === null) loadCachedScanRoutes();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [projectId, previewMode]);
  const previewRoutes = useMemo<PreviewRoute[]>(() => {
    const seen = new Set<string>();
    const routes: PreviewRoute[] = [{ label: "Home", path: "/" }];
    seen.add("/");
    for (const page of applicationModel?.pages ?? []) {
      const path = normalizeRoutePath(page.route, page.name);
      if (seen.has(path)) continue;
      seen.add(path);
      routes.push({ label: page.name || path, path, description: page.description });
    }
    for (const route of cachedScanRoutes) {
      if (seen.has(route.path)) continue;
      seen.add(route.path);
      routes.push(route);
    }
    return routes;
  }, [applicationModel?.pages, cachedScanRoutes]);

  useEffect(() => {
    if (!previewRoutes.some((route) => route.path === selectedRoute)) setSelectedRoute("/");
  }, [previewRoutes, selectedRoute]);
  useEffect(() => {
    if (!mobileFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileFullscreen(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileFullscreen]);

  useEffect(() => {
    if (!contentFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContentFullscreen(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [contentFullscreen]);

  // ── Devserver state ──────────────────────────────────────────────────────────
  type DsStatus = "idle" | "cloning" | "installing" | "starting" | "running" | "error";
  const [dsStatus, setDsStatus] = useState<DsStatus>("idle");
  const [dsLogs, setDsLogs] = useState<string[]>([]);
  const [dsPort, setDsPort] = useState<number | null>(null);
  const [dsErrorMsg, setDsErrorMsg] = useState<string | null>(null);
  const [dsStarting, setDsStarting] = useState(false);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [devEnvVars, setDevEnvVars] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const dsLogsEndRef = useRef<HTMLDivElement>(null);

  // Poll status while active
  useEffect(() => {
    if ((previewMode as string) !== "local" || dsStatus === "idle") return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch("/api/devserver/status", { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json() as { status: string; port: number | null; logs: string[]; errorMsg: string | null };
        setDsStatus(d.status as DsStatus);
        setDsLogs(d.logs);
        setDsPort(d.port);
        setDsErrorMsg(d.errorMsg);
      } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, [previewMode, dsStatus]);

  // Auto-scroll logs
  useEffect(() => {
    dsLogsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dsLogs]);

  const handleDsStart = async () => {
    if (!linkedRepo) return;
    setDsStarting(true);
    setDsLogs([]);
    setDsErrorMsg(null);
    const token = project?.githubToken ?? "__server__";
    const envVars = devEnvVars
      .filter(({ key }) => key.trim())
      .reduce<Record<string, string>>((acc, { key, value }) => {
        acc[key.trim()] = value;
        return acc;
      }, {});
    try {
      const r = await fetch("/api/devserver/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-github-token": token },
        credentials: "include",
        body: JSON.stringify({ repoFullName: linkedRepo.fullName, branch: linkedRepo.defaultBranch ?? "main", envVars }),
      });
      const d = await r.json() as { status?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Failed to start");
      setDsStatus((d.status ?? "cloning") as DsStatus);
    } catch (e) {
      setDsErrorMsg(e instanceof Error ? e.message : "Start failed");
      setDsStatus("error");
    } finally {
      setDsStarting(false);
    }
  };

  const handleDsStop = async () => {
    await fetch("/api/devserver/stop", { method: "POST", credentials: "include" });
    setDsStatus("idle");
    setDsLogs([]);
    setDsPort(null);
    setDsErrorMsg(null);
  };

  const DS_STAGE_LABELS: Record<DsStatus, string> = {
    idle: "Idle",
    cloning: "Cloning repo…",
    installing: "Installing dependencies…",
    starting: "Starting dev server…",
    running: "Running",
    error: "Error",
  };
  const DS_STAGE_PROGRESS: Record<DsStatus, number> = {
    idle: 0, cloning: 20, installing: 50, starting: 80, running: 100, error: 0,
  };
  const devError = dsErrorMsg;

  // ── Workspace devserver state (local workspace projects, no GitHub required) ──
  type WsDsStatus = "idle" | "installing" | "starting" | "running" | "error";
  const [wsDsStatus, setWsDsStatus] = useState<WsDsStatus>("idle");
  const [wsDsPort, setWsDsPort] = useState<number | null>(null);
  const [wsDsLogs, setWsDsLogs] = useState<string[]>([]);
  const [wsDsErrorMsg, setWsDsErrorMsg] = useState<string | null>(null);
  // null = not yet checked, true = package.json found, false = no scaffold (visual artifact only)
  const [hasScaffold, setHasScaffold] = useState<boolean | null>(null);
  const [wsDsStarting, setWsDsStarting] = useState(false);
  const wsDsLogsEndRef = useRef<HTMLDivElement>(null);
  // Browser console errors captured from the proxied iframe via postMessage
  const [browserErrors, setBrowserErrors] = useState<string[]>([]);
  const [showLogsWhileRunning, setShowLogsWhileRunning] = useState(false);

  // Poll workspace devserver status for this project (no sessionId gate — Runtime
  // tab may have started the server independently of any chat session).
  const hasAutoSwitchedToLocal = useRef(false);
  useEffect(() => {
    hasAutoSwitchedToLocal.current = false;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/devserver/workspace/${projectId}/status`, { credentials: "include" });
        if (!r.ok || cancelled) return;
        const d = await r.json() as { status: WsDsStatus; port: number | null; logs: string[]; errorMsg: string | null; hasScaffold?: boolean };
        if (cancelled) return;
        setWsDsStatus(d.status);
        setWsDsPort(d.port);
        setWsDsLogs(d.logs);
        setWsDsErrorMsg(d.errorMsg);
        if (d.hasScaffold !== undefined) setHasScaffold(d.hasScaffold);
        // Auto-switch to LOCAL DEV only once when the server first becomes running.
        // After that the user can freely switch tabs — do not yank them back on
        // every subsequent poll.
        if (d.status === "running" && !hasAutoSwitchedToLocal.current) {
          hasAutoSwitchedToLocal.current = true;
          setPreviewMode("local");
        }
        // Reset the flag when the server stops so the next start auto-switches again.
        if (d.status !== "running") {
          hasAutoSwitchedToLocal.current = false;
        }
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [projectId]);

  // Auto-scroll workspace logs
  useEffect(() => {
    wsDsLogsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [wsDsLogs]);

  // Notify parent when workspace running state changes (so it can gate auto-rebuild)
  useEffect(() => {
    onWsRunningChange?.(wsDsStatus === "running");
  }, [wsDsStatus, onWsRunningChange]);

  // After a workspace build completes, scan App.tsx routes from the local fs API.
  const prevWsDsStatusRef = useRef<WsDsStatus>("idle");
  useEffect(() => {
    const prev = prevWsDsStatusRef.current;
    prevWsDsStatusRef.current = wsDsStatus;
    if (wsDsStatus !== "running" || prev === "running") return;
    const appPaths = ["src/App.tsx", "src/App.jsx", "App.tsx", "App.jsx"];
    void (async () => {
      for (const path of appPaths) {
        try {
          const r = await fetch(`/api/fs/${projectId}/file?path=${encodeURIComponent(path)}`, { credentials: "include" });
          if (!r.ok) continue;
          const d = await r.json() as { content?: string };
          if (d.content) {
            cacheScannedRoutes(String(projectId), scanRoutesFromSource(d.content), detectRouterType(d.content));
            break;
          }
        } catch { /* non-fatal */ }
      }
    })();
  }, [wsDsStatus, projectId]);

  // Auto-rebuild when parent signals new files have been written (rebuildTrigger increments)
  const prevRebuildTrigger = useRef(rebuildTrigger ?? 0);
  useEffect(() => {
    const cur = rebuildTrigger ?? 0;
    if (cur > prevRebuildTrigger.current) {
      prevRebuildTrigger.current = cur;
      // Only auto-rebuild if the workspace has been built at least once
      if (wsDsStatus === "running" || wsDsStatus === "error" || wsDsPort !== null) {
        void handleWsDsStart();
      }
    }
  // handleWsDsStart intentionally omitted — it's stable and including it would loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebuildTrigger]);

  // Capture browser JS errors from the proxied iframe via postMessage
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data && typeof ev.data === "object" && ev.data.__atlasConsole === "error") {
        const msg = String(ev.data.msg ?? "").trim();
        if (msg) setBrowserErrors(prev => [...prev.slice(-49), `[browser] ${msg}`]);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Clear browser errors when the iframe reloads (port changes)
  useEffect(() => { setBrowserErrors([]); }, [wsDsPort]);

  const WS_DS_LABELS: Record<WsDsStatus, string> = {
    idle: "Idle", installing: "Installing…", starting: "Starting…", running: "Running", error: "Error",
  };
  const WS_DS_PROGRESS: Record<WsDsStatus, number> = {
    idle: 0, installing: 40, starting: 75, running: 100, error: 0,
  };

  const handleWsDsStart = async () => {
    setWsDsStarting(true);
    setWsDsLogs([]);
    setWsDsErrorMsg(null);
    try {
      const r = await fetch(`/api/devserver/workspace/${projectId}/start`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json() as { status?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Failed to start");
      setWsDsStatus((d.status ?? "installing") as WsDsStatus);
    } catch (e) {
      setWsDsErrorMsg(e instanceof Error ? e.message : "Start failed");
      setWsDsStatus("error");
    } finally {
      setWsDsStarting(false);
    }
  };

  const handleWsDsStop = async () => {
    await fetch(`/api/devserver/workspace/${projectId}/stop`, { method: "POST", credentials: "include" });
    setWsDsStatus("idle");
    setWsDsPort(null);
    setWsDsLogs([]);
    setWsDsErrorMsg(null);
  };

  // Sync external refresh trigger (from push success) into local reloadKey
  const prevRefreshTrigger = useRef(refreshTrigger ?? 0);
  useEffect(() => {
    if ((refreshTrigger ?? 0) > prevRefreshTrigger.current) {
      prevRefreshTrigger.current = refreshTrigger ?? 0;
      setIframeLoading(true);
      setIframeError(false);
      setReloadKey((k) => k + 1);
    }
  }, [refreshTrigger]);
  const [autoDetected, setAutoDetected] = useState<{ url: string; platform: string } | null>(null);
  const autoDetectTriedRef = useRef<string | null>(null);

  const { data: previewProject } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });
  const linkedRepo = parseLinkedRepo(previewProject?.linkedRepo);
  // Auto-switch to StackBlitz when a repo is linked and no live URL is saved
  useEffect(() => {
    if (linkedRepo && !liveUrl) {
      setPreviewMode("stackblitz");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedRepo?.fullName]);
  const token = previewProject?.githubToken ?? null;


  // ── Sandbox handoff from chat ────────────────────────────────────────────────
  const buildSrcdoc = (code: string): string => {
    const t = code.trim();
    // Already a full HTML doc
    if (/^\s*<!DOCTYPE/i.test(t) || /^\s*<html/i.test(t)) return t;

    // Detect React/JSX: has imports from react, JSX syntax, or export default function
    const isReact = /from\s+['"]react['"]|useState|useEffect|export\s+default\s+function|export\s+default\s+class|<[A-Z][A-Za-z]*[\s/>]/.test(t);

    if (isReact) {
      // Capture which function/class was the default export before stripping
      const exportMatch = t.match(/export\s+default\s+(?:function|class)\s+([A-Z]\w*)/);
      // Also handle: export default SomeName; at end of file
      const namedExportMatch = t.match(/export\s+default\s+([A-Z]\w*)\s*;/);
      const mainComponent = exportMatch?.[1] ?? namedExportMatch?.[1];

      let processed = t
        // Strip all import lines
        .replace(/^import\s+.*?\n/gm, "")
        // Remove export default from function/class declaration
        .replace(/export\s+default\s+(function|class)\s+/g, "$1 ")
        // Remove standalone export default SomeName;
        .replace(/export\s+default\s+[A-Z]\w*\s*;\s*/g, "");

      // If we couldn't find a named export, find the last uppercase function as fallback
      const fallback = mainComponent ?? [...processed.matchAll(/function\s+([A-Z]\w*)\s*\(/g)].pop()?.[1];

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>*, *::before, *::after { box-sizing: border-box; } body { margin: 0; padding: 0; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useCallback, useRef, useMemo, useContext, createContext } = React;
    const useNavigate = () => () => {};
    const useLocation = () => ({ pathname: "/" });
    const useParams = () => ({});
    const Link = ({ children, to, className, style, onClick }) => (
      <a href={to ?? "#"} className={className} style={style} onClick={onClick}>{children}</a>
    );

    ${processed}

    ${fallback ? `ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(${fallback}));` : ""}
  <\/script>
</body>
</html>`;
    }

    // Plain HTML
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>*, *::before, *::after { box-sizing: border-box; } body { margin: 0; padding: 0; }</style>
</head>
<body>
${t}
</body>
</html>`;
  };
  // Persist sandbox code per-project so generated previews survive hard refresh.
  const sandboxStorageKey = `atlas-sandbox-${projectId}`;
  useEffect(() => {
    if (!sandboxCode) return;
    setSandboxInput(sandboxCode);
    setSandboxRendered(buildSrcdoc(sandboxCode));
    setSandboxExpanded(false);
    try { localStorage.setItem(sandboxStorageKey, sandboxCode); } catch {}
    onSandboxConsumed?.();
    // Only auto-switch to Draft when there's no real project running.
    // If Local Dev is active (or becoming active), keep the user there —
    // Draft is for HTML sketches and visual artifacts, not the built app.
    const hasRealProject = wsDsStatus === "running" || wsDsStatus === "starting" || wsDsStatus === "installing" || liveUrl;
    if (!hasRealProject) {
      setPreviewMode("sandbox");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxCode]);

  // Rehydrate sandbox on mount / project switch.
  useEffect(() => {
    if (sandboxCode) return; // incoming prop wins
    try {
      const saved = localStorage.getItem(sandboxStorageKey);
      if (saved) {
        setSandboxInput(saved);
        setSandboxRendered(buildSrcdoc(saved));
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Listen for auto-routed preview artifacts emitted by useChatStream when
  // Atlas generates a FILE_EDIT at preview/output.html. Mirrors the sandboxCode
  // prop path so Draft auto-populates without user copy-paste.
  useEffect(() => {
    const handler = (ev: Event) => {
      const { content, needsReview, reasons } = (ev as CustomEvent<{ content: string; needsReview?: boolean; reasons?: string[] }>).detail ?? {};
      if (!content) return;
      setSandboxInput(content);
      const hasRealProject = wsDsStatus === "running" || wsDsStatus === "starting" || wsDsStatus === "installing" || liveUrl;
      if (needsReview) {
        // Hold instead of auto-rendering — show a review banner + explicit Render action.
        setPendingReview({ content, reasons: reasons ?? [] });
        setSandboxRendered(null);
      } else {
        setPendingReview(null);
        setSandboxRendered(buildSrcdoc(content));
      }
      setSandboxExpanded(false);
      try { localStorage.setItem(sandboxStorageKey, content); } catch {}
      if (!hasRealProject) setPreviewMode("sandbox");
    };
    window.addEventListener("axiom:preview-artifact", handler);
    return () => window.removeEventListener("axiom:preview-artifact", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsDsStatus, liveUrl]);

  // Bus-based subscriber for preview-code — parallel path to the DOM event so
  // components that emit via the bus (not window.dispatchEvent) also update the panel.
  useWorkspaceEvent("preview-code", ({ code }) => {
    if (!code) return;
    setSandboxInput(code);
    setSandboxRendered(buildSrcdoc(code));
    setSandboxExpanded(false);
    try { localStorage.setItem(sandboxStorageKey, code); } catch {}
    const hasRealProject = wsDsStatus === "running" || wsDsStatus === "starting" || wsDsStatus === "installing" || liveUrl;
    if (!hasRealProject) setPreviewMode("sandbox");
  }, [wsDsStatus, liveUrl, sandboxStorageKey]);

  // Refetch artifacts gallery when useChatStream persists a new html_preview.
  useEffect(() => {
    const handler = () => { void refetchArtifacts(); };
    window.addEventListener("axiom:artifact-saved", handler);
    return () => window.removeEventListener("axiom:artifact-saved", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "axiom:preview-set-mode" — dispatched by the workspace when a Run Card
  // requests a specific preview source (sandbox/url/local/generated).
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ source?: "sandbox" | "url" | "local" | "generated" }>).detail ?? {};
      if (!detail.source) return;
      setPreviewMode(detail.source);
      setEmptyState(null); // clear banner if a real source was chosen
    };
    window.addEventListener("axiom:preview-set-mode", handler);
    return () => window.removeEventListener("axiom:preview-set-mode", handler);
  }, []);

  // "axiom:preview-empty-state" — dispatched by the workspace when a Run Card's
  // Preview button was tapped but the run produced nothing previewable.
  const [emptyState, setEmptyState] = useState<{ reason: string; runId?: string; liveUrl?: string | null } | null>(null);
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ reason?: string; runId?: string; liveUrl?: string | null }>).detail ?? {};
      setEmptyState({
        reason: detail.reason ?? "NO_PREVIEWABLE_OUTPUT",
        runId: detail.runId,
        liveUrl: detail.liveUrl ?? null,
      });
    };
    window.addEventListener("axiom:preview-empty-state", handler);
    return () => window.removeEventListener("axiom:preview-empty-state", handler);
  }, []);


  // Sync from DB on project load / switch
  useEffect(() => {
    const dbUrl = project?.previewUrl ?? "";
    const legacyUrl = (() => { try { return localStorage.getItem(storageKey) || ""; } catch { return ""; } })();
    const resolved = dbUrl || legacyUrl;
    setUrlInput(resolved);
    setLiveUrl(resolved);
    setIframeError(false);
    setIframeLoading(!!resolved);
    setDetectResults([]);
    if (!resolved) setAutoDetected(null);
  }, [projectId, project?.previewUrl]);

  // ── Auto-detect URL when repo is linked and no URL saved yet ────────────────
  useEffect(() => {
    const repoKey = linkedRepo?.fullName ?? null;
    if (!repoKey || !token || liveUrl || detecting) return;
    if (autoDetectTriedRef.current === `${projectId}:${repoKey}`) return;
    autoDetectTriedRef.current = `${projectId}:${repoKey}`;
    const run = async () => {
      setDetecting(true);
      try {
        const res = await fetch(`/api/github/deployment?repo=${encodeURIComponent(repoKey)}`, {
          headers: { "x-github-token": token },
        });
        if (!res.ok) return;
        const data = await res.json() as {
          detected: Array<{ url: string; platform: string; confidence: string }>;
          suggestions: Array<{ url: string; platform: string; confidence: string }>;
        };
        // Surface everything as suggestions — never auto-save a URL the user
        // didn't explicitly connect. The user picks which one to apply.
        const all = [
          ...(data.detected ?? []),
          ...(data.suggestions ?? []).filter((s) => !data.detected?.find((d) => d.url === s.url)),
        ];
        if (all.length > 0) setDetectResults(all);
      } catch {}
      finally { setDetecting(false); }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedRepo?.fullName, token, liveUrl, projectId]);

  const normalize = (raw: string) =>
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

  const sMono: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };
  const workspacePreviewUrl = `/api/preview/workspace/${projectId}/`;

  const navigatePreviewToRoute = (route: string, baseUrl: string) => {
    const iframe = iframeRef.current;
    if (!iframe || !baseUrl) return;
    const target = buildPreviewTarget(baseUrl, route, routerType);
    try {
      iframe.contentWindow?.location.replace(target);
    } catch {
      iframe.src = target;
    }
  };

  const handleRouteSelect = (path: string) => {
    setSelectedRoute(path);
    setIframeError(false);
    if (previewMode === "url" && liveUrl) {
      navigatePreviewToRoute(path, liveUrl);
    } else if (previewMode === "local" && wsDsStatus === "running") {
      navigatePreviewToRoute(path, workspacePreviewUrl);
    }
  };
  const handlePreviewIframeLoad = (baseUrl: string) => {
    setIframeLoading(false);
    if (selectedRoute !== "/") navigatePreviewToRoute(selectedRoute, baseUrl);
  };
  const routePickerButton = (
    <RoutePickerButton routes={previewRoutes} selected={selectedRoute} onSelect={handleRouteSelect} />
  );


  const applyUrl = (url: string) => {
    const u = normalize(url);
    setUrlInput(u);
    setLiveUrl(u);
    setIframeError(false);
    setIframeLoading(true);
    setReloadKey((k) => k + 1);
    try { localStorage.setItem(storageKey, u); } catch {}
  };

  const handleGo = () => {
    const raw = urlInput.trim();
    if (!raw) return;
    setAutoDetected(null);
    const u = normalize(raw);
    applyUrl(u);
    // Persist immediately — Go means "use this URL for the project"
    updateProject.mutate(
      { id: projectId, data: { previewUrl: u } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          setSavedIndicator(true);
          setStatusVisible(true);
          setTimeout(() => setSavedIndicator(false), 2500);
        },
      },
    );
  };

  const handleSaveToProject = () => {
    if (!liveUrl) return;
    updateProject.mutate(
      { id: projectId, data: { previewUrl: liveUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          setSavedIndicator(true);
          setTimeout(() => setSavedIndicator(false), 2500);
        },
      }
    );
  };

  const handleClear = () => {
    setLiveUrl(""); setUrlInput(""); setIframeError(false); setIframeLoading(false);
    setDetectResults([]); setAutoDetected(null);
    autoDetectTriedRef.current = null;
    try { localStorage.removeItem(storageKey); } catch {}
    updateProject.mutate({ id: projectId, data: { previewUrl: null } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
    });
  };

  const handleDetect = async () => {
    if (!linkedRepo || !token) return;
    setDetecting(true);
    setDetectResults([]);
    try {
      const res = await fetch(`/api/github/deployment?repo=${encodeURIComponent(linkedRepo.fullName)}`, {
        headers: { "x-github-token": token },
      });
      if (res.ok) {
        const data = await res.json() as { detected: Array<{ url: string; platform: string; confidence: string }>; suggestions: Array<{ url: string; platform: string; confidence: string }> };
        const all = [...data.detected, ...data.suggestions.filter(s => !data.detected.find(d => d.url === s.url))];
        setDetectResults(all);
      }
    } catch {}
    setDetecting(false);
  };
  const platformColor = (p: string) => {
    if (p === "Vercel") return "var(--atlas-fg)";
    if (p === "Netlify") return "rgba(110,231,183,0.8)";
    if (p === "GitHub Pages") return "rgba(147,197,253,0.8)";
    if (p === "Replit") return "rgba(201,162,76,0.85)";
    return "var(--atlas-muted)";
  };


  // Device config — desktop renders at a real desktop width then scales down,
  // otherwise the iframe inherits the narrow panel width and the site responds
  // as mobile. Landscape on desktop = ultrawide (1920); portrait = standard 1440.
  const DEVICE_CONFIG = {
    phone:   { portrait: [390, 844],   landscape: [844, 390] },
    tablet:  { portrait: [768, 1024],  landscape: [1024, 768] },
    desktop: { portrait: [1440, 900],  landscape: [1920, 1080] },
  } as const;
  const orient = isLandscape ? "landscape" : "portrait";
  const [dW, dH] = DEVICE_CONFIG[deviceSize][orient];
  const scale = dW && containerW > 0 && containerW < dW + 24 ? (containerW - 24) / dW : 1;

  const deviceBtnStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 3, padding: "4px 7px", borderRadius: 4,
    background: active ? "rgba(201,162,76,0.12)" : "transparent",
    border: `1px solid ${active ? "rgba(201,162,76,0.3)" : "transparent"}`,
    color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
    fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.04em",
    cursor: "pointer", transition: "all 140ms ease", opacity: active ? 1 : 0.5,
  });

  // Device iframe wrapper — all three sizes render at their real viewport width
  // and get scaled to fit the panel, so responsive sites render the right layout.
  const deviceWrapperStyle: React.CSSProperties = {
    flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center",
    overflow: "auto",
    // Contain the scroll so mobile swipes don't propagate to the browser chrome
    // and trigger the URL-bar show/hide (which flickers the fixed tab bar).
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    padding: deviceSize === "desktop" ? "8px 6px" : "12px 8px",
    background: "rgba(0,0,0,0.18)",
  };
  const deviceInnerStyle: React.CSSProperties = {
    width: dW ?? undefined, height: dH ?? undefined,
    transform: `scale(${scale})`, transformOrigin: "top center",
    borderRadius: deviceSize === "desktop" ? 6 : 14,
    overflow: "hidden", flexShrink: 0,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.07), 0 8px 32px rgba(0,0,0,0.55)",
    background: "#fff",
  };

  const iconBtn: React.CSSProperties = {
    padding: "5px 7px", borderRadius: 5, background: "transparent",
    border: "1px solid var(--atlas-border)", color: "var(--atlas-muted)",
    fontSize: 11, cursor: "pointer", flexShrink: 0, lineHeight: 1,
    opacity: 0.7, transition: "opacity 160ms ease",
  };

  // Scroll-collapse the URL chrome when user scrolls the panel
  useEffect(() => {
    const el = containerRef.current;
    if (!el || previewMode !== "url") return;
    const onScroll = () => {
      const top = el.scrollTop;
      if (top > 8) { setChromeVisible(false); setStatusVisible(false); }
      else setChromeVisible(true);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [previewMode, liveUrl]);

  // Reveal Row 2 whenever new status data arrives
  useEffect(() => {
    if (autoDetected || savedIndicator || detectResults.length > 0) setStatusVisible(true);
  }, [autoDetected, savedIndicator, detectResults.length]);

  // Auto-hide Row 2 after 4s
  useEffect(() => {
    if (!statusVisible) return;
    const t = window.setTimeout(() => setStatusVisible(false), 4000);
    return () => window.clearTimeout(t);
  }, [statusVisible, autoDetected, savedIndicator, detectResults.length]);

  if (manifestPreviewHtml) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <iframe
          srcDoc={manifestPreviewHtml}
          style={{ width: "100%", flex: 1, border: "none", display: "block" }}
          sandbox="allow-scripts"
          title="Manifest Preview"
        />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Mode toggle */}
      <div style={{ position: "relative", flexShrink: 0, borderBottom: "1px solid var(--atlas-border)" }}>
        {/* left fade */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 20, pointerEvents: "none", zIndex: 1, background: "linear-gradient(to right, var(--atlas-bg), transparent)" }} />
        {/* right fade */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 20, pointerEvents: "none", zIndex: 1, background: "linear-gradient(to left, var(--atlas-bg), transparent)" }} />
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
        {(["url", "sandbox", "stackblitz", "local", "generated"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setPreviewMode(m)}
            style={{
              flexShrink: 0, minWidth: 80, padding: "7px 14px",
              background: "transparent", border: "none",
              borderBottom: previewMode === m ? "2px solid var(--atlas-gold)" : "2px solid transparent",
              color: previewMode === m ? "var(--atlas-gold)" : "var(--atlas-muted)",
              fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
              textTransform: "uppercase", cursor: "pointer",
              opacity: previewMode === m ? 1 : 0.45,
              transition: "all 140ms ease",
              position: "relative",
              whiteSpace: "nowrap",
            }}
          >
            {m === "url" ? "Live URL" : m === "sandbox" ? "Draft" : m === "stackblitz" ? "StackBlitz" : m === "local" ? "Local Dev" : "Artifacts"}
            {/* Dot indicator on Draft tab when it has content but isn't active */}
            {m === "sandbox" && sandboxRendered && previewMode !== "sandbox" && (
              <span style={{
                position: "absolute", top: 5, right: "calc(50% - 14px)",
                width: 4, height: 4, borderRadius: "50%",
                background: "rgba(201,162,76,0.7)", pointerEvents: "none",
              }} />
            )}
          </button>
        ))}
        </div>{/* end scroll container */}
      </div>{/* end mode toggle */}

      {/* Empty-state banner — shown when Preview was requested for a run with no previewable output. */}
      {emptyState && (
        <div style={{
          flexShrink: 0,
          margin: "8px 10px 0",
          padding: "10px 12px",
          border: "1px solid var(--atlas-border)",
          borderRadius: 8,
          background: "hsl(var(--card))",
          color: "hsl(var(--card-foreground))",
          position: "relative",
        }}>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setEmptyState(null)}
            style={{ position: "absolute", top: 6, right: 8, background: "transparent", border: "none", color: "var(--atlas-muted)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2 }}
          >×</button>
          <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--atlas-muted)", marginBottom: 4 }}>
            Nothing to preview yet
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 8, paddingRight: 18 }}>
            This run didn't produce a previewable artifact.{" "}
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 11, color: "var(--atlas-muted)" }}>
              ({emptyState.reason})
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {emptyState.runId && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("axiom:open-changes", { detail: { runId: emptyState.runId } }));
                  setEmptyState(null);
                }}
                style={{ padding: "5px 10px", fontSize: 11, border: "1px solid hsl(var(--border))", background: "transparent", color: "hsl(var(--card-foreground))", borderRadius: 5, cursor: "pointer", fontFamily: "inherit" }}
              >
                View Details
              </button>
            )}
            {emptyState.liveUrl && (
              <button
                type="button"
                onClick={() => {
                  setPreviewMode("url");
                  setEmptyState(null);
                }}
                style={{ padding: "5px 10px", fontSize: 11, border: "1px solid var(--atlas-gold-border)", background: "var(--atlas-gold-dim)", color: "var(--atlas-gold)", borderRadius: 5, cursor: "pointer", fontFamily: "inherit" }}
              >
                Open Live URL
              </button>
            )}
          </div>
        </div>
      )}


      {/* Device switcher — Sandbox mode: Edit-code toggle + Clear inline with device selector */}
      {previewMode === "sandbox" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0, position: "relative", zIndex: 5 }}>
          <button
            onClick={() => setSandboxExpanded((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--atlas-muted)", fontSize: 9.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.05em", padding: "0 2px", opacity: 0.75 }}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transition: "transform 140ms ease", transform: sandboxExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
              <path d="M2 1.5L6 4.5L2 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {sandboxExpanded ? "Hide code" : "Edit code"}
          </button>
          {sandboxRendered && (
            <button
              onClick={() => { setSandboxInput(""); setSandboxRendered(null); setSandboxExpanded(true); }}
              style={{ padding: "2px 7px", borderRadius: 4, background: "transparent", border: "1px solid var(--atlas-border)", color: "var(--atlas-muted)", fontSize: 9, fontFamily: "var(--app-font-mono)", cursor: "pointer", opacity: 0.55 }}
            >Clear</button>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ flexShrink: 0 }}>
            <button ref={deviceBtnRef} onClick={() => setDeviceMenuOpen((v) => !v)} title="Device size"
              style={{ ...iconBtn, padding: "5px 8px", display: "inline-flex", alignItems: "center", gap: 4, ...sMono }}>
              <span style={{ fontSize: 9.5, letterSpacing: "0.04em", textTransform: "capitalize" }}>{deviceSize}</span>
              <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
            </button>
          </div>
        </div>
      )}


      {/* ── URL mode ── */}
      {previewMode === "url" && (
        <>
          {/* Hairline pull-tab — only when chrome is hidden */}
          {!chromeVisible && (
            <button
              onClick={() => setChromeVisible(true)}
              aria-label="Show preview chrome"
              title="Show toolbar"
              style={{
                position: "relative", width: "100%", height: 4, padding: 0,
                border: "none", cursor: "pointer", flexShrink: 0,
                background: "linear-gradient(90deg, transparent, rgba(201,162,76,0.6), transparent)",
              }}
            />
          )}

          {/* Chrome wrapper (Row 1 + Row 2) — slides up on collapse */}
          <div
            style={{
              overflow: "hidden",
              maxHeight: chromeVisible ? 200 : 0,
              opacity: chromeVisible ? 1 : 0,
              transition: "max-height 240ms cubic-bezier(.32,.72,0,1), opacity 200ms ease",
              flexShrink: 0,
              borderBottom: chromeVisible ? "1px solid var(--atlas-border)" : "none",
            }}
          >
            {/* Row 1 — unified browser bar */}
            <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "7px 10px" }}>
              <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", minWidth: 0 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ position: "absolute", left: 8, opacity: 0.3, pointerEvents: "none" }}>
                  <circle cx="8" cy="8" r="6" stroke="var(--atlas-fg)" strokeWidth="1.4" />
                  <path d="M8 2c-2 3-2 9 0 12M2 8h12" stroke="var(--atlas-fg)" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGo()}
                  placeholder="Paste deployment URL…"
                  style={{
                    width: "100%", paddingLeft: 26, paddingRight: 8, paddingTop: 5, paddingBottom: 5,
                    borderRadius: 5, background: "var(--atlas-surface)",
                    border: "1px solid var(--atlas-border)",
                    color: "var(--atlas-fg)", fontSize: 10.5, ...sMono, outline: "none",
                    transition: "border-color 160ms ease",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(201,162,76,0.35)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--atlas-border)")}
                />
              </div>
              <button onClick={handleGo} style={{
                padding: "5px 10px", borderRadius: 5, background: "var(--atlas-ember)",
                border: "none", color: "var(--atlas-fg)", fontSize: 10, ...sMono,
                letterSpacing: "0.08em", cursor: "pointer", flexShrink: 0,
              }}>Go</button>

              {routePickerButton}

              {liveUrl && (
                <>
                  <button
                    onClick={() => { setIframeError(false); setIframeLoading(true); setReloadKey((k) => k + 1); }}
                    title="Reload" aria-label="Reload preview"
                    style={iconBtn}
                  >↺</button>
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer" title="Open in new tab"
                    style={{ ...iconBtn, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", ...sMono }}
                  >↗</a>
                </>
              )}

              {/* Device popover */}
              <div style={{ flexShrink: 0 }}>
                <button ref={deviceBtnRef} onClick={() => setDeviceMenuOpen((v) => !v)} title="Device size"
                  style={{ ...iconBtn, padding: "5px 8px", display: "inline-flex", alignItems: "center", gap: 4, ...sMono }}>
                  <span style={{ fontSize: 9.5, letterSpacing: "0.04em", textTransform: "capitalize" }}>{deviceSize}</span>
                  <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
                </button>
              </div>


              {/* Fullscreen / hide chrome */}
              <button onClick={() => { if (isMobile && liveUrl) setMobileFullscreen(true); else setChromeVisible((v) => !v); }}
                title={isMobile ? "Fullscreen" : (chromeVisible ? "Hide toolbar" : "Show toolbar")}
                aria-label="Toggle fullscreen preview"
                style={iconBtn}>⛶</button>

              {liveUrl && (
                <button onClick={handleClear} title="Clear" aria-label="Clear preview"
                  style={{ ...iconBtn, fontSize: 13, opacity: 0.5 }}>×</button>
              )}
            </div>

            

            {/* Row 2 — status strip (auto-hides after 4s) */}
            {(autoDetected || (linkedRepo && token) || detectResults.length > 0 || (liveUrl && !autoDetected)) && (
              <div style={{
                overflow: "visible",
                maxHeight: statusVisible ? 40 : 0,
                opacity: statusVisible ? 1 : 0,
                transition: "max-height 240ms cubic-bezier(.32,.72,0,1), opacity 200ms ease",
              }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "0 10px 7px", flexWrap: "nowrap" }}>
                  {autoDetected ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 4, background: "rgba(134,239,172,0.06)", border: "1px solid rgba(134,239,172,0.18)", flexShrink: 0 }}>
                      <span style={{ fontSize: 8, color: "rgba(134,239,172,0.7)" }}>✓</span>
                      <span style={{ fontSize: 9, ...sMono, color: "rgba(134,239,172,0.75)", letterSpacing: "0.06em" }}>Auto-detected · {autoDetected.platform}</span>
                      <button onClick={(e) => { e.stopPropagation(); setAutoDetected(null); autoDetectTriedRef.current = null; handleDetect(); setStatusVisible(true); }}
                        title="Re-run detection"
                        style={{ background: "transparent", border: "none", color: "rgba(134,239,172,0.45)", cursor: "pointer", fontSize: 10, padding: "0 0 0 3px", lineHeight: 1 }}>↺</button>
                    </div>
                  ) : linkedRepo && token ? (
                    <button onClick={() => { handleDetect(); setStatusVisible(true); }} disabled={detecting}
                      style={{ padding: "3px 9px", borderRadius: 4, fontSize: 9.5, ...sMono, letterSpacing: "0.08em", background: detecting ? "var(--atlas-glass-bg)" : "rgba(201,162,76,0.08)", border: "1px solid rgba(201,162,76,0.2)", color: detecting ? "var(--atlas-muted)" : "var(--atlas-gold)", cursor: detecting ? "not-allowed" : "pointer", flexShrink: 0 }}>
                      {detecting ? "Detecting…" : "Auto-detect URL"}
                    </button>
                  ) : null}

                  {detectResults.length > 0 && (
                    <SuggestionsDropdown
                      results={detectResults}
                      open={detectMenuOpen}
                      setOpen={setDetectMenuOpen}
                      onPick={(url) => {
                        applyUrl(url);
                        setDetectResults([]);
                        setDetectMenuOpen(false);
                        setStatusVisible(true);
                        // Persist the picked suggestion as the project URL
                        updateProject.mutate(
                          { id: projectId, data: { previewUrl: normalize(url) } },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
                              setSavedIndicator(true);
                              setTimeout(() => setSavedIndicator(false), 2500);
                            },
                          },
                        );
                      }}
                      platformColor={platformColor}
                      sMono={sMono}
                    />
                  )}

                  {liveUrl && (
                    <button onClick={() => { handleSaveToProject(); setStatusVisible(true); }} disabled={savedIndicator || updateProject.isPending || !!autoDetected}
                      style={{ marginLeft: "auto", padding: "3px 9px", borderRadius: 4, fontSize: 9.5, ...sMono, letterSpacing: "0.08em", background: (savedIndicator || autoDetected) ? "rgba(34,197,94,0.08)" : "var(--atlas-glass-bg)", border: `1px solid ${(savedIndicator || autoDetected) ? "rgba(34,197,94,0.2)" : "var(--atlas-border)"}`, color: (savedIndicator || autoDetected) ? "rgba(134,239,172,0.8)" : "var(--atlas-muted)", cursor: (savedIndicator || autoDetected) ? "default" : "pointer", flexShrink: 0, transition: "all 160ms ease" }}>
                      {savedIndicator || autoDetected ? "✓ Saved" : project?.previewUrl === liveUrl ? "Saved" : "Save to project"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div ref={containerRef} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {liveUrl && !iframeError ? (
            <div style={deviceWrapperStyle}>
              <div style={deviceInnerStyle}>
                {iframeLoading && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "var(--atlas-bg)", zIndex: 2 }}>
                    <LoadingSpinner size="sm" color="atlas" />
                    <div style={{ fontSize: 9.5, ...sMono, color: "var(--atlas-muted)", opacity: 0.4 }}>Loading preview…</div>
                  </div>
                )}
                <iframe ref={iframeRef} key={`${liveUrl}-${reloadKey}`} src={liveUrl} title="Preview"
                  style={{ border: "none", width: "100%", height: "100%", display: "block", background: "#fff" }}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  onLoad={() => handlePreviewIframeLoad(liveUrl)}
                  onError={() => { setIframeError(true); setIframeLoading(false); }}
                />
              </div>
            </div>
          ) : iframeError ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", gap: 12 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity={0.18}><circle cx="12" cy="12" r="9" stroke="var(--atlas-fg)" strokeWidth="1.4" /><path d="M12 8v4M12 16h.01" stroke="var(--atlas-fg)" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.5, textAlign: "center", lineHeight: 1.7 }}>This site blocks embedding.<br />Use the arrow to open it in a new tab.</div>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "6px 14px", borderRadius: 5, fontSize: 10, ...sMono, background: "rgba(201,162,76,0.1)", border: "1px solid rgba(201,162,76,0.25)", color: "var(--atlas-gold)", textDecoration: "none", letterSpacing: "0.08em" }}>Open in new tab ↗</a>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", gap: 12 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" opacity={0.12}><rect x="2" y="5" width="24" height="18" rx="2" stroke="var(--atlas-fg)" strokeWidth="1.5" /><path d="M2 10h24" stroke="var(--atlas-fg)" strokeWidth="1.5" /><circle cx="6" cy="7.5" r="1" fill="var(--atlas-fg)" /><circle cx="10" cy="7.5" r="1" fill="var(--atlas-fg)" /></svg>
              <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.4, textAlign: "center", lineHeight: 1.8 }}>
                {detecting
                  ? <>Searching for your live deployment…</>
                  : linkedRepo
                    ? <>Click <strong style={{ color: "var(--atlas-gold)", opacity: 0.8, fontWeight: 500 }}>Auto-detect URL</strong> to find<br />your live deployment automatically.</>
                    : <>Paste your deployment URL above,<br />or link a GitHub repo in Files<br />to auto-detect it.</>
                }
              </div>
              <div style={{ fontSize: 10, color: "var(--atlas-muted)", opacity: 0.25, textAlign: "center", lineHeight: 1.7, marginTop: 4, fontFamily: "var(--app-font-mono)" }}>
                This tab previews your live app URL.<br />To browse code files, use the Files tab.
              </div>
            </div>
          )}
          </div>

          {/* Mobile fullscreen portal */}
          {mobileFullscreen && liveUrl && typeof document !== "undefined" && createPortal(
            <div style={{
              position: "fixed", inset: 0, zIndex: 99999, background: "#000",
              display: "flex", flexDirection: "column",
            }}>
              {/* Top bar — sits above iframe, never overlaps content */}
              <div style={{
                flexShrink: 0,
                display: "flex", alignItems: "center", gap: 8,
                padding: "0 14px",
                height: "calc(env(safe-area-inset-top, 0px) + 40px)",
                paddingTop: "env(safe-area-inset-top, 0px)",
                background: "rgba(10,10,10,0.95)",
                borderBottom: "1px solid rgba(201,162,76,0.15)",
              }}>
                <button
                  onClick={() => setMobileFullscreen(false)}
                  aria-label="Exit fullscreen"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--atlas-muted, #888)",
                    fontSize: 11, fontFamily: "var(--app-font-mono)",
                    letterSpacing: "0.08em", padding: "4px 0",
                  }}
                >
                  <span style={{ fontSize: 13, lineHeight: 1 }}>←</span>
                  <span>Back to Workspace</span>
                </button>
              </div>
              <iframe
                  ref={iframeRef}
                  key={`fs-${liveUrl}-${reloadKey}`}
                  src={liveUrl}
                title="Preview fullscreen"
                style={{ border: "none", flex: 1, width: "100%", background: "#fff" }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            </div>,
            document.body
          )}
        </>
      )}

      {/* ── Sandbox mode ── */}
      {previewMode === "sandbox" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Code input area — header moved up into device row */}
          <div style={{ flexShrink: 0, borderBottom: sandboxExpanded ? "1px solid var(--atlas-border)" : "none" }}>

            {sandboxExpanded && (
              <div style={{ padding: "6px 8px 8px" }}>
                <textarea
                  value={sandboxInput}
                  onChange={(e) => setSandboxInput(e.target.value)}
                  placeholder="Paste HTML, CSS, or any component here…"
                  rows={6}
                  style={{
                    width: "100%", resize: "vertical", background: "var(--atlas-surface)",
                    border: "1px solid var(--atlas-border)", borderRadius: 6,
                    color: "var(--atlas-fg)", fontSize: 10.5, fontFamily: "var(--app-font-mono)",
                    lineHeight: 1.6, padding: "7px 9px", outline: "none",
                    transition: "border-color 160ms ease", boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(201,162,76,0.35)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--atlas-border)")}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <button
                    onClick={() => { if (sandboxInput.trim()) { setSandboxRendered(buildSrcdoc(sandboxInput)); setSandboxExpanded(false); } }}
                    disabled={!sandboxInput.trim()}
                    style={{ padding: "5px 12px", borderRadius: 5, background: sandboxInput.trim() ? "var(--atlas-ember)" : "var(--atlas-glass-bg)", border: "none", color: sandboxInput.trim() ? "var(--atlas-fg)" : "var(--atlas-muted)", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", cursor: sandboxInput.trim() ? "pointer" : "not-allowed", transition: "all 140ms ease" }}
                  >Render</button>
                  <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.28 }}>React + HTML · Tailwind included</span>
                </div>
              </div>
            )}
          </div>
          {/* Sandbox preview area — fills container, no device-frame constraint */}
          <div ref={containerRef} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {pendingReview ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", gap: 14, textAlign: "center" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" opacity={0.4}>
                  <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z" stroke="var(--atlas-ember)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ fontSize: 11.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", letterSpacing: "0.02em" }}>
                  Ready to review — Render when you're ready
                </div>
                {pendingReview.reasons.length > 0 && (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", lineHeight: 1.7, maxWidth: 380 }}>
                    {pendingReview.reasons.map((r, i) => <li key={i}>· {r}</li>)}
                  </ul>
                )}
                <button
                  onClick={() => {
                    setSandboxRendered(buildSrcdoc(pendingReview.content));
                    setPendingReview(null);
                  }}
                  style={{ padding: "6px 16px", borderRadius: 5, background: "var(--atlas-ember)", border: "none", color: "var(--atlas-fg)", fontSize: 10, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", cursor: "pointer", transition: "all 140ms ease" }}
                >Render</button>
              </div>
            ) : sandboxRendered ? (
              <div style={{ flex: 1, overflow: "hidden", background: "#fff" }}>
                <iframe
                  key={sandboxRendered.slice(0, 80)}
                  srcDoc={sandboxRendered}
                  title="Sandbox Preview"
                  sandbox="allow-scripts allow-same-origin"
                  style={{ border: "none", width: "100%", height: "100%", display: "block", background: "#fff" }}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", gap: 12 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity={0.12}>
                  <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" stroke="var(--atlas-fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.4, textAlign: "center", lineHeight: 1.8 }}>
                  Paste any HTML or React component above<br />and hit <strong style={{ color: "var(--atlas-gold)", opacity: 0.8, fontWeight: 500 }}>Render</strong> to preview it.
                </div>
                <div style={{ fontSize: 9.5, color: "var(--atlas-muted)", opacity: 0.22, textAlign: "center", lineHeight: 1.7, fontFamily: "var(--app-font-mono)" }}>
                  Or tap Preview on any code block in the chat<br />to send it here instantly.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {previewMode === "generated" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Gallery header */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--atlas-border)", background: "var(--atlas-surface)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", letterSpacing: "0.05em" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--atlas-gold)", display: "inline-block", boxShadow: "0 0 6px rgba(201,162,76,0.5)" }} />
              Atlas Generated
            </span>
            <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45 }}>
              {artifacts.length > 0 ? `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}` : ""}
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => refetchArtifacts()}
              title="Refresh"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px", color: "var(--atlas-muted)", fontSize: 10, fontFamily: "var(--app-font-mono)", borderRadius: 4, opacity: 0.45, transition: "opacity 140ms" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "0.45")}
            >
              ↻
            </button>
          </div>

          {/* Bucket chips */}
          {artifacts.length > 0 && (() => {
            const counts: Record<string, number> = { all: artifacts.length, history: 0, sketch: 0, build: 0, design: 0, preview: 0, other: 0 };
            for (const a of artifacts) counts[bucketOf(a.type)]++;
            const CHIPS: Array<{ id: string; label: string; color: string }> = [
              { id: "all",     label: "All",       color: "var(--atlas-gold)" },
              { id: "history", label: "History",   color: "rgba(180,180,190,0.85)" },
              { id: "sketch",  label: "Sketches",  color: "rgba(167,139,250,0.9)" },
              { id: "build",   label: "Builds",    color: "rgba(52,211,153,0.85)" },
              { id: "design",  label: "Design",    color: "var(--atlas-gold)" },
              { id: "preview", label: "Previews",  color: "rgba(251,191,36,0.85)" },
              { id: "other",   label: "Other",     color: "var(--atlas-muted)" },
            ].filter(c => c.id === "all" || counts[c.id] > 0);
            return (
              <div style={{ flexShrink: 0, display: "flex", gap: 5, padding: "6px 10px", borderBottom: "1px solid var(--atlas-border)", background: "var(--atlas-bg)", overflowX: "auto" }} className="scrollbar-none">
                {CHIPS.map(chip => {
                  const active = artifactBucket === chip.id;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => setArtifactBucket(chip.id)}
                      style={{
                        fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                        padding: "3px 8px", borderRadius: 10, cursor: "pointer", flexShrink: 0,
                        color: active ? chip.color : "var(--atlas-muted)",
                        background: active ? "rgba(0,0,0,0.35)" : "transparent",
                        border: `1px solid ${active ? chip.color : "var(--atlas-border)"}`,
                        opacity: active ? 1 : 0.55,
                        transition: "opacity 140ms, border-color 140ms",
                      }}
                    >
                      {chip.label} <span style={{ opacity: 0.5, marginLeft: 3 }}>{counts[chip.id]}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Gallery body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
            {artifactsLoading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 80 }}>
                <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35 }}>loading…</span>
              </div>
            )}

            {!artifactsLoading && artifacts.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 120, gap: 8, padding: "24px 16px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" opacity={0.1}>
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="var(--atlas-fg)" strokeWidth="1.5" />
                  <path d="M8 12h8M12 8v8" stroke="var(--atlas-fg)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.35, textAlign: "center", fontFamily: "var(--app-font-mono)", lineHeight: 1.7 }}>
                  No artifacts yet.
                  <br />
                  Commit a design plan, approve a blueprint,
                  <br />
                  or run a build to see them here.
                </div>
              </div>
            )}

            {!artifactsLoading && (() => {
              // Gallery renders in global reverse-chronological order (API returns DESC by created_at).
              // Type badge on every card; LATEST badge for the newest artifact of each type.

              type TypeCfg = { label: string; color: string; bg: string; border: string };
              const TYPE_CONFIG: Record<string, TypeCfg> = {
                design_plan:        { label: "DESIGN",    color: "var(--atlas-gold)",        bg: "rgba(201,162,76,0.08)",  border: "rgba(201,162,76,0.2)"  },
                blueprint_snapshot: { label: "BLUEPRINT", color: "rgba(96,165,250,0.9)",     bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.18)" },
                build_output:       { label: "BUILD",     color: "rgba(52,211,153,0.85)",    bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.18)" },
                visual_sketch:      { label: "SKETCH",    color: "rgba(167,139,250,0.85)",   bg: "rgba(167,139,250,0.06)",border: "rgba(167,139,250,0.18)"},
                pipeline_sketch:    { label: "SKETCH",    color: "rgba(167,139,250,0.85)",   bg: "rgba(167,139,250,0.06)",border: "rgba(167,139,250,0.18)"},
                landing_draft:      { label: "LANDING",   color: "rgba(251,146,60,0.85)",    bg: "rgba(251,146,60,0.06)", border: "rgba(251,146,60,0.18)" },
                export_package:     { label: "EXPORT",    color: "rgba(34,211,238,0.85)",    bg: "rgba(34,211,238,0.06)", border: "rgba(34,211,238,0.18)" },
                html_preview:       { label: "PREVIEW",   color: "rgba(251,191,36,0.85)",    bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.2)"  },
                html:               { label: "HTML",       color: "rgba(251,191,36,0.85)",    bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.2)"  },
              };

              // Latest id per type (first occurrence in DESC list = highest version)
              const latestIdByType: Record<string, number> = {};
              for (const a of artifacts) {
                if (!(a.type in latestIdByType)) latestIdByType[a.type] = a.id;
              }

              const relTime = (iso: string) => {
                const diff = Date.now() - new Date(iso).getTime();
                const mins = Math.floor(diff / 60000);
                const hrs = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);
                if (mins < 1) return "just now";
                if (mins < 60) return `${mins}m ago`;
                if (hrs < 24) return `${hrs}h ago`;
                return `${days}d ago`;
              };

              const visible = artifactBucket === "all" ? artifacts : artifacts.filter(a => bucketOf(a.type) === artifactBucket);
              if (visible.length === 0) {
                return (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.4 }}>
                    Nothing in this bucket yet.
                  </div>
                );
              }
              return visible.map(artifact => {
                const cfg = TYPE_CONFIG[artifact.type] ?? {
                  label: artifact.type.toUpperCase().slice(0, 8),
                  color: "var(--atlas-muted)", bg: "rgba(255,255,255,0.03)", border: "var(--atlas-border)",
                };
                const isExpanded = expandedArtifactId === artifact.id;
                const isLatest = latestIdByType[artifact.type] === artifact.id;
                const isBuild = artifact.type === "build_output";
                const isBlueprint = artifact.type === "blueprint_snapshot";
                const isDesignPlan = artifact.type === "design_plan";
                const isSketch = artifact.type === "visual_sketch";
                const isHtmlPreview = artifact.type === "html_preview";

                const dp = artifact.payload as Record<string, unknown>;
                const bpIdentity = (artifact.payload.identity as Record<string, unknown>) ?? {};
                const bpIntent   = (artifact.payload.intent   as Record<string, unknown>) ?? {};
                const bpPages    = (artifact.payload.pages    as Array<{ name?: string; purpose?: string }>) ?? [];
                const bpComps    = (artifact.payload.components as Array<{ name?: string }>) ?? [];
                const bpData     = (artifact.payload.data     as Record<string, unknown>) ?? {};
                const bpLogic    = (artifact.payload.logic    as unknown[]) ?? [];
                const bpCP       = (artifact.payload.creativePrinciples as string[]) ?? [];
                const bpEI       = (artifact.payload.experienceIntent   as Record<string, unknown>) ?? {};
                const fileCount  = isBuild ? (artifact.metadata.fileCount as number | undefined) : undefined;
                const buildAvailable = isBuild && wsDsStatus === "running";

                return (
                  <div key={artifact.id} style={{ display: "flex", flexDirection: "column" }}>
                    {/* Card header — click to expand */}
                    <div
                      onClick={() => setExpandedArtifactId(isExpanded ? null : artifact.id)}
                      style={{
                        background: cfg.bg,
                        border: `1px solid ${cfg.border}`,
                        borderRadius: isExpanded ? "6px 6px 0 0" : 6,
                        padding: "7px 10px",
                        display: "flex", flexDirection: "column", gap: 4,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {/* Type badge */}
                        <span style={{
                          fontSize: 7.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                          color: cfg.color, background: "rgba(0,0,0,0.25)", borderRadius: 3,
                          padding: "1px 5px", flexShrink: 0,
                        }}>
                          {cfg.label}
                        </span>
                        {/* Version */}
                        <span style={{ fontSize: 7.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.4, flexShrink: 0 }}>
                          v{artifact.version}
                        </span>
                        {/* Latest marker */}
                        {isLatest && (
                          <span style={{ fontSize: 7, fontFamily: "var(--app-font-mono)", color: cfg.color, opacity: 0.6, background: "rgba(0,0,0,0.2)", borderRadius: 2, padding: "0 4px", flexShrink: 0 }}>
                            LATEST
                          </span>
                        )}
                        <span style={{ fontSize: 10.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.85, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {artifact.title}
                        </span>
                        <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35, flexShrink: 0 }}>
                          {relTime(artifact.createdAt)}
                        </span>
                        <span style={{ fontSize: 7.5, color: "var(--atlas-muted)", opacity: 0.25, flexShrink: 0, marginLeft: 2 }}>
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>

                      {/* HTML preview — open in Draft */}
                      {isHtmlPreview && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              const html = artifact.payload.html as string | undefined;
                              if (!html) return;
                              setSandboxInput(html);
                              setSandboxRendered(buildSrcdoc(html));
                              setSandboxExpanded(false);
                              setPreviewMode("sandbox");
                            }}
                            style={{
                              fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                              color: "rgba(251,191,36,0.85)", background: "rgba(251,191,36,0.08)",
                              border: "1px solid rgba(251,191,36,0.2)", borderRadius: 3,
                              padding: "2px 7px", cursor: "pointer",
                            }}
                          >
                            Open in Draft
                          </button>
                        </div>
                      )}

                      {/* Build preview action row */}
                      {isBuild && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={e => e.stopPropagation()}>
                          {typeof fileCount === "number" && (
                            <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45 }}>
                              {fileCount} source files
                            </span>
                          )}
                          {buildAvailable ? (
                            <button
                              onClick={() => setPreviewMode("local")}
                              style={{
                                fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                                color: "rgba(52,211,153,0.8)", background: "rgba(52,211,153,0.08)",
                                border: "1px solid rgba(52,211,153,0.2)", borderRadius: 3,
                                padding: "2px 7px", cursor: "pointer",
                              }}
                            >
                              → Open Live Preview
                            </button>
                          ) : (
                            <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.28 }}>
                              preview unavailable — start Local Dev
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expanded full read-only payload panel */}
                    {isExpanded && (
                      <div style={{
                        background: "rgba(0,0,0,0.18)", border: `1px solid ${cfg.border}`, borderTop: "none",
                        borderRadius: "0 0 6px 6px", padding: "10px 12px",
                        display: "flex", flexDirection: "column", gap: 8,
                      }}>

                        {/* ── Design Plan: full committed body ── */}
                        {isDesignPlan && (
                          <>
                            {dp.navigationPattern   && <DetailRow label="Navigation"     value={String(dp.navigationPattern)} />}
                            {dp.componentPatterns   && <DetailRow label="Components"     value={String(dp.componentPatterns)} />}
                            {dp.motionPhilosophy    && <DetailRow label="Motion"         value={String(dp.motionPhilosophy)} />}
                            {dp.typographyScale     && <DetailRow label="Typography"     value={String(dp.typographyScale)} />}
                            {dp.colorStrategy       && <DetailRow label="Color"          value={String(dp.colorStrategy)} />}
                            {dp.cardDensity         && <DetailRow label="Card density"   value={String(dp.cardDensity)} />}
                            {dp.layoutArchetype     && <DetailRow label="Layout"         value={String(dp.layoutArchetype)} />}
                            {dp.dataDisplayStyle    && <DetailRow label="Data display"   value={String(dp.dataDisplayStyle)} />}
                            {(dp.responsiveIntent as Record<string, unknown>)?.mobile && (
                              <DetailRow label="Mobile intent" value={String((dp.responsiveIntent as Record<string, unknown>).mobile)} />
                            )}
                            {(dp.interactionPatterns as Record<string, unknown>)?.primaryAction && (
                              <DetailRow label="Primary action" value={String((dp.interactionPatterns as Record<string, unknown>).primaryAction)} />
                            )}
                            {(dp.interactionPatterns as Record<string, unknown>)?.feedbackStyle && (
                              <DetailRow label="Feedback style" value={String((dp.interactionPatterns as Record<string, unknown>).feedbackStyle)} />
                            )}
                            {Array.isArray(dp.informationHierarchy) && dp.informationHierarchy.length > 0 && (
                              <div>
                                <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>INFO HIERARCHY</span>
                                {(dp.informationHierarchy as string[]).map((h, i) => (
                                  <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>· {h}</div>
                                ))}
                              </div>
                            )}
                            {Array.isArray(dp.keyComponents) && dp.keyComponents.length > 0 && (
                              <div>
                                <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>KEY COMPONENTS</span>
                                {(dp.keyComponents as string[]).map((c, i) => (
                                  <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>· {c}</div>
                                ))}
                              </div>
                            )}
                            {dp.accessibilityNotes && <DetailRow label="Accessibility" value={String(dp.accessibilityNotes)} />}
                          </>
                        )}

                        {/* ── Blueprint Snapshot: full AM at approval ── */}
                        {isBlueprint && (
                          <>
                            {bpIdentity.name        && <DetailRow label="Project"      value={String(bpIdentity.name)} />}
                            {bpIdentity.tagline     && <DetailRow label="Tagline"      value={String(bpIdentity.tagline)} />}
                            {(bpIntent.summary as string | undefined) && <DetailRow label="Intent"  value={String(bpIntent.summary)} />}
                            {(bpIntent.primaryGoal as string | undefined) && <DetailRow label="Goal" value={String(bpIntent.primaryGoal)} />}
                            {(bpIntent.targetUser as string | undefined) && <DetailRow label="User"  value={String(bpIntent.targetUser)} />}
                            {bpPages.length > 0 && (
                              <div>
                                <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>PAGES ({bpPages.length})</span>
                                {bpPages.map((p, i) => (
                                  <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>
                                    · {p.name ?? "Untitled"}{p.purpose ? ` — ${p.purpose}` : ""}
                                  </div>
                                ))}
                              </div>
                            )}
                            {bpComps.length > 0 && (
                              <div>
                                <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>COMPONENTS ({bpComps.length})</span>
                                {bpComps.slice(0, 8).map((c, i) => (
                                  <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>· {c.name ?? "Unnamed"}</div>
                                ))}
                                {bpComps.length > 8 && <div style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.3, paddingLeft: 8 }}>+{bpComps.length - 8} more</div>}
                              </div>
                            )}
                            {Array.isArray((bpData as Record<string, unknown>).entities) && ((bpData as Record<string, unknown>).entities as unknown[]).length > 0 && (
                              <DetailRow label="Data entities" value={`${((bpData as Record<string, unknown>).entities as unknown[]).length} defined`} />
                            )}
                            {bpLogic.length > 0 && <DetailRow label="Logic rules" value={`${bpLogic.length} rules`} />}
                            {bpCP.length > 0 && (
                              <div>
                                <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>CREATIVE PRINCIPLES</span>
                                {bpCP.map((p, i) => (
                                  <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>· {p}</div>
                                ))}
                              </div>
                            )}
                            {(bpEI.tone as string | undefined) && <DetailRow label="Tone" value={String(bpEI.tone)} />}
                            {(bpEI.energyLevel as string | undefined) && <DetailRow label="Energy" value={String(bpEI.energyLevel)} />}
                            {(bpEI.interaction as string | undefined) && <DetailRow label="Interaction" value={String(bpEI.interaction)} />}
                            {artifact.payload.snapshotAt && (
                              <DetailRow label="Captured at" value={new Date(String(artifact.payload.snapshotAt)).toLocaleString()} />
                            )}
                          </>
                        )}

                        {/* ── Build Output ── */}
                        {isBuild && (
                          <>
                            {typeof fileCount === "number" && <DetailRow label="Source files" value={String(fileCount)} />}
                            {artifact.metadata.builtAt && <DetailRow label="Built at" value={new Date(String(artifact.metadata.builtAt)).toLocaleString()} />}
                            <DetailRow
                              label="Live preview"
                              value={buildAvailable
                                ? "Devserver is running — click Open Live Preview above"
                                : "Devserver is not running — start Local Dev to open this project"
                              }
                            />
                            <div style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.28, lineHeight: 1.6, marginTop: 2 }}>
                              Build records link to the project's live devserver. Historical per-build snapshots require an external artifact store.
                            </div>
                          </>
                        )}

                        {/* ── Visual Sketch ── */}
                        {isSketch && (
                          <>
                            {(artifact.payload.description as string | undefined) && (
                              <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, lineHeight: 1.7, borderLeft: `2px solid ${cfg.border}`, paddingLeft: 8 }}>
                                {String(artifact.payload.description)}
                              </div>
                            )}
                            {((artifact.payload.signals as Record<string, string[]> | undefined)?.emotionalRegister?.length ?? 0) > 0 && (
                              <DetailRow label="Emotional register" value={(artifact.payload.signals as Record<string, string[]>).emotionalRegister.join(", ")} />
                            )}
                            {((artifact.payload.signals as Record<string, string[]> | undefined)?.visualLanguage?.length ?? 0) > 0 && (
                              <DetailRow label="Visual language" value={(artifact.payload.signals as Record<string, string[]>).visualLanguage.join(", ")} />
                            )}
                            {((artifact.payload.signals as Record<string, string[]> | undefined)?.colorMood?.length ?? 0) > 0 && (
                              <DetailRow label="Color mood" value={(artifact.payload.signals as Record<string, string[]>).colorMood.join(", ")} />
                            )}
                            {((artifact.payload.signals as Record<string, string[]> | undefined)?.layoutApproach?.length ?? 0) > 0 && (
                              <DetailRow label="Layout" value={(artifact.payload.signals as Record<string, string[]>).layoutApproach.join(", ")} />
                            )}
                            {((artifact.payload.signals as Record<string, string[]> | undefined)?.typographyStyle?.length ?? 0) > 0 && (
                              <DetailRow label="Typography" value={(artifact.payload.signals as Record<string, string[]>).typographyStyle.join(", ")} />
                            )}
                            {artifact.metadata.analyzedAt && (
                              <DetailRow label="Analyzed at" value={new Date(String(artifact.metadata.analyzedAt)).toLocaleString()} />
                            )}
                          </>
                        )}

                        {/* ── Generic payload for landing_draft / export_package / unknown ── */}
                        {!isDesignPlan && !isBlueprint && !isBuild && !isSketch && (
                          <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.55, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
                            {JSON.stringify(artifact.payload, null, 2)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ── Local Dev mode ── */}
      {previewMode === "local" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Case 1: No workspace, no linked repo → prompt */}
          {!linkedRepo && hasScaffold === false && wsDsStatus === "idle" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", gap: 12 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" opacity={0.12}>
                <rect x="2" y="2" width="20" height="8" rx="2" stroke="var(--atlas-fg)" strokeWidth="1.5" />
                <rect x="2" y="14" width="20" height="8" rx="2" stroke="var(--atlas-fg)" strokeWidth="1.5" />
              </svg>
              <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.4, textAlign: "center", lineHeight: 1.8 }}>
                No runnable code yet. Ask Atlas to scaffold a project to get a live preview.
              </div>
            </div>
          )}

          {/* Case 2: Workspace project — workspace devserver (no GitHub link required) */}
          {!linkedRepo && (hasScaffold !== false || wsDsStatus !== "idle") && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Top bar */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--atlas-border)", background: "var(--atlas-surface)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: wsDsStatus === "running" ? "rgba(52,211,153,0.8)" : wsDsStatus === "error" ? "rgba(248,113,113,0.8)" : "var(--atlas-gold)", letterSpacing: "0.05em" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: wsDsStatus === "running" ? "rgba(52,211,153,0.8)" : wsDsStatus === "error" ? "rgba(248,113,113,0.8)" : "var(--atlas-gold)", display: "inline-block", boxShadow: `0 0 6px ${wsDsStatus === "running" ? "rgba(52,211,153,0.5)" : wsDsStatus === "error" ? "rgba(248,113,113,0.5)" : "rgba(201,162,76,0.5)"}` }} />
                  Local Dev · {WS_DS_LABELS[wsDsStatus]}
                </span>
                <div style={{ flex: 1 }} />
                {wsDsStatus === "running" && wsDsPort && (
                  <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.55, letterSpacing: "0.04em" }}>
                    :{wsDsPort}
                  </span>
                )}
              </div>

              {/* Progress bar while booting */}
              {wsDsStatus !== "idle" && wsDsStatus !== "running" && wsDsStatus !== "error" && (
                <div style={{ flexShrink: 0, height: 2, background: "var(--atlas-border)", width: "100%" }}>
                  <div style={{ height: "100%", width: `${WS_DS_PROGRESS[wsDsStatus]}%`, background: "var(--atlas-gold)", transition: "width 400ms ease" }} />
                </div>
              )}

              {/* No scaffold banner — shown before any run attempt when package.json is absent */}
              {hasScaffold === false && wsDsStatus === "idle" && (
                <div style={{ flexShrink: 0, padding: "10px 12px", borderBottom: "1px solid var(--atlas-border)", background: "rgba(201,162,76,0.05)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.8 }}>
                    Visual Artifact
                  </div>
                  <div style={{ fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.5 }}>
                    Atlas generated a visual preview — not a runnable project. No <code style={{ fontSize: 10, color: "var(--atlas-fg)", opacity: 0.6 }}>package.json</code> was emitted. Check the <strong style={{ color: "var(--atlas-fg)", opacity: 0.7 }}>Artifacts</strong> tab to see the output, or ask Atlas to "build a complete runnable project with package.json and Vite config" to get a Local Dev–ready scaffold.
                  </div>
                </div>
              )}

              {/* Controls — runtime is managed by the Runtime tab */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--atlas-border)" }}>
                {(wsDsStatus === "idle" || wsDsStatus === "error") && (
                  <button
                    onClick={onOpenRuntime}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 5, background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)", color: "var(--atlas-muted)", fontSize: 10, ...sMono, letterSpacing: "0.06em", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 10 }}>▶</span>
                    {wsDsStatus === "error" ? "Restart in Runtime tab" : "Start from Runtime tab"}
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {wsDsStatus === "running" && routePickerButton}
              </div>



              {/* Error banner */}
              {wsDsErrorMsg && (
                <div style={{ flexShrink: 0, padding: "6px 10px", background: "rgba(248,113,113,0.08)", borderBottom: "1px solid rgba(248,113,113,0.18)", color: "rgba(248,113,113,0.85)", fontSize: 10, ...sMono, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {wsDsErrorMsg}
                </div>
              )}

              {/* Live iframe when running — split with optional console panel */}
              {wsDsStatus === "running" && wsDsPort && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
                  <iframe
                    ref={iframeRef}
                    key={`ws-${projectId}-${wsDsPort}`}
                    src={workspacePreviewUrl}
                    title="Local Dev Preview"
                    style={{ flex: 1, border: "none", width: "100%", display: "block", background: "var(--atlas-bg)" }}
                    onLoad={() => handlePreviewIframeLoad(workspacePreviewUrl)}
                  />
                  {/* Expand to fullscreen */}
                  <button
                    onClick={() => setContentFullscreen(true)}
                    title="Expand to fullscreen"
                    aria-label="Expand to fullscreen"
                    style={{ position: "absolute", top: 8, right: 8, zIndex: 5, padding: "5px 8px", borderRadius: 6, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(201,162,76,0.3)", color: "rgba(201,162,76,0.9)", fontSize: 13, cursor: "pointer", lineHeight: 1, opacity: 0.7, transition: "opacity 160ms ease" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                  >⛶</button>
                  {/* Console toggle bar */}
                  <div
                    onClick={() => setShowLogsWhileRunning(v => !v)}
                    style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderTop: "1px solid var(--atlas-border)", cursor: "pointer", background: browserErrors.length > 0 ? "rgba(248,113,113,0.06)" : "var(--atlas-surface)", userSelect: "none" }}
                  >
                    <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: browserErrors.length > 0 ? "rgba(248,113,113,0.8)" : "var(--atlas-muted)", opacity: 0.7 }}>
                      CONSOLE {browserErrors.length > 0 ? `· ${browserErrors.length} error${browserErrors.length > 1 ? "s" : ""}` : "· no errors"} {showLogsWhileRunning ? "▾" : "▸"}
                    </span>
                  </div>
                  {/* Collapsible log + browser error panel */}
                  {showLogsWhileRunning && (
                    <div style={{ flexShrink: 0, height: 140, overflow: "auto", padding: "6px 10px", background: "#0a0a0c", borderTop: "1px solid var(--atlas-border)" }}>
                      {[...wsDsLogs, ...browserErrors].map((line, i) => {
                        const isBrowserErr = line.startsWith("[browser]");
                        const isError = isBrowserErr || /\b(error|fail|403|SyntaxError|TypeError|ReferenceError)\b/i.test(line);
                        const isWarn = !isError && /\bwarn(ing)?\b/i.test(line);
                        return (
                          <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", color: isError ? "rgba(248,113,113,0.9)" : isWarn ? "rgba(251,191,36,0.85)" : "var(--atlas-muted)", opacity: isError || isWarn ? 1 : 0.65 }}>
                            {line}
                          </div>
                        );
                      })}
                      <div ref={wsDsLogsEndRef} />
                    </div>
                  )}
                </div>
              )}

              {/* While booting: show Atlas Generated preview as placeholder + logs below */}
              {wsDsStatus !== "running" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  {/* Atlas Generated fallback while boot happens */}
                  {manifestPreviewHtml && wsDsStatus !== "idle" && (
                    <div style={{ flex: "0 0 55%", overflow: "hidden", borderBottom: "1px solid var(--atlas-border)", position: "relative" }}>
                      <div style={{ position: "absolute", top: 6, left: 8, fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35, letterSpacing: "0.08em", zIndex: 1 }}>
                        ATLAS GENERATED · live server starting…
                      </div>
                      <iframe
                        srcDoc={manifestPreviewHtml}
                        title="Atlas Generated (fallback)"
                        sandbox="allow-scripts allow-same-origin"
                        style={{ width: "100%", height: "100%", border: "none", display: "block", opacity: 0.7 }}
                      />
                    </div>
                  )}
                  {/* Boot logs */}
                  <div style={{ flex: 1, overflow: "auto", padding: "8px 10px", background: "#0e0d0b" }}>
                    {wsDsLogs.length === 0 ? (
                      <div style={{ fontSize: 10, ...sMono, color: "var(--atlas-muted)", opacity: 0.3, textAlign: "center", marginTop: "20%" }}>
                        {wsDsStatus === "idle" ? "Press Run Project to start the dev server." : "Waiting for output…"}
                      </div>
                    ) : (
                      wsDsLogs.map((line, i) => {
                        const isError = /\b(error|fail|403|SyntaxError|TypeError|ReferenceError|ERR_|ENOENT|ELIFECYCLE)\b/i.test(line);
                        const isWarn = !isError && /\bwarn(ing)?\b/i.test(line);
                        const isGood = !isError && !isWarn && /^[✓⚡►]|ready|compiled|started|running/i.test(line.trim());
                        return (
                          <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", color: isError ? "rgba(248,113,113,0.9)" : isWarn ? "rgba(251,191,36,0.85)" : isGood ? "rgba(52,211,153,0.8)" : "var(--atlas-muted)", opacity: isError || isWarn || isGood ? 1 : 0.7 }}>
                            {line}
                          </div>
                        );
                      })
                    )}
                    <div ref={wsDsLogsEndRef} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Case 3: GitHub-linked repo → existing devserver flow */}
          {linkedRepo && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Top bar */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--atlas-border)", background: "var(--atlas-surface)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: dsStatus === "running" ? "rgba(52,211,153,0.8)" : dsStatus === "error" ? "rgba(248,113,113,0.8)" : "var(--atlas-gold)", letterSpacing: "0.05em" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dsStatus === "running" ? "rgba(52,211,153,0.8)" : dsStatus === "error" ? "rgba(248,113,113,0.8)" : "var(--atlas-gold)", display: "inline-block", boxShadow: `0 0 6px ${dsStatus === "running" ? "rgba(52,211,153,0.5)" : dsStatus === "error" ? "rgba(248,113,113,0.5)" : "rgba(201,162,76,0.5)"}` }} />
                  Local Dev · {DS_STAGE_LABELS[dsStatus]}
                </span>
                <div style={{ flex: 1 }} />
                {dsStatus === "running" && dsPort && (
                  <a
                    href={`http://localhost:${dsPort}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.55, textDecoration: "none", letterSpacing: "0.04em", transition: "opacity 140ms" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.55")}
                  >
                    localhost:{dsPort} ↗
                  </a>
                )}
              </div>

              {/* Progress */}
              {dsStatus !== "idle" && dsStatus !== "running" && dsStatus !== "error" && (
                <div style={{ flexShrink: 0, height: 2, background: "var(--atlas-border)", width: "100%" }}>
                  <div style={{ height: "100%", width: `${DS_STAGE_PROGRESS[dsStatus]}%`, background: "var(--atlas-gold)", transition: "width 400ms ease" }} />
                </div>
              )}

              {/* Controls */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--atlas-border)" }}>
                {dsStatus === "idle" || dsStatus === "error" ? (
                  <button
                    onClick={handleDsStart}
                    disabled={dsStarting}
                    style={{ padding: "5px 12px", borderRadius: 5, background: dsStarting ? "var(--atlas-glass-bg)" : "var(--atlas-ember)", border: "none", color: dsStarting ? "var(--atlas-muted)" : "var(--atlas-fg)", fontSize: 10, ...sMono, letterSpacing: "0.08em", cursor: dsStarting ? "not-allowed" : "pointer", transition: "all 140ms ease" }}
                  >
                    {dsStarting ? "Starting…" : "Start Server"}
                  </button>
                ) : (
                  <button
                    onClick={handleDsStop}
                    style={{ padding: "5px 12px", borderRadius: 5, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", color: "rgba(248,113,113,0.85)", fontSize: 10, ...sMono, letterSpacing: "0.08em", cursor: "pointer", transition: "all 140ms ease" }}
                  >
                    Stop Server
                  </button>
                )}
                <button
                  onClick={() => setShowEnvVars((v) => !v)}
                  style={{ padding: "4px 8px", borderRadius: 4, background: "transparent", border: "1px solid var(--atlas-border)", color: "var(--atlas-muted)", fontSize: 9, ...sMono, cursor: "pointer", opacity: 0.6, transition: "opacity 140ms" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                >
                  {showEnvVars ? "Hide Env" : "Env Vars"}
                </button>
                <div style={{ flex: 1 }} />
                {routePickerButton}
              </div>

              {/* Env vars editor */}
              {showEnvVars && (
                <div style={{ flexShrink: 0, padding: "8px 10px", borderBottom: "1px solid var(--atlas-border)", background: "var(--atlas-surface)" }}>
                  {devEnvVars.map((env, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <input
                        value={env.key}
                        onChange={(e) => {
                          const next = [...devEnvVars];
                          next[idx] = { ...next[idx], key: e.target.value };
                          if (idx === next.length - 1 && e.target.value.trim()) next.push({ key: "", value: "" });
                          setDevEnvVars(next);
                        }}
                        placeholder="KEY"
                        style={{ flex: 1, padding: "4px 6px", borderRadius: 4, background: "var(--atlas-bg)", border: "1px solid var(--atlas-border)", color: "var(--atlas-fg)", fontSize: 10, ...sMono, outline: "none" }}
                      />
                      <input
                        value={env.value}
                        onChange={(e) => {
                          const next = [...devEnvVars];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setDevEnvVars(next);
                        }}
                        placeholder="VALUE"
                        style={{ flex: 1.5, padding: "4px 6px", borderRadius: 4, background: "var(--atlas-bg)", border: "1px solid var(--atlas-border)", color: "var(--atlas-fg)", fontSize: 10, ...sMono, outline: "none" }}
                      />
                    </div>
                  ))}
                </div>
              )}

              

              {/* Error banner */}
              {devError && (
                <div style={{ flexShrink: 0, padding: "6px 10px", background: "rgba(248,113,113,0.08)", borderBottom: "1px solid rgba(248,113,113,0.18)", color: "rgba(248,113,113,0.85)", fontSize: 10, ...sMono, lineHeight: 1.5 }}>
                  {devError}
                </div>
              )}

              {/* Logs */}
              <div style={{ flex: 1, overflow: "auto", padding: "8px 10px", background: "#0e0d0b" }}>
                {dsLogs.length === 0 ? (
                  <div style={{ fontSize: 10, ...sMono, color: "var(--atlas-muted)", opacity: 0.3, textAlign: "center", marginTop: "20%" }}>
                    {dsStatus === "idle" ? "Dev server idle. Press Start to clone and run." : "Waiting for logs…"}
                  </div>
                ) : (
                  dsLogs.map((line, i) => (
                    <div key={i} style={{ fontSize: 9.5, ...sMono, color: "var(--atlas-muted)", lineHeight: 1.6, opacity: 0.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {line}
                    </div>
                  ))
                )}
                <div ref={dsLogsEndRef} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── StackBlitz mode ── */}
      {previewMode === "stackblitz" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!linkedRepo ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", gap: 12 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" opacity={0.12}>
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" stroke="var(--atlas-fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", opacity: 0.4, textAlign: "center", lineHeight: 1.8 }}>
                Link a GitHub repo in the{" "}
                <button
                  type="button"
                  onClick={() => onSwitchToFiles?.()}
                  style={{ background: "none", border: "none", padding: 0, color: "var(--atlas-gold)", opacity: 0.9, fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, font: "inherit" }}
                >
                  Files
                </button>{" "}
                tab to open it in StackBlitz.
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
              {/* Top bar */}
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--atlas-border)", background: "var(--atlas-surface)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "rgba(52,211,153,0.8)", letterSpacing: "0.05em" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(52,211,153,0.8)", display: "inline-block", boxShadow: "0 0 6px rgba(52,211,153,0.5)" }} />
                  StackBlitz · {linkedRepo.fullName}
                </span>
                <div style={{ flex: 1 }} />
                <a
                  href={`https://github.com/${linkedRepo.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.55, textDecoration: "none", letterSpacing: "0.04em", transition: "opacity 140ms" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.55")}
                >
                  GitHub →
                </a>
                <button
                  onClick={() => setContentFullscreen(true)}
                  title="Expand to fullscreen"
                  aria-label="Expand to fullscreen"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--atlas-muted)", fontSize: 13, opacity: 0.55, padding: "2px 4px", lineHeight: 1, transition: "opacity 160ms ease" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.55")}
                >⛶</button>
              </div>
              <iframe
                key={linkedRepo.fullName}
                src={`https://stackblitz.com/github/${linkedRepo.fullName}?embed=1&theme=dark&terminalHeight=0&hideNavigation=0`}
                title={`StackBlitz — ${linkedRepo.fullName}`}
                style={{ flex: 1, border: "none", width: "100%", height: "100%", display: "block" }}
                allow="cross-origin-isolated"
              />
            </div>
          )}
        </div>
      )}
      {/* Content fullscreen portal — Local Dev and StackBlitz expand */}
      {contentFullscreen && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "#000", display: "flex", flexDirection: "column" }}>
          {/* Top bar — sits above iframe, never overlaps content */}
          <div style={{
            flexShrink: 0,
            display: "flex", alignItems: "center", gap: 8,
            padding: "0 14px",
            height: "calc(env(safe-area-inset-top, 0px) + 40px)",
            paddingTop: "env(safe-area-inset-top, 0px)",
            background: "rgba(10,10,10,0.95)",
            borderBottom: "1px solid rgba(201,162,76,0.15)",
          }}>
            <button
              onClick={() => setContentFullscreen(false)}
              aria-label="Exit fullscreen"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
                color: "var(--atlas-muted, #888)",
                fontSize: 11, fontFamily: "var(--app-font-mono)",
                letterSpacing: "0.08em", padding: "4px 0",
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>←</span>
              <span>Back to Workspace</span>
            </button>
            {previewMode === "local" && (
              <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-muted)", opacity: 0.45, textTransform: "uppercase" }}>
                Local Dev · Running from workspace disk
              </span>
            )}
            {previewMode === "stackblitz" && linkedRepo && (
              <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", color: "var(--atlas-muted)", opacity: 0.45, textTransform: "uppercase" }}>
                StackBlitz · {linkedRepo.fullName}
              </span>
            )}
          </div>
          {previewMode === "local" && sessionId && !linkedRepo && wsDsPort && (
            <iframe
              ref={iframeRef}
              key={`cfs-ws-${projectId}-${wsDsPort}`}
              src={workspacePreviewUrl}
              title="Local Dev fullscreen"
              style={{ border: "none", flex: 1, width: "100%", background: "#fff" }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              onLoad={() => handlePreviewIframeLoad(workspacePreviewUrl)}
            />
          )}
          {previewMode === "stackblitz" && linkedRepo && (
            <iframe
              key={`cfs-sbz-${linkedRepo.fullName}`}
              src={`https://stackblitz.com/github/${linkedRepo.fullName}?embed=1&theme=dark&terminalHeight=0&hideNavigation=0`}
              title="StackBlitz fullscreen"
              style={{ border: "none", flex: 1, width: "100%", height: "100%" }}
              allow="cross-origin-isolated"
            />
          )}
        </div>,
        document.body
      )}

      {/* Shared device popover — portaled so it floats above iframes and isn't clipped */}
      {deviceMenuOpen && deviceMenuPos && typeof document !== "undefined" && createPortal(
        <>
          <div onClick={() => setDeviceMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div style={{
            position: "fixed", top: deviceMenuPos.top, right: deviceMenuPos.right, zIndex: 9999,
            background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)",
            borderRadius: 6, padding: 4, minWidth: 140,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          }}>
            {(["phone", "tablet", "desktop"] as const).map((d) => (
              <button key={d} onClick={() => { setDeviceSize(d); setDeviceMenuOpen(false); }}
                style={{ display: "flex", alignItems: "center", width: "100%", padding: "6px 8px", gap: 8, background: deviceSize === d ? "rgba(201,162,76,0.10)" : "transparent", border: "none", borderRadius: 4, color: deviceSize === d ? "var(--atlas-gold)" : "var(--atlas-fg)", fontSize: 10, ...sMono, letterSpacing: "0.05em", cursor: "pointer", textTransform: "capitalize", textAlign: "left" }}>
                {d}
              </button>
            ))}
            <div style={{ height: 1, background: "var(--atlas-border)", margin: "4px 2px" }} />
            <button onClick={() => { setIsLandscape((l) => !l); setDeviceMenuOpen(false); }}
              style={{ display: "flex", alignItems: "center", width: "100%", padding: "6px 8px", gap: 8, background: "transparent", border: "none", borderRadius: 4, color: "var(--atlas-muted)", fontSize: 10, ...sMono, letterSpacing: "0.05em", cursor: "pointer", textAlign: "left" }}>
              {isLandscape ? "→ Portrait" : "→ Landscape"}
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// Small read-only label+value row used inside artifact detail panels
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, flexShrink: 0, minWidth: 80, paddingTop: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.75, lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

// Suggestions dropdown — portaled to escape the overflow:hidden chrome wrapper
// so the menu isn't clipped/stacked behind the iframe area.
function SuggestionsDropdown({
  results,
  open,
  setOpen,
  onPick,
  platformColor,
  sMono,
}: {
  results: Array<{ url: string; platform: string; confidence: string }>;
  open: boolean;
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  onPick: (url: string) => void;
  platformColor: (p: string) => string;
  sMono: React.CSSProperties;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "3px 9px", borderRadius: 4, fontSize: 9.5, ...sMono,
          letterSpacing: "0.08em", background: "var(--atlas-glass-bg)",
          border: "1px solid var(--atlas-border)", color: "var(--atlas-muted)",
          cursor: "pointer",
        }}
      >
        {results.length} suggestion{results.length === 1 ? "" : "s"} ▾
      </button>
      {open && pos && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div
            style={{
              position: "fixed",
              top: pos.top,
              left: Math.max(8, Math.min(pos.left, window.innerWidth - 260)),
              zIndex: 9999,
              background: "var(--atlas-surface)",
              border: "1px solid var(--atlas-border)",
              borderRadius: 6, padding: 4, minWidth: 240,
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
              maxHeight: "60vh", overflow: "auto",
            }}
          >
            {results.slice(0, 6).map((r) => (
              <button
                key={r.url}
                onClick={() => onPick(r.url)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", borderRadius: 4, width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
              >
                <span style={{ fontSize: 8.5, ...sMono, color: platformColor(r.platform), opacity: 0.9, flexShrink: 0 }}>{r.platform}</span>
                {r.confidence === "high" && <span style={{ fontSize: 7.5, ...sMono, color: "rgba(134,239,172,0.7)", flexShrink: 0 }}>✓</span>}
                <span style={{ flex: 1, fontSize: 9.5, ...sMono, color: "var(--atlas-fg)", opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.url}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
