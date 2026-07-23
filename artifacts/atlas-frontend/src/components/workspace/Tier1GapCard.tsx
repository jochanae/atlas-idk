/**
 * Tier1GapCard — inline observation card that surfaces ONE Tier 1 gap
 * Joy can't reasonably infer from conversation.
 *
 * Contract: GET /api/projects/:projectId/tier1-gaps
 *   200 → { missing, nextGap: { key, question, hint, atlasContext } | null, completeness }
 *   404 → no chat activity yet; stay silent
 *
 * Rules (locked 2026-07-08):
 *   - Never render more than one gap at a time.
 *   - Never auto-open the intake sheet.
 *   - Tap → dispatches TIER1_INTAKE_OPEN_EVENT with { focusField } detail.
 *   - Poll only after streaming settles (same trigger as thinking-receipts).
 *   - Dismissable per-turn; suppressed for the rest of the session locally.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { TIER1_INTAKE_OPEN_EVENT, type Tier1FieldKey } from "@/lib/tier1Memory";

type NextGap = {
  key: Tier1FieldKey;
  question: string;
  hint?: string | null;
  atlasContext?: string | null;
};

type GapsResponse = {
  missing: Tier1FieldKey[];
  nextGap: NextGap | null;
  completeness: number;
};

interface Props {
  projectId: number | null | undefined;
  isStreaming: boolean;
  turnCount: number;
}

const POLL_DELAY_MS = 3000;

export function Tier1GapCard({ projectId, isStreaming, turnCount }: Props) {
  const [gap, setGap] = useState<NextGap | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStreaming = useRef(isStreaming);

  const fetchGap = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/tier1-gaps`, {
        credentials: "include",
      });
      if (!r.ok) { setGap(null); return; }
      const data = (await r.json()) as GapsResponse;
      setGap(data?.nextGap ?? null);
    } catch {
      // silent — non-critical
    }
  }, [projectId]);

  // Poll shortly after streaming ends
  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = isStreaming;
    if (!wasStreaming || isStreaming) return;
    if (!projectId || turnCount < 1) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void fetchGap(); }, POLL_DELAY_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isStreaming, projectId, turnCount, fetchGap]);

  // Reset dismissal set when project changes
  useEffect(() => { setDismissed(new Set()); setGap(null); }, [projectId]);

  if (!gap || dismissed.has(gap.key)) return null;

  const openIntake = () => {
    window.dispatchEvent(
      new CustomEvent(TIER1_INTAKE_OPEN_EVENT, { detail: { focusField: gap.key } }),
    );
  };

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(prev => new Set([...prev, gap.key]));
  };

  const body = gap.atlasContext || gap.hint || "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openIntake}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openIntake(); } }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderLeft: "2px solid var(--atlas-gold)",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontSize: 10.5,
            fontFamily: "var(--app-font-sans)",
            fontStyle: "italic",
            color: "var(--atlas-gold)",
            opacity: 0.85,
            letterSpacing: "0.01em",
          }}
        >
          Joy is still missing
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            padding: "2px 6px",
            cursor: "pointer",
            color: "var(--atlas-muted)",
            opacity: 0.4,
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          fontSize: 12.5,
          fontFamily: "var(--app-font-sans)",
          fontWeight: 600,
          color: "var(--atlas-fg)",
          letterSpacing: "0.01em",
          lineHeight: 1.4,
        }}
      >
        {gap.question}
      </div>
      {body && (
        <div
          style={{
            fontSize: 12,
            fontFamily: "var(--app-font-sans)",
            color: "var(--atlas-fg)",
            opacity: 0.72,
            lineHeight: 1.55,
          }}
        >
          {body}
        </div>
      )}
    </div>
  );
}

export default Tier1GapCard;
