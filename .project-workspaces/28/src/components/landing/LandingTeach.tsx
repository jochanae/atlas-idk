import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { GraduationCap, BookOpen, Church, Briefcase, Mic, Layout, Brain, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { CinematicSection, ParallaxText } from "./shared";

const teachingStyles = [
  {
    id: "academic",
    icon: GraduationCap,
    label: "Academic",
    desc: "Lectures, lesson plans, and interactive quizzes with progress tracking.",
    gradient: "from-blue-600/25 to-blue-900/40 border-blue-500/20",
    iconBg: "bg-blue-500/20",
  },
  {
    id: "faith",
    icon: Church,
    label: "Structured Teaching",
    desc: "Scripture blocks, guided reflection, and a split-view teleprompter for sermons and talks.",
    gradient: "from-amber-600/25 to-amber-900/40 border-amber-500/20",
    iconBg: "bg-amber-500/20",
  },
  {
    id: "training",
    icon: Briefcase,
    label: "Corporate Training",
    desc: "Onboarding decks, activity prompts, and concept-driven walkthroughs.",
    gradient: "from-emerald-600/25 to-emerald-900/40 border-emerald-500/20",
    iconBg: "bg-emerald-500/20",
  },
];

const features = [
  { icon: Layout, text: "Educational block types: quiz, concept, guided-notes, scripture, recap" },
  { icon: Brain, text: "Arc AI tuned for your teaching style — Academic, Faith, or Training" },
  { icon: Mic, text: "Lecture Mode™ with webcam PiP, recording, and pause-for-interaction" },
  { icon: CheckCircle2, text: "Progress checkpoints and lesson objectives built into every deck" },
];

const LandingTeach = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const navigate = useNavigate();

  return (
    <CinematicSection>
      <section id="teach" ref={ref} className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <ParallaxText>
            <div className="text-center mb-14">
              <span className="text-primary font-semibold text-sm mb-3 block">For Educators</span>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-foreground">
                Teach with presentQ
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
                Purpose-built tools for professors, pastors, and trainers — not just slide makers.
              </p>
            </div>
          </ParallaxText>

          {/* Teaching style cards */}
          <div className="grid md:grid-cols-3 gap-5 mb-12">
            {teachingStyles.map((style, i) => (
              <motion.div
                key={style.id}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.12, duration: 0.6 }}
                className={`rounded-2xl border bg-gradient-to-br ${style.gradient} p-6 backdrop-blur-sm hover:scale-[1.02] transition-transform duration-300`}
              >
                <div className={`w-12 h-12 rounded-xl ${style.iconBg} flex items-center justify-center mb-4`}>
                  <style.icon className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground mb-2">{style.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{style.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Feature list */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8"
          >
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {features.map((f) => (
                <div key={f.text} className="flex items-start gap-3 text-sm text-foreground">
                  <f.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center">
              <Button
                size="lg"
                className="bg-gradient-gold text-primary-foreground font-display font-semibold rounded-xl gap-2"
                onClick={() => navigate("/auth")}
              >
                Start Teaching for Free
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </CinematicSection>
  );
};

export default LandingTeach;
