import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EditorialSection {
  title: string;
  content: string;
  color: string;
  accentColor: string;
}

interface Revision {
  id: string;
  wordCount: number;
  timestamp: number;
  profile: ReviewProfile;
  sections: EditorialSection[];
}

type ReviewProfile = "editorial" | "strategy";

// ── Section definitions per profile ───────────────────────────────────────────

const EDITORIAL_SECTION_DEFS = [
  { key: "VOICE FINGERPRINT",  label: "Voice Fingerprint",  color: "#C9A24C", accentColor: "rgba(201,162,76,0.08)"  },
  { key: "ARCHITECTURE REVIEW",label: "Architecture Review",color: "#6B9FD4", accentColor: "rgba(107,159,212,0.08)" },
  { key: "THE TRIMMER",        label: "The Trimmer",        color: "#D4A26B", accentColor: "rgba(212,162,107,0.08)" },
  { key: "COGNITIVE LOAD",     label: "Cognitive Load",     color: "#C47070", accentColor: "rgba(196,112,112,0.08)" },
] as const;

const STRATEGY_SECTION_DEFS = [
  { key: "STRATEGIC COHERENCE",    label: "Strategic Coherence",    color: "#C9A24C", accentColor: "rgba(201,162,76,0.08)"  },
  { key: "TEMPORAL CONTRADICTIONS",label: "Temporal Contradictions",color: "#C47070", accentColor: "rgba(196,112,112,0.08)" },
  { key: "MISSING ASSUMPTIONS",    label: "Missing Assumptions",    color: "#D4A26B", accentColor: "rgba(212,162,107,0.08)" },
  { key: "RISKS & OPPORTUNITIES",  label: "Risks & Opportunities",  color: "#6B9FD4", accentColor: "rgba(107,159,212,0.08)" },
] as const;

type SectionDef = { key: string; label: string; color: string; accentColor: string };

function buildSectionPattern(defs: readonly SectionDef[]): RegExp {
  const allKeys = defs.map(d => d.key).join("|");
  return new RegExp(
    `##\\s*[✦•*]*\\s*(${allKeys})\\s*\\n([\\s\\S]*?)(?=##\\s*[✦•*]*\\s*(?:${allKeys})|$)`,
    "gi",
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSections(text: string, defs: readonly SectionDef[]): EditorialSection[] {
  const pattern = buildSectionPattern(defs);
  const sections: EditorialSection[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const rawKey = match[1].toUpperCase().trim();
    const def = defs.find(d => d.key === rawKey);
    if (def) {
      sections.push({ title: def.label, content: match[2].trim(), color: def.color, accentColor: def.accentColor });
    }
  }
  return sections;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// ── Content renderer ──────────────────────────────────────────────────────────

function renderContent(content: string, accentColor: string): ReactNode {
  const lines = content.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (line.startsWith("→") || line.startsWith("↳") || line.startsWith("- →") || line.startsWith("* →")) {
      nodes.push(
        <div key={i} style={{ paddingLeft: 12, borderLeft: `2px solid ${accentColor}`, margin: "2px 0 6px" }}>
          <span style={{ fontSize: 12, lineHeight: 1.65, color: "var(--atlas-fg)", opacity: 0.8, fontFamily: "var(--app-font-sans, ui-sans-serif)" }}>
            {line.replace(/^[-*]?\s*[→↳]\s*/, "")}
          </span>
        </div>,
      );
      i++;
      continue;
    }

    if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith('"') && line.endsWith('"'))) {
      nodes.push(
        <div key={i} style={{ margin: "6px 0 2px", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 4 }}>
          <span style={{ fontSize: 12, lineHeight: 1.65, color: "var(--atlas-fg)", opacity: 0.55, fontStyle: "italic", fontFamily: "var(--app-font-sans, ui-sans-serif)" }}>
            {line}
          </span>
        </div>,
      );
      i++;
      continue;
    }

    if (line.startsWith("⚠") || line.startsWith("✦")) {
      const isWarning = line.startsWith("⚠");
      nodes.push(
        <div key={i} style={{ margin: "5px 0", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1, color: isWarning ? "#C47070" : accentColor }}>{isWarning ? "⚠" : "✦"}</span>
          <span style={{ fontSize: 12, lineHeight: 1.65, color: "var(--atlas-fg)", opacity: 0.75, fontFamily: "var(--app-font-sans, ui-sans-serif)" }}>
            {line.replace(/^[⚠✦]\s*/, "")}
          </span>
        </div>,
      );
      i++;
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("• ")) {
      nodes.push(
        <div key={i} style={{ margin: "3px 0", paddingLeft: 12, display: "flex", gap: 6 }}>
          <span style={{ fontSize: 10, color: accentColor, opacity: 0.6, flexShrink: 0, marginTop: 3 }}>·</span>
          <span style={{ fontSize: 12, lineHeight: 1.65, color: "var(--atlas-fg)", opacity: 0.72, fontFamily: "var(--app-font-sans, ui-sans-serif)" }}>
            {line.replace(/^[-•]\s*/, "")}
          </span>
        </div>,
      );
      i++;
      continue;
    }

    nodes.push(
      <p key={i} style={{ fontSize: 12, lineHeight: 1.7, color: "var(--atlas-fg)", opacity: 0.7, margin: "4px 0", fontFamily: "var(--app-font-sans, ui-sans-serif)" }}>
        {line}
      </p>,
    );
    i++;
  }
  return <>{nodes}</>;
}

