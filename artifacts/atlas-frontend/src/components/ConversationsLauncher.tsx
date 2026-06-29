// ConversationsLauncher — global mount for the Conversation Library
// destination. Listens for `axiom:launcher-conversations`. The full
// library isn't implemented yet, so this renders a "Coming soon"
// placeholder with a graceful escape hatch to project workspaces —
// never silently routing to Home.

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { LauncherOverlay } from "@/components/LauncherOverlay";

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
      title="Conversation Library"
    >
      <div style={{
        padding: "24px 8px 8px", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
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
        <div style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9.5,
          letterSpacing: "0.24em", textTransform: "uppercase",
          color: "rgba(var(--atlas-gold-rgb),0.7)",
        }}>
          Coming soon
        </div>
        <div style={{ fontSize: 15, color: "var(--atlas-fg)", fontWeight: 500 }}>
          A unified browser for every conversation
        </div>
        <p style={{
          margin: 0, fontSize: 13, color: "rgba(255,255,255,0.5)",
          maxWidth: 380, lineHeight: 1.55,
        }}>
          Casual chats and active workspaces, in one place — searchable, sortable,
          and ordered by recency. In the meantime, jump into a project workspace.
        </p>
      </div>

      {projects.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{
            fontFamily: "var(--app-font-mono)", fontSize: 9.5,
            letterSpacing: "0.22em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)", padding: "0 4px 10px",
          }}>
            Recent projects
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {projects.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => { setOpen(false); setLocation(`/project/${p.id}`); }}
                  style={{
                    width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "11px 14px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    color: "var(--atlas-fg)", fontSize: 13.5,
                    fontFamily: "var(--app-font-sans)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <span>{p.name}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--app-font-mono)", fontSize: 10 }}>›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </LauncherOverlay>
  );
}

export default ConversationsLauncher;
