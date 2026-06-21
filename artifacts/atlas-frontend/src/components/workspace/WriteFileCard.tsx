import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileDown, Check, AlertCircle } from "lucide-react";

interface Props {
  filePath: string;
  content: string;
  projectId: number;
  onWriteSuccess?: (path: string) => void;
}

function extractCodeFromContent(content: string): string {
  const match = content.match(/```(?:[^\n]*)?\n([\s\S]*?)```\s*$/);
  if (match) return match[1];
  const anyBlock = content.match(/```(?:[^\n]*)?\n([\s\S]*?)```/);
  if (anyBlock) return anyBlock[1];
  return content;
}

export function WriteFileCard({ filePath, content, projectId, onWriteSuccess }: Props) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"idle" | "writing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [existingLines, setExistingLines] = useState<number | null>(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState(false);

  const codeContent = extractCodeFromContent(content);
  const newLineCount = codeContent.split("\n").length;
  const fileName = filePath.split("/").pop() ?? filePath;

  const doWrite = async () => {
    setStatus("writing");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/nexus/write-file", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, path: filePath, content: codeContent }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setStatus("done");
      qc.invalidateQueries({ queryKey: ["ws-tree", projectId] });
      qc.invalidateQueries({ queryKey: ["ws-gitstatus", projectId] });
      onWriteSuccess?.(filePath);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Write failed");
    }
  };

  const handleWrite = async () => {
    if (overwriteConfirm) {
      await doWrite();
      return;
    }
    try {
      const check = await fetch(
        `/api/fs/${projectId}/file?path=${encodeURIComponent(filePath)}`,
        { credentials: "include" },
      );
      if (check.ok) {
        const text = await check.text().catch(() => "");
        setExistingLines(text.split("\n").length);
        setOverwriteConfirm(true);
        return;
      }
    } catch {
      // Treat as new file
    }
    await doWrite();
  };

  return (
    <div style={{
      margin: "10px 0 4px",
      border: "1px solid rgba(201,162,76,0.22)",
      borderRadius: 10,
      background: "rgba(201,162,76,0.04)",
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      maxWidth: 480,
    }}>
      <span style={{ color: "rgba(201,162,76,0.7)", flexShrink: 0 }}>
        <FileDown size={14} strokeWidth={1.6} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontFamily: "var(--app-font-mono)",
          color: "var(--atlas-fg)", opacity: 0.9,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {fileName}
        </div>
        <div style={{
          fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.55,
          fontFamily: "var(--app-font-mono)", marginTop: 1,
        }}>
          {filePath !== fileName ? filePath + " · " : ""}
          {status === "done"
            ? `✓ wrote ${newLineCount} line${newLineCount !== 1 ? "s" : ""}`
            : `${newLineCount} line${newLineCount !== 1 ? "s" : ""}`}
        </div>
      </div>

      {status === "done" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(100,200,120,0.9)", fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>
          <Check size={13} strokeWidth={2} />
          Written
        </div>
      ) : status === "error" ? (
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(220,80,80,0.85)", fontSize: 11, marginBottom: 4 }}>
            <AlertCircle size={11} strokeWidth={1.8} />
            {errorMsg}
          </div>
          <button type="button" onClick={() => { setStatus("idle"); setErrorMsg(null); }} style={btnSecondary}>
            Retry
          </button>
        </div>
      ) : overwriteConfirm ? (
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          {existingLines !== null && (
            <div style={{ fontSize: 10, color: "rgba(201,162,76,0.65)", fontFamily: "var(--app-font-mono)", marginBottom: 5 }}>
              {existingLines} lines → {newLineCount} lines
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontSize: 10.5, color: "rgba(201,162,76,0.8)", alignSelf: "center" }}>Overwrite?</span>
            <button type="button" onClick={() => { setOverwriteConfirm(false); setExistingLines(null); }} style={btnSecondary}>
              Cancel
            </button>
            <button type="button" onClick={doWrite} disabled={status === "writing"} style={btnPrimary}>
              Yes, overwrite
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleWrite}
          disabled={status === "writing"}
          style={btnPrimary}
        >
          {status === "writing" ? "Writing…" : "Write to workspace"}
        </button>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
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

const btnSecondary: React.CSSProperties = {
  flexShrink: 0,
  padding: "4px 9px",
  borderRadius: 6,
  border: "1px solid rgba(201,162,76,0.18)",
  background: "transparent",
  color: "var(--atlas-muted)",
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
