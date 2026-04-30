import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { type Project } from "@/lib/atlas";
import type { Entry } from "@/lib/atlas-status";
import {
  entriesTable,
  commitEntry,
  deleteEntry,
  resumeEntry,
} from "@/lib/entries";
import { EntryCard } from "@/components/atlas/EntryCard";
import { FooterAuditLine } from "@/components/atlas/FooterAuditLine";
import { toast } from "sonner";

export const Route = createFileRoute("/parking-lot")({
  component: ParkingLot,
  head: () => ({
    meta: [
      { title: "Atlas — Parking Lot" },
      {
        name: "description",
        content:
          "Atlas Parking Lot — open ideas and stubs awaiting commit or resolution.",
      },
    ],
  }),
});

function ParkingLot() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [e, p] = await Promise.all([
      // Parking Lot view = entries with status='parked' or 'draft'.
      // Drafts are reopened-from-committed successors awaiting recommit.
      entriesTable()
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["parked", "draft"])
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

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (projectFilter !== "all" && e.project_id !== projectFilter) return false;
      return true;
    });
  }, [entries, projectFilter]);

  const handleCommit = async (entry: Entry) => {
    setBusyId(entry.id);
    try {
      await commitEntry(entry.id);
      toast.success("Committed to ledger");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (entry: Entry) => {
    if (!confirm(`Delete "${entry.title}"? This cannot be undone.`)) return;
    setBusyId(entry.id);
    try {
      await deleteEntry(entry.id);
      toast.success("Deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleResume = async (entry: Entry) => {
    try {
      await resumeEntry(entry.id);
      // Navigate back to the workspace; if the entry has a session, deep
      // link to it. Otherwise just open the workspace.
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resume failed");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-1">
      <FooterAuditLine />

      <header className="border-b border-border">
        <div className="max-w-[1100px] mx-auto px-8 py-6 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <Link to="/" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
                ← Workspace
              </Link>
              <Link to="/ledger" className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ember)] hover:brightness-125">
                Ledger →
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--accent-gold)]">
                Parking Lot
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">
              Parking Lot
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-1.5">
              Open · {entries.length} parked
            </p>
          </div>

          <button
            onClick={signOut}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground"
          >
            sign out
          </button>
        </div>
      </header>

      <div className="border-b border-border bg-[color:var(--surface)]/40">
        <div className="max-w-[1100px] mx-auto px-8 py-3 flex items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.12em] font-mono text-muted-foreground">
              Project
            </span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="bg-background border border-border rounded-sm px-2 py-1 text-xs text-foreground focus:outline-none focus:border-[color:var(--accent-gold)]"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {filtered.length} / {entries.length}
          </span>
        </div>
      </div>

      <main className="max-w-[1100px] mx-auto px-8 py-6">
        {loading ? (
          <div className="py-24 text-center font-mono text-xs text-muted-foreground">
            loading parking lot…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-sm border border-border flex items-center justify-center mb-5">
              <div className="w-2 h-2 bg-[color:var(--accent-gold)]" />
            </div>
            <h2 className="text-sm font-medium">Nothing parked.</h2>
            <p className="text-xs text-muted-foreground font-mono mt-2 max-w-sm">
              When the AI delivers a card you're not ready to commit, park it here.
              Same object as the ledger — just unresolved.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onCommit={handleCommit}
                onDelete={handleDelete}
                onResume={handleResume}
                busy={busyId === entry.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
