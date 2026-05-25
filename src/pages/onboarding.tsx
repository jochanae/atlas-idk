import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { useRequireAuth } from "@/hooks/useAuth";
import { ingestRepository } from "@/lib/repoIngest";

// ── Intent → color mapping (locked by product) ──────────────────────────────
const intents = [
  { id: "idea",       label: "I have an idea to build",            icon: "💡", desc: "Start from scratch and structure your thinking",            color: "#D4AF37" }, // Warm Gold
  { id: "founder",    label: "I'm managing a launch or business",  icon: "🚀", desc: "High-velocity operations, decisions, momentum",              color: "#7DD3FC" }, // Electric Blue / Liquid Platinum
  { id: "auditor",    label: "I'm auditing or fixing a system",    icon: "🛡️", desc: "Course-correction, security, grounded review",               color: "#10B981" }, // Deep Emerald
  { id: "strategist", label: "I'm mapping out a complex decision", icon: "🧭", desc: "Deep-focus strategic processing",                            color: "#A78BFA" }, // Amethyst / Deep Violet
  { id: "thinker",    label: "I need space to think freely",       icon: "❄️", desc: "Pure, clean slate, absolute clarity",                        color: "#E6EEF5" }, // Frosted Ice / Zero-Trace Silver
];

const shellStyle: CSSProperties = {
  position: "relative",
  minHeight: "100svh",
  background: "var(--atlas-bg)",
  color: "var(--atlas-fg)",
  overflow: "hidden",
  isolation: "isolate",
};

const stageStyle: CSSProperties = {
  position: "relative",
  zIndex: 2,
  minHeight: "100svh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
  boxSizing: "border-box",
};

const panelStyle: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
};

const monoStyle: CSSProperties = {
  fontFamily: "var(--app-font-mono)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

function PrimaryButton({
  children, disabled, onClick, type = "button",
}: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        marginTop: 28,
        minWidth: 190,
        border: "1px solid var(--intent-glow, var(--atlas-gold))",
        background: disabled ? "var(--atlas-surface-alt)" : "var(--intent-glow, var(--atlas-gold))",
        color: disabled ? "var(--atlas-muted)" : "var(--atlas-bg)",
        borderRadius: 999,
        padding: "13px 22px",
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 0 32px -8px var(--intent-glow, var(--atlas-gold))",
        transition: "background 280ms ease, box-shadow 280ms ease, color 280ms ease, border-color 280ms ease",
        ...monoStyle,
      }}
    >
      {children}
    </button>
  );
}

// ── Faux Master Map backdrop (lightweight, no three.js) ─────────────────────
type Star = { x: number; y: number; r: number; a: number; tw: number };
function MapBackdrop({ forging }: { forging: boolean }) {
  const stars = useMemo<Star[]>(() => {
    const out: Star[] = [];
    for (let i = 0; i < 140; i++) {
      out.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        r: Math.random() * 1.6 + 0.3,
        a: Math.random() * 0.7 + 0.2,
        tw: Math.random() * 4 + 2,
      });
    }
    return out;
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background:
          "radial-gradient(ellipse at center, color-mix(in srgb, var(--intent-glow, var(--atlas-gold)) 10%, transparent) 0%, transparent 55%), radial-gradient(ellipse at 70% 30%, rgba(125,211,252,0.05), transparent 60%), var(--atlas-bg)",
        filter: forging ? "blur(0px) brightness(1)" : "blur(40px) brightness(0.35)",
        transform: forging ? "scale(1)" : "scale(1.4)",
        transition: "filter 1200ms cubic-bezier(0.16, 1, 0.3, 1), transform 1200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {stars.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.r,
            height: s.r,
            borderRadius: "50%",
            background: "var(--atlas-fg)",
            opacity: s.a,
            animation: `axiom-twinkle ${s.tw}s ease-in-out ${i * 0.07}s infinite alternate`,
          }}
        />
      ))}
      {/* Center silhouette node */}
      <div
        className="axiom-center-node"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 14,
          height: 14,
          marginLeft: -7,
          marginTop: -7,
          borderRadius: "50%",
          background: "var(--intent-glow, var(--atlas-gold))",
          opacity: 0.35,
          filter: "drop-shadow(0 0 16px var(--intent-glow, var(--atlas-gold)))",
        }}
      />
    </div>
  );
}

