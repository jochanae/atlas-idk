/**
 * EyeLineGuide — A subtle visual indicator near the webcam PiP
 * that helps the presenter maintain camera eye contact.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye } from "lucide-react";

interface EyeLineGuideProps {
  enabled: boolean;
  pipBottom?: number;
  pipRight?: number;
  pipWidth?: number;
}

export default function EyeLineGuide({ enabled, pipBottom = 16, pipRight = 16, pipWidth = 240 }: EyeLineGuideProps) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }, 30000);
    const initial = setTimeout(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }, 5000);
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute z-40 pointer-events-none flex flex-col items-center gap-1"
        style={{
          bottom: pipBottom + 4,
          right: pipRight + pipWidth / 2 - 20,
        }}
      >
        <motion.div
          animate={pulse ? {
            scale: [1, 1.4, 1],
            opacity: [0.7, 0.3, 0.7],
          } : { scale: 1, opacity: 0.5 }}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="w-10 h-10 rounded-full border-2 border-primary/60 flex items-center justify-center"
        >
          <Eye className="w-4 h-4 text-primary/80" />
        </motion.div>
        <span className="text-[9px] text-primary/70 font-medium tracking-wide uppercase">
          Look here
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
