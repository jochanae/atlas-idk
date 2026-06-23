import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { X, Play, Pause, SkipForward, SkipBack, Minus, Plus, Monitor, AlignLeft, ChevronUp, ChevronDown, Gauge, Wind, Timer, Settings2, Palette, Mic, MicOff, Signal, BookOpen } from "lucide-react";
import { parseCues } from "@/lib/teleprompterCues";
import TeleprompterCueBadge from "@/components/editor/TeleprompterCueBadge";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVoiceFollow } from "@/hooks/useVoiceFollow";
import type { Slide } from "@/hooks/useSlides";

interface TeleprompterModeProps {
  slides: Slide[];
  startIndex?: number;
  onExit: () => void;
}

/* ─── Breath markers ─── */
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

const BG_PRESETS = [
  { label: "Noir", value: "#0a0a0a" },
  { label: "Charcoal", value: "#1a1a2e" },
  { label: "Midnight", value: "#0d1117" },
  { label: "Forest", value: "#0a1a0a" },
  { label: "Navy", value: "#0a0a1a" },
];

export default function TeleprompterMode({ slides, startIndex = 0, onExit }: TeleprompterModeProps) {
  const isMobile = useIsMobile();
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(isMobile ? 30 : 40);
  const [fontSize, setFontSize] = useState(isMobile ? 28 : 32);
  const [currentSlide, setCurrentSlide] = useState(startIndex);
  const [isMirror, setIsMirror] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [breathMarkers, setBreathMarkers] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [activeBg, setActiveBg] = useState("#0a0a0a");
  const [faithMode, setFaithMode] = useState(() => {
    try { return localStorage.getItem("presentq_teaching_style") === "faith"; } catch { return false; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartFontRef = useRef<number>(fontSize);

  const scripts = useMemo(() => slides.map((slide, i) => {
    const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content))
      ? slide.content as Record<string, unknown> : {};
    const heading = (content.heading as string) || `Slide ${i + 1}`;
    const notes = slide.notes || (content.script as string) || "";
    const bullets = Array.isArray(content.bullets) ? (content.bullets as string[]).join("\n• ") : "";
    const rawBody = notes || (bullets ? `• ${bullets}` : (content.subheading as string) || "");
    const body = breathMarkers ? insertBreathMarkers(rawBody) : rawBody;
    // Faith mode: extract scripture fields
    const passage = (content.passage as string) || "";
    const reference = (content.reference as string) || "";
    const commentary = (content.commentary as string) || "";
    const isScripture = slide.block_type === "scripture" || !!(passage && reference);
    return { heading, body, slideIndex: i, wordCount: countWords(rawBody), passage, reference, commentary, isScripture };
  }), [slides, breathMarkers]);

  const totalWords = useMemo(() => scripts.reduce((sum, s) => sum + s.wordCount, 0), [scripts]);

  // Build flat word list for voice matching
  const allScriptWords = useMemo(() => {
    return scripts.flatMap((s) => s.body.split(/\s+/).filter((w) => w && w !== "◆"));
  }, [scripts]);

  // Voice Follow hook
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
      if (scrollRef.current) {
        scrollRef.current.scrollTop += amount;
      }
    },
    fontSize,
  });

  const wordsReadSoFar = useMemo(() => {
    let count = 0;
    for (let i = 0; i < currentSlide; i++) count += scripts[i].wordCount;
    count += currentWordIndex;
    return Math.min(count, totalWords);
  }, [currentSlide, currentWordIndex, scripts, totalWords]);

  const remainingWords = totalWords - wordsReadSoFar;
  const currentWPM = speed * 2.5;
  const estimatedSecondsLeft = remainingWords > 0 ? Math.round((remainingWords / currentWPM) * 60) : 0;

  // Word-by-word karaoke tracking (only when NOT using voice follow)
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

  useEffect(() => {
    setCurrentWordIndex(0);
  }, [currentSlide]);

  // Keep controls always visible on mobile — no auto-hide
  // Users were losing them and couldn't figure out how to get them back

  // Scroll animation (disabled when voice follow is active)
  const animate = useCallback((timestamp: number) => {
    if (!scrollRef.current) return;
    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;
    scrollRef.current.scrollTop += speed * delta;

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

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (e.key === " ") { e.preventDefault(); setIsPlaying((p) => !p); }
      if (e.key === "ArrowUp") setSpeed((s) => Math.min(s + 5, 120));
      if (e.key === "ArrowDown") setSpeed((s) => Math.max(s - 5, 10));
      if (e.key === "ArrowRight") jumpToSlide(currentSlide + 1);
      if (e.key === "ArrowLeft") jumpToSlide(currentSlide - 1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onExit, currentSlide]);

  // Touch
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
      const newSize = Math.round(Math.max(18, Math.min(72, pinchStartFontRef.current * scale)));
      setFontSize(newSize);
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
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 300) {
      isMobile ? setShowControls((c) => !c) : setIsPlaying((p) => !p);
      return;
    }
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

  // Render words with karaoke highlight + breath markers + cues
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
          // Text segment — split into words for karaoke
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

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col select-none"
      style={{ backgroundColor: activeBg, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Top HUD */}
      <div className="fixed top-4 right-4 z-20 flex items-center gap-2">
        {isListening && (
          <div className={`backdrop-blur rounded-full px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 ${
            confidence > 0.7 ? "bg-emerald-500/20 text-emerald-400" :
            confidence > 0.3 ? "bg-purple-500/20 text-purple-400 animate-pulse" :
            "bg-amber-500/20 text-amber-400 animate-pulse"
          }`}>
            <Signal className="w-3 h-3" />
            {confidence > 0.7 ? "Locked On" : confidence > 0.3 ? "Listening" : "Syncing..."}
          </div>
        )}
        <div className="backdrop-blur rounded-full px-3 py-1.5 bg-black/60 text-white/50 text-xs font-mono flex items-center gap-1.5">
          <Gauge className="w-3 h-3" />
          ~{formatTime(estimatedSecondsLeft)} left
        </div>
      </div>

      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-10 h-0.5 bg-white/5">
        <div
          className="h-full bg-primary/50 transition-all duration-300"
          style={{ width: `${totalWords > 0 ? (wordsReadSoFar / totalWords) * 100 : 0}%` }}
        />
      </div>

      {/* Script area */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto pt-[35vh] pb-[60vh] ${
          isMobile ? "px-5" : "px-8 md:px-16 lg:px-32"
        }`}
        style={{ transform: isMirror ? "scaleX(-1)" : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {scripts.map((s, i) => (
          <div key={i} className={isMobile ? "mb-12" : "mb-16"}>
            <p
              className="text-primary/60 font-display font-bold mb-3 uppercase tracking-widest"
              style={{ fontSize: isMobile ? fontSize * 0.45 : fontSize * 0.5 }}
            >
              {s.heading}
            </p>

            {/* Faith Mode: scripture split view */}
            {faithMode && s.isScripture && s.passage ? (
              <div className={`grid ${isMobile ? "grid-cols-1 gap-4" : "grid-cols-2 gap-8"}`}>
                <div className="border-l-2 border-amber-500/40 pl-4">
                  <p className="text-amber-400/60 text-xs uppercase tracking-widest mb-2 font-semibold">
                    {s.reference || "Scripture"}
                  </p>
                  <p
                    className="leading-relaxed font-serif italic text-white/90"
                    style={{ fontSize: fontSize * 0.95, lineHeight: 1.7 }}
                  >
                    {s.passage}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-widest mb-2 font-semibold">
                    Commentary
                  </p>
                  <p
                    className={`leading-relaxed font-medium transition-colors duration-300 whitespace-pre-wrap ${
                      i !== currentSlide ? "text-white/25" : ""
                    }`}
                    style={{ fontSize, lineHeight: 1.6 }}
                  >
                    {renderBody(s.commentary || s.body, i)}
                  </p>
                </div>
              </div>
            ) : (
              <p
                className={`leading-relaxed font-medium transition-colors duration-300 whitespace-pre-wrap ${
                  i !== currentSlide ? "text-white/25" : ""
                }`}
                style={{ fontSize, lineHeight: 1.6 }}
              >
                {renderBody(s.body, i)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Center reading line */}
      <div className="fixed top-1/3 left-0 right-0 pointer-events-none">
        <div className="h-0.5 bg-primary/30" />
      </div>

      {/* Mobile: slide indicator */}
      {isMobile && (
        <div className="fixed top-12 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="bg-black/60 backdrop-blur rounded-full px-3 py-1 text-xs text-white/50 font-mono">
            {currentSlide + 1} / {scripts.length}
          </div>
        </div>
      )}

      {/* Removed auto-hide hint — controls now always visible on mobile */}

      {/* Settings panel overlay */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-72 z-30 bg-black/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Settings</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60" onClick={() => setShowSettings(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <span className="text-xs text-white/50 uppercase tracking-wider">Background</span>
            <div className="flex gap-2">
              {BG_PRESETS.map((bg) => (
                <button
                  key={bg.value}
                  onClick={() => setActiveBg(bg.value)}
                  title={bg.label}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    activeBg === bg.value ? "border-primary scale-110" : "border-white/20"
                  }`}
                  style={{ backgroundColor: bg.value }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-white/80">Voice Follow</span>
            </div>
            <Switch checked={isListening} onCheckedChange={toggleVoiceFollow} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-white/80">Breath Markers</span>
            </div>
            <Switch checked={breathMarkers} onCheckedChange={setBreathMarkers} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-white/60" />
              <span className="text-sm text-white/80">Mirror Mode</span>
            </div>
            <Switch checked={isMirror} onCheckedChange={setIsMirror} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-white/80">Faith Mode</span>
            </div>
            <Switch checked={faithMode} onCheckedChange={setFaithMode} />
          </div>

          <div className="space-y-2">
            <span className="text-xs text-white/50 uppercase tracking-wider">Font Size</span>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70" onClick={() => setFontSize((s) => Math.max(s - 4, 18))}>
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-sm text-white/70 font-mono">{fontSize}px</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70" onClick={() => setFontSize((s) => Math.min(s + 4, 72))}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Control bar — always visible, fixed at bottom on mobile */}
      <div
        className={`shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-xl z-30 ${
          isMobile ? "px-3 py-2" : "px-4 py-3"
        }`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
          {isMobile ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={onExit} className="text-white/70 hover:text-white h-9 px-3">
                  <X className="w-4 h-4 mr-1" /> Exit
                </Button>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-white/70" onClick={() => jumpToSlide(currentSlide - 1)} disabled={currentSlide === 0}>
                    <SkipBack className="w-5 h-5" />
                  </Button>
                  <Button variant={isPlaying ? "default" : "outline"} size="icon" className="h-10 w-10" onClick={() => setIsPlaying((p) => !p)}>
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-white/70" onClick={() => jumpToSlide(currentSlide + 1)} disabled={currentSlide === scripts.length - 1}>
                    <SkipForward className="w-5 h-5" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 ${showSettings ? "text-primary" : "text-white/70"}`}
                  onClick={() => setShowSettings((s) => !s)}
                >
                  <Settings2 className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] text-white/40 uppercase tracking-wider">Speed</span>
                <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={10} max={100} step={5} className="flex-1" />
                <span className="text-xs text-white/50 font-mono w-6 text-right">{speed}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between max-w-4xl mx-auto gap-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onExit} className="text-white/70 hover:text-white gap-1.5">
                  <X className="w-4 h-4" /> Exit
                </Button>
                <div className="h-5 w-px bg-white/20" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70" onClick={() => jumpToSlide(currentSlide - 1)} disabled={currentSlide === 0}>
                  <SkipBack className="w-4 h-4" />
                </Button>
                <span className="text-xs text-white/50 font-mono tabular-nums min-w-[4ch] text-center">
                  {currentSlide + 1}/{scripts.length}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70" onClick={() => jumpToSlide(currentSlide + 1)} disabled={currentSlide === scripts.length - 1}>
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Button variant={isPlaying ? "default" : "outline"} size="sm" onClick={() => setIsPlaying((p) => !p)} className="gap-1.5 min-w-[80px]">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{isPlaying ? "Pause" : "Play"}
                </Button>
                <div className="flex items-center gap-2 text-white/60">
                  <span className="text-xs">Speed</span>
                  <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={10} max={120} step={5} className="w-24" />
                  <span className="text-xs font-mono w-6">{speed}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70" onClick={() => setFontSize((s) => Math.max(s - 4, 16))}>
                  <Minus className="w-3 h-3" />
                </Button>
                <AlignLeft className="w-4 h-4 text-white/40" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70" onClick={() => setFontSize((s) => Math.min(s + 4, 72))}>
                  <Plus className="w-3 h-3" />
                </Button>
                <div className="h-5 w-px bg-white/20" />
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${isListening ? "text-purple-400" : "text-white/70"}`}
                  onClick={() => {
                    if (!isListening) {
                      toast.info("🎙️ Voice Follow — speak along and the script scrolls to keep up with you", { duration: 4000 });
                    }
                    toggleVoiceFollow();
                  }}
                  title="Voice Follow"
                >
                  {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${showSettings ? "text-primary" : "text-white/70"}`}
                  onClick={() => setShowSettings((s) => !s)}
                  title="Settings"
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
        )}
      </div>
    </div>
  );
}
