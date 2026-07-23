/**
 * Tier1ProgressCard — a compact horizontal chip strip showing which of the
 * 6 Tier 1 project-DNA fields Joy has captured so far. Fills in live as
 * Joy discovers each field in conversation (via the backend
 * `tier1_upsert_field` tool). Tap to open the structured stepper.
 *
 * When all 6 fields are filled, renders a compact one-line recall strip
 * ("Building X · For Y · Problem Z") so the user can see what Joy knows.
 * The recall strip is dismissible per session.
 *
 * When the user has skipped, the card still shows (in a muted "opportunistic"
 * mode) so they can see Joy quietly capturing fields in conversation.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import {
  TIER1_QUESTIONS,
  openTier1IntakeSheet,
  type Tier1Memory,
  type Tier1FieldKey,
} from "@/lib/tier1Memory";

type Props = {
  memory: Tier1Memory | null;
  projectId: number | null;
};

const shortLabel: Record<Tier1FieldKey, string> = {
  building: "What",
  audience: "Who",
  problem: "Why",
  outOfScope: "Not",
  successSignal: "Signal",
  constraints: "Bounds",
};

const dismissKey = (id: number) => `atlas-tier1-progress-dismissed-${id}`;
const recallDismissKey = (id: number) => `atlas-tier1-recall-dismissed-${id}`;

function truncate(s: string, max = 48): string {
  if (!s) return "";
  const trimmed = s.trim();
  return trimmed.length > max ? trimmed.slice(0, max - 1) + "…" : trimmed;
}

export function Tier1ProgressCard({ memory, projectId }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [recallDismissed, setRecallDismissed] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    try {
      setDismissed(sessionStorage.getItem(dismissKey(projectId)) === "1");
      setRecallDismissed(sessionStorage.getItem(recallDismissKey(projectId)) === "1");
    } catch { /* ignore */ }
  }, [projectId]);

  if (!projectId || dismissed) return null;

  const answers = memory?.answers;
  const missing = memory?.missing ?? TIER1_QUESTIONS.map((q) => q.key);
  const filledCount = 6 - missing.length;

  // Complete → show recall strip (unless dismissed this session).
  if (filledCount >= 6) {
    if (recallDismissed) return null;

    const building = truncate(answers?.building ?? "", 52);
    const audience = truncate(answers?.audience ?? "", 36);
    const problem = truncate(answers?.problem ?? "", 36);

    const parts = [building, audience && `For ${audience}`, problem].filter(Boolean);
    const summary = parts.join(" · ");

    if (!summary) return null;

    const recallWrap: CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 12px",
      background: "rgba(var(--atlas-surface-rgb), 0.55)",
      backdropFilter: "blur(12px) saturate(130%)",
      WebkitBackdropFilter: "blur(12px) saturate(130%)",
      border: "1px solid rgba(var(--atlas-gold-rgb), 0.15)",
      borderRadius: 10,
      color: "rgba(var(--atlas-fg-rgb), 0.75)",
    };

    return (
      <div style={recallWrap} role="region" aria-label="Project memory">
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "var(--atlas-gold)",
          opacity: 0.7,
          flexShrink: 0,
        }} />
        <span
          style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            letterSpacing: "0.05em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}
          title={summary}
        >
          {summary}
        </span>
        <button
          type="button"
          onClick={openTier1IntakeSheet}
          style={{
            display: "inline-flex", alignItems: "center", gap: 2,
            padding: "2px 6px", borderRadius: 5,
            background: "transparent",
            border: "1px solid rgba(var(--atlas-gold-rgb), 0.2)",
            color: "rgba(var(--atlas-gold-rgb), 0.7)",
            fontFamily: "var(--app-font-mono)", fontSize: 9,
            letterSpacing: "0.14em", textTransform: "uppercase",
            cursor: "pointer", flexShrink: 0,
          }}
          aria-label="Edit project memory"
        >
          Edit <ChevronRight size={9} />
        </button>
        <button
          type="button"
          onClick={() => {
            try { sessionStorage.setItem(recallDismissKey(projectId), "1"); } catch { /* ignore */ }
            setRecallDismissed(true);
          }}
          aria-label="Dismiss"
          style={{
            width: 18, height: 18, borderRadius: 5,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none",
            color: "rgba(var(--atlas-muted-rgb), 0.45)",
            cursor: "pointer", flexShrink: 0,
          }}
        >
          <X size={10} />
        </button>
      </div>
    );
  }

  const skipped = Boolean(memory?.skippedAt);

  const wrap: CSSProperties = {
    display: "flex", flexDirection: "column", gap: 8,
    padding: "10px 12px",
    background: skipped
      ? "rgba(var(--atlas-bg-rgb), 0.55)"
      : "rgba(var(--atlas-surface-rgb), 0.72)",
    backdropFilter: "blur(14px) saturate(140%)",
    WebkitBackdropFilter: "blur(14px) saturate(140%)",
    border: `1px solid rgba(var(--atlas-gold-rgb), ${skipped ? 0.12 : 0.22})`,
    borderRadius: 14,
    boxShadow: skipped ? "none" : "0 4px 18px -12px rgba(201,162,76,0.35)",
    color: "var(--atlas-fg)",
  };

  const monoLabel: CSSProperties = {
    fontFamily: "var(--app-font-mono)", fontSize: 9,
    letterSpacing: "0.18em", textTransform: "uppercase",
  };

  const onDismiss = () => {
    try { sessionStorage.setItem(dismissKey(projectId), "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div style={wrap} role="region" aria-label="Tier 1 progress">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--atlas-gold)",
          boxShadow: skipped ? "none" : "0 0 8px rgba(201,162,76,0.65)",
          opacity: skipped ? 0.5 : 1,
        }} />
        <span style={{ ...monoLabel, color: "var(--atlas-gold)" }}>
          Project DNA · {filledCount}/6
        </span>
        <span style={{
          ...monoLabel, color: "rgba(var(--atlas-muted-rgb), 0.6)",
          fontSize: 9,
        }}>
          {skipped ? "Joy listening" : "Joy capturing"}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={openTier1IntakeSheet}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "3px 7px", borderRadius: 6,
            background: "transparent",
            border: "1px solid rgba(var(--atlas-gold-rgb), 0.28)",
            color: "var(--atlas-gold)",
            fontFamily: "var(--app-font-mono)", fontSize: 9,
            letterSpacing: "0.14em", textTransform: "uppercase",
            cursor: "pointer",
          }}
          aria-label="Fill Tier 1 manually"
        >
          Fill <ChevronRight size={10} />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            width: 20, height: 20, borderRadius: 6,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none",
            color: "rgba(var(--atlas-muted-rgb), 0.55)",
            cursor: "pointer",
          }}
        >
          <X size={11} />
        </button>
      </div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 5,
      }}>
        {TIER1_QUESTIONS.map((q) => {
          const filled = Boolean(answers && answers[q.key] && answers[q.key].trim());
          return (
            <button
              key={q.key}
              type="button"
              onClick={openTier1IntakeSheet}
              title={filled ? `${q.label} — captured` : `${q.label} — pending`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 999,
                background: filled
                  ? "rgba(var(--atlas-gold-rgb), 0.14)"
                  : "rgba(var(--atlas-bg-rgb), 0.55)",
                border: `1px solid rgba(var(--atlas-gold-rgb), ${filled ? 0.42 : 0.14})`,
                color: filled
                  ? "var(--atlas-gold)"
                  : "rgba(var(--atlas-muted-rgb), 0.7)",
                fontFamily: "var(--app-font-mono)", fontSize: 9,
                letterSpacing: "0.12em", textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 180ms ease",
              }}
            >
              {filled ? <Check size={9} strokeWidth={3} /> : null}
              {shortLabel[q.key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Tier1ProgressCard;
