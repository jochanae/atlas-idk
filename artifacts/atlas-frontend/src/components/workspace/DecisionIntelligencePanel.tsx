import { useDecisionArtifacts, type DecisionArtifactType } from "@/hooks/useDecisionArtifacts";
import { DecisionArtifactCard } from "./DecisionArtifactCard";

const MONO = "var(--app-font-mono)";
const GOLD = "var(--atlas-gold)";
const MUTED = "var(--atlas-muted)";

const TYPE_LABEL: Record<DecisionArtifactType, string> = {
  tradeoff_matrix: "Tradeoff Matrix",
  decision_tree: "Decision Tree",
  deviation_log: "Deviation Log",
};

interface DecisionIntelligencePanelProps {
  projectId: number;
}

export function DecisionIntelligencePanel({ projectId }: DecisionIntelligencePanelProps) {
  const { artifacts, loading, error } = useDecisionArtifacts(projectId);

  if (loading && artifacts.length === 0) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, opacity: 0.5, fontStyle: "italic" }}>Loading…</span>
      </div>
    );
  }

  if (error && artifacts.length === 0) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, opacity: 0.5, fontStyle: "italic" }}>
          Couldn't load decision artifacts.
        </span>
      </div>
    );
  }

  if (artifacts.length === 0) {
    return (
      <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, opacity: 0.5, fontStyle: "italic", display: "block" }}>
          No decisions yet.
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED, opacity: 0.35, fontStyle: "italic", textAlign: "center", maxWidth: 260 }}>
          When you weigh 3+ competing options in conversation, Atlas builds a Tradeoff Matrix, Decision Tree, and — if you override its pick — a Deviation Log. They'll show up here.
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 14px 24px" }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
        color: GOLD, opacity: 0.7, marginBottom: 4,
      }}>
        Decision Ledger
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, opacity: 0.7, marginBottom: 10 }}>
        {artifacts.length} decision artifact{artifacts.length === 1 ? "" : "s"} · {new Set(artifacts.map((a) => a.type)).size} type{new Set(artifacts.map((a) => a.type)).size === 1 ? "" : "s"}
      </div>
      {artifacts.map((artifact) => (
        <DecisionArtifactCard
          key={`${artifact.type}-${artifact.id}-v${artifact.version}`}
          artifact={{
            id: artifact.id,
            projectId: artifact.projectId,
            type: artifact.type,
            version: artifact.version,
            title: artifact.title || TYPE_LABEL[artifact.type],
            payload: artifact.payload,
            ledgerEntryId: null,
            createdAt: artifact.createdAt,
          }}
        />
      ))}
    </div>
  );
}
