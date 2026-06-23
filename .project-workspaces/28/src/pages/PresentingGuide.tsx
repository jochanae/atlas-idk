import { Monitor, Smartphone, Laptop, Mic, Eye, Layout, ChevronRight, Airplay, Video, PictureInPicture2, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";

const setups = [
  {
    id: "two-device",
    title: "Two-Device Setup (Recommended)",
    subtitle: "Laptop for slides · Phone for teleprompter",
    badge: "Best Experience",
    badgeColor: "bg-emerald-500/15 text-emerald-500",
    icon: Laptop,
    steps: [
      "Open your presentation in PresentQ on your laptop and enter Presenter Mode (or share your screen via Zoom/Teams).",
      "On your phone, open PresentQ (PWA) and navigate to the Teleprompter.",
      "Load your speaker notes from the presentation using 'Choose a presentation…'.",
      "Enable Voice Follow — the teleprompter scrolls as you speak into your phone's microphone.",
      "Position your phone just below your webcam or monitor for natural eye contact.",
    ],
    tips: [
      "Place your phone in a stand at eye level near your camera for natural gaze.",
      "Use a Bluetooth earpiece if you need audio monitoring.",
      "Voice Follow works best in a quiet environment — mute your laptop mic if on Zoom.",
    ],
  },
  {
    id: "pip",
    title: "Picture-in-Picture (Single Screen)",
    subtitle: "Floating teleprompter overlay on your desktop",
    badge: "Zoom / Teams",
    badgeColor: "bg-blue-500/15 text-blue-500",
    icon: PictureInPicture2,
    steps: [
      "Open the Teleprompter in PresentQ and load your script.",
      "Start the teleprompter — it runs in a dedicated fullscreen view.",
      "In Zoom/Teams, share only your presentation window (not your entire screen).",
      "The teleprompter runs in a separate browser tab that stays on top — invisible to your audience.",
      "Use PiP mode in your browser (right-click video → Picture in Picture) for a floating overlay.",
    ],
    tips: [
      "In Zoom: Share → Window → select only your slide deck window.",
      "In Teams: Share → Window → pick the slide window specifically.",
      "The teleprompter tab will NOT be shared since you're sharing a specific window.",
      "Use Alt+Tab (Cmd+Tab on Mac) to quickly switch between windows.",
    ],
  },
  {
    id: "mobile-only",
    title: "Mobile-Only Presenting",
    subtitle: "Present from your phone or tablet",
    badge: "In-Person",
    badgeColor: "bg-purple-500/15 text-purple-500",
    icon: Smartphone,
    steps: [
      "Install the PresentQ PWA from the /install page for the best experience.",
      "Open your presentation and use Presenter Remote to control slides.",
      "The remote shows current + next slide previews, speaker notes, and a timer.",
      "Connect your phone to a projector/TV via AirPlay, Chromecast, or cable.",
      "Navigate slides with the large Prev/Next buttons — haptic feedback confirms each tap.",
    ],
    tips: [
      "Lock your phone orientation to portrait for the remote control view.",
      "Enable 'Do Not Disturb' to prevent notifications during your presentation.",
      "The screen stays awake automatically — no need to adjust settings.",
    ],
  },
  {
    id: "hybrid",
    title: "Hybrid: Remote + Teleprompter",
    subtitle: "Use two browser tabs on your phone",
    badge: "Advanced",
    badgeColor: "bg-amber-500/15 text-amber-500",
    icon: Layout,
    steps: [
      "Open PresentQ on your phone and go to Presenter Remote to control slides on your laptop.",
      "Open a second tab and load the Teleprompter with your script.",
      "Switch between tabs as needed — both maintain their state.",
      "Or use a tablet for the teleprompter and your phone for the remote.",
    ],
    tips: [
      "On iPad: use Split View to show both the remote and teleprompter side-by-side.",
      "On Android tablets: use split-screen mode for the same effect.",
    ],
  },
];

const zoomTips = [
  { title: "Share Specific Window", desc: "Always share a specific window (your slide deck) rather than your entire screen. This hides the teleprompter, notes, and other tools from your audience.", icon: Monitor },
  { title: "Camera Position", desc: "Place your teleprompter (phone or floating window) as close to your webcam as possible. This creates natural eye contact with your audience.", icon: Eye },
  { title: "Audio Setup", desc: "If using Voice Follow on your phone, mute your laptop's mic in Zoom to avoid echo. Zoom will use your laptop mic; Voice Follow uses your phone mic.", icon: Mic },
  { title: "Test Before Going Live", desc: "Do a practice run: start a solo Zoom meeting, share your window, and verify the teleprompter isn't visible. Record yourself to check eye contact.", icon: Video },
];

export default function PresentingGuide() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Airplay className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Presenting Guide</h1>
              <p className="text-sm text-muted-foreground">How to present with PresentQ over Zoom, Teams, or in-person</p>
            </div>
          </div>
        </motion.div>

        {/* Quick links */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/teleprompter")}>
            <Monitor className="w-3.5 h-3.5" /> Open Teleprompter
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/remote")}>
            <Smartphone className="w-3.5 h-3.5" /> Open Remote
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/install")}>
            <ExternalLink className="w-3.5 h-3.5" /> Install PWA
          </Button>
        </div>

        {/* Setup options */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold font-display">Choose Your Setup</h2>
          {setups.map((setup, idx) => (
            <motion.div
              key={setup.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="border-border bg-card overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <setup.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{setup.title}</CardTitle>
                        <Badge className={`text-[10px] ${setup.badgeColor}`}>{setup.badge}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{setup.subtitle}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <ol className="space-y-2">
                    {setup.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                          {i + 1}
                        </span>
                        <span className="text-muted-foreground leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                  {setup.tips.length > 0 && (
                    <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pro Tips</p>
                      {setup.tips.map((tip, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <ChevronRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                          {tip}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Zoom/Teams specific tips */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold font-display">Zoom & Teams Tips</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {zoomTips.map((tip, i) => (
              <motion.div
                key={tip.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
              >
                <Card className="border-border bg-card h-full">
                  <CardContent className="p-4 flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <tip.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">{tip.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{tip.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Quick checklist */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-bold flex items-center gap-2">
              ✅ Pre-Presentation Checklist
            </p>
            {[
              "Script loaded into teleprompter",
              "Voice Follow tested (speak a few words)",
              "Screen sharing set to 'Window' not 'Entire Screen'",
              "Phone on Do Not Disturb",
              "Phone in stand near webcam",
              "Backup: script printed or on tablet",
            ].map((item, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="w-4 h-4 rounded border border-primary/30 shrink-0" />
                {item}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
