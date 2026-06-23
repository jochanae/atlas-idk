import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Audience member config ──────────────────────────────────────────────
interface AudienceMember {
  id: number;
  emoji: string;
  x: number;       // 0-100 percent
  y: number;       // 0-100 percent
  scale: number;
  delay: number;
}

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
  startY: number;
}

export type SlideContentForReaction = {
  blockType: string;
  wordCount: number;
  hasImage?: boolean;
  title?: string;
  body?: string;
};

interface AudienceReactionSimulatorProps {
  slideContent: SlideContentForReaction;
  isActive: boolean;
  /** compact mode for small containers */
  compact?: boolean;
  /** demo mode with looping reactions */
  demo?: boolean;
}

// ── Tone analysis ───────────────────────────────────────────────────────
type Tone = "engaging" | "informational" | "cta" | "storytelling" | "heavy" | "neutral";

const TONE_REACTIONS: Record<Tone, { emojis: string[]; energy: number }> = {
  engaging:      { emojis: ["😮", "🔥", "👏", "💡", "🎯"], energy: 0.9 },
  cta:           { emojis: ["💪", "🙌", "🚀", "✨", "👊"], energy: 0.85 },
  storytelling:  { emojis: ["😢", "❤️", "🥹", "😊", "🫶"], energy: 0.7 },
  informational: { emojis: ["🤔", "📝", "👀", "💭", "🧠"], energy: 0.5 },
  heavy:         { emojis: ["😴", "🥱", "😶", "📖", "⏳"], energy: 0.3 },
  neutral:       { emojis: ["🙂", "👍", "😐", "👀", "💭"], energy: 0.4 },
};

function analyzeTone(content: SlideContentForReaction): Tone {
  const { blockType, wordCount, title = "", body = "" } = content;
  const text = `${title} ${body}`.toLowerCase();

  // CTA detection
  if (blockType === "cta" || /call to action|sign up|get started|join|try|buy|subscribe/i.test(text)) return "cta";
  // Storytelling
  if (blockType === "story" || /story|once upon|journey|imagine|picture this|remember when/i.test(text)) return "storytelling";
  // Engaging hooks
  if (/question|what if|did you know|surprising|shocking|secret|reveal/i.test(text)) return "engaging";
  // Heavy / text-dense
  if (wordCount > 150) return "heavy";
  // Informational
  if (blockType === "framework" || blockType === "comparison" || wordCount > 80) return "informational";

  return "neutral";
}

// ── Static audience grid ────────────────────────────────────────────────
function generateAudience(count: number): AudienceMember[] {
  const members: AudienceMember[] = [];
  const cols = Math.ceil(Math.sqrt(count * 1.5));
  const rows = Math.ceil(count / cols);

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    members.push({
      id: i,
      emoji: "🙂",
      x: 8 + (col / (cols - 1 || 1)) * 84 + (Math.random() - 0.5) * 8,
      y: 10 + (row / (rows - 1 || 1)) * 80 + (Math.random() - 0.5) * 6,
      scale: 0.85 + Math.random() * 0.3,
      delay: Math.random() * 2,
    });
  }
  return members;
}

