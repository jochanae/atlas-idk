import { useState } from "react";
import { StatusGlyph, SEVERITY_LABEL } from "./StatusGlyph";
import { CapsuleTag } from "./CapsuleTag";
import {
  CARD_SCHEMA_CURRENT,
  deriveBuildId,
  type CommitCardPayload,
} from "@/lib/atlas-status";

/**
 * CommitCard — the "earned card" the AI delivers when it has something
 * committable. Glassmorphism on obsidian, gradient gold border, severity-tinted
 * status glyph in the header, action footer with Details / Preview / Park / Commit.
 *
 * Renderer MUST branch on schemaVersion. Unknown versions render the
 * UnsupportedCard fallback so old payloads never break the chat stream.
 */

export interface CommitCardProps {
  payload: CommitCardPayload;
  schemaVersion: number;
  /** Stable id used to derive a build_id when payload.build_id is missing. */
  messageId: string;
  /** True when the source AI turn is locked to a ledger entry. */
  locked?: boolean;
  onCommit?: () => void | Promise<void>;
  onPark?: () => void | Promise<void>;
  onPreview?: (artifactId?: string) => void;
  busy?: boolean;
}

export function CommitCard({
  payload,
  schemaVersion,
  messageId,
  locked = false,
  onCommit,
  onPark,
  onPreview,
  busy = false,
}: CommitCardProps) {
  // Schema-version branch — backward-compat seam.
  if (schemaVersion !== CARD_SCHEMA_CURRENT) {
    return <UnsupportedCard schemaVersion={schemaVersion} />;
  }
  return (
    <CommitCardV1
      payload={payload}
      messageId={messageId}
      locked={locked}
      onCommit={onCommit}
      onPark={onPark}
      onPreview={onPreview}
      busy={busy}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// v1
// ──────────────────────────────────────────────────────────────────────

function CommitCardV1({
  payload,
  messageId,
  locked,
  onCommit,
  onPark,
  onPreview,
  busy,
}: Omit<CommitCardProps, "schemaVersion">) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const buildId = payload.build_id ?? deriveBuildId(messageId);
  const showPark = payload.severity === "parked" || payload.severity === "blocker";
  const canPreview = Boolean(payload.preview_artifact_id) || Boolean(onPreview);

  return (
    <article
      role="group"
      aria-label={`${SEVERITY_LABEL[payload.severity]}: ${payload.title}`}
      className="commit-card relative"
    >
      {/* Gradient border — drawn as a wrapper background so the inner stays glass */}
      <div className="commit-card-inner">
        {/* Header */}
        <header className="flex items-start gap-3 px-4 pt-3.5 pb-2.5">
          <div className="pt-[3px]">
            <StatusGlyph severity={payload.severity} verb={payload.verb} size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[13px] font-semibold tracking-tight text-foreground leading-snug truncate">
                {payload.title}
              </h3>
              {locked && <CapsuleTag severity="committed" size="xs">LOCKED</CapsuleTag>}
            </div>
          </div>
          <div className="flex-shrink-0 pt-[2px]">
            <CapsuleTag size="xs">#{buildId}</CapsuleTag>
          </div>
        </header>

        {/* Body */}
        <div className="px-4 pb-3">
          <p className="text-[12px] leading-relaxed text-[color:var(--muted-text)]">
            {payload.summary}
          </p>
        </div>

        {/* Details drawer */}
        {detailsOpen && (payload.details || payload.touched?.length) && (
          <div className="mx-4 mb-3 px-3 py-2.5 rounded-sm bg-[color:var(--surface-alt)]/50 border border-border/50 space-y-2">
            {payload.details && (
              <pre className="font-mono text-[11px] leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">
                {payload.details}
              </pre>
            )}
            {payload.touched && payload.touched.length > 0 && (
              <div className="pt-2 border-t border-border/40 space-y-1">
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  Touched
                </div>
                <ul className="font-mono text-[10.5px] text-foreground/75 leading-relaxed">
                  {payload.touched.map((t) => (
                    <li key={t} className="truncate">· {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Footer */}
        <footer className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <GhostButton
              onClick={() => setDetailsOpen((v) => !v)}
              active={detailsOpen}
              disabled={busy}
            >
              Details
            </GhostButton>
            {canPreview && (
              <GhostButton
                onClick={() => onPreview?.(payload.preview_artifact_id)}
                disabled={busy || !onPreview}
              >
                Preview
              </GhostButton>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {showPark && onPark && !locked && (
              <GhostButton onClick={onPark} disabled={busy} severity="parked">
                Park
              </GhostButton>
            )}
            {onCommit && !locked && (
              <PrimaryButton onClick={onCommit} disabled={busy}>
                {busy ? "Committing…" : "Commit"}
              </PrimaryButton>
            )}
          </div>
        </footer>
      </div>

      <style>{`
        .commit-card {
          padding: 0.5px;
          border-radius: 6px;
          background: linear-gradient(
            135deg,
            color-mix(in oklab, var(--accent-gold) 55%, transparent) 0%,
            color-mix(in oklab, var(--accent-gold) 18%, transparent) 28%,
            transparent 55%,
            color-mix(in oklab, var(--background) 80%, transparent) 100%
          );
          box-shadow:
            0 1px 0 0 color-mix(in oklab, var(--accent-gold) 8%, transparent) inset,
            0 12px 32px -18px rgba(0, 0, 0, 0.55);
        }
        .commit-card-inner {
          background: color-mix(in oklab, var(--background) 88%, transparent);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-radius: 5.5px;
          overflow: hidden;
        }
      `}</style>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

function GhostButton({
  children,
  onClick,
  disabled,
  active,
  severity,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  severity?: "parked";
}) {
  const color =
    severity === "parked" ? "var(--accent-gold)" : "var(--accent-gold)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-mono uppercase tracking-[0.12em] rounded-sm transition-colors disabled:opacity-40"
      style={{
        fontSize: 10,
        padding: "4px 9px",
        background: active
          ? `color-mix(in oklab, ${color} 12%, transparent)`
          : "transparent",
        border: `0.5px solid color-mix(in oklab, ${color} ${active ? 70 : 38}%, transparent)`,
        color: active ? color : `color-mix(in oklab, ${color} 75%, var(--foreground))`,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = `color-mix(in oklab, ${color} 80%, transparent)`;
        e.currentTarget.style.color = color;
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = `color-mix(in oklab, ${color} ${active ? 70 : 38}%, transparent)`;
        e.currentTarget.style.color = active
          ? color
          : `color-mix(in oklab, ${color} 75%, var(--foreground))`;
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-mono uppercase tracking-[0.12em] rounded-sm transition-all disabled:opacity-40"
      style={{
        fontSize: 10,
        padding: "5px 12px",
        color: "var(--background)",
        background:
          "linear-gradient(180deg, var(--accent-gold) 0%, color-mix(in oklab, var(--accent-gold) 78%, #6a4a18) 100%)",
        border: "0.5px solid color-mix(in oklab, var(--accent-gold) 75%, transparent)",
        boxShadow:
          "0 0 14px -4px color-mix(in oklab, var(--accent-gold) 55%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.18)",
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function UnsupportedCard({ schemaVersion }: { schemaVersion: number }) {
  return (
    <div className="rounded-sm border border-border/60 bg-[color:var(--surface-alt)]/40 px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        CommitCard v{schemaVersion} · unsupported
      </div>
      <div className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
        This card was created with a newer schema. Update the workspace to view it.
      </div>
    </div>
  );
}