// ── Profile config ─────────────────────────────────────────────────────────────

const PROFILE_CONFIG: Record<ReviewProfile, {
  label: string;
  buttonText: string;
  panelLabel: string;
  placeholder: string;
  defs: readonly SectionDef[];
  emptyHint: string;
}> = {
  editorial: {
    label: "Editorial",
    buttonText: "Ask Atlas to Review",
    panelLabel: "Atlas Editorial",
    placeholder: "Paste or write your text here.\n\nAtlas will analyze it across four dimensions:\nvoice consistency, structural integrity,\nunnecessary bloat, and cognitive load.",
    defs: EDITORIAL_SECTION_DEFS,
    emptyHint: "Paste your text and ask Atlas to review it. Every suggestion will quote the exact passage.",
  },
  strategy: {
    label: "Strategy",
    buttonText: "Request Strategic Analysis",
    panelLabel: "Atlas Strategy",
    placeholder: "Paste a document, brief, pitch, or plan.\n\nAtlas will cross-reference it against your project genome and decision ledger — flagging contradictions, missing assumptions, and strategic risks.",
    defs: STRATEGY_SECTION_DEFS,
    emptyHint: "Atlas will audit your text against your project's history — decisions, genome, and direction. Every finding quotes the exact passage.",
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

interface WriteTabProps {
  projectId: number;
  isMobile?: boolean;
}

export function WriteTab({ projectId, isMobile = false }: WriteTabProps) {
  const draftKey   = `atlas-write-draft-${projectId}`;
  const historyKey = `atlas-write-history-${projectId}`;

  const [draft, setDraft] = useState<string>(() => sessionStorage.getItem(draftKey) ?? "");
  const [profile, setProfile] = useState<ReviewProfile>("editorial");

  const [sections, setSections]           = useState<EditorialSection[]>([]);
  const [streamBuffer, setStreamBuffer]   = useState("");
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [openSections, setOpenSections]   = useState<Set<string>>(new Set());
  const [error, setError]                 = useState<string | null>(null);

  const [revisions, setRevisions] = useState<Revision[]>(() => {
    try {
      const raw = sessionStorage.getItem(historyKey);
      return raw ? (JSON.parse(raw) as Revision[]) : [];
    } catch { return []; }
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [narrowLayout, setNarrowLayout] = useState(isMobile);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const abortRef    = useRef<AbortController | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setNarrowLayout(w < 600);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset sections when switching profiles so stale results don't show
  const handleProfileSwitch = useCallback((next: ReviewProfile) => {
    if (next === profile) return;
    abortRef.current?.abort();
    setProfile(next);
    setSections([]);
    setStreamBuffer("");
    setError(null);
    setOpenSections(new Set());
  }, [profile]);

  const handleDraftChange = useCallback((val: string) => {
    setDraft(val);
    try { sessionStorage.setItem(draftKey, val); } catch {}
  }, [draftKey]);

  const handleAnalyze = useCallback(async () => {
    const text = draft.trim();
    if (!text || isAnalyzing) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsAnalyzing(true);
    setSections([]);
    setStreamBuffer("");
    setOpenSections(new Set());
    setError(null);

    if (narrowLayout) {
      setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }

    const activeDefs = PROFILE_CONFIG[profile].defs;

    try {
      const res = await fetch(`/api/projects/${projectId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, profile }),
        signal: ctrl.signal,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Analysis failed" })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; token?: string; content?: string };
            if (event.type === "token" && event.token) {
              accumulated += event.token;
              setStreamBuffer(accumulated);
            } else if (event.type === "done") {
              const final = event.content ?? accumulated;
              const parsed = parseSections(final, activeDefs);
              setSections(parsed);
              setStreamBuffer("");
              setOpenSections(new Set(parsed.map(s => s.title)));

              const rev: Revision = {
                id: crypto.randomUUID(),
                wordCount: countWords(text),
                timestamp: Date.now(),
                profile,
                sections: parsed,
              };
              setRevisions(prev => {
                const next = [rev, ...prev].slice(0, 5);
                try { sessionStorage.setItem(historyKey, JSON.stringify(next)); } catch {}
                return next;
              });
            }
          } catch {}
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "Something went wrong");
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [draft, isAnalyzing, narrowLayout, profile, projectId, historyKey]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const wordCount   = countWords(draft);
  const hasFeedback = sections.length > 0 || !!streamBuffer;
  const cfg         = PROFILE_CONFIG[profile];

  // ── Styles ──────────────────────────────────────────────────────────────────

  const panelSeparatorStyle: React.CSSProperties = narrowLayout
    ? { borderTop: "1px solid rgba(201,162,76,0.08)", borderRight: "none" }
    : { borderRight: "1px solid rgba(201,162,76,0.08)", borderTop: "none" };

  const splitStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: narrowLayout ? "column" : "row",
    minHeight: 0,
    overflow: "hidden",
  };

  const canvasPaneStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    flex: narrowLayout ? "0 0 45%" : 1,
    ...panelSeparatorStyle,
  };

  const feedbackPaneStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    flex: narrowLayout ? "1 1 auto" : 1,
    overflow: "hidden",
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", background: "var(--atlas-surface)" }}
    >
      {/* Profile switcher bar */}
      <div style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid rgba(201,162,76,0.06)", flexShrink: 0, background: "rgba(0,0,0,0.06)" }}>
        <span style={{ fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35, marginRight: 4 }}>Review as</span>
        {(["editorial", "strategy"] as ReviewProfile[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => handleProfileSwitch(p)}
            style={{
              padding: "3px 11px",
              fontSize: 9.5,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              fontFamily: "var(--app-font-mono)",
              fontWeight: profile === p ? 600 : 400,
              background: profile === p ? "rgba(201,162,76,0.10)" : "transparent",
              border: `1px solid ${profile === p ? "rgba(201,162,76,0.28)" : "rgba(201,162,76,0.08)"}`,
              borderRadius: 5,
              color: profile === p ? "#C9A24C" : "var(--atlas-muted)",
              opacity: profile === p ? 1 : 0.45,
              cursor: "pointer",
              transition: "all 150ms ease",
            }}
          >
            {PROFILE_CONFIG[p].label}
          </button>
        ))}
      </div>

      <div style={splitStyle}>
        {/* ── Left / Top: Writing Canvas ──────────────────────────────────── */}
        <div style={canvasPaneStyle}>
          <div style={{ padding: "9px 16px 7px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(201,162,76,0.06)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.45 }}>
                <path d="M2 4h12M2 8h8M2 12h10" stroke="var(--atlas-fg)" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.55 }}>Writing Canvas</span>
            </div>
            {wordCount > 0 && (
              <span style={{ fontSize: 9, letterSpacing: "0.08em", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35 }}>{wordCount.toLocaleString()} words</span>
            )}
          </div>

          <textarea
            value={draft}
            onChange={e => handleDraftChange(e.target.value)}
            placeholder={cfg.placeholder}
            spellCheck={false}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--atlas-fg)",
              fontSize: 13.5,
              lineHeight: 1.78,
              fontFamily: "var(--app-font-sans, ui-sans-serif, system-ui, sans-serif)",
              padding: "16px 20px",
              overflowY: "auto",
              caretColor: "#C9A24C",
              WebkitFontSmoothing: "antialiased",
            }}
          />

          <div style={{ padding: "7px 14px", borderTop: "1px solid rgba(201,162,76,0.06)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "rgba(0,0,0,0.08)" }}>
            {draft && (
              <button
                type="button"
                onClick={() => handleDraftChange("")}
                style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35, background: "none", border: "none", cursor: "pointer", padding: "3px 4px", transition: "opacity 120ms ease" }}
              >
                Clear
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!draft.trim() || isAnalyzing}
              style={{
                padding: "6px 16px",
                fontSize: 10.5,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                fontFamily: "var(--app-font-mono)",
                fontWeight: 600,
                background: "rgba(201,162,76,0.08)",
                border: "1px solid rgba(201,162,76,0.22)",
                borderRadius: 6,
                color: "#C9A24C",
                cursor: draft.trim() && !isAnalyzing ? "pointer" : "default",
                opacity: draft.trim() && !isAnalyzing ? 1 : 0.38,
                transition: "opacity 150ms ease, background 150ms ease",
                display: "flex",
                alignItems: "center",
                gap: 7,
                whiteSpace: "nowrap",
              }}
            >
              {isAnalyzing ? (
                <>
                  <span style={{ display: "inline-block", width: 9, height: 9, border: "1.5px solid rgba(201,162,76,0.3)", borderTopColor: "#C9A24C", borderRadius: "50%", animation: "atlas-write-spin 0.75s linear infinite", flexShrink: 0 }} />
                  Analyzing
                </>
              ) : cfg.buttonText}
            </button>
          </div>
        </div>

        {/* ── Right / Bottom: Atlas Review Panel ──────────────────────────── */}
        <div ref={feedbackRef} style={feedbackPaneStyle}>
          <div style={{ padding: "9px 16px 7px", display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid rgba(201,162,76,0.06)", flexShrink: 0, background: "rgba(0,0,0,0.04)" }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L14.5 5.5v5L8 14.5 1.5 10.5v-5z" stroke="#C9A24C" strokeWidth="1.2" strokeLinejoin="round" />
              <circle cx="8" cy="8" r="1.8" fill="#C9A24C" opacity="0.55" />
            </svg>
            <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--app-font-mono)", color: "#C9A24C", opacity: 0.65 }}>{cfg.panelLabel}</span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {!hasFeedback && !isAnalyzing && !error && (
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                <div style={{ width: 32, height: 32, margin: "0 auto 14px", borderRadius: "50%", background: "rgba(201,162,76,0.06)", border: "1px solid rgba(201,162,76,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5L14.5 5.5v5L8 14.5 1.5 10.5v-5z" stroke="#C9A24C" strokeWidth="1.2" strokeLinejoin="round" opacity="0.6" />
                    <circle cx="8" cy="8" r="1.5" fill="#C9A24C" opacity="0.5" />
                  </svg>
                </div>
                <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--atlas-muted)", opacity: 0.38, fontFamily: "var(--app-font-mono)", letterSpacing: "0.03em", maxWidth: 200, margin: "0 auto" }}>
                  {cfg.emptyHint}
                </p>
              </div>
            )}

            {error && (
              <div style={{ margin: "16px", padding: "12px 14px", background: "rgba(196,112,112,0.06)", border: "1px solid rgba(196,112,112,0.18)", borderRadius: 8 }}>
                <p style={{ fontSize: 11.5, color: "#C47070", fontFamily: "var(--app-font-mono)", margin: 0 }}>{error}</p>
              </div>
            )}

            {isAnalyzing && !sections.length && (
              <div style={{ padding: "12px 16px" }}>
                <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--atlas-fg)", opacity: streamBuffer ? 0.65 : 0.3, whiteSpace: "pre-wrap", fontFamily: "var(--app-font-sans)", margin: 0 }}>
                  {streamBuffer || (profile === "strategy" ? "Consulting the decision ledger…" : "Reading your text…")}
                </p>
              </div>
            )}

            {sections.map((section, idx) => {
              const isOpen = openSections.has(section.title);
              return (
                <div key={section.title} style={{ borderBottom: idx < sections.length - 1 ? "1px solid rgba(201,162,76,0.05)" : "none" }}>
                  <button
                    type="button"
                    onClick={() => setOpenSections(prev => {
                      const next = new Set(prev);
                      if (next.has(section.title)) next.delete(section.title);
                      else next.add(section.title);
                      return next;
                    })}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "9px 16px",
                      background: isOpen ? section.accentColor : "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 120ms ease",
                    }}
                  >
                    <span style={{ fontSize: 8, color: section.color, opacity: 0.7, width: 8, flexShrink: 0, transition: "transform 150ms ease", display: "inline-block", transform: isOpen ? "none" : "rotate(-90deg)" }}>▼</span>
                    <span style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--app-font-mono)", fontWeight: 600, color: section.color, opacity: 0.85 }}>{section.title}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "4px 16px 14px 20px" }}>
                      {renderContent(section.content, section.color)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Revision history strip ────────────────────────────────────────── */}
      {revisions.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(201,162,76,0.07)", padding: "5px 14px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, overflowX: "auto", background: "rgba(0,0,0,0.06)" }}>
          <span style={{ fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35, whiteSpace: "nowrap", flexShrink: 0 }}>History</span>
          {revisions.map((rev, i) => (
            <button
              key={rev.id}
              type="button"
              onClick={() => {
                setSections(rev.sections);
                setOpenSections(new Set(rev.sections.map(s => s.title)));
                setStreamBuffer("");
                setError(null);
              }}
              style={{
                padding: "3px 10px",
                fontSize: 9.5,
                fontFamily: "var(--app-font-mono)",
                background: "rgba(201,162,76,0.04)",
                border: "1px solid rgba(201,162,76,0.10)",
                borderRadius: 4,
                color: "var(--atlas-muted)",
                opacity: i === 0 ? 0.75 : 0.45,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "opacity 120ms ease",
              }}
            >
              {i === 0
                ? `${rev.profile === "strategy" ? "Strat" : "Ed"} v${revisions.length} · current`
                : `${rev.profile === "strategy" ? "S" : "E"}${revisions.length - i} · ${formatRelativeTime(rev.timestamp)}`}
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes atlas-write-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
