import { useState, useEffect } from "react";

type Props = {
  /** Whether this is a first-time user (no sessions yet) */
  show: boolean;
  userName?: string | null;
  onComplete: () => void;
  onStartSession: (mode: string) => void;
};

const STEPS = [
  {
    title: "Welcome to Atlas",
    description: "Your AI-guided code builder. Atlas helps you think, build, and ship — all from a single conversation.",
    icon: (
      <svg viewBox="0 0 32 32" width={32} height={32} fill="none" stroke="var(--accent-gold)" strokeWidth={1.2}>
        <circle cx="16" cy="16" r="14" />
        <path d="M16 8v8l5.5 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Converse to Build",
    description: "Type naturally or use /build to generate React components instantly. Atlas writes production-ready code from your ideas.",
    icon: (
      <svg viewBox="0 0 32 32" width={32} height={32} fill="none" stroke="var(--phosphor)" strokeWidth={1.2}>
        <path d="M6 24V8a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H10l-4 4z" strokeLinejoin="round" />
        <path d="M12 14h8M12 18h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Live Preview",
    description: "See your components render in real-time. Toggle between chat, code, and preview with the footer bridge.",
    icon: (
      <svg viewBox="0 0 32 32" width={32} height={32} fill="none" stroke="var(--ember)" strokeWidth={1.2}>
        <rect x="4" y="6" width="24" height="16" rx="2" />
        <path d="M4 22h24M12 22v4M20 22v4M10 26h12" strokeLinecap="round" />
        <path d="M11 14l-3 2 3 2M21 14l3 2-3 2M15 18l2-8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Your Architectural Ledger",
    description: "Every decision gets tracked. Committed entries become your project's memory — Atlas never forgets what you've decided.",
    icon: (
      <svg viewBox="0 0 32 32" width={32} height={32} fill="none" stroke="var(--accent-gold)" strokeWidth={1.2}>
        <path d="M8 4h16a2 2 0 012 2v20l-5-3-5 3-5-3-5 3V6a2 2 0 012-2z" strokeLinejoin="round" />
        <path d="M12 10h8M12 14h6M12 18h4" strokeLinecap="round" />
      </svg>
    ),
  },
];

const QUICK_STARTS = [
  { label: "Think through an idea", mode: "think", color: "var(--ember)" },
  { label: "Build a component", mode: "build", color: "var(--phosphor)" },
  { label: "Explore a concept", mode: "explore", color: "var(--accent-gold)" },
];

export function OnboardingFlow({ show, userName, onComplete, onStartSession }: Props) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  // Check local storage for completed onboarding
  const STORAGE_KEY = "atlas-onboarding-complete";
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    if (dismissed) onComplete();
  }, [dismissed, onComplete]);

  if (!show || dismissed) return null;

  const isLast = step === STEPS.length;
  const current = STEPS[step];

  const finish = () => {
    setExiting(true);
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
    setTimeout(onComplete, 300);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
        opacity: exiting ? 0 : 1,
        transition: "opacity 300ms ease",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "var(--surface)",
          border: "0.5px solid var(--glass-border)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Progress dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            padding: "20px 24px 0",
          }}
        >
          {[...STEPS, null].map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 24 : 6,
                height: 6,
                borderRadius: 3,
                background:
                  i === step
                    ? "var(--accent-gold)"
                    : i < step
                      ? "color-mix(in oklab, var(--accent-gold) 40%, transparent)"
                      : "var(--border)",
                transition: "all 300ms ease",
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "32px 32px 24px", textAlign: "center" }}>
          {isLast ? (
            /* Quick start screen */
            <>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  color: "var(--foreground)",
                  marginBottom: 8,
                  letterSpacing: "-0.01em",
                }}
              >
                Ready{userName ? `, ${userName}` : ""}?
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--muted-text)",
                  lineHeight: 1.6,
                  marginBottom: 28,
                }}
              >
                Pick a starting point — or just type anything.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {QUICK_STARTS.map((qs) => (
                  <button
                    key={qs.mode}
                    onClick={() => {
                      finish();
                      onStartSession(qs.mode);
                    }}
                    style={{
                      padding: "12px 20px",
                      borderRadius: 10,
                      background: "color-mix(in oklab, var(--surface-alt) 80%, transparent)",
                      border: `0.5px solid color-mix(in oklab, ${qs.color} 25%, transparent)`,
                      color: "var(--foreground)",
                      fontSize: 13,
                      fontFamily: "var(--font-sans)",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: "all 180ms ease",
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: qs.color,
                        flexShrink: 0,
                      }}
                    />
                    {qs.label}
                    <svg
                      viewBox="0 0 16 16"
                      width={12}
                      height={12}
                      stroke="var(--muted-text)"
                      fill="none"
                      strokeWidth={1.5}
                      style={{ marginLeft: "auto" }}
                    >
                      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>{current.icon}</div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 500,
                  color: "var(--foreground)",
                  marginBottom: 10,
                  letterSpacing: "-0.01em",
                }}
              >
                {current.title}
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--muted-text)",
                  lineHeight: 1.7,
                  maxWidth: 320,
                  margin: "0 auto",
                }}
              >
                {current.description}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 24px 20px",
          }}
        >
          <button
            onClick={finish}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              cursor: "pointer",
              opacity: 0.6,
            }}
          >
            Skip
          </button>
          {!isLast && (
            <button
              onClick={() => setStep((s) => s + 1)}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                background: "var(--accent-gold)",
                border: "none",
                color: "var(--background)",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
                cursor: "pointer",
                boxShadow: "0 0 20px -4px rgba(201,162,76,0.4)",
              }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
