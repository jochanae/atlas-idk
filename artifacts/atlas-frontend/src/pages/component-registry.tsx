// Shared Component Registry — Phase 3B step 2.
// "You've built a Modal 4 times across 4 projects — want to promote one to
// shared?" Groups exported React components by name across every owned
// project and surfaces duplicates as extraction candidates. Reuses the same
// DB-backed source index as cross-project search / knowledge / arch diff.
// No new tables, no auto-extraction — this is a read-only signal.
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";

const GOLD = "var(--atlas-gold, #c9a24c)";
const MUTED = "var(--atlas-muted, #8a8a8a)";
const FG = "var(--atlas-fg, #d4d4d4)";
const BORDER = "1px solid color-mix(in oklab, var(--atlas-fg) 8%, transparent)";

interface ComponentOccurrence {
  projectId: number;
  projectName: string;
  path: string;
  lineCount: number;
  updatedAt: string;
}

interface ComponentGroup {
  name: string;
  occurrences: ComponentOccurrence[];
  projectCount: number;
  isDuplicate: boolean;
}

interface ComponentRegistryResult {
  groups: ComponentGroup[];
  totalComponents: number;
  totalProjects: number;
}

export default function ComponentRegistryPage() {
  const [, setLocation] = useLocation();
  const [result, setResult] = useState<ComponentRegistryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const BASE_URL = ((import.meta.env.BASE_URL as string) || "").replace(/\/$/, "");
      const r = await fetch(`${BASE_URL}/api/component-registry`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data: ComponentRegistryResult = await r.json();
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const duplicates = result?.groups.filter((g) => g.isDuplicate) ?? [];
  const singles = result?.groups.filter((g) => !g.isDuplicate) ?? [];
  const visibleGroups = showAll ? [...duplicates, ...singles] : duplicates;

  return (
    <div style={{ height: "100dvh", overflowY: "auto", background: "var(--atlas-bg)", color: FG }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "var(--atlas-bg)",
        borderBottom: BORDER, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button
          onClick={() => setLocation("/home")}
          aria-label="Back"
          style={{ background: "transparent", border: "none", color: MUTED, fontSize: 16, cursor: "pointer", padding: 4 }}
        >←</button>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.1em",
          textTransform: "uppercase", color: GOLD,
        }}>ATLAS / SHARED COMPONENT REGISTRY</span>
        <button
          onClick={() => setLocation("/knowledge")}
          style={{
            marginLeft: "auto", background: "transparent", border: "none", color: MUTED,
            fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.06em",
            textTransform: "uppercase", cursor: "pointer",
          }}
        >Project Knowledge →</button>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 64px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>
          Components you keep rebuilding
        </h1>
        <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 18px", lineHeight: 1.6 }}>
          Joy scanned {result?.totalProjects ?? 0} project{result?.totalProjects === 1 ? "" : "s"} and found{" "}
          {duplicates.length} component{duplicates.length === 1 ? "" : "s"} built more than once.
          These are candidates for extraction into a shared library.
        </p>

        {loading && <div style={{ fontSize: 12.5, color: MUTED }}>Scanning projects…</div>}
        {error && <div style={{ fontSize: 12.5, color: "#f87171" }}>Couldn't load registry: {error}</div>}

        {!loading && !error && result && (
          <>
            {duplicates.length === 0 ? (
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>
                No duplicate components found yet — nothing has been rebuilt across projects.
              </div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {visibleGroups.map((g) => {
                const isOpen = expanded === g.name;
                return (
                  <div key={g.name} style={{
                    border: BORDER, borderRadius: 8,
                    background: g.isDuplicate ? "color-mix(in oklab, var(--atlas-gold) 5%, transparent)" : "transparent",
                  }}>
                    <div
                      onClick={() => setExpanded(isOpen ? null : g.name)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 14, fontWeight: 600 }}>{g.name}</span>
                          {g.isDuplicate && (
                            <span style={{
                              fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.08em",
                              textTransform: "uppercase", color: GOLD, opacity: 0.85,
                              border: `1px solid color-mix(in oklab, var(--atlas-gold) 35%, transparent)`,
                              borderRadius: 999, padding: "1px 6px",
                            }}>Duplicate</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                          Built in {g.projectCount} project{g.projectCount === 1 ? "" : "s"} · {g.occurrences.length} file{g.occurrences.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <span style={{ color: MUTED, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                    {isOpen && (
                      <div style={{ borderTop: BORDER, padding: "8px 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {g.occurrences.map((o, idx) => (
                          <div
                            key={idx}
                            onClick={() => setLocation(`/project/${o.projectId}`)}
                            style={{
                              display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
                              fontFamily: "var(--app-font-mono)", fontSize: 10.5, cursor: "pointer",
                            }}
                          >
                            <span>
                              <span style={{ color: GOLD }}>{o.projectName}</span>
                              <span style={{ color: MUTED }}> — {o.path}</span>
                            </span>
                            <span style={{ color: MUTED, flexShrink: 0 }}>{o.lineCount} lines</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {singles.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                style={{
                  marginTop: 16, background: "transparent", border: "none", color: MUTED,
                  fontSize: 11.5, cursor: "pointer", textDecoration: "underline",
                }}
              >
                {showAll ? "Hide" : "Show"} {singles.length} single-project component{singles.length === 1 ? "" : "s"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
