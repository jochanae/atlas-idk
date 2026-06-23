import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CaptureMode = "audio" | "video";

function getSupportedMimeType(isVideo: boolean): string {
  const candidates = isVideo
    ? [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ]
    : [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "",
      ];

  for (const mime of candidates) {
    if (!mime || (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime))) {
      return mime;
    }
  }
  return "";
}

interface UseRehearsalMediaRecorderReturn {
  isCapturing: boolean;
  captureMode: CaptureMode;
  startCapture: (mode?: CaptureMode) => Promise<void>;
  stopCapture: () => Promise<string | null>;
  getStream: () => MediaStream | null;
}

export function useRehearsalMediaRecorder(): UseRehearsalMediaRecorderReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("audio");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startCapture = useCallback(async (mode: CaptureMode = "audio") => {
    try {
      setCaptureMode(mode);

      if (typeof MediaRecorder === "undefined") {
        toast.error("Recording not supported on this browser");
        return;
      }

      const constraints = mode === "video"
        ? { audio: true, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } }
        : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const isVideo = mode === "video";
      const mimeType = getSupportedMimeType(isVideo);

      const recorderOptions: MediaRecorderOptions = {};
      if (mimeType) recorderOptions.mimeType = mimeType;

      const recorder = new MediaRecorder(stream, recorderOptions);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = (e: any) => {
        console.error("MediaRecorder error:", e);
        toast.error("Recording error occurred");
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsCapturing(true);
      console.log("[Capture] Started", mode, "with mimeType:", recorder.mimeType);
    } catch (err: any) {
      console.error("MediaRecorder start error:", err);
      if (err.name === "NotAllowedError") {
        toast.error("Camera/microphone access denied. Enable it in browser settings.");
      } else if (err.name === "NotFoundError") {
        toast.error("No microphone found on this device.");
      } else {
        toast.error("Could not start capture: " + (err.message || "Unknown error"));
      }
    }
  }, []);

  const stopCapture = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        console.log("[Capture] No active recorder to stop");
        setIsCapturing(false);
        resolve(null);
        return;
      }

      recorder.onstop = async () => {
        // Only stop audio tracks — leave video tracks alive for preview
        streamRef.current?.getAudioTracks().forEach((t) => t.stop());
        // Stop video tracks too since we're done capturing
        streamRef.current?.getVideoTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setIsCapturing(false);

        console.log("[Capture] Stopped. Chunks:", chunksRef.current.length, "Total size:", chunksRef.current.reduce((s, c) => s + c.size, 0));

        if (chunksRef.current.length === 0) {
          console.warn("[Capture] No data chunks recorded");
          toast.error("No audio data was captured");
          resolve(null);
          return;
        }

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        console.log("[Capture] Blob created:", blob.size, "bytes, type:", blob.type);

        if (blob.size < 1000) {
          console.warn("[Capture] Blob too small, likely empty recording");
          toast.error("Recording was too short or empty");
          resolve(null);
          return;
        }

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Not authenticated");

          const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
          const fileName = `${user.id}/${Date.now()}.${ext}`;

          console.log("[Capture] Uploading to:", fileName);
          const { error: uploadError } = await supabase.storage
            .from("presentation-recordings")
            .upload(fileName, blob, { contentType: blob.type || "audio/webm", upsert: false });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from("presentation-recordings")
            .getPublicUrl(fileName);

          console.log("[Capture] Upload success:", urlData.publicUrl);
          toast.success("Recording uploaded successfully");
          resolve(urlData.publicUrl);
        } catch (err: any) {
          console.error("[Capture] Upload error:", err);
          toast.error("Failed to save recording: " + (err.message || "Unknown error"));

          // Offer local download as fallback
          try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `rehearsal-${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
            a.click();
            URL.revokeObjectURL(url);
            toast.info("Recording downloaded to your device instead");
          } catch { /* ignore download fallback error */ }

          resolve(null);
        }
      };

      recorder.stop();
    });
  }, []);

  const getStream = useCallback(() => streamRef.current, []);

  return { isCapturing, captureMode, startCapture, stopCapture, getStream };
}
