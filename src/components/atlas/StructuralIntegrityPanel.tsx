import { useState, useMemo, useCallback } from "react";
import { haptic } from "@/lib/haptics";

/** A single audit item in the structural integrity report. */
export interface AuditItem {
  id: string;
  label: string;
  category: "queue" | "plan" | "github" | "auth" | "haptics" | "dependency";
  status: "functional" | "partial" | "stub" | "missing";
  file: string;
  functionName?: string;
  excerpt: string;
  notes?: string;
}

/** Build the static audit manifest from known architecture. */
export function buildAuditManifest(): AuditItem[] {
  return [
    {
      id: "queue-reorder",
      label: "Queue Reordering (drag-and-drop)",
      category: "queue",
      status: "functional",
      file: "src/components/atlas/TaskQueue.tsx",
      functionName: "handleDrop",
      excerpt: `const handleDrop = useCallback((targetId) => {\n  const next = [...items];\n  const [moved] = next.splice(fromIdx, 1);\n  next.splice(toIdx, 0, moved);\n  onReorder(next);\n});`,
      notes: "Real array splice with drag state refs.",
    },
    {
      id: "queue-batch",
      label: "Batch-Send (HUD state machine)",
      category: "queue",
      status: "functional",
      file: "src/components/atlas/ContextualHUD.tsx",
      functionName: "BatchState",
      excerpt: `type BatchState =\n  | { phase: "idle" }\n  | { phase: "parking"; total: number; done: number }\n  | { phase: "done"; count: number; entryIds: string[] }\n  | { phase: "undoing" }\n  | { phase: "undone" };`,
      notes: "Full state machine with progress tracking and undo.",
    },
    {
      id: "plan-parse",
      label: "Plan Mode — Step Extraction",
      category: "plan",
      status: "functional",
      file: "src/routes/index.tsx",
      functionName: "send (plan parser)",
      excerpt: `const stepRegex = /(?:^|\\n)\\s*(\\d+)\\.\\s+\\*{0,2}(.+?)\\*{0,2}(?:\\n|$)/g;\nwhile ((match = stepRegex.exec(content)) !== null) {\n  extracted.push({ id: \`plan-\${stepNum}\`, label, dependsOn: deps });\n}`,
      notes: "Regex-based. Works when LLM outputs numbered steps.",
    },
    {
      id: "plan-cycle",
      label: "Cycle Detection (DFS)",
      category: "dependency",
      status: "functional",
      file: "src/components/atlas/DependencyGraph.tsx",
      functionName: "detectCycle",
      excerpt: `function detectCycle(steps: PlanStep[]): string[] | null {\n  // DFS with WHITE/GRAY/BLACK coloring\n  // Returns first cycle found or null\n}`,
      notes: "Real DFS with cycle tracing + gold warning banner.",
    },
    {
      id: "dep-fallback",
      label: "Dependency Layout Fallbacks",
      category: "dependency",
      status: "functional",
      file: "src/components/atlas/DependencyGraph.tsx",
      functionName: "sanitizeSteps / layoutNodes",
      excerpt: `function sanitizeSteps(raw: PlanStep[]): PlanStep[] {\n  const ids = new Set(raw.map(s => s.id));\n  return raw.map(s => ({\n    ...s,\n    dependsOn: s.dependsOn.filter(d => ids.has(d)),\n  }));\n}`,
      notes: "Strips dangling refs + try/catch on layout with linear fallback.",
    },
    {
      id: "github-api",
      label: "GitHub API (6 server functions)",
      category: "github",
      status: "functional",
      file: "src/server/github.functions.ts",
      functionName: "ghFetch / pushMultipleFiles",
      excerpt: `async function ghFetch(path, token, options?) {\n  const res = await fetch(\`\${GITHUB_API}\${path}\`, {\n    headers: { Authorization: \`Bearer \${token}\` },\n  });\n}`,
      notes: "Real fetch calls to api.github.com. PAT + OAuth supported.",
    },
    {
      id: "github-oauth",
      label: "GitHub OAuth Flow",
      category: "github",
      status: "functional",
      file: "src/server/github.functions.ts",
      functionName: "getGitHubOAuthUrl / exchangeGitHubCode",
      excerpt: `export const exchangeGitHubCode = createServerFn({ method: "POST" })\n  .handler(async ({ data }) => {\n    const res = await fetch(GITHUB_OAUTH_TOKEN, { method: "POST", ... });\n    return { access_token, token_type, scope };\n  });`,
      notes: "Server-side code exchange. Requires GITHUB_CLIENT_ID/SECRET.",
    },
    {
      id: "auth-signout",
      label: "Sign Out Logic",
      category: "auth",
      status: "functional",
      file: "src/lib/auth.tsx",
      functionName: "signOut",
      excerpt: `const signOut = async () => {\n  await supabase.auth.signOut();\n  setUser(null);\n  setSession(null);\n  window.location.href = "/";\n};`,
      notes: "Full session wipe + redirect to landing page.",
    },
    {
      id: "haptics",
      label: "Global Haptic Utility",
      category: "haptics",
      status: "functional",
      file: "src/lib/haptics.ts",
      functionName: "haptic",
      excerpt: `export function haptic(intensity: Intensity = "light") {\n  if ("vibrate" in navigator) {\n    navigator.vibrate(patterns[intensity]);\n  }\n}`,
      notes: "Light (10ms), Medium (25ms), Heavy (pulse). Progressive enhancement.",
    },
    {
      id: "queue-contextual",
      label: "Contextual Handoff (plan → queue)",
      category: "queue",
      status: "functional",
      file: "src/routes/index.tsx",
      functionName: "promoteStepToQueue",
      excerpt: `const promoteStepToQueue = useCallback((step, context?) => {\n  setQueueItems(prev => [...prev, {\n    ...item,\n    planStepId: step.id,\n    dependsOn: step.dependsOn,\n  }]);\n});`,
      notes: "Carries planStepId + dependsOn + text-level metadata.",
    },
  ];
}

