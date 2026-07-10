import type { CSSProperties } from "react";
import { Download, FileOutput } from "lucide-react";

export interface GeneratedArtifactMeta {
  artifactId: number | string;
  projectId?: number;
  type: string;
  title: string;
  extension?: string;
  downloadUrl: string;
  summary?: string | null;
}

function typeLabel(type: string, extension?: string): string {
  const normalized = (extension || type || "output").toLowerCase();
  if (normalized === "pptx") return "PowerPoint";
  if (normalized === "docx") return "Word Doc";
  if (normalized === "xlsx") return "Spreadsheet";
  if (normalized === "pdf") return "PDF";
  if (normalized.startsWith("draft_")) return "Draft";
  if (normalized === "mermaid") return "Diagram";
  if (normalized === "chart") return "Chart";
  return normalized.replace(/_/g, " ");
}

interface Props {
  artifact: GeneratedArtifactMeta;
  projectId: number;
  onOpen?: (artifact: GeneratedArtifactMeta) => void;
}

export function ArtifactCreatedCard({ artifact, projectId, onOpen }: Props) {
  const label = typeLabel(artifact.type, artifact.extension);

  const handleOpen = () => {
    try {
      sessionStorage.setItem(`atlas-open-output-${projectId}`, String(artifact.artifactId));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent("axiom:focus-output", {
        detail: { artifactId: artifact.artifactId, projectId },
      }),
    );
    onOpen?.(artifact);
  };

  return (
    <div
      style={{
        margin: "10px 0 4px",
        border: "1px solid rgba(201,162,76,0.28)",
        borderRadius: 10,
        background: "rgba(201,162,76,0.05)",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 480,
      }}
      data-artifact-created-card
      data-artifact-id={artifact.artifactId}
    >
      <span style={{ color: "rgba(201,162,76,0.75)", flexShrink: 0 }}>
        <FileOutput size={14} strokeWidth={1.6} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontFamily: "var(--app-font-mono)",
            color: "var(--atlas-fg)",
            opacity: 0.92,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {artifact.title}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--atlas-muted)",
            opacity: 0.6,
            fontFamily: "var(--app-font-mono)",
            marginTop: 1,
          }}
        >
          {label} · ready
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={handleOpen} style={btnPrimary}>
          Open
        </button>
        <a
          href={artifact.downloadUrl}
          download
          style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
        >
          <Download size={11} strokeWidth={1.8} />
          Download
        </a>
      </div>
    </div>
  );
}

const btnPrimary: CSSProperties = {
  flexShrink: 0,
  padding: "5px 11px",
  borderRadius: 7,
  border: "1px solid rgba(201,162,76,0.4)",
  background: "rgba(201,162,76,0.12)",
  color: "rgba(201,162,76,0.95)",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnSecondary: CSSProperties = {
  flexShrink: 0,
  padding: "5px 9px",
  borderRadius: 7,
  border: "1px solid rgba(201,162,76,0.18)",
  background: "transparent",
  color: "var(--atlas-muted)",
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
