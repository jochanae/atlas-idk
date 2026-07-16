import { useState } from "react";
import { ArtifactsGallery } from "./ArtifactsGallery";
import { OutputsGallery } from "./OutputsGallery";

const SUB_TABS: Array<{ id: "outputs" | "artifacts"; label: string }> = [
  { id: "outputs", label: "All Outputs" },
  { id: "artifacts", label: "Artifacts" },
];

export function OutputsPanel({ projectId }: { projectId: number }) {
  const [subTab, setSubTab] = useState<"outputs" | "artifacts">("outputs");

  const subTabBar = (
    <div style={{ display: "flex", gap: 0, padding: "0 14px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0 }}>
      {SUB_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setSubTab(t.id)}
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "none",
            borderBottom: subTab === t.id ? "2px solid var(--atlas-gold)" : "2px solid transparent",
            color: subTab === t.id ? "var(--atlas-gold)" : "var(--atlas-muted)",
            fontSize: 9.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
            textTransform: "uppercase", cursor: "pointer",
            opacity: subTab === t.id ? 1 : 0.5,
            transition: "all 140ms ease",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {subTabBar}
      {subTab === "artifacts"
        ? <ArtifactsGallery projectId={projectId} />
        : <OutputsGallery projectId={projectId} />}
    </div>
  );
}
