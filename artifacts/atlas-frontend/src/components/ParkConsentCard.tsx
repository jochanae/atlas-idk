import { useState } from "react";
import { workspaceEventBus } from "@/lib/workspaceEventBus";

export type ParkConsentCandidate = {
  title: string;
  summary: string;
  confidence: number;
  category?: string;
  suggestedType?: string;
  source?: string;
};

type Props = {
  candidate: ParkConsentCandidate;
  projectId: number;
  sessionId?: number | null;
  sourceMessageId?: number;
  onDone: () => void;
};

/**
 * Mid-band (80–94) consent: "This seems unresolved. Park it?"
 * Creates the parked entry only on explicit Park — never silent.
 */
export function ParkConsentCard({
  candidate,
  projectId,
  sessionId,
  sourceMessageId,
  onDone,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"parked" | "dismissed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const park = async () => {
    if (saving || done) return;
    setSaving(true);
    setError(null);
    try {
      const type = candidate.suggestedType || "Decision";
      const verb = (candidate.category || "decision").toLowerCase();
      const res = await fetch(`/api/projects/${projectId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: candidate.title.slice(0, 80),
          summary: candidate.summary.slice(0, 500),
          status: "parked",
          severity: "parked",
          type,
          verb,
          mode: "auto-ask",
          sessionId: sessionId || undefined,
          sourceMessageId,
          contextWhat: `Park consent · ${candidate.confidence}%`,
        }),
      });
      if (!res.ok) throw new Error(`Park failed (${res.status})`);
      setDone("parked");
      workspaceEventBus.emit("entry-changed", { projectId });
      setTimeout(() => onDone(), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not park this.");
      setSaving(false);
    }
  };

  const dismiss = () => {
    if (saving) return;
    setDone("dismissed");
    setTimeout(() => onDone(), 400);
  };

  if (done === "dismissed") return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px 14px",
        borderRadius: 10,
        background: "var(--atlas-surface)",
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, var(--atlas-border))",
        boxShadow: "0 14px 36px -28px var(--atlas-gold)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--atlas-gold)",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--app-font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--atlas-gold)",
          }}
        >
          This seems unresolved
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--app-font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
            color: "var(--atlas-muted)",
            opacity: 0.65,
          }}
        >
          {candidate.confidence}% · ask
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--atlas-fg)", lineHeight: 1.35, marginBottom: 5 }}>
        {candidate.title}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", lineHeight: 1.55, marginBottom: 12 }}>
        Park it for later? Only intentionally deferred work belongs in the Parking Lot.
      </div>

      {error && (
        <div style={{ fontSize: 10.5, color: "var(--atlas-ember)", marginBottom: 9 }}>{error}</div>
      )}

      {done === "parked" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "9px 10px",
            borderRadius: 7,
            background: "color-mix(in oklab, var(--atlas-muted) 10%, transparent)",
            border: "1px solid var(--atlas-border)",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--atlas-muted)",
          }}
        >
          → Parked
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={saving}
            onClick={dismiss}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: 7,
              background: "transparent",
              border: "1px solid var(--atlas-border)",
              color: "var(--atlas-muted)",
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: saving ? 0.55 : 1,
            }}
          >
            Not now
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void park()}
            style={{
              flex: 1,
              padding: "7px 10px",
              borderRadius: 7,
              background: "var(--atlas-gold)",
              border: "1px solid var(--atlas-gold)",
              color: "var(--atlas-bg)",
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: saving ? 0.55 : 1,
            }}
          >
            {saving ? "Parking…" : "Park it?"}
          </button>
        </div>
      )}
    </div>
  );
}
