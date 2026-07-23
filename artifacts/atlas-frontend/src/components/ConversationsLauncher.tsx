// ConversationsLauncher — Ask Atlas · History.
// Global mount listening for `axiom:launcher-conversations`. Lists every
// session across projects, grouped by recency, with smart titles derived
// from the session title (falls back to `Session N`). A pinned "Atlas
// Portfolio" section reserves space for project-less Atlas threads
// (project_id === null) once the Ask Atlas overlay starts persisting
// them.

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

type EnrichedSession = Session & {
  projectId: number;
  projectName: string;
  badgeColor: string;
};

const PROJECT_DOT_PALETTE = [
  "#06B6D4", "#D4AF37", "#A78BFA", "#34D399",
  "#F472B6", "#FB923C", "#60A5FA", "#FCA5A5",
];

function colorFor(projectId: number): string {
  return PROJECT_DOT_PALETTE[projectId % PROJECT_DOT_PALETTE.length];
}

function smartTitle(s: Session): string {
  const raw = (s.title ?? "").trim();
  // Strip noisy auto-titles like "Session 1", "Session #4", "session 12".
  if (raw && !/^session\s*#?\s*\d+$/i.test(raw)) {
    return raw.length > 56 ? raw.slice(0, 53).trimEnd() + "…" : raw;
  }
  return `Session ${s.id}`;
}

function bucketFor(ts: string | number | null | undefined): "today" | "yesterday" | "earlier" {
  if (!ts) return "earlier";
  const t = typeof ts === "string" ? new Date(ts).getTime() : Number(ts);
  if (!isFinite(t) || t <= 0) return "earlier";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  if (t >= startToday) return "today";
  if (t >= startYesterday) return "yesterday";
  return "earlier";
}

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
      eyebrow="Ask Joy"
      title="Conversation history"
    >
      {projects.length === 0 ? (
        <EmptyState body="No conversations yet — start one from the radial menu or any project." />
      ) : (
        <UnifiedHistory
          projects={projects}
          onOpen={(projectId) => { setOpen(false); setLocation(`/project/${projectId}`); }}
        />
      )}
    </LauncherOverlay>
  );
}

