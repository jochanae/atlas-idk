import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FloatingOrb } from "@/components/landing/shared";
import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import LandingPainPoint from "@/components/landing/LandingPainPoint";
import LandingPillars from "@/components/landing/LandingPillars";
import LandingDeepDive from "@/components/landing/LandingDeepDive";
import LandingTestimonials from "@/components/landing/LandingTestimonials";
import LandingComparison from "@/components/landing/LandingComparison";
import LandingTeach from "@/components/landing/LandingTeach";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";

const Index = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAuthenticated(!!session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-hidden transition-colors duration-500">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <FloatingOrb delay={0} size={500} x="10%" y="10%" />
        <FloatingOrb delay={2} size={400} x="70%" y="30%" />
        <FloatingOrb delay={4} size={350} x="30%" y="60%" />
        <FloatingOrb delay={1} size={300} x="80%" y="70%" />
      </div>

      {/* 1. Navigation */}
      <LandingNav />

      {/* 2. Hero — Build. Record. Engage. */}
      <LandingHero />

      {/* 3. Pain Point — Presentations Are Broken */}
      <LandingPainPoint />

      {/* 4. Three Pillars — Create, Remix, Perform */}
      <LandingPillars />

      {/* 5. Deep Dive — Arc in Action + Slide DNA */}
      <LandingDeepDive />

      {/* 6. Social Proof — Testimonials */}
      <LandingTestimonials />

      {/* 7. Teach with presentQ */}
      <LandingTeach />

      {/* 8. Comparison Table */}
      <LandingComparison />

      {/* 8. Final CTA */}
      <LandingCTA />

      {/* 9. Footer */}
      <LandingFooter />
    </div>
  );
};

export default Index;
