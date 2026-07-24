import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";

const mono: CSSProperties = {
  fontFamily: "Inter, sans-serif",
  fontWeight: 300,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
};
const serif: CSSProperties = { fontFamily: "'Cormorant Garamond', Georgia, serif" };
const sans: CSSProperties = { fontFamily: "Inter, sans-serif" };

type Turn = { speaker: "you" | "joy"; text: string };
type Scenario = {
  id: string;
  label: string;
  eyebrow: string;
  turns: Turn[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "build",
    label: "Build something",
    eyebrow: "A build request — reframed as a decision",
    turns: [
      { speaker: "you", text: "I want to build a Bible app but I don't know where to start." },
      { speaker: "joy", text: "Before we design anything — what's the purpose? Personal study, churches, pastors, or the public?" },
      { speaker: "you", text: "The public." },
      { speaker: "joy", text: "Good. Let's set features aside for a moment and define what someone should leave feeling after using it." },
    ],
  },
  {
    id: "decision",
    label: "Make a decision",
    eyebrow: "A committed intent — protected from drift",
    turns: [
      { speaker: "you", text: "I think I should launch next month." },
      { speaker: "joy", text: "Before you do — this contradicts what you committed on Tuesday. Want to adjust the plan, or override it on purpose?" },
      { speaker: "you", text: "Last week we said quality mattered more than speed." },
      { speaker: "joy", text: "Right. So the real question isn't the date — it's whether the quality bar has moved. Let's name that first." },
    ],
  },
  {
    id: "continue",
    label: "Continue my work",
    eyebrow: "Returning to a project — with the thread intact",
    turns: [
      { speaker: "you", text: "I haven't worked on this in three weeks." },
      { speaker: "joy", text: "Welcome back. Here's where we left off." },
      { speaker: "joy", text: "Three decisions are still unresolved. Want to walk them, or push straight into the next build?" },
    ],
  },
  {
    id: "untangle",
    label: "Untangle an idea",
    eyebrow: "A messy thought — sorted before it hardens",
    turns: [
      { speaker: "you", text: "I have ten ideas and none of them feel right." },
      { speaker: "joy", text: "Then don't pick one yet. Which of them, if it worked, would matter most a year from now?" },
      { speaker: "you", text: "Probably two of them." },
      { speaker: "joy", text: "Good. The other eight are noise for this week. Let's park them and shape those two." },
    ],
  },
  {
    id: "code",
    label: "Challenge my thinking",
    eyebrow: "A build ask — held to its own architecture",
    turns: [
      { speaker: "you", text: "Build this in React." },
      { speaker: "joy", text: "Before we generate code — let's make sure the architecture is stable enough to survive the first iteration." },
      { speaker: "joy", text: "What's the one contract we don't want to break next month?" },
    ],
  },
  {
    id: "review",
    label: "Review my plan",
    eyebrow: "A plan — pressure-tested, not applauded",
    turns: [
      { speaker: "you", text: "Here's my plan for the next two weeks." },
      { speaker: "joy", text: "It's clean. Two things worry me: step three assumes the auth work is done, and there's no room for the decision you're still holding open on pricing." },
      { speaker: "joy", text: "Do you want to resolve pricing first, or plan around it as unknown?" },
    ],
  },
];

const TYPE_SPEED = 14; // ms/char for Joy
const YOU_SPEED = 22;   // ms/char for user
const TURN_PAUSE = 380; // pause between turns

