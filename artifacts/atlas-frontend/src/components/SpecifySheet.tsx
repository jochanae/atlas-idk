import { useState, useEffect, useRef, useCallback } from "react";

const FIELD_STYLE = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
} as const;

const SECTIONS = [
  "GOAL",
  "TARGET SURFACES",
  "TARGET BREAKPOINT/DEVICE",
  "ALLOWED TO CHANGE",
  "DO NOT CHANGE",
  "CURRENT PROBLEM",
  "SUCCESS CRITERIA",
  "RISK LEVEL",
  "BLAST RADIUS",
  "VALIDATION STEPS",
];

function parseSpec(raw: string): Array<{ title: string; body: string }> {
  const result: Array<{ title: string; body: string }> = [];
  const pattern = new RegExp(
    SECTIONS.map((s) => s.replace(/\//g, "\\/")).join("|"),
    "g"
  );
  const matches = [...raw.matchAll(pattern)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = (m.index ?? 0) + m[0].length;
    const end = matches[i + 1]?.index ?? raw.length;
    const body = raw
      .slice(start, end)
      .replace(/^[\s:]+/, "")
      .trimEnd();
    result.push({ title: m[0], body });
  }
  if (result.length === 0 && raw.trim()) {
    result.push({ title: "SPECIFICATION", body: raw.trim() });
  }
  return result;
}

export function SpecifySheet() {
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");

  const [change, setChange] = useState("");
  const [scope, setScope] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [broken, setBroken] = useState("");
  const [success, setSuccess] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [specOutput, setSpecOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const changeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      setOpen(true);
      if (detail.projectName) setProjectName(detail.projectName);
      setSpecOutput("");
      setError(null);
    };
    window.addEventListener("axiom:open-specify", handler);
    return () => window.removeEventListener("axiom:open-specify", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => changeRef.current?.focus(), 120);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setChange("");
    setScope("");
    setExclusions("");
    setBroken("");
    setSuccess("");
    setSpecOutput("");
    setError(null);
    setProjectName("");
  }, []);

  const canGenerate = change.trim().length > 0 && !isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError(null);
    setSpecOutput("");
    try {
      const body: Record<string, string> = { change: change.trim() };
      if (scope.trim()) body.scope = scope.trim();
      if (exclusions.trim()) body.exclusions = exclusions.trim();
      if (broken.trim()) body.broken = broken.trim();
      if (success.trim()) body.success = success.trim();
      if (projectName.trim()) body.projectName = projectName.trim();
      const res = await fetch("/api/specify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Generation failed");
      const text = await res.text();
      setSpecOutput(text);
    } catch {
      setError("Generation failed — check connection and try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, change, scope, exclusions, broken, success, projectName]);

  const handleCopy = useCallback(async () => {
    if (!specOutput) return;
    await navigator.clipboard.writeText(specOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [specOutput]);

  if (!open) return null;

  const sections = specOutput ? parseSpec(specOutput) : [];

  return (
    <>
      <style>{`@keyframes specify-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.7); } }`}</style>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 350, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        onClick={close}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, top: 48, bottom: 0,
          zIndex: 360,
          background: "var(--atlas-bg)",
          backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(201,162,76,0.06) 0%, transparent 60%)",
          border: "1px solid rgba(var(--atlas-gold-rgb),0.22)",
          borderRadius: "16px 16px 0 0",
          display: "flex", flexDirection: "column",
          paddingTop: "max(env(safe-area-inset-top), 4px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(var(--atlas-gold-rgb),0.18)" }} />
        </div>

        <div style={{ flexShrink: 0, padding: "10px 16px 12px", borderBottom: "1px solid rgba(var(--atlas-gold-rgb),0.10)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--atlas-gold)", letterSpacing: "0.06em", fontFamily: "var(--app-font-mono)" }}>
                SPECIFY
              </span>
              <span style={{ fontSize: 10, color: "rgba(var(--atlas-muted-rgb),0.6)" }}>
                Intent → 10-section boundary document{projectName ? ` · ${projectName}` : ""}
              </span>
            </div>
            <button
              onClick={close}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(var(--atlas-muted-rgb),0.55)", fontSize: 22, lineHeight: 1, padding: "2px 0 2px 4px", flexShrink: 0 }}
            >×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 14 }}>

          {!specOutput && (
            <>
              <div style={{ borderRadius: 10, background: "rgba(var(--atlas-gold-rgb),0.02)", border: "1px solid rgba(var(--atlas-gold-rgb),0.12)", padding: "10px 12px" }}>
                <p style={{ fontSize: 11, color: "rgba(var(--atlas-gold-rgb),0.7)", lineHeight: 1.55, margin: 0, fontFamily: "var(--app-font-mono)" }}>
                  Describe your intent. Atlas writes the spec — goal, constraints, blast radius, validation steps.
                </p>
              </div>

              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(var(--atlas-muted-rgb),0.75)", textTransform: "uppercase", marginBottom: 8, fontFamily: "var(--app-font-mono)" }}>
                  What do you want to change? *
                </p>
                <textarea
                  ref={changeRef}
                  value={change}
                  onChange={(e) => setChange(e.target.value)}
                  placeholder="e.g. Add a dismiss button to the decision log card that clears it without logging. Top-right corner, no confirmation."
                  rows={4}
                  style={{
                    width: "100%", ...FIELD_STYLE, padding: "12px 14px",
                    color: "var(--atlas-fg)", fontSize: 13, lineHeight: 1.65,
                    outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit",
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(var(--atlas-muted-rgb),0.75)", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--app-font-mono)" }}>
                    Scope & target surfaces <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                  </p>
                  <input
                    type="text"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    placeholder="e.g. workspace chat, mobile ≤390px, decision ledger"
                    style={{
                      width: "100%", ...FIELD_STYLE, padding: "9px 12px",
                      color: "var(--atlas-fg)", fontSize: 12, outline: "none",
                      boxSizing: "border-box", fontFamily: "inherit",
                    }}
                  />
                </div>

                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(var(--atlas-muted-rgb),0.75)", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--app-font-mono)" }}>
                    Do NOT change <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                  </p>
                  <input
                    type="text"
                    value={exclusions}
                    onChange={(e) => setExclusions(e.target.value)}
                    placeholder="e.g. workspace.tsx, the API schema, existing animations"
                    style={{
                      width: "100%", ...FIELD_STYLE, padding: "9px 12px",
                      color: "var(--atlas-fg)", fontSize: 12, outline: "none",
                      boxSizing: "border-box", fontFamily: "inherit",
                    }}
                  />
                </div>

                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(var(--atlas-muted-rgb),0.75)", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--app-font-mono)" }}>
                    What's broken right now? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                  </p>
                  <textarea
                    value={broken}
                    onChange={(e) => setBroken(e.target.value)}
                    placeholder="What is broken, missing, or frustrating right now?"
                    rows={2}
                    style={{
                      width: "100%", ...FIELD_STYLE, padding: "9px 12px",
                      color: "var(--atlas-fg)", fontSize: 12, lineHeight: 1.6,
                      outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit",
                    }}
                  />
                </div>

                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(var(--atlas-muted-rgb),0.75)", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--app-font-mono)" }}>
                    What does success look like? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                  </p>
                  <textarea
                    value={success}
                    onChange={(e) => setSuccess(e.target.value)}
                    placeholder="e.g. The button appears, clicking it dismisses the card instantly, nothing else changes"
                    rows={2}
                    style={{
                      width: "100%", ...FIELD_STYLE, padding: "9px 12px",
                      color: "var(--atlas-fg)", fontSize: 12, lineHeight: 1.6,
                      outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  width: "100%", borderRadius: 12,
                  background: isGenerating
                    ? "rgba(var(--atlas-gold-rgb),0.08)"
                    : canGenerate
                      ? "var(--atlas-gold)"
                      : "rgba(var(--atlas-gold-rgb),0.10)",
                  padding: "14px", fontSize: 14, fontWeight: 700,
                  color: isGenerating
                    ? "rgba(var(--atlas-gold-rgb),0.65)"
                    : canGenerate ? "#0D0B09" : "rgba(var(--atlas-gold-rgb),0.35)",
                  border: isGenerating ? "1px solid rgba(var(--atlas-gold-rgb),0.25)" : "none",
                  cursor: canGenerate ? "pointer" : "not-allowed",
                  transition: "all 180ms",
                  boxShadow: canGenerate && !isGenerating ? "0 0 20px oklch(0.76 0.12 85 / 15%)" : "none",
                }}
              >
                {isGenerating ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--atlas-gold)", animation: "specify-pulse 1.4s ease-in-out infinite" }} />
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 12, letterSpacing: "0.04em" }}>Writing specification…</span>
                  </span>
                ) : "Specify →"}
              </button>

              {error && (
                <div style={{ borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", padding: "12px 14px", fontSize: 12, color: "rgba(239,100,100,0.9)" }}>
                  {error}
                </div>
              )}
            </>
          )}

          {specOutput && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(var(--atlas-muted-rgb),0.75)", textTransform: "uppercase", fontFamily: "var(--app-font-mono)" }}>
                  Specification
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { setSpecOutput(""); setError(null); }}
                    style={{
                      padding: "4px 12px", borderRadius: 6,
                      border: "1px solid rgba(var(--atlas-muted-rgb),0.25)",
                      background: "transparent",
                      color: "rgba(var(--atlas-muted-rgb),0.6)",
                      fontSize: 10, fontWeight: 700, fontFamily: "var(--app-font-mono)",
                      cursor: "pointer", letterSpacing: "0.08em",
                    }}
                  >
                    ← REVISE
                  </button>
                  <button
                    onClick={handleCopy}
                    style={{
                      padding: "4px 12px", borderRadius: 6,
                      border: `1px solid ${copied ? "rgba(34,197,94,0.4)" : "rgba(var(--atlas-gold-rgb),0.3)"}`,
                      background: copied ? "rgba(34,197,94,0.1)" : "rgba(var(--atlas-gold-rgb),0.08)",
                      color: copied ? "rgba(134,239,172,0.9)" : "rgba(var(--atlas-gold-rgb),0.8)",
                      fontSize: 10, fontWeight: 700, fontFamily: "var(--app-font-mono)",
                      cursor: "pointer", transition: "all 180ms", letterSpacing: "0.08em",
                    }}
                  >
                    {copied ? "COPIED ✓" : "COPY"}
                  </button>
                </div>
              </div>

              {sections.length > 0 ? (
                sections.map((sec, i) => (
                  <div
                    key={i}
                    style={{
                      borderRadius: 10,
                      background: "oklch(0.12 0.01 60)",
                      border: "1px solid rgba(var(--atlas-gold-rgb),0.18)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{
                      padding: "7px 12px",
                      borderBottom: "1px solid rgba(var(--atlas-gold-rgb),0.12)",
                      background: "rgba(var(--atlas-gold-rgb),0.04)",
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                        color: "rgba(var(--atlas-gold-rgb),0.75)",
                        fontFamily: "var(--app-font-mono)", textTransform: "uppercase",
                      }}>
                        {String(i + 1).padStart(2, "0")} · {sec.title}
                      </span>
                    </div>
                    <pre style={{
                      margin: 0, padding: "10px 12px",
                      color: "var(--atlas-fg)", fontSize: 12, lineHeight: 1.75,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                      fontFamily: "inherit",
                    }}>
                      {sec.body}
                    </pre>
                  </div>
                ))
              ) : (
                <pre style={{
                  margin: 0, padding: "14px", borderRadius: 10,
                  background: "oklch(0.12 0.01 60)",
                  border: "1px solid rgba(var(--atlas-gold-rgb),0.22)",
                  color: "var(--atlas-fg)", fontSize: 12, lineHeight: 1.75,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  fontFamily: "var(--app-font-mono)",
                }}>
                  {specOutput}
                </pre>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid rgba(var(--atlas-gold-rgb),0.07)", flexShrink: 0 }}>
          <button
            onClick={close}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 16px", borderRadius: 20, background: "rgba(var(--atlas-muted-rgb),0.09)", border: "1px solid rgba(var(--atlas-muted-rgb),0.2)", color: "rgba(var(--atlas-muted-rgb),0.75)", fontSize: 12, cursor: "pointer", fontFamily: "var(--app-font-mono)" }}
          >
            ‹ Back
          </button>
          <span style={{ fontSize: 10, color: "rgba(var(--atlas-muted-rgb),0.35)", fontFamily: "var(--app-font-mono)" }}>AXIOM // SPECIFY</span>
        </div>
      </div>
    </>
  );
}
