import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { relativeTime, formatCost, type Project } from "@/lib/atlas";
import type { Entry } from "@/lib/atlas-status";
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

function ArchitecturalLedger() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { focus } = Route.useSearch();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [e, p] = await Promise.all([
      // Ledger view = entries with status='committed'. Same object as
      // Parking Lot, different state. Single source of truth.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // When arriving with ?focus=<id>, auto-expand and scroll the entry into view.
  useEffect(() => {
    if (!focus || entries.length === 0) return;
    const exists = entries.some((e) => e.id === focus);
    if (!exists) return;
    setExpanded(focus);
    // Wait a tick for the row to render expanded, then scroll.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-entry-id="${focus}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focus, entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (projectFilter !== "all" && e.project_id !== projectFilter) return false;
      return true;
    });
  }, [entries, projectFilter]);

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
    <div className="min-h-screen bg-background text-foreground pb-1">
      <FooterAuditLine />

      <header className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-6 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <Link to="/" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
                ← Workspace
              </Link>
              <Link to="/parking-lot" className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--accent-gold)] hover:brightness-125">
                Parking Lot →
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ember)]">
                Architectural Ledger
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">
              Architectural Ledger
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-1.5">
              Locked record · {entries.length} committed
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={signOut}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground"
            >
              sign out
            </button>
            <button
              onClick={() => setDialogOpen(true)}
              className="px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] bg-[color:var(--ember)] text-[color:var(--background)] rounded-sm hover:brightness-110 transition-all"
            >
              + Add Entry
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-[color:var(--surface)]/40">
        <div className="max-w-[1400px] mx-auto px-8 py-3 flex items-center gap-4">
          <FilterSelect
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { value: "all", label: "All projects" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          {projectFilter !== "all" && (
            <button
              onClick={() => setProjectFilter("all")}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground"
            >
              clear filter
            </button>
          )}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {filtered.length} / {entries.length}
          </span>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-8 py-6">
        {loading ? (
          <div className="py-24 flex items-center justify-center">
            <LoadingSpinner size="lg" text="Loading ledger…" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasEntries={entries.length > 0}
            onAdd={() => setDialogOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] font-mono text-muted-foreground">
                  <th className="text-left font-normal py-2 px-4 w-[30%]">Decision</th>
                  <th className="text-left font-normal py-2 px-4 w-[14%]">Project</th>
                  <th className="text-left font-normal py-2 px-4 w-[10%]">State</th>
                  <th className="text-right font-normal py-2 px-4 w-[10%]">Cost</th>
                  <th className="text-left font-normal py-2 px-4 w-[10%]">Locked</th>
                  <th className="text-left font-normal py-2 px-4 w-[26%]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => (
                  <Row
                    key={entry.id}
                    entry={entry}
                    even={i % 2 === 0}
                    expanded={expanded === entry.id}
                    onToggle={() =>
                      setExpanded(expanded === entry.id ? null : entry.id)
                    }
                    projectName={projectName(entry.project_id)}
                    onReopen={() => handleReopen(entry)}
                    onArchive={() => handleArchive(entry)}
                    busy={busyId === entry.id}
                  />
                ))}
              </tbody>
            </table>
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

function Row({
  entry,
  even,
  expanded,
  onToggle,
  projectName,
  onReopen,
  onArchive,
  busy,
}: {
  entry: Entry;
  even: boolean;
  expanded: boolean;
  onToggle: () => void;
  projectName: string;
  onReopen: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  const bg = even ? "bg-[color:var(--surface)]" : "bg-[color:var(--surface-alt)]";
  const notes = entry.summary ?? "";
  const truncated = notes.length > 80 && !expanded;

  return (
    <>
      <tr
        data-entry-id={entry.id}
        className={`${bg} group border-l-2 ${expanded ? "border-l-[color:var(--ember)]" : "border-l-transparent"} hover:border-l-[color:var(--ember)] hover:bg-[color:var(--surface-alt)] transition-colors cursor-pointer`}
        onClick={onToggle}
      >
        <td className="py-3 px-4 align-top">
          <div className="flex items-center gap-2">
            <StatusGlyph
              severity={entry.severity}
              verb={entry.verb}
              size={14}
            />
            <div className="font-medium text-[13px] leading-snug">{entry.title}</div>
            {entry.build_id && <CapsuleTag size="xs">#{entry.build_id}</CapsuleTag>}
            {entry.supersedes_id && <CapsuleTag size="xs">REOPEN-LINK</CapsuleTag>}
          </div>
        </td>
        <td className="py-3 px-4 align-top text-[12px] text-muted-foreground">
          {projectName}
        </td>
        <td className="py-3 px-4 align-top">
          <CapsuleTag severity="committed" size="xs">LOCKED</CapsuleTag>
          {entry.is_violation && (
            <span className="ml-1.5">
              <CapsuleTag severity="blocker" size="xs">VIOLATION</CapsuleTag>
            </span>
          )}
        </td>
        <td className="py-3 px-4 align-top text-right font-mono text-[12px]">
          {entry.cost_of_lesson === null ? "—" : formatCost(entry.cost_of_lesson)}
        </td>
        <td className="py-3 px-4 align-top font-mono text-[11px] text-muted-foreground">
          {relativeTime(entry.locked_at ?? entry.created_at)}
        </td>
        <td className="py-3 px-4 align-top text-[12px] text-muted-foreground leading-relaxed">
          {notes ? (
            <span>
              {truncated ? notes.slice(0, 80) + "…" : notes}
            </span>
          ) : (
            <span className="font-mono">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className={bg}>
          <td colSpan={6} className="px-4 pb-3">
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                onClick={onReopen}
                disabled={busy}
                className="font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-[color:var(--accent-gold)] disabled:opacity-40"
              >
                Reopen
              </button>
              <button
                onClick={onArchive}
                disabled={busy}
                className="font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded-sm border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Archive
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.12em] font-mono text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background border border-border rounded-sm px-2 py-1 text-xs text-foreground focus:outline-none focus:border-[color:var(--ember)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({
  hasEntries,
  onAdd,
}: {
  hasEntries: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="py-24 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-sm border border-border flex items-center justify-center mb-5">
        <div className="w-2 h-2 bg-[color:var(--ember)]" />
      </div>
      <h2 className="text-sm font-medium">
        {hasEntries ? "No committed entries match this filter." : "The ledger is empty."}
      </h2>
      <p className="text-xs text-muted-foreground font-mono mt-2 max-w-sm">
        {hasEntries
          ? "Adjust the project filter to see other committed decisions."
          : "Phase 1 begins with the first committed decision. Park an idea, then commit it."}
      </p>
      {!hasEntries && (
        <button
          onClick={onAdd}
          className="mt-6 px-4 py-2 text-xs font-medium uppercase tracking-[0.1em] bg-[color:var(--ember)] text-[color:var(--background)] rounded-sm hover:brightness-110 transition-all"
        >
          Log First Decision
        </button>
      )}
    </div>
  );
}
