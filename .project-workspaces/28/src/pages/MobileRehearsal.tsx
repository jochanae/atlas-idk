import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Pause, Play, RotateCcw, X, Clock, AlertTriangle, CheckCircle, Save, Trophy, Radio, Video, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRehearsalMediaRecorder, type CaptureMode } from "@/hooks/useRehearsalMediaRecorder";
import { parseCues } from "@/lib/teleprompterCues";
import TeleprompterCueBadge from "@/components/editor/TeleprompterCueBadge";

const FILLER_WORDS = ["um", "uh", "like", "you know", "basically", "actually", "literally", "right", "so", "well", "I mean"];

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

// --- Sub-components ---

function ScriptWithCues({ text }: { text: string }) {
  const segments = parseCues(text);
  return (
    <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.content}</span>
        ) : seg.cueConfig ? (
          <TeleprompterCueBadge key={i} config={seg.cueConfig} />
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </p>
  );
}

function FillerWordsSummary({ fillerList }: { fillerList: string[] }) {
  if (fillerList.length === 0) return null;
  const grouped = fillerList.reduce((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc; }, {} as Record<string, number>);
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
      <p className="text-xs font-medium text-destructive mb-1">Filler Words Detected</p>
      <p className="text-xs text-destructive/80">
        {Object.entries(grouped).sort((a, b) => b[1] - a[1]).map(([w, c]) => `"${w}" (${c}×)`).join(", ")}
      </p>
    </div>
  );
}

// --- Main component ---

