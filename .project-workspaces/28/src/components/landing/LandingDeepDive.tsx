import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Presentation, Megaphone, Trophy, UsersRound, Building2, GraduationCap, type LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";
import SlideDNA, { demoSlideMetrics } from "@/components/SlideDNA";
import { RevealSection } from "./shared";

interface DemoMessage {
  role: "user" | "arc";
  text: string;
}

interface TopicDemo {
  id: string;
  label: string;
  icon: LucideIcon;
  messages: DemoMessage[];
}

const arcTopicDemos: TopicDemo[] = [
  {
    id: "pitch",
    label: "Pitch Deck",
    icon: Presentation,
    messages: [
      { role: "user", text: "I'm pitching to Series A VCs next week. Help me nail the opening." },
      { role: "arc", text: "Let's lead with the problem, not your product. Try: '72% of small businesses still wait 30+ days to get paid.' That grabs attention. Then we'll bridge to your solution." },
      { role: "user", text: "We automate invoice reconciliation for SMBs." },
      { role: "arc", text: "Strong. Here's your opening arc: Pain → Scale → Your Fix. Slide 1: the stat. Slide 2: 'That's $3.1T stuck in transit.' Slide 3: 'We fix that in 24 hours.' Want me to build the full deck?" },
    ],
  },
  {
    id: "sales",
    label: "Sales Demo",
    icon: Megaphone,
    messages: [
      { role: "user", text: "I have a product demo for an enterprise client tomorrow. How should I structure it?" },
      { role: "arc", text: "For enterprise demos, lead with THEIR pain — not your features. Open with: 'Based on our discovery call, your team spends ~12 hours/week on manual reporting.' Here's how that changes." },
      { role: "user", text: "Manual reporting across 6 different systems." },
      { role: "arc", text: "Perfect hook: 'What if 12 hours of reporting became 12 minutes?' Then show ONE live workflow — don't demo everything. End with ROI: time saved × hourly cost × 52 weeks." },
    ],
  },
  {
    id: "keynote",
    label: "Keynote",
    icon: Trophy,
    messages: [
      { role: "user", text: "I'm giving a 20-minute keynote. Theme is 'Future of Work.' Help?" },
      { role: "arc", text: "20 minutes = 3 acts. Act 1 (5 min): A personal story. Act 2 (10 min): 3 insights, each with one memorable example. Act 3 (5 min): The call to action." },
      { role: "user", text: "How AI is making managers obsolete — but leaders essential." },
      { role: "arc", text: "🔥 Open with: 'My last manager was an algorithm. And honestly? It was better at scheduling.' — Gets a laugh, sets the tension. Then build to: 'AI replaces management. It can't replace leadership.'" },
    ],
  },
  {
    id: "team",
    label: "Team Update",
    icon: UsersRound,
    messages: [
      { role: "user", text: "Quarterly all-hands for my 50-person team. How do I make it not boring?" },
      { role: "arc", text: "Rule #1: No one remembers slides. They remember moments. Start with a 90-second win celebration — name specific people. Then: 1 big number, 1 honest challenge, 1 exciting thing coming." },
      { role: "user", text: "We hit 10K users — 2 months ahead of schedule." },
      { role: "arc", text: "Lead with that energy: 'We planned to celebrate 10K in March. We're celebrating it today.' Show one slide — just the number 10,000 — and pause. Let the room absorb it." },
    ],
  },
  {
    id: "board",
    label: "Board Meeting",
    icon: Building2,
    messages: [
      { role: "user", text: "Preparing a board deck. Investors want to see our path to profitability." },
      { role: "arc", text: "Board decks are about clarity and confidence. Structure: 1) Key metrics, 2) Revenue trajectory, 3) Unit economics, 4) Path to break-even with milestones." },
      { role: "user", text: "We're at $400K MRR, burning $600K/month." },
      { role: "arc", text: "Frame it positively: 'At current growth rate, we reach profitability in Q3 without additional funding.' Show the trendline. Then one slide on your 3 levers." },
    ],
  },
  {
    id: "training",
    label: "Training",
    icon: GraduationCap,
    messages: [
      { role: "user", text: "Running a 1-hour training session for new hires. Tips?" },
      { role: "arc", text: "Tell them, show them, let them do it. Split your hour: 15 min context, 25 min guided demo, 20 min hands-on exercise. What product are you training on?" },
      { role: "user", text: "Our CRM — specifically the deal pipeline." },
      { role: "arc", text: "Start with: 'By end of this session, you'll close your first practice deal.' Demo ONE flow. Then give them a scenario. Real doing > slide reading." },
    ],
  },
];

