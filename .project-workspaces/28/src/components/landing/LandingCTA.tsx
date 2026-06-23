import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { CinematicSection } from "./shared";

const LandingCTA = () => {
  const navigate = useNavigate();

  return (
    <CinematicSection>
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-8 sm:p-10 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 blur-3xl" />
            <div className="relative z-10">
              <h3 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
                Your Brand. Your Deck. Your Stage.
              </h3>
              <p className="text-white/80 text-sm sm:text-base mb-6 max-w-lg mx-auto">
                Join the creators, founders, and leaders who design their brand, build with AI, record with confidence, and engage their audience — all in one studio.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  className="bg-white text-gray-900 font-display font-semibold hover:bg-white/90 rounded-xl shadow-xl"
                  onClick={() => navigate("/auth")}
                >
                  Get Started — It's Free
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/40 text-white font-display hover:bg-white/10 rounded-xl"
                  onClick={() => navigate("/auth")}
                >
                  Sign In
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </CinematicSection>
  );
};

export default LandingCTA;