export default function MobileRehearsal() {
  const navigate = useNavigate();
  const { isCapturing, captureMode, startCapture, stopCapture } = useRehearsalMediaRecorder();
  const [scriptText, setScriptText] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const [fillerList, setFillerList] = useState<string[]>([]);
  const [wpm, setWpm] = useState(0);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  // New: coaching enhancements
  const [coachingLevel, setCoachingLevel] = useState<"basic" | "detailed">("basic");
  const [recordMode, setRecordMode] = useState<CaptureMode>("audio");
  const [isMarkingUp, setIsMarkingUp] = useState(false);
  const [markedUpScript, setMarkedUpScript] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const startTimeRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Timer
  useEffect(() => {
    if (!isActive || isPaused) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [isActive, isPaused]);

  // Analyze transcript in real-time
  useEffect(() => {
    const text = liveTranscript;
    const words = text.split(/\s+/).filter(Boolean);
    setWordCount(words.length);

    const elapsedSecs = (Date.now() - startTimeRef.current) / 1000;
    setWpm(elapsedSecs > 5 ? Math.round((words.length / elapsedSecs) * 60) : 0);

    const lower = text.toLowerCase();
    let count = 0;
    const found: string[] = [];
    for (const filler of FILLER_WORDS) {
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      const matches = lower.match(regex);
      if (matches) {
        count += matches.length;
        for (let i = 0; i < matches.length; i++) found.push(filler);
      }
    }
    setFillerCount(count);
    setFillerList(found);
  }, [liveTranscript]);

  // AI Script Markup
  const handleMarkupScript = async () => {
    if (!scriptText.trim()) { toast.error("Paste a script first"); return; }
    setIsMarkingUp(true);
    try {
      const session = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-script`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ script: scriptText, coachingLevel }),
      });
      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("Credits exhausted"); return; }
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setMarkedUpScript(data.annotatedScript || scriptText);
      setScriptText(data.annotatedScript || scriptText);
      toast.success("Script annotated with delivery cues!");
    } catch {
      toast.error("Failed to markup script");
    } finally {
      setIsMarkingUp(false);
    }
  };

  const startRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported. Try Chrome on Android.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript + " ";
        else interim += event.results[i][0].transcript;
      }
      transcriptRef.current = final;
      setLiveTranscript(final + interim);
    };
    recognition.onerror = (e: any) => {
      if (e.error === "not-allowed") toast.error("Microphone access denied.");
    };
    recognition.onend = () => {
      if (isRecording) try { recognition.start(); } catch {}
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      startTimeRef.current = Date.now();
      toast.success("Recording — speak naturally!");
    } catch { toast.error("Could not start speech recognition"); }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
  }, []);

  const encouragements = [
    "You've got this! 💪",
    "Time to shine! ✨",
    "Own that stage! 🎤",
    "Your audience is lucky! 🌟",
    "Breathe deep, speak bold! 🔥",
  ];
  const encouragementRef = useRef(encouragements[Math.floor(Math.random() * encouragements.length)]);

  const handleStart = () => {
    encouragementRef.current = encouragements[Math.floor(Math.random() * encouragements.length)];
    setCountdown(3);
  };

  // Countdown effect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setIsActive(true);
      setElapsed(0);
      setLiveTranscript("");
      setWordCount(0);
      setFillerCount(0);
      setFillerList([]);
      setAudioUrl(null);
      setSessionSaved(false);
      startRecording();
      startCapture(recordMode);
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown, startRecording, startCapture, recordMode]);

  const handleReset = async () => {
    stopRecording();
    await stopCapture();
    setIsActive(false);
    setIsPaused(false);
    setElapsed(0);
    setLiveTranscript("");
    setWordCount(0);
    setFillerCount(0);
    setFillerList([]);
    setAudioUrl(null);
  };

  // Keep screen awake
  useEffect(() => {
    if (!isActive) return;
    let wakeLock: any = null;
    (navigator as any).wakeLock?.request?.("screen").then((wl: any) => { wakeLock = wl; }).catch(() => {});
    return () => { wakeLock?.release?.(); };
  }, [isActive]);

  // Confidence score
  const confidenceScore = (() => {
    if (elapsed < 5) return 0;
    let score = 100;
    score -= fillerCount * 3;
    if (wpm > 180) score -= (wpm - 180) * 0.5;
    else if (wpm < 100 && wpm > 0) score -= (100 - wpm) * 0.5;
    if (wordCount < 10) score -= 20;
    return Math.max(0, Math.min(100, Math.round(score)));
  })();

  const confidenceLabel = confidenceScore >= 85 ? "Excellent" : confidenceScore >= 70 ? "Good" : confidenceScore >= 50 ? "Needs Work" : confidenceScore > 0 ? "Keep Practicing" : "—";
  const confidenceColor = confidenceScore >= 85 ? "text-green-400" : confidenceScore >= 70 ? "text-primary" : confidenceScore >= 50 ? "text-amber-400" : "text-destructive";

  const saveSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Sign in to save sessions"); return; }
      const { error } = await supabase.from("rehearsal_recordings").insert({
        user_id: user.id,
        title: `Rehearsal ${new Date().toLocaleDateString()}`,
        duration_seconds: elapsed,
        wpm_average: wpm,
        filler_word_count: fillerCount,
        audio_url: audioUrl,
        notes: `Confidence: ${confidenceScore}/100. Mode: ${recordMode}. Coaching: ${coachingLevel}. Fillers: ${fillerList.join(", ") || "None"}. Transcript: ${liveTranscript.slice(0, 500)}`,
      });
      if (error) throw error;
      setSessionSaved(true);
      toast.success("Session saved to Coaching Hub!");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  };

  const handleFinish = async () => {
    stopRecording();
    const url = await stopCapture();
    setAudioUrl(url);
    setShowSummary(true);
  };

  const paceLabel = wpm > 170 ? "Too fast" : wpm > 140 ? "Slightly fast" : wpm >= 110 ? "Great pace" : wpm >= 80 ? "Slightly slow" : wpm > 0 ? "Too slow" : "Speak to begin";
  const paceColor = wpm > 170 ? "text-destructive" : wpm > 140 ? "text-amber-400" : wpm >= 110 ? "text-green-400" : wpm >= 80 ? "text-amber-400" : wpm > 0 ? "text-blue-400" : "text-muted-foreground";

  // --- Countdown overlay ---
  if (countdown !== null) {
    return (
      <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center gap-6">
        <motion.p
          key="encourage"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-medium text-muted-foreground"
        >
          {encouragementRef.current}
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
          Get ready… {recordMode === "video" ? "Camera & mic" : "Mic"} will activate
        </p>
      </div>
    );
  }

  // --- Pre-session setup screen ---
  if (!isActive) {
    const estWords = scriptText.split(/\s+/).filter(Boolean).length;
    const hasCues = /\[(pause|breathe|slow down|emphasize|look up|step forward|lean in|gesture|eye contact)/i.test(scriptText);
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-5">
          <div>
            <h1 className="font-display text-2xl font-bold">Mobile Rehearsal</h1>
            <p className="text-sm text-muted-foreground mt-1">Practice your speech on the go with real-time coaching.</p>
          </div>

          {/* Coaching Level Toggle */}
          <div className="bg-secondary rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Coaching Detail</p>
                <p className="text-xs text-muted-foreground">
                  {coachingLevel === "detailed" ? "Full gesture, movement & vocal coaching" : "Basic pacing & filler word coaching"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{coachingLevel === "detailed" ? "Detailed" : "Basic"}</span>
                <Switch
                  checked={coachingLevel === "detailed"}
                  onCheckedChange={(v) => setCoachingLevel(v ? "detailed" : "basic")}
                />
              </div>
            </div>

            {/* Record Mode Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Record Mode</p>
                <p className="text-xs text-muted-foreground">
                  {recordMode === "video" ? "Front camera + audio for body language review" : "Audio only"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{recordMode === "video" ? "Video" : "Audio"}</span>
                <Switch
                  checked={recordMode === "video"}
                  onCheckedChange={(v) => setRecordMode(v ? "video" : "audio")}
                />
              </div>
            </div>
          </div>

          <Textarea
            value={scriptText}
            onChange={e => setScriptText(e.target.value)}
            placeholder="Paste your script or key talking points here (optional)..."
            className="min-h-[160px] text-sm bg-secondary border-border"
          />

          {/* Script preview with cues */}
          {hasCues && (
            <div className="bg-secondary/50 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview with Delivery Cues</p>
              <ScriptWithCues text={scriptText} />
            </div>
          )}

          {estWords > 0 && (
            <p className="text-xs text-muted-foreground">{estWords} words · ~{Math.ceil(estWords / 140)} min at natural pace</p>
          )}

          {/* AI Markup Button */}
          {scriptText.trim().length > 20 && (
            <Button
              variant="outline"
              onClick={handleMarkupScript}
              disabled={isMarkingUp}
              className="w-full gap-2 text-sm"
            >
              {isMarkingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isMarkingUp ? "Analyzing script..." : `Add ${coachingLevel === "detailed" ? "Detailed" : "Basic"} Delivery Cues`}
            </Button>
          )}

          <Button onClick={handleStart} className="w-full bg-gradient-gold text-primary-foreground font-semibold gap-2 h-14 text-base rounded-xl">
            {recordMode === "video" ? <Video className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            Start Rehearsal {recordMode === "video" ? "(Video)" : ""}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">Uses your device's microphone{recordMode === "video" ? " and camera" : ""} for speech analysis. Works best in Chrome.</p>
        </div>
      </DashboardLayout>
    );
  }

  // --- Active rehearsal screen ---
  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Timer header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1 text-sm">
            <X className="w-4 h-4" /> Exit
          </Button>
          <div className="font-mono text-2xl font-bold tabular-nums">{formatTime(elapsed)}</div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsPaused(p => !p)}>
              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleReset}>
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Live stats row */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-secondary rounded-xl p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{wordCount}</p>
            <p className="text-[10px] text-muted-foreground">Words</p>
          </div>
          <div className="bg-secondary rounded-xl p-3 text-center">
            <p className={`text-lg font-bold tabular-nums ${paceColor}`}>{wpm || "—"}</p>
            <p className="text-[10px] text-muted-foreground">WPM</p>
          </div>
          <div className="bg-secondary rounded-xl p-3 text-center">
            <p className={`text-lg font-bold tabular-nums ${fillerCount > 5 ? "text-destructive" : fillerCount > 2 ? "text-amber-400" : "text-green-400"}`}>{fillerCount}</p>
            <p className="text-[10px] text-muted-foreground">Fillers</p>
          </div>
          <div className="bg-secondary rounded-xl p-3 text-center">
            <p className={`text-lg font-bold tabular-nums ${confidenceColor}`}>{confidenceScore || "—"}</p>
            <p className="text-[10px] text-muted-foreground">Score</p>
          </div>
        </div>
      </div>

      {/* Pace indicator */}
      <AnimatePresence>
        <motion.div
          key={paceLabel}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`shrink-0 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium ${paceColor}`}
        >
          {wpm > 170 ? <AlertTriangle className="w-4 h-4" /> : wpm >= 110 ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          {paceLabel}
        </motion.div>
      </AnimatePresence>

      {/* Script / transcript area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {scriptText && (
          <div className="bg-secondary/50 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Your Script {markedUpScript ? "(with delivery cues)" : ""}</p>
            <ScriptWithCues text={scriptText} />
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Live Transcript</p>
          <div className="bg-card border border-border rounded-xl p-4 min-h-[120px]">
            {liveTranscript ? (
              <p className="text-sm text-foreground leading-relaxed">{liveTranscript}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Start speaking to see your words appear here...</p>
            )}
          </div>
        </div>

        <FillerWordsSummary fillerList={fillerList} />
      </div>

      {/* Recording indicator */}
      <div className="shrink-0 px-4 py-3 border-t border-border bg-card flex items-center justify-center gap-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {isRecording ? (
          <>
            <span className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium">{captureMode === "video" ? "Recording Video" : "Recording"}</span>
            {isCapturing && <Radio className="w-3.5 h-3.5 text-destructive animate-pulse" />}
            <Button variant="outline" size="sm" onClick={stopRecording} className="ml-2 gap-1">
              <MicOff className="w-4 h-4" /> Pause
            </Button>
            <Button size="sm" onClick={handleFinish} className="ml-1 gap-1 bg-gradient-gold text-primary-foreground">
              <Trophy className="w-4 h-4" /> Finish
            </Button>
          </>
        ) : (
          <div className="flex gap-2">
            <Button onClick={startRecording} className="gap-2 bg-gradient-gold text-primary-foreground">
              <Mic className="w-4 h-4" /> Resume Recording
            </Button>
            {elapsed > 10 && (
              <Button variant="outline" onClick={handleFinish} className="gap-1">
                <Trophy className="w-4 h-4" /> Finish
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Session Summary Overlay */}
      <AnimatePresence>
        {showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-background flex flex-col p-6 overflow-y-auto"
          >
            <div className="max-w-md mx-auto w-full space-y-6">
              <div className="text-center space-y-2">
                <div className={`text-5xl font-display font-bold ${confidenceColor}`}>{confidenceScore}</div>
                <p className={`text-lg font-semibold ${confidenceColor}`}>{confidenceLabel}</p>
                <p className="text-sm text-muted-foreground">Confidence Score</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{formatTime(elapsed)}</p>
                  <p className="text-xs text-muted-foreground">Duration</p>
                </div>
                <div className="bg-secondary rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{wordCount}</p>
                  <p className="text-xs text-muted-foreground">Words Spoken</p>
                </div>
                <div className="bg-secondary rounded-xl p-4 text-center">
                  <p className={`text-2xl font-bold ${paceColor}`}>{wpm}</p>
                  <p className="text-xs text-muted-foreground">Words/Min</p>
                </div>
                <div className="bg-secondary rounded-xl p-4 text-center">
                  <p className={`text-2xl font-bold ${fillerCount > 5 ? "text-destructive" : fillerCount > 2 ? "text-amber-400" : "text-green-400"}`}>{fillerCount}</p>
                  <p className="text-xs text-muted-foreground">Filler Words</p>
                </div>
              </div>

              <FillerWordsSummary fillerList={fillerList} />

              {/* Playback: video or audio */}
              {audioUrl && (
                <div className="bg-secondary rounded-xl p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {captureMode === "video" ? "🎬 Session Video" : "🎙️ Session Recording"}
                  </p>
                  {captureMode === "video" ? (
                    <video ref={videoRef} controls src={audioUrl} className="w-full rounded-lg" />
                  ) : (
                    <audio controls src={audioUrl} className="w-full h-10" />
                  )}
                </div>
              )}

              <div className="space-y-2 pt-2">
                {wpm > 170 && <p className="text-sm text-amber-400">💡 Try slowing down — pause after key points for impact.</p>}
                {wpm < 100 && wpm > 0 && <p className="text-sm text-blue-400">💡 Pick up the pace slightly to keep energy up.</p>}
                {fillerCount > 5 && <p className="text-sm text-destructive">💡 Replace filler words with short pauses — silence is powerful.</p>}
                {confidenceScore >= 85 && <p className="text-sm text-green-400">🎯 Great job! Your delivery is polished and confident.</p>}
                {captureMode === "video" && <p className="text-sm text-primary">🎬 Watch your video to review body language, gestures, and eye contact.</p>}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={saveSession}
                  disabled={sessionSaved}
                  className="flex-1 gap-2 bg-gradient-gold text-primary-foreground"
                >
                  <Save className="w-4 h-4" /> {sessionSaved ? "Saved ✓" : "Save to Coaching Hub"}
                </Button>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setShowSummary(false); handleReset(); }}>
                  New Session
                </Button>
                <Button variant="ghost" className="flex-1" onClick={() => navigate("/coaching")}>
                  View All Sessions
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
