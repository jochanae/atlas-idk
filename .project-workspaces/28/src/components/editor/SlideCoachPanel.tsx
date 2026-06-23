import { useState } from "react";
import { Brain, Loader2, Sparkles, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import type { Json } from "@/integrations/supabase/types";

interface Tip {
  area: string;
  suggestion: string;
}

interface CoachingResult {
  score: number;
  verdict: "strong" | "good" | "needs-work" | "weak";
  tips: Tip[];
  rewrite: string | null;
}

interface SlideCoachPanelProps {
  slide: { id: string; block_type: string; content: Json; notes: string | null };
  slideIndex: number;
  totalSlides: number;
  deckTitle: string;
  deckGoal?: string;
  onApplyRewrite?: (text: string) => void;
}

const verdictConfig = {
  strong: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", label: "Strong Slide" },
  good: { icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10", label: "Good" },
  "needs-work": { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Needs Work" },
  weak: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Weak" },
};

export default function SlideCoachPanel({ slide, slideIndex, totalSlides, deckTitle, deckGoal, onApplyRewrite }: SlideCoachPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoachingResult | null>(null);

  const analyze = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("coach-slide", {
        body: { slide: { block_type: slide.block_type, content: slide.content, notes: slide.notes }, slideIndex, totalSlides, deckTitle, deckGoal },
      });
      if (error) throw error;
      setResult(data as CoachingResult);
    } catch (e: any) {
      toast.error(e.message || "Coaching failed");
    } finally {
      setLoading(false);
    }
  };

  const vc = result ? verdictConfig[result.verdict] || verdictConfig.good : null;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Arc Coach</span>
      </div>

      {!result && !loading && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground mb-3">Get AI coaching feedback on this slide's clarity, messaging, and impact.</p>
          <Button size="sm" onClick={analyze} className="gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Analyze Slide
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Arc is reviewing…</span>
        </div>
      )}

      <AnimatePresence>
        {result && vc && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {/* Score */}
            <div className={`flex items-center gap-3 rounded-lg ${vc.bg} p-3`}>
              <div className="relative w-10 h-10 flex items-center justify-center">
                <span className={`text-lg font-bold ${vc.color}`}>{result.score}</span>
              </div>
              <div>
                <p className={`text-sm font-semibold ${vc.color}`}>{vc.label}</p>
                <p className="text-[10px] text-muted-foreground">Slide {slideIndex + 1} of {totalSlides}</p>
              </div>
            </div>

            {/* Tips */}
            <div className="space-y-2">
              {result.tips.map((tip, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tip.area}</p>
                  <p className="text-xs">{tip.suggestion}</p>
                </div>
              ))}
            </div>

            {/* Rewrite suggestion */}
            {result.rewrite && onApplyRewrite && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Suggested Rewrite</p>
                <p className="text-xs italic">"{result.rewrite}"</p>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => onApplyRewrite(result.rewrite!)}>
                  <ArrowRight className="w-3 h-3" /> Apply
                </Button>
              </div>
            )}

            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setResult(null); analyze(); }}>
              Re-analyze
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
