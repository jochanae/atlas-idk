import { motion, useInView } from "framer-motion";
import { AlertTriangle, Clock, Frown, Zap } from "lucide-react";
import { useRef } from "react";
import { CinematicSection, ParallaxText } from "./shared";

const painPoints = [
  {
    icon: Clock,
    stat: "8+ hours",
    pain: "Average time building a single presentation",
    solution: "AI generates your full deck in under 60 seconds",
  },
  {
    icon: Frown,
    stat: "73%",
    pain: "Of audiences disengage within the first 5 minutes",
    solution: "Live polls & Q&A keep your audience locked in",
  },
  {
    icon: AlertTriangle,
    stat: "Zero",
    pain: "Presentation tools that help you actually deliver",
    solution: "Record, rehearse, and get AI coaching — built in",
  },
];

const LandingPainPoint = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <CinematicSection>
      <section ref={ref} className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <ParallaxText>
            <div className="text-center mb-12">
              <span className="text-destructive font-semibold text-sm mb-3 block flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                The Problem
              </span>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-foreground">
                Presentations Are Broken
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
                You spend hours on slides — but nobody coaches you on delivery, nobody engages your audience, and nobody helps you record your best take.
              </p>
            </div>
          </ParallaxText>

          <div className="grid md:grid-cols-3 gap-5">
            {painPoints.map((item, i) => (
              <motion.div
                key={item.stat}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.15, duration: 0.6 }}
                className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 text-center group hover:border-primary/30 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/10 transition-colors">
                  <item.icon className="w-6 h-6 text-destructive group-hover:text-primary transition-colors" />
                </div>
                <p className="font-display text-3xl font-bold text-foreground mb-1">{item.stat}</p>
                <p className="text-sm text-muted-foreground mb-4 line-through decoration-destructive/40">{item.pain}</p>
                <div className="flex items-center gap-1.5 justify-center text-sm font-medium text-primary">
                  <Zap className="w-3.5 h-3.5" />
                  {item.solution}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </CinematicSection>
  );
};

export default LandingPainPoint;
