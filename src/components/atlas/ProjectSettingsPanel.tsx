/**
 * ProjectSettingsPanel — project-level settings accessible from the inspector.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/atlas";

type Props = {
  project: Project | null;
  onProjectUpdate?: (updated: Project) => void;
};

export function ProjectSettingsPanel({ project, onProjectUpdate }: Props) {
  const [name, setName] = useState(project?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(project?.name ?? "");
    setSaved(false);
  }, [project?.id, project?.name]);

  const handleSave = async () => {
    if (!project || !name.trim() || name === project.name) return;
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({ name: name.trim() })
      .eq("id", project.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      onProjectUpdate?.({ ...project, name: name.trim() });
      setTimeout(() => setSaved(false), 2000);
    }
  };

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <p className="text-[11px] font-mono text-muted-foreground">No project selected.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
          Project Settings
        </h3>
      </div>

      {/* Project Name */}
      <div className="space-y-2">
        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Project Name
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            className="flex-1 px-3 py-1.5 rounded-md bg-card/50 border border-border/40 text-sm text-foreground font-mono focus:outline-none focus:border-accent/50"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || name === project.name}
            className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider bg-accent/10 text-accent-foreground hover:bg-accent/20 disabled:opacity-30 transition-colors"
          >
            {saving ? "…" : saved ? "✓" : "Save"}
          </button>
        </div>
      </div>

      {/* Project Info */}
      <div className="space-y-2 pt-2 border-t border-border/30">
        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Status
        </label>
        <p className="text-[11px] font-mono text-foreground/80">{project.status}</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Created
        </label>
        <p className="text-[11px] font-mono text-foreground/80">
          {new Date(project.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Project ID
        </label>
        <p className="text-[10px] font-mono text-muted-foreground/60 break-all select-all">
          {project.id}
        </p>
      </div>
    </div>
  );
}
