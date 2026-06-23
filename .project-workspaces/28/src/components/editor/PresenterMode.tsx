import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Clock, FileText, Volume2, VolumeX, Play, Music, Timer, SkipForward } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import ScaledSlide from "./ScaledSlide";
import SlideRenderer from "./SlideRenderer";
import type { Slide } from "@/hooks/useSlides";
import type { SlideTheme } from "@/lib/slideThemes";
import type { TransitionType } from "@/lib/slideThemes";
import type { Json } from "@/integrations/supabase/types";

import type { TargetAndTransition } from "framer-motion";

const transitionVariants: Record<TransitionType, { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition }> = {
  none: { initial: {}, animate: {}, exit: {} },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    initial: { x: "100%", opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: "-100%", opacity: 0 },
  },
  zoom: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 1.2, opacity: 0 },
  },
  flip: {
    initial: { rotateY: 90, opacity: 0 },
    animate: { rotateY: 0, opacity: 1 },
    exit: { rotateY: -90, opacity: 0 },
  },
  morph: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 },
  },
};

function getSlideContent(slide: Slide | undefined): Record<string, unknown> {
  if (!slide) return {};
  return (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content))
    ? slide.content as Record<string, unknown> : {};
}

interface PresenterModeProps {
  slides: Slide[];
  startIndex?: number;
  onExit: () => void;
  theme?: SlideTheme;
  transition?: TransitionType;
  backgroundMusicUrl?: string;
  autoAdvance?: boolean;
}

export default function PresenterMode({ slides, startIndex = 0, onExit, theme, transition = "fade", backgroundMusicUrl, autoAdvance: globalAutoAdvance = false }: PresenterModeProps) {
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(!!backgroundMusicUrl);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setInterval>>();

  // Main timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Fullscreen
  useEffect(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // Background music
  useEffect(() => {
    if (backgroundMusicUrl && musicEnabled) {
      const music = new Audio(backgroundMusicUrl);
      music.loop = true;
      music.volume = 0.15;
      musicRef.current = music;
      music.play().catch(() => {});
    }
    return () => {
      if (musicRef.current) { musicRef.current.pause(); musicRef.current = null; }
    };
  }, [backgroundMusicUrl, musicEnabled]);

  // Auto-play audio when slide changes
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setShowPlayButton(false);
    if (!audioEnabled) return;
    const content = getSlideContent(slides[index]);
    const audioUrl = content.audioUrl as string | undefined;
    if (!audioUrl) return;

    if (content.audioAutoplay === false) {
      setShowPlayButton(true);
    } else {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => setShowPlayButton(false);
      audio.play().catch(() => {});
    }
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, [index, audioEnabled, slides]);

  // Auto-advance timer
  useEffect(() => {
    if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
    setAutoAdvanceCountdown(null);

    const content = getSlideContent(slides[index]);
    const slideDuration = content.slideDuration as number | undefined;
    const shouldAutoAdvance = slideDuration && slideDuration > 0 && index < slides.length - 1;

    if (!shouldAutoAdvance && !globalAutoAdvance) return;

    const duration = slideDuration || 10; // default 10s if global auto-advance
    let remaining = duration;
    setAutoAdvanceCountdown(remaining);

    autoAdvanceRef.current = setInterval(() => {
      remaining--;
      setAutoAdvanceCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(autoAdvanceRef.current);
        setDirection(1);
        setIndex((i) => Math.min(i + 1, slides.length - 1));
      }
    }, 1000);

    return () => { if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current); };
  }, [index, slides, globalAutoAdvance]);

  const goNext = useCallback(() => {
    setDirection(1);
    setIndex((i) => Math.min(i + 1, slides.length - 1));
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setDirection(-1);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === " ") goNext();
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "Escape") onExit();
    if (e.key === "m" || e.key === "M") setAudioEnabled((v) => !v);
    if (e.key === "b" || e.key === "B") setMusicEnabled((v) => !v);
  }, [goNext, goPrev, onExit]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (musicRef.current) { musicRef.current.pause(); musicRef.current = null; }
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const currentSlide = slides[index];
  const nextSlide = slides[index + 1];
  const notes = currentSlide?.notes;
  const currentContent = getSlideContent(currentSlide);
  const hasAudio = !!(currentContent.audioUrl);

  const variants = transitionVariants[transition];
  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-background flex flex-col" style={{ perspective: transition === "flip" ? "1200px" : undefined }}>
      {/* Main slide */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`${showNotes ? "flex-1" : "w-full"} bg-black flex items-center justify-center relative`}>
          <AnimatePresence mode="wait" initial={false}>
            {currentSlide && (
              <motion.div
                key={currentSlide.id}
                initial={transition === "slide"
                  ? { x: direction > 0 ? "100%" : "-100%", opacity: 0 } as TargetAndTransition
                  : variants.initial}
                animate={variants.animate}
                exit={transition === "slide"
                  ? { x: direction > 0 ? "-100%" : "100%", opacity: 0 } as TargetAndTransition
                  : variants.exit}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="w-full h-full absolute inset-0"
              >
                <ScaledSlide>
                  <SlideRenderer blockType={currentSlide.block_type} content={currentSlide.content} theme={theme} isPresenting slideId={currentSlide.id} />
                </ScaledSlide>
              </motion.div>
            )}
          </AnimatePresence>

          {/* On-demand audio play button */}
          {showPlayButton && (
            <button
              className="absolute bottom-6 right-6 z-20 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg hover:bg-primary/90 transition-colors"
              onClick={() => {
                const audioUrl = currentContent.audioUrl as string | undefined;
                if (audioUrl) {
                  const audio = new Audio(audioUrl);
                  audioRef.current = audio;
                  audio.onended = () => setShowPlayButton(false);
                  audio.play().catch(() => {});
                  setShowPlayButton(false);
                }
              }}
            >
              <Play className="w-4 h-4" />
              <span className="text-sm font-medium">Play Audio</span>
            </button>
          )}

          {/* Auto-advance countdown */}
          {autoAdvanceCountdown !== null && autoAdvanceCountdown > 0 && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-black/60 text-white/80 px-3 py-1.5 rounded-full text-xs">
              <SkipForward className="w-3 h-3" />
              <span>Next in {autoAdvanceCountdown}s</span>
            </div>
          )}
        </div>

        {showNotes && (
          <div className="w-80 border-l border-border bg-card flex flex-col shrink-0">
            <div className="p-3 border-b border-border">
              <p className="text-xs text-muted-foreground mb-2">Next Slide</p>
              <div className="aspect-video rounded-lg overflow-hidden border border-border bg-background">
                {nextSlide ? (
                  <ScaledSlide>
                    <SlideRenderer blockType={nextSlide.block_type} content={nextSlide.content} theme={theme} />
                  </ScaledSlide>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">End</div>
                )}
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Speaker Notes
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {notes || "No notes for this slide."}
              </p>
              {hasAudio && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Volume2 className="w-3 h-3" /> Audio attached
                  {currentContent.audioAutoplay === false && " (on demand)"}
                </div>
              )}
              {currentContent.slideDuration && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="w-3 h-3" /> Auto-advance: {currentContent.slideDuration as number}s
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="h-14 border-t border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onExit} className="gap-1.5">
            <X className="w-4 h-4" /> Exit
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowNotes(!showNotes)}>
            <FileText className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAudioEnabled(!audioEnabled)}>
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          {backgroundMusicUrl && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMusicEnabled(!musicEnabled)} title="Toggle background music (B)">
              <Music className={`w-4 h-4 ${musicEnabled ? "text-primary" : "text-muted-foreground"}`} />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4">
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
