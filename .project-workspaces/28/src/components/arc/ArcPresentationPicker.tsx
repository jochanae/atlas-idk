import { useState } from "react";
import { FileText, X, ChevronDown } from "lucide-react";
import { usePresentations } from "@/hooks/usePresentations";
import type { ArcMode } from "./ArcProvider";

const modeDescriptions: Partial<Record<ArcMode, string>> = {
  coaching: "Select a deck to get specific coaching feedback",
  guided: "Optionally attach a deck to build upon",
  rewrite: "Pick a deck to remix or rewrite",
};

interface ArcPresentationPickerProps {
  mode: ArcMode;
  selectedId: string | null;
  onSelect: (id: string | null, title: string | null) => void;
}

export default function ArcPresentationPicker({ mode, selectedId, onSelect }: ArcPresentationPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: presentations = [] } = usePresentations();
  const description = modeDescriptions[mode];
  if (!description) return null;

  const activePresentations = presentations.filter((p) => !p.deleted_at);
  const selected = activePresentations.find((p) => p.id === selectedId);

  return (
    <div className="w-full px-1">
      <p className="text-[10px] text-muted-foreground mb-1.5">{description}</p>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/40 bg-secondary/40 hover:bg-secondary/60 transition-all text-sm text-left"
      >
        <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="flex-1 truncate text-foreground">
          {selected ? selected.title : "No presentation attached"}
        </span>
        {selected ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(null, null); }}
            className="shrink-0 p-0.5 rounded hover:bg-muted"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && (
        <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {activePresentations.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">No presentations yet</p>
          ) : (
            activePresentations.slice(0, 20).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSelect(p.id, p.title); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary/60 transition-colors truncate ${
                  p.id === selectedId ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
              >
                {p.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
