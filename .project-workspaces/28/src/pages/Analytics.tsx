import { useEffect, useState, useMemo, useCallback } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BarChart3, Eye, Clock, Layers, TrendingUp, Users, Activity, PieChart, ArrowDown, ChevronDown, ChevronUp, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import EngagementHeatmap from "@/components/analytics/EngagementHeatmap";
import ExportAnalyticsButton from "@/components/analytics/ExportAnalyticsButton";
import ArcInsightsPanel from "@/components/analytics/ArcInsightsPanel";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { usePresentations } from "@/hooks/usePresentations";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart as RePieChart, Pie, Cell, CartesianGrid } from "recharts";

interface ViewRow {
  presentation_id: string;
  slide_index: number;
  time_spent_seconds: number;
  viewer_session: string;
  created_at: string;
}

interface PollRow {
  id: string;
  presentation_id: string;
  question: string;
  is_active: boolean;
}

interface VoteRow {
  poll_id: string;
  option_index: number;
  voter_session: string;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 160 60% 45%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
];

export default function Analytics() {
  const { data: presentations = [] } = usePresentations();
  const [views, setViews] = useState<ViewRow[]>([]);
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPresId, setSelectedPresId] = useState<string>("all");
  const [expandedPres, setExpandedPres] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const presIds = presentations.map((p) => p.id);
      if (presIds.length === 0) { setLoading(false); return; }

      const [viewRes, pollRes] = await Promise.all([
        supabase
          .from("presentation_views")
          .select("presentation_id, slide_index, time_spent_seconds, viewer_session, created_at")
          .in("presentation_id", presIds)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("live_polls")
          .select("id, presentation_id, question, is_active")
          .in("presentation_id", presIds),
      ]);

      const viewData = (viewRes.data || []) as ViewRow[];
      const pollData = (pollRes.data || []) as PollRow[];
      setViews(viewData);
      setPolls(pollData);

      // Fetch votes for all polls
      if (pollData.length > 0) {
        const pollIds = pollData.map((p) => p.id);
        const { data: voteData } = await supabase
          .from("poll_votes")
          .select("poll_id, option_index, voter_session")
          .in("poll_id", pollIds);
        setVotes((voteData || []) as VoteRow[]);
      }

      setLoading(false);
    })();
  }, [presentations]);

  const filteredViews = useMemo(() =>
    selectedPresId === "all" ? views : views.filter((v) => v.presentation_id === selectedPresId),
    [views, selectedPresId]
  );

  const totalViews = filteredViews.length;
  const uniqueViewers = new Set(filteredViews.map((v) => v.viewer_session)).size;
  const totalTime = filteredViews.reduce((a, v) => a + v.time_spent_seconds, 0);
  const avgTimePerView = totalViews > 0 ? Math.round(totalTime / totalViews) : 0;

  // Slide-by-slide engagement
  const slideEngagement = useMemo(() => {
    const map = new Map<number, { views: number; totalTime: number; sessions: Set<string> }>();
    filteredViews.forEach((v) => {
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
        slideIndex: index,
        views: data.views,
        avgTime: data.views > 0 ? Math.round(data.totalTime / data.views) : 0,
        uniqueViewers: data.sessions.size,
      }));
  }, [filteredViews]);

  // Drop-off analysis
  const dropOff = useMemo(() => {
    if (slideEngagement.length === 0) return [];
    const maxViewers = Math.max(...slideEngagement.map((s) => s.uniqueViewers));
    return slideEngagement.map((s) => ({
      ...s,
      retention: maxViewers > 0 ? Math.round((s.uniqueViewers / maxViewers) * 100) : 0,
    }));
  }, [slideEngagement]);

  // Hourly distribution
  const hourlyData = useMemo(() => {
    const hours = new Array(24).fill(0);
    filteredViews.forEach((v) => {
      const h = new Date(v.created_at).getHours();
      hours[h]++;
    });
    return hours.map((count, hour) => ({
      hour: `${hour.toString().padStart(2, "0")}:00`,
      views: count,
    }));
  }, [filteredViews]);

  // Poll participation
  const filteredPolls = useMemo(() =>
    selectedPresId === "all" ? polls : polls.filter((p) => p.presentation_id === selectedPresId),
    [polls, selectedPresId]
  );

  const pollParticipation = useMemo(() => {
    return filteredPolls.map((poll) => {
      const pollVotes = votes.filter((v) => v.poll_id === poll.id);
      const uniqueVoters = new Set(pollVotes.map((v) => v.voter_session)).size;
      return {
        question: poll.question.length > 40 ? poll.question.slice(0, 40) + "…" : poll.question,
        votes: pollVotes.length,
        uniqueVoters,
        isActive: poll.is_active,
      };
    });
  }, [filteredPolls, votes]);

  // Per-presentation stats
  const presStats = useMemo(() =>
    presentations.map((p) => {
      const pViews = views.filter((v) => v.presentation_id === p.id);
      const pPolls = polls.filter((pl) => pl.presentation_id === p.id);
      const pVotes = pPolls.flatMap((pl) => votes.filter((v) => v.poll_id === pl.id));
      return {
        id: p.id,
        title: p.title,
        views: pViews.length,
        viewers: new Set(pViews.map((v) => v.viewer_session)).size,
        avgTime: pViews.length > 0 ? Math.round(pViews.reduce((a, v) => a + v.time_spent_seconds, 0) / pViews.length) : 0,
        pollCount: pPolls.length,
        voteCount: pVotes.length,
        isPublic: p.is_public,
      };
    }).sort((a, b) => b.views - a.views),
    [presentations, views, polls, votes]
  );

  const maxViews = Math.max(...presStats.map((p) => p.views), 1);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Audience Analytics</h1>
            <p className="text-sm text-muted-foreground">Engagement metrics, drop-off analysis, and poll participation.</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedPresId !== "all" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={async () => {
                  const url = `${window.location.origin}/view/${selectedPresId}/analytics`;
                  const presTitle = presentations.find(p => p.id === selectedPresId)?.title || "Presentation";
                  if (navigator.share) {
                    try {
                      await navigator.share({
                        title: `${presTitle} — Analytics`,
                        text: `Check out the engagement analytics for "${presTitle}"`,
                        url,
                      });
                    } catch (e: any) {
                      if (e.name !== "AbortError") {
                        navigator.clipboard.writeText(url);
                        toast("Link copied to clipboard!");
                      }
                    }
                  } else {
                    navigator.clipboard.writeText(url);
                    toast("Link copied to clipboard!", { description: "Share this with stakeholders." });
                  }
                }}
              >
                <Share2 className="w-3.5 h-3.5" /> Share
              </Button>
            )}
            <ExportAnalyticsButton
              presTitle={selectedPresId === "all" ? "All" : presentations.find(p => p.id === selectedPresId)?.title || ""}
              totalViews={totalViews}
              uniqueViewers={uniqueViewers}
              avgTime={avgTimePerView}
              slideData={slideEngagement}
            />
            <Select value={selectedPresId} onValueChange={setSelectedPresId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All presentations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Presentations</SelectItem>
                {presentations.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Views", value: totalViews, icon: Eye, color: "text-primary" },
            { label: "Unique Viewers", value: uniqueViewers, icon: Users, color: "text-primary" },
            { label: "Avg Time/View", value: `${avgTimePerView}s`, icon: Clock, color: "text-primary" },
            { label: "Active Polls", value: filteredPolls.filter((p) => p.is_active).length, icon: Activity, color: "text-primary" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <s.icon className={`w-4 h-4 ${s.color}`} />
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

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="md" text="Loading analytics…" /></div>
        ) : totalViews === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <h3 className="font-semibold mb-1">No analytics data yet</h3>
              <p className="text-sm text-muted-foreground">Share a presentation publicly to start tracking viewer engagement.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Arc AI Insights */}
            <ArcInsightsPanel
              totalViews={totalViews}
              uniqueViewers={uniqueViewers}
              avgTime={avgTimePerView}
              slideData={slideEngagement}
              pollData={pollParticipation}
            />

            {/* Engagement Heatmap */}
            <EngagementHeatmap views={filteredViews} slideCount={slideEngagement.length || 10} />

            {/* Slide-by-Slide Engagement */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Slide-by-Slide Engagement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={slideEngagement} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="slide" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Bar dataKey="avgTime" name="Avg Time (s)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Drop-off + Hourly in a grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Retention/Drop-off */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowDown className="w-4 h-4 text-destructive" /> Viewer Retention
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dropOff}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="slide" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                          formatter={(value: number) => [`${value}%`, "Retention"]}
                        />
                        <Area type="monotone" dataKey="retention" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Hourly Activity */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Viewing Hours
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={3} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="views" name="Views" fill="hsl(var(--primary) / 0.7)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Poll Participation */}
            {pollParticipation.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-primary" /> Poll Participation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {pollParticipation.map((pp, i) => (
                      <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate flex-1">{pp.question}</p>
                          <Badge variant={pp.isActive ? "default" : "secondary"} className="text-[9px] ml-2 shrink-0">
                            {pp.isActive ? "Live" : "Closed"}
                          </Badge>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{pp.votes} votes</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{pp.uniqueVoters} voters</span>
                        </div>
                        <Progress value={Math.min(pp.uniqueVoters * 10, 100)} className="h-1.5" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Per-Presentation Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" /> Presentation Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {presStats.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border p-3 hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedPres(expandedPres === p.id ? null : p.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium truncate flex-1">{p.title}</span>
                        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{p.views}</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.viewers}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.avgTime}s</span>
                          {p.pollCount > 0 && <Badge variant="outline" className="text-[9px]">{p.pollCount} polls</Badge>}
                          {p.isPublic && <Badge variant="secondary" className="text-[9px]">Public</Badge>}
                        </div>
                        {expandedPres === p.id ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      <Progress value={(p.views / maxViews) * 100} className="h-1.5 mt-2" />

                      {expandedPres === p.id && (
                        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="text-center">
                            <p className="text-lg font-bold">{p.views}</p>
                            <p className="text-[10px] text-muted-foreground">Total Views</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold">{p.viewers}</p>
                            <p className="text-[10px] text-muted-foreground">Unique Viewers</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold">{p.avgTime}s</p>
                            <p className="text-[10px] text-muted-foreground">Avg Time/View</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold">{p.voteCount}</p>
                            <p className="text-[10px] text-muted-foreground">Poll Votes</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
