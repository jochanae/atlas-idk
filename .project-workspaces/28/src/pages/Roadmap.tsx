import { useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Rocket, Brain, Upload, Palette, BarChart3, Mic, Share2, Zap, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Feature {
  id: string;
  title: string;
  description: string;
  status: "done" | "in-progress" | "planned";
}

interface Phase {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  features: Feature[];
}

const initialPhases: Phase[] = [
  {
    id: "arc-ai",
    title: "Smart Arc AI — Conversational Coach",
    icon: Brain,
    description: "Rebuild Arc to ask questions, guide amateurs, and generate decks conversationally.",
    features: [
      { id: "arc-1", title: "Guided onboarding flow — Arc asks: audience, goal, time limit, experience level", description: "Arc walks beginners through every decision", status: "done" },
      { id: "arc-2", title: "Smart follow-up questions instead of dumping content", description: "Conversational back-and-forth, not one-shot output", status: "done" },
      { id: "arc-3", title: "Full deck generation from conversation answers", description: "Arc builds a complete presentation from your answers", status: "done" },
      { id: "arc-4", title: "'Guided Build' mode for beginners vs 'Quick Draft' for pros", description: "Two modes so it works for everyone", status: "done" },
      { id: "arc-5", title: "Per-slide coaching — Arc suggests improvements on each slide", description: "Smart nudges to improve weak slides", status: "done" },
      { id: "arc-6", title: "Delivery coaching tips — pacing, emphasis, transitions", description: "Speaking advice alongside content", status: "done" },
    ],
  },
  {
    id: "import-library",
    title: "Import & Content Library",
    icon: Upload,
    description: "Upload existing presentations, build a reusable content library with brand assets.",
    features: [
      { id: "lib-1", title: "PDF upload — extract slides from existing presentations", description: "Bring in work you've already done", status: "done" },
      { id: "lib-2", title: "PPTX import (text/structure extraction)", description: "Import PowerPoint files and convert to PresentQ slides", status: "done" },
      { id: "lib-3", title: "Content library — save & reuse slide blocks across decks", description: "Build once, reuse everywhere", status: "done" },
      { id: "lib-4", title: "Brand kit — upload logos, set brand colors/fonts", description: "Keep every deck on-brand automatically", status: "done" },
      { id: "lib-5", title: "Template gallery — pre-built decks for common use cases", description: "Sales pitch, investor deck, training, etc.", status: "done" },
    ],
  },
  {
    id: "editor-power",
    title: "Editor Power Features",
    icon: Zap,
    description: "Drag-to-reorder, image support, duplicate slides, and more editing capabilities.",
    features: [
      { id: "ed-1", title: "Drag-to-reorder slides in thumbnail sidebar", description: "Rearrange your deck visually", status: "done" },
      { id: "ed-2", title: "Duplicate slide functionality", description: "Copy a slide to iterate on variations", status: "done" },
      { id: "ed-3", title: "Image upload & placement on slides", description: "Add photos, diagrams, screenshots", status: "done" },
      { id: "ed-4", title: "AI image generation for slides", description: "Generate visuals from text prompts right in the editor", status: "done" },
      { id: "ed-5", title: "Rich text editing — bold, italic, lists, links", description: "Format your content properly", status: "done" },
      { id: "ed-6", title: "Undo/redo support", description: "Never lose work by accident", status: "done" },
    ],
  },
  {
    id: "visual-design",
    title: "Visual & Design Intelligence",
    icon: Palette,
    description: "Smart layouts, theme engine, and professional design suggestions.",
    features: [
      { id: "vis-1", title: "Theme engine — apply consistent styles across all slides", description: "One-click theme changes", status: "done" },
      { id: "vis-2", title: "AI layout suggestions based on content type", description: "Auto-pick the best layout for your content", status: "done" },
      { id: "vis-3", title: "Custom color palettes & font pairings", description: "Professional design without a designer", status: "done" },
      { id: "vis-4", title: "Slide transitions & animations", description: "Smooth presentation flow", status: "done" },
      { id: "vis-5", title: "Dark/light mode for presentations", description: "Match venue lighting", status: "done" },
    ],
  },
  {
    id: "delivery",
    title: "Delivery & Performance",
    icon: Mic,
    description: "Practice mode, audience analytics, and speaking support tools.",
    features: [
      { id: "del-1", title: "Practice mode with timer and pacing alerts", description: "Rehearse with feedback", status: "done" },
      { id: "del-2", title: "Confidence prompts — key talking points per slide", description: "Never blank on what to say", status: "done" },
      { id: "del-3", title: "Audience Q&A prep — Arc predicts likely questions", description: "Be ready for anything", status: "done" },
      { id: "del-4", title: "Post-presentation analytics (if shared via link)", description: "See which slides engaged viewers", status: "done" },
    ],
  },
  {
    id: "export-share",
    title: "Export & Sharing",
    icon: Share2,
    description: "PDF export, shareable links, and collaboration features.",
    features: [
      { id: "exp-1", title: "Export to PDF", description: "Download your deck as a polished PDF", status: "done" },
      { id: "exp-2", title: "Shareable presentation links (viewer mode)", description: "Send a link, no login required to view", status: "done" },
      { id: "exp-3", title: "Embed presentations on websites", description: "Drop your deck into any webpage", status: "done" },
      { id: "exp-4", title: "Collaboration — invite others to edit", description: "Work together on decks", status: "done" },
    ],
  },
  {
    id: "monetization",
    title: "Monetization & Growth",
    icon: BarChart3,
    description: "Pro features, usage limits, and growth mechanics.",
    features: [
      { id: "mon-1", title: "Free tier with limits (3 decks, basic blocks)", description: "Let people try before they buy", status: "done" },
      { id: "mon-2", title: "Pro subscription — unlimited decks, AI features, premium templates", description: "Core revenue model", status: "done" },
      { id: "mon-3", title: "Usage analytics dashboard for creators", description: "See how your content performs", status: "done" },
      { id: "mon-4", title: "Referral system", description: "Growth through word of mouth", status: "done" },
    ],
  },
  {
    id: "arc-everywhere",
    title: "Phase 9: Arc Everywhere",
    icon: Layers,
    description: "Embed Arc contextually throughout the app — editor coaching, analytics insights, post-rehearsal debriefs.",
    features: [
      { id: "arc9-1", title: "Per-slide coaching panel in the editor", description: "Arc analyzes each slide and suggests improvements for clarity, visuals, and messaging", status: "done" },
      { id: "arc9-2", title: "Editor Arc sidebar — context-aware chat", description: "Collapsible Arc panel in the editor that knows your current slide, theme, and brand kit", status: "done" },
      { id: "arc9-3", title: "Analytics Arc insights", description: "Arc interprets engagement data and suggests actionable improvements", status: "done" },
      { id: "arc9-4", title: "Post-rehearsal debrief with Arc", description: "After practice mode, Arc summarizes performance and suggests focus areas", status: "done" },
      { id: "arc9-5", title: "Arc → Generate Deck bridge", description: "Arc's guided conversation can produce a full deck via the deck generator", status: "done" },
      { id: "arc9-6", title: "AI deck generator quality upgrade", description: "Stronger prompts, output validation, and auto-repair for complete decks", status: "done" },
    ],
  },
];

export default function RoadmapPage() {
  const [phases, setPhases] = useState<Phase[]>(initialPhases);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(initialPhases.map(p => p.id)));

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const toggleFeature = (phaseId: string, featureId: string) => {
    setPhases(prev => prev.map(phase => {
      if (phase.id !== phaseId) return phase;
      return {
        ...phase,
        features: phase.features.map(f => {
          if (f.id !== featureId) return f;
          return { ...f, status: f.status === "done" ? "planned" : "done" as const };
        }),
      };
    }));
  };

  const totalFeatures = phases.reduce((sum, p) => sum + p.features.length, 0);
  const doneFeatures = phases.reduce((sum, p) => sum + p.features.filter(f => f.status === "done").length, 0);
  const progressPercent = Math.round((doneFeatures / totalFeatures) * 100);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center">
              <Rocket className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">PresentQ Roadmap</h1>
              <p className="text-sm text-muted-foreground">Track every feature as we build it</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{doneFeatures} of {totalFeatures} features complete</span>
              <span className="text-sm font-bold text-gradient-gold">{progressPercent}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-gold rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="space-y-4">
          {phases.map((phase) => {
            const phaseDone = phase.features.filter(f => f.status === "done").length;
            const isExpanded = expandedPhases.has(phase.id);

            return (
              <div key={phase.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Phase header */}
                <button
                  onClick={() => togglePhase(phase.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <phase.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-sm">{phase.title}</span>
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {phaseDone}/{phase.features.length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{phase.description}</p>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {/* Feature list */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-1">
                        {phase.features.map((feature) => (
                          <button
                            key={feature.id}
                            onClick={() => toggleFeature(phase.id, feature.id)}
                            className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left group"
                          >
                            {feature.status === "done" ? (
                              <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5 group-hover:text-primary/60 transition-colors" />
                            )}
                            <div className="min-w-0">
                              <span className={`text-sm ${feature.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {feature.title}
                              </span>
                              <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
