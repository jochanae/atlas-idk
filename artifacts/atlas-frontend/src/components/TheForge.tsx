import { useState, useRef, useEffect, useCallback } from "react";
import { Project } from "@workspace/api-client-react";
import { haptics } from "@/lib/haptics";
import { sounds } from "@/lib/sounds";
import { parseLinkedRepo } from "@/lib/githubRepo";
import { submitForgeIntake } from "@/lib/forgeIntake";
import type { ArchNode } from "./AxiomFlow";
import { GlossaryTip } from "./GlossaryTip";
import { useThemeMode } from "@/lib/theme";

const FORGE_STAGES = [
  "Reading intent...",
  "Identifying blockers...",
  "Mapping priorities...",
  "Placing nodes...",
];

const PLATFORMS = [
  { id: "Axiom", label: "Axiom" },
  { id: "Replit", label: "Replit" },
  { id: "Cursor", label: "Cursor" },
  { id: "Lovable", label: "Lovable" },
  { id: "Bolt", label: "Bolt" },
  { id: "v0", label: "v0" },
  { id: "Claude", label: "Claude" },
];

const FORGE_GAP_NODE_TYPES: Array<ArchNode["type"]> = ["goal", "blocker", "decision"];

const BLOCKER_EXPLANATION = "Something actively preventing progress right now — not hypothetical, real.";
const DECISION_EXPLANATION = "A choice that's already been made and now constrains everything else.";
const SPRINT_EXPLANATION = "A bounded chunk of work with a defined end point.";
const FORGE_ATMOSPHERE_BACKGROUND = "radial-gradient(ellipse at 50% 30%, rgba(88, 28, 135, 0.18) 0%, transparent 70%)";
const FORGE_FIELD_STYLE = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
};

function ForgeStageLabel({ stage }: { stage: string }) {
  if (stage === "Identifying blockers...") {
    return (
      <>
        Identifying <GlossaryTip term="blockers">{BLOCKER_EXPLANATION}</GlossaryTip>...
      </>
    );
  }
  return stage;
}

function ForgeNodeTypeLabel({ type }: { type: ArchNode["type"] }) {
  if (type === "blocker") {
    return <GlossaryTip term="blocker">{BLOCKER_EXPLANATION}</GlossaryTip>;
  }
  if (type === "decision") {
    return <GlossaryTip term="decision">{DECISION_EXPLANATION}</GlossaryTip>;
  }
  if (type === "sprint") {
    return <GlossaryTip term="sprint">{SPRINT_EXPLANATION}</GlossaryTip>;
  }
  return type;
}

function detectPlatformId(): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host.includes("lovable") || host.includes("lovableproject")) return "Lovable";
  if (host.includes("replit") || host.includes("repl.co") || host.includes("replit.app")) return "Replit";
  if (host.includes("cursor")) return "Cursor";
  if (host.includes("bolt")) return "Bolt";
  if (host.includes("v0.dev")) return "v0";
  return "Axiom";
}

interface Props {
  platform?: string;
  readinessScore?: number;
  activeProjectName?: string;
  projectId?: number;
  defaultTab?: "forge" | "prompt";
  preloadContent?: string;
  onClose: () => void;
  onNodesReady?: (nodes: ArchNode[]) => void;
  onFillChatInput?: (text: string) => void;
  /** Optional scope: when set, Forge hydrates context for this node only and surfaces a breadcrumb. */
  scopeNodeId?: string | null;
  scopeNodeLabel?: string | null;
  /** Clear scope handler — resets to full project hydration. */
  onClearScope?: () => void;
}

