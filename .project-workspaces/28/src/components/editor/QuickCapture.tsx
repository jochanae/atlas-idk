import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Mic, Loader2, X, Plus, MicOff, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface QuickCaptureProps {
  onAddSlide: (blockType: string, content: Record<string, unknown>) => void;
}

export default function QuickCapture({ onAddSlide }: QuickCaptureProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [transcribedText, setTranscribedText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read as data URL for preview
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        // Use Web Speech API for transcription
        transcribeFromRecording();
      };

      mediaRecorder.start();
      setRecording(true);

      // Also start speech recognition
      startSpeechRecognition();
    } catch (err) {
      toast.error("Microphone access denied");
      console.error(err);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.info("Speech recognition not supported — type your idea instead");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscribedText((finalTranscript + interim).trim());
    };

    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e.error);
    };

    recognition.start();

    // Store reference to stop later
    (window as any).__quickCaptureRecognition = recognition;
  };

  const transcribeFromRecording = () => {
    // Stop speech recognition
    const recognition = (window as any).__quickCaptureRecognition;
    if (recognition) {
      recognition.stop();
      delete (window as any).__quickCaptureRecognition;
    }
  };

  const handleConvertToSlide = async () => {
    const hasContent = capturedImage || transcribedText.trim();
    if (!hasContent) {
      toast.error("Capture a photo or record a voice note first");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quick-capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          text: transcribedText || undefined,
          hasImage: !!capturedImage,
          imageDescription: capturedImage ? "User captured photo from camera" : undefined,
        }),
      });

      if (resp.status === 429) { toast.error("Rate limited — try again later"); return; }
      if (resp.status === 402) { toast.error("Credits exhausted"); return; }
      if (!resp.ok) throw new Error("Conversion failed");

      const { slide } = await resp.json();

      // If we have a captured image, upload it to storage
      let imageUrl: string | undefined;
      if (capturedImage) {
        const blob = await (await fetch(capturedImage)).blob();
        const fileName = `quick-capture/${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("slide-assets").upload(fileName, blob, { contentType: "image/jpeg", upsert: true });
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from("slide-assets").getPublicUrl(fileName);
          imageUrl = publicUrl;
        }
      }

      const content = { ...slide.content, ...(imageUrl ? { imageUrl } : {}) };
      onAddSlide(slide.block_type, content);

      // Reset
      setCapturedImage(null);
      setTranscribedText("");
      setOpen(false);
      toast.success("Slide created from capture!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create slide");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCapturedImage(null);
    setTranscribedText("");
    if (recording) stopVoiceRecording();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-xs border-dashed"
        onClick={() => setOpen(true)}
      >
        <Camera className="w-3.5 h-3.5" />
        Quick Capture
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-2 rounded-xl border border-border bg-card p-3 space-y-3 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Quick Capture</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setOpen(false); handleReset(); }}>
                <X className="w-3 h-3" />
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Snap a photo or record a voice note — AI converts it into a slide.
            </p>

            {/* Photo capture */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoCapture}
            />

            {capturedImage ? (
              <div className="relative">
                <img src={capturedImage} alt="Captured" className="w-full rounded-lg border border-border aspect-video object-cover" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-5 w-5 bg-background/80"
                  onClick={() => setCapturedImage(null)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-3 h-3" />
                Take Photo
              </Button>
            )}

            {/* Voice recording */}
            <Button
              variant={recording ? "destructive" : "outline"}
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={recording ? stopVoiceRecording : startVoiceRecording}
            >
              {recording ? (
                <>
                  <MicOff className="w-3 h-3" />
                  Stop Recording
                  <span className="ml-auto w-2 h-2 rounded-full bg-destructive animate-pulse" />
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3" />
                  Record Voice Note
                </>
              )}
            </Button>

            {transcribedText && (
              <div className="bg-secondary rounded-md p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Transcribed:</p>
                <p className="text-xs text-foreground leading-relaxed">{transcribedText}</p>
              </div>
            )}

            {/* Convert button */}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1 h-7 text-xs"
                onClick={handleConvertToSlide}
                disabled={loading || (!capturedImage && !transcribedText.trim())}
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Create Slide
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
