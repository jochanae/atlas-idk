import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, Camera, Pause, FileText, Circle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOUR_KEY = "presentq_lecture_tour_done";

const steps = [
  {
    icon: Camera,
    title: "Webcam PiP",
    desc: "Your camera appears as a draggable overlay. Toggle shape and size from the bottom bar, or press C to toggle on/off.",
  },
  {
    icon: Pause,
    title: "Pause for Interaction",
    desc: "Quiz and activity slides automatically show a pause badge — let your students respond before moving on.",
  },
  {
    icon: FileText,
    title: "Speaker Notes",
    desc: "Your notes panel sits on the right. Toggle it with the notes icon or use it as a teaching outline.",
  },
  {
    icon: Circle,
    title: "Record Everything",
    desc: "Hit Record to capture your lecture with webcam overlay — ready to share as a replay or upload to your LMS.",
  },
];

export default function LectureModeWalkthrough({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY)) return;
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, "true");
    setVisible(false);
    onDismiss();
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else dismiss();
  };

  if (!visible) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={dismiss}
      >
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.25 }}
          className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-white/50">
                Lecture Mode — {step + 1} of {steps.length}
              </span>
            </div>
            <button onClick={dismiss} className="text-white/40 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-display font-bold text-white text-base">{current.title}</h3>
          </div>

          <p className="text-sm text-white/60 leading-relaxed mb-5">{current.desc}</p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-white/20"}`}
                />
              ))}
            </div>
            <Button size="sm" onClick={next} className="h-8 px-4 text-xs bg-gradient-gold text-primary-foreground font-semibold gap-1">
              {step < steps.length - 1 ? (
                <>Next <ArrowRight className="w-3 h-3" /></>
              ) : (
                "Got it!"
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
