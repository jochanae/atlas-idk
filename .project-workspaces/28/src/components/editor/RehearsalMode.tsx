import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, Clock, Pause, Play, RotateCcw, Mic, MicOff, AlertTriangle, CheckCircle, Users, Video, VideoOff, Camera, CameraOff, ChevronDown, Info, ArrowRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Progress } from "@/components/ui/progress";
import ScaledSlide from "./ScaledSlide";
import SlideRenderer from "./SlideRenderer";
import type { Slide } from "@/hooks/useSlides";
import type { SlideTheme } from "@/lib/slideThemes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AudienceReactionSimulator from "./AudienceReactionSimulator";
import type { SlideContentForReaction } from "./AudienceReactionSimulator";
import { useRehearsalMediaRecorder } from "@/hooks/useRehearsalMediaRecorder";
import { useRehearsalRecordings } from "@/hooks/useRehearsalRecordings";

interface RehearsalModeProps {
  slides: Slide[];
  startIndex?: number;
  onExit: () => void;
  theme?: SlideTheme;
  targetMinutes?: number;
  presentationId?: string;
}

interface SpeechStats {
  wordCount: number;
  fillerWords: number;
  fillerList: string[];
  wpm: number;
  transcript: string;
}

const FILLER_WORDS = ["um", "uh", "like", "you know", "basically", "actually", "literally", "right", "so", "well", "I mean"];