// ── Component ───────────────────────────────────────────────────────────
export default function AudienceReactionSimulator({
  slideContent,
  isActive,
  compact = false,
  demo = false,
}: AudienceReactionSimulatorProps) {
  const audienceCount = compact ? 12 : 20;
  const audience = useMemo(() => generateAudience(audienceCount), [audienceCount]);

  const [memberEmojis, setMemberEmojis] = useState<Record<number, string>>({});
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [currentTone, setCurrentTone] = useState<Tone>("neutral");
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const reactionIdRef = useRef(0);

  // Analyze tone when slide changes
  useEffect(() => {
    const tone = analyzeTone(slideContent);
    setCurrentTone(tone);
    // Reset emojis
    setMemberEmojis({});
    setFloatingReactions([]);
  }, [slideContent]);

  // Periodic reaction loop
  const spawnReactions = useCallback(() => {
    const { emojis, energy } = TONE_REACTIONS[currentTone];

    // Update random audience member emojis
    setMemberEmojis((prev) => {
      const next = { ...prev };
      const changeCount = Math.ceil(audience.length * energy * 0.3);
      for (let i = 0; i < changeCount; i++) {
        const member = audience[Math.floor(Math.random() * audience.length)];
        next[member.id] = emojis[Math.floor(Math.random() * emojis.length)];
      }
      return next;
    });

    // Spawn floating reaction
    if (Math.random() < energy) {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const id = `r-${reactionIdRef.current++}`;
      setFloatingReactions((prev) => [
        ...prev.slice(-8),
        { id, emoji, x: 10 + Math.random() * 80, startY: 90 },
      ]);
      // Remove after animation
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2200);
    }
  }, [currentTone, audience]);

  useEffect(() => {
    if (!isActive && !demo) {
      clearInterval(intervalRef.current);
      return;
    }
    // Initial burst
    spawnReactions();
    const speed = demo ? 1200 : 1800;
    intervalRef.current = setInterval(spawnReactions, speed);
    return () => clearInterval(intervalRef.current);
  }, [isActive, demo, spawnReactions]);

  const toneLabel: Record<Tone, { text: string; color: string }> = {
    engaging:      { text: "🔥 Engaging", color: "text-amber-400" },
    cta:           { text: "🚀 Call-to-Action", color: "text-emerald-400" },
    storytelling:  { text: "❤️ Storytelling", color: "text-rose-400" },
    informational: { text: "📝 Informational", color: "text-blue-400" },
    heavy:         { text: "📖 Text-Heavy", color: "text-muted-foreground" },
    neutral:       { text: "🙂 Neutral", color: "text-muted-foreground" },
  };

  const { text: toneText, color: toneColor } = toneLabel[currentTone];
  const fontSize = compact ? "text-lg" : "text-2xl";

  return (
    <div className={`relative w-full ${compact ? "h-32" : "h-48"} rounded-xl bg-secondary/30 border border-border overflow-hidden select-none`}>
      {/* Tone indicator */}
      <div className="absolute top-2 left-2 z-10">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${toneColor}`}>
          {toneText}
        </span>
      </div>

      {/* Energy bar */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <span className="text-[9px] text-muted-foreground">Energy</span>
        <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${TONE_REACTIONS[currentTone].energy * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Audience members */}
      {audience.map((member) => (
        <motion.div
          key={member.id}
          className={`absolute ${fontSize}`}
          style={{
            left: `${member.x}%`,
            top: `${member.y}%`,
            transform: `scale(${member.scale})`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: 1,
            scale: member.scale,
            transition: { delay: member.delay * 0.3, duration: 0.3 },
          }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={memberEmojis[member.id] || "default"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="inline-block"
            >
              {memberEmojis[member.id] || "🙂"}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      ))}

      {/* Floating reactions */}
      <AnimatePresence>
        {floatingReactions.map((r) => (
          <motion.div
            key={r.id}
            className="absolute text-2xl pointer-events-none"
            style={{ left: `${r.x}%` }}
            initial={{ bottom: "5%", opacity: 1, scale: 0.5 }}
            animate={{ bottom: "95%", opacity: 0, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
          >
            {r.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── Demo data for landing page ──────────────────────────────────────────
export const demoSlideContents: SlideContentForReaction[] = [
  { blockType: "hook", wordCount: 25, title: "What if your audience could tell you how they feel?", body: "Imagine knowing exactly when you're losing them." },
  { blockType: "story", wordCount: 60, title: "The Journey", body: "Picture this: you're standing on stage, heart racing, and then something magical happens…" },
  { blockType: "framework", wordCount: 120, title: "Our 3-Step Framework", body: "Step 1: Analyze your audience. Step 2: Adapt your delivery. Step 3: Measure the impact with real-time feedback loops." },
  { blockType: "cta", wordCount: 30, title: "Ready to Transform Your Delivery?", body: "Sign up today and get started with AI-powered rehearsal coaching." },
];
