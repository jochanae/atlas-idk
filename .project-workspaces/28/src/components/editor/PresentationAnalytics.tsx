import { useState, useEffect } from "react";
import { BarChart3, Eye, Clock, Users, Dna } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SlideDNA, { getSlideMetrics, type SlideMetrics } from "@/components/SlideDNA";

interface ViewData {
  slide_index: number;
  time_spent_seconds: number;
  viewer_session: string;
  created_at: string;
}

interface PresentationAnalyticsProps {
  presentationId: string;
  slideCount: number;
  slides?: Array<{ id: string; content: any; block_type: string; notes?: string | null }>;
  onSlideClick?: (slideId: string) => void;
}

export default function PresentationAnalytics({ presentationId, slideCount, slides = [], onSlideClick }: PresentationAnalyticsProps) {
  const [views, setViews] = useState<ViewData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("presentation_views")
        .select("slide_index, time_spent_seconds, viewer_session, created_at")
        .eq("presentation_id", presentationId)
        .order("created_at", { ascending: false });
      setViews((data || []) as ViewData[]);
      setLoading(false);
    })();
  }, [presentationId]);

  if (loading) return <p className="text-xs text-muted-foreground">Loading analytics...</p>;

  const uniqueSessions = new Set(views.map((v) => v.viewer_session)).size;
  const totalViews = views.length;
  const totalTime = views.reduce((acc, v) => acc + v.time_spent_seconds, 0);

  // Per-slide engagement
  const slideData = Array.from({ length: slideCount }, (_, i) => {
    const slideViews = views.filter((v) => v.slide_index === i);
    const avgTime = slideViews.length > 0 ? slideViews.reduce((a, v) => a + v.time_spent_seconds, 0) / slideViews.length : 0;
    return { index: i, views: slideViews.length, avgTime: Math.round(avgTime) };
  });

  const maxViews = Math.max(...slideData.map((s) => s.views), 1);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-secondary rounded-lg p-3 text-center">
          <Users className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-lg font-display font-bold">{uniqueSessions}</p>
          <p className="text-[10px] text-muted-foreground">Viewers</p>
        </div>
        <div className="bg-secondary rounded-lg p-3 text-center">
          <Eye className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-lg font-display font-bold">{totalViews}</p>
          <p className="text-[10px] text-muted-foreground">Slide Views</p>
        </div>
        <div className="bg-secondary rounded-lg p-3 text-center">
          <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-lg font-display font-bold">{Math.round(totalTime / 60)}m</p>
          <p className="text-[10px] text-muted-foreground">Total Time</p>
        </div>
      </div>

      {/* Slide DNA */}
      {slides.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Dna className="w-3 h-3" /> Presentation DNA
          </p>
          <div className="bg-secondary/40 rounded-xl p-3 border border-border">
            <SlideDNA
              metrics={getSlideMetrics(slides)}
              size="lg"
              interactive
              onSlideClick={onSlideClick}
            />
          </div>
        </div>
      )}

      {totalViews === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No views yet. Share your presentation link to start tracking engagement.
        </p>
      ) : (
        <>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Per-Slide Engagement
            </p>
            <div className="space-y-1.5">
              {slideData.map((s) => (
                <div key={s.index} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0">S{s.index + 1}</span>
                  <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all"
                      style={{ width: `${(s.views / maxViews) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">
                    {s.views} · {s.avgTime}s
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
