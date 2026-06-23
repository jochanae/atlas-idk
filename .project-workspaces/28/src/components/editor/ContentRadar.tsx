import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Clock, BookOpen, Zap, ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface ContentRadarProps {
  blockType: string;
  content: Json;
  notes?: string | null;
}

type Tone = "persuasive" | "informational" | "storytelling" | "motivational" | "neutral";

interface RadarMetrics {
  wordCount: number;
  readability: number;
  deliveryMinutes: number;
  tone: Tone;
  toneConfidence: number;
}

interface AIInsight {
  score: number;
  strengths: string[];
  improvements: string[];
}

const TONE_CONFIG: Record<Tone, { label: string; emoji: string; color: string }> = {
  persuasive:    { label: "Persuasive",    emoji: "🎯", color: "text-amber-400" },
  informational: { label: "Informational", emoji: "📊", color: "text-blue-400" },
  storytelling:  { label: "Storytelling",  emoji: "📖", color: "text-rose-400" },
  motivational:  { label: "Motivational",  emoji: "🚀", color: "text-emerald-400" },
  neutral:       { label: "Neutral",       emoji: "💭", color: "text-muted-foreground" },
};

function extractText(content: Json): string {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";
  const c = content as Record<string, unknown>;
  const parts: string[] = [];
  for (const [key, val] of Object.entries(c)) {
    if (typeof val === "string" && !["layout", "imageUrl", "audioUrl", "chartType", "contentAnimation", "videoUrl", "audioAutoplay", "slideDuration"].includes(key)) {
      parts.push(val);
    }
    if (Array.isArray(val)) {
      val.forEach(item => {
        if (typeof item === "string") parts.push(item);
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          if (typeof obj.title === "string") parts.push(obj.title);
          if (typeof obj.description === "string") parts.push(obj.description);
        }
      });
    }
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      if (typeof obj.title === "string") parts.push(obj.title);
      if (Array.isArray(obj.points)) {
        obj.points.forEach((p: unknown) => { if (typeof p === "string") parts.push(p); });
      }
    }
  }
  return parts.join(" ");
}

function analyzeReadability(text: string): number {
  if (!text.trim()) return 0;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;
  const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  let score = 100;
  score -= Math.max(0, (avgWordsPerSentence - 15) * 3);
  score -= Math.max(0, (avgWordLength - 5) * 8);
  return Math.max(10, Math.min(100, Math.round(score)));
}

