import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Project } from "@/lib/atlas";
import { entriesTable } from "@/lib/entries";
import { toast } from "sonner";

// Manual entry form. Always writes a `committed` Entry — manual additions
// to the ledger are explicit acts. To park instead, use the AI flow.
type ManualStatus = "committed";

type Props = {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onCreated: () => void;
};

export function AddEntryDialog({ open, onClose, projects, onCreated }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [newProject, setNewProject] = useState("");
  const [status] = useState<ManualStatus>("committed");
  const [violation, setViolation] = useState(false);
  const [cost, setCost] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setProjectId("");
    setNewProject("");
    setViolation(false);
    setCost("");
    setDescription("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Not signed in");
    if (!title.trim()) return toast.error("Title required");
    if (!projectId && !newProject.trim()) return toast.error("Select or create a project");

    setSubmitting(true);
    try {
      let pid = projectId;
      if (!pid) {
        const { data, error } = await supabase
          .from("projects")
          .insert({ name: newProject.trim(), user_id: user.id })
          .select("id")
          .single();
        if (error) throw error;
        pid = data.id;
      }

      const { error } = await entriesTable().insert({
        project_id: pid,
        user_id: user.id,
        status,
        severity: violation ? "blocker" : "committed",
        verb: violation ? "audit" : "note",
        title: title.trim(),
        summary: description.trim() || null,
        cost_of_lesson: cost ? Number(cost) : null,
        is_violation: violation,
      });
      if (error) throw error;

      toast.success("Decision logged");
      reset();
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to log entry";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[color:var(--surface)] border border-border rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium tracking-tight">New Ledger Entry</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Commit Mode · permanent record
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-mono"
          >
            ESC
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <Field label="Decision Title">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Use UUID primary keys across all tables"
              className="atlas-input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Project">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="atlas-input"
              >
                <option value="">— select or create —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Or new project">
              <input
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                disabled={!!projectId}
                placeholder="Project name"
                className="atlas-input disabled:opacity-40"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LedgerStatus)}
                className="atlas-input"
              >
                <option value="Active">Active</option>
                <option value="Superseded">Superseded</option>
                <option value="Violated">Violated</option>
              </select>
            </Field>
            <Field
              label="Cost of Lesson (USD)"
              hint="optional — fill in if a mistake occurred"
            >
              <input
                type="number"
                step="any"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="—"
                className="atlas-input font-mono"
              />
            </Field>
          </div>

          <Field label="Notes / Rationale">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Why this decision was made. What it prevents."
              className="atlas-input resize-none"
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider bg-[color:var(--ember)] text-[color:var(--background)] rounded-sm hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {submitting ? "Logging…" : "Commit Entry"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .atlas-input {
          width: 100%;
          background: var(--background);
          color: var(--foreground);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 8px 10px;
          font-size: 13px;
          outline: none;
          transition: border-color 120ms;
        }
        .atlas-input:focus {
          border-color: var(--ember);
        }
        .atlas-input::placeholder { color: var(--muted-text); }
      `}</style>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-mono mb-1.5">
        <span>{label}</span>
        {hint ? (
          <span className="normal-case tracking-normal text-[10px] text-muted-foreground/70">
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
