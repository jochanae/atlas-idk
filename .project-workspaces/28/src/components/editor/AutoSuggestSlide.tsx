import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, Plus, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { Slide } from "@/hooks/useSlides";

interface AutoSuggestSlideProps {
  slides: Slide[];
  onAddSlide: (blockType: string, content: Record<string, unknown>) => void;
}

interface Suggestion {
  block_type: string;
  reasoning: string;
  content: Record<string, unknown>;
}

export default function AutoSuggestSlide({ slides, onAddSlide }: AutoSuggestSlideProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [open, setOpen] = useState(false);

  const handleSuggest = async () => {
    if (slides.length === 0) {
      toast.error("Add at least one slide first");
      return;
    }
    setLoading(true);
    setSuggestion(null);
    setOpen(true);

    try {
      const slidesData = slides.map((s) => ({
        block_type: s.block_type,
        content: s.content,
      }));

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-next-slide`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ slides: slidesData }),
      });

      if (resp.status === 429) { toast.error("Rate limited — try again later"); setOpen(false); return; }
      if (resp.status === 402) { toast.error("Credits exhausted — please add funds"); setOpen(false); return; }
      if (!resp.ok) throw new Error("Suggestion failed");

      const { suggestion: s } = await resp.json();
      setSuggestion(s);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate suggestion");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = () => {
    if (!suggestion) return;
    onAddSlide(suggestion.block_type, suggestion.content);
    setSuggestion(null);
    setOpen(false);
    toast.success("Slide added!");
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 border-dashed border-primary/30 text-primary hover:bg-primary/5"
        onClick={handleSuggest}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
        AI: Suggest Next Slide
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="mt-2 rounded-xl border border-primary/20 bg-card p-3 space-y-2 shadow-lg"
          >
            {loading ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Analyzing your narrative arc…</span>
              </div>
            ) : suggestion ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold capitalize">{suggestion.block_type} Slide</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setOpen(false)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{suggestion.reasoning}</p>
                <div className="text-[10px] text-muted-foreground bg-secondary rounded-md p-2 max-h-20 overflow-y-auto">
                  {Object.entries(suggestion.content)
                    .filter(([k]) => k !== "layout")
                    .map(([k, v]) => (
                      <div key={k}>
                        <span className="font-medium capitalize">{k}:</span>{" "}
                        {typeof v === "string" ? v : Array.isArray(v) ? (v as string[]).join(", ") : JSON.stringify(v)}
                      </div>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 gap-1 h-7 text-xs" onClick={handleAccept}>
                    <Plus className="w-3 h-3" /> Add Slide
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSuggest} disabled={loading}>
                    Regenerate
                  </Button>
                </div>
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
