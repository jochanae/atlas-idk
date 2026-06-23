import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

const EMOJIS = ["👏", "🔥", "💡", "❤️", "😮", "🎯"];

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number;
}

interface LiveReactionsProps {
  presentationId: string;
  isAudience?: boolean;
}

function getVoterSession(): string {
  let s = sessionStorage.getItem("voter_session");
  if (!s) { s = crypto.randomUUID(); sessionStorage.setItem("voter_session", s); }
  return s;
}

export default function LiveReactions({ presentationId, isAudience = false }: LiveReactionsProps) {
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const session = useRef(getVoterSession());

  // Subscribe to realtime reactions
  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${presentationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "audience_reactions",
        filter: `presentation_id=eq.${presentationId}`,
      }, (payload: any) => {
        const emoji = payload.new.value;
        const id = payload.new.id;
        setFloating(prev => [...prev, { id, emoji, x: Math.random() * 80 + 10 }]);
        setCounts(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
        setTimeout(() => setFloating(prev => prev.filter(f => f.id !== id)), 2000);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [presentationId]);

  const sendReaction = async (emoji: string) => {
    await supabase.from("audience_reactions").insert({
      presentation_id: presentationId,
      reaction_type: "emoji",
      value: emoji,
      viewer_session: session.current,
    });
  };

  return (
    <div className="relative">
      {/* Floating emojis overlay */}
      <div className="fixed bottom-24 right-4 w-20 h-48 pointer-events-none z-50">
        <AnimatePresence>
          {floating.map(f => (
            <motion.span
              key={f.id}
              initial={{ opacity: 1, y: 0, x: f.x - 50, scale: 1 }}
              animate={{ opacity: 0, y: -150, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, ease: "easeOut" }}
              className="absolute bottom-0 text-2xl"
            >
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* Reaction buttons */}
      {isAudience && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="w-10 h-10 rounded-full bg-card border border-border hover:bg-accent hover:scale-110 transition-all flex items-center justify-center text-lg active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Presenter view: counts */}
      {!isAudience && Object.keys(counts).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([emoji, count]) => (
            <span key={emoji} className="flex items-center gap-1 px-2 py-1 rounded-full bg-card border border-border text-sm">
              {emoji} <span className="text-xs font-medium text-muted-foreground">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
