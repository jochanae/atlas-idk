import { useState } from "react";
import type { PlanArtifactV2, PlanCommitApproval } from "@/lib/plan";
import { getAuthHeaders } from "@/lib/api";

type Props = {
  plan: PlanArtifactV2;
  approval?: PlanCommitApproval;
  history?: PlanArtifactV2[];
};

const layerColor: Record<string, string> = {
  frontend: "rgba(96,165,250,0.85)",
  backend: "rgba(167,139,250,0.85)",
  db: "rgba(52,211,153,0.85)",
  infra: "rgba(251,146,60,0.85)",
  docs: "rgba(148,163,184,0.85)",
  other: "rgba(148,163,184,0.7)",
};

export default function PlanArtifactCardV2({ plan, approval, history }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<PlanCommitApproval["status"] | null>(null);

  const status = localStatus ?? approval?.status ?? null;
  const committed = plan.status === "committed" || status === "approved";
  const rejected = status === "rejected";

  const resolve = async (decision: "approve" | "reject") => {
    if (!approval) return;
    setBusy(true);
    setError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/agent/approvals/${approval.approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLocalStatus(decision === "approve" ? "approved" : "rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 10,
        border: "1px solid color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
        background: "color-mix(in oklab, var(--atlas-gold) 5%, transparent)",
        padding: "12px 14px",
        fontFamily: "var(--app-font-sans)",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--atlas-gold)", opacity: 0.85 }}>
            {committed ? "Plan · committed" : rejected ? "Plan · rejected" : `Plan · v${plan.version}`}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--atlas-fg)", lineHeight: 1.3 }}>{plan.title}</div>
          <div style={{ fontSize: 12, color: "var(--atlas-muted)", marginTop: 2 }}>{plan.intent}</div>
        </div>
        <div style={{ fontSize: 10, color: "var(--atlas-muted)", whiteSpace: "nowrap" }}>
          {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"} · {plan.estimated_effort}
        </div>
      </header>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {plan.steps.map((s) => (
          <li
            key={s.id}
            style={{
              display: "grid",
              gridTemplateColumns: "22px 1fr",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: "color-mix(in oklab, var(--atlas-bg) 60%, transparent)",
              border: "1px solid color-mix(in oklab, var(--atlas-fg) 6%, transparent)",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", paddingTop: 1 }}>{s.order}.</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--atlas-fg)" }}>{s.title}</span>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "1px 6px",
                    borderRadius: 3,
                    color: layerColor[s.layer] ?? layerColor.other,
                    background: "color-mix(in oklab, var(--atlas-fg) 4%, transparent)",
                  }}
                >
                  {s.layer}
                </span>
              </div>
              {s.detail && (
                <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", marginTop: 2, lineHeight: 1.4 }}>{s.detail}</div>
              )}
              {(s.touches?.length ?? 0) > 0 && (
                <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", marginTop: 3, fontFamily: "var(--app-font-mono)", opacity: 0.7 }}>
                  {s.touches.join(" · ")}
                </div>
              )}
              {s.verification && (
                <div style={{ fontSize: 10.5, color: "rgba(52,211,153,0.75)", marginTop: 3 }}>
                  ✓ {s.verification}
                </div>
              )}
              {s.risk && (
                <div style={{ fontSize: 10.5, color: "rgba(251,146,60,0.8)", marginTop: 2 }}>
                  ⚠ {s.risk}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {plan.open_questions && plan.open_questions.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed color-mix(in oklab, var(--atlas-fg) 10%, transparent)" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--atlas-muted)", marginBottom: 4 }}>
            Open questions
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--atlas-fg)", opacity: 0.85 }}>
            {plan.open_questions.map((q) => <li key={q.id}>{q.text}</li>)}
          </ul>
        </div>
      )}

      {approval && !committed && !rejected && status === "pending" && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => resolve("approve")}
            style={{
              flex: 1,
              padding: "7px 12px",
              borderRadius: 6,
              background: "color-mix(in oklab, var(--atlas-gold) 22%, transparent)",
              border: "1px solid color-mix(in oklab, var(--atlas-gold) 55%, transparent)",
              color: "var(--atlas-gold)",
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Committing…" : "Commit plan"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => resolve("reject")}
            style={{
              padding: "7px 12px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid color-mix(in oklab, var(--atlas-fg) 15%, transparent)",
              color: "var(--atlas-muted)",
              fontSize: 12,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            Reject
          </button>
        </div>
      )}

      {committed && (
        <div style={{ marginTop: 10, fontSize: 11, color: "rgba(52,211,153,0.85)" }}>
          ✓ Committed{plan.committedAt ? ` · ${new Date(plan.committedAt).toLocaleTimeString()}` : ""}
        </div>
      )}
      {rejected && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--atlas-muted)" }}>Rejected — Joy will wait for revised direction.</div>
      )}
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: "rgba(248,113,113,0.9)" }}>{error}</div>
      )}
      {history && history.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: "var(--atlas-muted)", opacity: 0.65 }}>
          Revised from v{history[history.length - 1].version}
        </div>
      )}
    </div>
  );
}
