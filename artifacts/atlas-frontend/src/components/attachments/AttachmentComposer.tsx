/**
 * Shared attachment composer panel.
 *
 * Used by the development reference route and available for any surface that
 * needs the full attach → upload → send loop without surface-specific logic.
 */
import { useRef, useState, useCallback } from "react";
import { useStagedAttachments } from "@/hooks/useStagedAttachments";
import { AttachmentStrip } from "@/components/shared/AttachmentStrip";
import type { AttachmentAdapter } from "@/lib/attachments/adapter";
import {
  ATTACHMENT_SUPPORT_MATRIX,
  type AttachmentCapability,
} from "@/lib/attachments/supportMatrix";
import { shouldIncludeAttachmentsOnSend } from "@/lib/attachments/types";

export type AttachmentComposerSendPayload = {
  text: string;
  attachmentIds: string[];
  capabilities: AttachmentCapability[];
};

export type AttachmentComposerProps = {
  adapter?: AttachmentAdapter;
  autoUpload?: boolean;
  /** Called once per logical Send (deduped against double taps). */
  onSend: (payload: AttachmentComposerSendPayload) => Promise<void> | void;
  /** Optional label for the surface under test. */
  surfaceLabel?: string;
};

export function AttachmentComposer({
  adapter,
  autoUpload = true,
  onSend,
  surfaceLabel = "Attachment Composer",
}: AttachmentComposerProps) {
  const staged = useStagedAttachments({ adapter, autoUpload });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sentLog, setSentLog] = useState<AttachmentComposerSendPayload[]>([]);
  const sendLockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSend =
    !sending &&
    !staged.isUploading &&
    shouldIncludeAttachmentsOnSend({
      text,
      attachmentCount: staged.readyFiles.length,
    }).ok &&
    staged.failedFiles.filter((f) => f.error?.retryable).length === 0;

  const handleSend = useCallback(async () => {
    if (sendLockRef.current || !canSend) return;
    sendLockRef.current = true;
    setSending(true);
    setLastError(null);
    const ready = staged.readyFiles;
    const ids = ready.map((f) => f.attachmentId!).filter(Boolean);
    const payload: AttachmentComposerSendPayload = {
      text: text.trim(),
      attachmentIds: ids,
      capabilities: ready.map((f) => f.capability),
    };
    staged.markSending(ready.map((f) => f.id));
    try {
      await onSend(payload);
      staged.clearSent(ready.map((f) => f.id));
      setSentLog((prev) => [...prev, payload]);
      setText("");
    } catch (err) {
      staged.restoreToReady(ready.map((f) => f.id));
      setLastError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
      sendLockRef.current = false;
    }
  }, [canSend, onSend, staged, text]);

  return (
    <div
      data-testid="attachment-composer"
      data-surface={surfaceLabel}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        maxWidth: 720,
        margin: "0 auto",
        color: "var(--atlas-fg)",
        fontFamily: "var(--app-font-sans, system-ui)",
      }}
    >
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          {surfaceLabel}
        </h1>
        <p style={{ fontSize: 13, opacity: 0.7, margin: "6px 0 0" }}>
          Shared attachment system — support matrix, upload progress, one send
          payload.
        </p>
      </header>

      <section aria-label="Support matrix" data-testid="support-matrix">
        <h2 style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
          Support matrix
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 4 }}>
          {ATTACHMENT_SUPPORT_MATRIX.map((entry) => (
            <li
              key={entry.id}
              data-matrix-id={entry.id}
              data-capability={entry.capability}
              style={{ fontSize: 12, display: "flex", gap: 8 }}
            >
              <strong style={{ minWidth: 72 }}>{entry.label}</strong>
              <span style={{ opacity: 0.7 }}>{entry.capability}</span>
              <span style={{ opacity: 0.5 }}>— {entry.statusLabel}</span>
            </li>
          ))}
        </ul>
      </section>

      <AttachmentStrip
        mode="staged"
        files={staged.files}
        onRemove={staged.removeFile}
        onRetry={staged.retryFile}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          multiple
          data-testid="file-input"
          style={{ display: "none" }}
          onChange={(e) => {
            staged.addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          data-testid="attach-button"
          onClick={() => inputRef.current?.click()}
          style={btnStyle}
        >
          Attach
        </button>
        <input
          data-testid="composer-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message (optional with files)"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(201,162,76,0.25)",
            background: "rgba(0,0,0,0.2)",
            color: "inherit",
          }}
        />
        <button
          type="button"
          data-testid="send-button"
          disabled={!canSend}
          onClick={() => void handleSend()}
          style={{ ...btnStyle, opacity: canSend ? 1 : 0.4 }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      {lastError && (
        <p data-testid="send-error" style={{ color: "#f87171", fontSize: 12 }}>
          {lastError}
        </p>
      )}

      {sentLog.length > 0 && (
        <section data-testid="sent-log" aria-label="Sent payloads">
          <h2 style={{ fontSize: 12, opacity: 0.55 }}>Sent</h2>
          <ol style={{ fontSize: 12, paddingLeft: 18 }}>
            {sentLog.map((entry, i) => (
              <li key={i} data-testid={`sent-entry-${i}`}>
                text="{entry.text}" · ids={entry.attachmentIds.join(",") || "(none)"} ·
                caps=[{entry.capabilities.join(", ")}]
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid rgba(201,162,76,0.35)",
  background: "linear-gradient(180deg, #D4AF37 0%, #B8942A 100%)",
  color: "#0C0A09",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};
