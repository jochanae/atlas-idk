// ConversationsLauncher — global mount for the Conversation Library
// destination. Listens for `axiom:launcher-conversations`. Lists real
// sessions across all projects (most recent first), ordered by
// updatedAt. Tap a session → navigates into its project workspace.

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useListProjects,
  useListSessions,
  type Project,
  type Session,
} from "@workspace/api-client-react";
import { LauncherOverlay } from "@/components/LauncherOverlay";
import { relativeTime } from "@/lib/atlas-utils";

export function ConversationsLauncher() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { data: projectsRaw } = useListProjects();
  const projects = useMemo(
    () => (Array.isArray(projectsRaw) ? projectsRaw : []),
    [projectsRaw],
  );

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("axiom:launcher-conversations", onOpen);
    return () => window.removeEventListener("axiom:launcher-conversations", onOpen);
  }, []);

  return (
    <LauncherOverlay
      open={open}
      onClose={() => setOpen(false)}
      eyebrow="Conversations"
      title="All sessions"
    >
      {projects.length === 0 ? (
        <EmptyState body="No projects yet — create one to start a conversation." />
      ) : (
        <ProjectSessionsList
          projects={projects}
          onOpen={(projectId) => { setOpen(false); setLocation(`/project/${projectId}`); }}
        />
      )}
    </LauncherOverlay>
  );
}

function ProjectSessionsList({
  projects, onOpen,
}: {
  projects: Project[];
  onOpen: (projectId: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {projects.map((p) => (
        <ProjectGroup key={p.id} project={p} onOpen={onOpen} />
      ))}
    </div>
  );
}

function ProjectGroup({
  project, onOpen,
}: {
  project: Project;
  onOpen: (projectId: number) => void;
}) {
  const { data: sessions = [], isLoading } = useListSessions(project.id);
  const list = sessions as Session[];
  if (isLoading || list.length === 0) return null;

  return (
    <div>
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 9.5,
        letterSpacing: "0.22em", textTransform: "uppercase",
        color: "rgba(var(--atlas-gold-rgb),0.7)",
        padding: "0 2px 8px",
      }}>
        {project.name}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
        {list.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onOpen(project.id)}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                padding: "10px 12px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 9,
                color: "var(--atlas-fg)", fontSize: 13,
                fontFamily: "var(--app-font-sans)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: "#06B6D4",
                  boxShadow: "0 0 6px rgba(6,182,212,0.55)",
                }} />
                <span style={{
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {s.title || `Session ${s.id}`}
                </span>
              </span>
              <span style={{
                fontFamily: "var(--app-font-mono)", fontSize: 9.5,
                color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em",
                flexShrink: 0,
              }}>
                {relativeTime(s.updatedAt || s.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ body }: { body: string }) {
  return (
    <div style={{
      padding: "32px 8px", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: "rgba(6,182,212,0.08)",
        border: "1px solid rgba(6,182,212,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#06B6D4",
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.55)", maxWidth: 380, lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}

export default ConversationsLauncher;
