import { useEffect, useRef, useState, type CSSProperties } from "react";

const mono: CSSProperties = {
  fontFamily: "Inter, sans-serif",
  fontWeight: 300,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
};
const serif: CSSProperties = { fontFamily: "'Cormorant Garamond', Georgia, serif" };

type Beat = {
  eyebrow: string;
  title: string;
  body: string;
};

const BEATS: Beat[] = [
  {
    eyebrow: "Who she is",
    title: "A strategic thinking partner — not a chatbot.",
    body:
      "Joy holds the thread of what you're building so nothing important slips. Calm, direct, and honest when the plan drifts.",
  },
  {
    eyebrow: "How she works",
    title: "Think → decide → build. In that order.",
    body:
      "She explores the problem with you, names the decision, then commits it to the Ledger before a single line ships. Order is the discipline.",
  },
  {
    eyebrow: "What she refuses",
    title: "No engagement spam. No building before deciding.",
    body:
      "Joy won't flatter, won't fill silence, and won't build past an unresolved conflict. When you're about to contradict a committed intent, she stops you — briefly — and asks.",
  },
];

export function MeetJoy() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative z-10 py-28 md:py-36 px-6"
      aria-labelledby="meet-joy-heading"
    >
      {/* Top hairline */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px transition-all duration-[1.2s] ease-out"
        style={{
          width: visible ? "80%" : "0%",
          background:
            "linear-gradient(90deg, transparent, rgba(212,175,55,0.3), transparent)",
        }}
      />

      <div className="max-w-5xl mx-auto">
        <p
          className="mb-6 text-center transition-all duration-700"
          style={{
            ...mono,
            fontSize: "0.65rem",
            color: "#6b5f50",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(12px)",
          }}
        >
          05 // Meet Joy
        </p>

        <h2
          id="meet-joy-heading"
          className="text-center mb-4"
          style={{
            ...serif,
            fontWeight: 400,
            fontSize: "clamp(1.8rem, 4.4vw, 2.9rem)",
            letterSpacing: "-0.01em",
            color: "#e8dcc8",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(16px)",
            transition: "all 900ms ease-out",
          }}
        >
          Meet{" "}
          <span style={{ color: "#D4AF37", fontStyle: "italic", fontWeight: 500 }}>
            Joy
          </span>
          .
        </h2>

        <p
          className="mb-16 text-center italic mx-auto"
          style={{
            ...serif,
            fontSize: "clamp(1rem, 1.6vw, 1.15rem)",
            color: "rgba(232,220,200,0.6)",
            maxWidth: 560,
            lineHeight: 1.55,
            opacity: visible ? 1 : 0,
            transition: "opacity 900ms ease-out 200ms",
          }}
        >
          She's the voice inside Axiom. Guided, disciplined, and refuses to
          waste a decision.
        </p>

        {/* Voice sample — quiet, off-white on obsidian, gold rule */}
        <figure
          className="mx-auto mb-20"
          style={{
            maxWidth: 640,
            padding: "22px 28px",
            borderLeft: "1px solid rgba(212,175,55,0.35)",
            background: "rgba(212,175,55,0.03)",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(18px)",
            transition: "all 900ms ease-out 300ms",
          }}
        >
          <blockquote
            style={{
              ...serif,
              fontStyle: "italic",
              fontSize: "clamp(1.05rem, 2vw, 1.35rem)",
              lineHeight: 1.55,
              color: "#e8dcc8",
              margin: 0,
            }}
          >
            "Before you do — this contradicts what you committed on Tuesday.
            Want to adjust the plan, or override it on purpose?"
          </blockquote>
          <figcaption
            style={{
              ...mono,
              fontSize: "0.55rem",
              color: "rgba(212,175,55,0.55)",
              marginTop: 14,
            }}
          >
            — Joy, in the middle of a build
          </figcaption>
        </figure>

        {/* Three beats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
          }}
        >
          {BEATS.map((beat, i) => (
            <div
              key={beat.eyebrow}
              style={{
                padding: "26px 22px 28px",
                background: "rgba(5,5,5,0.6)",
                border: "1px solid rgba(212,175,55,0.1)",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(22px)",
                transition: `opacity 0.7s ease-out ${0.35 + i * 0.15}s, transform 0.7s ease-out ${0.35 + i * 0.15}s, border-color 180ms ease, background 180ms ease`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(212,175,55,0.32)";
                e.currentTarget.style.background = "rgba(212,175,55,0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(212,175,55,0.1)";
                e.currentTarget.style.background = "rgba(5,5,5,0.6)";
              }}
            >
              <p
                style={{
                  ...mono,
                  fontSize: "0.58rem",
                  color: "#D4AF37",
                  marginBottom: 14,
                }}
              >
                {beat.eyebrow}
              </p>
              <h3
                style={{
                  ...serif,
                  fontWeight: 500,
                  fontSize: "1.25rem",
                  lineHeight: 1.3,
                  color: "#e8dcc8",
                  marginBottom: 12,
                  letterSpacing: "-0.005em",
                }}
              >
                {beat.title}
              </h3>
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 300,
                  fontSize: "0.85rem",
                  lineHeight: 1.6,
                  color: "rgba(232,220,200,0.62)",
                  margin: 0,
                }}
              >
                {beat.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