export function SeeJoyInAction() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState(SCENARIOS[0].id);
  const [, setLocation] = useLocation();

  const active = useMemo(
    () => SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0],
    [activeId],
  );

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

  const handleEnter = () => {
    try { sessionStorage.setItem("atlas-from-landing", "1"); } catch {}
    setLocation("/login");
  };

  return (
    <section
      ref={ref}
      className="relative z-10 py-24 md:py-32 px-6"
      aria-labelledby="see-joy-heading"
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px transition-all duration-[1.2s] ease-out"
        style={{
          width: visible ? "80%" : "0%",
          background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.28), transparent)",
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
          06 // See Joy in action
        </p>

        <h2
          id="see-joy-heading"
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
          See{" "}
          <span style={{ color: "#D4AF37", fontStyle: "italic", fontWeight: 500 }}>Joy think</span>.
        </h2>

        <p
          className="mb-12 text-center italic mx-auto"
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
          Pick a conversation starter. Watch what she does with it.
        </p>

        {/* Topic pills */}
        <div
          className="flex flex-wrap gap-2 justify-center mb-8"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(12px)",
            transition: "all 800ms ease-out 300ms",
          }}
        >
          {SCENARIOS.map((s) => {
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                style={{
                  ...mono,
                  fontSize: "0.6rem",
                  color: isActive ? "#050505" : "rgba(232,220,200,0.72)",
                  background: isActive ? "#D4AF37" : "transparent",
                  border: `1px solid ${isActive ? "#D4AF37" : "rgba(212,175,55,0.28)"}`,
                  padding: "8px 14px",
                  borderRadius: 999,
                  cursor: "pointer",
                  transition: "all 160ms ease",
                }}
                onMouseEnter={(e) => {
                  if (isActive) return;
                  e.currentTarget.style.borderColor = "rgba(212,175,55,0.6)";
                  e.currentTarget.style.background = "rgba(212,175,55,0.06)";
                }}
                onMouseLeave={(e) => {
                  if (isActive) return;
                  e.currentTarget.style.borderColor = "rgba(212,175,55,0.28)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Conversation panel */}
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "26px 22px 28px",
            background: "rgba(5,5,5,0.72)",
            border: "1px solid rgba(212,175,55,0.14)",
            borderRadius: 4,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(18px)",
            transition: "all 900ms ease-out 400ms",
          }}
        >
          <p
            style={{
              ...mono,
              fontSize: "0.55rem",
              color: "rgba(212,175,55,0.6)",
              marginBottom: 18,
            }}
          >
            {active.eyebrow}
          </p>

          <ConversationPlayer key={active.id} scenario={active} />

          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: "1px solid rgba(212,175,55,0.08)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={handleEnter}
              style={{
                ...mono,
                fontSize: "0.62rem",
                color: "#D4AF37",
                background: "transparent",
                border: "none",
                padding: "6px 2px",
                cursor: "pointer",
                letterSpacing: "0.18em",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#F5D97A"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#D4AF37"; }}
            >
              Continue this conversation with Joy →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Typing player ─── */
function ConversationPlayer({ scenario }: { scenario: Scenario }) {
  const [turnIndex, setTurnIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    setTurnIndex(0);
    setCharIndex(0);
  }, [scenario.id]);

  useEffect(() => {
    const turn = scenario.turns[turnIndex];
    if (!turn) return;
    if (charIndex < turn.text.length) {
      const speed = turn.speaker === "joy" ? TYPE_SPEED : YOU_SPEED;
      const t = window.setTimeout(() => setCharIndex((c) => c + 1), speed);
      return () => window.clearTimeout(t);
    }
    if (turnIndex < scenario.turns.length - 1) {
      const t = window.setTimeout(() => {
        setTurnIndex((i) => i + 1);
        setCharIndex(0);
      }, TURN_PAUSE);
      return () => window.clearTimeout(t);
    }
    return;
  }, [scenario, turnIndex, charIndex]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {scenario.turns.map((turn, i) => {
        if (i > turnIndex) return null;
        const shown = i === turnIndex ? turn.text.slice(0, charIndex) : turn.text;
        const isTyping = i === turnIndex && charIndex < turn.text.length;
        return (
          <TurnRow key={i} turn={turn} text={shown} typing={isTyping} />
        );
      })}
    </div>
  );
}

function TurnRow({ turn, text, typing }: { turn: Turn; text: string; typing: boolean }) {
  const isJoy = turn.speaker === "joy";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          ...mono,
          fontSize: "0.5rem",
          color: isJoy ? "rgba(212,175,55,0.7)" : "rgba(232,220,200,0.38)",
        }}
      >
        {isJoy ? "Joy" : "You"}
      </span>
      <p
        style={{
          ...(isJoy ? serif : sans),
          fontSize: isJoy ? "clamp(1rem, 1.8vw, 1.15rem)" : "0.92rem",
          fontStyle: isJoy ? "italic" : "normal",
          fontWeight: isJoy ? 500 : 400,
          color: isJoy ? "#e8dcc8" : "rgba(232,220,200,0.72)",
          lineHeight: 1.55,
          margin: 0,
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
        {typing && (
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 7,
              height: "1em",
              marginLeft: 3,
              verticalAlign: "-2px",
              background: isJoy ? "rgba(212,175,55,0.7)" : "rgba(232,220,200,0.5)",
              animation: "joyCaret 0.9s steps(1) infinite",
            }}
          />
        )}
      </p>
      <style>{`@keyframes joyCaret { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }`}</style>
    </div>
  );
}