function UnifiedHistory({
  projects, onOpen,
}: {
  projects: Project[];
  onOpen: (projectId: number) => void;
}) {
  // Fan out one hook per project (hooks must be at the top of a component,
  // so we render a per-project collector component and hoist its data via
  // window-scoped state is awkward — instead we render the per-project
  // collectors and let them call back into shared state).
  const [byProject, setByProject] = useState<Record<number, EnrichedSession[]>>({});

  // Reset when project list identity changes.
  const projectKey = projects.map((p) => p.id).join(",");
  useEffect(() => { setByProject({}); }, [projectKey]);

  const allSessions: EnrichedSession[] = useMemo(() => {
    const flat: EnrichedSession[] = [];
    for (const list of Object.values(byProject)) flat.push(...list);
    flat.sort((a, b) => {
      const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
    return flat;
  }, [byProject]);

  const grouped = useMemo(() => {
    const g = { today: [] as EnrichedSession[], yesterday: [] as EnrichedSession[], earlier: [] as EnrichedSession[] };
    for (const s of allSessions) {
      g[bucketFor(s.updatedAt || s.createdAt)].push(s);
    }
    return g;
  }, [allSessions]);

  return (
    <>
      {/* Per-project data collectors (render nothing visible). */}
      {projects.map((p) => (
        <ProjectCollector
          key={p.id}
          project={p}
          onLoaded={(rows) => setByProject((prev) => ({ ...prev, [p.id]: rows }))}
        />
      ))}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Atlas Portfolio — reserved pinned section. Populates once project-less
            Ask Atlas threads start persisting. Hidden until then. */}
        <AtlasPortfolioSection />

        <RecencyGroup label="Today" items={grouped.today} onOpen={onOpen} />
        <RecencyGroup label="Yesterday" items={grouped.yesterday} onOpen={onOpen} />
        <RecencyGroup label="Earlier" items={grouped.earlier} onOpen={onOpen} />
      </div>
    </>
  );
}

function ProjectCollector({
  project, onLoaded,
}: {
  project: Project;
  onLoaded: (rows: EnrichedSession[]) => void;
}) {
  const { data: sessions = [] } = useListSessions(project.id);
  const list = sessions as Session[];
  useEffect(() => {
    const enriched: EnrichedSession[] = list.map((s) => ({
      ...s,
      projectId: project.id,
      projectName: project.name,
      badgeColor: colorFor(project.id),
    }));
    onLoaded(enriched);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, project.id, project.name]);
  return null;
}

function AtlasPortfolioSection() {
  // Reserved slot. The Ask Atlas overlay will persist portfolio-scope
  // conversations (project_id === null) and surface them here. Until that
  // wiring lands, this stays hidden so the section doesn't render an empty
  // header. Keep the structure ready so the future wiring is a one-line
  // change.
  const portfolioThreads: EnrichedSession[] = [];
  if (portfolioThreads.length === 0) return null;
  return (
    <div>
      <SectionHeader label="⭐ Atlas Portfolio" gold />
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
        {portfolioThreads.map((s) => (
          <SessionRow key={`p-${s.id}`} s={s} onOpen={() => {}} />
        ))}
      </ul>
    </div>
  );
}

function RecencyGroup({
  label, items, onOpen,
}: {
  label: string;
  items: EnrichedSession[];
  onOpen: (projectId: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionHeader label={label} />
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
        {items.map((s) => (
          <SessionRow key={`${s.projectId}-${s.id}`} s={s} onOpen={() => onOpen(s.projectId)} />
        ))}
      </ul>
    </div>
  );
}

function SectionHeader({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <div style={{
      fontFamily: "var(--app-font-mono)", fontSize: 9.5,
      letterSpacing: "0.22em", textTransform: "uppercase",
      color: gold ? "rgba(var(--atlas-gold-rgb),0.9)" : "rgba(255,255,255,0.45)",
      padding: "0 2px 8px",
    }}>
      {label}
    </div>
  );
}

function SessionRow({ s, onOpen }: { s: EnrichedSession; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        style={{
          width: "100%", textAlign: "left", cursor: "pointer",
          padding: "10px 12px 10px 14px",
          background: "color-mix(in oklab, var(--atlas-gold) 3%, transparent)",
          border: "1px solid color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
          borderRadius: 9,
          color: "var(--atlas-fg)", fontSize: 13,
          fontFamily: "var(--app-font-sans)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10,
          position: "relative",
          transition: "background 160ms ease, border-color 160ms ease",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 10, bottom: 10, width: 2,
            background: "linear-gradient(180deg, color-mix(in oklab, var(--atlas-gold) 55%, transparent), color-mix(in oklab, var(--atlas-gold) 12%, transparent))",
            borderRadius: 2,
          }}
        />
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: s.badgeColor,
            boxShadow: `0 0 6px ${s.badgeColor}88`,
          }} />
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display: "flex", alignItems: "baseline", gap: 8, minWidth: 0,
          }}>
            <span style={{
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{smartTitle(s)}</span>
            <span style={{
              fontFamily: "var(--app-font-mono)", fontSize: 9,
              color: "rgba(255,255,255,0.38)", letterSpacing: "0.08em",
              textTransform: "uppercase", flexShrink: 0,
            }}>
              {s.projectName}
            </span>
          </span>
        </span>
        <span style={{
          fontFamily: "var(--app-font-mono)", fontSize: 9.5,
          color: "color-mix(in oklab, var(--atlas-gold) 55%, var(--atlas-muted))", letterSpacing: "0.06em",
          flexShrink: 0,
        }}>
          {relativeTime(s.updatedAt || s.createdAt)}
        </span>
      </button>
    </li>
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
        background: "rgba(212,175,55,0.08)",
        border: "1px solid rgba(212,175,55,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--atlas-gold)",
        fontFamily: "var(--app-font-serif, Georgia, serif)",
        fontSize: 24, fontWeight: 600,
      }}>
        A
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.55)", maxWidth: 380, lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}

export default ConversationsLauncher;
