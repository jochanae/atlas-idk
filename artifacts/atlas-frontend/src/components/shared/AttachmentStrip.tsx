/**
 * AttachmentStrip — Shared renderer for staged and sent attachments.
 *
 * Two modes:
 *   "staged" — Composer preview strip. Uses StagedFile.previewUrl (object URL
 *              for images). Shows error badge and remove button per file.
 *   "sent"   — Sent-message thumbnail row. Uses base64 data URIs. Tap-to-expand
 *              lightbox for images.
 *
 * Both Ask Atlas and Workspace consume this component so the same image appears
 * identically before send (staged), after send (sent), and during streaming.
 *
 * Current transport shape: inline base64 in the request body and message state.
 * Future: storage-backed URLs (server-side persistence). This component's public
 * interface is intentionally URL-agnostic so that switch requires no changes here.
 */
import { useState } from "react";
import type { StagedFile } from "@/hooks/useStagedAttachments";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AttachmentStripStagedProps {
  mode: "staged";
  files: StagedFile[];
  onRemove: (id: string) => void;
}

export interface AttachmentStripSentProps {
  mode: "sent";
  attachments: ReadonlyArray<{ base64: string; mediaType: string; name?: string }>;
}

export type AttachmentStripProps = AttachmentStripStagedProps | AttachmentStripSentProps;

// ─── Component ────────────────────────────────────────────────────────────────

export function AttachmentStrip(props: AttachmentStripProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (props.mode === "staged") {
    const { files, onRemove } = props;
    if (files.length === 0) return null;
    return (
      <>
        <div
          role="list"
          aria-label="Staged attachments"
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 2,
            flexShrink: 0,
          }}
        >
          {files.map(sf => (
            <StagedThumbnail key={sf.id} file={sf} onRemove={onRemove} />
          ))}
        </div>
      </>
    );
  }

  // ── Sent mode ───────────────────────────────────────────────────────────────
  const { attachments } = props;
  if (attachments.length === 0) return null;
  const lbAtt = lightboxIdx !== null ? attachments[lightboxIdx] : null;
  const lbUrl = lbAtt ? `data:${lbAtt.mediaType};base64,${lbAtt.base64}` : null;

  return (
    <>
      <div
        role="list"
        aria-label="Sent attachments"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 6,
        }}
      >
        {attachments.map((att, idx) => {
          const isImage = att.mediaType.startsWith("image/");
          const url = `data:${att.mediaType};base64,${att.base64}`;
          const solo = attachments.length === 1;
          return (
            <div
              key={idx}
              role="listitem"
              style={{ position: "relative", flexShrink: 0 }}
            >
              {isImage ? (
                <button
                  type="button"
                  onClick={() => setLightboxIdx(idx)}
                  aria-label={att.name ? `Expand ${att.name}` : `Expand attachment ${idx + 1}`}
                  style={{
                    padding: 0,
                    border: "1px solid rgba(201,162,76,0.28)",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.2)",
                    cursor: "zoom-in",
                    overflow: "hidden",
                    display: "block",
                    width: solo ? 220 : 96,
                    height: solo ? 160 : 96,
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={url}
                    alt={att.name ?? "Attached image"}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </button>
              ) : (
                <NonImageBadge name={att.name ?? "File"} mimeType={att.mediaType} />
              )}
            </div>
          );
        })}
      </div>
      {lbUrl && lbAtt && (
        <Lightbox
          url={lbUrl}
          name={lbAtt.name ?? "Image"}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StagedThumbnail({
  file,
  onRemove,
}: {
  file: StagedFile;
  onRemove: (id: string) => void;
}) {
  const isFailed = file.status === "failed";
  const isConverting = file.status === "converting";
  const errorMessage = file.error?.message ?? null;
  return (
    <div
      role="listitem"
      title={isFailed ? (errorMessage ?? file.name) : file.name}
      style={{ position: "relative", flexShrink: 0 }}
    >
      {file.previewUrl ? (
        <img
          src={file.previewUrl}
          alt={file.name}
          style={{
            width: 54,
            height: 54,
            borderRadius: 7,
            objectFit: "cover",
            border: `1px solid ${isFailed ? "rgba(239,68,68,0.4)" : "rgba(201,162,76,0.25)"}`,
            display: "block",
            opacity: isFailed ? 0.45 : isConverting ? 0.6 : 1,
          }}
        />
      ) : (
        <NonImageBadge name={file.name} mimeType={file.mimeType} error={isFailed} />
      )}
      {/* Conversion spinner overlay */}
      {isConverting && (
        <div
          aria-label="Converting"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.36)",
            pointerEvents: "none",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            style={{ animation: "spin 1s linear infinite" }}
          >
            <circle cx="9" cy="9" r="7" stroke="rgba(212,175,55,0.3)" strokeWidth="2" />
            <path
              d="M9 2a7 7 0 0 1 7 7"
              stroke="rgba(212,175,55,0.9)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
      {/* Validation / conversion error badge */}
      {isFailed && errorMessage && (
        <div
          style={{
            position: "absolute",
            bottom: 2,
            left: 2,
            right: 2,
            background: "rgba(220,38,38,0.88)",
            borderRadius: 3,
            padding: "1px 3px",
            fontSize: 7.5,
            color: "#fff",
            textAlign: "center",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            pointerEvents: "none",
            lineHeight: 1.4,
          }}
        >
          {errorMessage}
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        aria-label={`Remove ${file.name}`}
        disabled={isConverting}
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "rgba(8,8,10,0.92)",
          border: "1px solid rgba(201,162,76,0.32)",
          cursor: isConverting ? "default" : "pointer",
          color: "var(--atlas-fg)",
          fontSize: 10,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          zIndex: 2,
          opacity: isConverting ? 0.4 : 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function NonImageBadge({
  name,
  mimeType,
  error,
}: {
  name: string;
  mimeType: string;
  error?: boolean;
}) {
  const ext =
    name.split(".").pop()?.toUpperCase() ??
    mimeType.split("/").pop()?.toUpperCase() ??
    "FILE";
  return (
    <div
      style={{
        width: 54,
        height: 54,
        borderRadius: 7,
        background: "rgba(201,162,76,0.07)",
        border: `1px solid ${error ? "rgba(239,68,68,0.4)" : "rgba(201,162,76,0.2)"}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        overflow: "hidden",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M13 7.5l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5"
          stroke="rgba(201,162,76,0.6)"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          fontSize: 8,
          color: error ? "rgba(239,68,68,0.8)" : "rgba(201,162,76,0.55)",
          maxWidth: 46,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.06em",
        }}
      >
        {ext}
      </span>
    </div>
  );
}

function Lightbox({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`Preview: ${name}`}
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        cursor: "zoom-out",
      }}
    >
      <img
        src={url}
        alt={name}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: 8,
          boxShadow: "0 4px 48px rgba(0,0,0,0.7)",
          cursor: "default",
        }}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.22)",
          color: "#fff",
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
