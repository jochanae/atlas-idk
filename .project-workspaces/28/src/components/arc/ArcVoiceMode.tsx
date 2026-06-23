import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useArc } from "./ArcProvider";
import { toast } from "sonner";

export default function ArcVoiceMode() {
  const { sendMessage, messages, isLoading } = useArc();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const recognitionRef = useRef<any>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevMessageCountRef = useRef(messages.length);

  // Watch for new assistant messages and speak them
  useEffect(() => {
    if (!ttsEnabled) return;
    if (isLoading) return; // wait for streaming to finish
    if (messages.length <= prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      return;
    }
    prevMessageCountRef.current = messages.length;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant" && lastMsg.content) {
      // Trim to first ~300 chars for TTS (avoid huge audio)
      const textForTts = lastMsg.content.slice(0, 500).replace(/```[\s\S]*?```/g, "").replace(/[#*_~`]/g, "");
      if (textForTts.trim()) speakText(textForTts);
    }
  }, [messages, isLoading, ttsEnabled]);

  const speakText = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            text,
            voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah - warm & professional
          }),
        }
      );

      if (!response.ok) {
        // Fallback to browser TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.onend = () => setIsSpeaking(false);
        speechSynthesis.speak(utterance);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported. Try Chrome.");
      return;
    }

    stopSpeaking();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript || interimTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);
      clearInterval(levelIntervalRef.current);
      setVoiceLevel(0);
      // Send the final transcript
      if (transcript.trim()) {
        sendMessage(transcript.trim());
        setTranscript("");
      }
    };

    recognition.onerror = (e: any) => {
      setIsListening(false);
      clearInterval(levelIntervalRef.current);
      setVoiceLevel(0);
      if (e.error === "not-allowed") {
        toast.error("Microphone access denied");
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);

      // Simulate voice level for visual feedback
      levelIntervalRef.current = setInterval(() => {
        setVoiceLevel(0.2 + Math.random() * 0.8);
      }, 100);
    } catch {
      toast.error("Could not start voice recognition");
    }
  }, [sendMessage, transcript, stopSpeaking]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  // Pulsing rings animation
  const rings = [0, 1, 2];

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Status text */}
      <AnimatePresence mode="wait">
        <motion.p
          key={isListening ? "listening" : isSpeaking ? "speaking" : "idle"}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="text-xs text-muted-foreground font-medium"
        >
          {isListening ? "Listening..." : isSpeaking ? "Arc is speaking..." : isLoading ? "Arc is thinking..." : "Tap to speak"}
        </motion.p>
      </AnimatePresence>

      {/* Voice orb */}
      <div className="relative">
        {/* Pulsing rings */}
        {(isListening || isSpeaking) && rings.map((i) => (
          <motion.div
            key={i}
            className={`absolute inset-0 rounded-full ${isListening ? "border-2 border-primary/30" : "border-2 border-emerald-400/30"}`}
            animate={{
              scale: [1, 1.5 + i * 0.3],
              opacity: [0.6, 0],
            }}
            transition={{
              duration: 1.5,
              delay: i * 0.3,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        ))}

        {/* Main button */}
        <motion.button
          onClick={isListening ? stopListening : startListening}
          disabled={isLoading}
          animate={{
            scale: isListening ? [1, 1.05 + voiceLevel * 0.1, 1] : 1,
          }}
          transition={{ duration: 0.15 }}
          className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-lg ${
            isListening
              ? "bg-primary text-primary-foreground animate-pulse-glow"
              : isSpeaking
                ? "bg-emerald-500 text-white"
                : isLoading
                  ? "bg-secondary text-muted-foreground"
                  : "bg-card border-2 border-border text-foreground hover:border-primary/50"
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : isListening ? (
            <MicOff className="w-6 h-6" />
          ) : isSpeaking ? (
            <Volume2 className="w-6 h-6" />
          ) : (
            <Mic className="w-6 h-6" />
          )}
        </motion.button>
      </div>

      {/* Live transcript */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-secondary/50 rounded-xl px-4 py-2 max-w-[280px] text-center"
          >
            <p className="text-sm text-foreground">{transcript}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TTS toggle */}
      <button
        onClick={() => {
          setTtsEnabled(!ttsEnabled);
          if (ttsEnabled) stopSpeaking();
        }}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {ttsEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
        Voice {ttsEnabled ? "on" : "off"}
      </button>
    </div>
  );
}
