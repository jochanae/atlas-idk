import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X, Play, Pause, SkipForward, SkipBack, Minus, Plus, Monitor, AlignLeft, Timer, RotateCcw, Gauge, Wind, Sparkles, ChevronDown, Settings2, Palette, Mic, MicOff, Signal, FileText, Loader2, Airplay } from "lucide-react";
import { parseCues } from "@/lib/teleprompterCues";
import TeleprompterCueBadge from "@/components/editor/TeleprompterCueBadge";
import { motion } from "framer-motion";
import { useArc } from "@/components/arc/ArcProvider";
import { useVoiceFollow } from "@/hooks/useVoiceFollow";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useNavigate } from "react-router-dom";
import { usePresentations } from "@/hooks/usePresentations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScriptBlock {
  heading: string;
  body: string;
}

/* ─── Breath marker detection ─── */
const BREATH_PATTERN = /([.!?;])\s+/g;
const PAUSE_SYMBOL = "  ◆  "; // visual breath cue

function insertBreathMarkers(text: string): string {
  return text.replace(BREATH_PATTERN, `$1${PAUSE_SYMBOL}`);
}

function parseBlocks(text: string, breathMarkers: boolean): ScriptBlock[] {
  if (!text.trim()) return [{ heading: "Script", body: "Type or paste your script above, then press Start." }];
  const processed = breathMarkers ? insertBreathMarkers(text) : text;
  const sections = processed.split(/\n{2,}/).filter(Boolean);
  if (sections.length === 1) return [{ heading: "Script", body: processed }];
  return sections.map((s, i) => {
    const lines = s.trim().split("\n");
    const first = lines[0];
    if (first.length < 60 && lines.length > 1) {
      return { heading: first, body: lines.slice(1).join("\n") };
    }
    return { heading: `Section ${i + 1}`, body: s.trim() };
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const BG_PRESETS = [
  { label: "Black", value: "#000000" },
  { label: "Charcoal", value: "#1e1e2e" },
  { label: "Navy", value: "#0f172a" },
  { label: "Forest", value: "#14332a" },
  { label: "Cream", value: "#faf7f2", dark: false },
  { label: "White", value: "#ffffff", dark: false },
];

/* ─── Setup UI (rendered inside DashboardLayout → ArcProvider) ─── */
function TeleprompterSetup({
  scriptText, setScriptText, breathMarkers, setBreathMarkers,
  autoSpeed, setAutoSpeed, bgColor, setBgColor, voiceFollow, setVoiceFollow,
  timerMinutes, setTimerMinutes, onStart,
}: {
  scriptText: string; setScriptText: (v: string) => void;
  breathMarkers: boolean; setBreathMarkers: (v: boolean) => void;
  autoSpeed: boolean; setAutoSpeed: (v: boolean) => void;
  bgColor: string; setBgColor: (v: string) => void;
  voiceFollow: boolean; setVoiceFollow: (v: boolean) => void;
  timerMinutes: number; setTimerMinutes: (v: number) => void;
  onStart: () => void;
}) {
  const { sendMessage, toggleChat, isOpen, teleprompterCallbackRef, setMode } = useArc();
  const { data: presentations, isLoading: presLoading } = usePresentations();
  const navigate = useNavigate();
  const [loadingPres, setLoadingPres] = useState<string | null>(null);

  useEffect(() => {
    teleprompterCallbackRef.current = (text: string) => setScriptText(text);
    return () => { teleprompterCallbackRef.current = null; };
  }, [teleprompterCallbackRef, setScriptText]);

  const loadNotesFromPresentation = useCallback(async (presId: string, title: string) => {
    setLoadingPres(presId);
    try {
      const { data: slides, error } = await supabase
        .from("slides")
        .select("notes, sort_order, block_type, content")
        .eq("presentation_id", presId)
        .order("sort_order");
      if (error) throw error;

      // Build script from speaker notes; fall back to slide headings if no notes
      const parts: string[] = [];
      for (const slide of slides || []) {
        if (slide.notes?.trim()) {
          parts.push(slide.notes.trim());
        } else {
          // Extract heading from content as a fallback section marker
          const content = slide.content as any;
          const heading = content?.heading || content?.title;
          if (heading) parts.push(`[${heading}]`);
        }
      }

      if (parts.length === 0) {
        toast.error("No speaker notes found in this deck. Add notes in the Editor first.");
      } else {
        setScriptText(parts.join("\n\n"));
        toast.success(`Loaded notes from "${title}" (${parts.length} sections)`);
      }
    } catch (err: any) {
      toast.error("Failed to load notes: " + (err.message || "Unknown error"));
    } finally {
      setLoadingPres(null);
    }
  }, [setScriptText]);

  const wordCount = scriptText.split(/\s+/).filter(Boolean).length;
  const estMinutes = Math.ceil(wordCount / 150);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Teleprompter</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Load speaker notes from a deck, paste a script, or write one with AI.
        </p>
      </div>

      {/* Load from Presentation */}
      {presentations && presentations.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Load from Presentation</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 w-full justify-start">
                <FileText className="w-4 h-4 text-primary" />
                {loadingPres ? "Loading..." : "Choose a presentation…"}
                <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 max-h-64 overflow-y-auto">
              {presentations.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => loadNotesFromPresentation(p.id, p.title)}
                  disabled={loadingPres === p.id}
                >
                  <div className="truncate">
                    <p className="font-medium text-sm truncate">{p.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Updated {new Date(p.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  {loadingPres === p.id && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          placeholder={"Paste your script here...\n\nSeparate sections with blank lines.\nThe first short line of each section becomes a heading."}
          className="min-h-[240px] text-sm bg-secondary border-border leading-relaxed"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => {
            setMode("teleprompter");
            if (scriptText.trim()) {
              sendMessage(`Here is my teleprompter script so far. Help me improve it, expand it, or finish writing it:\n\n${scriptText}`);
            } else {
              sendMessage("I need help writing a teleprompter script. Ask me what the topic is, who my audience is, and how long the speech should be. Then write a complete teleprompter-ready script.");
            }
            if (!isOpen) toggleChat();
          }}
        >
          <Sparkles className="w-3.5 h-3.5" /> Help Me Write
        </Button>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
        <Timer className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-medium">Countdown Timer</span>
        <div className="flex items-center gap-2 ml-auto">
          <Input
            type="number" min={1} max={120} value={timerMinutes}
            onChange={(e) => setTimerMinutes(Math.max(1, Math.min(120, parseInt(e.target.value) || 1)))}
            className="w-16 h-8 text-sm text-center bg-secondary border-border"
          />
          <span className="text-xs text-muted-foreground">min</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
          <Wind className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium">Breath Markers</span>
            <p className="text-[10px] text-muted-foreground">Visual pause cues at sentences</p>
          </div>
          <Switch checked={breathMarkers} onCheckedChange={setBreathMarkers} />
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
          <Gauge className="w-4 h-4 text-blue-500 shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium">Auto-Speed</span>
            <p className="text-[10px] text-muted-foreground">Adjusts to fit your timer</p>
          </div>
          <Switch checked={autoSpeed} onCheckedChange={setAutoSpeed} />
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
          <Mic className="w-4 h-4 text-purple-500 shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium">Voice Follow</span>
            <p className="text-[10px] text-muted-foreground">Scroll follows your speech</p>
          </div>
          <Switch checked={voiceFollow} onCheckedChange={setVoiceFollow} />
        </div>
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
          <Palette className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium">Background</span>
            <p className="text-[10px] text-muted-foreground">Teleprompter backdrop</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {BG_PRESETS.map((bg) => (
              <button
                key={bg.value}
                onClick={() => setBgColor(bg.value)}
                title={bg.label}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  bgColor === bg.value ? "border-primary scale-110 ring-2 ring-primary/30" : "border-border"
                }`}
                style={{ backgroundColor: bg.value }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={onStart} className="bg-gradient-gold text-primary-foreground font-semibold gap-2" disabled={!scriptText.trim()}>
          <Play className="w-4 h-4" /> Start Teleprompter
        </Button>
        {scriptText.trim() && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Format with Arc
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={() => { setMode("teleprompter"); sendMessage(`Format this teleprompter script for delivery. DO NOT change any words — only add section breaks, paragraph spacing, and breath markers where appropriate. Keep every single word exactly as written:\n\n${scriptText}`); if (!isOpen) toggleChat(); }}>
                <div><p className="font-medium text-sm">Keep My Words</p><p className="text-[11px] text-muted-foreground">Only add breaks & spacing, no rewording</p></div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setMode("teleprompter"); sendMessage(`Lightly polish this teleprompter script for delivery. Fix grammar and improve flow, but preserve my voice and original phrasing as much as possible. Add section breaks where appropriate:\n\n${scriptText}`); if (!isOpen) toggleChat(); }}>
                <div><p className="font-medium text-sm">Light Polish</p><p className="text-[11px] text-muted-foreground">Fix grammar & flow, keep your voice</p></div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setMode("teleprompter"); sendMessage(`Fully rewrite this teleprompter script for maximum delivery impact. Improve clarity, pacing, rhetorical flow, and section structure. Make it sound powerful and professional:\n\n${scriptText}`); if (!isOpen) toggleChat(); }}>
                <div><p className="font-medium text-sm">Full Rewrite</p><p className="text-[11px] text-muted-foreground">Rewrite for maximum impact & clarity</p></div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span className="text-xs text-muted-foreground">
          {wordCount} words{wordCount > 0 ? ` · ~${estMinutes} min` : ""}
        </span>
      </div>

      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate("/presenting-guide")}>
        <Airplay className="w-3.5 h-3.5" /> How to present with Zoom / Teams
      </Button>
    </div>
  );
}

export default function Teleprompter() {
  const [isRunning, setIsRunning] = useState(false);
  const [scriptText, setScriptText] = useState(() => {
    const preloaded = localStorage.getItem("pq_teleprompter_script");
    if (preloaded) {
      localStorage.removeItem("pq_teleprompter_script");
      return preloaded;
    }
    return "";
  });
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [breathMarkers, setBreathMarkers] = useState(true);
  const [autoSpeed, setAutoSpeed] = useState(false);
  const [bgColor, setBgColor] = useState("#0a0a0a");
  const [voiceFollow, setVoiceFollow] = useState(false);
  const isMobile = useIsMobile();

  if (!isRunning) {
    return (
      <DashboardLayout>
        <TeleprompterSetup
          scriptText={scriptText} setScriptText={setScriptText}
          breathMarkers={breathMarkers} setBreathMarkers={setBreathMarkers}
          autoSpeed={autoSpeed} setAutoSpeed={setAutoSpeed}
          bgColor={bgColor} setBgColor={setBgColor}
          voiceFollow={voiceFollow} setVoiceFollow={setVoiceFollow}
          timerMinutes={timerMinutes} setTimerMinutes={setTimerMinutes}
          onStart={() => setIsRunning(true)}
        />
      </DashboardLayout>
    );
  }

  return (
    <TeleprompterRunner
      blocks={parseBlocks(scriptText, breathMarkers)}
      rawText={scriptText}
      isMobile={isMobile}
      initialTimerSeconds={timerMinutes * 60}
      breathMarkersEnabled={breathMarkers}
      autoSpeedEnabled={autoSpeed}
      bgColor={bgColor}
      voiceFollow={voiceFollow}
      onExit={() => setIsRunning(false)}
    />
  );
}

/* ─── Runner: fullscreen scrolling teleprompter with smart features ─── */
interface RunnerProps {
  blocks: ScriptBlock[];
  rawText: string;
  isMobile: boolean;
  initialTimerSeconds: number;
  breathMarkersEnabled: boolean;
  autoSpeedEnabled: boolean;
  bgColor: string;
  voiceFollow: boolean;
  onExit: () => void;
}

function TeleprompterRunner({
  blocks, rawText, isMobile, initialTimerSeconds,
  breathMarkersEnabled, autoSpeedEnabled, bgColor, voiceFollow, onExit,
}: RunnerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(isMobile ? 30 : 40);
  const [fontSize, setFontSize] = useState(isMobile ? 28 : 32);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [isMirror, setIsMirror] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [activeBg, setActiveBg] = useState(bgColor);
  const [pinControls, setPinControls] = useState(isMobile); // pinned by default on mobile
  const [timeLeft, setTimeLeft] = useState(initialTimerSeconds);

  // Determine if background is light for text color adaptation
  const isLightBg = useMemo(() => {
    const hex = activeBg.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 140;
  }, [activeBg]);
  const textBase = isLightBg ? "text-gray-900" : "text-white";
  const textMuted = isLightBg ? "text-gray-900/40" : "text-white/40";
  const textDim = isLightBg ? "text-gray-900/25" : "text-white/25";
  const hudBg = isLightBg ? "bg-white/80" : "bg-black/60";
  const hudText = isLightBg ? "text-gray-700" : "text-white/70";
  const controlLabel = isLightBg ? "text-gray-600" : "text-white/50";
  const controlsBg = isLightBg ? "bg-white/95 border-gray-200" : "bg-black/90 border-white/10";
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartFontRef = useRef<number>(fontSize);

  // Build flat word list for voice matching
  const allScriptWords = useMemo(() => {
    return blocks.flatMap((b) => b.body.split(/\s+/).filter((w) => w && w !== "◆"));
  }, [blocks]);

  // Voice Follow hook
  const voiceFollowHook = useVoiceFollow({
    scriptWords: allScriptWords,
    onWordMatch: (wordIndex) => {
      let remaining = wordIndex;
      for (let i = 0; i < blocks.length; i++) {
        const blockWords = blocks[i].body.split(/\s+/).filter((w) => w && w !== "◆").length;
        if (remaining < blockWords) {
          setCurrentBlock(i);
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

  const { isListening, confidence, toggleListening: toggleVoiceFollow } = voiceFollowHook;

  const isTimerWarning = timeLeft <= 60 && timeLeft > 0;

  // Auto-start voice follow if enabled in setup
  useEffect(() => {
    if (voiceFollow && !isListening) {
      toggleVoiceFollow();
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isTimerDone = timeLeft <= 0;

  // Total words and words-per-block
  const totalWords = useMemo(() => countWords(rawText), [rawText]);
  const blockWordCounts = useMemo(() => blocks.map((b) => countWords(b.body)), [blocks]);

  // Words read so far (approx)
  const wordsReadSoFar = useMemo(() => {
    let count = 0;
    for (let i = 0; i < currentBlock; i++) count += blockWordCounts[i];
    count += currentWordIndex;
    return Math.min(count, totalWords);
  }, [currentBlock, currentWordIndex, blockWordCounts, totalWords]);

  const remainingWords = totalWords - wordsReadSoFar;

  // Smart time estimation
  const currentWPM = speed * 2.5;
  const estimatedSecondsLeft = remainingWords > 0 ? Math.round((remainingWords / currentWPM) * 60) : 0;

  // Auto-speed adjustment
  useEffect(() => {
    if (!autoSpeedEnabled || !isPlaying || timeLeft <= 0 || remainingWords <= 0) return;
    const neededWPM = (remainingWords / timeLeft) * 60;
    const neededSpeed = Math.round(neededWPM / 2.5);
    const clamped = Math.max(10, Math.min(120, neededSpeed));
    const interval = setInterval(() => {
      setSpeed((prev) => {
        const diff = clamped - prev;
        if (Math.abs(diff) < 2) return clamped;
        return Math.round(prev + diff * 0.2);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoSpeedEnabled, isPlaying, timeLeft, remainingWords]);

  // Keep screen awake
  useEffect(() => {
    let wakeLock: any = null;
    (navigator as any).wakeLock?.request?.("screen").then((wl: any) => { wakeLock = wl; }).catch(() => {});
    return () => { wakeLock?.release?.(); };
  }, []);

  // Request fullscreen (skip on mobile — unreliable)
  useEffect(() => {
    if (!isMobile) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    return () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  }, [isMobile]);

  // Countdown timer
  useEffect(() => {
    if (!isPlaying || timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [isPlaying, timeLeft]);

  // Word-by-word karaoke tracking
  useEffect(() => {
    if (!isPlaying) return;
    const wpm = currentWPM;
    const msPerWord = 60000 / wpm;
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => {
        const maxWords = blockWordCounts[currentBlock] || 0;
        if (prev >= maxWords - 1) return prev;
        return prev + 1;
      });
    }, msPerWord);
    return () => clearInterval(interval);
  }, [isPlaying, currentWPM, currentBlock, blockWordCounts]);

  // Reset word index when block changes
  useEffect(() => {
    setCurrentWordIndex(0);
  }, [currentBlock]);

  // Auto-hide controls on mobile (skip if pinned)
  useEffect(() => {
    if (!isMobile || !showControls || !isPlaying || pinControls) return;
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
    return () => clearTimeout(controlsTimerRef.current);
  }, [showControls, isPlaying, isMobile]);

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
        setCurrentBlock(i);
        break;
      }
    }
    animFrameRef.current = requestAnimationFrame(animate);
  }, [speed]);

  useEffect(() => {
    if (isListening) {
      // Voice follow mode — don't auto-scroll
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
      if (e.key === "ArrowRight") jumpToBlock(currentBlock + 1);
      if (e.key === "ArrowLeft") jumpToBlock(currentBlock - 1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onExit, currentBlock]);

  // Touch (with pinch-to-zoom for font size)
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
      dx < 0 ? jumpToBlock(currentBlock + 1) : jumpToBlock(currentBlock - 1);
    }
  };

  const jumpToBlock = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, blocks.length - 1));
    setCurrentBlock(clamped);
    const children = scrollRef.current?.children;
    if (children?.[clamped]) {
      (children[clamped] as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Render words with karaoke highlight
  const renderBody = (body: string, blockIdx: number) => {
    if (blockIdx !== currentBlock) {
      return renderWithBreathMarkers(body, false, -1);
    }
    return renderWithBreathMarkers(body, true, currentWordIndex);
  };

  const renderWithBreathMarkers = (text: string, isCurrentBlock: boolean, highlightIdx: number) => {
    const segments = parseCues(text);
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
            const isHighlighted = isCurrentBlock && wordCounter <= highlightIdx;

            return (
              <span
                key={`${si}-${wi}`}
                className={`transition-colors duration-150 ${
                  isHighlighted ? textBase : isCurrentBlock ? textMuted : ""
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
      style={{ backgroundColor: activeBg }}
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
        <div className={`backdrop-blur rounded-full px-3 py-1.5 ${hudBg} ${hudText} text-xs font-mono flex items-center gap-1.5`}>
          <Gauge className="w-3 h-3" />
          ~{formatTime(estimatedSecondsLeft)} left
        </div>
        <div className={`backdrop-blur rounded-full px-3 py-1.5 font-mono text-sm flex items-center gap-1.5 ${
          isTimerDone ? "bg-red-500/30 text-red-400 animate-pulse" :
          isTimerWarning ? "bg-amber-500/20 text-amber-400" :
          `${hudBg} ${hudText}`
        }`}>
          <Timer className="w-3.5 h-3.5" />
          {isTimerDone ? "TIME" : formatTime(timeLeft)}
        </div>
        <button
          onClick={() => setTimeLeft(initialTimerSeconds)}
          className={`${hudBg} backdrop-blur rounded-full p-1.5 ${hudText} hover:opacity-80 transition-colors`}
          title="Reset timer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Auto-speed indicator */}
      {autoSpeedEnabled && isPlaying && (
        <div className="fixed top-4 left-4 z-20">
          <div className="backdrop-blur rounded-full px-3 py-1.5 bg-blue-500/20 text-blue-400 text-xs font-mono flex items-center gap-1.5">
            <Gauge className="w-3 h-3" />
            Auto · {speed}px/s
          </div>
        </div>
      )}

      {/* Words progress */}
      <div className="fixed top-0 left-0 right-0 z-10 h-0.5 bg-white/5">
        <div
          className="h-full bg-primary/50 transition-all duration-300"
          style={{ width: `${totalWords > 0 ? (wordsReadSoFar / totalWords) * 100 : 0}%` }}
        />
      </div>

      {/* Script area — touch handlers here only, so controls aren't intercepted */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto pt-[35vh] pb-[60vh] ${isMobile ? "px-5" : "px-8 md:px-16 lg:px-32"}`}
        style={{ transform: isMirror ? "scaleX(-1)" : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {blocks.map((s, i) => (
          <div key={i} className={isMobile ? "mb-12" : "mb-16"}>
            <p className="text-primary/60 font-display font-bold mb-3 uppercase tracking-widest" style={{ fontSize: isMobile ? fontSize * 0.45 : fontSize * 0.5 }}>
              {s.heading}
            </p>
            <p
              className={`leading-relaxed font-medium transition-colors duration-300 whitespace-pre-wrap ${
                i !== currentBlock ? textDim : ""
              }`}
              style={{ fontSize, lineHeight: 1.6 }}
            >
              {renderBody(s.body, i)}
            </p>
          </div>
        ))}
      </div>

      {/* Reading line */}
      <div className="fixed top-1/3 left-0 right-0 pointer-events-none"><div className="h-0.5 bg-primary/30" /></div>

      {/* Block indicator */}
      {isMobile && (
        <div className="fixed top-12 left-4 z-10 pointer-events-none">
          <div className={`${hudBg} backdrop-blur rounded-full px-3 py-1 text-xs ${hudText} font-mono`}>
            {currentBlock + 1} / {blocks.length}
          </div>
        </div>
      )}

      {isMobile && !showControls && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-[10px] text-white/20">Tap to show controls · Swipe to navigate</span>
        </motion.div>
      )}

      {/* Settings panel overlay */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-72 z-30 backdrop-blur-xl border rounded-2xl p-4 space-y-4 ${
            isLightBg ? "bg-white/95 border-gray-200" : "bg-black/95 border-white/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${isLightBg ? "text-gray-900" : "text-white"}`}>Settings</span>
            <Button variant="ghost" size="icon" className={`h-7 w-7 ${isLightBg ? "text-gray-500" : "text-white/60"}`} onClick={() => setShowSettings(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Background Color */}
          <div className="space-y-2">
            <span className={`text-xs ${isLightBg ? "text-gray-500" : "text-white/50"} uppercase tracking-wider`}>Background</span>
            <div className="flex gap-2 flex-wrap">
              {BG_PRESETS.map((bg) => (
                <button
                  key={bg.value}
                  onClick={() => setActiveBg(bg.value)}
                  title={bg.label}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    activeBg === bg.value ? "border-primary scale-110" : isLightBg ? "border-gray-300" : "border-white/20"
                  }`}
                  style={{ backgroundColor: bg.value }}
                />
              ))}
            </div>
          </div>

          {/* Voice Follow */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-purple-400" />
              <span className={`text-sm ${isLightBg ? "text-gray-700" : "text-white/80"}`}>Voice Follow</span>
            </div>
            <Switch checked={isListening} onCheckedChange={toggleVoiceFollow} />
          </div>

          {/* Mirror */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className={`w-4 h-4 ${isLightBg ? "text-gray-500" : "text-white/60"}`} />
              <span className={`text-sm ${isLightBg ? "text-gray-700" : "text-white/80"}`}>Mirror Mode</span>
            </div>
            <Switch checked={isMirror} onCheckedChange={setIsMirror} />
          </div>

          {/* Pin Controls */}
          {isMobile && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlignLeft className={`w-4 h-4 ${isLightBg ? "text-gray-500" : "text-white/60"}`} />
                <span className={`text-sm ${isLightBg ? "text-gray-700" : "text-white/80"}`}>Keep Controls Visible</span>
              </div>
              <Switch checked={pinControls} onCheckedChange={setPinControls} />
            </div>
          )}

          {/* Font size */}
          <div className="space-y-2">
            <span className={`text-xs ${isLightBg ? "text-gray-500" : "text-white/50"} uppercase tracking-wider`}>Font Size</span>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className={`h-7 w-7 ${hudText}`} onClick={() => setFontSize((s) => Math.max(s - 4, 18))}>
                <Minus className="w-3 h-3" />
              </Button>
              <span className={`text-sm ${hudText} font-mono`}>{fontSize}px</span>
              <Button variant="ghost" size="icon" className={`h-7 w-7 ${hudText}`} onClick={() => setFontSize((s) => Math.min(s + 4, 72))}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Controls */}
      {(showControls || !isMobile || pinControls) && (
        <motion.div initial={{ y: 80 }} animate={{ y: 0 }} className={`shrink-0 border-t ${controlsBg} backdrop-blur ${isMobile ? "px-3 py-2" : "px-4 py-3"}`}
          style={isMobile ? { paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" } : undefined}
        >
          {isMobile ? (
            <div className="space-y-2.5">
              {/* Row 1: Exit · Playback · Mic · Settings */}
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={onExit} className={`${hudText} h-9 px-2`}>
                  <X className="w-4 h-4 mr-1" /> Exit
                </Button>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className={`h-9 w-9 ${hudText}`} onClick={() => jumpToBlock(currentBlock - 1)} disabled={currentBlock === 0}>
                    <SkipBack className="w-5 h-5" />
                  </Button>
                  <Button variant={isPlaying ? "default" : "outline"} size="icon" className="h-10 w-10" onClick={() => setIsPlaying((p) => !p)}>
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className={`h-9 w-9 ${hudText}`} onClick={() => jumpToBlock(currentBlock + 1)} disabled={currentBlock === blocks.length - 1}>
                    <SkipForward className="w-5 h-5" />
                  </Button>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-9 w-9 ${isListening ? "text-purple-400" : hudText}`}
                    onClick={toggleVoiceFollow}
                  >
                    {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-9 w-9 ${showSettings ? "text-primary" : hudText}`}
                    onClick={() => setShowSettings((s) => !s)}
                  >
                    <Settings2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              {/* Row 2: Speed slider + font size quick buttons */}
              <div className="flex items-center gap-2 px-1">
                <span className={`text-[10px] ${controlLabel} uppercase tracking-wider shrink-0`}>Speed</span>
                <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={10} max={100} step={5} className="flex-1" />
                <span className={`text-xs ${hudText} font-mono w-6 text-right`}>{speed}</span>
                <div className={`w-px h-4 ${isLightBg ? "bg-gray-300" : "bg-white/15"}`} />
                <Button variant="ghost" size="icon" className={`h-7 w-7 ${hudText}`} onClick={() => setFontSize((s) => Math.max(s - 4, 18))}>
                  <Minus className="w-3 h-3" />
                </Button>
                <span className={`text-[10px] ${controlLabel} font-mono`}>{fontSize}</span>
                <Button variant="ghost" size="icon" className={`h-7 w-7 ${hudText}`} onClick={() => setFontSize((s) => Math.min(s + 4, 72))}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              {/* Row 3: Labels for context */}
              <div className="flex items-center justify-between px-1">
                <span className={`text-[9px] ${controlLabel}`}>{currentBlock + 1}/{blocks.length} sections</span>
                <div className="flex items-center gap-3">
                  {isListening && <span className="text-[9px] text-purple-400">🎤 Voice On</span>}
                  <span className={`text-[9px] ${controlLabel}`}>Tap ⚙️ for more settings</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between max-w-4xl mx-auto gap-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onExit} className={`${hudText} gap-1.5`}><X className="w-4 h-4" /> Exit</Button>
                <div className={`h-5 w-px ${isLightBg ? "bg-gray-300" : "bg-white/20"}`} />
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${hudText}`} onClick={() => jumpToBlock(currentBlock - 1)} disabled={currentBlock === 0}><SkipBack className="w-4 h-4" /></Button>
                <span className={`text-xs ${hudText} font-mono tabular-nums min-w-[4ch] text-center`}>{currentBlock + 1}/{blocks.length}</span>
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${hudText}`} onClick={() => jumpToBlock(currentBlock + 1)} disabled={currentBlock === blocks.length - 1}><SkipForward className="w-4 h-4" /></Button>
              </div>
              <div className="flex items-center gap-3">
                <Button variant={isPlaying ? "default" : "outline"} size="sm" onClick={() => setIsPlaying((p) => !p)} className="gap-1.5 min-w-[80px]">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{isPlaying ? "Pause" : "Play"}
                </Button>
                <div className={`flex items-center gap-2 ${hudText}`}>
                  <span className="text-xs">Speed</span>
                  <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={10} max={120} step={5} className="w-24" />
                  <span className="text-xs font-mono w-6">{speed}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${hudText}`} onClick={() => setFontSize((s) => Math.max(s - 4, 16))}><Minus className="w-3 h-3" /></Button>
                <AlignLeft className={`w-4 h-4 ${textMuted}`} />
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${hudText}`} onClick={() => setFontSize((s) => Math.min(s + 4, 72))}><Plus className="w-3 h-3" /></Button>
                <div className={`h-5 w-px ${isLightBg ? "bg-gray-300" : "bg-white/20"}`} />
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${isListening ? "text-purple-400" : hudText}`}
                  onClick={toggleVoiceFollow}
                  title="Voice Follow"
                >
                  {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${showSettings ? "text-primary" : hudText}`}
                  onClick={() => setShowSettings((s) => !s)}
                  title="Settings"
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
