import { useNavigate } from "react-router-dom";
import { PresentQLogo } from "@/components/PresentQLogo";

const LandingFooter = () => {
  const navigate = useNavigate();

  return (
    <footer className="border-t border-border/50 py-12 px-4 sm:px-6 bg-card/50">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <PresentQLogo size="sm" showText className="mb-3" linkTo="/" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              The AI-powered presentation platform for people who present to persuade.
            </p>
          </div>
          <div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-foreground mb-3">Product</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><button onClick={() => navigate("/auth")} className="hover:text-foreground transition-colors">Get Started</button></li>
              <li><button onClick={() => navigate("/pricing")} className="hover:text-foreground transition-colors">Pricing</button></li>
              <li><button onClick={() => navigate("/templates")} className="hover:text-foreground transition-colors">Templates</button></li>
              <li><button onClick={() => navigate("/blog")} className="hover:text-foreground transition-colors">Blog</button></li>
              <li><button onClick={() => navigate("/install")} className="hover:text-foreground transition-colors">Install App</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-foreground mb-3">Features</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="hover:text-foreground transition-colors cursor-default">AI Deck Generator</li>
              <li className="hover:text-foreground transition-colors cursor-default">Loom-Style Recording</li>
              <li className="hover:text-foreground transition-colors cursor-default">Live Polling & Q&A</li>
              <li className="hover:text-foreground transition-colors cursor-default">Arc AI Coach</li>
              <li className="hover:text-foreground transition-colors cursor-default">Teleprompter</li>
            </ul>
          </div>
          <div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-foreground mb-3">Company</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="hover:text-foreground transition-colors cursor-default">About Into Innovations</li>
              <li className="hover:text-foreground transition-colors cursor-default">Contact</li>
              <li><button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">Privacy Policy</button></li>
              <li><button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors">Terms of Service</button></li>
              <li><button onClick={() => navigate("/faq")} className="hover:text-foreground transition-colors">FAQ & Help</button></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} PresentQ
          </span>
          <span className="text-xs text-muted-foreground">Powered by Arc AI</span>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
