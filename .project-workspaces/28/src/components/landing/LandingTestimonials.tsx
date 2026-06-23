import { motion, AnimatePresence } from "framer-motion";
import { Quote, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { RevealSection } from "./shared";
import testimonialSarah from "@/assets/testimonial-sarah.jpg";
import testimonialMarcus from "@/assets/testimonial-marcus.jpg";
import testimonialJennifer from "@/assets/testimonial-jennifer.jpg";
import testimonialDavid from "@/assets/testimonial-david.jpg";
import testimonialRobert from "@/assets/testimonial-robert.jpg";

const testimonials = [
  {
    quote: "Arc helped me restructure my Series B pitch in 20 minutes. The hook it suggested literally made an investor lean forward. We closed the round 3 weeks later.",
    name: "Sarah K.",
    role: "Founder & CEO, FinTech Startup",
    avatar: testimonialSarah,
    stars: 5,
  },
  {
    quote: "I used to spend hours agonizing over my slides. Now I tell Arc what I need, and it builds the narrative arc for me. My team presentations actually get applause now.",
    name: "Marcus R.",
    role: "VP of Sales, Enterprise SaaS",
    avatar: testimonialMarcus,
    stars: 5,
  },
  {
    quote: "The teleprompter + rehearsal mode combo is a game-changer. I practiced my keynote on my phone during lunch breaks and delivered it flawlessly at the conference.",
    name: "Jennifer L.",
    role: "Director of Marketing",
    avatar: testimonialJennifer,
    stars: 5,
  },
  {
    quote: "I've tried Canva, Pitch, Beautiful.ai — none of them coach you on delivery. PresentQ's Arc actually tells you when your pacing is off and suggests better transitions.",
    name: "David M.",
    role: "Product Manager, Tech Startup",
    avatar: testimonialDavid,
    stars: 5,
  },
  {
    quote: "As a board member, I sit through terrible presentations weekly. Since our portfolio companies started using PresentQ, the quality of board decks has improved dramatically.",
    name: "Robert J.",
    role: "Managing Partner, Venture Capital",
    avatar: testimonialRobert,
    stars: 5,
  },
];

const LandingTestimonials = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const goTo = (newIndex: number) => {
    setDirection(newIndex > currentIndex ? 1 : -1);
    setCurrentIndex(newIndex);
  };

  const next = () => goTo((currentIndex + 1) % testimonials.length);
  const prev = () => goTo((currentIndex - 1 + testimonials.length) % testimonials.length);

  useEffect(() => {
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [currentIndex]);

  const t = testimonials[currentIndex];

  return (
    <RevealSection>
      <section id="testimonials" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-primary font-semibold text-sm mb-3 block">Real Impact</span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-foreground">
              What People Are Saying
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
              From first-time presenters to seasoned executives — Arc meets you where you are.
            </p>
          </div>

          <div className="max-w-2xl mx-auto relative">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentIndex}
                custom={direction}
                initial={{ opacity: 0, x: direction * 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -60 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-8 sm:p-10 text-center"
              >
                <Quote className="w-8 h-8 text-primary/30 mx-auto mb-4" />
                <p className="text-foreground text-base sm:text-lg leading-relaxed mb-6 italic">
                  "{t.quote}"
                </p>
                <div className="flex items-center justify-center gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <img
                  src={t.avatar}
                  alt={t.name}
                  className="w-14 h-14 rounded-full object-cover mx-auto mb-3 border-2 border-primary/20"
                />
                <p className="font-display font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </motion.div>
            </AnimatePresence>

            <button
              onClick={prev}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 sm:-translate-x-12 w-10 h-10 rounded-full bg-secondary/80 border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 sm:translate-x-12 w-10 h-10 rounded-full bg-secondary/80 border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-center gap-2 mt-6">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === currentIndex ? "bg-primary w-6" : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </RevealSection>
  );
};

export default LandingTestimonials;
