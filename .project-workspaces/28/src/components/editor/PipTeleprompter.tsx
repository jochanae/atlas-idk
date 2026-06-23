import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ExternalLink, Play, Pause, SkipForward, SkipBack, Minus, Plus, X, Mic, MicOff, Signal, Wind, Timer, Gauge, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useVoiceFollow } from "@/hooks/useVoiceFollow";
import type { Slide } from "@/hooks/useSlides";

interface PipTeleprompterProps {
  slides: Slide[];
  startIndex?: number;
  onClose: () => void;
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

/**
 * Picture-in-Picture Teleprompter — Titan edition
 * Full parity: voice follow, karaoke, timer, breath markers
 */
export default function PipTeleprompter({ slides, startIndex = 0, onClose }: PipTeleprompterProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(35);
  const [fontSize, setFontSize] = useState(24);
  const [currentSlide, setCurrentSlide] = useState(startIndex);
  const [isPipActive, setIsPipActive] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [breathMarkers, setBreathMarkers] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Build scripts
  const scripts = useMemo(() => slides.map((slide, i) => {
    const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content))
      ? slide.content as Record<string, unknown> : {};
    const heading = (content.heading as string) || `Slide ${i + 1}`;
    const notes = slide.notes || (content.script as string) || "";
    const bullets = Array.isArray(content.bullets) ? (content.bullets as string[]).join("\n• ") : "";
    const rawBody = notes || (bullets ? `• ${bullets}` : (content.subheading as string) || "");
    const body = breathMarkers ? insertBreathMarkers(rawBody) : rawBody;
    return { heading, body, wordCount: countWords(rawBody) };
  }), [slides, breathMarkers]);

  const totalWords = useMemo(() => scripts.reduce((sum, s) => sum + s.wordCount, 0), [scripts]);

  // Flat word list for voice matching
  const allScriptWords = useMemo(() => {
    return scripts.flatMap((s) => s.body.split(/\s+/).filter((w) => w && w !== "◆"));
  }, [scripts]);

  // Voice Follow hook
  const voiceFollowHook = useVoiceFollow({
    scriptWords: allScriptWords,
    onWordMatch: (wordIndex) => {
      // Map global word index to slide + local word index
      let remaining = wordIndex;
      for (let i = 0; i < scripts.length; i++) {
        const blockWords = scripts[i].body.split(/\s+/).filter((w) => w && w !== "◆").length;
        if (remaining < blockWords) {
          setCurrentSlide(i);
          setCurrentWordIndex(remaining);
          // Jump canvas scroll to this position
          setScrollY(i * fontSize * 8 + (remaining / blockWords) * fontSize * 6);
          break;
        }
        remaining -= blockWords;
      }
    },
    onScroll: (amount) => {
      setScrollY(prev => prev + amount);
    },
    fontSize,
  });

  const { isListening, confidence, toggleListening: toggleVoiceFollow } = voiceFollowHook;

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

  // Timer countdown
  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return;
    const interval = setInterval(() => setTimerSeconds(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds]);

  // Start timer when playing
  useEffect(() => {
    setTimerRunning(isPlaying);
  }, [isPlaying]);

  // Karaoke word tracking (only when NOT using voice follow)
  useEffect(() => {
    if (!isPlaying || isListening) return;
    const msPerWord = 60000 / currentWPM;
    const interval = setInterval(() => {
      setCurrentWordIndex(prev => {
        const maxWords = scripts[currentSlide]?.wordCount || 0;
        if (prev >= maxWords - 1) return prev;
        return prev + 1;
      });
    }, msPerWord);
    return () => clearInterval(interval);
  }, [isPlaying, isListening, currentWPM, currentSlide, scripts]);

  // Reset word index on slide change
  useEffect(() => {
    setCurrentWordIndex(0);
  }, [currentSlide]);

  // Calculate total content height for scrolling
  const getContentHeight = useCallback(() => {
    return scripts.length * (fontSize * 8);
  }, [scripts.length, fontSize]);

  // Render text onto canvas with karaoke + breath markers
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Dark bg
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // Reading line
    const readLineY = h * 0.3;
    ctx.strokeStyle = "rgba(212, 175, 55, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, readLineY);
    ctx.lineTo(w, readLineY);
    ctx.stroke();

    // HUD: Timer
    ctx.font = `500 13px "Inter", sans-serif`;
    ctx.textAlign = "left";
    if (timerSeconds > 0) {
      const timerColor = timerSeconds <= 60 ? "rgba(239, 68, 68, 0.8)" : "rgba(255,255,255,0.5)";
      ctx.fillStyle = timerColor;
      ctx.fillText(`⏱ ${formatTime(timerSeconds)}`, 15, 22);
    }

    // HUD: Time estimate
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText(`~${formatTime(estimatedSecondsLeft)} left`, 15, 40);

    // HUD: Voice follow indicator
    if (isListening) {
      const indicatorColor = confidence > 0.7 ? "rgba(52, 211, 153, 0.8)" :
        confidence > 0.3 ? "rgba(168, 85, 247, 0.8)" : "rgba(251, 191, 36, 0.8)";
      ctx.fillStyle = indicatorColor;
      const label = confidence > 0.7 ? "● Locked" : confidence > 0.3 ? "● Listening" : "● Syncing";
      ctx.fillText(label, w - 80, 22);
    }

    // HUD: Progress bar
    const progressWidth = totalWords > 0 ? (wordsReadSoFar / totalWords) * w : 0;
    ctx.fillStyle = "rgba(212, 175, 55, 0.15)";
    ctx.fillRect(0, 0, w, 3);
    ctx.fillStyle = "rgba(212, 175, 55, 0.5)";
    ctx.fillRect(0, 0, progressWidth, 3);

    // Render scripts
    const padding = 30;
    let yOffset = readLineY - scrollY;
    let slideAtReadLine = 0;

    for (let i = 0; i < scripts.length; i++) {
      const s = scripts[i];
      const blockStart = yOffset;

      // Heading
      ctx.font = `bold ${fontSize * 0.5}px "Space Grotesk", sans-serif`;
      ctx.fillStyle = "rgba(212, 175, 55, 0.6)";
      ctx.textAlign = "left";
      ctx.fillText(s.heading.toUpperCase(), padding, yOffset + fontSize * 0.6);
      yOffset += fontSize * 1.2;

      const isCurrent = blockStart <= readLineY && yOffset + fontSize * 6 > readLineY;
      if (isCurrent) slideAtReadLine = i;

      // Body — word by word with karaoke
      const words = s.body.split(/\s+/).filter(Boolean);
      const maxWidth = w - padding * 2;
      let lineX = padding;
      let wordIdx = 0;

      ctx.font = `500 ${fontSize}px "Inter", sans-serif`;

      for (const word of words) {
        if (word === "◆") {
          // Breath marker
          ctx.fillStyle = "rgba(52, 211, 153, 0.5)";
          ctx.fillText("◆", lineX, yOffset);
          const m = ctx.measureText("◆ ");
          lineX += m.width;
          continue;
        }

        const isHighlighted = isCurrent && wordIdx <= currentWordIndex;
        ctx.fillStyle = isHighlighted ? "#ffffff" :
          isCurrent ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)";

        const metrics = ctx.measureText(word + " ");
        if (lineX + metrics.width > maxWidth + padding && lineX > padding) {
          yOffset += fontSize * 1.5;
          lineX = padding;
        }

        ctx.fillText(word, lineX, yOffset);
        lineX += metrics.width;
        wordIdx++;
      }

      yOffset += fontSize * 2.5; // gap between slides
    }

    setCurrentSlide(slideAtReadLine);

    // Slide counter
    ctx.font = `500 12px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "right";
    ctx.fillText(`${slideAtReadLine + 1} / ${scripts.length}`, w - 15, h - 12);
    ctx.textAlign = "left";
  }, [scrollY, scripts, fontSize, currentWordIndex, timerSeconds, estimatedSecondsLeft, isListening, confidence, wordsReadSoFar, totalWords]);

  // Animation loop (disabled when voice follow active)
  const animate = useCallback((timestamp: number) => {
    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    setScrollY(prev => {
      const next = prev + speed * delta;
      const maxScroll = getContentHeight();
      return Math.min(next, maxScroll);
    });

    animFrameRef.current = requestAnimationFrame(animate);
  }, [speed, getContentHeight]);

  useEffect(() => {
    if (isListening) {
      // Voice follow drives scroll — stop auto-scroll
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

  // Re-render canvas on state changes
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Set up canvas stream → video for PiP
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = 640;
    canvas.height = 480;

    const stream = canvas.captureStream(30);
    streamRef.current = stream;
    video.srcObject = stream;
    video.muted = true;
    video.play().catch(() => {});

    return () => {
      stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Enter PiP
  const enterPip = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (!document.pictureInPictureEnabled) {
        toast.error("Picture-in-Picture is not supported in this browser");
        return;
      }
      await video.requestPictureInPicture();
      setIsPipActive(true);
      setIsPlaying(true);
      toast.success("Teleprompter floating! It stays on top of other apps.");
    } catch (err) {
      console.error("PiP error:", err);
      toast.error("Could not open floating teleprompter");
    }
  };

  // Listen for PiP close
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleLeave = () => setIsPipActive(false);
    video.addEventListener("leavepictureinpicture", handleLeave);
    return () => video.removeEventListener("leavepictureinpicture", handleLeave);
  }, []);

  const jumpToSlide = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, scripts.length - 1));
    setCurrentSlide(clamped);
    setCurrentWordIndex(0);
    setScrollY(clamped * fontSize * 8);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4" style={{ touchAction: "pan-y" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-primary" />
          <span className="text-sm font-display font-semibold">Floating Teleprompter</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMinimized(m => !m)} aria-label={isMinimized ? "Expand teleprompter" : "Minimize teleprompter"}>
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 -mr-1" onClick={onClose} aria-label="Close floating teleprompter">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Minimized bar: slide counter + play/pause */}
      {isMinimized ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            Slide {currentSlide + 1}/{scripts.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => jumpToSlide(currentSlide - 1)} disabled={currentSlide === 0}>
              <SkipBack className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={isPlaying ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsPlaying(p => !p)}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => jumpToSlide(currentSlide + 1)} disabled={currentSlide === scripts.length - 1}>
              <SkipForward className="w-3.5 h-3.5" />
            </Button>
          </div>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Gauge className="w-3 h-3" />
            ~{formatTime(estimatedSecondsLeft)}
          </span>
        </div>
      ) : (
        <>
          {/* Canvas preview */}
          <div className="relative rounded-lg overflow-hidden border border-border bg-black">
            <canvas ref={canvasRef} className="w-full aspect-[4/3]" style={{ imageRendering: "auto" }} />
            <video ref={videoRef} className="hidden" playsInline muted />
            {!isPipActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Button onClick={enterPip} className="bg-gradient-gold text-primary-foreground gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Pop Out Window
                </Button>
              </div>
            )}
          </div>

          {isPipActive && (
            <p className="text-xs text-primary text-center animate-pulse">
              ✓ Floating on top — visible over Zoom, Teams, etc.
            </p>
          )}

          {/* Controls */}
          <div className="space-y-3">
            {/* Playback */}
            <div className="flex items-center justify-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => jumpToSlide(currentSlide - 1)} disabled={currentSlide === 0}>
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                variant={isPlaying ? "default" : "outline"}
                size="sm"
                onClick={() => setIsPlaying(p => !p)}
                className="gap-1.5 min-w-[80px]"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => jumpToSlide(currentSlide + 1)} disabled={currentSlide === scripts.length - 1}>
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            {/* Speed */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10">Speed</span>
              <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={10} max={100} step={5} className="flex-1" />
              <span className="text-xs font-mono text-muted-foreground w-6 text-right">{speed}</span>
            </div>

            {/* Font size */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10">Size</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFontSize(s => Math.max(s - 2, 14))}>
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-xs font-mono text-muted-foreground">{fontSize}px</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFontSize(s => Math.min(s + 2, 40))}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-3">
              <Timer className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Timer</span>
              <div className="flex items-center gap-1 ml-auto">
                {[3, 5, 10, 15].map(m => (
                  <Button
                    key={m}
                    variant={timerSeconds === m * 60 ? "default" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setTimerSeconds(m * 60)}
                  >
                    {m}m
                  </Button>
                ))}
              </div>
            </div>

            {/* Toggles row */}
            <div className="flex items-center gap-4">
              {/* Voice Follow */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant={isListening ? "default" : "ghost"}
                  size="icon"
                  className={`h-7 w-7 ${isListening ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                  onClick={toggleVoiceFollow}
                >
                  {isListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </Button>
                {isListening && (
                  <span className={`text-[10px] font-mono ${
                    confidence > 0.7 ? "text-emerald-400" : confidence > 0.3 ? "text-purple-400" : "text-amber-400"
                  }`}>
                    {confidence > 0.7 ? "Locked" : confidence > 0.3 ? "Listening" : "Syncing"}
                  </span>
                )}
              </div>

              {/* Breath Markers */}
              <div className="flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-emerald-500" />
                <Switch checked={breathMarkers} onCheckedChange={setBreathMarkers} className="scale-75" />
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Slide {currentSlide + 1}/{scripts.length}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Gauge className="w-3 h-3" />
                ~{formatTime(estimatedSecondsLeft)} left
              </span>
              <span className="text-[10px] text-muted-foreground">
                {wordsReadSoFar}/{totalWords} words
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
