// Project Knowledge — Phase 3B.
// "Show me every invite flow I've ever built." Groups cross-project search
// hits by project and ranks them by implementation maturity (breadth, depth,
// test coverage, recency). Reuses the same DB-backed source index as
// cross-project search and architecture diff — no new storage.
import { useCallback, useState } from "react";
import { useLocation } from "wouter";

const GOLD = "var(--atlas-gold, #c9a24c)";
const MUTED = "var(--atlas-muted, #8a8a8a)";
const FG = "var(--atlas-fg, #d4d4d4)";
const BORDER = "1px solid color-mix(in oklab, var(--atlas-fg) 8%, transparent)";

interface MatchedFile {
  path: string;
  line: number;
  preview: string;
}

interface ProjectKnowledgeEntry {
  projectId: number;
  projectName: string;
  matchedFiles: MatchedFile[];
  fileCount: number;
  hitCount: number;
  hasTests: boolean;
  daysSinceUpdate: number;
  maturityScore: number;
  stars: number;
}

interface ProjectKnowledgeResult {
  concept: string;
  projects: ProjectKnowledgeEntry[];
}

const EXAMPLES = ["invite flow", "authentication", "onboarding", "dashboard", "payment"];

function Stars({ count }: { count: number }) {
  return (
    <span style={{ color: GOLD, letterSpacing: 1, fontSize: 13 }}>
      {"★".repeat(count)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - count)}</span>
    </span>
  );
}

export default function KnowledgePage() {
  const [, setLocation] = useLocation();
  const [concept, setConcept] = useState("");
  const [result, setResult] = useState<ProjectKnowledgeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setExpanded(null);
    try {
      const BASE_URL = ((import.meta.env.BASE_URL as string) || "").replace(/\/$/, "");
      const r = await fetch(`${BASE_URL}/api/knowledge?concept=${encodeURIComponent(trimmed)}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data: ProjectKnowledgeResult = await r.json();
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={{
      height: "100dvh", overflowY: "auto", background: "var(--atlas-bg)", color: FG,
    }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "var(--atlas-bg)",
        borderBottom: BORDER, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button
          onClick={() => setLocation("/home")}
          aria-label="Back"
          style={{
            background: "transparent", border: "none", color: MUTED,
            fontSize: 16, cursor: "pointer", padding: 4,
          }}
        >←</button>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.1em",
          textTransform: "uppercase", color: GOLD,
        }}>ATLAS / PROJECT KNOWLEDGE</span>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 64px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>
          Show me every {result?.concept ? <em style={{ color: GOLD, fontStyle: "normal" }}>{result.concept}</em> : "…"} you've ever built
        </h1>
        <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 18px", lineHeight: 1.6 }}>
          Search a concept, component, or pattern across every one of your projects.
          Atlas ranks each implementation by how mature it looks — breadth of files touched,
          depth of usage, test coverage, and recency.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            autoFocus
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void runSearch(concept); }}
            placeholder="invite flow, task board, auth, payment retry…"
            style={{
              flex: 1, padding: "9px 12px",
              background: "color-mix(in oklab, var(--atlas-fg) 4%, transparent)",
              border: `1px solid color-mix(in oklab, var(--atlas-fg) 12%, transparent)`,
              borderRadius: 6, color: FG, fontSize: 13, outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void runSearch(concept)}
            disabled={loading || !concept.trim()}
            style={{
              padding: "9px 16px", background: "color-mix(in oklab, var(--atlas-gold) 12%, transparent)",
              border: `1px solid color-mix(in oklab, var(--atlas-gold) 35%, transparent)`, color: GOLD,
              fontFamily: "var(--app-font-mono)", fontSize: 11, letterSpacing: "0.06em",
              textTransform: "uppercase", borderRadius: 6, cursor: loading ? "wait" : "pointer",
            }}
          >{loading ? "…" : "Search"}</button>
        </div>

        {!result && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => { setConcept(ex); void runSearch(ex); }}
                style={{
                  padding: "4px 10px", background: "transparent",
                  border: `1px solid color-mix(in oklab, var(--atlas-fg) 15%, transparent)`,
                  color: MUTED, fontSize: 11.5, borderRadius: 999, cursor: "pointer",
                }}
              >{ex}</button>
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 20, fontSize: 12.5, color: "#f87171" }}>Couldn't load results: {error}</div>
        )}

        {result && !loading && (
          <div style={{ marginTop: 24 }}>
            {result.projects.length === 0 ? (
              <div style={{ fontSize: 12.5, color: MUTED }}>
                No matches for "{result.concept}" across your projects yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.projects.map((p, i) => {
                  const isOpen = expanded === p.projectId;
                  return (
                    <div key={p.projectId} style={{
                      border: BORDER, borderRadius: 8,
                      background: i === 0 ? "color-mix(in oklab, var(--atlas-gold) 5%, transparent)" : "transparent",
                    }}>
                      <div
                        onClick={() => setExpanded(isOpen ? null : p.projectId)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 14px", cursor: "pointer",
                        }}
                      >
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10.5, fontFamily: "var(--app-font-mono)", color: MUTED,
                          border: `1px solid color-mix(in oklab, var(--atlas-fg) 15%, transparent)`,
                        }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{p.projectName}</span>
                            {i === 0 && (
                              <span style={{
                                fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.08em",
                                textTransform: "uppercase", color: GOLD, opacity: 0.85,
                              }}>Most mature</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                            {p.fileCount} file{p.fileCount === 1 ? "" : "s"} · {p.hitCount} mention{p.hitCount === 1 ? "" : "s"}
                            {p.hasTests ? " · has tests" : ""} · updated {p.daysSinceUpdate === 0 ? "today" : `${p.daysSinceUpdate}d ago`}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <Stars count={p.stars} />
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{p.maturityScore}/100</div>
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{
                          borderTop: BORDER, padding: "8px 14px 12px 48px",
                          display: "flex", flexDirection: "column", gap: 4,
                        }}>
                          {p.matchedFiles.map((f, idx) => (
                            <div
                              key={idx}
                              onClick={() => setLocation(`/project/${p.projectId}`)}
                              style={{
                                fontFamily: "var(--app-font-mono)", fontSize: 10.5, cursor: "pointer",
                              }}
                            >
                              <span style={{ color: GOLD }}>{f.path}</span>
                              <span style={{ color: MUTED }}>:L{f.line}</span>
                              <div style={{ color: FG, opacity: 0.7, whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {f.preview}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
