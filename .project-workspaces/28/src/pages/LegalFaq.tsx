import { Link } from "react-router-dom";
import { ChevronLeft, Shield, FileText, HelpCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  { q: "What is PresentQ?", a: "PresentQ is an AI-powered presentation platform that helps you build, practice, and deliver impactful presentations. Our AI assistant Arc guides you through the entire process — from structuring your deck to coaching your delivery." },
  { q: "How does Arc help me build presentations?", a: "Arc works in four modes: Guided Build walks you step-by-step, Quick Draft generates a full deck from a single prompt, Coach Me reviews and improves existing decks, and Help Me Say It polishes your rough ideas into compelling copy." },
  { q: "Can I import existing presentations?", a: "Yes! You can import PDF, PPTX, TXT, and Markdown files up to 20MB. Choose AI-powered import for smart slide structuring or text-only for quick raw import." },
  { q: "What export formats are supported?", a: "You can export your presentations as PDF or editable PowerPoint (PPTX) files. You can also share a live web link or embed your presentation on any website." },
  { q: "Is there a teleprompter feature?", a: "Yes! PresentQ includes a built-in teleprompter you can access directly from the dashboard — no presentation required. Paste or type any script, set a countdown timer, and start scrolling. Features include adjustable scroll speed, font sizing, mirror mode for teleprompter glass setups, and a floating Picture-in-Picture overlay that stays on top of Zoom, Teams, and other apps. On mobile, use touch gestures to swipe between sections." },
  { q: "How does the AI image generation work?", a: "On any slide, use the AI image tool to describe what you want. Our AI generates professional, presentation-ready images in 10-20 seconds. You can also upload your own images." },
  { q: "Can I collaborate with my team?", a: "Yes! Invite collaborators by email with viewer or editor access. Editors can modify slides directly, while viewers can review and comment." },
  { q: "What's included in the free plan?", a: "The free plan includes unlimited presentations, basic templates, PDF export, and access to Arc's guided build mode. Pro and Team plans unlock premium templates, AI image generation, PPTX export, brand kits, and advanced analytics." },
  { q: "How do I practice my presentation?", a: "PresentQ offers Practice mode (timed run-through), Rehearsal mode (with audio recording), and Teleprompter mode (scrolling script with countdown timer). Each helps you prepare differently for your delivery." },
  { q: "Can I use the teleprompter during a Zoom call?", a: "Yes! The floating Picture-in-Picture teleprompter creates a small always-on-top window that stays visible over Zoom, Teams, Google Meet, and any other app. Click 'Pop Out' in the editor to activate it — your audience won't see it." },
  { q: "Is my data secure?", a: "Absolutely. All data is encrypted in transit and at rest. We use industry-standard security practices. Your presentations are private by default and only shared when you explicitly choose to share them." },
];

export default function LegalFaqPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto flex items-center h-14 px-4">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-16">
        {/* FAQ Section */}
        <section id="faq">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">Frequently Asked Questions</h1>
              <p className="text-sm text-muted-foreground">Everything you need to know about PresentQ</p>
            </div>
          </div>
          <Accordion type="multiple" className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-xl px-4 data-[state=open]:bg-secondary/30">
                <AccordionTrigger className="text-sm font-medium hover:no-underline py-4">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Privacy Policy */}
        <section id="privacy">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold">Privacy Policy</h2>
              <p className="text-sm text-muted-foreground">Last updated: February 2026</p>
            </div>
          </div>
          <div className="prose prose-sm prose-invert max-w-none space-y-6 text-muted-foreground">
            <div className="rounded-xl border border-border p-6 space-y-4">
              <h3 className="text-foreground font-display font-semibold text-base">1. Information We Collect</h3>
              <p>We collect information you provide when creating an account (email, name), presentation content you create, and usage analytics to improve our service. We do not sell your personal data to third parties.</p>

              <h3 className="text-foreground font-display font-semibold text-base">2. How We Use Your Information</h3>
              <p>Your data is used to provide and improve PresentQ services, personalize your experience, process transactions, and communicate service updates. AI features process your content to generate suggestions but do not store prompts beyond your session.</p>

              <h3 className="text-foreground font-display font-semibold text-base">3. Data Storage & Security</h3>
              <p>All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We use industry-standard cloud infrastructure with regular security audits. Your presentations are stored securely and accessible only to you and any collaborators you invite.</p>

              <h3 className="text-foreground font-display font-semibold text-base">4. Sharing & Disclosure</h3>
              <p>We share data only when you choose to make a presentation public, invite collaborators, or when required by law. We use analytics tools to understand usage patterns but these are anonymized.</p>

              <h3 className="text-foreground font-display font-semibold text-base">5. Your Rights</h3>
              <p>You can access, export, or delete your data at any time through your account settings. You can request a full data export or account deletion by contacting support@presentq.app.</p>

              <h3 className="text-foreground font-display font-semibold text-base">6. Cookies</h3>
              <p>We use essential cookies for authentication and session management. Optional analytics cookies help us improve the service. You can manage cookie preferences in your browser settings.</p>
            </div>
          </div>
        </section>

        {/* Terms of Service */}
        <section id="terms">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold">Terms of Service</h2>
              <p className="text-sm text-muted-foreground">Last updated: February 2026</p>
            </div>
          </div>
          <div className="prose prose-sm prose-invert max-w-none space-y-6 text-muted-foreground">
            <div className="rounded-xl border border-border p-6 space-y-4">
              <h3 className="text-foreground font-display font-semibold text-base">1. Acceptance of Terms</h3>
              <p>By accessing or using PresentQ, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services.</p>

              <h3 className="text-foreground font-display font-semibold text-base">2. Account Responsibilities</h3>
              <p>You are responsible for maintaining the security of your account credentials. You must provide accurate information when creating an account and keep it updated. You must be at least 13 years old to use PresentQ.</p>

              <h3 className="text-foreground font-display font-semibold text-base">3. Intellectual Property</h3>
              <p>You retain full ownership of all content you create on PresentQ. We do not claim rights over your presentations, images, or scripts. AI-generated content (images, text suggestions) is licensed to you for use within and outside the platform.</p>

              <h3 className="text-foreground font-display font-semibold text-base">4. Acceptable Use</h3>
              <p>You may not use PresentQ to create illegal, harmful, or misleading content. You may not attempt to reverse-engineer the platform, abuse API rate limits, or use automated tools to scrape content.</p>

              <h3 className="text-foreground font-display font-semibold text-base">5. Subscriptions & Billing</h3>
              <p>Paid plans are billed monthly or annually. You can cancel at any time; access continues until the end of your billing period. Refunds are handled on a case-by-case basis within 14 days of purchase.</p>

              <h3 className="text-foreground font-display font-semibold text-base">6. Service Availability</h3>
              <p>We strive for 99.9% uptime but do not guarantee uninterrupted service. We may perform maintenance with advance notice. We reserve the right to modify or discontinue features with reasonable notice.</p>

              <h3 className="text-foreground font-display font-semibold text-base">7. Limitation of Liability</h3>
              <p>PresentQ is provided "as is." We are not liable for any indirect, incidental, or consequential damages arising from your use of the service. Our total liability is limited to the amount you paid in the 12 months preceding any claim.</p>

              <h3 className="text-foreground font-display font-semibold text-base">8. Changes to Terms</h3>
              <p>We may update these terms with notice via email or in-app notification. Continued use after changes constitutes acceptance of the new terms.</p>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="text-center py-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Questions? Contact us at <a href="mailto:support@presentq.app" className="text-primary hover:underline">support@presentq.app</a>
          </p>
        </section>
      </main>
    </div>
  );
}
