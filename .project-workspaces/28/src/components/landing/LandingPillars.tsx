import { motion, useInView } from "framer-motion";
import { Wand2, Sparkles, Layout, Palette, FileUp, Mic, Video, BarChart3, Monitor, MessageSquare, Smartphone, Radio, CheckCircle2, Brush, ImageIcon, Download } from "lucide-react";
import { useRef } from "react";
import { CinematicSection, ParallaxText, RevealSection } from "./shared";

const pillars = [
  {
    id: "create",
    label: "CREATE",
    icon: Wand2,
    title: "AI Builds Your Deck",
    desc: "Describe your topic and PresentQ's AI generates a complete, structured presentation — titles, content, speaker notes — in seconds. Then refine with 12+ modular block types.",
    gradient: "from-purple-600/30 to-purple-900/50 border-purple-500/20",
    iconBg: "bg-purple-500/20",
    features: [
      { icon: Sparkles, text: "AI Full Deck Generator — topic to slides in 60s" },
      { icon: Layout, text: "12+ modular block types: data, framework, CTA, story…" },
      { icon: FileUp, text: "Import PPTX/PDF, export to any format" },
      { icon: Smartphone, text: "Drag & drop canvas with free-form overlays" },
    ],
  },
  {
    id: "design",
    label: "DESIGN",
    icon: Palette,
    title: "Brand Studio & AI Logo",
    desc: "Design your visual identity without leaving PresentQ. Generate AI logos, set brand colors and fonts, curate approved visual assets, and keep every deck on-brand.",
    gradient: "from-pink-600/30 to-pink-900/50 border-pink-500/20",
    iconBg: "bg-pink-500/20",
    features: [
      { icon: Brush, text: "AI Logo Generator — describe your brand, get logo options" },
      { icon: Palette, text: "Brand Kit: colors, fonts, logo — applied everywhere" },
      { icon: ImageIcon, text: "Visual Asset Library with approved imagery" },
      { icon: Download, text: "Download logos as PNG, SVG, PDF, ICO" },
    ],
  },
  {
    id: "remix",
    label: "REMIX",
    icon: Sparkles,
    title: "AI Rewrites & Remixes",
    desc: "One-click rewrite any text. Remix slide types instantly. Smart image suggestions. Content Radar scores your readability and tone in real-time.",
    gradient: "from-blue-600/30 to-blue-900/50 border-blue-500/20",
    iconBg: "bg-blue-500/20",
    features: [
      { icon: Wand2, text: "One-Click Rewrite: formal, punchy, storytelling, data" },
      { icon: Layout, text: "Slide Remix Engine — convert any block to another type" },
      { icon: Palette, text: "Smart Image Suggestions powered by AI" },
      { icon: BarChart3, text: "Content Radar: live readability & tone scoring" },
    ],
  },
  {
    id: "perform",
    label: "PERFORM",
    icon: Video,
    title: "Record, Engage, Deliver",
    desc: "Record yourself presenting Loom-style with webcam overlay. Run live polls and Q&A with your audience. Rehearse with AI coaching and teleprompter.",
    gradient: "from-emerald-600/30 to-emerald-900/50 border-emerald-500/20",
    iconBg: "bg-emerald-500/20",
    features: [
      { icon: Video, text: "Loom-style recording with webcam PiP & slide sync" },
      { icon: BarChart3, text: "Live polls & Q&A — real-time audience engagement" },
      { icon: Monitor, text: "Teleprompter with mirror mode & floating PiP" },
      { icon: Mic, text: "AI rehearsal coaching with filler word detection" },
    ],
  },
];

const LandingPillars = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <CinematicSection>
      <section id="pillars" ref={ref} className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <ParallaxText>
            <div className="text-center mb-14">
              <span className="text-primary font-semibold text-sm mb-3 block">Three Pillars</span>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-foreground">
                Create. Design. Remix. Perform.
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
                The complete presentation lifecycle — from brand identity to standing ovation.
              </p>
            </div>
          </ParallaxText>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {pillars.map((pillar, i) => (
              <motion.div
                key={pillar.id}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.15, duration: 0.6 }}
                className={`rounded-2xl border bg-gradient-to-br ${pillar.gradient} p-6 sm:p-8 backdrop-blur-sm hover:scale-[1.02] transition-transform duration-300`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${pillar.iconBg} flex items-center justify-center`}>
                    <pillar.icon className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <span className="text-xs font-bold tracking-widest text-primary">{pillar.label}</span>
                    <h3 className="font-display font-bold text-lg text-foreground">{pillar.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">{pillar.desc}</p>
                <ul className="space-y-3">
                  {pillar.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5 text-sm text-foreground">
                      <f.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </CinematicSection>
  );
};

export default LandingPillars;