const ArcInActionSection = () => {
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  const activeDemo = activeTopic ? arcTopicDemos.find((t) => t.id === activeTopic) : null;

  const handleTopicClick = (id: string) => {
    setActiveTopic(id);
    setVisibleCount(0);
    // Kick off first message after a short pause
    setTimeout(() => setVisibleCount(1), 600);
  };

  useEffect(() => {
    if (!activeDemo || visibleCount === 0 || visibleCount >= activeDemo.messages.length) return;
    // More realistic timing: user messages appear faster, arc responses take longer
    const currentMsg = activeDemo.messages[visibleCount - 1];
    const delay = currentMsg?.role === "arc" ? 2200 : 1400;
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), delay);
    return () => clearTimeout(timer);
  }, [visibleCount, activeDemo]);

  return (
    <RevealSection>
      <section id="deep-dive" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-primary font-semibold text-sm mb-2 block">
              <Sparkles className="w-4 h-4 inline-block mr-1 -mt-0.5" />
              See Arc in action — pick a topic below
            </span>
          </div>

          {/* Topic pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {arcTopicDemos.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleTopicClick(topic.id)}
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                  activeTopic === topic.id
                    ? "bg-primary text-primary-foreground shadow-lg scale-105"
                    : "bg-card text-foreground border border-border hover:border-primary/40 hover:bg-secondary/60"
                }`}
              >
                <topic.icon className="w-4 h-4" />
                {topic.label}
              </button>
            ))}
          </div>

          {/* Chat card — full width */}
          <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-display font-semibold text-foreground">Arc Coach</p>
                  <p className="text-xs text-muted-foreground">AI Presentation Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Online
              </div>
            </div>

            {/* Messages area */}
            <div className="p-5 sm:p-8 min-h-[340px] sm:min-h-[380px] flex items-center justify-center">
              <AnimatePresence mode="wait">
                {!activeDemo ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-4 text-center"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-7 h-7 text-primary/50" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Tap a topic above to start the demo
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={activeTopic}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4 w-full"
                  >
                    {activeDemo.messages.slice(0, visibleCount).map((msg, i) => (
                      <motion.div
                        key={`${activeTopic}-${i}`}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className={`flex items-end gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {msg.role === "arc" && (
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4 text-primary-foreground" />
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-secondary text-foreground rounded-bl-md"
                        }`}>
                          {msg.text}
                        </div>
                        {msg.role === "user" && (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <span className="text-xs text-muted-foreground">You</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                    {visibleCount > 0 && visibleCount < activeDemo.messages.length && (
                      <div className="flex items-center gap-2 pl-11">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.4s]" />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Slide DNA preview */}
          <div className="mt-16">
            <div className="text-center mb-6">
              <span className="text-primary font-semibold text-sm mb-2 block">Exclusive Feature</span>
              <h3 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">Slide DNA™</h3>
              <p className="text-muted-foreground text-sm max-w-lg mx-auto">
                Every deck gets a unique visual DNA — a flowing ribbon that maps your presentation's emotional arc, word density, and pacing at a glance.
              </p>
            </div>
            <div className="bg-card/60 rounded-2xl border border-border p-5 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground mb-3">Sample Pitch Deck DNA</p>
              <SlideDNA metrics={demoSlideMetrics} size="md" interactive={false} />
            </div>
          </div>
        </div>
      </section>
    </RevealSection>
  );
};

export default ArcInActionSection;
