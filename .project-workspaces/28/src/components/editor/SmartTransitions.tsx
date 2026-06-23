import { useState } from "react";
import { Sparkles, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TransitionType } from "@/lib/slideThemes";
import type { Slide } from "@/hooks/useSlides";

interface SmartTransitionsProps {
  slides: Slide[];
  currentTransition: TransitionType;
  onTransitionChange: (t: TransitionType) => void;
}

const transitionDescriptions: Record<string, string> = {
  none: "No animation between slides",
  fade: "Smooth cross-fade between slides",
  slide: "Horizontal slide animation",
  zoom: "Zoom in/out transition",
  flip: "3D card flip effect",
};

export default function SmartTransitions({ slides, currentTransition, onTransitionChange }: SmartTransitionsProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{ transition: TransitionType; reason: string } | null>(null);

  const handleSuggest = async () => {
    if (slides.length < 2) {
      toast.info("Add at least 2 slides for transition suggestions");
      return;
    }

    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const slidesSummary = slides.map((s, i) => {
        const c = (typeof s.content === "object" && s.content !== null && !Array.isArray(s.content))
          ? s.content as Record<string, unknown>
          : {};
        return `Slide ${i + 1} (${s.block_type}): ${c.heading || c.quote || c.metric || ""}`;
      }).join("\n");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-transition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ slidesSummary }),
      });

      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("Credits exhausted — please add funds"); return; }
      if (!resp.ok) throw new Error("Suggestion failed");

      const data = await resp.json();
      setSuggestion({ transition: data.transition, reason: data.reason });
    } catch (err) {
      console.error(err);
      toast.error("Failed to get suggestion");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!suggestion) return;
    onTransitionChange(suggestion.transition);
    toast.success(`Transition set to ${suggestion.transition}`);
    setSuggestion(null);
  };

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        onClick={handleSuggest}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        )}
        AI Suggest Transition
      </Button>

      {suggestion && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold capitalize">{suggestion.transition}</span>
          </div>
          <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
          <p className="text-[10px] text-muted-foreground italic">
            {transitionDescriptions[suggestion.transition]}
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleApply}>
              Apply
            </Button>
            <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs" onClick={() => setSuggestion(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
