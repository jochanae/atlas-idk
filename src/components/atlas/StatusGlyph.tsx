/**
 * StatusGlyph — RAG severity + builder verb iconography.
 *
 * Constraint (from user spec):
 *   "Glyphs must be minimal, monochrome-compatible, and legible at 16px.
 *    Use color as a secondary layer, not the primary signal."
 *
 * Each glyph is a clean geometric SVG that inherits `currentColor`.
 * Severity drives the color via CSS tokens; verb drives the shape.
 */

import type React from "react";

export type Severity = "blocker" | "parked" | "committed" | "neutral";
export type Verb = "new" | "bug" | "perf" | "note" | "wip" | "audit" | "merge" | "plan";

const severityColor: Record<Severity, string> = {
  blocker: "var(--ember)",
  parked: "var(--accent-gold)",
  committed: "var(--phosphor)",
  neutral: "var(--muted-text)",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: "Blocker",
  parked: "Parked",
  committed: "Committed",
  neutral: "Note",
};

export const VERB_LABEL: Record<Verb, string> = {
  new: "New",
  bug: "Bug",
  perf: "Perf",
  note: "Note",
  wip: "WIP",
  audit: "Audit",
  merge: "Merge",
  plan: "Plan",
};

interface VerbGlyphProps {
  size?: number;
}

const VerbGlyphs: Record<Verb, (props: VerbGlyphProps) => React.ReactElement> = {
  // ✨ four-point spark, geometric
  new: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5 L9 7 L13.5 8 L9 9 L8 13.5 L7 9 L2.5 8 L7 7 Z" />
    </svg>
  ),
  // 🐛 small body with two antennae
  bug: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="8" cy="9.5" rx="3.25" ry="3.75" />
      <path d="M5.75 6 L4.25 4 M10.25 6 L11.75 4" />
      <path d="M8 5.75 V13.25" opacity="0.5" />
    </svg>
  ),
  // ⚡ lightning, simplified
  perf: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round">
      <path d="M9 2 L4 9 L7.5 9 L6.5 14 L12 7 L8.5 7 Z" />
    </svg>
  ),
  // 📝 doc with corner fold
  note: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2.5 H10 L13 5.5 V13.5 H4 Z" />
      <path d="M10 2.5 V5.5 H13" />
      <path d="M5.75 8.5 H11.25 M5.75 10.75 H9.5" opacity="0.6" />
    </svg>
  ),
  // 🏗️ scaffold/triangle bracket
  wip: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13 L8 3 L13 13 Z" />
      <path d="M5.5 8.25 H10.5" opacity="0.5" />
    </svg>
  ),
  // ✅ check inside a square
  audit: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M5 8.25 L7.25 10.5 L11 6.5" />
    </svg>
  ),
  // 🤝 two interlocking arcs
  merge: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.5" cy="4.5" r="1.75" />
      <circle cx="11.5" cy="11.5" r="1.75" />
      <path d="M4.5 6.25 V11.5 H9.75" />
      <path d="M11.5 9.75 V4.5 H6.25" opacity="0.5" />
    </svg>
  ),
  // 🗺️ three stacked horizontal steps — a roadmap glyph
  plan: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.25 H10" />
      <path d="M3 8 H13" opacity="0.85" />
      <path d="M3 11.75 H7.5" opacity="0.6" />
      <circle cx="12" cy="4.25" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
};

/**
 * Severity-only ring (no verb) — RAG dot, used in tight spaces.
 */
export function SeverityDot({ severity, size = 10 }: { severity: Severity; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: severityColor[severity],
        boxShadow: `0 0 ${size * 0.6}px color-mix(in oklab, ${severityColor[severity]} 45%, transparent)`,
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Full status glyph: severity color + optional verb shape.
 * If no verb, renders a SeverityDot.
 */
export function StatusGlyph({
  severity,
  verb,
  size = 16,
  withLabel = false,
}: {
  severity: Severity;
  verb?: Verb | null;
  size?: number;
  withLabel?: boolean;
}) {
  if (!verb) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <SeverityDot severity={severity} size={Math.round(size * 0.62)} />
        {withLabel && (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: severityColor[severity] }}>
            {SEVERITY_LABEL[severity]}
          </span>
        )}
      </span>
    );
  }

  const Glyph = VerbGlyphs[verb];
  if (!Glyph) {
    // Unknown verb — fall back to severity dot
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <SeverityDot severity={severity} size={Math.round(size * 0.62)} />
        {withLabel && (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: severityColor[severity] }}>
            {SEVERITY_LABEL[severity]}
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={`${SEVERITY_LABEL[severity]} · ${VERB_LABEL[verb] ?? verb}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: withLabel ? 6 : 0,
        color: severityColor[severity],
        flexShrink: 0,
      }}
    >
      <Glyph size={size} />
      {withLabel && (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
          {VERB_LABEL[verb]}
        </span>
      )}
    </span>
  );
}
