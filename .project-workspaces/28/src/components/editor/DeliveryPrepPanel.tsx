import { useState } from "react";
import { Loader2, MessageCircleQuestion, Sparkles, HelpCircle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Slide } from "@/hooks/useSlides";

interface QAPrediction {
  question: string;
  difficulty: "easy" | "medium" | "hard";
  suggested_answer: string;
}

interface ConfidencePrompt {
  slide_number: number;
  talking_points: string[];
  delivery_tip: string;
}

interface DeliveryPrepPanelProps {
  slides: Slide[];
}

export default function DeliveryPrepPanel({ slides }: DeliveryPrepPanelProps) {
  const [qaPredictions, setQaPredictions] = useState<QAPrediction[]>([]);
  const [confidencePrompts, setConfidencePrompts] = useState<ConfidencePrompt[]>([]);
  const [loadingQA, setLoadingQA] = useState(false);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [activeTab, setActiveTab] = useState<"qa" | "prompts">("qa");
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  const fetchData = async (mode: "qa" | "prompts") => {
    const setter = mode === "qa" ? setLoadingQA : setLoadingPrompts;
    setter(true);
    try {
      const session = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arc-qa-prep`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({
          slides: slides.map((s) => ({
            block_type: s.block_type,
            content: s.content,
            notes: s.notes,
          })),
          mode: mode === "qa" ? "qa" : "confidence",
        }),
      });
      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("Credits exhausted"); return; }
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      if (mode === "qa") setQaPredictions(data.questions || []);
      else setConfidencePrompts(data.slides || []);
    } catch {
      toast.error("Failed to generate — try again");
    } finally {
      setter(false);
    }
  };

  const difficultyColor: Record<string, string> = {
    easy: "bg-green-500/15 text-green-400 border-green-500/20",
    medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    hard: "bg-destructive/15 text-destructive border-destructive/20",
  };

  return (
    <div className="space-y-4">
      {/* Tab toggle */}
      <div className="flex gap-1 bg-secondary rounded-lg p-1">
        <button
          onClick={() => setActiveTab("qa")}
          className={`flex-1 text-xs py-1.5 px-3 rounded-md transition-colors ${activeTab === "qa" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <MessageCircleQuestion className="w-3 h-3 inline mr-1" /> Q&A Prep
        </button>
        <button
          onClick={() => setActiveTab("prompts")}
          className={`flex-1 text-xs py-1.5 px-3 rounded-md transition-colors ${activeTab === "prompts" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Lightbulb className="w-3 h-3 inline mr-1" /> Confidence
        </button>
      </div>

      {activeTab === "qa" ? (
        <div className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => fetchData("qa")}
            disabled={loadingQA || slides.length === 0}
          >
            {loadingQA ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {qaPredictions.length > 0 ? "Regenerate Questions" : "Predict Audience Questions"}
          </Button>

          {qaPredictions.length > 0 && (
            <div className="space-y-2">
              {qaPredictions.map((q, i) => (
                <div
                  key={i}
                  className="border border-border rounded-lg p-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                >
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{q.question}</p>
                      <Badge variant="outline" className={`mt-1 text-[10px] ${difficultyColor[q.difficulty]}`}>
                        {q.difficulty}
                      </Badge>
                    </div>
                  </div>
                  {expandedQ === i && (
                    <div className="mt-2 pl-5 text-sm text-muted-foreground border-t border-border pt-2">
                      <p className="text-xs font-medium text-foreground mb-1">Suggested answer:</p>
                      {q.suggested_answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => fetchData("prompts")}
            disabled={loadingPrompts || slides.length === 0}
          >
            {loadingPrompts ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {confidencePrompts.length > 0 ? "Regenerate Prompts" : "Generate Confidence Prompts"}
          </Button>

          {confidencePrompts.length > 0 && (
            <div className="space-y-3">
              {confidencePrompts.map((cp) => (
                <div key={cp.slide_number} className="border border-border rounded-lg p-3">
                  <p className="text-xs font-medium text-primary mb-2">Slide {cp.slide_number}</p>
                  <ul className="space-y-1 mb-2">
                    {cp.talking_points.map((tp, j) => (
                      <li key={j} className="text-sm text-foreground flex items-start gap-1.5">
                        <span className="text-primary mt-1">•</span> {tp}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> {cp.delivery_tip}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
