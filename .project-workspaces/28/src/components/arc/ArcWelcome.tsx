import { useState } from "react";
import { BookOpen, Zap, MessageSquare, Pen, Sparkles, ArrowRight, History } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { ArcMode } from "./ArcProvider";
import { AnimatePresence, motion } from "framer-motion";
import ArcPresentationPicker from "./ArcPresentationPicker";

const modes: { id: ArcMode; label: string; icon: React.ElementType }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "quick", label: "Quick", icon: Zap },
  { id: "guided", label: "Guided", icon: BookOpen },
  { id: "coaching", label: "Coach", icon: MessageSquare },
  { id: "rewrite", label: "Remix", icon: Pen },
];

const starterPrompts: Record<ArcMode, string[]> = {
  chat: [
    "I need help with an existing presentation",
    "What can you help me with?",
    "I have an event coming up and need slides",
  ],
  guided: [
    "Help me build a presentation from scratch",
    "I need to pitch my startup to investors",
    "I've never built a deck before — guide me",
  ],
  quick: [
    "Build me a 10-slide sales pitch for a SaaS product",
    "Create a keynote on AI in healthcare",
    "Generate an investor update presentation",
  ],
  coaching: [
    "Review my current deck and suggest improvements",
    "Help me strengthen my opening slide",
    "What questions might my audience ask?",
  ],
  rewrite: [
    "We help companies save money using AI automation tools",
    "Our product is better because it's faster and cheaper",
    "I want to tell investors we're the best team for this",
  ],
  teleprompter: [
    "Write me a 5-minute speech about leadership",
    "Help me write a keynote opening",
    "I need a teleprompter script for a product launch",
  ],
};

interface ArcWelcomeProps {
  mode: ArcMode;
  onModeChange: (mode: ArcMode) => void;
  onSendMessage: (msg: string) => void;
  conversationCount?: number;
  onShowHistory?: () => void;
  selectedPresentationId: string | null;
  onSelectPresentation: (id: string | null, title: string | null) => void;
}

export default function ArcWelcome({ mode, onModeChange, onSendMessage, conversationCount = 0, onShowHistory, selectedPresentationId, onSelectPresentation }: ArcWelcomeProps) {
  const [showPrompts, setShowPrompts] = useState(false);
  const { data: profile } = useProfile();

  const firstName = profile?.display_name?.split(" ")[0] || "there";

  return (
    <div className="flex flex-col items-center justify-center px-5 py-8 space-y-6 animate-fade-in max-w-md mx-auto">
      {/* Branded greeting */}
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-gold flex items-center justify-center glow-gold animate-scale-in">
          <Sparkles className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground">
            Hey {firstName} 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "chat" ? "Just tell me what you need." : "What are we building today?"}
          </p>
        </div>
      </div>

      {/* Horizontal mode chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar w-full justify-center">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => { onModeChange(m.id); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
              mode === m.id
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-secondary text-muted-foreground hover:text-foreground border border-border hover:border-primary/30"
            }`}
          >
            <m.icon className="w-3.5 h-3.5" />
            {m.label}
          </button>
        ))}
      </div>

      {/* Presentation picker for modes that benefit from context */}
      {(mode === "chat" || mode === "coaching" || mode === "guided" || mode === "rewrite") && (
        <ArcPresentationPicker
          mode={mode}
          selectedId={selectedPresentationId}
          onSelect={onSelectPresentation}
        />
      )}

      {/* Collapsible "Start here" → prompts */}
      <div className="w-full space-y-2">
        <button
          onClick={() => setShowPrompts(!showPrompts)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/60 transition-all group"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowRight className={`w-4 h-4 text-primary transition-transform ${showPrompts ? "rotate-90" : ""}`} />
            Prompt suggestions
          </span>
          <span className="text-[11px] text-muted-foreground">
            {starterPrompts[mode].length} suggestions
          </span>
        </button>

        <AnimatePresence>
          {showPrompts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-1.5 pt-1">
                {starterPrompts[mode].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => onSendMessage(prompt)}
                    className="w-full text-left text-sm px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/60 transition-all text-foreground leading-snug group"
                  >
                    <span className="group-hover:text-primary transition-colors">{prompt}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History shortcut */}
      {conversationCount > 0 && onShowHistory && (
        <button
          onClick={onShowHistory}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <History className="w-3.5 h-3.5" />
          <span>Continue a conversation ({conversationCount})</span>
        </button>
      )}
    </div>
  );
}
