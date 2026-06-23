import { useState } from "react";
import { Brain, Loader2, Sparkles, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Insight {
  icon: string;
  title: string;
  detail: string;
}

interface ArcInsightsPanelProps {
  totalViews: number;
  uniqueViewers: number;
  avgTime: number;
  slideData: { slide: string; views: number; avgTime: number; uniqueViewers: number }[];
  pollData?: { question: string; votes: number; uniqueVoters: number }[];
}

export default function ArcInsightsPanel({ totalViews, uniqueViewers, avgTime, slideData, pollData }: ArcInsightsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);

  const generate = async () => {
    if (totalViews === 0) {
      toast.error("No analytics data to analyze yet");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analytics-insights", {
        body: { totalViews, uniqueViewers, avgTime, slideData, pollData },
      });
      if (error) throw error;
      setInsights(data.insights || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> Arc Insights
          </CardTitle>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {insights.length > 0 ? "Refresh" : "Analyze"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Arc is analyzing your data…</span>
            </motion.div>
          ) : insights.length > 0 ? (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              {insights.map((insight, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <span className="text-lg shrink-0">{insight.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{insight.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{insight.detail}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
              <Lightbulb className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Click "Analyze" to get AI-powered insights about your audience engagement patterns.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
