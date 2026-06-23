import { useState } from "react";
import { Brain, Loader2, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

interface DebriefResult {
  summary: string;
  overallRating: "excellent" | "good" | "needs-practice";
  focusAreas: string[];
}

interface RehearsalDebriefProps {
  wpm: number;
  duration: number;
  fillerCount: number;
  fillerWords: string[];
  wordCount: number;
  slideTimings?: number[];
  onClose: () => void;
}

const ratingConfig = {
  excellent: { label: "Excellent", color: "text-green-500", bg: "bg-green-500/10 border-green-500/20" },
  good: { label: "Good Job", color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  "needs-practice": { label: "Keep Practicing", color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20" },
};

export default function RehearsalDebrief({ wpm, duration, fillerCount, fillerWords, wordCount, slideTimings, onClose }: RehearsalDebriefProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebriefResult | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rehearsal-debrief", {
        body: { wpm, duration, fillerCount, fillerWords, wordCount, slideTimings },
      });
      if (error) throw error;
      setResult(data as DebriefResult);
    } catch (e: any) {
      toast.error(e.message || "Debrief failed");
    } finally {
      setLoading(false);
    }
  };

  const rc = result ? ratingConfig[result.overallRating] || ratingConfig.good : null;

  return (
    <div className="space-y-4">
      {!result && !loading && (
        <div className="text-center py-6 space-y-3">
          <Brain className="w-10 h-10 text-primary/30 mx-auto" />
          <div>
            <p className="text-sm font-medium">Practice complete!</p>
            <p className="text-xs text-muted-foreground">Want Arc to debrief your performance?</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button size="sm" onClick={generate} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Get Debrief
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>Skip</Button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Arc is reviewing your session…</span>
        </div>
      )}

      {result && rc && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Rating badge */}
          <div className={`rounded-xl border p-4 ${rc.bg}`}>
            <p className={`text-lg font-bold ${rc.color}`}>{rc.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{wpm} WPM • {Math.round(duration / 60)}m {duration % 60}s • {fillerCount} fillers</p>
          </div>

          {/* Debrief */}
          <div className="prose prose-sm max-w-none [&>*]:text-sm [&>*]:my-2">
            <ReactMarkdown>{result.summary}</ReactMarkdown>
          </div>

          {/* Focus areas */}
          {result.focusAreas.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Focus Areas</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.focusAreas.map((area, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{area}</Badge>
                ))}
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" className="w-full" onClick={onClose}>Done</Button>
        </motion.div>
      )}
    </div>
  );
}
