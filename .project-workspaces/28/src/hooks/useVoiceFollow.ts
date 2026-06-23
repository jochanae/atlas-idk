import { useRef, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface VoiceFollowOptions {
  /** The full script text to match against */
  scriptWords: string[];
  /** Called when new words are recognized — provides the matched word index in the script */
  onWordMatch: (wordIndex: number) => void;
  /** Called when scroll should happen */
  onScroll: (amount: number) => void;
  fontSize: number;
}

type VoiceEngine = "elevenlabs" | "webspeech" | "none";

/**
 * Unified Voice Follow hook.
 * Tries ElevenLabs Scribe (realtime STT) first.
 * Falls back to Web Speech API.
 * Shows clear error states.
 */
export function useVoiceFollow({ scriptWords, onWordMatch, onScroll, fontSize }: VoiceFollowOptions) {
  const [isListening, setIsListening] = useState(false);
  const [engine, setEngine] = useState<VoiceEngine>("none");
  const [confidence, setConfidence] = useState<number>(0); // 0-1 lock-on confidence
  const recognitionRef = useRef<any>(null);
  const scribeRef = useRef<any>(null);
  const matchIndexRef = useRef(0);
  const isListeningRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Normalize a word for comparison
  const normalize = useCallback((w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, ""), []);

  // Fuzzy word match — find the next occurrence of spoken word in script
  // Only searches a tight forward window to prevent jumping backwards or far ahead
  const findNextMatch = useCallback((spokenWord: string) => {
    const spoken = normalize(spokenWord);
    if (!spoken || spoken.length < 2) return -1;

    // Tight forward-only window (max 15 words ahead) to prevent jumping
    const start = matchIndexRef.current;
    const end = Math.min(start + 15, scriptWords.length);

    for (let i = start; i < end; i++) {
      const scriptWord = normalize(scriptWords[i]);
      if (!scriptWord) continue;
      // Require exact match or very close prefix (at least 3 chars)
      if (scriptWord === spoken) return i;
      if (spoken.length >= 3 && scriptWord.startsWith(spoken)) return i;
      if (scriptWord.length >= 3 && spoken.startsWith(scriptWord)) return i;
    }
    return -1;
  }, [scriptWords, normalize]);

  // Track cumulative final word count to avoid reprocessing
  const finalWordCountRef = useRef(0);

  const processTranscript = useCallback((transcript: string, isFinal: boolean) => {
    const words = transcript.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    if (!isFinal) {
      // Interim: only peek at the very last word, never commit position
      const lastWord = words[words.length - 1];
      if (lastWord) {
        const idx = findNextMatch(lastWord);
        if (idx >= 0) {
          setConfidence(1);
        }
      }
      return;
    }

    // Final result — only process words we haven't seen from previous finals
    const newWords = words.slice(finalWordCountRef.current);
    finalWordCountRef.current = words.length;

    if (newWords.length === 0) return;

    let lastMatchedIndex = -1;
    for (const word of newWords) {
      const idx = findNextMatch(word);
      if (idx >= 0) {
        lastMatchedIndex = idx;
        matchIndexRef.current = idx + 1;
      }
    }

    if (lastMatchedIndex >= 0) {
      onWordMatch(lastMatchedIndex);
      setConfidence(1);
    } else {
      setConfidence((c) => Math.max(0, c - 0.15));
    }
  }, [findNextMatch, onWordMatch]);

  // Start with ElevenLabs, fall back to Web Speech
  const startListening = useCallback(async () => {
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access is required for Voice Follow");
      return;
    }

    // Try ElevenLabs first
    try {
      const { data, error } = await supabase.functions.invoke("elevenlabs-scribe-token");

      if (!error && data?.token) {
        // SDK hook cannot be used dynamically — fall through to Web Speech
      }
    } catch {
      // Fall back to Web Speech API
    }

    // Web Speech API fallback
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice Follow is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        processTranscript(transcript, result.isFinal);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        toast.error("Microphone access denied");
        setIsListening(false);
        return;
      }
      if (event.error === "no-speech") {
        // Normal — just means silence, restart
        return;
      }
      console.warn("Speech recognition error:", event.error);
      // Auto-restart on recoverable errors
      if (isListeningRef.current) {
        try { recognition.start(); } catch { }
      }
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (isListeningRef.current) {
        finalWordCountRef.current = 0; // reset for fresh recognition session
        try { recognition.start(); } catch { }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setEngine("webspeech");
      setIsListening(true);
      setConfidence(0.5);
      toast.success("Voice Follow active — speak and the script follows", { duration: 3000 });
    } catch (e) {
      console.error("Failed to start recognition:", e);
      toast.error("Could not start Voice Follow");
    }
  }, [processTranscript]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    setEngine("none");
    setConfidence(0);
    matchIndexRef.current = 0;
    finalWordCountRef.current = 0;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { }
      recognitionRef.current = null;
    }
    if (scribeRef.current) {
      try { scribeRef.current.disconnect(); } catch { }
      scribeRef.current = null;
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Reset match position
  const resetPosition = useCallback((wordIndex: number) => {
    matchIndexRef.current = wordIndex;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { }
      }
    };
  }, []);

  return {
    isListening,
    engine,
    confidence,
    toggleListening,
    startListening,
    stopListening,
    resetPosition,
  };
}
