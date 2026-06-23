import { useState } from "react";
import { History, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSlideVersions, useSaveVersion, type SlideVersion } from "@/hooks/useSlideVersions";
import { useUpdateSlide } from "@/hooks/useSlides";
import type { Json } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface VersionHistoryPanelProps {
  slideId: string;
  presentationId: string;
  currentContent: Json;
  currentNotes: string | null;
  blockType: string;
}

export default function VersionHistoryPanel({ slideId, presentationId, currentContent, currentNotes, blockType }: VersionHistoryPanelProps) {
  const { data: versions = [], isLoading } = useSlideVersions(slideId);
  const saveVersion = useSaveVersion();
  const updateSlide = useUpdateSlide();

  const handleSaveSnapshot = () => {
    saveVersion.mutate(
      { slide_id: slideId, presentation_id: presentationId, block_type: blockType, content: currentContent, notes: currentNotes },
      { onSuccess: () => toast.success("Version saved") }
    );
  };

  const handleRestore = (version: SlideVersion) => {
    updateSlide.mutate(
      { id: slideId, content: version.content, notes: version.notes },
      { onSuccess: () => toast.success(`Restored to v${version.version_number}`) }
    );
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <History className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Version History</span>
      </div>

      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={handleSaveSnapshot} disabled={saveVersion.isPending}>
        <Save className="w-3 h-3" /> Save Snapshot
      </Button>

      <p className="text-[10px] text-muted-foreground">
        Save a snapshot before making big changes. Restore any previous version at any time.
      </p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No versions saved yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-secondary/30 text-xs">
              <div>
                <span className="font-medium">v{v.version_number}</span>
                <span className="text-muted-foreground ml-2">
                  {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                </span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRestore(v)} title="Restore this version">
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
