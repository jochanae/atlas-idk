import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, ChevronLeft, ChevronRight, Clock, FileText, Volume2, VolumeX,
  Camera, CameraOff, Circle, Square, Pause, Play, Download, GripVertical,
  Maximize2, Minimize2, Music
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ScaledSlide from "./ScaledSlide";
import SlideRenderer from "./SlideRenderer";
import type { Slide } from "@/hooks/useSlides";
import type { SlideTheme, TransitionType } from "@/lib/slideThemes";
import { useIsMobile } from "@/hooks/use-mobile";
import LectureModeWalkthrough from "./LectureModeWalkthrough";
import EyeLineGuide from "./EyeLineGuide";

type PipShape = "circle" | "rounded" | "rectangle";
type PipSize = "small" | "medium" | "large";
type RecState = "off" | "recording" | "paused";

const PIP_SIZES: Record<PipSize, { w: number; h: number }> = {
  small: { w: 160, h: 120 },
  medium: { w: 240, h: 180 },
  large: { w: 320, h: 240 },
};

interface LectureModeProps {
  slides: Slide[];
  startIndex?: number;
  onExit: () => void;
  theme?: SlideTheme;
  transition?: TransitionType;
  backgroundMusicUrl?: string;
}

export default function LectureMode({
  slides,
  startIndex = 0,
  onExit,
  theme,
  transition = "fade",
  backgroundMusicUrl,
}: LectureModeProps) {
  const isMobile = useIsMobile();
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const [showNotes, setShowNotes] = useState(!isMobile);
  const [cameraOn, setCameraOn] = useState(true);
  const [pipShape, setPipShape] = useState<PipShape>("rounded");
  const [pipSize, setPipSize] = useState<PipSize>(isMobile ? "small" : "medium");
  const [recState, setRecState] = useState<RecState>("off");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(!!backgroundMusicUrl);

  // PiP dragging
  const [pipPos, setPipPos] = useState({ x: 0, y: 0 }); // offset from bottom-right
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const webcamRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Start webcam
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (webcamRef.current) webcamRef.current.srcObject = stream;
      } catch {
        toast.error("Could not access camera/microphone");
      }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  // Re-bind srcObject
  useEffect(() => {
    const v = webcamRef.current;
    const s = streamRef.current;
    if (v && s && v.srcObject !== s) v.srcObject = s;
  });

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Fullscreen
  useEffect(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // Background music
  useEffect(() => {
    if (backgroundMusicUrl && musicEnabled) {
      const m = new Audio(backgroundMusicUrl);
      m.loop = true; m.volume = 0.15;
      musicRef.current = m;
      m.play().catch(() => {});
    }
    return () => { musicRef.current?.pause(); musicRef.current = null; };
  }, [backgroundMusicUrl, musicEnabled]);

  // Recording
  const startRecording = useCallback(async () => {
    try {
      const slideEl = containerRef.current?.querySelector("#lecture-slide-area") as HTMLElement;
      if (!slideEl) return;

      const canvas = document.createElement("canvas");
      canvas.width = 1920; canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const { default: html2canvas } = await import("html2canvas");

      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream();
      canvasStream.getVideoTracks().forEach(t => combined.addTrack(t));
      streamRef.current?.getAudioTracks().forEach(t => combined.addTrack(t));

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "video/mp4";

      const recorder = new MediaRecorder(combined, {
        ...(MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : {}),
        videoBitsPerSecond: 2_500_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setVideoUrl(URL.createObjectURL(blob));
        setRecState("off");
        toast.success("Recording saved locally");
      };

      let frameInProgress = false;
      const drawFrame = () => {
        if (recorderRef.current?.state === "inactive") return;
        if (frameInProgress) { requestAnimationFrame(drawFrame); return; }
        frameInProgress = true;
        html2canvas(slideEl, { scale: 1, width: 1920, height: 1080, useCORS: true, logging: false })
          .then(slideCanvas => {
            ctx.drawImage(slideCanvas, 0, 0, 1920, 1080);
            // Draw webcam PiP onto canvas
            if (cameraOn && webcamRef.current && webcamRef.current.readyState >= 2) {
              const s = PIP_SIZES[pipSize];
              const pad = 24;
              ctx.save();
              ctx.beginPath();
              const x = 1920 - s.w - pad;
              const y = 1080 - s.h - pad;
              if (pipShape === "circle") {
                ctx.arc(x + s.w / 2, y + s.h / 2, Math.min(s.w, s.h) / 2, 0, Math.PI * 2);
              } else {
                ctx.roundRect(x, y, s.w, s.h, pipShape === "rounded" ? 16 : 0);
              }
              ctx.clip();
              ctx.drawImage(webcamRef.current, x, y, s.w, s.h);
              ctx.restore();
            }
            frameInProgress = false;
          })
          .catch(() => { frameInProgress = false; });
        requestAnimationFrame(drawFrame);
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      setRecState("recording");
      requestAnimationFrame(drawFrame);
    } catch (e: any) {
      toast.error("Recording failed: " + e.message);
    }
  }, [cameraOn, pipSize, pipShape]);

  const toggleRecording = () => {
    if (recState === "off") { startRecording(); return; }
    if (recState === "recording") {
      recorderRef.current?.pause();
      setRecState("paused");
      return;
    }
    if (recState === "paused") {
      recorderRef.current?.resume();
      setRecState("recording");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  // Navigation
  const goNext = useCallback(() => setIndex(i => Math.min(i + 1, slides.length - 1)), [slides.length]);
  const goPrev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), []);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onExit();
      if (e.key === "c" || e.key === "C") setCameraOn(p => !p);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onExit]);

  // PiP dragging
  const handlePipPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: pipPos.x, posY: pipPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePipPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = dragStartRef.current.x - e.clientX;
    const dy = dragStartRef.current.y - e.clientY;
    setPipPos({ x: dragStartRef.current.posX + dx, y: dragStartRef.current.posY + dy });
  };
  const handlePipPointerUp = () => setIsDragging(false);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const currentSlide = slides[index];
  const notes = currentSlide?.notes;
  const sz = PIP_SIZES[pipSize];
  const borderRadius = pipShape === "circle" ? "50%" : pipShape === "rounded" ? "16px" : "0";

  // Determine if current slide is an interaction block (quiz, poll, reflection, activity)
  const interactionTypes = ["quiz", "activity", "lesson-objective", "progress-checkpoint"];
  const isInteractionSlide = interactionTypes.includes(currentSlide?.block_type || "");

  // Smart instructor presence: auto-hide PiP on visual-heavy slides
  const contentObj = currentSlide?.content as Record<string, unknown> | undefined;
  const explicitFlag = contentObj?.instructor_visible;
  // Auto-detect: hide on image/video/gif/chart-heavy slides unless explicitly set
  const visualHeavyTypes = ["image", "gif", "video", "chart", "infographic"];
  const isVisualHeavy = visualHeavyTypes.includes(currentSlide?.block_type || "") ||
    !!(contentObj?.imageUrl && !contentObj?.heading) ||
    !!(contentObj?.videoUrl) ||
    !!(contentObj?.gifUrl);
  const instructorVisible = explicitFlag !== undefined
    ? explicitFlag !== false
    : !isVisualHeavy; // auto-hide on visual-heavy, show on everything else

  const [showWalkthrough, setShowWalkthrough] = useState(true);
  const [eyeLineEnabled, setEyeLineEnabled] = useState(true);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* First-run walkthrough */}
      {showWalkthrough && <LectureModeWalkthrough onDismiss={() => setShowWalkthrough(false)} />}
      {/* Main slide area */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className={`${showNotes && !isMobile ? "flex-1" : "w-full"} bg-black flex items-center justify-center relative`} id="lecture-slide-area">
          <AnimatePresence mode="wait" initial={false}>
            {currentSlide && (
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="w-full h-full absolute inset-0"
              >
                <ScaledSlide>
                  <SlideRenderer blockType={currentSlide.block_type} content={currentSlide.content} theme={theme} isPresenting slideId={currentSlide.id} />
                </ScaledSlide>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Webcam PiP overlay — draggable, auto-hides when instructor_visible is false */}
          <div
            className={`absolute z-30 overflow-hidden border-2 border-white/40 shadow-2xl bg-black/30 backdrop-blur-sm cursor-grab active:cursor-grabbing select-none transition-opacity duration-300 ${cameraOn && instructorVisible ? "flex opacity-100" : "hidden opacity-0"}`}
            style={{
              width: sz.w,
              height: sz.h,
              borderRadius,
              bottom: Math.max(16, pipPos.y),
              right: Math.max(16, pipPos.x),
              touchAction: "none",
            }}
            onPointerDown={handlePipPointerDown}
            onPointerMove={handlePipPointerMove}
            onPointerUp={handlePipPointerUp}
          >
            <video
              ref={webcamRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)", borderRadius }}
            />
            {/* Drag handle */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 p-1 rounded-full bg-black/40">
              <GripVertical className="w-3 h-3 text-white/60" />
            </div>
          </div>

          {/* Eye-line confidence guide */}
          {cameraOn && instructorVisible && (
            <EyeLineGuide
              enabled={eyeLineEnabled}
              pipBottom={Math.max(16, pipPos.y)}
              pipRight={Math.max(16, pipPos.x)}
              pipWidth={sz.w}
            />
          )}

          {/* Pause-for-Interaction overlay */}
          {isInteractionSlide && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
              <Badge className="bg-amber-500/90 text-white gap-2 text-sm px-4 py-2 animate-pulse shadow-lg">
                <Pause className="w-4 h-4" />
                Pause for Interaction
              </Badge>
            </div>
          )}

          {/* Recording badge */}
          {recState !== "off" && (
            <div className="absolute top-4 left-4 z-20">
              <Badge variant="destructive" className="animate-pulse gap-1.5 text-sm px-3 py-1">
                <Circle className="w-2.5 h-2.5 fill-current" />
                {recState === "recording" ? "REC" : "PAUSED"}
                <span className="font-mono ml-1">{formatTime(elapsed)}</span>
              </Badge>
            </div>
          )}
        </div>

        {/* Speaker notes panel (desktop) */}
        {showNotes && !isMobile && (
          <div className="w-72 border-l border-white/10 bg-zinc-900 flex flex-col shrink-0">
            <div className="p-3 border-b border-white/10">
              <p className="text-xs text-white/50 mb-2">Next Slide</p>
              <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black">
                {slides[index + 1] ? (
                  <ScaledSlide>
                    <SlideRenderer blockType={slides[index + 1].block_type} content={slides[index + 1].content} theme={theme} />
                  </ScaledSlide>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-white/30">End</div>
                )}
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <p className="text-xs text-white/50 mb-2 flex items-center gap-1"><FileText className="w-3 h-3" /> Speaker Notes</p>
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                {notes || "No notes for this slide."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile notes toggle */}
      {isMobile && showNotes && notes && (
        <div className="bg-zinc-900 border-t border-white/10 px-4 py-3 max-h-[25dvh] overflow-y-auto">
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{notes}</p>
        </div>
      )}

      {/* Bottom control bar */}
      <div
        className="h-14 border-t border-white/10 bg-zinc-900/90 backdrop-blur flex items-center justify-between px-3 shrink-0"
        style={{ paddingBottom: isMobile ? "max(0px, env(safe-area-inset-bottom))" : undefined }}
      >
        {/* Left: exit + toggles */}
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onExit} className="gap-1 text-white/70 hover:text-white h-9">
            <X className="w-4 h-4" /> {!isMobile && "Exit"}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/60 hover:text-white" onClick={() => setCameraOn(p => !p)}>
            {cameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/60 hover:text-white" onClick={() => setShowNotes(p => !p)}>
            <FileText className="w-4 h-4" />
          </Button>
          {backgroundMusicUrl && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white/60 hover:text-white" onClick={() => setMusicEnabled(p => !p)}>
              <Music className={`w-4 h-4 ${musicEnabled ? "text-primary" : ""}`} />
            </Button>
          )}
          {/* PiP shape cycle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[10px] text-white/50 hover:text-white"
            onClick={() => setPipShape(s => s === "circle" ? "rounded" : s === "rounded" ? "rectangle" : "circle")}
          >
            {pipShape === "circle" ? "●" : pipShape === "rounded" ? "▢" : "□"}
          </Button>
          {/* PiP size cycle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[10px] text-white/50 hover:text-white"
            onClick={() => setPipSize(s => s === "small" ? "medium" : s === "medium" ? "large" : "small")}
          >
            {pipSize === "small" ? <Minimize2 className="w-3.5 h-3.5" /> : pipSize === "large" ? <Maximize2 className="w-3.5 h-3.5" /> : <Square className="w-3 h-3" />}
          </Button>
          {/* Eye-line toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 text-[10px] ${eyeLineEnabled ? "text-primary" : "text-white/50"} hover:text-white`}
            onClick={() => setEyeLineEnabled(p => !p)}
            title="Toggle eye-line guide"
          >
            👁️
          </Button>
        </div>

        {/* Center: nav + recording */}
        <div className="flex items-center gap-2">
          {/* Record controls */}
          {recState === "off" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={toggleRecording}
            >
              <Circle className="w-3.5 h-3.5 fill-current" />
              {!isMobile && "Record"}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-white/70" onClick={toggleRecording}>
                {recState === "recording" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-red-400" onClick={stopRecording}>
                <Square className="w-3.5 h-3.5 fill-current" />
              </Button>
            </>
          )}

          <div className="w-px h-6 bg-white/10 mx-1" />

          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/70" onClick={goPrev} disabled={index === 0}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-sm font-semibold tabular-nums text-white/80 min-w-[4rem] text-center">
            {index + 1} / {slides.length}
          </span>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/70" onClick={goNext} disabled={index === slides.length - 1}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Right: timer + download */}
        <div className="flex items-center gap-2 text-sm text-white/50">
          {videoUrl && (
            <a href={videoUrl} download="lecture-recording.webm">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-white/60"><Download className="w-4 h-4" /></Button>
            </a>
          )}
          <Clock className="w-4 h-4" />
          <span className="font-mono tabular-nums">{formatTime(elapsed)}</span>
        </div>
      </div>
    </div>
  );
}
