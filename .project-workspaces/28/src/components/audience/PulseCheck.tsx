import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThumbsUp, ThumbsDown, Minus } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PulseCheckProps {
  presentationId: string;
  isAudience?: boolean;
}

function getVoterSession(): string {
  let s = sessionStorage.getItem("voter_session");
  if (!s) { s = crypto.randomUUID(); sessionStorage.setItem("voter_session", s); }
  return s;
}

const PULSE_OPTIONS = [
  { value: "positive", icon: ThumbsUp, label: "Getting it", color: "text-green-500" },
  { value: "neutral", icon: Minus, label: "Okay", color: "text-yellow-500" },
  { value: "negative", icon: ThumbsDown, label: "Lost", color: "text-red-500" },
];

export default function PulseCheck({ presentationId, isAudience = false }: PulseCheckProps) {
  const [voted, setVoted] = useState(false);
  const [stats, setStats] = useState({ positive: 0, neutral: 0, negative: 0, total: 0 });
  const session = useRef(getVoterSession());

  // Fetch and subscribe to pulse reactions
  useEffect(() => {
    const fetchPulse = async () => {
      const { data } = await supabase
        .from("audience_reactions")
        .select("value")
        .eq("presentation_id", presentationId)
        .eq("reaction_type", "pulse");

      if (data) {
        const counts = { positive: 0, neutral: 0, negative: 0, total: data.length };
        data.forEach(r => {
          if (r.value in counts) counts[r.value as keyof typeof counts]++;
        });
        setStats(counts);
      }
    };

    fetchPulse();

    const channel = supabase
      .channel(`pulse-${presentationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "audience_reactions",
        filter: `presentation_id=eq.${presentationId}`,
      }, () => fetchPulse())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [presentationId]);

  const sendPulse = async (value: string) => {
    if (voted) return;
    setVoted(true);
    await supabase.from("audience_reactions").insert({
      presentation_id: presentationId,
      reaction_type: "pulse",
      value,
      viewer_session: session.current,
    });
  };

  const getPercent = (val: string) => stats.total > 0 ? Math.round((stats[val as keyof typeof stats] as number / stats.total) * 100) : 0;

  if (isAudience) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">How are you following along?</h3>
        {voted ? (
          <p className="text-xs text-muted-foreground">✓ Thanks for your feedback!</p>
        ) : (
          <div className="flex gap-2">
            {PULSE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => sendPulse(opt.value)}
                className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/50 transition-all"
              >
                <opt.icon className={`w-5 h-5 ${opt.color}`} />
                <span className="text-xs font-medium text-foreground">{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Presenter view
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Audience Pulse</h3>
        <span className="text-xs text-muted-foreground">{stats.total} responses</span>
      </div>
      <div className="space-y-2">
        {PULSE_OPTIONS.map(opt => (
          <div key={opt.value} className="flex items-center gap-2">
            <opt.icon className={`w-4 h-4 ${opt.color} shrink-0`} />
            <Progress value={getPercent(opt.value)} className="flex-1 h-2" />
            <span className="text-xs font-medium text-muted-foreground w-8 text-right">{getPercent(opt.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
