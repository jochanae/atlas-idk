import { usePipelineSketch } from "@/hooks/usePipelineSketch";
import type { PipelineSketchScreen } from "@/hooks/usePipelineSketch";

const MONO = "var(--app-font-mono)";
const GOLD = "var(--atlas-gold, #C9A24C)";
const FG = "var(--atlas-fg, #F5F0E8)";
const MUTED = "var(--atlas-muted, #8B8577)";
const BORDER = "var(--atlas-border, rgba(255,255,255,0.08))";
const BG = "var(--atlas-bg, #0E0D0B)";
const SURFACE = "var(--atlas-surface, rgba(255,255,255,0.03))";

const labelStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 9,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: GOLD,
  opacity: 0.7,
};

const mutedStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  color: MUTED,
  letterSpacing: "0.05em",
};

function ScreenCard({ screen, index }: { screen: PipelineSketchScreen; index: number }) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: "12px 14px",
        background: SURFACE,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Screen name + index */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: GOLD,
            opacity: 0.5,
            width: 18,
            flexShrink: 0,
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 12.5, color: FG, fontWeight: 500, letterSpacing: "0.01em" }}>
          {screen.name}
        </span>
      </div>

      {/* Purpose */}
      {screen.purpose && (
        <p style={{ margin: 0, fontSize: 12, color: FG, opacity: 0.75, lineHeight: 1.5 }}>
          {screen.purpose}
        </p>
      )}

      {/* Layout description */}
      {screen.layout && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={labelStyle}>Layout</span>
          <p style={{ margin: 0, fontSize: 11.5, color: FG, opacity: 0.7, lineHeight: 1.55 }}>
            {screen.layout}
          </p>
        </div>
      )}

      {/* Primary actions */}
      {screen.primaryActions?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Actions</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {screen.primaryActions.map((action, i) => (
              <span
                key={i}
                style={{
                  padding: "2px 8px",
                  borderRadius: 3,
                  background: `color-mix(in oklab, ${GOLD} 8%, transparent)`,
                  border: `1px solid color-mix(in oklab, ${GOLD} 20%, transparent)`,
                  fontSize: 10.5,
                  color: GOLD,
                  fontFamily: MONO,
                  letterSpacing: "0.04em",
                }}
              >
                {action}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Data needs */}
      {screen.dataNeeds?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Data</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {screen.dataNeeds.map((need, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span style={{ color: MUTED, fontFamily: MONO, fontSize: 10, marginTop: 1, flexShrink: 0 }}>
                  ·
                </span>
                <span style={{ fontSize: 11, color: FG, opacity: 0.6, lineHeight: 1.4 }}>{need}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptySlot({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <div
      style={{
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          border: `1px solid color-mix(in oklab, ${GOLD} 25%, transparent)`,
          background: `color-mix(in oklab, ${GOLD} 5%, transparent)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.7}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, color: FG, fontWeight: 500 }}>No sketch yet</span>
        <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, maxWidth: 260 }}>
          Generate a screen-by-screen layout sketch from the current Application Model.
        </span>
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        style={{
          padding: "8px 20px",
          borderRadius: 6,
          background: generating
            ? `color-mix(in oklab, ${GOLD} 10%, transparent)`
            : `color-mix(in oklab, ${GOLD} 14%, transparent)`,
          border: `1px solid color-mix(in oklab, ${GOLD} 30%, transparent)`,
          color: GOLD,
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: generating ? "not-allowed" : "pointer",
          transition: "background 0.15s",
          opacity: generating ? 0.6 : 1,
        }}
      >
        {generating ? "Generating…" : "Generate Sketch"}
      </button>
    </div>
  );
}

interface PipelineSketchPanelProps {
  projectId: number;
}

export function PipelineSketchPanel({ projectId }: PipelineSketchPanelProps) {
  const { sketch, loading, generating, approving, dismissing, error, generate, approve, dismiss, refetch } =
    usePipelineSketch(projectId);

  const isApproved = sketch?.metadata?.status === "approved" || sketch?.metadata?.approved === true;
  const screens = (sketch?.payload?.screens ?? []) as PipelineSketchScreen[];
  const impliedReqs = (sketch?.payload?.impliedRequirements ?? []) as string[];
  const navigationModel = sketch?.payload?.navigationModel as string | undefined;
  const notes = sketch?.payload?.notes as string | undefined;
  const archetypeLabel = sketch?.payload?.archetypeLabel as string | undefined;
  const genFrom = sketch?.payload?.generatedFrom as {
    pageCount?: number;
    entityCount?: number;
    pages?: string[];
  } | undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG }}>
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={labelStyle}>Pipeline Sketch</span>
          {archetypeLabel && (
            <span style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{archetypeLabel}</span>
          )}
        </div>

        {isApproved && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 3,
              background: `color-mix(in oklab, ${GOLD} 12%, transparent)`,
              border: `1px solid color-mix(in oklab, ${GOLD} 30%, transparent)`,
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            Approved
          </span>
        )}

        {sketch && !isApproved && (
          <button
            type="button"
            onClick={() => void refetch()}
            title="Refresh"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: MUTED, display: "flex" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loading && !sketch && (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <span style={mutedStyle}>Loading…</span>
          </div>
        )}

        {!loading && !sketch && (
          <EmptySlot onGenerate={() => void generate()} generating={generating} />
        )}

        {generating && !sketch && (
          <div style={{ padding: "32px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <span style={mutedStyle}>Generating sketch…</span>
          </div>
        )}

        {error && (
          <div style={{ padding: "10px 16px" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--atlas-error, #e05c5c)" }}>
              {error}
            </span>
          </div>
        )}

        {sketch && (
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Generation provenance */}
            {genFrom && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {typeof genFrom.pageCount === "number" && (
                  <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.08em" }}>
                    {genFrom.pageCount} pages
                  </span>
                )}
                {typeof genFrom.entityCount === "number" && (
                  <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.08em" }}>
                    {genFrom.entityCount} entities
                  </span>
                )}
              </div>
            )}

            {/* Navigation model */}
            {navigationModel && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>
                <span style={labelStyle}>Navigation</span>
                <span style={{ fontSize: 12.5, color: FG, lineHeight: 1.55, opacity: 0.9 }}>{navigationModel}</span>
              </div>
            )}

            {/* Screens */}
            {screens.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={labelStyle}>Screens ({screens.length})</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {screens.map((s, i) => (
                    <ScreenCard key={i} screen={s} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Implied requirements */}
            {impliedReqs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
                <span style={labelStyle}>Implied Requirements</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {impliedReqs.map((req, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: GOLD, opacity: 0.4, fontFamily: MONO, fontSize: 10, marginTop: 2, flexShrink: 0 }}>
                        {i + 1}.
                      </span>
                      <span style={{ fontSize: 11.5, color: FG, lineHeight: 1.5, opacity: 0.85 }}>{req}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {notes && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 4 }}>
                <span style={labelStyle}>Notes</span>
                <p style={{ margin: 0, fontSize: 12, color: FG, opacity: 0.7, lineHeight: 1.55 }}>{notes}</p>
              </div>
            )}

            {/* Approved banner */}
            {isApproved && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  background: `color-mix(in oklab, ${GOLD} 7%, transparent)`,
                  border: `1px solid color-mix(in oklab, ${GOLD} 22%, transparent)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ fontFamily: MONO, fontSize: 10, color: GOLD, letterSpacing: "0.08em" }}>
                  Sketch approved — Design Plan is now unlocked
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: action buttons */}
      {sketch && !isApproved && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: `1px solid ${BORDER}`,
            flexShrink: 0,
            display: "flex",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => void approve(sketch.id)}
            disabled={approving || dismissing}
            style={{
              flex: 1,
              padding: "8px 14px",
              borderRadius: 5,
              background: approving
                ? `color-mix(in oklab, ${GOLD} 10%, transparent)`
                : `color-mix(in oklab, ${GOLD} 16%, transparent)`,
              border: `1px solid color-mix(in oklab, ${GOLD} 35%, transparent)`,
              color: GOLD,
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: approving || dismissing ? "not-allowed" : "pointer",
              opacity: approving || dismissing ? 0.6 : 1,
              transition: "background 0.15s",
            }}
          >
            {approving ? "Approving…" : "Accept Sketch"}
          </button>

          <button
            type="button"
            onClick={() => void dismiss(sketch.id)}
            disabled={approving || dismissing}
            style={{
              padding: "8px 12px",
              borderRadius: 5,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: MUTED,
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.08em",
              cursor: approving || dismissing ? "not-allowed" : "pointer",
              opacity: approving || dismissing ? 0.5 : 1,
              transition: "color 0.15s",
            }}
          >
            {dismissing ? "…" : "Dismiss"}
          </button>

          <button
            type="button"
            onClick={() => { void dismiss(sketch.id).then(() => generate()); }}
            disabled={approving || dismissing || generating}
            title="Generate a new sketch"
            style={{
              padding: "8px 10px",
              borderRadius: 5,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: MUTED,
              cursor: approving || dismissing || generating ? "not-allowed" : "pointer",
              opacity: approving || dismissing || generating ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
        </div>
      )}

      {/* Regenerate when approved */}
      {sketch && isApproved && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: `1px solid ${BORDER}`,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => { void dismiss(sketch.id).then(() => generate()); }}
            disabled={dismissing || generating}
            style={{
              padding: "6px 14px",
              borderRadius: 5,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              color: MUTED,
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.08em",
              cursor: dismissing || generating ? "not-allowed" : "pointer",
              opacity: dismissing || generating ? 0.5 : 1,
            }}
          >
            {generating ? "Generating…" : "Regenerate"}
          </button>
        </div>
      )}
    </div>
  );
}
