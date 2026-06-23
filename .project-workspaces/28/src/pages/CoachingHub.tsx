import { useState, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import LiveDeliveryFeedback, { type DeliveryStats } from "@/components/coaching/LiveDeliveryFeedback";
import AIImprovementPlan from "@/components/coaching/AIImprovementPlan";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useRehearsalRecordings } from "@/hooks/useRehearsalRecordings";
import { useCoachingReports } from "@/hooks/useCoachingReports";
import { useRemotePresets } from "@/hooks/useRemotePresets";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Mic, Brain, Gamepad2, Plus, Trash2, Clock, Gauge, AlertTriangle,
  Star, TrendingUp, TrendingDown, Keyboard, Loader2, Sparkles, Zap,
  ChevronDown, ChevronUp, Target, MessageSquare, Play, Pause, Download,
} from "lucide-react";

/* ---- helpers ---- */
const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const scoreColor = (score: number) => {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  return "text-destructive";
};

const scoreLabel = (score: number) => {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Great";
  if (score >= 70) return "Good";
  if (score >= 60) return "Needs Work";
  return "Keep Practicing";
};

const pacingIcon = (rating: string) => {
  if (rating === "too_fast") return "🏃";
  if (rating === "too_slow") return "🐢";
  return "✅";
};

const EmptyState = ({ icon: Icon, title, desc, onAdd }: { icon: any; title: string; desc: string; onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
      <Icon className="w-7 h-7 text-primary" />
    </div>
    <h3 className="text-lg font-semibold mb-1">{title}</h3>
    <p className="text-muted-foreground text-sm max-w-sm mb-6">{desc}</p>
    <Button onClick={onAdd}><Plus className="w-4 h-4 mr-2" />Add First</Button>
  </div>
);

/* ---- Key binding editor row ---- */
const KeyRow = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm">{label}</span>
    <Input className="w-32 text-center text-xs font-mono" value={value} onChange={e => onChange(e.target.value)} />
  </div>
);