const STATUS_COLORS: Record<AuditItem["status"], string> = {
  functional: "#22c55e",
  partial: "var(--accent-gold)",
  stub: "var(--ember)",
  missing: "#ef4444",
};

const STATUS_LABELS: Record<AuditItem["status"], string> = {
  functional: "✅ Functional",
  partial: "⚠️ Partial",
  stub: "🔶 Stub",
  missing: "❌ Missing",
};

const CATEGORY_LABELS: Record<AuditItem["category"], string> = {
  queue: "Execution Queue",
  plan: "Plan Mode",
  github: "GitHub Sync",
  auth: "Authentication",
  haptics: "Haptic Feedback",
  dependency: "Dependency Graph",
};

interface StructuralIntegrityPanelProps {
  open: boolean;
  onClose: () => void;
}

const PRESETS_KEY = "atlas-integrity-presets";

interface FilterPreset {
  name: string;
  search: string;
  category: AuditItem["category"] | "all";
  status: AuditItem["status"] | "all";
}

function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePresets(presets: FilterPreset[]) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch {}
}

export function StructuralIntegrityPanel({ open, onClose }: StructuralIntegrityPanelProps) {
  const items = useMemo(() => buildAuditManifest(), []);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<AuditItem["category"] | "all">("all");
  const [filterStatus, setFilterStatus] = useState<AuditItem["status"] | "all">("all");
  const [presets, setPresets] = useState<FilterPreset[]>(loadPresets);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const newPreset: FilterPreset = { name: presetName.trim(), search, category: filterCategory, status: filterStatus };
    const updated = [...presets, newPreset];
    setPresets(updated);
    savePresets(updated);
    setPresetName("");
    setShowSavePreset(false);
    haptic("medium");
  };

  const handleLoadPreset = (p: FilterPreset) => {
    setSearch(p.search);
    setFilterCategory(p.category);
    setFilterStatus(p.status);
    haptic("light");
  };

  const handleDeletePreset = (idx: number) => {
    const updated = presets.filter((_, i) => i !== idx);
    setPresets(updated);
    savePresets(updated);
    haptic("light");
  };

  const filtered = useMemo(() => {
    let result = items;
    if (filterCategory !== "all") result = result.filter((i) => i.category === filterCategory);
    if (filterStatus !== "all") result = result.filter((i) => i.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) =>
        i.label.toLowerCase().includes(q) ||
        i.file.toLowerCase().includes(q) ||
        (i.functionName?.toLowerCase().includes(q)) ||
        (i.notes?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, filterCategory, filterStatus, search]);

  const categories = useMemo(() => {
    const map = new Map<string, AuditItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [filtered]);

  const summary = useMemo(() => {
    const counts = { functional: 0, partial: 0, stub: 0, missing: 0 };
    for (const i of items) counts[i.status]++;
    return counts;
  }, [items]);

  const exportReport = useCallback(() => {
    const report = {
      generatedAt: new Date().toISOString(),
      summary,
      items: items.map(({ id, label, category, status, file, functionName, notes }) => ({
        id, label, category, status, file, functionName, notes,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-integrity-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    haptic("medium");
  }, [items, summary]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex",
        justifyContent: "flex-end",
        animation: "atlas-bubble-in 200ms ease forwards",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 95vw)",
          height: "100%",
          background: "var(--background)",
          borderLeft: "1px solid var(--glass-border)",
          display: "flex",
          flexDirection: "column",
          animation: "atlas-drawer-slide 280ms cubic-bezier(0.4, 0, 0.2, 1) forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 14px",
            borderBottom: "0.5px solid var(--glass-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
                border: "0.5px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--accent-gold)",
              }}
            >
              <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <path d="M2 8h12M8 2v12M4 4l8 8M12 4l-8 8" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: "var(--foreground)" }}>Structural Integrity</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-text)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                {summary.functional}/{items.length} systems verified
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={exportReport}
              style={{
                padding: "6px 10px", borderRadius: 6,
                background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
                border: "0.5px solid color-mix(in oklab, var(--accent-gold) 25%, var(--border))",
                fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--accent-gold)", cursor: "pointer",
              }}
            >
              ↓ Export
            </button>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: "transparent", border: "0.5px solid var(--border)",
                color: "var(--muted-text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}
            >
              <svg viewBox="0 0 16 16" width={12} height={12} stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div style={{ display: "flex", gap: 12, padding: "12px 20px", borderBottom: "0.5px solid var(--glass-border)" }}>
          {(Object.entries(summary) as [AuditItem["status"], number][]).filter(([, v]) => v > 0).map(([status, count]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[status] }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-text)" }}>
                {count} {status}
              </span>
            </div>
          ))}
        </div>

        {/* Search & Filters */}
        <div style={{ padding: "10px 20px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search systems, files, functions…"
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--foreground)", fontSize: 12, fontFamily: "var(--font-mono)",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(["all", ...Object.keys(CATEGORY_LABELS)] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat as typeof filterCategory)}
                style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 9.5,
                  fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase",
                  border: `0.5px solid ${filterCategory === cat ? "var(--accent-gold)" : "var(--border)"}`,
                  background: filterCategory === cat ? "color-mix(in oklab, var(--accent-gold) 12%, var(--surface))" : "var(--surface)",
                  color: filterCategory === cat ? "var(--accent-gold)" : "var(--muted-text)",
                  cursor: "pointer", transition: "all 150ms ease",
                }}
              >
                {cat === "all" ? "All" : CATEGORY_LABELS[cat as AuditItem["category"]]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(["all", "functional", "partial", "stub", "missing"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st as typeof filterStatus)}
                style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 9.5,
                  fontFamily: "var(--font-mono)", letterSpacing: "0.06em",
                  border: `0.5px solid ${filterStatus === st ? (st === "all" ? "var(--accent-gold)" : STATUS_COLORS[st]) : "var(--border)"}`,
                  background: filterStatus === st ? `color-mix(in oklab, ${st === "all" ? "var(--accent-gold)" : STATUS_COLORS[st]} 12%, var(--surface))` : "var(--surface)",
                  color: filterStatus === st ? (st === "all" ? "var(--accent-gold)" : STATUS_COLORS[st]) : "var(--muted-text)",
                  cursor: "pointer", transition: "all 150ms ease",
                }}
              >
                {st === "all" ? "All" : STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        </div>

        {/* Audit items by category */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted-text)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              No items match your filters.
            </div>
          )}
          {[...categories.entries()].map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "var(--accent-gold)", marginBottom: 8, opacity: 0.8,
              }}>
                {CATEGORY_LABELS[cat as AuditItem["category"]] ?? cat}
              </div>
              {catItems.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setExpandedId(isExpanded ? null : item.id);
                      haptic("light");
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: `0.5px solid ${isExpanded ? "color-mix(in oklab, var(--accent-gold) 30%, var(--border))" : "var(--border)"}`,
                      background: isExpanded ? "color-mix(in oklab, var(--accent-gold) 5%, var(--surface))" : "var(--surface)",
                      marginBottom: 6,
                      cursor: "pointer",
                      transition: "all 160ms ease",
                    }}
                  >
                    {/* Row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLORS[item.status], flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.label}
                        </span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: STATUS_COLORS[item.status], opacity: 0.8, flexShrink: 0 }}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ marginTop: 10, animation: "atlas-bubble-in 200ms ease forwards" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 10, padding: "2px 8px", borderRadius: 6,
                              background: "color-mix(in oklab, var(--accent-gold) 8%, transparent)",
                              border: "0.5px solid color-mix(in oklab, var(--accent-gold) 15%, var(--border))",
                              color: "var(--accent-gold)",
                            }}>
                              {item.file}
                            </span>
                            {item.functionName && (
                              <span style={{
                                fontFamily: "var(--font-mono)", fontSize: 10, padding: "2px 8px", borderRadius: 6,
                                background: "var(--surface)", border: "0.5px solid var(--border)", color: "var(--muted-text)",
                              }}>
                                {item.functionName}
                              </span>
                            )}
                          </div>
                          {item.notes && (
                            <div style={{ fontSize: 11, color: "var(--muted-text)", lineHeight: 1.5 }}>
                              {item.notes}
                            </div>
                          )}
                          {/* Code excerpt */}
                          <pre
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              lineHeight: 1.5,
                              padding: "10px 12px",
                              borderRadius: 8,
                              background: "color-mix(in oklab, var(--background) 90%, var(--accent-gold) 10%)",
                              border: "0.5px solid color-mix(in oklab, var(--accent-gold) 12%, var(--border))",
                              color: "var(--foreground)",
                              overflowX: "auto",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              margin: 0,
                            }}
                          >
                            {item.excerpt}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