export default function OnboardingPage() {
  const { isLoading } = useRequireAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(() => {
    try {
      const stored = Number(localStorage.getItem("axiom_onboarding_step") ?? "1");
      return stored >= 1 && stored <= 3 ? stored : 1;
    } catch { return 1; }
  });
  const [selectedIntent, setSelectedIntent] = useState(() => {
    try { return localStorage.getItem("axiom_user_intent") ?? ""; } catch { return ""; }
  });
  const [projectName, setProjectName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forging, setForging] = useState(false);
  const [burst, setBurst] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  const intentColor = useMemo(
    () => intents.find((i) => i.id === selectedIntent)?.color ?? "var(--atlas-gold)",
    [selectedIntent]
  );

  useEffect(() => {
    try { localStorage.setItem("axiom_onboarding_step", String(step)); } catch {}
  }, [step]);

  const chooseIntent = (id: string) => {
    setSelectedIntent(id);
    try { localStorage.setItem("axiom_user_intent", id); } catch {}
    setStep(3);
  };

  const onNameChange = (val: string) => {
    setProjectName(val);
    if (val.length > 0 && val.length % 3 === 0) setPulseKey((k) => k + 1);
  };

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = projectName.trim();
    if (!name || creating || forging) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const data = await res.json() as { id?: number; error?: string; message?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? data.message ?? "Project creation failed.");

      // ── "Big Bang" cinematic transition ────────────────────────────────
      try { localStorage.setItem("axiom_onboarding_step", "4"); } catch {}
      await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });

      // Genesis ledger anchor — created the moment the project exists.
      fetch(`/api/projects/${data.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: "Project initialized: Sovereign context anchored.",
          summary: "Genesis anchor — the project exists; context is bound and ready for Forge.",
          status: "committed",
          severity: "committed",
          mode: "decide",
        }),
      }).catch(() => {});

      // ── Repo-scan upgrade path (optional) ──────────────────────────────
      // If the user pasted a GitHub URL, autonomously derive architecture
      // nodes and merge them straight into project.nodeState, then stamp
      // a second Ledger entry. Failures are silent — we never block the
      // genesis transition on an optional scan.
      const trimmedRepo = repoUrl.trim();
      if (trimmedRepo) {
        ingestRepository(trimmedRepo)
          .then(async (result) => {
            if (result.nodes.length === 0) return;
            const nodeState: Record<string, unknown> = {};
            result.nodes.forEach((n) => {
              nodeState[n.id] = {
                resolved: n.resolved,
                label: n.label,
                type: n.type,
                x: n.x,
                y: n.y,
                ...(n.details ? { details: n.details } : {}),
                ...(n.strategicAnswer ? { strategicAnswer: n.strategicAnswer } : {}),
              };
            });
            await fetch(`/api/projects/${data.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ nodeState }),
            }).catch(() => {});
            await fetch(`/api/projects/${data.id}/entries`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                title: `Repo ingested · ${result.nodes.length} nodes autonomously derived.`,
                summary: result.summary,
                status: "committed",
                severity: "committed",
                mode: "build",
                verb: "new",
              }),
            }).catch(() => {});
          })
          .catch((scanErr) => {
            console.warn("[onboarding] repo scan failed:", scanErr);
          });
      }


      setBurst(true);
      setForging(true);
      // Hand off after the camera has nearly finished its pull-back
      setTimeout(() => {
        setLocation(`/map?projectId=${data.id}&onboarding=true`);
      }, 1150);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project creation failed.");
      setCreating(false);
    }
  };

  if (isLoading) return <div style={shellStyle} />;

  // CSS variable for selected intent color (drives glow, button, halo)
  const intentVarStyle = { ["--intent-glow" as any]: intentColor } as CSSProperties;

  const cardTransition = forging
    ? { transform: "scale(0)", opacity: 0, filter: "blur(20px)" }
    : { transform: "scale(1)", opacity: 1, filter: "blur(0)" };

  return (
    <main style={{ ...shellStyle, ...intentVarStyle }}>
      <MapBackdrop forging={forging} />

      {/* Big Bang glow burst */}
      {burst && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%", top: "50%",
            width: 40, height: 40,
            marginLeft: -20, marginTop: -20,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--intent-glow) 0%, transparent 70%)",
            zIndex: 1,
            animation: "axiom-bigbang 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        />
      )}

      <div
        style={{
          ...stageStyle,
          ...cardTransition,
          transition: "transform 600ms cubic-bezier(0.7, 0, 0.3, 1), opacity 600ms cubic-bezier(0.7, 0, 0.3, 1), filter 600ms cubic-bezier(0.7, 0, 0.3, 1)",
        }}
      >
        {step === 1 && (
          <section style={panelStyle}>
            <div style={{ ...monoStyle, color: "var(--intent-glow, var(--atlas-gold))", fontSize: 11, marginBottom: 18 }}>
              Axiom
            </div>
            <h1 style={{ margin: 0, fontFamily: "Georgia, var(--app-font-serif)", fontSize: "clamp(42px, 9vw, 76px)", fontWeight: 400, lineHeight: 1.02, color: "var(--atlas-fg)" }}>
              Welcome to Axiom.
            </h1>
            <p style={{ margin: "18px 0 0", maxWidth: 520, color: "var(--atlas-muted)", fontSize: "clamp(16px, 3vw, 20px)", lineHeight: 1.6 }}>
              The system that holds your thinking accountable.
            </p>
            <PrimaryButton onClick={() => setStep(2)}>Get Started →</PrimaryButton>
          </section>
        )}

        {step === 2 && (
          <section style={{ ...panelStyle, maxWidth: 860 }}>
            <div style={{ ...monoStyle, color: "var(--intent-glow, var(--atlas-gold))", fontSize: 10, marginBottom: 12 }}>
              Step 2
            </div>
            <h1 style={{ margin: 0, fontSize: "clamp(30px, 6vw, 48px)", fontWeight: 300, letterSpacing: "-0.03em", color: "var(--atlas-fg)" }}>
              What brings you here?
            </h1>
            <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 30 }}>
              {intents.map((intent) => {
                const active = selectedIntent === intent.id;
                return (
                  <button
                    key={intent.id}
                    type="button"
                    onClick={() => chooseIntent(intent.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = intent.color;
                      e.currentTarget.style.boxShadow = `0 0 24px -10px ${intent.color}`;
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.borderColor = "var(--atlas-border)";
                        e.currentTarget.style.boxShadow = "none";
                      }
                    }}
                    style={{
                      minHeight: 148,
                      padding: "18px 16px",
                      textAlign: "left",
                      borderRadius: 16,
                      border: active ? `2px solid ${intent.color}` : "1px solid var(--atlas-border)",
                      background: active ? "var(--atlas-surface-alt)" : "var(--atlas-surface)",
                      color: "var(--atlas-fg)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      transition: "border-color 220ms ease, box-shadow 220ms ease, background 220ms ease",
                      boxShadow: active ? `0 0 28px -8px ${intent.color}` : "none",
                    }}
                  >
                    <span style={{ fontSize: 26, lineHeight: 1 }}>{intent.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{intent.label}</span>
                    <span style={{ fontSize: 12.5, color: "var(--atlas-muted)", lineHeight: 1.55 }}>{intent.desc}</span>
                  </button>
                );
              })}
            </div>
            <PrimaryButton disabled={!selectedIntent} onClick={() => selectedIntent && setStep(3)}>This is me →</PrimaryButton>
          </section>
        )}

        {step === 3 && (
          <section style={panelStyle}>
            <div style={{ ...monoStyle, color: "var(--intent-glow, var(--atlas-gold))", fontSize: 10, marginBottom: 12 }}>
              Step 3
            </div>
            <h1 style={{ margin: 0, fontSize: "clamp(30px, 6vw, 52px)", fontWeight: 300, letterSpacing: "-0.03em", color: "var(--atlas-fg)" }}>
              Name your first project.
            </h1>
            <p style={{ margin: "12px 0 28px", color: "var(--atlas-muted)", fontSize: 16, lineHeight: 1.6 }}>
              This is where your first sprint of thinking will live.
            </p>
            <form onSubmit={createProject} style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <input
                key={pulseKey}
                value={projectName}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="What are you building?"
                autoFocus
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: "1px solid var(--intent-glow, var(--atlas-border))",
                  background: "transparent",
                  color: "var(--atlas-fg)",
                  outline: "none",
                  textAlign: "center",
                  fontSize: "clamp(24px, 6vw, 42px)",
                  fontWeight: 300,
                  padding: "14px 4px",
                  boxSizing: "border-box",
                  caretColor: "var(--intent-glow, var(--atlas-gold))",
                  transition: "border-color 240ms ease",
                }}
              />
              <p style={{ margin: "16px 0 0", color: "var(--atlas-muted)", fontSize: 12.5 }}>
                You can add more projects anytime.
              </p>
              {error && <p style={{ margin: "18px 0 0", color: "var(--atlas-ember)", fontSize: 12.5 }}>{error}</p>}
              <PrimaryButton type="submit" disabled={!projectName.trim() || creating || forging}>
                {creating || forging ? "Forging…" : "Begin →"}
              </PrimaryButton>
            </form>
          </section>
        )}
      </div>

      <style>{`
        @keyframes axiom-twinkle {
          from { opacity: 0.15; }
          to   { opacity: 0.9; }
        }
        @keyframes axiom-bigbang {
          0%   { transform: scale(0); opacity: 0.95; }
          60%  { opacity: 0.5; }
          100% { transform: scale(28); opacity: 0; }
        }
        .axiom-center-node {
          animation: axiom-center-pulse 2.6s ease-in-out infinite;
        }
        @keyframes axiom-center-pulse {
          0%, 100% { transform: scale(0.9); opacity: 0.3; }
          50%      { transform: scale(1.15); opacity: 0.7; }
        }
      `}</style>
    </main>
  );
}