export default function CoachingHub() {
  const recordings = useRehearsalRecordings();
  const reports = useCoachingReports();
  const presets = useRemotePresets();

  const [adding, setAdding] = useState<"recording" | "report" | "preset" | null>(null);
  const [formName, setFormName] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [formScore, setFormScore] = useState(70);
  const [presetConfig, setPresetConfig] = useState(presets.DEFAULT_CONFIG);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const reset = () => { setFormName(""); setFormSummary(""); setFormScore(70); setPresetConfig(presets.DEFAULT_CONFIG); setAdding(null); };

  const handleAdd = async () => {
    try {
      if (adding === "recording") {
        await recordings.create.mutateAsync({ title: formName || "Rehearsal", duration_seconds: 0 });
      } else if (adding === "report") {
        await reports.create.mutateAsync({ summary: formSummary || "No summary", overall_score: formScore });
      } else if (adding === "preset") {
        await presets.create.mutateAsync({ name: formName || "Custom", config: presetConfig });
      }
      toast.success("Created");
      reset();
    } catch (e: any) { toast.error(e.message); }
  };

  const generateAIReport = async (rehearsalId: string, presentationId?: string) => {
    setGeneratingFor(rehearsalId);
    try {
      const session = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-coaching-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({
          rehearsal_id: rehearsalId,
          presentation_id: presentationId || null,
        }),
      });

      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted"); return; }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate report");
      }

      toast.success("AI Coaching Report generated!");
      reports.refetch();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate coaching report");
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Coaching & Rehearsal</h1>
          <p className="text-muted-foreground text-sm">Track rehearsals, get AI coaching insights, and manage remote presets</p>
        </div>

        <Tabs defaultValue="recordings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="recordings" className="gap-1.5">
              <Mic className="w-3.5 h-3.5" /> Recordings
              {(recordings.data?.length ?? 0) > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{recordings.data?.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5">
              <Brain className="w-3.5 h-3.5" /> AI Reports
              {(reports.data?.length ?? 0) > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{reports.data?.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="presets" className="gap-1.5">
              <Gamepad2 className="w-3.5 h-3.5" /> Remote Presets
              {(presets.data?.length ?? 0) > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{presets.data?.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="live-coach" className="gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Live Coach
            </TabsTrigger>
          </TabsList>

          {/* ---- Recordings ---- */}
          <TabsContent value="recordings" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAdding("recording")}><Plus className="w-4 h-4 mr-1" />Log Rehearsal</Button>
            </div>
            {(recordings.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Mic} title="No recordings yet" desc="Your rehearsal recordings will appear here after you practice." onAdd={() => setAdding("recording")} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {recordings.data?.map((r: any, idx: number) => {
                  const hasAudio = !!r.audio_url;
                  const isPlaying = playingId === r.id;

                  const togglePlay = () => {
                    if (isPlaying) {
                      audioRef.current?.pause();
                      setPlayingId(null);
                    } else {
                      if (audioRef.current) {
                        audioRef.current.pause();
                      }
                      const audio = new Audio(r.audio_url);
                      audio.onended = () => setPlayingId(null);
                      audio.play();
                      audioRef.current = audio;
                      setPlayingId(r.id);
                    }
                  };

                  return (
                    <Card key={r.id} className="group">
                      <CardContent className="p-3 sm:p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-medium text-sm truncate">{r.title}</p>
                            {idx === 0 && <Badge className="text-[9px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30 shrink-0">Latest</Badge>}
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => { recordings.remove.mutate(r.id); toast.success("Deleted"); }}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="text-[10px] gap-1"><Clock className="w-2.5 h-2.5" />{fmtDuration(r.duration_seconds)}</Badge>
                          {r.wpm_average && <Badge variant="outline" className="text-[10px] gap-1"><Gauge className="w-2.5 h-2.5" />{r.wpm_average} WPM</Badge>}
                          {r.filler_word_count > 0 && <Badge variant="outline" className="text-[10px] gap-1"><AlertTriangle className="w-2.5 h-2.5" />{r.filler_word_count} fillers</Badge>}
                          {hasAudio && <Badge variant="secondary" className="text-[10px] gap-1">🎙️ Audio</Badge>}
                        </div>
                        {r.notes && <p className="text-xs text-muted-foreground line-clamp-2">{r.notes}</p>}

                        {/* Audio playback + download — always visible */}
                        {hasAudio && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={isPlaying ? "default" : "outline"}
                              className="flex-1 gap-1.5 text-xs h-9"
                              onClick={togglePlay}
                            >
                              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              {isPlaying ? "Pause" : "Play Recording"}
                            </Button>
                            <a href={r.audio_url} download={`${r.title || "recording"}.webm`} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9">
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </a>
                          </div>
                        )}

                        {/* If no audio, show a muted note */}
                        {!hasAudio && (
                          <p className="text-[10px] text-muted-foreground/60 italic">No audio recorded for this session</p>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            {" · "}
                            {new Date(r.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs h-7 border-primary/30 hover:bg-primary/10 shrink-0"
                            disabled={generatingFor === r.id}
                            onClick={() => generateAIReport(r.id, r.presentation_id)}
                          >
                            {generatingFor === r.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3 text-primary" />
                            )}
                            {generatingFor === r.id ? "Analyzing…" : "AI Coach"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ---- AI Coaching Reports ---- */}
          <TabsContent value="reports" className="space-y-3">
            {(reports.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Brain} title="No coaching reports yet" desc="Generate an AI coaching report from any rehearsal recording to get actionable feedback." onAdd={() => {}} />
            ) : (
              <div className="space-y-3">
                {reports.data?.map((rp: any) => {
                  const pacing = rp.pacing_analysis as { rating?: string; ideal_wpm?: number; recommendation?: string } | null;
                  const isExpanded = expandedReport === rp.id;

                  return (
                    <Card key={rp.id} className="group overflow-hidden">
                      <CardContent className="p-0">
                        {/* Header */}
                        <div
                          className="p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                          onClick={() => setExpandedReport(isExpanded ? null : rp.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <span className={`text-lg font-bold ${scoreColor(rp.overall_score || 0)}`}>
                                  {rp.overall_score}
                                </span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold">AI Coaching Report</p>
                                  <Badge variant="outline" className="text-[9px]">
                                    {scoreLabel(rp.overall_score || 0)}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{new Date(rp.created_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); reports.remove.mutate(rp.id); toast.success("Deleted"); }}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{rp.summary}</p>
                          <Progress value={rp.overall_score || 0} className="h-1.5 mt-3" />
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="border-t border-border p-4 space-y-4 bg-secondary/10">
                            {/* Pacing Analysis */}
                            {pacing && (
                              <div className="rounded-lg border border-border p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Target className="w-4 h-4 text-primary" />
                                  <p className="text-sm font-medium">Pacing Analysis</p>
                                  <span className="text-lg">{pacingIcon(pacing.rating || "good")}</span>
                                </div>
                                <div className="flex gap-3">
                                  <Badge variant="outline" className="text-[10px] gap-1">
                                    <Gauge className="w-2.5 h-2.5" />
                                    Ideal: {pacing.ideal_wpm || 150} WPM
                                  </Badge>
                                  <Badge variant={pacing.rating === "good" ? "default" : "secondary"} className="text-[10px] capitalize">
                                    {(pacing.rating || "good").replace("_", " ")}
                                  </Badge>
                                </div>
                                {pacing.recommendation && (
                                  <p className="text-xs text-muted-foreground">{pacing.recommendation}</p>
                                )}
                              </div>
                            )}

                            {/* Strengths */}
                            {(rp.strengths as string[])?.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4 text-green-500" />
                                  <p className="text-sm font-medium">Strengths</p>
                                </div>
                                <div className="space-y-1.5">
                                  {(rp.strengths as string[]).map((s: string, i: number) => (
                                    <div key={i} className="flex items-start gap-2 rounded-md bg-green-500/5 border border-green-500/10 p-2">
                                      <Star className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                                      <p className="text-xs">{s}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Areas for Improvement */}
                            {(rp.improvements as string[])?.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Zap className="w-4 h-4 text-yellow-500" />
                                  <p className="text-sm font-medium">Areas for Improvement</p>
                                </div>
                                <div className="space-y-1.5">
                                  {(rp.improvements as string[]).map((s: string, i: number) => (
                                    <div key={i} className="flex items-start gap-2 rounded-md bg-yellow-500/5 border border-yellow-500/10 p-2">
                                      <MessageSquare className="w-3 h-3 text-yellow-500 mt-0.5 shrink-0" />
                                      <p className="text-xs">{s}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ---- Remote Presets ---- */}
          <TabsContent value="presets" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAdding("preset")}><Plus className="w-4 h-4 mr-1" />New Preset</Button>
            </div>
            {(presets.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Gamepad2} title="No remote presets" desc="Save custom key bindings for your presenter remote." onAdd={() => setAdding("preset")} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {presets.data?.map((p: any) => {
                  const cfg = p.config as Record<string, string>;
                  return (
                    <Card key={p.id} className="group">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Keyboard className="w-4 h-4 text-primary" />
                            <p className="font-medium text-sm">{p.name}</p>
                            {p.is_default && <Badge className="text-[9px]">Default</Badge>}
                          </div>
                          <div className="flex items-center gap-1">
                            {!p.is_default && (
                              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => presets.update.mutate({ id: p.id, is_default: true })}>Set Default</Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => { presets.remove.mutate(p.id); toast.success("Deleted"); }}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {Object.entries(cfg).map(([key, val]) => (
                            <div key={key} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1">
                              <span className="text-[10px] text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                              <kbd className="text-[10px] font-mono bg-background px-1.5 py-0.5 rounded border">{val}</kbd>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ---- Live Coach ---- */}
          <TabsContent value="live-coach" className="space-y-4">
            <LiveDeliveryFeedback onComplete={setDeliveryStats} />
            <AIImprovementPlan stats={deliveryStats} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ---- Add Dialog ---- */}
      <Dialog open={!!adding} onOpenChange={(o) => !o && reset()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adding === "recording" ? "Log Rehearsal" : adding === "report" ? "New Coaching Report" : "New Remote Preset"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {adding === "recording" && (
              <div>
                <Label>Title</Label>
                <Input placeholder="e.g. Full run-through #3" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
            )}
            {adding === "report" && (
              <>
                <div>
                  <Label>Summary</Label>
                  <Input placeholder="Overall feedback..." value={formSummary} onChange={e => setFormSummary(e.target.value)} />
                </div>
                <div>
                  <Label>Score (0-100)</Label>
                  <Input type="number" min={0} max={100} value={formScore} onChange={e => setFormScore(Number(e.target.value))} />
                </div>
              </>
            )}
            {adding === "preset" && (
              <>
                <div>
                  <Label>Preset Name</Label>
                  <Input placeholder="e.g. Clicker Pro" value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Key Bindings</Label>
                  {Object.entries(presetConfig).map(([key, val]) => (
                    <KeyRow key={key} label={key.replace(/([A-Z])/g, " $1").trim()} value={val}
                      onChange={(v) => setPresetConfig(prev => ({ ...prev, [key]: v }))} />
                  ))}
                </div>
              </>
            )}
            <Button className="w-full" onClick={handleAdd}
              disabled={recordings.create.isPending || reports.create.isPending || presets.create.isPending}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
