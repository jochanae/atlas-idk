import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { relativeTime, formatCost, type Project } from "@/lib/atlas";
import type { Entry, Severity, Verb } from "@/lib/atlas-status";
import { entriesTable, reopenEntry, archiveEntry } from "@/lib/entries";
import { StatusGlyph } from "@/components/atlas/StatusGlyph";
import { CapsuleTag } from "@/components/atlas/CapsuleTag";
import { AddEntryDialog } from "@/components/atlas/AddEntryDialog";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import { toast } from "sonner";

type LedgerSearch = { focus?: string };

export const Route = createFileRoute("/ledger")({
  component: ArchitecturalLedger,
  validateSearch: (search: Record<string, unknown>): LedgerSearch => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Atlas — Architectural Ledger" },
      {
        name: "description",
        content:
          "Atlas Architectural Ledger — permanent record of decisions, costs, and lessons.",
      },
    ],
  }),
});

/* ─── Category system ────────────────────────────────────────────── */

type Category = "structure" | "aesthetic" | "logic" | "general";

const CATEGORY_CONFIG: Record<
  Category,
  { label: string; color: string; borderColor: string }
> = {
  structure: {
    label: "STRUCTURE",
    color: "var(--phosphor)",
    borderColor: "color-mix(in oklab, var(--phosphor) 50%, transparent)",
  },
  aesthetic: {
    label: "AESTHETIC",
    color: "var(--accent-gold)",
    borderColor: "color-mix(in oklab, var(--accent-gold) 50%, transparent)",
  },
  logic: {
    label: "LOGIC",
    color: "var(--ember)",
    borderColor: "color-mix(in oklab, var(--ember) 50%, transparent)",
  },
  general: {
    label: "GENERAL",
    color: "var(--muted-text)",
    borderColor: "color-mix(in oklab, var(--muted-text) 50%, transparent)",
  },
};

function inferCategory(entry: Entry): Category {
  const t = (entry.title + " " + (entry.summary ?? "")).toLowerCase();
  const touched = (entry.touched ?? []).join(" ").toLowerCase();

  if (
    /blueprint|template|layout|component|route|page|scaffold|wireframe/i.test(t) ||
    /\.tsx|\.jsx|routes\/|components\//i.test(touched)
  )
    return "structure";
  if (
    /design|theme|css|style|color|font|animation|visual|ui kit/i.test(t) ||
    /\.css|styles|tailwind/i.test(touched)
  )
    return "aesthetic";
  if (
    /api|connector|function|edge|database|supabase|logic|hook|server|migration|query/i.test(t) ||
    /\.server\.|functions\/|supabase\//i.test(touched)
  )
    return "logic";
  return "general";
}

/* ─── Grouping by session/date ───────────────────────────────────── */

interface SessionGroup {
  key: string;
  label: string;
  dateLabel: string;
  entries: Entry[];
}

