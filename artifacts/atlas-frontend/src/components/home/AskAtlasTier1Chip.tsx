/**
 * AskAtlasTier1Chip — pre-project Tier 1 progress indicator.
 *
 * Ask Atlas is pre-project: the user hasn't picked a workspace yet, so the
 * canonical Tier1ProgressCard (which loads via /api/memory/tier1/:projectId)
 * doesn't apply. Instead we poll the Nexus conversation buffer:
 *
 *   GET /api/nexus/tier1-buffer?conversationId=<id>
 *     → { buffer, skippedAt, missing[] }
 *
 * The chip renders a compact strip mirroring the workspace card so the user
 * sees Atlas quietly capturing project DNA as they talk. Silent until at
 * least one field is filled OR the user has explicitly skipped.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import {
  TIER1_QUESTIONS,
  openTier1IntakeSheet,
  type Tier1Answers,
  type Tier1FieldKey,
} from "@/lib/tier1Memory";

type BufferResponse = {
  buffer: Partial<Tier1Answers> | null;
  skippedAt: string | null;
  missing: Tier1FieldKey[];
};

const shortLabel: Record<Tier1FieldKey, string> = {
  building: "What",
  audience: "Who",
  problem: "Why",
  outOfScope: "Not",
  successSignal: "Signal",
  constraints: "Bounds",
};

const POLL_INTERVAL_MS = 20_000;

type Props = {
  conversationId?: string | null;
  /** Stops the poll (e.g. after handoff fires or a project is created). */
  paused?: boolean;
};

export function AskAtlasTier1Chip({ conversationId, paused = false }: Props) {
  const [data, setData] = useState<BufferResponse | null>(null);

  useEffect(() => {
    if (!conversationId || paused) {
      setData(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const r = await fetch(
          `/api/nexus/tier1-buffer?conversationId=${encodeURIComponent(conversationId)}`,
          { credentials: "include" },
        );
        if (!r.ok) return;
        const json = (await r.json()) as BufferResponse;
        if (!cancelled) setData(json);
      } catch {
        /* silent — chip stays hidden on error */
      }
    };

    void load();
    // Do NOT reload on window focus — native file pickers blur/focus the tab
    // and a focus refetch here races the attach interaction on mobile.
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [conversationId, paused]);

  if (!data) return null;

  const buffer = data.buffer ?? {};
  const skipped = Boolean(data.skippedAt);
  const filledKeys = TIER1_QUESTIONS
    .map((q) => q.key)
    .filter((k) => Boolean(buffer[k] && buffer[k]!.trim()));
  const filledCount = filledKeys.length;

  // Hide entirely when nothing captured and user hasn't skipped.
  if (!skipped && filledCount === 0) return null;

  const wrap: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 12px",
    background: "rgba(var(--atlas-surface-rgb), 0.6)",
    backdropFilter: "blur(12px) saturate(130%)",
    WebkitBackdropFilter: "blur(12px) saturate(130%)",
    border: `1px solid rgba(var(--atlas-gold-rgb), ${skipped ? 0.14 : 0.24})`,
    borderRadius: 12,
    color: "var(--atlas-fg)",
    margin: "0 0 10px 0",
  };

  const monoLabel: CSSProperties = {
    fontFamily: "var(--app-font-mono)",
    fontSize: 9,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  };

  return (
    <div style={wrap} role="region" aria-label="Project DNA progress">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--atlas-gold)",
            opacity: skipped ? 0.5 : 0.9,
          }}
        />
        <span style={{ ...monoLabel, color: "var(--atlas-gold)" }}>
          Project DNA · {filledCount}/6
        </span>
        <span style={{ ...monoLabel, color: "rgba(var(--atlas-muted-rgb), 0.55)" }}>
          {skipped ? "listening" : "capturing"}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={openTier1IntakeSheet}
          style={{
            padding: "2px 7px",
            borderRadius: 5,
            background: "transparent",
            border: "1px solid rgba(var(--atlas-gold-rgb), 0.25)",
            color: "var(--atlas-gold)",
            fontFamily: "var(--app-font-mono)",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Fill
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {TIER1_QUESTIONS.map((q) => {
          const filled = filledKeys.includes(q.key);
          return (
            <span
              key={q.key}
              title={filled ? `${q.label} — captured` : `${q.label} — pending`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 7px",
                borderRadius: 999,
                background: filled
                  ? "rgba(var(--atlas-gold-rgb), 0.14)"
                  : "rgba(var(--atlas-bg-rgb), 0.5)",
                border: `1px solid rgba(var(--atlas-gold-rgb), ${filled ? 0.4 : 0.12})`,
                color: filled ? "var(--atlas-gold)" : "rgba(var(--atlas-muted-rgb), 0.65)",
                fontFamily: "var(--app-font-mono)",
                fontSize: 9,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {filled ? <Check size={9} strokeWidth={3} /> : null}
              {shortLabel[q.key]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default AskAtlasTier1Chip;