function detectTone(text: string, blockType: string): { tone: Tone; confidence: number } {
  const lower = text.toLowerCase();
  const scores: Record<Tone, number> = { persuasive: 0, informational: 0, storytelling: 0, motivational: 0, neutral: 0.2 };
  if (blockType === "cta") scores.persuasive += 0.4;
  if (blockType === "data" || blockType === "chart" || blockType === "table") scores.informational += 0.4;
  if (blockType === "story") scores.storytelling += 0.4;
  if (blockType === "quote" || blockType === "testimonial") scores.motivational += 0.3;
  const persuasiveWords = /\b(try|buy|sign up|get started|join|subscribe|now|today|free|offer|limited|exclusive|don't miss)\b/g;
  const infoWords = /\b(data|analysis|research|study|percent|statistics|report|findings|shows|according)\b/g;
  const storyWords = /\b(imagine|picture|story|journey|once|remember|experience|felt|moment|years ago)\b/g;
  const motivationalWords = /\b(inspire|dream|achieve|believe|together|future|transform|empower|change|impact)\b/g;
  scores.persuasive += (lower.match(persuasiveWords)?.length || 0) * 0.15;
  scores.informational += (lower.match(infoWords)?.length || 0) * 0.15;
  scores.storytelling += (lower.match(storyWords)?.length || 0) * 0.15;
  scores.motivational += (lower.match(motivationalWords)?.length || 0) * 0.15;
  if (lower.includes("?")) scores.persuasive += 0.1;
  const entries = Object.entries(scores) as [Tone, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [topTone, topScore] = entries[0];
  return { tone: topTone, confidence: Math.min(1, topScore / 0.8) };
}

function analyze(blockType: string, content: Json, notes?: string | null): RadarMetrics {
  const text = extractText(content);
  const allText = notes ? `${text} ${notes}` : text;
  const words = allText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const deliveryMinutes = wordCount / 150;
  const readability = analyzeReadability(text);
  const { tone, confidence } = detectTone(text, blockType);
  return { wordCount, readability, deliveryMinutes, tone, toneConfidence: confidence };
}

export default function ContentRadar({ blockType, content, notes }: ContentRadarProps) {
  const [expanded, setExpanded] = useState(true);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const metrics = useMemo(() => analyze(blockType, content, notes), [blockType, content, notes]);
  const { label, emoji, color } = TONE_CONFIG[metrics.tone];
  const readabilityColor = metrics.readability >= 70 ? "text-emerald-400" : metrics.readability >= 40 ? "text-amber-400" : "text-rose-400";
  const readabilityLabel = metrics.readability >= 70 ? "Easy" : metrics.readability >= 40 ? "Moderate" : "Complex";

  const handleAIDeepScore = async () => {
    const text = extractText(content);
    if (!text.trim() || text.trim().length < 10) {
      toast.info("Add more content for AI analysis");
      return;
    }
    setAiLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-slide-content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ text, blockType, notes }),
      });
      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("Credits exhausted"); return; }
      if (!resp.ok) throw new Error("Analysis failed");
      const data = await resp.json();
      setAiInsight(data);
    } catch (err) {
      console.error(err);
      toast.error("AI analysis failed");
    } finally {
      setAiLoading(false);
    }
  };

  // Reset AI insight when slide changes
  useMemo(() => { setAiInsight(null); }, [blockType, content]);

  const scoreColor = (s: number) => s >= 80 ? "text-emerald-400" : s >= 60 ? "text-amber-400" : "text-rose-400";
  const scoreBg = (s: number) => s >= 80 ? "bg-emerald-400" : s >= 60 ? "bg-amber-400" : "bg-rose-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-4 left-4 z-20 w-56"
    >
      <div className="rounded-xl border border-border bg-card/95 backdrop-blur-sm shadow-lg overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary/50 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">Content Radar</span>
          </div>
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronUp className="w-3 h-3 text-muted-foreground" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-3 pb-3 space-y-2.5 overflow-hidden"
            >
              {/* Word Count & Delivery Time */}
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg bg-secondary/60 px-2.5 py-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <BookOpen className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Words</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">{metrics.wordCount}</span>
                </div>
                <div className="flex-1 rounded-lg bg-secondary/60 px-2.5 py-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Time</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">
                    {metrics.deliveryMinutes < 1
                      ? `${Math.round(metrics.deliveryMinutes * 60)}s`
                      : `${metrics.deliveryMinutes.toFixed(1)}m`}
                  </span>
                </div>
              </div>

              {/* Readability */}
              <div className="rounded-lg bg-secondary/60 px-2.5 py-2">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Readability</span>
                  </div>
                  <span className={`text-[10px] font-semibold ${readabilityColor}`}>
                    {readabilityLabel} · {metrics.readability}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${
                      metrics.readability >= 70 ? "bg-emerald-400" : metrics.readability >= 40 ? "bg-amber-400" : "bg-rose-400"
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${metrics.readability}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Tone */}
              <div className="rounded-lg bg-secondary/60 px-2.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Tone</span>
                  <span className={`text-[11px] font-semibold ${color}`}>
                    {emoji} {label}
                  </span>
                </div>
              </div>

              {/* AI Deep Score */}
              {!aiInsight ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 h-7 text-[10px]"
                  onClick={handleAIDeepScore}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-primary" />
                  )}
                  AI Deep Analysis
                </Button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">AI Score</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-lg font-bold ${scoreColor(aiInsight.score)}`}>{aiInsight.score}</span>
                      <span className="text-[9px] text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${scoreBg(aiInsight.score)}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${aiInsight.score}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                  {aiInsight.strengths.length > 0 && (
                    <div>
                      <span className="text-[9px] text-emerald-400 font-semibold">✓ Strengths</span>
                      {aiInsight.strengths.map((s, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground leading-snug">• {s}</p>
                      ))}
                    </div>
                  )}
                  {aiInsight.improvements.length > 0 && (
                    <div>
                      <span className="text-[9px] text-amber-400 font-semibold">↑ Improve</span>
                      {aiInsight.improvements.map((s, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground leading-snug">• {s}</p>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-6 text-[9px]"
                    onClick={handleAIDeepScore}
                    disabled={aiLoading}
                  >
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Re-analyze"}
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