function groupBySession(entries: Entry[]): SessionGroup[] {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) {
    const dt = new Date(entry.created_at);
    const dateStr = dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const hour = dt.getHours();
    const period =
      hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    const timeStr = dt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const key = `${dateStr}-${period}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }

  return Array.from(map.entries()).map(([key, entries]) => {
    const dt = new Date(entries[0].created_at);
    const dateStr = dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const hour = dt.getHours();
    const period =
      hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    const timeStr = dt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return {
      key,
      label: `${period} Build — ${timeStr}`,
      dateLabel: dateStr,
      entries,
    };
  });
}

/* ─── Filter types ───────────────────────────────────────────────── */

type CategoryFilter = "all" | Category;
type SeverityFilter = "all" | "committed" | "blocker" | "parked" | "neutral";
type VerbFilter = "all" | "new" | "bug" | "perf" | "note" | "wip" | "audit" | "merge" | "plan";
type DateFilter = "all" | "today" | "week" | "month";

/* ─── Main component ─────────────────────────────────────────────── */

function ArchitecturalLedger() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { focus } = Route.useSearch();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [verbFilter, setVerbFilter] = useState<VerbFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [e, p] = await Promise.all([
      entriesTable()
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "committed")
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("*").order("name"),
    ]);
    if (e.data) setEntries(e.data as Entry[]);
    if (p.data) setProjects(p.data as Project[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) load();
  }, [user]);

  useEffect(() => {
    if (!focus || entries.length === 0) return;
    const exists = entries.some((e) => e.id === focus);
    if (!exists) return;
    setExpanded(focus);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-entry-id="${focus}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focus, entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (projectFilter !== "all" && e.project_id !== projectFilter) return false;
      if (categoryFilter !== "all" && inferCategory(e) !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          e.title.toLowerCase().includes(q) ||
          (e.summary ?? "").toLowerCase().includes(q) ||
          (e.details ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [entries, projectFilter, categoryFilter, searchQuery]);

  const groups = useMemo(() => groupBySession(filtered), [filtered]);

  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? "—";

  const handleReopen = async (entry: Entry) => {
    setBusyId(entry.id);
    try {
      await reopenEntry(entry);
      toast.success("Reopened — draft created in Parking Lot");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reopen failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (entry: Entry) => {
    setBusyId(entry.id);
    try {
      await archiveEntry(entry.id);
      toast.success("Archived");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <FooterAuditLine />

      {/* ─── Compact header ─── */}
      <header
        style={{
          padding: "14px 18px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Link
            to="/"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase" as const,
              color: "var(--muted-text)",
              textDecoration: "none",
            }}
          >
            ← Workspace
          </Link>
          <Link
            to="/parking-lot"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase" as const,
              color: "var(--accent-gold)",
              textDecoration: "none",
            }}
          >
            Parking Lot →
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Ledger
            </h1>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--muted-text)",
                margin: "4px 0 0",
                letterSpacing: "0.06em",
              }}
            >
              {entries.length} committed · Locked record
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Search toggle */}
            <button
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search ledger"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: searchOpen ? "var(--surface-alt)" : "transparent",
                border: searchOpen
                  ? "1px solid var(--accent-gold)"
                  : "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: searchOpen ? "var(--accent-gold)" : "var(--muted-text)",
                cursor: "pointer",
                transition: "all 160ms ease",
              }}
            >
              <svg viewBox="0 0 16 16" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={1.5}>
                <circle cx="6.5" cy="6.5" r="4" />
                <path d="M10 10l3.5 3.5" strokeLinecap="round" />
              </svg>
            </button>
            {/* Add */}
            <button
              onClick={() => setDialogOpen(true)}
              style={{
                padding: "7px 14px",
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                background: "var(--ember)",
                color: "var(--background)",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              + Add
            </button>
          </div>
        </div>
      </header>

      {/* ─── Search bar (collapsible) ─── */}
      {searchOpen && (
        <div
          style={{
            padding: "8px 18px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decisions..."
            style={{
              width: "100%",
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--foreground)",
              outline: "none",
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>
      )}

      {/* ─── Category filter pills ─── */}
      <div
        style={{
          padding: "10px 18px",
          display: "flex",
          gap: 6,
          overflowX: "auto",
          scrollbarWidth: "none" as const,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {(["all", "structure", "aesthetic", "logic", "general"] as const).map(
          (cat) => {
            const isActive = categoryFilter === cat;
            const cfg =
              cat === "all"
                ? { label: "ALL", color: "var(--foreground)", borderColor: "var(--border)" }
                : CATEGORY_CONFIG[cat];
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  flexShrink: 0,
                  padding: "4px 12px",
                  borderRadius: 14,
                  border: `1px solid ${isActive ? cfg.color : "var(--border)"}`,
                  background: isActive
                    ? `color-mix(in oklab, ${cfg.color} 12%, transparent)`
                    : "transparent",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: isActive ? cfg.color : "var(--muted-text)",
                  cursor: "pointer",
                  transition: "all 160ms ease",
                }}
              >
                {cfg.label}
              </button>
            );
          }
        )}
        {/* Project filter inline */}
        {projects.length > 1 && (
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            style={{
              flexShrink: 0,
              marginLeft: "auto",
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "4px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.06em",
              color: "var(--muted-text)",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ─── Timeline ─── */}
      <main style={{ padding: "0 18px" }}>
        {loading ? (
          <div style={{ padding: "80px 0", display: "flex", justifyContent: "center" }}>
            <LoadingSpinner size="lg" text="Loading ledger…" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasEntries={entries.length > 0}
            onAdd={() => setDialogOpen(true)}
          />
        ) : (
          <div style={{ position: "relative", paddingLeft: 20, paddingTop: 16 }}>
            {/* Gold timeline spine */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 7,
                top: 0,
                bottom: 0,
                width: 1,
                background:
                  "linear-gradient(180deg, var(--accent-gold), color-mix(in oklab, var(--accent-gold) 20%, transparent))",
              }}
            />

            {groups.map((group, gi) => (
              <div key={group.key} style={{ marginBottom: 24 }}>
                {/* Sticky date header */}
                <div
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    paddingBottom: 8,
                    paddingTop: 4,
                    background: "var(--background)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginLeft: -20,
                    }}
                  >
                    {/* Node on spine */}
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "2px solid var(--accent-gold)",
                        background: "var(--background)",
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase" as const,
                          color: "var(--accent-gold)",
                          fontWeight: 600,
                        }}
                      >
                        {group.dateLabel}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--muted-text)",
                          letterSpacing: "0.06em",
                          marginTop: 1,
                        }}
                      >
                        {group.label} · {group.entries.length} commit
                        {group.entries.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Entries within group */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.entries.map((entry) => {
                    const cat = inferCategory(entry);
                    const isExpanded = expanded === entry.id;
                    return (
                      <TimelineCard
                        key={entry.id}
                        entry={entry}
                        category={cat}
                        expanded={isExpanded}
                        onToggle={() =>
                          setExpanded(isExpanded ? null : entry.id)
                        }
                        projectName={projectName(entry.project_id)}
                        onReopen={() => handleReopen(entry)}
                        onArchive={() => handleArchive(entry)}
                        busy={busyId === entry.id}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <AddEntryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        projects={projects}
        onCreated={load}
      />
    </div>
  );
}

/* ─── Timeline Card ──────────────────────────────────────────────── */

function TimelineCard({
  entry,
  category,
  expanded,
  onToggle,
  projectName,
  onReopen,
  onArchive,
  busy,
}: {
  entry: Entry;
  category: Category;
  expanded: boolean;
  onToggle: () => void;
  projectName: string;
  onReopen: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  const cfg = CATEGORY_CONFIG[category];

  return (
    <div
      data-entry-id={entry.id}
      style={{ position: "relative", marginLeft: -20 }}
    >
      {/* Small dot on the spine */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 4,
          top: 16,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: cfg.color,
          zIndex: 2,
        }}
      />

      {/* Card */}
      <div
        onClick={onToggle}
        style={{
          marginLeft: 24,
          background: expanded
            ? "rgba(28, 25, 23, 0.88)"
            : "rgba(28, 25, 23, 0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: expanded
            ? `1px solid color-mix(in oklab, var(--accent-gold) 25%, transparent)`
            : "1px solid var(--border)",
          borderRadius: 10,
          cursor: "pointer",
          transition: "all 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          boxShadow: expanded
            ? "0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)"
            : "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        {/* Collapsed: title + timestamp + badge */}
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <StatusGlyph severity={entry.severity} verb={entry.verb} size={14} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1.3,
                  color: "var(--foreground)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: expanded ? "normal" : "nowrap",
                }}
              >
                {entry.title}
              </span>
              {/* Category badge */}
              <span
                style={{
                  flexShrink: 0,
                  padding: "1px 7px",
                  borderRadius: 3,
                  fontSize: 8.5,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase" as const,
                  color: cfg.color,
                  background: `color-mix(in oklab, ${cfg.color} 12%, transparent)`,
                  border: `0.5px solid ${cfg.borderColor}`,
                }}
              >
                {cfg.label}
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--muted-text)",
                marginTop: 3,
                letterSpacing: "0.04em",
              }}
            >
              {relativeTime(entry.locked_at ?? entry.created_at)}
              {entry.build_id && (
                <span style={{ marginLeft: 6, opacity: 0.7 }}>
                  #{entry.build_id}
                </span>
              )}
            </div>
          </div>

          {/* Expand chevron */}
          <svg
            viewBox="0 0 16 16"
            width={12}
            height={12}
            stroke="var(--muted-text)"
            fill="none"
            strokeWidth={1.8}
            style={{
              flexShrink: 0,
              transition: "transform 200ms ease",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div
            style={{
              borderTop: "1px solid color-mix(in oklab, var(--accent-gold) 12%, transparent)",
              padding: "12px 14px",
              animation: "atlas-sys-item-in 180ms ease forwards",
            }}
          >
            {/* Summary */}
            {entry.summary && (
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "color-mix(in oklab, var(--foreground) 80%, transparent)",
                  margin: "0 0 10px",
                }}
              >
                {entry.summary}
              </p>
            )}

            {/* Details (code diff or long-form) */}
            {entry.details && (
              <pre
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: "color-mix(in oklab, var(--foreground) 75%, transparent)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "var(--surface-alt)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  margin: "0 0 10px",
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {entry.details}
              </pre>
            )}

            {/* Touched files */}
            {entry.touched && entry.touched.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase" as const,
                    color: "var(--muted-text)",
                    marginBottom: 4,
                  }}
                >
                  Touched
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {entry.touched.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--accent-gold)",
                        padding: "2px 6px",
                        borderRadius: 3,
                        background:
                          "color-mix(in oklab, var(--accent-gold) 8%, transparent)",
                        border:
                          "0.5px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Meta row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <CapsuleTag severity="committed" size="xs">
                LOCKED
              </CapsuleTag>
              {entry.is_violation && (
                <CapsuleTag severity="blocker" size="xs">
                  VIOLATION
                </CapsuleTag>
              )}
              {entry.cost_of_lesson !== null &&
                entry.cost_of_lesson !== undefined && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--muted-text)",
                    }}
                  >
                    Cost: {formatCost(entry.cost_of_lesson)}
                  </span>
                )}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--muted-text)",
                }}
              >
                {projectName}
              </span>
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 6,
                borderTop:
                  "1px solid color-mix(in oklab, var(--accent-gold) 10%, transparent)",
                paddingTop: 10,
              }}
            >
              <ActionButton onClick={onReopen} disabled={busy}>
                Reopen
              </ActionButton>
              <ActionButton onClick={onArchive} disabled={busy}>
                Archive
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Small action button ────────────────────────────────────────── */

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase" as const,
        padding: "5px 12px",
        borderRadius: 4,
        border: "0.5px solid color-mix(in oklab, var(--accent-gold) 40%, transparent)",
        background: "transparent",
        color: "color-mix(in oklab, var(--accent-gold) 80%, var(--foreground))",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

/* ─── Empty state ────────────────────────────────────────────────── */

function EmptyState({
  hasEntries,
  onAdd,
}: {
  hasEntries: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        padding: "80px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 4,
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <div
          style={{ width: 8, height: 8, background: "var(--ember)", borderRadius: 1 }}
        />
      </div>
      <h2 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
        {hasEntries
          ? "No entries match this filter."
          : "The ledger is empty."}
      </h2>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--muted-text)",
          marginTop: 8,
          maxWidth: 300,
        }}
      >
        {hasEntries
          ? "Adjust your filters to see other committed decisions."
          : "Phase 1 begins with the first committed decision. Park an idea, then commit it."}
      </p>
      {!hasEntries && (
        <button
          onClick={onAdd}
          style={{
            marginTop: 20,
            padding: "8px 18px",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            background: "var(--ember)",
            color: "var(--background)",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Log First Decision
        </button>
      )}
    </div>
  );
}
