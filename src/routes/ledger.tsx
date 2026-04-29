import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  formatCost,
  relativeTime,
  type LedgerEntry,
  type LedgerStatus,
  type Project,
} from "@/lib/atlas";
import { StatusTag } from "@/components/atlas/StatusTag";
import { AddEntryDialog } from "@/components/atlas/AddEntryDialog";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import { AtlasNav } from "@/components/atlas/AtlasNav";

export const Route = createFileRoute("/ledger")({
  component: ArchitecturalLedger,
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
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [e, p] = await Promise.all([
      supabase
        .from("ledger_entries")
        .select("*, projects(name)")
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("*").order("name"),
    ]);
    if (e.data) setEntries(e.data as unknown as LedgerEntry[]);
    if (p.data) setProjects(p.data as Project[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) load();
  }, [user]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (projectFilter !== "all" && e.project_id !== projectFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      return true;
    });
  }, [entries, projectFilter, statusFilter]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 md:pb-1 md:pl-14">
      <FooterAuditLine />
      <AtlasNav />

      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-6 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <Link to="/" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
                ← Workspace
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ember)]">
                Architectural Ledger
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">
              Architectural Ledger
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-1.5">
              Permanent record · Commit Mode · {entries.length} entries
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

      {/* Filter bar */}
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
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All statuses" },
              { value: "Active", label: "Active" },
              { value: "Superseded", label: "Superseded" },
              { value: "Violated", label: "Violated" },
            ]}
          />
          {(projectFilter !== "all" || statusFilter !== "all") && (
            <button
              onClick={() => {
                setProjectFilter("all");
                setStatusFilter("all");
              }}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground"
            >
              clear filters
            </button>
          )}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {filtered.length} / {entries.length}
          </span>
        </div>
      </div>

      {/* Table */}
      <main className="max-w-[1400px] mx-auto px-8 py-6">
        {loading ? (
          <div className="py-24 text-center font-mono text-xs text-muted-foreground">
            loading ledger…
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
                  <th className="text-left font-normal py-2 px-4 w-[28%]">Decision</th>
                  <th className="text-left font-normal py-2 px-4 w-[14%]">Project</th>
                  <th className="text-left font-normal py-2 px-4 w-[10%]">Status</th>
                  <th className="text-right font-normal py-2 px-4 w-[12%]">Cost</th>
                  <th className="text-left font-normal py-2 px-4 w-[10%]">Logged</th>
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
}: {
  entry: LedgerEntry;
  even: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const bg = even ? "bg-[color:var(--surface)]" : "bg-[color:var(--surface-alt)]";
  const notes = entry.description ?? "";
  const truncated = notes.length > 80 && !expanded;

  return (
    <tr
      className={`${bg} group border-l-2 border-l-transparent hover:border-l-[color:var(--ember)] hover:bg-[color:var(--surface-alt)] transition-colors cursor-pointer`}
      onClick={onToggle}
    >
      <td className="py-3 px-4 align-top">
        <div className="font-medium text-[13px] leading-snug">{entry.title}</div>
      </td>
      <td className="py-3 px-4 align-top text-[12px] text-muted-foreground">
        {entry.projects?.name ?? "—"}
      </td>
      <td className="py-3 px-4 align-top">
        <StatusTag status={entry.status as LedgerStatus} />
      </td>
      <td className="py-3 px-4 align-top text-right font-mono text-[12px]">
        {entry.cost_of_lesson === null ? "—" : formatCost(entry.cost_of_lesson)}
      </td>
      <td className="py-3 px-4 align-top font-mono text-[11px] text-muted-foreground">
        {relativeTime(entry.created_at)}
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
        {hasEntries ? "No entries match these filters." : "The ledger is empty."}
      </h2>
      <p className="text-xs text-muted-foreground font-mono mt-2 max-w-sm">
        {hasEntries
          ? "Adjust the project or status filter to see existing decisions."
          : "Phase 1 begins with the first committed decision. Log one to start the permanent record."}
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
