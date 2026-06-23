import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Eye, Users, Clock, BarChart3, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts";
import LoadingSpinner from "@/components/LoadingSpinner";

interface ViewRow {
  slide_index: number;
  time_spent_seconds: number;
  viewer_session: string;
  created_at: string;
}

export default function SharedAnalytics() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState("");
  const [views, setViews] = useState<ViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      // Verify presentation is public
      const { data: pres, error: presErr } = await supabase
        .from("presentations")
        .select("title, is_public")
        .eq("id", id)
        .eq("is_public", true)
        .single();
      if (presErr || !pres) { setError("Presentation not found or not public."); setLoading(false); return; }
      setTitle(pres.title);

      const { data: viewData } = await supabase
        .from("presentation_views")
        .select("slide_index, time_spent_seconds, viewer_session, created_at")
        .eq("presentation_id", id)
        .order("created_at", { ascending: false })
        .limit(1000);
      setViews((viewData || []) as ViewRow[]);
      setLoading(false);
    })();
  }, [id]);

  const totalViews = views.length;
  const uniqueViewers = new Set(views.map((v) => v.viewer_session)).size;
  const totalTime = views.reduce((a, v) => a + v.time_spent_seconds, 0);
  const avgTime = totalViews > 0 ? Math.round(totalTime / totalViews) : 0;

  const slideEngagement = useMemo(() => {
    const map = new Map<number, { views: number; totalTime: number; sessions: Set<string> }>();
    views.forEach((v) => {
      const entry = map.get(v.slide_index) || { views: 0, totalTime: 0, sessions: new Set() };
      entry.views++;
      entry.totalTime += v.time_spent_seconds;
      entry.sessions.add(v.viewer_session);
      map.set(v.slide_index, entry);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([index, data]) => ({
        slide: `Slide ${index + 1}`,
        avgTime: data.views > 0 ? Math.round(data.totalTime / data.views) : 0,
        uniqueViewers: data.sessions.size,
      }));
  }, [views]);

  const dropOff = useMemo(() => {
    if (slideEngagement.length === 0) return [];
    const max = Math.max(...slideEngagement.map((s) => s.uniqueViewers));
    return slideEngagement.map((s) => ({
      ...s,
      retention: max > 0 ? Math.round((s.uniqueViewers / max) * 100) : 0,
    }));
  }, [slideEngagement]);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <LoadingSpinner size="md" text="Loading analytics…" />
    </div>
  );

  if (error) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">{error}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">Audience engagement summary</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Total Views", value: totalViews, icon: Eye },
            { label: "Unique Viewers", value: uniqueViewers, icon: Users },
            { label: "Avg Time/View", value: `${avgTime}s`, icon: Clock },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <s.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {totalViews === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No engagement data yet.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Slide Engagement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={slideEngagement} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="slide" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="avgTime" name="Avg Time (s)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Viewer Retention
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dropOff}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="slide" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(value: number) => [`${value}%`, "Retention"]} />
                      <Area type="monotone" dataKey="retention" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by <span className="font-semibold text-primary">PresentQ</span>
        </p>
      </div>
    </div>
  );
}
