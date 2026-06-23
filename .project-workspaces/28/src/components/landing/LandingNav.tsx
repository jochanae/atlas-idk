import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresentQLogo } from "@/components/PresentQLogo";
import ThemeDropdown from "@/components/ThemeDropdown";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const MobileMenu = ({ isOpen, onClose, navigate }: { isOpen: boolean; onClose: () => void; navigate: (path: string) => void }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="fixed inset-x-0 top-[57px] z-40 bg-card/95 backdrop-blur-xl border-b border-border p-5 space-y-3"
      >
        {[
          { label: "Features", action: () => { document.getElementById("pillars")?.scrollIntoView({ behavior: "smooth" }); onClose(); } },
          { label: "Pricing", action: () => { navigate("/pricing"); onClose(); } },
          { label: "Templates", action: () => { navigate("/templates"); onClose(); } },
          { label: "Install App", action: () => { navigate("/install"); onClose(); }, icon: true },
        ].map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className="block w-full text-left px-4 py-3 rounded-xl text-foreground hover:bg-secondary/60 transition-colors font-medium flex items-center gap-2"
          >
            {"icon" in item && item.icon && <Download className="w-4 h-4 text-primary" />}
            {item.label}
          </button>
        ))}
        <div className="pt-3 border-t border-border space-y-2">
          <Button className="w-full bg-gradient-gold text-primary-foreground font-semibold" onClick={() => { navigate("/auth"); onClose(); }}>
            Get Started
          </Button>
          <Button variant="outline" className="w-full border-border" onClick={() => { navigate("/auth"); onClose(); }}>
            Sign In
          </Button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

const LandingNav = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50"
      >
        <div className="flex items-center justify-between h-14 px-4 sm:px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-muted-foreground hover:text-foreground h-9 w-9 md:hidden flex flex-col items-center gap-0 rounded-full"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              <span className="text-[8px] leading-none">Menu</span>
            </Button>
            <motion.div whileHover={{ scale: 1.05 }}>
              <PresentQLogo size="md" showText linkTo="/" />
            </motion.div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => document.getElementById("pillars")?.scrollIntoView({ behavior: "smooth" })} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</button>
            <button onClick={() => document.getElementById("teach")?.scrollIntoView({ behavior: "smooth" })} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Teach</button>
            <button onClick={() => document.getElementById("testimonials")?.scrollIntoView({ behavior: "smooth" })} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Testimonials</button>
            <button onClick={() => navigate("/pricing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</button>
          </div>

          <div className="flex items-center gap-2">
            <ThemeDropdown buttonClassName="rounded-full text-muted-foreground hover:text-foreground h-9 w-9" />
            <Button
              size="sm"
              className="bg-gradient-gold text-primary-foreground font-semibold px-5 hover:opacity-90 shadow-md rounded-full"
              onClick={() => navigate("/auth")}
            >
              Sign In
            </Button>
          </div>
        </div>
      </motion.nav>
      <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} navigate={navigate} />
    </>
  );
};

export default LandingNav;
