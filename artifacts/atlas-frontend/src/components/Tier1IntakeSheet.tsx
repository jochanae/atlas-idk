/**
 * Tier1IntakeSheet — the Forge entry point.
 *
 * A 6-question structured intake that writes to the canonical
 * `project_tier1_memory` table via /api/memory/tier1. This is Tier 1 of
 * Atlas's 5-tier memory system: the foundational "who/what/why" every
 * downstream tier and the Decision Catch Engine reads from.
 *
 * UX: single-question-at-a-time stepper (matches Atlas's "one question at a
 * time" discipline rule), progress dots, back/next, review step, commit.
 * Reopening on an already-committed project loads existing answers and
 * behaves as an edit surface (PUT).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, CornerDownLeft, Check } from "lucide-react";
import {
  TIER1_QUESTIONS,
  EMPTY_TIER1,
  createTier1Memory,
  updateTier1Memory,
  getTier1Memory,
  type Tier1Answers,
  type Tier1Memory,
} from "@/lib/tier1Memory";

type Props = {
  open: boolean;
  projectId: number | null;
  projectName?: string | null;
  onClose: () => void;
  onCommitted?: (memory: Tier1Memory) => void;
};

const STEP_COUNT = TIER1_QUESTIONS.length; // 6 questions + 1 review

export function Tier1IntakeSheet({ open, projectId, projectName, onClose, onCommitted }: Props) {
  const [answers, setAnswers] = useState<Tier1Answers>(EMPTY_TIER1);
  const [step, setStep] = useState(0); // 0..STEP_COUNT (STEP_COUNT = review)
  const [existing, setExisting] = useState<Tier1Memory | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load existing answers when opened.
  useEffect(() => {
    if (!open || !projectId) return;
    setError(null);
    setStep(0);
    setLoading(true);
    getTier1Memory(projectId)
      .then((m) => {
        if (m) {
          setExisting(m);
          setAnswers(m.answers);
        } else {
          setExisting(null);
          setAnswers(EMPTY_TIER1);
        }
      })
      .catch(() => setError("Couldn't load existing Tier 1 memory."))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  // Esc + body scroll lock.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Autofocus the textarea on step change (skip on review).
  useEffect(() => {
    if (!open || step >= STEP_COUNT) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open, step]);

  const isReview = step >= STEP_COUNT;
  const current = !isReview ? TIER1_QUESTIONS[step] : null;
  const currentValue = current ? answers[current.key] : "";
  const canAdvance = !current || currentValue.trim().length >= 2;
  const allAnswered = useMemo(
    () => TIER1_QUESTIONS.every((q) => answers[q.key].trim().length >= 2),
    [answers],
  );

  const setField = (key: keyof Tier1Answers, v: string) => {
    setAnswers((a) => ({ ...a, [key]: v }));
  };

  const next = () => {
    if (!canAdvance) return;
    setStep((s) => Math.min(s + 1, STEP_COUNT));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const commit = async () => {
    if (!projectId || !allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed: Tier1Answers = {
        building: answers.building.trim(),
        audience: answers.audience.trim(),
        problem: answers.problem.trim(),
        outOfScope: answers.outOfScope.trim(),
        successSignal: answers.successSignal.trim(),
        constraints: answers.constraints.trim(),
      };
      const saved = existing
        ? await updateTier1Memory(projectId, trimmed)
        : await createTier1Memory(projectId, trimmed);
      onCommitted?.(saved);
      onClose();
    } catch {
      setError("Save failed. Check the backend and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (isReview) void commit();
      else next();
    }
  };

  if (!open) return null;

  const overlay: CSSProperties = {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    animation: "axiom-fade-in 180ms ease",
  };

  const sheet: CSSProperties = {
    width: "100%", maxWidth: 640, maxHeight: "88vh",
    display: "flex", flexDirection: "column",
    background: "rgba(var(--atlas-surface-rgb), 0.94)",
    backdropFilter: "blur(22px) saturate(140%)",
    WebkitBackdropFilter: "blur(22px) saturate(140%)",
    borderTop: "1px solid rgba(var(--atlas-gold-rgb), 0.30)",
    borderLeft: "1px solid rgba(var(--atlas-gold-rgb), 0.14)",
    borderRight: "1px solid rgba(var(--atlas-gold-rgb), 0.14)",
    borderRadius: "20px 20px 0 0",
    boxShadow: "0 -20px 60px -10px rgba(var(--atlas-gold-rgb), 0.18), 0 -8px 24px rgba(0,0,0,0.18)",
    padding: "14px 18px 18px",
    animation: "axiom-sheet-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    color: "var(--atlas-fg)",
  };

  const monoLabel: CSSProperties = {
    fontFamily: "var(--app-font-mono)", fontSize: 10,
    letterSpacing: "0.18em", textTransform: "uppercase",
  };

  const body = (
    <div style={overlay} onClick={onClose}>
      <style>{`
        @keyframes axiom-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes axiom-sheet-up { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div style={sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tier 1 intake">
        {/* drag handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 999,
          background: "rgba(var(--atlas-gold-rgb), 0.35)",
          margin: "2px auto 12px",
        }} />

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "var(--atlas-gold)",
              boxShadow: "0 0 10px rgba(201,162,76,0.7)",
            }} />
            <span style={{ ...monoLabel, color: "var(--atlas-gold)" }}>
              Tier 1 · Project DNA{projectName ? ` · ${projectName}` : ""}
            </span>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: "1px solid rgba(var(--atlas-gold-rgb), 0.18)",
              background: "transparent", color: "rgba(var(--atlas-muted-rgb), 0.85)",
              cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* progress dots */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {Array.from({ length: STEP_COUNT }).map((_, i) => {
            const filled = i < step || (i === step && !isReview);
            const active = i === step;
            return (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 999,
                background: active
                  ? "var(--atlas-gold)"
                  : filled
                    ? "rgba(var(--atlas-gold-rgb), 0.55)"
                    : "rgba(var(--atlas-gold-rgb), 0.15)",
                transition: "background 200ms",
              }} />
            );
          })}
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", ...monoLabel, color: "rgba(var(--atlas-muted-rgb),0.6)" }}>
            Loading…
          </div>
        ) : !isReview && current ? (
          <>
            <div style={{ ...monoLabel, color: "rgba(var(--atlas-muted-rgb),0.65)", marginBottom: 6 }}>
              Question {step + 1} of {STEP_COUNT}
            </div>
            <div style={{
              fontFamily: "var(--app-font-sans)", fontSize: 20, lineHeight: 1.3,
              letterSpacing: "-0.01em", color: "var(--atlas-fg)", marginBottom: 6,
            }}>
              {current.label}
            </div>
            <div style={{ fontSize: 12, color: "rgba(var(--atlas-muted-rgb), 0.7)", marginBottom: 10 }}>
              {current.hint}
            </div>
            <textarea
              ref={textareaRef}
              value={currentValue}
              onChange={(e) => setField(current.key, e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={current.placeholder}
              rows={5}
              style={{
                width: "100%", minHeight: 140, maxHeight: "36vh", resize: "vertical",
                padding: "12px 14px",
                background: "rgba(var(--atlas-bg-rgb), 0.45)",
                border: "1px solid rgba(var(--atlas-gold-rgb), 0.18)",
                borderRadius: 12,
                color: "var(--atlas-fg)",
                fontFamily: "var(--app-font-sans)",
                fontSize: 15, lineHeight: 1.55, letterSpacing: "-0.005em",
                outline: "none",
              }}
            />
          </>
        ) : (
          // Review
          <div style={{ overflowY: "auto", maxHeight: "58vh", paddingRight: 4 }}>
            <div style={{ ...monoLabel, color: "rgba(var(--atlas-muted-rgb),0.65)", marginBottom: 10 }}>
              Review — commit to Tier 1
            </div>
            {TIER1_QUESTIONS.map((q, i) => (
              <div key={q.key} style={{
                padding: "10px 0",
                borderBottom: i < STEP_COUNT - 1 ? "1px solid rgba(var(--atlas-gold-rgb),0.10)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ ...monoLabel, color: "rgba(var(--atlas-muted-rgb),0.6)" }}>
                    {q.label}
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    style={{
                      ...monoLabel, color: "var(--atlas-gold)",
                      background: "transparent", border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    Edit
                  </button>
                </div>
                <div style={{
                  fontSize: 14, lineHeight: 1.5,
                  color: answers[q.key].trim() ? "var(--atlas-fg)" : "rgba(var(--atlas-muted-rgb),0.5)",
                  whiteSpace: "pre-wrap",
                }}>
                  {answers[q.key].trim() || "— empty —"}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 8, fontSize: 12,
            color: "rgba(239, 68, 68, 0.95)",
            fontFamily: "var(--app-font-mono)",
          }}>{error}</div>
        )}

        {/* footer */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          marginTop: 14, paddingTop: 12,
          borderTop: "1px solid rgba(var(--atlas-gold-rgb), 0.10)",
        }}>
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 10px", borderRadius: 8,
              background: "transparent",
              border: "1px solid rgba(var(--atlas-gold-rgb), 0.18)",
              color: step === 0 ? "rgba(var(--atlas-muted-rgb),0.35)" : "rgba(var(--atlas-muted-rgb),0.85)",
              fontFamily: "var(--app-font-mono)", fontSize: 10,
              letterSpacing: "0.14em", textTransform: "uppercase",
              cursor: step === 0 ? "not-allowed" : "pointer",
            }}
          >
            <ChevronLeft size={13} /> Back
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ ...monoLabel, color: "rgba(var(--atlas-muted-rgb), 0.5)" }}>⌘↵</span>
          {isReview ? (
            <button
              type="button"
              onClick={commit}
              disabled={!allAnswered || submitting || !projectId}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 16px", borderRadius: 10,
                background: allAnswered && !submitting ? "var(--atlas-gold)" : "rgba(var(--atlas-gold-rgb), 0.18)",
                color: allAnswered && !submitting ? "#0D0B09" : "rgba(var(--atlas-gold-rgb), 0.45)",
                border: "none",
                fontFamily: "var(--app-font-mono)", fontSize: 11,
                letterSpacing: "0.14em", textTransform: "uppercase",
                cursor: allAnswered && !submitting ? "pointer" : "not-allowed",
                fontWeight: 600,
                boxShadow: allAnswered && !submitting ? "0 6px 20px -8px rgba(201,162,76,0.6)" : "none",
                transition: "all 160ms",
              }}
            >
              <Check size={14} />
              {submitting ? "Committing…" : existing ? "Update Tier 1" : "Commit Tier 1"}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 16px", borderRadius: 10,
                background: canAdvance ? "var(--atlas-gold)" : "rgba(var(--atlas-gold-rgb), 0.18)",
                color: canAdvance ? "#0D0B09" : "rgba(var(--atlas-gold-rgb), 0.45)",
                border: "none",
                fontFamily: "var(--app-font-mono)", fontSize: 11,
                letterSpacing: "0.14em", textTransform: "uppercase",
                cursor: canAdvance ? "pointer" : "not-allowed",
                fontWeight: 600,
                boxShadow: canAdvance ? "0 6px 20px -8px rgba(201,162,76,0.6)" : "none",
                transition: "all 160ms",
              }}
            >
              {step === STEP_COUNT - 1 ? "Review" : "Next"}
              {step === STEP_COUNT - 1 ? <CornerDownLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );


  return createPortal(body, document.body);
}

export default Tier1IntakeSheet;
