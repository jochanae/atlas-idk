import { useState, useRef, useCallback, useEffect } from "react";
import { Volume2, Mic, Loader2, Upload, Trash2, Play, Pause, Square, Circle, Zap, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Slide } from "@/hooks/useSlides";
import type { Json } from "@/integrations/supabase/types";

const VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric" },
];

interface SlideAudioControlsProps {
  slide: Slide;
  onUpdate: (content: Json, notes?: string) => void;
}

export default function SlideAudioControls({ slide, onUpdate }: SlideAudioControlsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const progressRef = useRef<ReturnType<typeof setInterval>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const content = (typeof slide.content === "object" && slide.content !== null && !Array.isArray(slide.content))
    ? slide.content as Record<string, unknown>
    : {};
  const audioUrl = content.audioUrl as string | undefined;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Reset playback when slide changes
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false);
    setPlaybackProgress(0);
    setAudioDuration(0);
  }, [slide.id]);

  const uploadAudioBlob = useCallback(async (blob: Blob, suffix: string) => {
    const fileName = `${slide.id}-${suffix}-${Date.now()}.webm`;
    const filePath = `${slide.user_id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("slide-assets")
      .upload(filePath, blob, { contentType: blob.type || "audio/webm", upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("slide-assets")
      .getPublicUrl(filePath);

    return publicUrl;
  }, [slide.id, slide.user_id]);

  /* ─── In-App Recording ─── */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 100) { toast.error("Recording too short"); return; }

        try {
          const publicUrl = await uploadAudioBlob(blob, "recording");
          const updated = { ...content, audioUrl: publicUrl };
          onUpdate(updated as Json, slide.notes ?? undefined);
          toast.success("Recording saved to this slide");
        } catch (err) {
          console.error("Upload failed:", err);
          toast.error("Failed to save recording");
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      toast.error("Microphone access denied. Check browser permissions.");
    }
  }, [content, onUpdate, slide.notes, uploadAudioBlob]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined; }
  }, []);

  /* ─── AI TTS Generation ─── */
  const handleGenerateNarration = useCallback(async () => {
    const notes = slide.notes;
    if (!notes || notes.trim().length === 0) return;

    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: notes, voiceId: selectedVoice }),
        }
      );

      if (!response.ok) throw new Error("TTS failed");

      const blob = await response.blob();
      const fileName = `${slide.id}-narration-${Date.now()}.mp3`;
      const filePath = `${slide.user_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("slide-assets")
        .upload(filePath, blob, { contentType: "audio/mpeg", upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("slide-assets")
        .getPublicUrl(filePath);

      const updated = { ...content, audioUrl: publicUrl };
      onUpdate(updated as Json, slide.notes ?? undefined);
      toast.success("AI narration generated for this slide");
    } catch (err) {
      console.error("Narration generation failed:", err);
      toast.error("Narration generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [slide, content, onUpdate, selectedVoice]);

  /* ─── File Upload ─── */
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = `${slide.id}-upload-${Date.now()}.${file.name.split(".").pop()}`;
    const filePath = `${slide.user_id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("slide-assets")
      .upload(filePath, file, { contentType: file.type, upsert: true });

    if (uploadError) {
      toast.error("Upload failed");
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("slide-assets")
      .getPublicUrl(filePath);

    const updated = { ...content, audioUrl: publicUrl };
    onUpdate(updated as Json, slide.notes ?? undefined);
    toast.success("Audio uploaded to this slide");
  }, [slide, content, onUpdate]);

  /* ─── Playback ─── */
  const handleRemoveAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false);
    setPlaybackProgress(0);
    const { audioUrl: _, ...rest } = content;
    onUpdate(rest as Json, slide.notes ?? undefined);
    toast.success("Audio removed");
  }, [content, onUpdate, slide.notes]);

  const togglePlayback = useCallback(() => {
    if (!audioUrl) return;
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        if (progressRef.current) clearInterval(progressRef.current);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
        progressRef.current = setInterval(() => {
          if (audioRef.current) {
            setPlaybackProgress(audioRef.current.currentTime);
            setAudioDuration(audioRef.current.duration || 0);
          }
        }, 200);
      }
    } else {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
        if (progressRef.current) clearInterval(progressRef.current);
      };
      audio.onloadedmetadata = () => setAudioDuration(audio.duration || 0);
      audio.play();
      setIsPlaying(true);
      progressRef.current = setInterval(() => {
        if (audioRef.current) {
          setPlaybackProgress(audioRef.current.currentTime);
        }
      }, 200);
    }
  }, [audioUrl, isPlaying]);

  const formatTime = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "--:--";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Volume2 className="w-3 h-3" /> Slide Audio
      </div>

      {/* Playback section */}
      {audioUrl ? (
        <div className="space-y-2 p-2.5 rounded-lg border border-border bg-secondary/50">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 flex-1 h-8" onClick={togglePlayback}>
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={handleRemoveAudio}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-200"
                style={{ width: audioDuration > 0 ? `${(playbackProgress / audioDuration) * 100}%` : "0%" }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{formatTime(playbackProgress)}</span>
              <span>{audioDuration > 0 ? formatTime(audioDuration) : "--:--"}</span>
            </div>
          </div>
          {/* Auto-play vs On-demand toggle */}
          <div className="flex items-center gap-1 mt-1">
            <button
              onClick={() => {
                const updated = { ...content, audioAutoplay: true };
                onUpdate(updated as Json, slide.notes ?? undefined);
              }}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-l-md border transition-colors ${
                (content.audioAutoplay !== false) ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="w-2.5 h-2.5" /> Auto-play
            </button>
            <button
              onClick={() => {
                const updated = { ...content, audioAutoplay: false };
                onUpdate(updated as Json, slide.notes ?? undefined);
              }}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-r-md border border-l-0 transition-colors ${
                content.audioAutoplay === false ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Hand className="w-2.5 h-2.5" /> On demand
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {content.audioAutoplay === false ? "🔇 Click play during presentation" : "🔊 Plays automatically on slide transition"}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No audio on this slide</p>
      )}

      {/* In-app recorder */}
      <div className="space-y-2">
        {isRecording ? (
          <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2">
            <div className="flex items-center gap-2">
              <Circle className="w-3 h-3 text-destructive fill-destructive animate-pulse" />
              <span className="text-xs font-medium text-destructive">Recording — {formatTime(recordingTime)}</span>
            </div>
            <Button variant="destructive" size="sm" className="w-full gap-1.5 h-8" onClick={stopRecording}>
              <Square className="w-3 h-3" /> Stop & Save
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={startRecording}
            disabled={isGenerating}
          >
            <Mic className="w-3 h-3" /> Record Audio
          </Button>
        )}
      </div>

      {/* AI voice generation */}
      <div className="space-y-2">
        <Select value={selectedVoice} onValueChange={setSelectedVoice}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Voice" />
          </SelectTrigger>
          <SelectContent>
            {VOICES.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={handleGenerateNarration}
          disabled={isGenerating || !slide.notes?.trim()}
        >
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
          {isGenerating ? "Generating…" : "AI Voice from Notes"}
        </Button>
        {!slide.notes?.trim() && (
          <p className="text-[10px] text-muted-foreground">Add speaker notes first to generate AI narration</p>
        )}
      </div>

      {/* File upload */}
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
      <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => fileInputRef.current?.click()}>
        <Upload className="w-3 h-3" /> Upload Audio File
      </Button>

      {/* Slide duration / auto-advance */}
      <div className="pt-3 border-t border-border space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          ⏱️ Auto-Advance
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="300"
            placeholder="Off"
            value={(content.slideDuration as number) || ""}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : undefined;
              const updated = { ...content };
              if (val && val > 0) {
                updated.slideDuration = val;
              } else {
                delete updated.slideDuration;
              }
              onUpdate(updated as Json, slide.notes ?? undefined);
            }}
            className="flex w-16 rounded-md border border-input bg-secondary px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-xs text-muted-foreground">seconds (0 = manual)</span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {(content.slideDuration as number) > 0
            ? `⏩ Auto-advances after ${content.slideDuration}s during presentation`
            : "Manual advance — click or press arrow keys"}
        </p>
      </div>

      {/* Content animation */}
      <div className="pt-3 border-t border-border space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          ✨ Content Animation
        </div>
        <div className="flex gap-1">
          {([
            { id: "none", label: "None" },
            { id: "fade-in", label: "Fade In" },
            { id: "stagger", label: "Stagger" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                const updated = { ...content, contentAnimation: opt.id };
                onUpdate(updated as Json, slide.notes ?? undefined);
              }}
              className={`flex-1 text-[10px] px-2 py-1.5 rounded-md border transition-colors ${
                (content.contentAnimation || "none") === opt.id
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {(content.contentAnimation || "none") === "none" ? "All content appears at once" :
           content.contentAnimation === "fade-in" ? "🎬 Content fades in together on slide entry" :
           "🎬 Elements appear one by one with staggered timing"}
        </p>
      </div>

      {/* Per-element animation overrides */}
      <div className="pt-3 border-t border-border space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          🎭 Element Animations
        </div>
        <p className="text-[10px] text-muted-foreground mb-1">Override animation per element for cinematic effects</p>
        {([
          { key: "headingAnimation", label: "Heading" },
          { key: "bodyAnimation", label: "Body / Quote" },
          { key: "imageAnimation", label: "Image / Media" },
        ] as const).map(({ key, label }) => {
          const current = (content[key] as { type?: string } | undefined)?.type || "none";
          return (
            <div key={key} className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{label}</label>
              <div className="flex gap-0.5 flex-wrap">
                {([
                  { id: "none", label: "—" },
                  { id: "fade-in", label: "Fade" },
                  { id: "slide-up", label: "↑ Up" },
                  { id: "slide-left", label: "← Left" },
                  { id: "slide-right", label: "→ Right" },
                  { id: "scale", label: "Scale" },
                  { id: "blur-in", label: "Blur" },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      const anim = opt.id === "none" ? undefined : { type: opt.id, delay: 0.1, duration: 0.6 };
                      const updated = { ...content, [key]: anim };
                      onUpdate(updated as Json, slide.notes ?? undefined);
                    }}
                    className={`text-[9px] px-1.5 py-1 rounded border transition-colors ${
                      current === opt.id
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
