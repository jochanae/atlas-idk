// Decision Intelligence — chat-inline cards for Tradeoff Matrix / Decision Tree / Deviation Log.
// Rendered from message.decisionArtifacts (see ChatMessage in workspace.tsx).
import type { CSSProperties } from "react";

export interface DecisionArtifact {
  id: number;
  projectId: number;
  type: "tradeoff_matrix" | "decision_tree" | "deviation_log";
  version: number;
  title: string;
  payload: Record<string, unknown>;
  ledgerEntryId: number | null;
  createdAt: string;
}

const CARD_STYLE: CSSProperties = {
  marginTop: 12,
  borderRadius: 10,
  border: "1px solid color-mix(in oklab, var(--atlas-gold) 20%, var(--atlas-border))",
  background: "color-mix(in oklab, var(--atlas-surface) 85%, var(--atlas-bg))",
  overflow: "hidden",
};

const HEADER_STYLE: CSSProperties = {
  padding: "10px 14px 8px",
  borderBottom: "1px solid color-mix(in oklab, var(--atlas-border) 60%, transparent)",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const LABEL_STYLE: CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--app-font-mono)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--atlas-gold)",
  opacity: 0.75,
};

const TITLE_STYLE: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--atlas-fg)",
  lineHeight: 1.35,
};

function TradeoffMatrixArtifact({ payload }: { payload: Record<string, unknown> }) {
  const options = (payload.options as Array<{ name: string; summary?: string; scores?: Record<string, string>; pros?: string[]; cons?: string[] }>) ?? [];
  const criteria = (payload.criteria as string[]) ?? [];
  const recommendation = payload.recommendation as string | undefined;
  return (
    <>
      {criteria.length > 0 && (
        <div style={{ overflowX: "auto", padding: "10px 14px 0" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--atlas-muted)", fontWeight: 500 }}>Option</th>
                {criteria.map((c) => (
                  <th key={c} style={{ textAlign: "left", padding: "4px 8px", color: "var(--atlas-muted)", fontWeight: 500 }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {options.map((opt) => (
                <tr key={opt.name} style={{ borderTop: "1px solid color-mix(in oklab, var(--atlas-border) 50%, transparent)" }}>
                  <td style={{
                    padding: "6px 8px", fontWeight: 600,
                    color: opt.name === recommendation ? "var(--atlas-gold)" : "var(--atlas-fg)",
                  }}>
                    {opt.name}{opt.name === recommendation ? " ★" : ""}
                  </td>
                  {criteria.map((c) => (
                    <td key={c} style={{ padding: "6px 8px", color: "var(--atlas-fg)", opacity: 0.85 }}>
                      {opt.scores?.[c] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {recommendation && (
        <div style={{ padding: "9px 14px 10px", fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.5 }}>
          <span style={{ color: "var(--atlas-gold)", fontWeight: 600 }}>Recommended: {recommendation}.</span>
          {" "}{payload.recommendationReason as string ?? ""}
        </div>
      )}
    </>
  );
}

interface DecisionTreeNode {
  label: string;
  outcome?: string | null;
  children?: DecisionTreeNode[];
}

function TreeNode({ node, depth }: { node: DecisionTreeNode; depth: number }) {
  return (
    <div style={{ marginLeft: depth * 16, marginTop: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        <span style={{ fontSize: 10, color: "var(--atlas-gold)", opacity: 0.7 }}>{"└".repeat(depth > 0 ? 1 : 0)}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--atlas-fg)" }}>{node.label}</span>
      </div>
      {node.outcome && (
        <div style={{ marginLeft: 14, fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.4, marginTop: 2 }}>
          → {node.outcome}
        </div>
      )}
      {(node.children ?? []).map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function DecisionTreeArtifact({ payload }: { payload: Record<string, unknown> }) {
  const root = payload.root as DecisionTreeNode | undefined;
  return (
    <div style={{ padding: "10px 14px 12px" }}>
      {root && <TreeNode node={root} depth={0} />}
      {Array.isArray(payload.recommendedPath) && (payload.recommendedPath as string[]).length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.5 }}>
          <span style={{ color: "var(--atlas-gold)", fontWeight: 600 }}>Recommended path:</span>{" "}
          {(payload.recommendedPath as string[]).join(" → ")}
        </div>
      )}
    </div>
  );
}

function DeviationLogArtifact({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--atlas-muted)" }}>Recommended</div>
          <div style={{ fontSize: 12, color: "var(--atlas-fg)", opacity: 0.8 }}>{payload.recommended as string}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--atlas-ember, #c0553a)" }}>Chosen instead</div>
          <div style={{ fontSize: 12, color: "var(--atlas-fg)", fontWeight: 600 }}>{payload.chosen as string}</div>
        </div>
      </div>
      {Boolean(payload.chosenReason) && (
        <div style={{ fontSize: 11, color: "var(--atlas-muted)", lineHeight: 1.5 }}>{payload.chosenReason as string}</div>
      )}
      {Array.isArray(payload.risks) && (payload.risks as string[]).length > 0 && (
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--atlas-muted)", marginBottom: 3 }}>Risks</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {(payload.risks as string[]).map((r, i) => (
              <li key={i} style={{ fontSize: 11, color: "var(--atlas-fg)", opacity: 0.8, lineHeight: 1.45 }}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<DecisionArtifact["type"], string> = {
  tradeoff_matrix: "Tradeoff Matrix",
  decision_tree: "Decision Tree",
  deviation_log: "Deviation Log",
};

export function DecisionArtifactCard({ artifact }: { artifact: DecisionArtifact }) {
  return (
    <div style={CARD_STYLE}>
      <div style={HEADER_STYLE}>
        <span style={LABEL_STYLE}>{TYPE_LABEL[artifact.type]}</span>
        <span style={TITLE_STYLE}>{artifact.title.replace(/^[^—]+— /, "")}</span>
      </div>
      {artifact.type === "tradeoff_matrix" && <TradeoffMatrixArtifact payload={artifact.payload} />}
      {artifact.type === "decision_tree" && <DecisionTreeArtifact payload={artifact.payload} />}
      {artifact.type === "deviation_log" && <DeviationLogArtifact payload={artifact.payload} />}
      <div style={{
        padding: "6px 14px 8px",
        fontSize: 9.5, color: "var(--atlas-muted)", opacity: 0.65,
        borderTop: "1px solid color-mix(in oklab, var(--atlas-border) 50%, transparent)",
      }}>
        Saved to Ledger · v{artifact.version}
      </div>
    </div>
  );
}
