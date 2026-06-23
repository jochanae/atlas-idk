import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, Layers, Smartphone, Users, Video, BarChart3, Wand2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useRef, useState, useEffect } from "react";

const quickFeatures = [
  { icon: Sparkles, title: "AI Deck Builder", color: "from-amber-500/20 to-amber-600/5 border-amber-500/20" },
  { icon: Palette, title: "Brand Studio", color: "from-pink-500/20 to-pink-600/5 border-pink-500/20" },
  { icon: Video, title: "Loom-Style Recording", color: "from-rose-500/20 to-rose-600/5 border-rose-500/20" },
  { icon: BarChart3, title: "Live Polling & Q&A", color: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20" },
  { icon: Layers, title: "Drag & Drop Canvas", color: "from-blue-500/20 to-blue-600/5 border-blue-500/20" },
  { icon: Wand2, title: "AI Logo Generator", color: "from-purple-500/20 to-purple-600/5 border-purple-500/20" },
  { icon: Smartphone, title: "Mobile-First", color: "from-cyan-500/20 to-cyan-600/5 border-cyan-500/20" },
];

const LandingHero = () => {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const [featureIndex, setFeatureIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setFeatureIndex((i) => (i + 1) % quickFeatures.length), 3000);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <section ref={heroRef} className="relative pt-24 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 min-h-[90vh] flex items-center">
      <motion.div style={{ y: heroY, opacity: heroOpacity }} className="max-w-7xl mx-auto text-center relative z-10 w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Anchor pill + rotating feature */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex flex-col items-center gap-3 mb-8"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold font-display bg-gradient-to-r from-gold/15 to-gold-muted/10 border border-gold/25 text-foreground shadow-sm">
              <Sparkles className="w-4 h-4 text-gold" />
              Your Complete Presentation Studio
            </span>
            <div
              className="h-6 relative flex items-center justify-center min-w-[200px] cursor-default"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <AnimatePresence mode="wait">
                {(() => {
                  const f = quickFeatures[featureIndex];
                  return (
                    <motion.span
                      key={f.title}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.35 }}
                      className="absolute inline-flex items-center gap-1.5 text-sm text-muted-foreground font-medium"
                    >
                      <f.icon className="w-4 h-4" />
                      {f.title}
                    </motion.span>
                  );
                })()}
              </AnimatePresence>
            </div>
          </motion.div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.08]">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="block"
            >
              Design. Build. Deliver.
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="block text-gradient-gold"
            >
              Your Complete Presentation Studio.
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-4 leading-relaxed"
          >
            <strong className="text-foreground">AI generates your deck and your logo.</strong> Design your brand, drag assets onto a live canvas, record Loom-style, and engage with live polls & Q&A — {" "}
            <strong className="text-foreground">PresentQ is your full creative studio.</strong>
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-sm sm:text-lg font-display font-semibold text-gradient-gold mb-2"
          >
            Your presentations, on cue.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="text-xs sm:text-sm text-muted-foreground/70 italic mb-8"
          >
            Be Present. Present.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 }}
            className="flex flex-col gap-3 max-w-md mx-auto"
          >
            <Button
              size="lg"
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-display font-semibold hover:opacity-90 shadow-xl w-full rounded-xl h-14 text-base"
              onClick={() => navigate("/auth")}
            >
              Start Free Today
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border text-foreground font-display hover:bg-secondary w-full rounded-xl h-14 text-base"
              onClick={() => document.getElementById("deep-dive")?.scrollIntoView({ behavior: "smooth" })}
            >
              See It in Action
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
            className="text-xs text-muted-foreground mt-4"
          >
            Free to start · No credit card required
          </motion.p>

          {/* Scroll prompt */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 1 }}
            className="mt-8 flex flex-col items-center gap-1 cursor-pointer"
            onClick={() => document.getElementById("deep-dive")?.scrollIntoView({ behavior: "smooth" })}
          >
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
            >
              <ArrowRight className="w-5 h-5 text-muted-foreground/40 rotate-90" />
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default LandingHero;
