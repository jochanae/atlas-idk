import { CheckCircle2, X, Minus } from "lucide-react";
import { CinematicSection, ParallaxText } from "./shared";

type Support = true | false | "partial";

interface ComparisonRow {
  feature: string;
  presentq: Support;
  canva: Support;
  pitch: Support;
  beautifulai: Support;
}

const rows: ComparisonRow[] = [
  { feature: "AI Full Deck Generator", presentq: true, canva: "partial", pitch: false, beautifulai: "partial" },
  { feature: "AI Logo Generator", presentq: true, canva: "partial", pitch: false, beautifulai: false },
  { feature: "Brand Kit & Visual Assets", presentq: true, canva: true, pitch: "partial", beautifulai: false },
  { feature: "Drag & Drop Canvas", presentq: true, canva: true, pitch: true, beautifulai: false },
  { feature: "Loom-Style Recording", presentq: true, canva: false, pitch: false, beautifulai: false },
  { feature: "Live Polling & Q&A", presentq: true, canva: false, pitch: false, beautifulai: false },
  { feature: "AI Presentation Coach", presentq: true, canva: false, pitch: false, beautifulai: false },
  { feature: "Built-in Teleprompter", presentq: true, canva: false, pitch: false, beautifulai: false },
  { feature: "Content Marketplace", presentq: true, canva: true, pitch: false, beautifulai: false },
  { feature: "Modular Block System", presentq: true, canva: false, pitch: true, beautifulai: true },
  { feature: "Team Collaboration", presentq: true, canva: true, pitch: true, beautifulai: true },
  { feature: "PPTX Export", presentq: true, canva: true, pitch: true, beautifulai: true },
];

const plusMoreItems = [
  "Voice-Follow Teleprompter",
  "Rehearsal Mode + AI Debrief",
  "Lecture Mode™ with Webcam PiP",
  "Slide DNA™ Visual Fingerprint",
  "Presenter Remote",
  "Engagement Heatmaps",
  "Follow-Up Hub",
  "Audience Resource Sharing",
  "Quick Capture (Photo → Slide)",
  "AI Script Coaching",
  "Slide Remix Engine",
  "Content Radar™",
  "Smart Transitions",
  "Version History",
];

const SupportIcon = ({ value }: { value: Support }) => {
  if (value === true) return <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-400" />;
  if (value === "partial") return <Minus className="w-5 h-5 mx-auto text-amber-400" />;
  return <X className="w-5 h-5 text-muted-foreground/30 mx-auto" />;
};

const LandingComparison = () => (
  <CinematicSection>
    <section className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <ParallaxText>
          <div className="text-center mb-12">
            <span className="text-primary font-semibold text-sm mb-3 block">Why PresentQ?</span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-foreground">
              Not Another Slide Maker
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
              Other tools help you design slides. PresentQ helps you <strong className="text-foreground">deliver the message</strong>.
            </p>
          </div>
        </ParallaxText>

        <div className="rounded-2xl border border-border overflow-hidden bg-card/50 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 sm:px-6 py-4 text-muted-foreground font-medium">Feature</th>
                  <th className="px-3 sm:px-5 py-4 text-center">
                    <span className="font-display font-bold text-primary">PresentQ</span>
                  </th>
                  <th className="px-3 sm:px-5 py-4 text-center text-muted-foreground">Canva</th>
                  <th className="px-3 sm:px-5 py-4 text-center text-muted-foreground">Pitch</th>
                  <th className="px-3 sm:px-5 py-4 text-center text-muted-foreground hidden sm:table-cell">Beautiful.ai</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.feature} className={`border-b border-border/50 ${i % 2 === 0 ? "bg-secondary/20" : ""}`}>
                    <td className="px-4 sm:px-6 py-3 font-medium text-foreground">{row.feature}</td>
                    <td className="px-3 sm:px-5 py-3 text-center"><SupportIcon value={row.presentq} /></td>
                    <td className="px-3 sm:px-5 py-3 text-center"><SupportIcon value={row.canva} /></td>
                    <td className="px-3 sm:px-5 py-3 text-center"><SupportIcon value={row.pitch} /></td>
                    <td className="px-3 sm:px-5 py-3 text-center hidden sm:table-cell"><SupportIcon value={row.beautifulai} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 sm:px-6 py-3 border-t border-border/50 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Full</span>
            <span className="flex items-center gap-1"><Minus className="w-3.5 h-3.5 text-amber-400" /> Partial</span>
            <span className="flex items-center gap-1"><X className="w-3.5 h-3.5 text-muted-foreground/30" /> None</span>
          </div>

          {/* Plus More ticker */}
          <div className="border-t border-border bg-primary/5 py-4 overflow-hidden">
            <p className="text-xs text-primary font-semibold text-center mb-3 tracking-wide uppercase">
              Plus more — on PresentQ
            </p>
            <div className="relative">
              <div className="flex gap-4 animate-marquee whitespace-nowrap">
                {[...plusMoreItems, ...plusMoreItems].map((item, i) => (
                  <span
                    key={`${item}-${i}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-4 bg-primary/5 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              PresentQ is the only platform that combines <strong className="text-foreground">AI deck + logo generation, brand studio, recording, live engagement + coaching</strong> in one product.
            </p>
          </div>
        </div>
      </div>
    </section>
  </CinematicSection>
);

export default LandingComparison;
