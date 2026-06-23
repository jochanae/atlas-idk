import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Clock, AlertTriangle, CheckCircle, Pause, Play, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import ScaledSlide from "./ScaledSlide";
import SlideRenderer from "./SlideRenderer";
import type { Slide } from "@/hooks/useSlides";
import type { SlideTheme } from "@/lib/slideThemes";

interface PracticeModeProps {
  slides: Slide[];
  startIndex?: number;
  onExit: () => void;
  theme?: SlideTheme;
  targetMinutes?: number;
}

type PaceStatus = "on-track" | "slow" | "fast";

export default function PracticeMode({ slides, startIndex = 0, onExit, theme, targetMinutes = 10 }: PracticeModeProps) {
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [slideTimings, setSlideTimings] = useState<number[]>(() => new Array(slides.length).fill(0));
  const [slideEnteredAt, setSlideEnteredAt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const targetSeconds = targetMinutes * 60;
  const secsPerSlide = targetSeconds / slides.length;

  // Timer
  useEffect(() => {
    if (isPaused) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [isPaused]);

  // Track per-slide time
  useEffect(() => {
    setSlideEnteredAt(elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const recordSlideTime = useCallback(() => {
    const timeOnSlide = elapsed - slideEnteredAt;
    setSlideTimings((prev) => {
      const next = [...prev];
      next[index] = (next[index] || 0) + timeOnSlide;
      return next;
    });
  }, [elapsed, slideEnteredAt, index]);

  // Fullscreen
  useEffect(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const goNext = useCallback(() => {
    recordSlideTime();
    setIndex((i) => Math.min(i + 1, slides.length - 1));
  }, [slides.length, recordSlideTime]);

  const goPrev = useCallback(() => {
    recordSlideTime();
    setIndex((i) => Math.max(i - 1, 0));
  }, [recordSlideTime]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === " ") goNext();
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "Escape") { recordSlideTime(); onExit(); }
    if (e.key === "p" || e.key === "P") setIsPaused((v) => !v);
  }, [goNext, goPrev, onExit, recordSlideTime]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // Pacing logic
  const expectedTimeAtSlide = (index + 1) * secsPerSlide;
  const paceStatus: PaceStatus =
    elapsed > expectedTimeAtSlide + secsPerSlide ? "slow" :
    elapsed < expectedTimeAtSlide - secsPerSlide ? "fast" : "on-track";

  const timeOnCurrentSlide = elapsed - slideEnteredAt;
  const slideOvertime = timeOnCurrentSlide > secsPerSlide * 1.5;

  const currentSlide = slides[index];
  const notes = currentSlide?.notes;
  const overallProgress = Math.min((elapsed / targetSeconds) * 100, 100);

  // Get talking points from notes
  const talkingPoints = notes
    ? notes.split("\n").filter((l) => l.trim().length > 0).slice(0, 5)
    : [];

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Pacing alert bar */}
      <AnimatePresence>
        {(paceStatus !== "on-track" || slideOvertime) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shrink-0 ${
              paceStatus === "slow" || slideOvertime
                ? "bg-destructive/15 text-destructive"
                : "bg-blue-500/15 text-blue-400"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            {slideOvertime
              ? `You've spent ${formatTime(timeOnCurrentSlide)} on this slide — aim for ~${formatTime(Math.round(secsPerSlide))}`
              : paceStatus === "slow"
              ? "You're running behind — consider picking up the pace"
              : "You're ahead of schedule — take your time"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Slide */}
        <div className="flex-1 min-h-[30dvh] bg-black flex items-center justify-center relative">
          {currentSlide && (
            <div className="w-full h-full">
              <ScaledSlide>
                <SlideRenderer blockType={currentSlide.block_type} content={currentSlide.content} theme={theme} />
              </ScaledSlide>
            </div>
          )}
          {isPaused && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="text-center">
                <Pause className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Paused — press P to resume</p>
              </div>
            </div>
          )}
        </div>

        {/* Coach panel */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-card flex flex-col shrink-0 max-h-[40dvh] md:max-h-none overflow-y-auto">
          {/* Pacing overview */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Overall Progress</span>
              <span className={`text-xs font-medium flex items-center gap-1 ${
                paceStatus === "on-track" ? "text-green-400" : paceStatus === "slow" ? "text-destructive" : "text-blue-400"
              }`}>
                <CheckCircle className="w-3 h-3" />
                {paceStatus === "on-track" ? "On track" : paceStatus === "slow" ? "Behind" : "Ahead"}
              </span>
            </div>
            <Progress value={overallProgress} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{formatTime(elapsed)}</span>
              <span>Target: {formatTime(targetSeconds)}</span>
            </div>
          </div>

          {/* Talking points / confidence prompts */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                💡 Key Talking Points
              </p>
              {talkingPoints.length > 0 ? (
                <ul className="space-y-2">
                  {talkingPoints.map((point, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Add speaker notes to see talking points here
                </p>
              )}
            </div>

            {/* Per-slide timing */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                ⏱️ Slide Timing
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>This slide</span>
                  <span className={slideOvertime ? "text-destructive font-medium" : ""}>
                    {formatTime(timeOnCurrentSlide)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Target per slide</span>
                  <span>~{formatTime(Math.round(secsPerSlide))}</span>
                </div>
              </div>
            </div>

            {/* Slide timing breakdown */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                📊 Timing Breakdown
              </p>
              <div className="space-y-1">
                {slideTimings.map((t, i) => (
                  <div key={i} className={`flex justify-between text-xs ${i === index ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    <span>Slide {i + 1}</span>
                    <span>{t > 0 ? formatTime(t + (i === index ? timeOnCurrentSlide : 0)) : i === index ? formatTime(timeOnCurrentSlide) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="h-14 border-t border-border bg-card flex items-center justify-between px-2 md:px-4 shrink-0">
        <div className="flex items-center gap-1 md:gap-3">
          <Button variant="ghost" size="sm" onClick={() => { recordSlideTime(); onExit(); }} className="gap-1 md:gap-1.5 text-xs px-2 md:px-3">
            <X className="w-4 h-4" /> <span className="hidden md:inline">Exit Practice</span><span className="md:hidden">Exit</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 hidden md:inline-flex" onClick={() => { setElapsed(0); setSlideTimings(new Array(slides.length).fill(0)); setIndex(0); }}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} disabled={index === 0}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-display font-semibold tabular-nums">{index + 1} / {slides.length}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} disabled={index === slides.length - 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="font-mono tabular-nums">{formatTime(elapsed)}</span>
        </div>
      </div>
    </div>
  );
}
