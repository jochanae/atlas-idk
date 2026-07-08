import { useState } from "react";
import type { CatchPayload, CatchCheck } from "@/lib/DecisionCatchTypes";
import { workspaceEventBus } from "@/lib/workspaceEventBus";

type Props = {
  payload: CatchPayload;
  projectId: number;
  sessionId: number;
  sourceMessageId?: number;
};

const KIND_LABEL: Record<CatchCheck["kind"], string> = {
  conflict: "Conflict",
  alignment: "Alignment",
  pattern: "Pattern",
};

const KIND_COLOR: Record<CatchCheck["kind"], string> = {
  conflict: "var(--atlas-ember, #C7482D)",
  alignment: "var(--atlas-gold, #C9A84C)",
  pattern: "var(--atlas-muted, rgba(255,255,255,0.5))",
};

/**
 * "Before you do —" catch card. Renders when the backend has flagged that the
 * current turn semantically overlaps with a committed decision. See
 * DecisionCatchTypes.ts for the payload contract and the linked handoff doc
 * for the detection endpoint.
 */
export function DecisionCatchCard({ payload, projectId, sessionId, sourceMessageId }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"proceeded" | "adjusted" | null>(null);

  if (dismissed) return null;

  const proceed = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.deviationTitle ?? `Proceeded against: ${payload.intent}`.slice(0, 140),
          summary: payload.intent,
          status: "committed",
          severity: "neutral",
          verb: "override",
          deviation: true,
          mode: "decide",
          deviationReason: reason.trim() || undefined,
          catchAgainstId: payload.primaryConflictEntryId,
          sessionId: sessionId || undefined,
          sourceMessageId,
          cardSchemaVersion: payload.v,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      workspaceEventBus.emit("entry-changed", { projectId });
      setDone("proceeded");
      setTimeout(() => setDismissed(true), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log deviation.");
    } finally {
      setSaving(false);
    }
  };

  const adjust = () => {
    setDone("adjusted");
    setTimeout(() => setDismissed(true), 1200);
  };

  if (done) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 8,
          background: done === "proceeded"
            ? "color-mix(in oklab, var(--atlas-ember, #C7482D) 10%, transparent)"
            : "color-mix(in oklab, var(--atlas-gold, #C9A84C) 10%, transparent)",
          border: `1px solid ${done === "proceeded"
            ? "color-mix(in oklab, var(--atlas-ember, #C7482D) 30%, transparent)"
            : "color-mix(in oklab, var(--atlas-gold, #C9A84C) 30%, transparent)"}`,
          fontFamily: "var(--app-font-mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: done === "proceeded"
            ? "var(--atlas-ember, #C7482D)"
            : "var(--atlas-gold, #C9A84C)",
          textAlign: "center",
        }}
      >
        {done === "proceeded" ? "→ Deviation logged" : "✓ Held for now"}
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        borderRadius: 10,
        background: "var(--atlas-surface, rgba(255,255,255,0.02))",
        border: "1px solid color-mix(in oklab, var(--atlas-ember, #C7482D) 28%, var(--atlas-border, rgba(255,255,255,0.08)))",
        boxShadow: "0 14px 36px -28px var(--atlas-ember, #C7482D)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--atlas-ember, #C7482D)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--atlas-ember, #C7482D)",
          }}
        >
          Before you do —
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--atlas-fg)", lineHeight: 1.4 }}>
        {payload.intent}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
        {payload.checks.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 9,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: KIND_COLOR[c.kind],
                minWidth: 62,
                paddingTop: 2,
              }}
            >
              {KIND_LABEL[c.kind]}
            </span>
            <div style={{ fontSize: 12, color: "var(--atlas-fg)", lineHeight: 1.55, flex: 1 }}>
              {c.entryTitle && (
                <span style={{ fontWeight: 600 }}>{c.entryTitle}</span>
              )}
              {c.entryTitle && " — "}
              <span style={{ color: "var(--atlas-muted)" }}>{c.note}</span>
            </div>
          </div>
        ))}
      </div>

      {showReason && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why proceed? (optional — logged as deviation reason)"
          rows={2}
          style={{
            width: "100%",
            resize: "vertical",
            padding: "8px 10px",
            borderRadius: 7,
            border: "1px solid var(--atlas-border)",
            background: "var(--atlas-bg, rgba(0,0,0,0.2))",
            color: "var(--atlas-fg)",
            fontFamily: "var(--app-font-mono)",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        />
      )}

      {error && (
        <div style={{ fontSize: 10.5, color: "var(--atlas-ember, #C7482D)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={saving}
          onClick={adjust}
          style={{
            flex: 1,
            padding: "7px 10px",
            borderRadius: 7,
            background: "var(--atlas-gold, #C9A84C)",
            border: "1px solid var(--atlas-gold, #C9A84C)",
            color: "var(--atlas-bg, #000)",
            cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: saving ? 0.55 : 1,
          }}
        >
          Adjust
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            if (!showReason) { setShowReason(true); return; }
            void proceed();
          }}
          style={{
            flex: 1,
            padding: "7px 10px",
            borderRadius: 7,
            background: "transparent",
            border: "1px solid color-mix(in oklab, var(--atlas-ember, #C7482D) 45%, var(--atlas-border))",
            color: "var(--atlas-ember, #C7482D)",
            cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: saving ? 0.55 : 1,
          }}
        >
          {saving ? "Logging…" : showReason ? "Confirm proceed" : "Proceed anyway"}
        </button>
      </div>
    </div>
  );
}