export function TheForge({ platform, readinessScore = 0, activeProjectName, projectId, defaultTab = "forge", preloadContent, onClose, onNodesReady, onFillChatInput, scopeNodeId, scopeNodeLabel, onClearScope }: Props) {
  const [isMobile] = useState(() => window.innerWidth < 768);
  const theme = useThemeMode();
  void defaultTab;

  // Forge state — pre-fill transcript from preloadContent if provided
  const [transcript, setTranscript] = useState(preloadContent ?? "");
  const [projectContext, setProjectContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [isForging, setIsForging] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [forgeResult, setForgeResult] = useState<{ nodes: ArchNode[]; summary: string } | null>(null);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [repoContext, setRepoContext] = useState("");
  const [repoDocsFound, setRepoDocsFound] = useState<string[]>([]);
  const [repoScanStatus, setRepoScanStatus] = useState<"idle" | "loading" | "done">("idle");

  // Project DNA was extracted to ProjectDnaEditor (mounted in ProjectSettingsPanel).
  // See the transitional banner below the tab bar — drop the banner once the
  // move has been live for a couple of weeks.

  // Quick Prompt state — auto-detect platform from hostname; respect prop override
  const detectedPlatform = detectPlatformId();
  const [selectedPlatform, setSelectedPlatform] = useState(() => {
    if (platform) {
      const match = PLATFORMS.find(p => p.id.toLowerCase() === platform.toLowerCase());
      if (match) return match.id;
    }
    return detectedPlatform;
  });
  const [promptDesc, setPromptDesc] = useState("");
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [showFilePane, setShowFilePane] = useState(false);
  const [projectMap, setProjectMap] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── File source state ───────────────────────────────────────────────────────
  type FileSource = "github" | "zip" | "manual";
  const [fileSource, setFileSource] = useState<FileSource>("manual");

  // GitHub mode
  type GhProject = { name: string; githubRepo: string; defaultBranch: string };
  const [ghProjects, setGhProjects] = useState<GhProject[]>([]);
  const [ghRepo, setGhRepo] = useState("");
  const [ghBranch, setGhBranch] = useState("main");
  const [ghTree, setGhTree] = useState<string[]>([]);
  const [ghSelectedFile, setGhSelectedFile] = useState("");
  const [ghStatus, setGhStatus] = useState<"idle" | "loading-tree" | "loading-file" | "done" | "error">("idle");
  const [ghError, setGhError] = useState<string | null>(null);

  // ZIP mode
  const ZIP_LS_KEY = "atlas-forge-zip";
  const [zipName, setZipName] = useState("");
  const [zipFiles, setZipFiles] = useState<Record<string, string>>({});
  const [zipSelectedFile, setZipSelectedFile] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Load project map from localStorage when projectId is available
  useEffect(() => {
    if (!projectId) return;
    try {
      const raw = localStorage.getItem(`atlas-scan-${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const lines = typeof parsed === "string"
          ? parsed
          : (parsed?.summary ?? parsed?.routes ?? JSON.stringify(parsed, null, 2));
        if (typeof lines === "string" && lines.trim()) setProjectMap(lines);
      }
    } catch { /* silent */ }
  }, [projectId]);

  // Repo pre-scan — silently fetch known strategy docs when projectId is set
  useEffect(() => {
    if (!projectId) return;
    setRepoScanStatus("loading");
    const STRATEGY_DOCS = ["README.md", "NORTH_STAR.md", "CONSTITUTION.md", "DECISIONS.md", "ROADMAP.md", "docs/strategy.md"];

    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(async (proj: { linkedRepo?: string | null } | null) => {
        // Project DNA hydration was removed; ProjectDnaEditor self-hydrates.
        if (!proj?.linkedRepo) { setRepoScanStatus("done"); return; }
        const repoInfo = parseLinkedRepo(proj.linkedRepo);
        if (!repoInfo?.fullName) { setRepoScanStatus("done"); return; }
        const branch = repoInfo.defaultBranch ?? "main";
        const found: { path: string; content: string }[] = [];
        let totalLen = 0;
        for (const docPath of STRATEGY_DOCS) {
          if (totalLen >= 3000) break;
          try {
            const r = await fetch(`/api/github/file?repo=${encodeURIComponent(repoInfo.fullName)}&path=${encodeURIComponent(docPath)}&branch=${encodeURIComponent(branch)}`, { credentials: "include" });
            if (r.ok) {
              const data = await r.json() as { content?: string; path?: string };
              const snippet = (data.content ?? "").slice(0, 800);
              if (snippet.trim()) {
                found.push({ path: docPath, content: snippet });
                totalLen += snippet.length;
              }
            }
          } catch { /* silent */ }
        }
        if (found.length > 0) {
          setRepoContext(found.map(f => `### ${f.path}\n${f.content}`).join("\n\n").slice(0, 3000));
          setRepoDocsFound(found.map(f => f.path));
        }
        setRepoScanStatus("done");
      })
      .catch(() => setRepoScanStatus("done"));
  }, [projectId]);

  // Load stored ZIP on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ZIP_LS_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as { name: string; files: Record<string, string> };
        setZipName(stored.name ?? "");
        setZipFiles(stored.files ?? {});
      }
    } catch { /* silent */ }
  }, []);

  // Load projects with linked repos for GitHub mode (lazy — only when tab opened)
  const loadGhProjects = useCallback(() => {
    if (ghProjects.length > 0) return;
    fetch("/api/projects", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{ name: string; linkedRepo?: string | null }>) => {
        const linked: GhProject[] = [];
        for (const p of data) {
          if (!p.linkedRepo) continue;
          const parsed = parseLinkedRepo(p.linkedRepo);
          if (parsed?.fullName) {
            linked.push({ name: p.name, githubRepo: parsed.fullName, defaultBranch: parsed.defaultBranch ?? "main" });
          }
        }
        setGhProjects(linked);
      })
      .catch(() => {});
  }, [ghProjects.length]);

  // ── GitHub handlers ─────────────────────────────────────────────────────────
  const handleGhRepoSelect = async (repo: string, branch: string) => {
    setGhRepo(repo);
    setGhBranch(branch);
    setGhTree([]);
    setGhSelectedFile("");
    setFilePath("");
    setFileContent("");
    setGhStatus("loading-tree");
    setGhError(null);
    try {
      const res = await fetch(`/api/github/tree?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`, { credentials: "include" });
      if (!res.ok) throw new Error("tree-fail");
      const data = await res.json() as { tree: Array<{ path: string; type: string }> };
      const files = data.tree
        .filter(f => f.type === "blob" && !f.path.includes("node_modules") && !f.path.startsWith("."))
        .map(f => f.path)
        .sort();
      setGhTree(files);
      setGhStatus("idle");
    } catch {
      setGhStatus("error");
      setGhError("Could not load repo. Make sure GitHub is connected.");
    }
  };

  const handleGhFileSelect = async (path: string) => {
    setGhSelectedFile(path);
    setGhStatus("loading-file");
    setGhError(null);
    try {
      const res = await fetch(`/api/github/file?repo=${encodeURIComponent(ghRepo)}&path=${encodeURIComponent(path)}&branch=${encodeURIComponent(ghBranch)}`, { credentials: "include" });
      if (!res.ok) throw new Error("file-fail");
      const data = await res.json() as { content: string; path: string; lines?: number };
      setFilePath(data.path);
      setFileContent(data.content);
      setGhStatus("done");
    } catch {
      setGhStatus("error");
      setGhError("Could not load file content.");
    }
  };

  // ── ZIP handlers ────────────────────────────────────────────────────────────
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZipLoading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);
      const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md", ".html", ".py", ".swift", ".kt", ".go", ".rb", ".sql"];
      const extracted: Record<string, string> = {};
      const entries = Object.entries(zip.files).filter(([p, f]) =>
        !f.dir &&
        !p.includes("node_modules") &&
        !p.startsWith("__MACOSX") &&
        !p.startsWith(".") &&
        CODE_EXTS.some(ext => p.endsWith(ext))
      );
      for (const [path, entry] of entries.slice(0, 300)) {
        try { extracted[path] = await entry.async("text"); } catch { /* skip binary */ }
      }
      const stored = { name: file.name, files: extracted };
      localStorage.setItem(ZIP_LS_KEY, JSON.stringify(stored));
      setZipName(file.name);
      setZipFiles(extracted);
      setZipSelectedFile("");
      setFilePath("");
      setFileContent("");
    } catch { /* silent */ } finally {
      setZipLoading(false);
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  };

  const handleZipFileSelect = (path: string) => {
    setZipSelectedFile(path);
    setFilePath(path);
    setFileContent(zipFiles[path] ?? "");
  };

  const clearZip = () => {
    localStorage.removeItem(ZIP_LS_KEY);
    setZipName("");
    setZipFiles({});
    setZipSelectedFile("");
    setFilePath("");
    setFileContent("");
  };

  // ── Forge logic ────────────────────────────────────────────────────────────
  const canForge = transcript.trim().length > 10 && !isForging;

  const startStageAnimation = () => {
    setStageIdx(0);
    let idx = 0;
    stageTimerRef.current = setInterval(() => {
      idx = (idx + 1) % FORGE_STAGES.length;
      setStageIdx(idx);
    }, 900);
  };

  const stopStageAnimation = () => {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  };

  const handleForge = async () => {
    if (!canForge) return;
    setIsForging(true);
    setForgeError(null);
    setForgeResult(null);
    startStageAnimation();
    abortRef.current = new AbortController();
    try {
      const data = await submitForgeIntake({
        transcript: transcript.trim(),
        projectId,
        projectContext: projectContext.trim() || null,
        repoContext: repoContext || null,
        signal: abortRef.current.signal,
      });
      haptics.cardConfirmed();
      sounds.cardConfirmed();
      setForgeResult(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setForgeError("The Forge couldn't process this. Try a more specific description.");
    } finally {
      stopStageAnimation();
      setIsForging(false);
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    stopStageAnimation();
    setIsForging(false);
  };

  const handleForgeHandoff = () => {
    if (!forgeResult?.nodes.length) return;
    onNodesReady?.(forgeResult.nodes);
    onClose();
  };

  // ── Tab: Forge ─────────────────────────────────────────────────────────────
  const missingForgeNodeTypes = forgeResult
    ? FORGE_GAP_NODE_TYPES.filter(type => !forgeResult.nodes.some(node => node.type === type))
    : [];

  const forgeContent = (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ borderRadius: 10, background: "rgba(var(--atlas-gold-rgb),0.02)", border: "1px solid rgba(var(--atlas-gold-rgb),0.12)", padding: "12px 14px" }}>
        <p style={{ fontSize: 12, color: "rgba(var(--atlas-gold-rgb),0.75)", lineHeight: 1.6, margin: 0 }}>
          Paste a raw transcript, voice note, brain dump, or strategy doc. The Forge reads intent, extracts goals, requirements, and <GlossaryTip term="blockers">{BLOCKER_EXPLANATION}</GlossaryTip> — then places them on your Axiom Flow.
        </p>
      </div>


      <div>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(var(--atlas-muted-rgb),0.75)", textTransform: "uppercase", marginBottom: 8, fontFamily: "var(--app-font-mono)" }}>
          Transcript / Brain Dump
        </p>
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder={`Paste anything — a voice note transcript, a product spec, a messy doc, a Notion page dump...\n\nThe Forge will extract what matters and map it to your strategic flow.`}
          rows={isMobile ? 6 : 8}
          style={{
            width: "100%", ...FORGE_FIELD_STYLE,
            padding: "12px 14px",
            color: "var(--atlas-fg)", fontSize: 13, lineHeight: 1.65,
            outline: "none", resize: "none", transition: "border-color 180ms",
            boxSizing: "border-box" as const, fontFamily: "inherit",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "rgba(var(--atlas-muted-rgb),0.4)", fontFamily: "var(--app-font-mono)" }}>
            {transcript.length} chars
          </span>
        </div>
      </div>

      <div>
        <button
          onClick={() => setShowContext(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            color: showContext ? "rgba(var(--atlas-gold-rgb),0.75)" : "rgba(var(--atlas-muted-rgb),0.55)",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            fontFamily: "var(--app-font-mono)", textTransform: "uppercase",
            padding: 0, transition: "color 180ms",
          }}
        >
          <span style={{ fontSize: 12, lineHeight: 1 }}>{showContext ? "▾" : "▸"}</span>
          {showContext ? "Hide project context" : "Add project context (optional)"}
        </button>

        {showContext && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 11, color: "rgba(var(--atlas-muted-rgb),0.55)", marginBottom: 8, lineHeight: 1.5 }}>
              Give The Forge more signal — paste your current <GlossaryTip term="decisions">{DECISION_EXPLANATION}</GlossaryTip>, tech stack, or project goals so nodes are more precisely typed and prioritized.
              {activeProjectName && <span style={{ color: "rgba(var(--atlas-gold-rgb),0.55)" }}> Project: <strong>{activeProjectName}</strong></span>}
              {platform && <span style={{ color: "rgba(var(--atlas-gold-rgb),0.45)" }}> · Stack: <strong>{platform}</strong></span>}
            </p>
            <textarea
              value={projectContext}
              onChange={e => setProjectContext(e.target.value)}
              placeholder="e.g. We're building a founder OS in React/Express/Postgres. Current committed decisions: auth via Clerk, no mobile for v1, must ship by end of month..."
              rows={4}
              style={{
                width: "100%", ...FORGE_FIELD_STYLE,
                padding: "10px 12px",
                color: "var(--atlas-fg)", fontSize: 12, lineHeight: 1.6,
                outline: "none", resize: "none", transition: "border-color 180ms",
                boxSizing: "border-box" as const, fontFamily: "inherit",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            />
          </div>
        )}
      </div>

      {repoScanStatus === "done" && repoDocsFound.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9, color: "rgba(var(--atlas-muted-rgb),0.45)", fontFamily: "var(--app-font-mono)", lineHeight: 1.5 }}>
            ⬡ Repo context: {repoDocsFound.map(p => p.split("/").pop()).join(", ")} loaded
          </span>
        </div>
      )}

      <button
        onClick={isForging ? handleAbort : handleForge}
        style={{
          width: "100%", borderRadius: 12,
          background: isForging ? "rgba(var(--atlas-gold-rgb),0.08)" : canForge ? "var(--atlas-gold)" : "rgba(var(--atlas-gold-rgb),0.10)",
          padding: "14px", fontSize: 14, fontWeight: 700,
          color: isForging ? "rgba(var(--atlas-gold-rgb),0.65)" : canForge ? "#0D0B09" : "rgba(var(--atlas-gold-rgb),0.35)",
          border: isForging ? "1px solid rgba(var(--atlas-gold-rgb),0.25)" : "none",
          cursor: isForging || canForge ? "pointer" : "not-allowed",
          transition: "all 180ms",
          boxShadow: canForge && !isForging ? "0 0 20px oklch(0.76 0.12 85 / 15%)" : "none",
        }}
      >
        {isForging ? (
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--atlas-gold)", animation: "forge-pulse 1.4s ease-in-out infinite" }} />
            <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 12, letterSpacing: "0.04em" }}><ForgeStageLabel stage={FORGE_STAGES[stageIdx]} /></span>
          </span>
        ) : "Run The Forge →"}
      </button>

      {forgeResult && forgeResult.nodes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, borderRadius: 12, border: "1px solid color-mix(in oklab, var(--atlas-gold) 18%, var(--atlas-border))", background: "color-mix(in oklab, var(--atlas-gold) 5%, var(--atlas-surface))", padding: "12px 14px" }}>
          {forgeResult.summary && (
            <p style={{ margin: 0, color: "var(--atlas-muted)", fontSize: 12, lineHeight: 1.5 }}>
              {forgeResult.summary}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--atlas-gold)", textTransform: "uppercase", fontFamily: "var(--app-font-mono)" }}>
              Extracted nodes
            </span>
            {onNodesReady && (
              <button
                onClick={handleForgeHandoff}
                style={{
                  borderRadius: 7,
                  border: "1px solid color-mix(in oklab, var(--atlas-gold) 35%, var(--atlas-border))",
                  background: "color-mix(in oklab, var(--atlas-gold) 12%, var(--atlas-surface))",
                  color: "var(--atlas-gold)",
                  cursor: "pointer",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  padding: "5px 9px",
                  textTransform: "uppercase",
                }}
              >
                Hand to Atlas →
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {forgeResult.nodes.map(node => {
              const fromScope = !!scopeNodeId && node.id === scopeNodeId;
              return (
                <div key={node.id} style={{
                  display: "flex", alignItems: "center", gap: 8, borderRadius: 8,
                  background: "var(--atlas-surface)",
                  border: "1px solid var(--atlas-border)",
                  borderLeft: fromScope ? "2px solid var(--atlas-gold)" : "1px solid var(--atlas-border)",
                  padding: "8px 10px",
                }}>
                  <span style={{ color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 }}>
                    <ForgeNodeTypeLabel type={node.type} />
                  </span>
                  <span style={{ color: "var(--atlas-fg)", fontSize: 12, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                    {node.label}
                  </span>
                  {fromScope && (
                    <span style={{
                      flexShrink: 0,
                      fontFamily: "var(--app-font-mono)", fontSize: 8.5,
                      color: "var(--atlas-gold)",
                      background: "rgba(201,162,76,0.1)",
                      border: "1px solid rgba(201,162,76,0.3)",
                      padding: "1px 5px", borderRadius: 3,
                      letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>from: node</span>
                  )}
                </div>
              );
            })}
          </div>
          {missingForgeNodeTypes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, borderRadius: 8, border: "1px solid color-mix(in oklab, var(--warning) 28%, var(--atlas-border))", background: "color-mix(in oklab, var(--warning) 9%, var(--atlas-surface))", padding: "9px 10px" }}>
              {missingForgeNodeTypes.map(type => (
                <p key={type} style={{ margin: 0, color: "var(--warning)", fontSize: 11, lineHeight: 1.45, fontFamily: "var(--app-font-mono)" }}>
                  No <ForgeNodeTypeLabel type={type} /> detected — consider adding one before handing to Atlas.
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {forgeError && (
        <div style={{ borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", padding: "12px 14px", fontSize: 12, color: "rgba(239,100,100,0.9)", lineHeight: 1.5 }}>
          {forgeError}
          <button onClick={handleForge} style={{ display: "block", marginTop: 8, background: "none", border: "none", color: "rgba(var(--atlas-gold-rgb),0.75)", fontSize: 11, cursor: "pointer", padding: 0, fontWeight: 600 }}>Try again →</button>
        </div>
      )}
    </div>
  );

  // (Project DNA tab content removed — now lives in ProjectSettingsPanel.)


  // ── Header ─────────────────────────────────────────────────────────────────
  const headerBlock = (
    <div style={{ flexShrink: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 10px",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--atlas-gold)", letterSpacing: "0.06em", fontFamily: "var(--app-font-mono)" }}>
            THE FORGE
          </span>
          <span style={{ fontSize: 10, color: "rgba(var(--atlas-muted-rgb),0.6)" }}>
            {`Decompose your thinking into a strategic map${activeProjectName ? ` · ${activeProjectName}` : ""}${readinessScore > 0 ? ` · ${readinessScore}% ready` : ""}`}
          </span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(var(--atlas-muted-rgb),0.55)", fontSize: 22, lineHeight: 1, padding: "2px 0 2px 4px" }}>×</button>
      </div>

      <div style={{ borderBottom: "1px solid rgba(var(--atlas-gold-rgb),0.10)" }} />

      {/* Scope breadcrumb — visible only when Forge was entered from a Master Map node */}
      {scopeNodeId && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px",
          background: "linear-gradient(90deg, rgba(201,162,76,0.08), rgba(201,162,76,0.02))",
          borderBottom: "1px solid rgba(var(--atlas-gold-rgb),0.18)",
          borderLeft: "2px solid var(--atlas-gold)",
        }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{
              fontFamily: "var(--app-font-mono)", fontSize: 9.5,
              color: "rgba(var(--atlas-muted-rgb),0.7)",
              letterSpacing: "0.14em", textTransform: "uppercase",
            }}>Scoped to</span>
            <span style={{
              fontFamily: "var(--app-font-mono)", fontSize: 12, fontWeight: 600,
              color: "var(--atlas-gold)", letterSpacing: "0.02em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{scopeNodeLabel ?? scopeNodeId}</span>
          </div>
          {onClearScope && (
            <button
              onClick={onClearScope}
              title="Clear scope — hydrate full project context"
              style={{
                background: "transparent", border: "1px solid rgba(var(--atlas-muted-rgb),0.25)",
                color: "rgba(var(--atlas-muted-rgb),0.7)",
                fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.1em",
                padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                textTransform: "uppercase",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--atlas-gold)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(var(--atlas-muted-rgb),0.7)"; }}
            >Clear scope</button>
          )}
        </div>
      )}
    </div>
  );

  const tabContent = forgeContent;
  const tabLabel = "THE FORGE";
  const forgeBackgroundImage = theme === "parchment" ? "none" : FORGE_ATMOSPHERE_BACKGROUND;

  if (!isMobile) {
    return (
      <>
        <style>{`@keyframes forge-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.7); } }`}</style>
        <div style={{ display: "flex", flexDirection: "column", background: "var(--atlas-bg)", backgroundImage: forgeBackgroundImage, border: "1px solid rgba(var(--atlas-gold-rgb),0.22)", borderRadius: 12, height: "100%", overflow: "hidden" }}>
          {headerBlock}
          {tabContent}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes forge-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.7); } }`}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 350, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "fixed", left: 0, right: 0, top: 50, bottom: 0, zIndex: 360, background: "var(--atlas-bg)", backgroundImage: forgeBackgroundImage, border: "1px solid rgba(var(--atlas-gold-rgb),0.22)", borderRadius: "16px 16px 0 0", display: "flex", flexDirection: "column", paddingTop: "max(env(safe-area-inset-top), 4px)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(var(--atlas-gold-rgb),0.18)" }} />
        </div>
        {headerBlock}
        {tabContent}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid rgba(var(--atlas-gold-rgb),0.07)", flexShrink: 0 }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 16px", borderRadius: 20, background: "rgba(var(--atlas-muted-rgb),0.09)", border: "1px solid rgba(var(--atlas-muted-rgb),0.2)", color: "rgba(var(--atlas-muted-rgb),0.75)", fontSize: 12, cursor: "pointer", fontFamily: "var(--app-font-mono)" }}>‹ Back</button>
          <span style={{ fontSize: 10, color: "rgba(var(--atlas-muted-rgb),0.35)", fontFamily: "var(--app-font-mono)" }}>AXIOM // {tabLabel}</span>
        </div>
      </div>
    </>
  );
}
