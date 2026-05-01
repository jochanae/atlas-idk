import { useState, useCallback, type ReactNode } from "react";
import type { PlanStep } from "./DependencyGraph";
import { haptic } from "@/lib/haptics";

interface PlanPanelProps {
  steps: PlanStep[];
  graph: ReactNode;
  onQueueStep?: (step: PlanStep) => void;
  onQueueAll?: () => void;
  onExpandStep?: (step: PlanStep) => void;
}

/**
 * PlanPanel — dedicated "Plan / Blueprints" panel that renders the generated
 * plan as a numbered checklist with dependency edges, copy-to-clipboard,
 * and one-tap queue-to-task buttons.
 */
export function PlanPanel({ steps, graph, onQueueStep, onQueueAll, onExpandStep }: PlanPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyPlan = useCallback(() => {
    if (!steps.length) return;
    const lines = steps.map((s, i) => {
      const deps = s.dependsOn.length
        ? ` (depends on: ${s.dependsOn.map((d) => {
            const dep = steps.find((x) => x.id === d);
            return dep ? dep.label : d;
          }).join(", ")})`
        : "";
      return `${i + 1}. ${s.label}${deps}`;
    });
    const text = `# Plan — ${steps.length} steps\n\n${lines.join("\n")}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      haptic("light");
      setTimeout(() => setCopied(false), 2000);
    });
  }, [steps]);

  if (!steps.length) {
    return (
      <div
        style={{
          borderRadius: 12,
          border: "1px solid color-mix(in oklab, var(--accent-gold, #c9a84c) 20%, var(--border))",
          background: "color-mix(in oklab, var(--accent-gold, #c9a84c) 6%, var(--surface))",
          overflow: "hidden",
        }}
      >
        {/* Panel Header */}
        <PanelHeader stepCount={0} />

        <div
          style={{
            padding: "24px 20px",
            textAlign: "center",
            fontFamily: "var(--font-mono, 'Geist Mono', monospace)",
            fontSize: 12,
            lineHeight: 1.7,
            color: "color-mix(in oklab, var(--foreground) 60%, transparent)",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="var(--accent-gold, #c9a84c)" strokeWidth={1.2} style={{ opacity: 0.5 }}>
              <circle cx="12" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="18" r="3" />
              <path d="M12 9v3M9.5 15.5 11 12M14.5 15.5 13 12" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ color: "var(--foreground)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
            Plan Mode
          </span>
          Describe what you want to build and Atlas will generate<br />
          a structured plan with numbered steps and dependencies.
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "color-mix(in oklab, var(--accent-gold, #c9a84c) 8%, transparent)", border: "0.5px solid color-mix(in oklab, var(--accent-gold, #c9a84c) 15%, transparent)", textAlign: "left", fontSize: 11, lineHeight: 1.8 }}>
            <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-gold, #c9a84c)", display: "block", marginBottom: 4 }}>Example format</span>
            1. Design the database schema<br />
            2. Create API endpoints <span style={{ opacity: 0.5 }}>(→ step 1)</span><br />
            3. Build the frontend UI <span style={{ opacity: 0.5 }}>(→ step 2)</span><br />
            4. Write integration tests <span style={{ opacity: 0.5 }}>(→ step 2)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid color-mix(in oklab, var(--accent-gold, #c9a84c) 25%, var(--border))",
        background: "color-mix(in oklab, var(--accent-gold, #c9a84c) 4%, var(--surface))",
        overflow: "hidden",
      }}
    >
      {/* Panel Header */}
      <PanelHeader stepCount={steps.length}>
        <div style={{ display: "flex", gap: 4 }}>
          {/* Copy Plan */}
          <button
            onClick={copyPlan}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 6,
              border: "0.5px solid color-mix(in oklab, var(--accent-gold, #c9a84c) 30%, var(--border))",
              background: copied ? "color-mix(in oklab, var(--accent-gold, #c9a84c) 20%, var(--surface))" : "transparent",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--accent-gold, #c9a84c)",
              cursor: "pointer",
              transition: "all 160ms ease",
            }}
          >
            {copied ? (
              <>
                <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 8.5l2.5 3L12 5" /></svg>
                Copied
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11" /></svg>
                Copy
              </>
            )}
          </button>
          {/* Queue All */}
          {onQueueAll && (
            <button
              onClick={() => { onQueueAll(); haptic("medium"); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                border: "0.5px solid color-mix(in oklab, var(--accent-gold, #c9a84c) 30%, var(--border))",
                background: "color-mix(in oklab, var(--accent-gold, #c9a84c) 10%, transparent)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--accent-gold, #c9a84c)",
                cursor: "pointer",
                transition: "all 160ms ease",
              }}
            >
              <svg viewBox="0 0 16 16" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M8 2v12M2 8h12" /></svg>
              Queue All
            </button>
          )}
        </div>
      </PanelHeader>

      {/* Numbered Step List */}
      <div style={{ padding: "8px 12px 4px", borderBottom: "0.5px solid color-mix(in oklab, var(--border) 50%, transparent)" }}>
        {steps.map((step, i) => {
          const deps = step.dependsOn
            .map((d) => steps.find((x) => x.id === d))
            .filter(Boolean) as PlanStep[];
          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 4px",
                borderBottom: i < steps.length - 1 ? "0.5px solid color-mix(in oklab, var(--border) 30%, transparent)" : "none",
              }}
            >
              {/* Step number */}
              <span
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  background: "color-mix(in oklab, var(--accent-gold, #c9a84c) 15%, transparent)",
                  color: "var(--accent-gold, #c9a84c)",
                  border: "0.5px solid color-mix(in oklab, var(--accent-gold, #c9a84c) 30%, transparent)",
                }}
              >
                {i + 1}
              </span>

              {/* Step content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    color: "var(--foreground)",
                    lineHeight: 1.4,
                    cursor: onExpandStep ? "pointer" : undefined,
                  }}
                  onClick={() => onExpandStep?.(step)}
                >
                  {step.label}
                </div>
                {deps.length > 0 && (
                  <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--accent-gold, #c9a84c)", opacity: 0.7, marginTop: 2, letterSpacing: "0.03em" }}>
                    → {deps.map((d) => d.label).join(", ")}
                  </div>
                )}
              </div>

              {/* One-tap queue button */}
              {onQueueStep && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQueueStep(step);
                    haptic("light");
                  }}
                  title="Add to task queue"
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "0.5px solid color-mix(in oklab, var(--accent-gold, #c9a84c) 25%, var(--border))",
                    background: "transparent",
                    color: "var(--accent-gold, #c9a84c)",
                    cursor: "pointer",
                    transition: "all 140ms ease",
                    opacity: 0.6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "color-mix(in oklab, var(--accent-gold) 12%, transparent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.background = "transparent"; }}
                >
                  <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Dependency Graph */}
      <div style={{ padding: "4px 0 0" }}>
        {graph}
      </div>
    </div>
  );
}

function PanelHeader({ stepCount, children }: { stepCount: number; children?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 14px",
        borderBottom: "0.5px solid color-mix(in oklab, var(--border) 50%, transparent)",
        background: "color-mix(in oklab, var(--accent-gold, #c9a84c) 6%, transparent)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="var(--accent-gold, #c9a84c)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="4" r="2.5" />
          <circle cx="4" cy="12.5" r="2" />
          <circle cx="12" cy="12.5" r="2" />
          <path d="M8 6.5v2.5M6.2 10.8 7.3 9M9.8 10.8 8.7 9" />
        </svg>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--accent-gold, #c9a84c)",
            fontWeight: 600,
          }}
        >
          Plan / Blueprint
        </span>
        {stepCount > 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "color-mix(in oklab, var(--accent-gold, #c9a84c) 60%, transparent)",
              letterSpacing: "0.08em",
            }}
          >
            {stepCount} steps
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
