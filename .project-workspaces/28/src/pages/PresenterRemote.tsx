import { useState, useEffect, useCallback } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, Pause, Play, RotateCcw, X, Maximize2, Eye, MessageSquare, BarChart3, Vibrate } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import { parseTheme } from "@/lib/slideThemes";
import ThemeDropdown from "@/components/ThemeDropdown";
import { toast } from "sonner";

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

interface SlideData {
  id: string;
  sort_order: number;
  notes: string | null;
  block_type: string;
  content: any;
}

export default function PresenterRemote() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presentationId = searchParams.get("id");
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [presentations, setPresentations] = useState<{ id: string; title: string }[]>([]);
  const [theme, setTheme] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [liveQuestionCount, setLiveQuestionCount] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);

  // Load presentations for picker
  useEffect(() => {
    if (presentationId) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("presentations").select("id, title").eq("user_id", user.id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(20)
        .then(({ data }) => { if (data) setPresentations(data); setLoading(false); });
    });
  }, [presentationId]);

  // Load slides + theme
  useEffect(() => {
    if (!presentationId) return;
    setLoading(true);
    Promise.all([
      supabase.from("presentations").select("title, slide_order, theme").eq("id", presentationId).single(),
      supabase.from("slides").select("id, sort_order, notes, block_type, content").eq("presentation_id", presentationId).order("sort_order"),
    ]).then(([presRes, slideRes]) => {
      if (presRes.data) {
        setTitle(presRes.data.title);
        setTheme(parseTheme(presRes.data.theme));
      }
      if (slideRes.data) {
        const order = presRes.data?.slide_order;
        if (order?.length) {
          const ordered = order.map((id: string) => slideRes.data.find((s: any) => s.id === id)).filter(Boolean);
          setSlides(ordered as SlideData[]);
        } else {
          setSlides(slideRes.data as SlideData[]);
        }
      }
      setLoading(false);
    });

    // Load live questions count
    supabase.from("live_questions").select("id", { count: "exact", head: true }).eq("presentation_id", presentationId).eq("is_answered", false)
      .then(({ count }) => setLiveQuestionCount(count || 0));

    // Load viewer count  
    supabase.from("presentation_views").select("viewer_session", { count: "exact", head: true }).eq("presentation_id", presentationId)
      .then(({ count }) => setViewerCount(count || 0));
  }, [presentationId]);

  // Timer
  useEffect(() => {
    if (isPaused || !presentationId) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [isPaused, presentationId]);

  // Keep screen awake
  useEffect(() => {
    if (!presentationId) return;
    let wakeLock: any = null;
    (navigator as any).wakeLock?.request?.("screen").then((wl: any) => { wakeLock = wl; }).catch(() => {});
    return () => { wakeLock?.release?.(); };
  }, [presentationId]);

  // Haptic feedback
  const vibrate = useCallback(() => {
    if ("vibrate" in navigator) navigator.vibrate(15);
  }, []);

  const goNext = () => { setIndex(i => Math.min(i + 1, slides.length - 1)); vibrate(); };
  const goPrev = () => { setIndex(i => Math.max(i - 1, 0)); vibrate(); };

  // Presentation picker
  if (!presentationId) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Presenter Remote</h1>
            <p className="text-sm text-muted-foreground mt-1">Use your phone as a presentation remote with speaker notes, slide preview, and audience insights.</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><LoadingSpinner size="sm" text="Loading presentations..." /></div>
          ) : presentations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No presentations found. Create one first.</p>
          ) : (
            <div className="space-y-2">
              {presentations.map(p => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/remote?id=${p.id}`)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-border bg-card hover:bg-secondary/60 transition-colors"
                >
                  <p className="font-medium text-sm truncate">{p.title}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading slides..." />
      </div>
    );
  }

  const currentSlide = slides[index];
  const nextSlide = slides[index + 1];
  const notes = currentSlide?.notes;
  const content = currentSlide?.content as any;
  const slideTitle = content?.title || content?.heading || `Slide ${index + 1}`;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col select-none" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border bg-card flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/remote")} className="gap-1 text-xs h-7 px-2">
          <X className="w-3.5 h-3.5" /> Exit
        </Button>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{title}</p>
          <p className="font-mono text-base font-bold tabular-nums leading-tight">{formatTime(elapsed)}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeDropdown buttonClassName="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsPaused(p => !p)}>
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setElapsed(0)}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="shrink-0 px-3 py-1.5 bg-secondary/50 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1 text-[10px] h-5">
            <Eye className="w-3 h-3" /> {viewerCount} views
          </Badge>
          <Badge variant="secondary" className="gap-1 text-[10px] h-5">
            <MessageSquare className="w-3 h-3" /> {liveQuestionCount} Q&A
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setShowPreview(p => !p)}>
          <Eye className="w-3 h-3" /> {showPreview ? "Hide" : "Show"} Preview
        </Button>
      </div>

      {/* Slide preview + info */}
      <AnimatePresence mode="wait">
        {showPreview && theme && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 px-3 pt-2 pb-1 border-b border-border bg-card"
          >
            <div className="flex gap-2">
              {/* Current slide thumbnail */}
              <div className="flex-1">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Current</p>
                <div className="aspect-video rounded-lg overflow-hidden border border-primary/30 shadow-sm">
                  <ScaledSlide>
                    <SlideRenderer blockType={currentSlide?.block_type || "title"} content={currentSlide?.content || {}} theme={theme} />
                  </ScaledSlide>
                </div>
              </div>
              {/* Next slide thumbnail */}
              {nextSlide && (
                <div className="flex-1 opacity-60">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Next</p>
                  <div className="aspect-video rounded-lg overflow-hidden border border-border">
                    <ScaledSlide>
                      <SlideRenderer blockType={nextSlide.block_type} content={nextSlide.content} theme={theme} />
                    </ScaledSlide>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide indicator */}
      <div className="shrink-0 px-3 py-2 bg-secondary/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">Slide {index + 1} of {slides.length}</span>
          <span className="text-[10px] font-medium text-primary capitalize">{currentSlide?.block_type?.replace(/_/g, " ")}</span>
        </div>
        <h2 className="font-display font-bold text-base leading-tight">{slideTitle}</h2>
      </div>

      {/* Speaker notes */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {notes ? (
          <div className="space-y-2.5">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Speaker Notes</p>
            {notes.split("\n").filter(l => l.trim()).map((line, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-sm leading-relaxed">{line}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground italic text-center">No speaker notes for this slide.<br />Add notes in the editor.</p>
          </div>
        )}
      </div>

      {/* Navigation controls — big touch targets */}
      <div className="shrink-0 border-t border-border bg-card" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {/* Progress bar */}
        <div className="h-1 bg-secondary">
          <motion.div className="h-full bg-primary" animate={{ width: `${((index + 1) / slides.length) * 100}%` }} />
        </div>
        <div className="flex items-center gap-2 p-2.5">
          <Button
            variant="outline"
            className="flex-1 h-14 text-base font-semibold rounded-xl"
            onClick={goPrev}
            disabled={index === 0}
          >
            <ChevronLeft className="w-5 h-5 mr-1" /> Prev
          </Button>
          <Button
            className="flex-1 h-14 text-base font-semibold bg-gradient-gold text-primary-foreground rounded-xl"
            onClick={goNext}
            disabled={index === slides.length - 1}
          >
            Next <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
