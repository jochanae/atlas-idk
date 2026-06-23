import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Mic, MicOff, Gauge, AlertTriangle, Clock, Activity } from "lucide-react";

interface LiveDeliveryFeedbackProps {
  onComplete?: (stats: DeliveryStats) => void;
}

export interface DeliveryStats {
  duration: number;
  wordCount: number;
  wpm: number;
  fillerCount: number;
  fillerWords: string[];
  pacingAlerts: string[];
}

const FILLER_WORDS = ["um", "uh", "like", "you know", "basically", "actually", "literally", "so", "right", "okay"];

export default function LiveDeliveryFeedback({ onComplete }: LiveDeliveryFeedbackProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [pacingStatus, setPacingStatus] = useState<"good" | "fast" | "slow">("good");
  const [alerts, setAlerts] = useState<string[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  const wpm = elapsed > 0 ? Math.round((wordCount / elapsed) * 60) : 0;

  useEffect(() => {
    if (wpm > 180) setPacingStatus("fast");
    else if (wpm < 100 && wpm > 0) setPacingStatus("slow");
    else setPacingStatus("good");
  }, [wpm]);

  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      setAlerts(["Speech recognition not supported in this browser"]);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let full = "";
      for (let i = 0; i < event.results.length; i++) {
        full += event.results[i][0].transcript + " ";
      }
      setTranscript(full);
      const words = full.trim().split(/\s+/).filter(Boolean);
      setWordCount(words.length);

      // Count fillers
      const lower = full.toLowerCase();
      let fCount = 0;
      FILLER_WORDS.forEach((fw) => {
        const regex = new RegExp(`\\b${fw}\\b`, "gi");
        const matches = lower.match(regex);
        if (matches) fCount += matches.length;
      });
      setFillerCount(fCount);
    };

    recognition.onerror = () => {
      setAlerts((prev) => [...prev, "Speech recognition error"]);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    setElapsed(0);
    setTranscript("");
    setWordCount(0);
    setFillerCount(0);

    timerRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsListening(false);

    const detectedFillers = FILLER_WORDS.filter((fw) => {
      const regex = new RegExp(`\\b${fw}\\b`, "gi");
      return transcript.toLowerCase().match(regex);
    });

    const pacingAlerts: string[] = [];
    if (wpm > 180) pacingAlerts.push("Speaking too fast — try slowing down");
    if (wpm < 100 && wpm > 0) pacingAlerts.push("Speaking too slowly — try picking up pace");
    if (fillerCount > 5) pacingAlerts.push(`High filler word count (${fillerCount}) — practice pausing instead`);

    onComplete?.({
      duration: elapsed,
      wordCount,
      wpm,
      fillerCount,
      fillerWords: detectedFillers,
      pacingAlerts,
    });
  }, [transcript, elapsed, wordCount, wpm, fillerCount, onComplete]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const pacingColor = pacingStatus === "good" ? "text-green-500" : pacingStatus === "fast" ? "text-destructive" : "text-yellow-500";
  const pacingLabel = pacingStatus === "good" ? "Good pace" : pacingStatus === "fast" ? "Too fast!" : "Too slow";

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isListening ? "bg-destructive animate-pulse" : "bg-muted-foreground/30"}`} />
            <span className="text-sm font-medium">{isListening ? "Recording..." : "Live Delivery Coach"}</span>
          </div>
          <Button
            size="sm"
            variant={isListening ? "destructive" : "default"}
            onClick={isListening ? stopListening : startListening}
            className="gap-1.5"
          >
            {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {isListening ? "Stop" : "Start Practice"}
          </Button>
        </div>

        {/* Live Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg bg-secondary/50 p-2 text-center">
            <Clock className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm font-bold">{fmtTime(elapsed)}</p>
            <p className="text-[9px] text-muted-foreground">Duration</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-2 text-center">
            <Activity className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm font-bold">{wordCount}</p>
            <p className="text-[9px] text-muted-foreground">Words</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-2 text-center">
            <Gauge className={`w-3.5 h-3.5 mx-auto mb-1 ${pacingColor}`} />
            <p className={`text-sm font-bold ${pacingColor}`}>{wpm}</p>
            <p className="text-[9px] text-muted-foreground">WPM</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-2 text-center">
            <AlertTriangle className={`w-3.5 h-3.5 mx-auto mb-1 ${fillerCount > 3 ? "text-destructive" : "text-muted-foreground"}`} />
            <p className={`text-sm font-bold ${fillerCount > 3 ? "text-destructive" : ""}`}>{fillerCount}</p>
            <p className="text-[9px] text-muted-foreground">Fillers</p>
          </div>
        </div>

        {/* Pacing indicator */}
        {isListening && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Pacing</span>
              <Badge variant={pacingStatus === "good" ? "default" : "secondary"} className="text-[10px]">
                {pacingLabel}
              </Badge>
            </div>
            <Progress value={Math.min((wpm / 200) * 100, 100)} className="h-1.5" />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>100 WPM</span>
              <span>150 (ideal)</span>
              <span>200+</span>
            </div>
          </div>
        )}

        {/* Live transcript */}
        {transcript && (
          <div className="max-h-24 overflow-y-auto rounded-lg bg-secondary/30 p-2">
            <p className="text-xs text-muted-foreground leading-relaxed">{transcript}</p>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="space-y-1">
            {alerts.map((a, i) => (
              <p key={i} className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {a}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
