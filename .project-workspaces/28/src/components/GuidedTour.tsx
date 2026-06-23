import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";

const TOUR_KEY = "presentq_tour_completed";

interface TourStep {
  selector: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const tourSteps: TourStep[] = [
  {
    selector: '[data-tour="new-deck"]',
    title: "Create your first deck",
    description: "Start a new presentation from scratch — add slides, themes, and speaker notes in seconds.",
    position: "bottom",
  },
  {
    selector: '[data-tour="quick-actions"]',
    title: "Quick Start shortcuts",
    description: "Jump straight into AI Builder, Templates, Teleprompter, Practice mode, and more from here.",
    position: "top",
  },
  {
    selector: '[data-tour="arc-chat"]',
    title: "Meet Arc — your AI co-pilot",
    description: "Ask Arc to brainstorm ideas, draft entire decks, rewrite content, or prep for Q&A. Just click to chat.",
    position: "left",
  },
  {
    selector: '[data-tour="resources-link"]',
    title: "Audience Resources",
    description: "Create downloadable handouts, checklists, summaries, and replay links to share with your audience.",
    position: "right",
  },
  {
    selector: '[data-tour="help-link"]',
    title: "Need help? We're here",
    description: "Access how-to guides, tips, and support anytime. We keep it updated as new features launch.",
    position: "right",
  },
];

export function GuidedTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    const tourDone = localStorage.getItem(TOUR_KEY);
    const onboardingSeen = localStorage.getItem("presentq_onboarding_seen");
    // Start tour after onboarding modal is dismissed
    if (onboardingSeen && !tourDone) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const updateRect = useCallback(() => {
    if (!active) return;
    const el = document.querySelector(tourSteps[step]?.selector);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [active, step]);

  useEffect(() => {
    updateRect();
    const onScroll = () => updateRect();
    const onResize = () => updateRect();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [updateRect]);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, "true");
    setActive(false);
  };

  const next = () => {
    if (step < tourSteps.length - 1) setStep(step + 1);
    else dismiss();
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!active) return null;

  const current = tourSteps[step];

  const getTooltipStyle = (): React.CSSProperties => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const gap = 12;
    const tooltipWidth = 288; // max-w-xs = 20rem = 320, but w-72 = 288
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const style: React.CSSProperties = { position: "fixed", zIndex: 110 };

    // On small screens, always position below or above the target, centered horizontally with clamping
    const isMobile = viewW < 640;

    if (isMobile) {
      // Prefer bottom, fall back to top if not enough room
      const spaceBelow = viewH - rect.bottom - gap;
      if (spaceBelow > 160) {
        style.top = rect.bottom + gap;
      } else {
        style.bottom = viewH - rect.top + gap;
      }
      // Center horizontally, clamp to viewport with 12px margin
      const idealLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
      style.left = Math.max(12, Math.min(idealLeft, viewW - tooltipWidth - 12));
      return style;
    }

    switch (current.position) {
      case "bottom":
        style.top = rect.bottom + gap;
        style.left = Math.max(12, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, viewW - tooltipWidth - 12));
        break;
      case "top":
        style.bottom = viewH - rect.top + gap;
        style.left = Math.max(12, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, viewW - tooltipWidth - 12));
        break;
      case "left":
        style.top = rect.top + rect.height / 2;
        style.right = viewW - rect.left + gap;
        style.transform = "translateY(-50%)";
        break;
      case "right":
        style.top = rect.top + rect.height / 2;
        style.left = Math.min(rect.right + gap, viewW - tooltipWidth - 12);
        style.transform = "translateY(-50%)";
        break;
    }
    return style;
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tour-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100]"
        style={{ pointerEvents: "none" }}
      >
        {/* Dimmed overlay with spotlight cutout */}
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "auto" }} onClick={dismiss}>
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.left - 6}
                  y={rect.top - 6}
                  width={rect.width + 12}
                  height={rect.height + 12}
                  rx="10"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="hsl(220 40% 6% / 0.6)"
            mask="url(#tour-mask)"
          />
        </svg>

        {/* Highlight ring */}
        {rect && (
          <div
            className="absolute rounded-xl border-2 border-primary animate-pulse-glow"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              pointerEvents: "none",
              zIndex: 105,
            }}
          />
        )}

        {/* Tooltip card */}
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2 }}
          style={{ ...getTooltipStyle(), pointerEvents: "auto" }}
          className="bg-card border border-border rounded-xl shadow-2xl max-w-xs w-72 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-muted-foreground">
                {step + 1} of {tourSteps.length}
              </span>
            </div>
            <button onClick={dismiss} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <h3 className="font-display font-bold text-sm mb-1">{current.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{current.description}</p>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {tourSteps.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-secondary"}`}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={prev} className="h-7 px-2 text-xs">
                  <ArrowLeft className="w-3 h-3" />
                </Button>
              )}
              <Button size="sm" onClick={next} className="h-7 px-3 text-xs bg-gradient-gold text-primary-foreground font-semibold gap-1">
                {step < tourSteps.length - 1 ? (
                  <>Next <ArrowRight className="w-3 h-3" /></>
                ) : (
                  "Finish"
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
