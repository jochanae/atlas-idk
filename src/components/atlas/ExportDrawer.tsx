import { useState } from "react";
import { X, Download, Github, ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/* ──────────────────────────────────────────────────────────
   Export / Deploy Panel
   
   Provides export options for generated code:
   - Download as ZIP
   - Copy to clipboard
   - GitHub push (connector integration point)
   ────────────────────────────────────────────────────────── */

type GeneratedFile = {
  id?: string;
  filename: string;
  language: string;
  content: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  files: GeneratedFile[];
  projectName?: string;
};

export function ExportDrawer({ open, onClose, files, projectName }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const copyFile = async (file: GeneratedFile) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedId(file.filename);
      setTimeout(() => setCopiedId(null), 1500);
      toast.success(`Copied ${file.filename}`);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const downloadFile = (file: GeneratedFile) => {
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${file.filename}`);
  };

  const downloadAll = () => {
    if (files.length === 0) return;
    setExporting("zip");

    // Generate a simple concatenated file for now
    // (Full ZIP support would require a library)
    const combined = files
      .map((f) => `// ══════════════════════════════════════\n// ${f.filename}\n// ══════════════════════════════════════\n\n${f.content}`)
      .join("\n\n\n");

    const blob = new Blob([combined], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName ?? "atlas-export"}-components.tsx`;
    a.click();
    URL.revokeObjectURL(url);

    setTimeout(() => setExporting(null), 800);
    toast.success("Downloaded all components");
  };

  const copyAll = async () => {
    if (files.length === 0) return;
    const combined = files
      .map((f) => `// ${f.filename}\n${f.content}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(combined);
      toast.success("All components copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          zIndex: 80,
          animation: "atlas-fade-in 200ms ease",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "75vh",
          zIndex: 81,
          background: "rgba(28, 25, 23, 0.95)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)",
          borderBottom: "none",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "atlas-sys-menu-in 280ms cubic-bezier(0.34, 1.2, 0.64, 1)",
          transformOrigin: "bottom center",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "0.5px solid var(--glass-border)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                color: "var(--foreground)",
                margin: 0,
              }}
            >
              Export & Deploy
            </h2>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--muted-text)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              {files.length} file{files.length !== 1 ? "s" : ""} generated
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick actions */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "14px 20px",
            borderBottom: "0.5px solid var(--glass-border)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={downloadAll}
            disabled={files.length === 0}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "10px 16px",
              borderRadius: 10,
              background: "var(--accent-gold)",
              border: "none",
              color: "#1a1814",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              fontWeight: 600,
              cursor: files.length === 0 ? "default" : "pointer",
              opacity: files.length === 0 ? 0.4 : 1,
              transition: "all 160ms ease",
            }}
          >
            <Download size={14} />
            {exporting === "zip" ? "Exporting…" : "Download All"}
          </button>
          <button
            onClick={copyAll}
            disabled={files.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 14px",
              borderRadius: 10,
              background: "transparent",
              border: "0.5px solid var(--border)",
              color: "var(--foreground)",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              cursor: files.length === 0 ? "default" : "pointer",
              opacity: files.length === 0 ? 0.4 : 1,
            }}
          >
            <Copy size={13} />
            Copy All
          </button>
        </div>

        {/* GitHub connector CTA */}
        <div
          style={{
            margin: "12px 20px 0",
            padding: "12px 16px",
            borderRadius: 10,
            background: "color-mix(in oklab, var(--accent-gold) 5%, var(--surface))",
            border: "0.5px solid color-mix(in oklab, var(--accent-gold) 15%, transparent)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-gold)",
              flexShrink: 0,
            }}
          >
            <Github size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--foreground)",
              }}
            >
              Push to GitHub
            </div>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 10.5,
                color: "var(--muted-text)",
                marginTop: 2,
              }}
            >
              Connect via Connectors → GitHub to sync your project.
            </div>
          </div>
          <ExternalLink size={14} style={{ color: "var(--muted-text)", flexShrink: 0 }} />
        </div>

        {/* File list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 16px 24px",
          }}
        >
          {files.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "var(--muted-text)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                }}
              >
                No files generated yet.
              </div>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                Use <code style={{ color: "var(--accent-gold)" }}>/build</code> to generate
                components, or deploy a Blueprint.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {files.map((file, i) => {
                const isCopied = copiedId === file.filename;
                return (
                  <div
                    key={file.filename + i}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "0.5px solid var(--border)",
                      background: "var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    {/* File icon */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background: "color-mix(in oklab, var(--accent-gold) 8%, transparent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--accent-gold)",
                        flexShrink: 0,
                      }}
                    >
                      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M5 12l-3-4 3-4M11 4l3 4-3 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    {/* Filename + language */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11.5,
                          color: "var(--foreground)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {file.filename}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--muted-text)",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          marginTop: 2,
                        }}
                      >
                        {file.language} · {Math.ceil(file.content.length / 40)} lines
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => copyFile(file)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        background: "transparent",
                        border: "0.5px solid var(--border)",
                        color: isCopied ? "var(--accent-gold)" : "var(--muted-text)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isCopied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <button
                      onClick={() => downloadFile(file)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        background: "transparent",
                        border: "0.5px solid var(--border)",
                        color: "var(--muted-text)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Download size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
