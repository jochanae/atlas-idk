/**
 * AttachmentStrip — Shared renderer for staged and sent attachments.
 *
 * One component for Ask Atlas and Workspace. Modes:
 *   "staged" — composer preview with upload progress, capability labels, retry
 *   "sent"   — message thumbnail row (contentUrl / base64 / capability badge)
 *
 * Non-image files NEVER route through the image renderer.
 */
import { useState } from "react";
import type { StagedAttachment } from "@/hooks/useStagedAttachments";

export interface AttachmentStripStagedProps {
  mode: "staged";
  files: StagedAttachment[];
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
}

export interface AttachmentStripSentProps {
  mode: "sent";
  attachments: ReadonlyArray<{
    base64?: string;
    contentUrl?: string;
    mediaType: string;
    name?: string;
    processingStatus?: string;
    attachmentId?: string;
  }>;
}

export type AttachmentStripProps =
  | AttachmentStripStagedProps
  | AttachmentStripSentProps;

export function AttachmentStrip(props: AttachmentStripProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (props.mode === "staged") {
    const { files, onRemove, onRetry } = props;
    if (files.length === 0) return null;
    return (
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
        {files.map((sf) => (
          <StagedThumbnail
            key={sf.id}
            file={sf}
            onRemove={onRemove}
            onRetry={onRetry}
          />
        ))}
      </div>
    );
  }

  const { attachments } = props;
  if (attachments.length === 0) return null;
  const lbAtt = lightboxIdx !== null ? attachments[lightboxIdx] : null;
  const lbUrl = lbAtt
    ? (lbAtt.contentUrl ??
      (lbAtt.base64 ? `data:${lbAtt.mediaType};base64,${lbAtt.base64}` : null))
    : null;

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
          const url =
            att.contentUrl ??
            (att.base64 ? `data:${att.mediaType};base64,${att.base64}` : null);
          if (isImage && !url) {
            return (
              <div
                key={idx}
                role="listitem"
                style={{ position: "relative", flexShrink: 0 }}
              >
                <UnavailableImageBadge name={att.name} />
              </div>
            );
          }
          const solo = attachments.length === 1;
          const unsupported =
            att.processingStatus === "unsupported" ||
            att.processingStatus === "failed";
          return (
            <div
              key={idx}
              role="listitem"
              style={{ position: "relative", flexShrink: 0 }}
            >
              {isImage && !unsupported ? (
                <button
                  type="button"
                  onClick={() => setLightboxIdx(idx)}
                  aria-label={
                    att.name
                      ? `Expand ${att.name}`
                      : `Expand attachment ${idx + 1}`
                  }
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
                    src={url!}
                    alt={att.name ?? "Attached image"}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </button>
              ) : (
                <NonImageBadge
                  name={att.name ?? "File"}
                  mimeType={att.mediaType}
                  capabilityLabel={
                    unsupported
                      ? "Stored — Atlas can't read this file type yet"
                      : undefined
                  }
                />
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

function StagedThumbnail({
  file,
  onRemove,
  onRetry,
}: {
  file: StagedAttachment;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  const isFailed = file.status === "failed" || file.status === "blocked";
  const isUploading = file.status === "uploading";
  const errorMessage = file.error?.message ?? null;
  const showCapability =
    file.capability === "storage_only" || file.capability === "blocked";

  return (
    <div
      role="listitem"
      title={
        isFailed
          ? (errorMessage ?? file.name)
          : showCapability
            ? `${file.name} — ${file.statusLabel}`
            : file.name
      }
      data-capability={file.capability}
      data-upload-status={file.uploadStatus}
      style={{ position: "relative", flexShrink: 0 }}
    >
      {file.previewUrl && file.kind === "image" ? (
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
            opacity: isFailed ? 0.45 : isUploading ? 0.6 : 1,
          }}
        />
      ) : (
        <NonImageBadge
          name={file.name}
          mimeType={file.mimeType}
          error={isFailed}
          capabilityLabel={showCapability ? file.statusLabel : undefined}
        />
      )}

      {isUploading && (
        <div
          aria-label={`Uploading ${Math.round(file.uploadProgress * 100)}%`}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 7,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
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
            <circle
              cx="9"
              cy="9"
              r="7"
              stroke="rgba(212,175,55,0.3)"
              strokeWidth="2"
            />
            <path
              d="M9 2a7 7 0 0 1 7 7"
              stroke="rgba(212,175,55,0.9)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              left: 4,
              right: 4,
              bottom: 4,
              height: 3,
              borderRadius: 2,
              background: "rgba(255,255,255,0.15)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(file.uploadProgress * 100)}%`,
                height: "100%",
                background: "rgba(212,175,55,0.9)",
              }}
            />
          </div>
        </div>
      )}

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

      {isFailed && file.error?.retryable && onRetry && (
        <button
          type="button"
          onClick={() => onRetry(file.id)}
          aria-label={`Retry ${file.name}`}
          style={{
            position: "absolute",
            bottom: -6,
            left: -6,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: "rgba(8,8,10,0.92)",
            border: "1px solid rgba(201,162,76,0.4)",
            cursor: "pointer",
            color: "var(--atlas-gold)",
            fontSize: 8,
            zIndex: 2,
            fontFamily: "var(--app-font-mono)",
          }}
        >
          Retry
        </button>
      )}

      <button
        type="button"
        onClick={() => onRemove(file.id)}
        aria-label={
          isUploading ? `Cancel upload ${file.name}` : `Remove ${file.name}`
        }
        title={isUploading ? "Cancel upload" : "Remove"}
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "rgba(8,8,10,0.92)",
          border: "1px solid rgba(201,162,76,0.32)",
          cursor: "pointer",
          color: "var(--atlas-fg)",
          fontSize: 10,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          zIndex: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}

function UnavailableImageBadge({ name }: { name?: string }) {
  return (
    <div
      title={name ? `Image unavailable: ${name}` : "Image unavailable"}
      style={{
        width: 54,
        height: 54,
        borderRadius: 7,
        background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.28)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontSize: 7,
          color: "rgba(239,68,68,0.65)",
          fontFamily: "var(--app-font-mono)",
        }}
      >
        unavailable
      </span>
    </div>
  );
}

function NonImageBadge({
  name,
  mimeType,
  error,
  capabilityLabel,
}: {
  name: string;
  mimeType: string;
  error?: boolean;
  capabilityLabel?: string;
}) {
  const ext =
    name.split(".").pop()?.toUpperCase() ??
    mimeType.split("/").pop()?.toUpperCase() ??
    "FILE";
  return (
    <div
      title={capabilityLabel ? `${name} — ${capabilityLabel}` : name}
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
        gap: 2,
        overflow: "hidden",
        padding: 2,
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
          fontSize: 7.5,
          color: "rgba(201,162,76,0.75)",
          fontFamily: "var(--app-font-mono)",
          letterSpacing: "0.04em",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {ext.slice(0, 5)}
      </span>
      {capabilityLabel && (
        <span
          style={{
            fontSize: 6,
            color: "rgba(201,162,76,0.55)",
            fontFamily: "var(--app-font-mono)",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: "100%",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          stored
        </span>
      )}
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
      aria-label={name}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <img
        src={url}
        alt={name}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          borderRadius: 8,
        }}
      />
    </div>
  );
}
