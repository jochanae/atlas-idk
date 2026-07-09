// Architecture Diff — Phase 3A step 2.
// Compares this project against another one the user owns across a fixed
// set of structural categories (routes, dependencies, data entities,
// components, auth approach), using the same source index as cross-project
// search. Read-only, no shared component registry — that's still deferred.
import React, { useEffect, useMemo, useState } from "react";
import { useListProjects } from "@workspace/api-client-react";
import { fetchArchitectureDiff, type ArchitectureDiffResult, type DiffStatus } from "../../hooks/useProjectSource";

const GOLD = "var(--atlas-gold, #c9a24c)";
const MUTED = "var(--atlas-muted, #8a8a8a)";
const FG = "var(--atlas-fg, #d4d4d4)";
const BORDER = "1px solid rgba(201,162,76,0.10)";

const STATUS_META: Record<DiffStatus, { icon: string; label: string; color: string }> = {
  same: { icon: "✓", label: "Same", color: "#4ade80" },
  similar: { icon: "≈", label: "Similar", color: "#fbbf24" },
  different: { icon: "✗", label: "Different", color: "#f87171" },
  onlyA: { icon: "◐", label: "Only here", color: "#8ab4f8" },
  onlyB: { icon: "◑", label: "Only there", color: "#8ab4f8" },
  empty: { icon: "—", label: "Not detected", color: MUTED },
};

interface Props {
  projectId: number;
}

export const ArchitectureDiffView: React.FC<Props> = ({ projectId }) => {
  const { data: projectsRaw } = useListProjects();
  const projects = useMemo(
    () => (Array.isArray(projectsRaw) ? projectsRaw : []).filter((p: any) => p.id !== projectId),
    [projectsRaw, projectId],
  );

  const [compareToId, setCompareToId] = useState<number | null>(null);
  const [result, setResult] = useState<ArchitectureDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!compareToId) { setResult(null); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    setExpanded(null);
    fetchArchitectureDiff(projectId, compareToId)
      .then((r) => { if (alive) setResult(r); })
      .catch((e) => { if (alive) setError(String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, compareToId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: 10, borderBottom: BORDER, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.09em",
          textTransform: "uppercase", color: MUTED, flexShrink: 0,
        }}>Compare to</span>
        <select
          value={compareToId ?? ""}
          onChange={(e) => setCompareToId(e.target.value ? Number(e.target.value) : null)}
          style={{
            flex: 1, padding: "4px 8px", background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(201,162,76,0.15)", borderRadius: 3, color: FG,
            fontFamily: "var(--app-font-mono)", fontSize: 11, outline: "none",
          }}
        >
          <option value="">Select a project…</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {!compareToId && (
          <div style={{ padding: 16, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
            Pick another one of your projects to see a structural comparison —
            routes, dependencies, data entities, components, and how each
            project handles auth.
          </div>
        )}
        {loading && (
          <div style={{ padding: 16, fontSize: 11.5, color: MUTED }}>Comparing architectures…</div>
        )}
        {error && (
          <div style={{ padding: 16, fontSize: 11.5, color: "#f87171" }}>{error}</div>
        )}
        {result && !loading && (
          <div>
            <div style={{
              display: "flex", padding: "8px 12px", gap: 8, borderBottom: BORDER,
              fontFamily: "var(--app-font-mono)", fontSize: 10.5, color: GOLD,
              letterSpacing: "0.04em",
            }}>
              <span style={{ flex: 1 }}>{result.projectA.name}</span>
              <span style={{ color: MUTED }}>vs</span>
              <span style={{ flex: 1, textAlign: "right" }}>{result.projectB.name}</span>
            </div>
            {result.categories.map((cat) => {
              const meta = STATUS_META[cat.status];
              const isOpen = expanded === cat.key;
              return (
                <div key={cat.key} style={{ borderBottom: BORDER }}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : cat.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 12px", cursor: "pointer",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "rgba(201,162,76,0.05)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{
                      width: 18, textAlign: "center", color: meta.color,
                      fontFamily: "var(--app-font-mono)", fontSize: 13, fontWeight: 700,
                    }}>{meta.icon}</span>
                    <span style={{ flex: 1, fontSize: 12, color: FG }}>{cat.label}</span>
                    <span style={{
                      fontFamily: "var(--app-font-mono)", fontSize: 9.5,
                      letterSpacing: "0.09em", textTransform: "uppercase",
                      color: meta.color, opacity: 0.85,
                    }}>{meta.label}</span>
                  </div>
                  {isOpen && (
                    <div style={{
                      display: "flex", gap: 10, padding: "0 12px 10px 40px",
                      fontFamily: "var(--app-font-mono)", fontSize: 10.5,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {cat.itemsA.length === 0 && <div style={{ color: MUTED }}>— none —</div>}
                        {cat.itemsA.slice(0, 40).map((item) => (
                          <div key={item} style={{
                            color: cat.itemsB.includes(item) ? MUTED : FG,
                            opacity: cat.itemsB.includes(item) ? 0.6 : 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{item}</div>
                        ))}
                      </div>
                      <div style={{ width: 1, background: "rgba(201,162,76,0.10)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {cat.itemsB.length === 0 && <div style={{ color: MUTED }}>— none —</div>}
                        {cat.itemsB.slice(0, 40).map((item) => (
                          <div key={item} style={{
                            color: cat.itemsA.includes(item) ? MUTED : FG,
                            opacity: cat.itemsA.includes(item) ? 0.6 : 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{item}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
