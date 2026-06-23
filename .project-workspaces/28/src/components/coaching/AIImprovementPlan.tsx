import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Target, CheckCircle2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { DeliveryStats } from "./LiveDeliveryFeedback";

interface AIImprovementPlanProps {
  stats: DeliveryStats | null;
  rehearsalId?: string;
}

interface PlanItem {
  area: string;
  current: string;
  target: string;
  tip: string;
}

export default function AIImprovementPlan({ stats, rehearsalId }: AIImprovementPlanProps) {
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(false);

  const generatePlan = async () => {
    if (!stats) { toast.error("Complete a practice session first"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-improvement-plan", {
        body: {
          wpm: stats.wpm,
          duration: stats.duration,
          fillerCount: stats.fillerCount,
          fillerWords: stats.fillerWords,
          wordCount: stats.wordCount,
          rehearsal_id: rehearsalId,
        },
      });

      if (error) throw error;
      if (data?.error) {
        if (data.error.includes("Rate limit")) { toast.error("Rate limited — try again later"); return; }
        if (data.error.includes("Credits")) { toast.error("AI credits exhausted"); return; }
        throw new Error(data.error);
      }

      setPlan(data.plan || []);
      toast.success("Improvement plan generated!");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> AI Improvement Plan
          </CardTitle>
          <Button
            size="sm"
            onClick={generatePlan}
            disabled={loading || !stats}
            className="gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate Plan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {plan.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Complete a practice session, then generate your personalized improvement plan.
          </p>
        ) : (
          <div className="space-y-3">
            {plan.map((item, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{item.area}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="secondary" className="text-[10px]">{item.current}</Badge>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <Badge variant="default" className="text-[10px]">{item.target}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.tip}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
