/**
 * CrystallizeSheet — handoff picker for Ask Atlas conversations.
 *
 * Three destination paths:
 *  1. New workspace  — creates a new project from this conversation
 *  2. Existing project — injects planning package into a chosen project
 *  3. Portfolio note — saves as a standalone insight (no project needed)
 *
 * The backend POST /api/nexus/handoff handles all three; it accepts an
 * optional projectId — if omitted it creates a new project, if provided
 * it injects into the existing one.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { Project } from "@workspace/api-client-react";
import type { NexusHandoffSignal } from "@/hooks/useNexusChatStream";

export type CrystallizeDestination =
  | { type: "new" }
  | { type: "existing"; projectId: number; projectName: string }
  | { type: "portfolio" };

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  handoffSignal?: NexusHandoffSignal | null;
  hasConversation: boolean;
  onNewWorkspace: () => void;
  onExistingProject: (projectId: number, projectName: string) => Promise<void>;
  onPortfolioNote: () => Promise<void>;
}

export function CrystallizeSheet({
  open,
  onClose,
  projects,
  handoffSignal,
  hasConversation,
  onNewWorkspace,
  onExistingProject,
  onPortfolioNote,
}: Props) {
  const [phase, setPhase] = useState<"pick" | "projects" | "loading" | "done">("pick");
  const [successLabel, setSuccessLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => { setPhase("pick"); setError(null); }, 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleNewWorkspace = useCallback(() => {
    onClose();
    onNewWorkspace();
  }, [onClose, onNewWorkspace]);

  const handleExistingProject = useCallback(async (projectId: number, projectName: string) => {
    setPhase("loading");
    setError(null);
    try {
      await onExistingProject(projectId, projectName);
      setSuccessLabel(projectName);
      setPhase("done");
      setTimeout(() => onClose(), 1400);
    } catch {
      setError("Something went wrong — please try again.");
      setPhase("projects");
    }
  }, [onExistingProject, onClose]);

  const handlePortfolioNote = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      await onPortfolioNote();
      setSuccessLabel("Portfolio");
      setPhase("done");
      setTimeout(() => onClose(), 1400);
    } catch {
      setError("Something went wrong — please try again.");
      setPhase("pick");
    }
  }, [onPortfolioNote, onClose]);

  const suggestedName = handoffSignal?.projectName?.trim();

  if (!open && phase === "pick") return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 9998,
          opacity: open ? 1 : 0,
          transition: "opacity 220ms ease",
          backdropFilter: "blur(2px)",
        }}
        aria-hidden
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Crystallize conversation"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: "hsl(var(--card))",
          borderTop: "1px solid rgba(var(--atlas-gold-rgb), 0.18)",
          borderRadius: "16px 16px 0 0",
          padding: "0 0 calc(env(safe-area-inset-bottom, 0px) + 16px)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "82dvh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.45)",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(var(--atlas-gold-rgb),0.2)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "14px 20px 10px", borderBottom: "0.5px solid rgba(var(--atlas-gold-rgb),0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {phase === "projects" && (
                  <button
                    type="button"
                    onClick={() => setPhase("pick")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px 2px 0", color: "var(--atlas-muted)" }}
                    aria-label="Back"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                )}
                <span style={{
                  fontFamily: "var(--app-font-mono, monospace)",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--atlas-gold)",
                  fontWeight: 600,
                }}>
                  {phase === "projects" ? "Choose project" : "Crystallize"}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--atlas-muted)", marginTop: 3, lineHeight: 1.4 }}>
                {phase === "pick"
                  ? "Where should this conversation go?"
                  : phase === "projects"
                    ? "Select a project to enrich with this conversation"
                    : phase === "loading"
                      ? "Packaging your conversation…"
                      : `Added to ${successLabel}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--atlas-muted)", flexShrink: 0 }}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {suggestedName && phase === "pick" && (
            <div style={{
              marginTop: 8,
              padding: "5px 10px",
              background: "rgba(var(--atlas-gold-rgb),0.07)",
              border: "1px solid rgba(var(--atlas-gold-rgb),0.18)",
              borderRadius: 6,
              fontSize: 11.5,
              fontFamily: "var(--app-font-mono, monospace)",
              color: "var(--atlas-gold)",
              letterSpacing: "0.04em",
            }}>
              Atlas detected: <strong>{suggestedName}</strong>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>

          {/* Error */}
          {error && (
            <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(252,165,165,0.9)", fontSize: 12 }}>
              {error}
            </div>
          )}

          {/* Phase: pick */}
          {phase === "pick" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {/* New workspace */}
              {hasConversation && (
                <DestinationCard
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6.5h5l2 2H20v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                      <path d="M12 12v5M9.5 14.5h5" />
                    </svg>
                  }
                  label="New workspace"
                  description="Create a new project from this conversation"
                  accent
                  onClick={handleNewWorkspace}
                />
              )}

              {/* Add to existing */}
              {projects.length > 0 && (
                <DestinationCard
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v8M8 12h8" />
                    </svg>
                  }
                  label="Add to existing project"
                  description="Inject this thinking into a workspace you already have"
                  onClick={() => setPhase("projects")}
                  chevron
                />
              )}

              {/* Portfolio note */}
              <DestinationCard
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                }
                label="Portfolio note"
                description="Save as a standalone insight — no project needed yet"
                onClick={handlePortfolioNote}
              />
            </div>
          )}

          {/* Phase: projects list */}
          {phase === "projects" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleExistingProject(p.id, p.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "11px 14px",
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(var(--atlas-gold-rgb),0.1)",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 140ms ease, background 140ms ease",
                  }}
                  onPointerEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(var(--atlas-gold-rgb),0.3)";
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(var(--atlas-gold-rgb),0.05)";
                  }}
                  onPointerLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(var(--atlas-gold-rgb),0.1)";
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.025)";
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "rgba(var(--atlas-gold-rgb),0.08)",
                    border: "1px solid rgba(var(--atlas-gold-rgb),0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--atlas-gold-rgb),0.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6.5h5l2 2H20v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--atlas-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </div>
                    {(p as any).description && (
                      <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(p as any).description}
                      </div>
                    )}
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--atlas-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Phase: loading */}
          {phase === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                border: "2px solid rgba(var(--atlas-gold-rgb),0.15)",
                borderTop: "2px solid var(--atlas-gold)",
                animation: "crystallize-spin 0.9s linear infinite",
              }} />
              <span style={{ fontSize: 13, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono, monospace)", letterSpacing: "0.05em" }}>
                Extracting insights…
              </span>
              <style>{`@keyframes crystallize-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Phase: done */}
          {phase === "done" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "rgba(var(--atlas-gold-rgb),0.1)",
                border: "1px solid rgba(var(--atlas-gold-rgb),0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--atlas-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span style={{ fontSize: 13, color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono, monospace)", letterSpacing: "0.05em" }}>
                Added to {successLabel}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DestinationCard({
  icon,
  label,
  description,
  onClick,
  accent = false,
  chevron = false,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  accent?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "14px 16px",
        background: accent ? "rgba(var(--atlas-gold-rgb),0.07)" : "rgba(255,255,255,0.025)",
        border: `1px solid ${accent ? "rgba(var(--atlas-gold-rgb),0.25)" : "rgba(var(--atlas-gold-rgb),0.1)"}`,
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        transition: "border-color 140ms ease, background 140ms ease",
      }}
      onPointerEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(var(--atlas-gold-rgb),0.4)";
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(var(--atlas-gold-rgb),0.1)";
      }}
      onPointerLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = accent ? "rgba(var(--atlas-gold-rgb),0.25)" : "rgba(var(--atlas-gold-rgb),0.1)";
        (e.currentTarget as HTMLButtonElement).style.background = accent ? "rgba(var(--atlas-gold-rgb),0.07)" : "rgba(255,255,255,0.025)";
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: accent ? "rgba(var(--atlas-gold-rgb),0.12)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${accent ? "rgba(var(--atlas-gold-rgb),0.3)" : "rgba(255,255,255,0.07)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        color: accent ? "var(--atlas-gold)" : "var(--atlas-muted)",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: accent ? "var(--atlas-gold)" : "var(--atlas-fg)", lineHeight: 1.3 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--atlas-muted)", marginTop: 2, lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
      {chevron && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--atlas-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </button>
  );
}
