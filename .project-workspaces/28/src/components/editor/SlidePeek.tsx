import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ScaledSlide from "@/components/editor/ScaledSlide";
import SlideRenderer from "@/components/editor/SlideRenderer";
import type { SlideTheme } from "@/lib/slideThemes";
import type { Json } from "@/integrations/supabase/types";
import { useIsMobile } from "@/hooks/use-mobile";

interface SlidePeekProps {
  blockType: string;
  content: Json;
  theme: SlideTheme;
  slideNumber: number;
  children: React.ReactNode;
}

export default function SlidePeek({ blockType, content, theme, slideNumber, children }: SlidePeekProps) {
  const isMobile = useIsMobile();
  const [show, setShow] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Disable on mobile — no hover
  if (isMobile) return <>{children}</>;

  const handleEnter = () => {
    timeout.current = setTimeout(() => setShow(true), 350);
  };

  const handleLeave = () => {
    clearTimeout(timeout.current);
    setShow(false);
  };

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="relative"
    >
      {children}

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.9 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none"
          >
            <div className="w-80 rounded-xl border border-border bg-card shadow-2xl overflow-hidden ring-1 ring-primary/10">
              <div className="aspect-video">
                <ScaledSlide>
                  <SlideRenderer blockType={blockType} content={content} theme={theme} />
                </ScaledSlide>
              </div>
              <div className="px-3 py-1.5 border-t border-border bg-secondary/50 flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground">Slide {slideNumber}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{blockType}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
