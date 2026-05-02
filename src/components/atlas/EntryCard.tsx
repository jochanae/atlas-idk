/**
 * EntryCard — the single, unified card component for both Ledger and
 * Parking Lot. There is exactly one component. Status (entry.status)
 * decides the posture:
 *
 *   committed → "locked" posture: stronger contrast, no pending language,
 *               actions = View, Reopen (controlled), Archive
 *   parked    → "active" posture: slightly muted, shows next action,
 *               actions = Resume, Commit, Delete
 *   draft     → "active" posture (a reopened successor entry)
 *
 * Same skeleton. Different posture. Per the locked architectural rule:
 *   "Do NOT create separate LedgerEntry and ParkedItem components."
 */

import { useState } from "react";
import { StatusGlyph, SEVERITY_LABEL } from "./StatusGlyph";
import { CapsuleTag } from "./CapsuleTag";
import type { Entry } from "@/lib/atlas-status";
import { relativeTime, formatCost } from "@/lib/atlas";

export interface EntryCardProps {
  entry: Entry;
  onCommit?: (entry: Entry) => void | Promise<void>;
  onResume?: (entry: Entry) => void | Promise<void>;
  onDelete?: (entry: Entry) => void | Promise<void>;
  onReopen?: (entry: Entry) => void | Promise<void>;
  onArchive?: (entry: Entry) => void | Promise<void>;
  busy?: boolean;
}

export function EntryCard({
  entry,
  onCommit,
  onResume,
  onDelete,
  onReopen,
  onArchive,
  busy = false,
}: EntryCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const locked = entry.status === "committed";
  const posture = locked ? "locked" : "active";

  return (
    <article
      role="group"
      aria-label={`${SEVERITY_LABEL[entry.severity]}: ${entry.title}`}
      data-posture={posture}
      data-status={entry.status}
      className="entry-card relative"
    >
      <div className="entry-card-inner">
        <header className="flex items-start gap-3 px-4 pt-3.5 pb-2.5">
          <div className="pt-[3px]">
            <StatusGlyph severity={entry.severity} verb={entry.verb} size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[13px] font-semibold tracking-tight text-foreground leading-snug truncate">
                {entry.title}
              </h3>
              {locked && (
                <CapsuleTag severity="committed" size="xs">LOCKED</CapsuleTag>
              )}
              {entry.supersedes_id && (
                <CapsuleTag size="xs">REOPENED</CapsuleTag>
              )}
              {entry.is_violation && (
                <CapsuleTag severity="blocker" size="xs">VIOLATION</CapsuleTag>
              )}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>{relativeTime(entry.created_at)}</span>
              {entry.cost_of_lesson !== null && entry.cost_of_lesson !== undefined && (
                <span>· {formatCost(entry.cost_of_lesson)}</span>
              )}
              {entry.mode && (
                <span
                  className="inline-flex items-center px-1.5 py-px rounded text-[8.5px] tracking-[0.1em]"
                  style={{
                    background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
                    border: "0.5px solid color-mix(in oklab, var(--accent-gold) 20%, var(--border))",
                    color: "var(--accent-gold)",
                  }}
                >
                  {entry.mode}
                </span>
              )}
            </div>
          </div>
          {entry.build_id && (
            <div className="flex-shrink-0 pt-[2px]">
              <CapsuleTag size="xs">#{entry.build_id}</CapsuleTag>
            </div>
          )}
        </header>

        {entry.summary && (
          <div className="px-4 pb-3">
            <p className="text-[12px] leading-relaxed text-[color:var(--muted-text)]">
              {entry.summary}
            </p>
          </div>
        )}

        {detailsOpen && (entry.details || (entry.touched && entry.touched.length > 0)) && (
          <div className="mx-4 mb-3 px-3 py-2.5 rounded-sm bg-[color:var(--surface-alt)]/50 border border-border/50 space-y-2">
            {entry.details && (
              <pre className="font-mono text-[11px] leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">
                {entry.details}
              </pre>
            )}
            {entry.touched && entry.touched.length > 0 && (
              <div className="pt-2 border-t border-border/40 space-y-1">
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  Touched
                </div>
                <ul className="font-mono text-[10.5px] text-foreground/75 leading-relaxed">
                  {entry.touched.map((t) => (
                    <li key={t} className="truncate">· {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        <footer className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            {(entry.details || (entry.touched && entry.touched.length > 0)) && (
              <GhostButton
                onClick={() => setDetailsOpen((v) => !v)}
                active={detailsOpen}
                disabled={busy}
              >
                Details
              </GhostButton>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Active posture actions */}
            {!locked && onResume && (
              <GhostButton onClick={() => onResume(entry)} disabled={busy}>
                Resume
              </GhostButton>
            )}
            {!locked && onDelete && (
              <GhostButton onClick={() => onDelete(entry)} disabled={busy}>
                Delete
              </GhostButton>
            )}
            {!locked && onCommit && (
              <PrimaryButton onClick={() => onCommit(entry)} disabled={busy}>
                {busy ? "Committing…" : "Commit"}
              </PrimaryButton>
            )}
            {/* Locked posture actions */}
            {locked && onReopen && (
              <GhostButton onClick={() => onReopen(entry)} disabled={busy}>
                Reopen
              </GhostButton>
            )}
            {locked && onArchive && (
              <GhostButton onClick={() => onArchive(entry)} disabled={busy}>
                Archive
              </GhostButton>
            )}
          </div>
        </footer>
      </div>

      <style>{`
        .entry-card {
          padding: 0.5px;
          border-radius: 6px;
        }
        .entry-card[data-posture="locked"] {
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
        .entry-card[data-posture="active"] {
          background: linear-gradient(
            135deg,
            color-mix(in oklab, var(--accent-gold) 22%, transparent) 0%,
            color-mix(in oklab, var(--border) 70%, transparent) 60%,
            transparent 100%
          );
          box-shadow: 0 6px 20px -14px rgba(0, 0, 0, 0.4);
        }
        .entry-card-inner {
          background: var(--surface);
          border-radius: 5.5px;
          overflow: hidden;
        }
        .entry-card[data-posture="locked"] .entry-card-inner {
          background: color-mix(in oklab, var(--background) 92%, var(--surface));
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
      `}</style>
    </article>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const color = "var(--accent-gold)";
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
