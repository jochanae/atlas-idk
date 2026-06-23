import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Video, Circle, Square, Pause, Play, Camera, CameraOff, Mic, MicOff, Monitor, ChevronLeft, ChevronRight, X, Download, Clock, FileText, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSlides } from "@/hooks/useSlides";
import { usePresentation } from "@/hooks/usePresentations";
import { useCreateRecording, useUpdateRecording, uploadRecordingBlob } from "@/hooks/usePresentationRecordings";
import { supabase } from "@/integrations/supabase/client";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import { parseTheme } from "@/lib/slideThemes";
import { useIsMobile } from "@/hooks/use-mobile";

type RecordingState = "idle" | "countdown" | "recording" | "paused" | "processing" | "done";

const ENCOURAGEMENTS = [
  "You've got this! 💪",
  "Time to shine! ✨",
  "Own that stage! 🎤",
  "Your audience is lucky! 🌟",
  "Breathe deep, speak bold! 🔥",
];

export default function RecordingMode({ onClose }: { onClose: () => void }) {
  const { id: presentationId } = useParams<{ id: string }>();
  const { data: presentation } = usePresentation(presentationId);
  const { data: slides = [] } = useSlides(presentationId);
  const theme = parseTheme(presentation?.theme);
  const isMobile = useIsMobile();

  const [state, setState] = useState<RecordingState>("idle");
  const [slideIndex, setSlideIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [encouragement, setEncouragement] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const slideTimestampsRef = useRef<{ slideIndex: number; time: number }[]>([]);
  const recordingIdRef = useRef<string | null>(null);
  const stateRef = useRef<RecordingState>("idle");
  const cameraOnRef = useRef(true);

  const createRecording = useCreateRecording();
  const updateRecording = useUpdateRecording();

  // Start webcam preview on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        webcamStreamRef.current = stream;
        // Bind immediately and re-bind on every render cycle via the effect below
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
        }
      } catch {
        toast.error("Could not access camera/microphone", { position: "top-center" });
      }
    })();
    return () => { cancelled = true; webcamStreamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  // Re-bind srcObject whenever the ref or stream changes — prevents disappearing camera
  useEffect(() => {
    const video = webcamVideoRef.current;
    const stream = webcamStreamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
    }
  });

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { setCountdown(null); actuallyStartRecording(); return; }
    const t = setTimeout(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const initiateRecording = () => {
    setEncouragement(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
    setState("countdown");
    setCountdown(3);
  };

  const actuallyStartRecording = useCallback(async () => {
    if (!presentationId) return;
    try {
      const rec = await createRecording.mutateAsync({
        presentation_id: presentationId,
        title: `${presentation?.title || "Presentation"} — Recording`,
      });
      recordingIdRef.current = rec.id;

      const slideEl = document.getElementById("recording-slide-area");
      if (!slideEl) { toast.error("Slide area not found", { position: "top-center" }); return; }

      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const { default: html2canvas } = await import("html2canvas");

      const canvasStream = canvas.captureStream(30);
      const combinedStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));

      if (webcamStreamRef.current) {
        webcamStreamRef.current.getAudioTracks().forEach(t => combinedStream.addTrack(t));
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "video/mp4";

      const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: 2_500_000 };
      if (MediaRecorder.isTypeSupported(mimeType)) recorderOptions.mimeType = mimeType;

      const recorder = new MediaRecorder(combinedStream, recorderOptions);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onerror = (e: any) => { console.error("[Recording] error:", e); toast.error("Recording error"); };
      recorder.onstop = () => handleRecordingDone();
      mediaRecorderRef.current = recorder;

      let frameInProgress = false;
      const drawFrame = () => {
        if (stateRef.current === "done" || stateRef.current === "idle") return;
        if (frameInProgress) { requestAnimationFrame(drawFrame); return; }
        frameInProgress = true;
        html2canvas(slideEl, { scale: 1, width: 1920, height: 1080, useCORS: true, logging: false }).then((slideCanvas) => {
          ctx.drawImage(slideCanvas, 0, 0, 1920, 1080);
          if (cameraOnRef.current && webcamVideoRef.current && webcamVideoRef.current.readyState >= 2) {
            const camW = 320, camH = 240, padding = 24;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(1920 - camW - padding, 1080 - camH - padding, camW, camH, 12);
            ctx.clip();
            ctx.drawImage(webcamVideoRef.current, 1920 - camW - padding, 1080 - camH - padding, camW, camH);
            ctx.restore();
            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(1920 - camW - padding, 1080 - camH - padding, camW, camH, 12);
            ctx.stroke();
          }
          frameInProgress = false;
        }).catch(() => { frameInProgress = false; });
        requestAnimationFrame(drawFrame);
      };

      recorder.start(1000);
      setState("recording");
      stateRef.current = "recording";
      startTimeRef.current = Date.now();
      slideTimestampsRef.current = [{ slideIndex: 0, time: 0 }];

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      requestAnimationFrame(drawFrame);
    } catch (e: any) {
      console.error("Recording error:", e);
      toast.error("Failed to start recording: " + e.message, { position: "top-center" });
      setState("idle");
      stateRef.current = "idle";
    }
  }, [presentationId, presentation, createRecording]);

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setState("paused");
      stateRef.current = "paused";
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setState("recording");
      stateRef.current = "recording";
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setState("processing");
      stateRef.current = "processing";
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleRecordingDone = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: "video/webm" });
    const localUrl = URL.createObjectURL(blob);
    setVideoUrl(localUrl);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !recordingIdRef.current) throw new Error("No user or recording");
      const publicUrl = await uploadRecordingBlob(blob, user.id, recordingIdRef.current);
      await updateRecording.mutateAsync({
        id: recordingIdRef.current,
        video_url: publicUrl,
        duration_seconds: elapsed,
        slide_timestamps: slideTimestampsRef.current as any,
        status: "complete",
        file_size: blob.size,
      });
      toast.success("Recording saved!", { position: "top-center" });
    } catch (e: any) {
      console.error("Upload error:", e);
      toast.error("Recording saved locally but upload failed", { position: "top-center" });
    }

    setState("done");
    stateRef.current = "done";
  }, [elapsed, updateRecording]);

  const goSlide = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(slides.length - 1, slideIndex + dir));
    if (next !== slideIndex) {
      setSlideIndex(next);
      if (state === "recording") {
        slideTimestampsRef.current.push({ slideIndex: next, time: Math.floor((Date.now() - startTimeRef.current) / 1000) });
      }
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goSlide(1);
      if (e.key === "ArrowLeft") goSlide(-1);
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  const currentSlide = slides[slideIndex];
  const speakerNotes = currentSlide?.notes;

  // --- Countdown overlay ---
  if (state === "countdown" && countdown !== null) {
    return (
      <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center gap-6">
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
        <p className="text-sm text-muted-foreground">
          Get ready… {cameraOn ? "Camera & mic" : "Mic"} will activate
        </p>
      </div>
    );
  }

  // ============ MOBILE LAYOUT ============
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 bg-background flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Top bar — compact */}
        <div className="h-12 border-b flex items-center justify-between px-3 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
            {state === "recording" && (
              <Badge variant="destructive" className="animate-pulse gap-1">
                <Circle className="w-2 h-2 fill-current" /> REC
              </Badge>
            )}
            {state === "paused" && <Badge variant="secondary">Paused</Badge>}
            {state === "processing" && <Badge variant="secondary">Processing...</Badge>}
          </div>
          <div className="flex items-center gap-1 text-sm font-mono text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {formatTime(elapsed)}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={() => { setCameraOn(p => { cameraOnRef.current = !p; return !p; }); }}
            >
              {cameraOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5 text-muted-foreground" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setMicOn(p => !p)}>
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-muted-foreground" />}
            </Button>
          </div>
        </div>

        {/* Main content */}
        {state === "done" && videoUrl ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full space-y-4">
              <video src={videoUrl} controls className="w-full rounded-xl shadow-2xl border" />
              <div className="flex justify-center gap-3">
                <a href={videoUrl} download className="inline-flex">
                  <Button variant="outline" className="gap-1.5 h-11">
                    <Download className="w-4 h-4" /> Download
                  </Button>
                </a>
                <Button className="h-11" onClick={() => { setState("idle"); setElapsed(0); setVideoUrl(null); }}>
                  Record Again
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Slide area with camera PiP */}
            <div className="relative w-full aspect-video bg-black" id="recording-slide-area">
              {currentSlide && (
                <div className="absolute inset-0">
                  <ScaledSlide>
                    <SlideRenderer blockType={currentSlide.block_type} content={currentSlide.content} theme={theme} />
                  </ScaledSlide>
                </div>
              )}
              {/* Webcam PiP — ALWAYS mounted, CSS-hidden when off */}
              <div className={`absolute bottom-4 right-4 w-32 h-24 rounded-xl overflow-hidden border-2 border-white/50 shadow-2xl z-20 bg-black/20 backdrop-blur-sm ${cameraOn ? "flex" : "hidden"}`}>
                <video
                  ref={webcamVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              </div>
            </div>

            {/* Collapsible speaker notes */}
            <div className="border-t border-border bg-card shrink-0">
              <button
                className="w-full flex items-center justify-between px-4 py-2"
                onClick={() => setShowNotes(n => !n)}
              >
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</span>
                </div>
                {showNotes ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showNotes && (
                <div className="px-4 pb-3 max-h-[20dvh] overflow-y-auto">
                  {speakerNotes ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{speakerNotes}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No notes for this slide</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom controls — ALWAYS visible, large tap targets */}
        <div
          className="border-t bg-card shrink-0 px-3 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {/* Slide navigation */}
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => goSlide(-1)} disabled={slideIndex === 0}>
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {slideIndex + 1} / {slides.length}
            </span>
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => goSlide(1)} disabled={slideIndex === slides.length - 1}>
              <ChevronRight className="w-6 h-6" />
            </Button>
          </div>

          {/* Record controls */}
          <div className="flex items-center justify-center gap-3">
            {state === "idle" && (
              <Button onClick={initiateRecording} className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground h-12 px-6 text-base">
                <Circle className="w-4 h-4 fill-current" /> Start Recording
              </Button>
            )}
            {state === "recording" && (
              <>
                <Button variant="secondary" className="gap-1.5 h-12 px-4" onClick={pauseRecording}>
                  <Pause className="w-5 h-5" /> Pause
                </Button>
                <Button variant="destructive" className="gap-1.5 h-12 px-4" onClick={stopRecording}>
                  <Square className="w-5 h-5 fill-current" /> Stop
                </Button>
              </>
            )}
            {state === "paused" && (
              <>
                <Button variant="secondary" className="gap-1.5 h-12 px-4" onClick={resumeRecording}>
                  <Play className="w-5 h-5" /> Resume
                </Button>
                <Button variant="destructive" className="gap-1.5 h-12 px-4" onClick={stopRecording}>
                  <Square className="w-5 h-5 fill-current" /> Stop
                </Button>
              </>
            )}
            {state === "processing" && (
              <Button disabled className="gap-1.5 h-12 px-4">
                <Monitor className="w-5 h-5 animate-pulse" /> Processing...
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ DESKTOP LAYOUT ============
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="h-12 border-b flex items-center justify-between px-2 md:px-4 bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <Video className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Recording Studio</span>
          </div>
          {state === "recording" && (
            <Badge variant="destructive" className="animate-pulse gap-1">
              <Circle className="w-2 h-2 fill-current" /> REC
            </Badge>
          )}
          {state === "paused" && <Badge variant="secondary">Paused</Badge>}
          {state === "processing" && <Badge variant="secondary">Processing...</Badge>}
        </div>

        <div className="flex items-center gap-1 text-sm font-mono text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          {formatTime(elapsed)}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setCameraOn(p => { cameraOnRef.current = !p; return !p; }); }} title={cameraOn ? "Turn off camera" : "Turn on camera"}>
            {cameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMicOn(p => !p)} title={micOn ? "Mute" : "Unmute"}>
            {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-muted-foreground" />}
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {state === "done" && videoUrl ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full space-y-4">
              <video src={videoUrl} controls className="w-full rounded-xl shadow-2xl border" />
              <div className="flex justify-center gap-3">
                <a href={videoUrl} download className="inline-flex">
                  <Button variant="outline" className="gap-1.5">
                    <Download className="w-4 h-4" /> Download
                  </Button>
                </a>
                <Button onClick={() => { setState("idle"); setElapsed(0); setVideoUrl(null); }}>
                  Record Again
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 relative min-h-[35dvh]" id="recording-slide-area">
              {currentSlide && (
                <div className="w-full h-full">
                  <ScaledSlide>
                    <SlideRenderer blockType={currentSlide.block_type} content={currentSlide.content} theme={theme} />
                  </ScaledSlide>
                </div>
              )}
              <div className={`absolute bottom-3 right-3 w-48 h-36 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl z-10 ${cameraOn ? "" : "hidden"}`}>
                <video ref={webcamVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
              </div>
            </div>
            <div className="w-72 max-h-none border-l border-border bg-card overflow-y-auto shrink-0">
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Speaker Notes</span>
                </div>
                {speakerNotes ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{speakerNotes}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No speaker notes for this slide</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div className="h-14 border-t bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goSlide(-1)} disabled={slideIndex === 0}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold tabular-nums text-foreground min-w-[50px] text-center">
            {slideIndex + 1} / {slides.length}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goSlide(1)} disabled={slideIndex === slides.length - 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {state === "idle" && (
            <Button onClick={initiateRecording} className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm">
              <Circle className="w-3.5 h-3.5 fill-current" /> Start Recording
            </Button>
          )}
          {state === "recording" && (
            <>
              <Button variant="secondary" size="sm" onClick={pauseRecording} className="gap-1">
                <Pause className="w-3.5 h-3.5" /> Pause
              </Button>
              <Button variant="destructive" size="sm" onClick={stopRecording} className="gap-1">
                <Square className="w-3.5 h-3.5 fill-current" /> Stop
              </Button>
            </>
          )}
          {state === "paused" && (
            <>
              <Button variant="secondary" size="sm" onClick={resumeRecording} className="gap-1">
                <Play className="w-3.5 h-3.5" /> Resume
              </Button>
              <Button variant="destructive" size="sm" onClick={stopRecording} className="gap-1">
                <Square className="w-3.5 h-3.5 fill-current" /> Stop
              </Button>
            </>
          )}
          {state === "processing" && (
            <Button disabled size="sm" className="gap-1">
              <Monitor className="w-3.5 h-3.5 animate-pulse" /> Processing...
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
