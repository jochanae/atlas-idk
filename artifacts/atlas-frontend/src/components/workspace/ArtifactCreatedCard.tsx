import { type CSSProperties, useState, useEffect, useCallback } from "react";
import { Download, FileOutput, Maximize2, Minimize2, Copy, Check, AlertTriangle } from "lucide-react";

export interface GeneratedArtifactMeta {
  artifactId: number | string;
  projectId?: number;
  type: string;
  title: string;
  extension?: string;
  downloadUrl: string;
  summary?: string | null;
  preview?: { safe?: boolean; reasons?: string[]; html?: string } | null;
}

function typeLabel(type: string, extension?: string): string {
  const normalized = (extension || type || "output").toLowerCase();
  if (normalized === "pptx") return "PowerPoint";
  if (normalized === "docx") return "Word Doc";
  if (normalized === "xlsx") return "Spreadsheet";
  if (normalized === "pdf") return "PDF";
  if (normalized === "html-app" || normalized === "html") return "Web App";
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

function HtmlAppCard({ artifact, projectId, onOpen }: Props) {
  const [html, setHtml] = useState<string | null>(artifact.preview?.html ?? null);
  const [loading, setLoading] = useState(!artifact.preview?.html);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const safe = artifact.preview?.safe !== false;
  const reviewReasons = artifact.preview?.reasons ?? [];
  const [showAnyway, setShowAnyway] = useState(safe);

  useEffect(() => {
    if (html) { setLoading(false); return; }
    setLoading(true);
    fetch(artifact.downloadUrl, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.text();
      })
      .then((text) => { setHtml(text); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [artifact.downloadUrl, html]);

  const handleCopy = useCallback(() => {
    if (!html) return;
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [html]);

  const handleOpen = () => {
    if (html) {
      window.dispatchEvent(
        new CustomEvent("axiom:open-preview", {
          detail: { source: "sandbox", content: html },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("axiom:open-output", {
          detail: { artifactId: artifact.artifactId, projectId },
        }),
      );
    }
    onOpen?.(artifact);
  };

  const iframeHeight = expanded ? 680 : 460;

  return (
    <div
      style={{
        margin: "12px 0 8px",
        border: "1px solid rgba(201,162,76,0.25)",
        borderRadius: 12,
        background: "rgba(10,10,15,0.6)",
        overflow: "hidden",
        maxWidth: 680,
      }}
      data-artifact-created-card
      data-artifact-id={artifact.artifactId}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 12px",
        borderBottom: "1px solid rgba(201,162,76,0.15)",
        background: "rgba(201,162,76,0.04)",
      }}>
        <span style={{ color: "rgba(201,162,76,0.7)", flexShrink: 0 }}>
          <FileOutput size={13} strokeWidth={1.6} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 12, fontFamily: "var(--app-font-mono)",
            color: "var(--atlas-fg)", opacity: 0.92,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display: "block",
          }}>
            {artifact.title}
          </span>
          <span style={{
            fontSize: 10, color: "var(--atlas-muted)", opacity: 0.55,
            fontFamily: "var(--app-font-mono)",
          }}>
            Web App · HTML · ready
          </span>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
          <button type="button" onClick={handleCopy} style={iconBtn} title="Copy source">
            {copied
              ? <Check size={12} strokeWidth={2} style={{ color: "rgba(100,200,100,0.8)" }} />
              : <Copy size={12} strokeWidth={1.8} />}
          </button>
          <button type="button" onClick={() => setExpanded(v => !v)} style={iconBtn} title={expanded ? "Collapse" : "Expand"}>
            {expanded ? <Minimize2 size={12} strokeWidth={1.8} /> : <Maximize2 size={12} strokeWidth={1.8} />}
          </button>
          <a
            href={artifact.downloadUrl}
            download
            style={{ ...iconBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            title="Download HTML file"
          >
            <Download size={12} strokeWidth={1.8} />
          </a>
          <button type="button" onClick={handleOpen} style={btnPrimary}>
            Open in Draft
          </button>
        </div>
      </div>

      {!safe && !showAnyway && (
        <div style={{
          padding: "10px 14px", background: "rgba(180,120,0,0.08)",
          borderBottom: "1px solid rgba(201,162,76,0.15)",
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <AlertTriangle size={13} strokeWidth={1.8} style={{ color: "rgba(201,162,76,0.7)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--atlas-fg)", opacity: 0.8, fontFamily: "var(--app-font-sans)" }}>
              {reviewReasons[0] ?? "Held for review before rendering."}
            </div>
          </div>
          <button type="button" onClick={() => setShowAnyway(true)} style={btnSecondary}>
            Show anyway
          </button>
        </div>
      )}

      {(safe || showAnyway) && (
        <div style={{ position: "relative", width: "100%", height: iframeHeight, background: "#fff" }}>
          {loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", background: "rgba(10,10,15,0.95)",
              color: "var(--atlas-muted)", fontSize: 12, fontFamily: "var(--app-font-mono)",
            }}>
              Loading preview…
            </div>
          )}
          {error && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", background: "rgba(10,10,15,0.95)", flexDirection: "column", gap: 8,
            }}>
              <AlertTriangle size={16} strokeWidth={1.5} style={{ color: "rgba(201,162,76,0.6)" }} />
              <span style={{ fontSize: 11, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)" }}>
                Preview unavailable —{" "}
                <a href={artifact.downloadUrl} download style={{ color: "rgba(201,162,76,0.7)", textDecoration: "none" }}>
                  download instead
                </a>
              </span>
            </div>
          )}
          {html && !error && (
            <iframe
              srcDoc={html}
              sandbox="allow-scripts"
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              title={artifact.title}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function ArtifactCreatedCard({ artifact, projectId, onOpen }: Props) {
  const isHtmlApp = artifact.type === "html-app" || artifact.type === "html";

  if (isHtmlApp) {
    return <HtmlAppCard artifact={artifact} projectId={projectId} onOpen={onOpen} />;
  }

  const label = typeLabel(artifact.type, artifact.extension);

  const handleOpen = () => {
    window.dispatchEvent(
      new CustomEvent("axiom:open-output", {
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
        <div style={{
          fontSize: 12, fontFamily: "var(--app-font-mono)",
          color: "var(--atlas-fg)", opacity: 0.92,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {artifact.title}
        </div>
        <div style={{
          fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.6,
          fontFamily: "var(--app-font-mono)", marginTop: 1,
        }}>
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

const iconBtn: CSSProperties = {
  flexShrink: 0,
  width: 26, height: 26,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  borderRadius: 6,
  border: "1px solid rgba(201,162,76,0.18)",
  background: "transparent",
  color: "var(--atlas-muted)",
  cursor: "pointer",
  padding: 0,
};

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