export default function RehearsalMode({ slides, startIndex = 0, onExit, theme, targetMinutes = 10, presentationId }: RehearsalModeProps) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const isMobile = useIsMobile();
  const [showAudience, setShowAudience] = useState(false);
  const [showDoneScreen, setShowDoneScreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [captureWithVideo, setCaptureWithVideo] = useState(false);
  const captureWithVideoRef = useRef(false); // ref to avoid stale closure in countdown
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [useElevenLabs, setUseElevenLabs] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [slideStats, setSlideStats] = useState<Record<number, SpeechStats>>({});
  const [slideTimings, setSlideTimings] = useState<number[]>(() => new Array(slides.length).fill(0));
  const [slideEnteredAt, setSlideEnteredAt] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [encouragement] = useState(() => {
    const msgs = ["You've got this! 💪", "Time to shine! ✨", "Own that stage! 🎤", "Your audience is lucky! 🌟", "Breathe deep, speak bold! 🔥"];
    return msgs[Math.floor(Math.random() * msgs.length)];
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const slideStartTimeRef = useRef(0);
  const isRecordingRef = useRef(false);

  const { isCapturing, startCapture, stopCapture, getStream } = useRehearsalMediaRecorder();
  const { create: createRecording } = useRehearsalRecordings(presentationId);

  // Keep ref in sync
  useEffect(() => {
    captureWithVideoRef.current = captureWithVideo;
  }, [captureWithVideo]);

  // Webcam preview — only start when toggled on AND not currently capturing
  // (when capturing with video, the capture stream provides the video)
  useEffect(() => {
    if (!captureWithVideo) {
      // Only stop the preview stream, not any capture stream
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        webcamStreamRef.current = null;
      }
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = null;
      }
      return;
    }
    // Start preview stream
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        webcamStreamRef.current = stream;
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
        }
      } catch {
        toast.error("Could not access camera");
        setCaptureWithVideo(false);
      }
    })();
    return () => {
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    };
  }, [captureWithVideo]);

  const targetSeconds = targetMinutes * 60;
  const secsPerSlide = targetSeconds / slides.length;

  // Countdown effect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setIsPaused(false);
      // Auto-start speech recognition and media capture
      startRecording();
      const mode = captureWithVideoRef.current ? "video" : "audio";
      startCapture(mode).then(() => {
        // If capturing video, pipe the capture stream to the webcam preview element
        // so the camera stays visible during recording
        if (captureWithVideoRef.current && webcamVideoRef.current) {
          // The useRehearsalMediaRecorder already acquired a video stream
          // We need to show it in the PiP — get the stream from the recorder
          // Stop the old preview stream first to avoid conflicts
          if (webcamStreamRef.current) {
            webcamStreamRef.current.getTracks().forEach((t) => t.stop());
            webcamStreamRef.current = null;
          }
        }
      });
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer
  useEffect(() => {
    if (isPaused) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [isPaused]);

  useEffect(() => {
    setSlideEnteredAt(elapsed);
    slideStartTimeRef.current = Date.now();
    transcriptRef.current = "";
    setLiveTranscript("");
  }, [index]);

  // Try ElevenLabs first, fallback to browser
  const startRecording = useCallback(async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript + " ";
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        transcriptRef.current = final;
        setLiveTranscript(final + interim);
      };

      recognition.onerror = (e: any) => {
        console.error("Speech recognition error:", e.error);
        if (e.error === "not-allowed") {
          toast.error("Microphone access denied. Please enable it in your browser settings.");
        }
      };

      recognition.onend = () => {
        // Use ref to avoid stale closure
        if (isRecordingRef.current) {
          try { recognition.start(); } catch { /* ignore */ }
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
        isRecordingRef.current = true;
        setIsRecording(true);
        toast.success("Recording started — speak naturally!");
      } catch (err) {
        toast.error("Could not start speech recognition");
      }
    } else {
      toast.error("Speech recognition not supported in this browser. Try Chrome.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    
    // Analyze the transcript for the current slide
    analyzeTranscript(index);
  }, [index]);

  const analyzeTranscript = (slideIdx: number) => {
    const text = transcriptRef.current.trim();
    if (!text) return;

    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const elapsedSecs = (Date.now() - slideStartTimeRef.current) / 1000;
    const wpm = elapsedSecs > 0 ? Math.round((wordCount / elapsedSecs) * 60) : 0;

    const lowerText = text.toLowerCase();
    const fillerList: string[] = [];
    let fillerCount = 0;
    for (const filler of FILLER_WORDS) {
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      const matches = lowerText.match(regex);
      if (matches) {
        fillerCount += matches.length;
        for (let i = 0; i < matches.length; i++) fillerList.push(filler);
      }
    }

    setSlideStats((prev) => ({
      ...prev,
      [slideIdx]: {
        wordCount,
        fillerWords: fillerCount,
        fillerList,
        wpm,
        transcript: text,
      },
    }));
  };

  const recordSlideTime = useCallback(() => {
    const timeOnSlide = elapsed - slideEnteredAt;
    setSlideTimings((prev) => {
      const next = [...prev];
      next[index] = (next[index] || 0) + timeOnSlide;
      return next;
    });
    if (isRecording) {
      analyzeTranscript(index);
    }
  }, [elapsed, slideEnteredAt, index, isRecording]);

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
    if (e.key === "Escape") { recordSlideTime(); stopRecording(); onExit(); }
    if (e.key === "p" || e.key === "P") setIsPaused((v) => !v);
  }, [goNext, goPrev, onExit, recordSlideTime, stopRecording]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const expectedTimeAtSlide = (index + 1) * secsPerSlide;
  const paceDiffSeconds = elapsed - expectedTimeAtSlide;
  const paceDiffMinutes = Math.abs(Math.round(paceDiffSeconds / 60));
  const paceStatus =
    elapsed > expectedTimeAtSlide + secsPerSlide ? "slow" :
    elapsed < expectedTimeAtSlide - secsPerSlide ? "fast" : "on-track";

  const timeOnCurrentSlide = elapsed - slideEnteredAt;
  const currentSlide = slides[index];
  const notes = currentSlide?.notes;
  const currentStats = slideStats[index];
  const overallProgress = Math.min((elapsed / targetSeconds) * 100, 100);

  // Overall stats
  const totalWords = Object.values(slideStats).reduce((sum, s) => sum + s.wordCount, 0);
  const totalFillers = Object.values(slideStats).reduce((sum, s) => sum + s.fillerWords, 0);
  const overallWpm = elapsed > 0 ? Math.round((totalWords / elapsed) * 60) : 0;

  const talkingPoints = notes
    ? notes.split("\n").filter((l) => l.trim().length > 0).slice(0, 5)
    : [];

  // --- Done screen ---
  if (showDoneScreen) {
    return (
      <div ref={containerRef} className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-6 p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center"
        >
          <CheckCircle className="w-8 h-8 text-green-500" />
        </motion.div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">Rehearsal Saved!</h2>
          <p className="text-sm text-muted-foreground">
            {formatTime(elapsed)} recorded • {overallWpm} WPM{totalFillers > 0 ? ` • ${totalFillers} filler words` : ""}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <Button
            className="flex-1 gap-2"
            onClick={() => { onExit(); navigate("/coaching"); }}
          >
            <ArrowRight className="w-4 h-4" /> View in Coaching Hub
          </Button>
          <Button variant="outline" className="flex-1" onClick={onExit}>
            Back to Editor
          </Button>
        </div>
      </div>
    );
  }

  // --- Countdown overlay ---
  if (countdown !== null) {
    return (
      <div ref={containerRef} className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-6">
        <motion.p
          key="encourage"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-medium text-muted-foreground"
        >
          {encouragement}
        </motion.p>
        <AnimatePresence mode="wait">
          <motion.div
            key={countdown}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-8xl font-display font-bold text-primary"
          >
            {countdown}
          </motion.div>
        </AnimatePresence>
        <p className="text-sm text-muted-foreground">Get ready…</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Pacing alert bar */}
      <AnimatePresence>
        {paceStatus !== "on-track" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shrink-0 ${
              paceStatus === "slow" ? "bg-destructive/15 text-destructive" : "bg-blue-500/15 text-blue-400"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            {paceStatus === "slow"
              ? `You're ~${paceDiffMinutes > 0 ? paceDiffMinutes + " min " : ""}behind — consider picking up the pace`
              : `You're ~${paceDiffMinutes > 0 ? paceDiffMinutes + " min " : ""}ahead of schedule — take your time`}
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
          {/* Webcam PiP overlay — show when camera is toggled on */}
          {captureWithVideo && (
            <div className="absolute bottom-3 right-3 w-28 h-20 md:w-40 md:h-28 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl z-10">
              <video
                ref={(el) => {
                  (webcamVideoRef as any).current = el;
                  // When capturing, pipe the capture stream's video to the preview
                  if (el && isCapturing) {
                    const captureStream = getStream();
                    if (captureStream && captureStream.getVideoTracks().length > 0) {
                      if (el.srcObject !== captureStream) el.srcObject = captureStream;
                      return;
                    }
                  }
                  // Otherwise use the preview-only webcam stream
                  if (el && webcamStreamRef.current) {
                    if (el.srcObject !== webcamStreamRef.current) el.srcObject = webcamStreamRef.current;
                  }
                }}
                autoPlay muted playsInline
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
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
          
          {/* Live transcript overlay */}
          {isRecording && liveTranscript && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/70 rounded-lg px-4 py-2 max-h-20 overflow-y-auto">
              <p className="text-white/80 text-sm">{liveTranscript.slice(-200)}</p>
            </div>
          )}
        </div>

        {/* Coach panel */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-card flex flex-col shrink-0 max-h-[40dvh] md:max-h-none overflow-y-auto">
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

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {/* Recording status */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">🎤 Speech Coaching</p>
              <Button
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                {isRecording ? "Stop" : "Record"}
              </Button>
            </div>

            {/* Live speech stats */}
            {isRecording && (
              <div className="bg-secondary/50 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Words spoken</span>
                  <span className="font-medium">{liveTranscript.split(/\s+/).filter(Boolean).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Speaking pace</span>
                  <span className={`font-medium ${overallWpm > 160 ? "text-destructive" : overallWpm < 100 ? "text-blue-400" : "text-green-400"}`}>
                    {overallWpm} WPM
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {overallWpm > 160 ? "⚡ Slow down a bit" : overallWpm < 100 ? "🐢 Try speaking a bit faster" : "✅ Great pace!"}
                </div>
              </div>
            )}

            {/* Overall speech analysis */}
            {totalWords > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">📊 Speech Analysis</p>
                <div className="bg-secondary/50 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total words</span>
                    <span className="font-medium">{totalWords}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average pace</span>
                    <span className="font-medium">{overallWpm} WPM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Filler words</span>
                    <span className={`font-medium ${totalFillers > 5 ? "text-destructive" : "text-green-400"}`}>
                      {totalFillers}
                    </span>
                  </div>
                  {totalFillers > 0 && (
                    <div className="pt-1 border-t border-border">
                      <span className="text-muted-foreground">Most common: </span>
                      <span className="text-destructive">
                        {Object.entries(
                          Object.values(slideStats)
                            .flatMap(s => s.fillerList)
                            .reduce((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc; }, {} as Record<string, number>)
                        )
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 3)
                          .map(([w, c]) => `"${w}" (${c}x)`)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
          )}

          {/* Audience Reactions drawer trigger — desktop only; mobile uses bottom bar */}
          <div className="hidden md:block">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showAudience ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setShowAudience(v => !v)}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-[10px]">Reactions</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-relaxed">
                Simulated audience reactions — analyzes your slide's tone to show how engaging your content might be
              </TooltipContent>
            </Tooltip>
          </div>
            {/* Talking points — shown FIRST for visibility on mobile */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">💡 Key Talking Points</p>
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
                <p className="text-xs text-muted-foreground italic">Add speaker notes to see talking points</p>
              )}
            </div>

            {/* Audience Reaction Simulator moved to bottom bar drawer */}

            {/* Per-slide timing */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">⏱️ Slide Timing</p>
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
      <div className="h-14 border-t border-border bg-card flex items-center justify-between px-2 md:px-4 shrink-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 md:gap-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={async () => {
            recordSlideTime();
            stopRecording();
            // Auto-save recording with stats
            let audioUrl: string | null = null;
            if (isCapturing) {
              audioUrl = await stopCapture();
            }
            const totalWords = Object.values(slideStats).reduce((sum, s) => sum + s.wordCount, 0);
            const totalFillers = Object.values(slideStats).reduce((sum, s) => sum + s.fillerWords, 0);
            const overallWpm = elapsed > 0 ? Math.round((totalWords / elapsed) * 60) : 0;
            if (elapsed > 5) {
              try {
                await createRecording.mutateAsync({
                  title: `Rehearsal ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
                  presentation_id: presentationId,
                  duration_seconds: elapsed,
                  audio_url: audioUrl ?? undefined,
                  wpm_average: overallWpm || undefined,
                  filler_word_count: totalFillers || undefined,
                  slide_timings: slideTimings,
                });
                setShowDoneScreen(true);
                return; // Don't exit yet — show done screen
              } catch (err: any) {
                console.error("[Rehearsal] Save error:", err);
                toast.error("Failed to save rehearsal: " + (err.message || "Unknown error"));
              }
            } else {
              toast.info("Session too short to save (< 5 seconds)");
            }
            onExit();
          }} className="gap-1 md:gap-1.5 text-xs px-2 md:px-3">
            <X className="w-4 h-4" /> <span className="hidden md:inline">Exit Rehearsal</span><span className="md:hidden">Exit</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setElapsed(0); setSlideTimings(new Array(slides.length).fill(0)); setSlideStats({}); setIndex(0); }}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          
          {/* Audience Reactions — mobile/tablet bottom bar trigger moved earlier for better visibility */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showAudience ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 md:hidden"
                onClick={() => setShowAudience(v => !v)}
              >
                <Users className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Audience Reactions</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isCapturing ? "destructive" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={isCapturing ? async () => {
                  await stopCapture();
                  toast.info("Capture stopped");
                } : async () => {
                  await startCapture(captureWithVideo ? "video" : "audio");
                  toast.success(captureWithVideo ? "🎥 Video capture started" : "🎙️ Audio capture started");
                }}
              >
                {isCapturing ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">{isCapturing ? "Stop Capture" : (captureWithVideo ? "Capture Video" : "Capture Audio")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isCapturing ? "Stop recording the session" : "Record your rehearsal session (video/audio) to save and review later"}
            </TooltipContent>
          </Tooltip>

          {!isCapturing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setCaptureWithVideo(v => !v)}
                >
                  {captureWithVideo ? <Camera className="w-4 h-4 text-primary" /> : <CameraOff className="w-4 h-4 text-muted-foreground" />}
                  <span className="hidden sm:inline text-[10px]">{captureWithVideo ? "Cam On" : "Cam Off"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {captureWithVideo ? "Switch to audio-only capture" : "Enable webcam to record your video alongside audio"}
              </TooltipContent>
            </Tooltip>
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
        <div className="flex items-center gap-2 shrink-0">
          {isCapturing && (
            <span className="flex items-center gap-1 text-[10px] text-destructive whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
              <span className="hidden sm:inline">Capturing</span>
            </span>
          )}
          {isRecording && (
            <span className="flex items-center gap-1 text-[10px] text-destructive whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
              <span className="hidden sm:inline">Transcribing</span>
            </span>
          )}
          <div className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums text-xs">{formatTime(elapsed)}</span>
          </div>
        </div>
      </div>

      {/* Audience Reactions Drawer */}
      <Drawer open={showAudience} onOpenChange={setShowAudience}>
        <DrawerContent className="max-h-[50dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              Audience Reactions (Simulated)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-[11px] leading-relaxed">
                  Analyzes your slide's text and tone to show animated emoji reactions — giving you a feel for how engaging your content might be.
                </TooltipContent>
              </Tooltip>
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <AudienceReactionSimulator
              slideContent={{
                blockType: currentSlide?.block_type ?? "blank",
                wordCount: JSON.stringify(currentSlide?.content ?? {}).split(/\s+/).length,
                title: (currentSlide?.content as any)?.title ?? "",
                body: (currentSlide?.content as any)?.body ?? (currentSlide?.content as any)?.text ?? "",
              }}
              isActive={showAudience && !isPaused}
              compact={false}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
