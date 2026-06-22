import { useState } from "react";
import { useLocation } from "wouter";
import { getLinkedRepoFullName } from "@/lib/githubRepo";

const sMono = { fontFamily: "'IBM Plex Mono', var(--app-font-mono)" } as const;

export type StagingProject = {
  id: number;
  name: string;
  description?: string | null;
  status?: string | null;
  createdAt: string | Date;
  linkedRepo?: string | null;
};

type Props = {
  project: StagingProject | null;
  onClose: () => void;
  onCommit: (id: number) => Promise<void>;
  onRemove: (id: number) => void;
};

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <span style={{
        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: done ? "rgba(74,222,128,0.12)" : "rgba(120,113,108,0.08)",
        border: `1px solid ${done ? "rgba(74,222,128,0.35)" : "rgba(120,113,108,0.25)"}`,
        fontSize: 9, color: done ? "rgba(74,222,128,0.9)" : "rgba(120,113,108,0.5)",
      }}>
        {done ? "✓" : "○"}
      </span>
      <span style={{
        ...sMono, fontSize: 11, letterSpacing: "0.04em",
        color: done ? "var(--atlas-fg)" : "rgba(120,113,108,0.6)",
        opacity: done ? 0.85 : 1,
      }}>
        {label}
      </span>
    </div>
  );
}

export function ProjectStagingSheet({ project, onClose, onCommit, onRemove }: Props) {
  const [, setLocation] = useLocation();
  const [committing, setCommitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  if (!project) return null;

  const isGitHub = !!project.linkedRepo;
  const repoFullName = isGitHub ? (getLinkedRepoFullName(project.linkedRepo) ?? project.linkedRepo) : null;
  const hasName = !!(project.name?.trim());
  const hasDescription = !!(project.description?.trim());
  const canCommit = hasName;

  const handleCommit = async () => {
    setCommitting(true);
    setCommitError(null);
    try {
      await onCommit(project.id);
      onClose();
      setLocation(`/project/${project.id}`);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Activation failed — try again");
    } finally {
      setCommitting(false);
    }
  };

  const handleRemove = () => {
    setRemoving(true);
    onRemove(project.id);
    onClose();
  };

  const handleResumeShaping = () => {
    onClose();
    setLocation(`/project/${project.id}?shape=1`);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 200,
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          zIndex: 201,
          background: "var(--atlas-bg)",
          borderTop: "1px solid var(--atlas-border)",
          borderRadius: "16px 16px 0 0",
          padding: "0 0 env(safe-area-inset-bottom)",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(120,113,108,0.3)" }} />
        </div>

        <div style={{ padding: "16px 20px 28px" }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Origin badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                {isGitHub ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ color: "rgba(74,222,128,0.7)", flexShrink: 0 }}>
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(201,162,76,0.7)", flexShrink: 0 }}>
                    <path d="M2 4h12M2 8h8M2 12h6" />
                  </svg>
                )}
                <span style={{
                  ...sMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: isGitHub ? "rgba(74,222,128,0.7)" : "rgba(201,162,76,0.7)",
                }}>
                  {isGitHub ? "GitHub import" : "Atlas recognized"}
                </span>
              </div>

              {/* Name */}
              <div style={{
                fontFamily: "var(--app-font-sans)", fontSize: 20, fontWeight: 600,
                color: hasName ? "var(--atlas-fg)" : "rgba(120,113,108,0.5)",
                fontStyle: hasName ? "normal" : "italic",
                letterSpacing: "-0.01em", lineHeight: 1.2,
              }}>
                {hasName ? project.name : "Untitled project"}
              </div>

              {repoFullName && (
                <div style={{ ...sMono, fontSize: 10, color: "var(--atlas-muted)", opacity: 0.55, marginTop: 3 }}>
                  {repoFullName}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "1px solid var(--atlas-border)",
                borderRadius: 6, padding: "5px 8px", cursor: "pointer",
                color: "var(--atlas-muted)", fontSize: 14, lineHeight: 1, flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Status banner */}
          <div style={{
            background: "rgba(201,162,76,0.06)", border: "1px solid rgba(201,162,76,0.15)",
            borderRadius: 8, padding: "8px 12px", marginBottom: 18,
          }}>
            <span style={{ ...sMono, fontSize: 10, letterSpacing: "0.08em", color: "rgba(201,162,76,0.75)", textTransform: "uppercase" }}>
              Shaping · not yet a workspace
            </span>
          </div>

          {/* Checklist */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ ...sMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.5, marginBottom: 8 }}>
              Project readiness
            </div>
            <CheckItem done={isGitHub} label={isGitHub ? "Repository connected" : "Origin identified"} />
            <CheckItem done={hasName} label={hasName ? `Name: ${project.name}` : "Name needed"} />
            <CheckItem done={hasDescription} label={hasDescription ? "Goal defined" : "Goal / description needed"} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={handleResumeShaping}
              style={{
                width: "100%", padding: "12px 16px",
                background: "transparent",
                border: "1px solid var(--atlas-border)",
                borderRadius: 8, cursor: "pointer",
                fontFamily: "var(--app-font-sans)", fontSize: 14, fontWeight: 500,
                color: "var(--atlas-fg)", textAlign: "left",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "all 140ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(201,162,76,0.35)"; e.currentTarget.style.background = "rgba(201,162,76,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--atlas-border)"; e.currentTarget.style.background = "transparent"; }}
            >
              Resume Shaping
              <span style={{ ...sMono, fontSize: 9, color: "var(--atlas-muted)", opacity: 0.5 }}>CONTINUE</span>
            </button>

            <button
              onClick={handleCommit}
              disabled={!canCommit || committing}
              title={!canCommit ? "Add a name before committing" : undefined}
              style={{
                width: "100%", padding: "12px 16px",
                background: canCommit ? "rgba(201,162,76,0.1)" : "rgba(120,113,108,0.06)",
                border: `1px solid ${canCommit ? "rgba(201,162,76,0.4)" : "rgba(120,113,108,0.2)"}`,
                borderRadius: 8, cursor: canCommit ? "pointer" : "not-allowed",
                fontFamily: "var(--app-font-sans)", fontSize: 14, fontWeight: 600,
                color: canCommit ? "var(--atlas-gold)" : "rgba(120,113,108,0.4)",
                textAlign: "left",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "all 140ms ease",
              }}
            >
              {committing ? "Committing…" : "Commit Project"}
              <span style={{ ...sMono, fontSize: 9, color: canCommit ? "rgba(201,162,76,0.55)" : "rgba(120,113,108,0.3)" }}>
                {canCommit ? "CREATE WORKSPACE →" : "NAME REQUIRED"}
              </span>
            </button>

            {commitError && (
              <div style={{
                padding: "8px 12px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 6,
                ...sMono, fontSize: 11, color: "rgba(252,165,165,0.9)", lineHeight: 1.5,
              }}>
                {commitError}
              </div>
            )}

            <button
              onClick={handleRemove}
              disabled={removing}
              style={{
                width: "100%", padding: "10px 16px",
                background: "transparent",
                border: "1px solid transparent",
                borderRadius: 8, cursor: "pointer",
                fontFamily: "var(--app-font-sans)", fontSize: 13,
                color: "rgba(252,165,165,0.55)",
                transition: "all 140ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = "rgba(252,165,165,0.8)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.color = "rgba(252,165,165,0.55)"; }}
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
