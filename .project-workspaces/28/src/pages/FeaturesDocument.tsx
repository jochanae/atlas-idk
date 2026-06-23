import { useState } from "react";
import { Download, FileText, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const FEATURES_DOC = `
══════════════════════════════════════════════════════════════
  PRESENTQ — COMPLETE FEATURES & CAPABILITIES GUIDE
  Generated: ${new Date().toLocaleDateString()}
══════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. AI-POWERED CREATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• AI Full Deck Generator — Describe your topic and get a complete, structured presentation in seconds. Powered by Gemini 2.5 Pro with built-in validation and repair logic.

• Arc AI Assistant — Your always-on presentation co-pilot. Available in 5 modes:
    - General: Open-ended brainstorming and Q&A
    - Coach: Delivery feedback, pacing advice, filler word detection
    - Writer: Script drafting, rewriting, tone adjustment
    - Designer: Theme suggestions, layout recommendations, visual polish
    - Analyst: Audience insights, content scoring, readability metrics

• One-Click Rewrite — Highlight any text and instantly rewrite it in different styles (concise, persuasive, storytelling, executive summary, etc.)

• Auto-Suggest Next Slide — AI predicts and generates the next logical slide based on your deck's narrative arc.

• Smart Image Suggestions — AI recommends relevant, on-brand images for any slide.

• Quick Capture — Snap a photo or record a voice memo and AI converts it into a formatted slide.

• Slide Remix Engine — Transform any slide into a different block type (e.g., bullet list → infographic, text → timeline).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2. SLIDE EDITOR & DESIGN SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• 12 Block Types — Title, Bullets, Image, Quote, Stats, Timeline, Comparison, Team, Pricing, Video, Code, and Custom.

• 10 Built-in Themes — Independent from app dark/light mode:
    LIGHT: Clean White, Warm Coral, Sunset, Minimal
    DARK: Midnight Gold, Deep Navy, Ocean, Royal Purple, Forest, Charcoal Amber

• Brand Kit Manager — Save and apply your brand's colors, fonts, and logo across all decks.

• Modular Block System — Drag-and-drop, reorder, and nest content blocks.

• Contextual Toolbar — Morphing action bar that adapts to what you're editing.

• Content Radar — Real-time readability, tone, and complexity metrics displayed as you type.

• Slide DNA™ — A visual ribbon showing the tone, pacing, and energy of each slide at a glance.

• Version History — Full slide-level version tracking with restore capability.

• Slide Comments — Collaborative commenting with resolve/unresolve workflow.

• Saved Blocks Library — Save and reuse your best slide designs across presentations.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3. PRESENTING & DELIVERY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Presenter Mode — Full-screen presenting with speaker notes, timer, and slide preview.

• Teleprompter — Scrolling script display with delivery cue badges:
    [PAUSE], [BREATHE], [SLOW DOWN], [EMPHASIZE], [LOOK UP], [RECOVERY]
    Includes 6 background themes (Black, Charcoal, Navy, Forest, Cream, White) with adaptive contrast.

• Voice Follow 2.0 — Teleprompter auto-scrolls by listening to your voice using fuzzy word matching. Dual-tier speech recognition (ElevenLabs Scribe + Web Speech API fallback). Includes a confidence HUD indicator and auto-start support.

• Teleprompter Presentation Linking — Load speaker notes directly from any presentation into the teleprompter with one click. Notes are aggregated per slide with section markers.

• Copy to Teleprompter — One-click button in the slide editor to send speaker notes directly to the teleprompter.

• Picture-in-Picture (PiP) Teleprompter — Floating teleprompter overlay so you can see your script while sharing your screen (desktop).

• Presenter Remote 2.0 — Use your phone as a wireless presenter remote with:
    - Current + next slide previews
    - Speaker notes display
    - Live viewer count and unanswered Q&A tracking
    - Haptic feedback on navigation
    - Persistent timer with pause/reset
    - Screen wake-lock to prevent sleep

• Presenting Guide — In-app guide for presenting over Zoom, Teams, or in-person. Covers 4 setups:
    - Two-Device (laptop + phone teleprompter)
    - Picture-in-Picture (single screen)
    - Mobile-Only (phone as controller)
    - Hybrid (remote + teleprompter)
    Includes pre-presentation checklist and Zoom/Teams-specific tips.

• Presentation Recording — Loom-style recording with camera + screen capture, slide timestamps, and playback.

• Lower Thirds — Broadcast-style name/title overlays during presentations.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4. REHEARSAL & COACHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Rehearsal Mode — Practice your presentation with full timing, slide-by-slide pacing, and audio recording.

• AI Coaching Reports — Post-rehearsal analysis including:
    - Overall delivery score
    - Words-per-minute tracking
    - Filler word detection and count
    - Pacing analysis per slide
    - Strengths and improvement areas

• Live Delivery Feedback — Real-time coaching while you rehearse (pace alerts, filler word warnings).

• AI Improvement Plan — Personalized multi-session improvement roadmap based on your coaching history.

• Rehearsal Debrief — AI-generated summary after each practice session with actionable tips.

• Speaker Script Document — Print-ready, formatted script document with all speaker notes and delivery cues.

• Delivery Prep Panel — Pre-presentation preparation checklist with timing estimates and key talking points per slide.

• Audience Reaction Simulator™ — Simulated real-time emoji reactions to preview audience engagement before going live.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  5. LIVE AUDIENCE ENGAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Live Polling — Create and launch polls during presentations:
    - Multiple choice
    - Yes/No
    - Rating scale
    - Word Cloud

• Live Q&A — Audience members submit questions in real-time with upvoting. Presenters can pin, answer, or dismiss.

• Pulse Check — Quick sentiment checks during your presentation to gauge audience energy.

• Live Reactions — Real-time emoji reactions from the audience displayed on-screen.

• Audience Resources Portal — Share downloadable files, links, and materials with your audience per-presentation.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  6. ANALYTICS & INSIGHTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Viewer Analytics — Track total views, unique viewers, and average time spent per presentation.

• Engagement Heatmap — See which slides get the most attention and where viewers drop off.

• Slide-Level Metrics — Views, average time, and engagement score per slide.

• Arc Insights Panel — AI-powered analysis of your analytics data with recommendations.

• Export Analytics — Download analytics reports as CSV files.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  7. COLLABORATION & TEAMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Team Workspaces — Create teams, invite members, and share presentations.

• Real-Time Collaboration — Multiple users can edit the same presentation simultaneously with live presence indicators.

• Role-Based Access — Owner, Editor, and Viewer roles for shared presentations.

• Team Activity Feed — See what your team members are working on.

• Slide Comments — Threaded comments on individual slides with resolve workflow.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  8. EXPORT & SHARING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• PowerPoint Export (.pptx) — Native PPTX generation using pptxgenjs.

• PDF Export — High-resolution PDF generation with slide rendering.

• Print Suite — Specialized print layouts:
    - Speaker Notes (slides + full scripts)
    - Audience Handouts

• Public Sharing — Generate shareable links for anyone to view your presentation.

• Embed Mode — Embed presentations on external websites.

• Speaker Script Download — Export your complete speaker script as a .txt file.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  9. FOLLOW-UP & LEAD GENERATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Follow-Up Hub — Manage post-presentation communication with email templates.

• Lead Magnets — Gate downloadable resources behind email capture forms.

• Download Gates — Require email/name before allowing resource downloads.

• Scheduling Links — Attach Calendly/booking links to presentations.

• Presentation CTAs — Add clickable call-to-action buttons to your shared decks.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10. CONTENT MARKETPLACE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Template Gallery — Browse and use community-created slide templates.

• Community Templates — Share your best templates with other PresentQ users.

• Template Ratings & Reviews — Rate and review templates from the community.

• Premium Templates — Access exclusive templates with a Pro subscription.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  11. PLATFORM & MOBILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Progressive Web App (PWA) — Install PresentQ on any device for offline access.

• Native App Support (Capacitor) — iOS and Android native builds via Capacitor for App Store / Play Store publishing.

• Mobile-Optimized Editor — Responsive design with swipe navigation and touch-friendly controls.

• Mobile Rehearsal Mode — Practice presentations on the go from your phone.

• Dark/Light Mode — App-wide theme toggle (independent from slide themes).

• Global Search — Search across all presentations, slides, and content.

• Notification Center — Stay updated on collaboration activity, comments, and team events.

• Referral Program — Invite others and earn rewards.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  12. INTEGRATIONS & AI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• ElevenLabs Voice — Premium text-to-speech for script preview and voice interactions.

• Stripe Billing — Subscription management with Free, Pro, and Team tiers.

• Import from PowerPoint — Upload existing .pptx files and convert them to PresentQ format.

• Arc Voice Mode — Hands-free voice interaction with Arc AI using ElevenLabs text-to-speech and speech-to-text.

• Smart Transitions — AI-powered motion and transition suggestions between slides.

• Content Intelligence — AI-powered content analysis and optimization suggestions.

• Auto-Tag Slides — AI automatically categorizes and tags your slides for easy searching.


══════════════════════════════════════════════════════════════
  © PresentQ — The Presentation Intelligence Platform
══════════════════════════════════════════════════════════════
`.trim();

const sections = [
  { title: "AI-Powered Creation", count: 7, icon: "🤖" },
  { title: "Slide Editor & Design", count: 11, icon: "🎨" },
  { title: "Presenting & Delivery", count: 11, icon: "🎤" },
  { title: "Rehearsal & Coaching", count: 8, icon: "🏋️" },
  { title: "Live Audience Engagement", count: 5, icon: "📊" },
  { title: "Analytics & Insights", count: 5, icon: "📈" },
  { title: "Collaboration & Teams", count: 5, icon: "👥" },
  { title: "Export & Sharing", count: 6, icon: "📤" },
  { title: "Follow-Up & Lead Gen", count: 5, icon: "🎯" },
  { title: "Content Marketplace", count: 4, icon: "🏪" },
  { title: "Platform & Mobile", count: 8, icon: "📱" },
  { title: "Integrations & AI", count: 7, icon: "🔌" },
];

const totalFeatures = sections.reduce((sum, s) => sum + s.count, 0);

export default function FeaturesDocument() {
  const navigate = useNavigate();
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = () => {
    const blob = new Blob([FEATURES_DOC], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "PresentQ_Features_Guide.txt";
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    toast.success("Features guide downloaded!");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-16">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-6 gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <div className="text-center mb-10">
          <FileText className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">PresentQ Features Guide</h1>
          <p className="text-muted-foreground">
            {totalFeatures} features across {sections.length} categories
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <Button size="lg" onClick={handleDownload} className="gap-2">
            <Download className="w-5 h-5" />
            {downloaded ? "Download Again" : "Download Features Guide (.txt)"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sections.map((s) => (
            <div key={s.title} className="border border-border rounded-lg p-4 bg-card/50">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{s.icon}</span>
                <span className="font-semibold text-sm">{s.title}</span>
              </div>
              <span className="text-xs text-muted-foreground">{s.count} features</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
