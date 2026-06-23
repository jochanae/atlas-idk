import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Layers, Mic, Palette, ArrowRight, X, GraduationCap, BookOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const ONBOARDING_KEY = "presentq_onboarding_seen";
const TEACHING_STYLE_KEY = "presentq_teaching_style";

export type TeachingStyle = "academic" | "faith" | "training" | null;

const steps = [
  {
    icon: Layers,
    title: "Create stunning decks",
    description: "Build professional presentations with 8+ slide types, custom themes, and AI-powered image generation.",
  },
  {
    icon: Sparkles,
    title: "Meet Arc, your AI co-pilot",
    description: "Ask Arc to brainstorm ideas, refine your message, or build entire decks from a simple prompt.",
  },
  {
    icon: Mic,
    title: "Practice & deliver with confidence",
    description: "Use the teleprompter, speaker scripts, rehearsal mode, and delivery coaching to nail every presentation.",
  },
  {
    icon: Palette,
    title: "Brand it your way",
    description: "Save brand kits with your colors, fonts, and logo — apply them to any deck in one click.",
  },
];

const teachingStyles = [
  {
    id: "academic" as TeachingStyle,
    icon: GraduationCap,
    label: "Academic & Education",
    description: "Lectures, courses, adult learning, workshops",
  },
  {
    id: "faith" as TeachingStyle,
    icon: BookOpen,
    label: "Faith & Scripture",
    description: "Sermons, Bible study, devotionals, ministry",
  },
  {
    id: "training" as TeachingStyle,
    icon: Users,
    label: "Training & Coaching",
    description: "Corporate training, onboarding, coaching programs",
  },
];

export function getTeachingStyle(): TeachingStyle {
  return (localStorage.getItem(TEACHING_STYLE_KEY) as TeachingStyle) || null;
}

export function OnboardingWelcome() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedStyle, setSelectedStyle] = useState<TeachingStyle>(null);

  // Total steps = feature steps + teaching style step
  const totalSteps = steps.length + 1;

  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) setVisible(true);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    if (selectedStyle) {
      localStorage.setItem(TEACHING_STYLE_KEY, selectedStyle);
    }
    setVisible(false);
  };

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      handleDismiss();
    }
  };

  if (!visible) return null;

  const isTeachingStep = step === steps.length;
  const currentFeature = step < steps.length ? steps[step] : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5">
            <span className="text-xs text-muted-foreground">{step + 1} of {totalSteps}</span>
            <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-8 text-center">
            <AnimatePresence mode="wait">
              {isTeachingStep ? (
                <motion.div
                  key="teaching"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                    <GraduationCap className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="font-display text-xl font-bold mb-2">How will you teach?</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto mb-6">
                    Choose your teaching style so Arc can adapt to your needs. You can change this later.
                  </p>
                  <div className="space-y-2 text-left">
                    {teachingStyles.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          selectedStyle === style.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/40 hover:bg-muted/50"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          selectedStyle === style.id ? "bg-primary/20" : "bg-muted"
                        }`}>
                          <style.icon className={`w-5 h-5 ${selectedStyle === style.id ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{style.label}</p>
                          <p className="text-xs text-muted-foreground">{style.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : currentFeature ? (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                    <currentFeature.icon className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="font-display text-xl font-bold mb-2">{currentFeature.title}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                    {currentFeature.description}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Progress dots + button */}
          <div className="px-6 pb-6 flex items-center justify-between">
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-secondary"}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {isTeachingStep && (
                <Button variant="ghost" onClick={handleDismiss} className="text-muted-foreground">
                  Skip
                </Button>
              )}
              <Button onClick={handleNext} className="bg-gradient-gold text-primary-foreground font-semibold gap-1.5">
                {step < totalSteps - 1 ? (
                  <>Next <ArrowRight className="w-3.5 h-3.5" /></>
                ) : (
                  "Get Started"
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
