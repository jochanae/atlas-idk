import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  X, Play, Pause, SkipForward, SkipBack, Minus, Plus,
  Settings2, Mic, MicOff, Signal, Wind, Gauge
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { parseCues } from "@/lib/teleprompterCues";
import TeleprompterCueBadge from "@/components/editor/TeleprompterCueBadge";
import { useVoiceFollow } from "@/hooks/useVoiceFollow";
import type { Slide } from "@/hooks/useSlides";

interface MobileTeleprompterModeProps {
  slides: Slide[];
  startIndex?: number;
  onExit: () => void;
}

const BREATH_PATTERN = /([.!?;])\s+/g;
const PAUSE_SYMBOL = "  ◆  ";

function insertBreathMarkers(text: string): string {
  return text.replace(BREATH_PATTERN, `$1${PAUSE_SYMBOL}`);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * MobileTeleprompterMode — dedicated mobile-first teleprompter.
 * 
 * Design principles:
 * - Controls ALWAYS visible at bottom (never auto-hide)
 * - Large tap targets (min 44px)
 * - Settings slide up as a bottom sheet
 * - Safe area padding for notched phones
 * - Touch: tap to play/pause, swipe L/R to skip slides, pinch to resize
 */
export default function MobileTeleprompterMode({ slides, startIndex = 0, onExit }: MobileTeleprompterModeProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [fontSize, setFontSize] = useState(28);
  const [currentSlide, setCurrentSlide] = useState(startIndex);
  const [showSettings, setShowSettings] = useState(false);
  const [breathMarkers, setBreathMarkers] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartFontRef = useRef<number>(fontSize);

  // Build scripts from slides
  const scripts = useMemo(() => slides.map((slide, i) => {
    const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content))
      ? slide.content as Record<string, unknown> : {};
    const heading = (content.heading as string) || `Slide ${i + 1}`;
    const notes = slide.notes || (content.script as string) || "";
    const bullets = Array.isArray(content.bullets) ? (content.bullets as string[]).join("\n• ") : "";
    const rawBody = notes || (bullets ? `• ${bullets}` : (content.subheading as string) || "");
    const body = breathMarkers ? insertBreathMarkers(rawBody) : rawBody;
    return { heading, body, slideIndex: i, wordCount: countWords(rawBody) };
  }), [slides, breathMarkers]);

  const totalWords = useMemo(() => scripts.reduce((sum, s) => sum + s.wordCount, 0), [scripts]);

  // Flat word list for voice follow
  const allScriptWords = useMemo(() => {
    return scripts.flatMap((s) => s.body.split(/\s+/).filter((w) => w && w !== "◆"));
  }, [scripts]);

  // Voice Follow
  const { isListening, confidence, toggleListening: toggleVoiceFollow } = useVoiceFollow({
    scriptWords: allScriptWords,
    onWordMatch: (wordIndex) => {
      let remaining = wordIndex;
      for (let i = 0; i < scripts.length; i++) {
        const blockWords = scripts[i].body.split(/\s+/).filter((w) => w && w !== "◆").length;
        if (remaining < blockWords) {
          setCurrentSlide(i);
          setCurrentWordIndex(remaining);
          const children = scrollRef.current?.children;
          if (children?.[i]) {
            (children[i] as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;
        }
        remaining -= blockWords;
      }
    },
    onScroll: (amount) => {
      if (scrollRef.current) scrollRef.current.scrollTop += amount;
    },
    fontSize,
  });

  // Words read tracking
  const wordsReadSoFar = useMemo(() => {
    let count = 0;
    for (let i = 0; i < currentSlide; i++) count += scripts[i].wordCount;
    count += currentWordIndex;
    return Math.min(count, totalWords);
  }, [currentSlide, currentWordIndex, scripts, totalWords]);

  const remainingWords = totalWords - wordsReadSoFar;
  const currentWPM = speed * 2.5;
  const estimatedSecondsLeft = remainingWords > 0 ? Math.round((remainingWords / currentWPM) * 60) : 0;

  // Karaoke word tracking (disabled when voice follow active)
  useEffect(() => {
    if (!isPlaying || isListening) return;
    const msPerWord = 60000 / currentWPM;
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => {
        const maxWords = scripts[currentSlide]?.wordCount || 0;
        if (prev >= maxWords - 1) return prev;
        return prev + 1;
      });
    }, msPerWord);
    return () => clearInterval(interval);
  }, [isPlaying, isListening, currentWPM, currentSlide, scripts]);

  useEffect(() => { setCurrentWordIndex(0); }, [currentSlide]);

  // Auto-scroll animation (disabled when voice follow active)
  const animate = useCallback((timestamp: number) => {
    if (!scrollRef.current) return;
    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;
    scrollRef.current.scrollTop += speed * delta;

    // Track which slide is at reading line
    const children = scrollRef.current.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const el = children[i] as HTMLElement;
      if (el.offsetTop <= scrollRef.current.scrollTop + 200) {
        setCurrentSlide(i);
        break;
      }
    }
    animFrameRef.current = requestAnimationFrame(animate);
  }, [speed]);

  useEffect(() => {
    if (isListening) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }
    if (isPlaying) {
      lastTimeRef.current = 0;
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isPlaying, animate, isListening]);

  // Touch handlers — tap for play/pause, swipe for slide skip, pinch for font
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartFontRef.current = fontSize;
      return;
    }
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchStartDistRef.current;
      setFontSize(Math.round(Math.max(18, Math.min(72, pinchStartFontRef.current * scale))));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (pinchStartDistRef.current !== null && e.touches.length < 2) {
      pinchStartDistRef.current = null;
      return;
    }
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Quick tap → toggle play/pause
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 300) {
      setIsPlaying((p) => !p);
      return;
    }
    // Horizontal swipe → skip slides
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? jumpToSlide(currentSlide + 1) : jumpToSlide(currentSlide - 1);
    }
  };

  const jumpToSlide = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, scripts.length - 1));
    setCurrentSlide(clamped);
    const children = scrollRef.current?.children;
    if (children?.[clamped]) {
      (children[clamped] as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Render words with karaoke highlight
  const renderBody = (body: string, blockIdx: number) => {
    const isCurrentBlock = blockIdx === currentSlide;
    const segments = parseCues(body);
    let wordCounter = -1;

    return (
      <span>
        {segments.map((segment, si) => {
          if (segment.type === "cue" || segment.type === "timing") {
            return <TeleprompterCueBadge key={`cue-${si}`} config={segment.cueConfig!} />;
          }
          const words = segment.content.split(/(\s+)/);
          return words.map((word, wi) => {
            if (word.trim() === "◆") {
              return (
                <span key={`${si}-${wi}`} className="inline-block mx-1 text-emerald-400/60 animate-pulse select-none" aria-hidden>
                  ◆
                </span>
              );
            }
            if (/^\s+$/.test(word)) return <span key={`${si}-${wi}`}>{word}</span>;
            wordCounter++;
            const isHighlighted = isCurrentBlock && wordCounter <= currentWordIndex;
            return (
              <span
                key={`${si}-${wi}`}
                className={`transition-colors duration-150 ${
                  isHighlighted ? "text-white" : isCurrentBlock ? "text-white/40" : ""
                }`}
              >
                {word}
              </span>
            );
          });
        })}
      </span>
    );
  };

  // Height of bottom controls area
  const CONTROLS_HEIGHT = "8.5rem";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col select-none bg-[#0a0a0a]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* ─── Top HUD ─── */}
      <div className="flex items-center justify-between px-4 py-2 z-20">
        <div className="flex items-center gap-2">
          <span className="bg-black/60 backdrop-blur rounded-full px-2.5 py-1 text-[11px] text-white/50 font-mono">
            {currentSlide + 1}/{scripts.length}
          </span>
          {isListening && (
            <span className={`backdrop-blur rounded-full px-2.5 py-1 text-[11px] font-mono flex items-center gap-1 ${
              confidence > 0.7 ? "bg-emerald-500/20 text-emerald-400" :
              confidence > 0.3 ? "bg-purple-500/20 text-purple-400 animate-pulse" :
              "bg-amber-500/20 text-amber-400 animate-pulse"
            }`}>
              <Signal className="w-3 h-3" />
              {confidence > 0.7 ? "Locked" : confidence > 0.3 ? "Listening" : "Syncing"}
            </span>
          )}
        </div>
        <span className="bg-black/60 backdrop-blur rounded-full px-2.5 py-1 text-[11px] text-white/50 font-mono flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          ~{formatTime(estimatedSecondsLeft)}
        </span>
      </div>

      {/* ─── Progress bar ─── */}
      <div className="h-0.5 bg-white/5">
        <div
          className="h-full bg-primary/50 transition-all duration-300"
          style={{ width: `${totalWords > 0 ? (wordsReadSoFar / totalWords) * 100 : 0}%` }}
        />
      </div>

      {/* ─── Script area ─── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pt-[30vh]"
        style={{ paddingBottom: `calc(${CONTROLS_HEIGHT} + 30vh)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {scripts.map((s, i) => (
          <div key={i} className="mb-12">
            <p
              className="text-primary/60 font-display font-bold mb-2 uppercase tracking-widest"
              style={{ fontSize: fontSize * 0.45 }}
            >
              {s.heading}
            </p>
            <p
              className={`leading-relaxed font-medium whitespace-pre-wrap transition-colors duration-300 ${
                i !== currentSlide ? "text-white/25" : ""
              }`}
              style={{ fontSize, lineHeight: 1.6 }}
            >
              {renderBody(s.body, i)}
            </p>
          </div>
        ))}
      </div>

      {/* ─── Reading line ─── */}
      <div className="fixed top-1/3 left-0 right-0 pointer-events-none z-10">
        <div className="h-0.5 bg-primary/30" />
      </div>

      {/* ─── Settings bottom sheet ─── */}
      {showSettings && (
        <div
          className="fixed inset-x-0 z-40 bg-black/95 backdrop-blur-xl border-t border-white/10 rounded-t-2xl p-5 space-y-5"
          style={{ bottom: CONTROLS_HEIGHT, paddingBottom: "1rem" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Settings</span>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white/60" onClick={() => setShowSettings(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Voice Follow toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-purple-400" />
              <div>
                <span className="text-sm text-white/80">Voice Follow</span>
                <p className="text-[10px] text-white/40">Speak and the script follows your voice</p>
              </div>
            </div>
            <Switch
              checked={isListening}
              onCheckedChange={() => {
                if (!isListening) {
                  toast.info("🎙️ Speak naturally — the script scrolls to follow your voice", { duration: 4000 });
                }
                toggleVoiceFollow();
              }}
            />
          </div>

          {/* Breath markers */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-white/80">Breath Markers</span>
            </div>
            <Switch checked={breathMarkers} onCheckedChange={setBreathMarkers} />
          </div>

          {/* Font size */}
          <div className="space-y-2">
            <span className="text-xs text-white/50 uppercase tracking-wider">Font Size</span>
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="h-10 w-10 text-white/70" onClick={() => setFontSize((s) => Math.max(s - 4, 18))}>
                <Minus className="w-5 h-5" />
              </Button>
              <span className="text-lg text-white/70 font-mono flex-1 text-center">{fontSize}px</span>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-white/70" onClick={() => setFontSize((s) => Math.min(s + 4, 72))}>
                <Plus className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Bottom controls — ALWAYS visible ─── */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 bg-black/95 backdrop-blur-xl border-t border-white/10"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/* Row 1: Main playback controls */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExit}
            className="text-white/70 hover:text-white h-11 px-3 text-sm"
          >
            <X className="w-5 h-5 mr-1" /> Exit
          </Button>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-11 w-11 text-white/70" onClick={() => jumpToSlide(currentSlide - 1)} disabled={currentSlide === 0}>
              <SkipBack className="w-6 h-6" />
            </Button>
            <Button
              variant={isPlaying ? "default" : "outline"}
              size="icon"
              className="h-12 w-12"
              onClick={() => setIsPlaying((p) => !p)}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-11 w-11 text-white/70" onClick={() => jumpToSlide(currentSlide + 1)} disabled={currentSlide === scripts.length - 1}>
              <SkipForward className="w-6 h-6" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-11 w-11 ${isListening ? "text-purple-400" : "text-white/70"}`}
              onClick={() => {
                if (!isListening) {
                  toast.info("🎙️ Voice Follow — speak and the script follows your voice", { duration: 4000 });
                }
                toggleVoiceFollow();
              }}
            >
              {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-11 w-11 ${showSettings ? "text-primary" : "text-white/70"}`}
              onClick={() => setShowSettings((s) => !s)}
            >
              <Settings2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Row 2: Speed slider — always accessible */}
        <div className="flex items-center gap-3 px-5 pb-1">
          <span className="text-[10px] text-white/40 uppercase tracking-wider min-w-[36px]">Speed</span>
          <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={10} max={100} step={5} className="flex-1" />
          <span className="text-xs text-white/50 font-mono w-6 text-right">{speed}</span>
        </div>
      </div>
    </div>
  );
}
