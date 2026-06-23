import { useCallback, useEffect, useRef, useState } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScribeProviderProps {
  /** Called with partial (interim) transcription text */
  onPartialTranscript: (text: string) => void;
  /** Called with committed (final) transcription text */
  onCommittedTranscript: (text: string) => void;
  /** Called with word-level timestamps on commit */
  onCommittedWithTimestamps?: (data: { text: string; words: Array<{ text: string; start: number; end: number }> }) => void;
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Render prop — receives controls */
  children: (controls: {
    isConnected: boolean;
    isConnecting: boolean;
    connect: () => Promise<void>;
    disconnect: () => void;
    partialTranscript: string;
  }) => React.ReactNode;
}

/**
 * ElevenLabs Scribe V2 Realtime wrapper component.
 * 
 * Since `useScribe` is a React hook, it can't be called dynamically.
 * This component wraps it and exposes controls via render props.
 * 
 * Usage:
 * ```tsx
 * <ElevenLabsScribeProvider
 *   onPartialTranscript={(text) => console.log("partial:", text)}
 *   onCommittedTranscript={(text) => console.log("final:", text)}
 * >
 *   {({ isConnected, connect, disconnect, partialTranscript }) => (
 *     <button onClick={isConnected ? disconnect : connect}>
 *       {isConnected ? "Stop" : "Start"}
 *     </button>
 *   )}
 * </ElevenLabsScribeProvider>
 * ```
 */
export default function ElevenLabsScribeProvider({
  onPartialTranscript,
  onCommittedTranscript,
  onCommittedWithTimestamps,
  autoConnect = false,
  children,
}: ScribeProviderProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  // Keep callbacks in refs to avoid re-creating scribe
  const onPartialRef = useRef(onPartialTranscript);
  const onCommittedRef = useRef(onCommittedTranscript);
  const onTimestampsRef = useRef(onCommittedWithTimestamps);

  useEffect(() => {
    onPartialRef.current = onPartialTranscript;
    onCommittedRef.current = onCommittedTranscript;
    onTimestampsRef.current = onCommittedWithTimestamps;
  }, [onPartialTranscript, onCommittedTranscript, onCommittedWithTimestamps]);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: "vad" as CommitStrategy,
    onPartialTranscript: (data) => {
      onPartialRef.current(data.text);
    },
    onCommittedTranscript: (data) => {
      onCommittedRef.current(data.text);
    },
    onCommittedTranscriptWithTimestamps: (data) => {
      onTimestampsRef.current?.(data as any);
    },
  });

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get single-use token from edge function
      const { data, error } = await supabase.functions.invoke("elevenlabs-scribe-token");

      if (error || !data?.token) {
        toast.error("Could not get ElevenLabs token. Voice follow will use browser fallback.");
        setIsConnecting(false);
        return;
      }

      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      toast.success("ElevenLabs Voice Follow active — premium accuracy", { duration: 3000 });
    } catch (err) {
      console.error("ElevenLabs Scribe connect error:", err);
      toast.error("Could not start ElevenLabs transcription");
    } finally {
      setIsConnecting(false);
    }
  }, [scribe]);

  const disconnect = useCallback(() => {
    scribe.disconnect();
  }, [scribe]);

  // Auto-connect
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
  }, [autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {children({
        isConnected: scribe.isConnected,
        isConnecting,
        connect,
        disconnect,
        partialTranscript: scribe.partialTranscript || "",
      })}
    </>
  );
}
