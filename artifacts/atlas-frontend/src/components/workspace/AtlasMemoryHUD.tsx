import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useHudFeed } from "@/hooks/useHudFeed";
import {
  clearHudEvents,
  setHudDocked,
  setHudEvents,
  useHudDocked,
  type HudEvent,
  type HudEventType,
} from "@/lib/hudBus";
import { useProjectResume } from "@/hooks/useProjectResume";

// ─── constants ────────────────────────────────────────────────────────────────

const AMBER = "rgb(201,162,76)";
const VIOLET_CORE = "rgb(139,92,246)";
const VIOLET_RING = "rgb(167,139,250)";
const FONT_MONO = "var(--app-font-mono, 'Geist Mono', ui-monospace, monospace)";
const FONT_SANS = "var(--app-font-sans, 'Geist', ui-sans-serif, system-ui)";
const IDLE_MS = 8000;

/** Human-readable label for each HUD event type. */
const ACTIVITY_LABEL: Record<HudEventType, string> = {
  INTENT:    "Capturing intent",
  PROJECT:   "Shaping",
  MEMORY:    "Writing to memory",
  DECISION:  "Recording decision",
  INGESTED:  "Ingesting context",
  EXTRACTED: "Materializing",
  TENSION:   "Flagging tension",
  NAVIGATED: "Navigating",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const delta = Date.now() - Date.parse(iso);
  if (!isFinite(delta) || delta < 0) return "";
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

// ─── persistence helpers (shaping entries saved to API) ──────────────────────

type PersistedEntry = {
  id?: unknown; type?: unknown; content?: unknown; payload?: unknown;
  projectName?: unknown; at?: unknown; createdAt?: unknown;
  created_at?: unknown; timestamp?: unknown;
};
const PERSIST_TYPES: HudEventType[] = ["INTENT", "NAVIGATED", "PROJECT"];
const ALL_EVENT_TYPES: HudEventType[] = [
  "INTENT","MEMORY","DECISION","INGESTED","NAVIGATED","EXTRACTED","TENSION","PROJECT"
];

function isHudType(v: unknown): v is HudEventType {
  return typeof v === "string" && ALL_EVENT_TYPES.includes(v as HudEventType);
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function normalizeEntries(data: unknown): HudEvent[] {
  const container = data && typeof data === "object" ? data as Record<string, unknown> : null;
  const raw = Array.isArray(data) ? data
    : Array.isArray(container?.entries) ? container.entries as unknown[]
    : Array.isArray(container?.items) ? container.items as unknown[]
    : [];

  return raw.flatMap((item, i): HudEvent[] => {
    if (!item || typeof item !== "object") return [];
    const e = item as PersistedEntry;
    if (!isHudType(e.type) || !PERSIST_TYPES.includes(e.type)) return [];
    const payload = str(e.content) ?? str(e.payload);
    if (!payload) return [];
    const at = str(e.at) ?? str(e.createdAt) ?? str(e.created_at) ?? str(e.timestamp) ?? new Date().toISOString();
    const id = str(e.id) ?? (typeof e.id === "number" ? String(e.id) : `${at}-${e.type}-${i}`);
    const projectName = str(e.projectName);
    return [{ id, type: e.type, payload, ...(projectName ? { projectName } : {}), at }];
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

// ─── sub-components ───────────────────────────────────────────────────────────

function VioletPulse() {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 7, height: 7, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: VIOLET_RING, opacity: 0.5, animation: "amhud-ping 1.6s cubic-bezier(0,0,0.2,1) infinite" }} />
      <span style={{ position: "relative", display: "inline-block", width: 7, height: 7, borderRadius: 999, background: VIOLET_CORE, boxShadow: "0 0 7px rgba(139,92,246,0.7)" }} />
      <style>{`@keyframes amhud-ping { 0%{transform:scale(1);opacity:.6} 75%,100%{transform:scale(2.2);opacity:0} }`}</style>
    </span>
  );
}

function AmberDot() {
  return (
    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: AMBER, boxShadow: "0 0 5px rgba(201,162,76,0.6)", flexShrink: 0 }} />
  );
}

function IBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label}
      style={{ padding: 4, background: "transparent", border: "none", color: "rgba(255,255,255,0.28)", cursor: "pointer", display: "inline-flex", alignItems: "center", borderRadius: 4 }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.28)"; }}
    >{children}</button>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ padding: "8px 12px 4px", fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)" }}>
      {children}
    </div>
  );
}

function ActivityRow({ ev, dimmed }: { ev: HudEvent; dimmed?: boolean }) {
  return (
    <div style={{ padding: "7px 12px", display: "flex", alignItems: "flex-start", gap: 10, opacity: dimmed ? 0.45 : 1 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: VIOLET_RING, marginTop: 2, flexShrink: 0 }}>
        {ACTIVITY_LABEL[ev.type] ?? ev.type}
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.35, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ev.payload}
      </span>
    </div>
  );
}

function MemoryBlock({ brief }: { brief: NonNullable<ReturnType<typeof useProjectResume>["data"]> }) {
  const updated = relTime(brief.generatedAt);

  // Build "Known" bullets: intent + audience, deduplicated
  const knownFacts: string[] = [];
  if (brief.intent) knownFacts.push(brief.intent);
  if (brief.audience) knownFacts.push(brief.audience);

  return (
    <div style={{ padding: "6px 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Project name */}
      <div style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {brief.projectName}
      </div>

      {/* Known facts */}
      {knownFacts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>
            Known
          </span>
          {knownFacts.map((fact, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span style={{ color: AMBER, opacity: 0.65, fontSize: 10, flexShrink: 0, marginTop: 1 }}>✓</span>
              <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.45 }}>
                {fact.length > 80 ? fact.slice(0, 77) + "…" : fact}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Open questions */}
      {brief.openQuestions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>
            Open Questions
          </span>
          {brief.openQuestions.slice(0, 3).map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, flexShrink: 0, marginTop: 1 }}>·</span>
              <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: "rgba(255,255,255,0.42)", lineHeight: 1.45 }}>
                {q.length > 80 ? q.slice(0, 77) + "…" : q}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Suggested next step */}
      {brief.suggestedFirstBuild && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: AMBER, opacity: 0.55 }}>
            Next Step
          </span>
          <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: "rgba(255,255,255,0.52)", lineHeight: 1.4 }}>
            {brief.suggestedFirstBuild.length > 100 ? brief.suggestedFirstBuild.slice(0, 97) + "…" : brief.suggestedFirstBuild}
          </span>
        </div>
      )}

      {/* Last imported timestamp */}
      {updated && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.18)" }}>
            Last imported
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "0.03em" }}>
            {updated}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export interface AtlasMemoryHUDProps {
  position?: { top?: number; right?: number };
  /** Nexus conversationId — enables persisting shaping events to the API. */
  conversationId?: string | null;
  /** Active project — enables Layer 2 persistent memory. */
  activeProjectId?: number | null;
  /**
   * Surface identity — controls the label shown in the expanded header.
   * "activity" → Home: "Atlas · Activity"   (event-driven, ephemeral)
   * "memory"   → Workspace: "Atlas · Memory" (persistent, resume-powered)
   */
  surface?: "activity" | "memory";
}

export function AtlasMemoryHUD({
  position = { top: 12, right: 12 },
  conversationId,
  activeProjectId,
  surface = "memory",
}: AtlasMemoryHUDProps) {
  const allEvents = useHudFeed();
  const { data: resumeBrief } = useProjectResume(activeProjectId);
  const [expanded, setExpanded] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const docked = useHudDocked();

  const lastEventIdRef = useRef<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postedIdsRef = useRef(new Set<string>());
  const loadReqRef = useRef(0);

  // ── Load persisted shaping events when conversationId changes ──
  useEffect(() => {
    if (conversationId === undefined) return;
    const req = ++loadReqRef.current;
    clearHudEvents();
    postedIdsRef.current = new Set();

    if (!conversationId) return;
    const ctrl = new AbortController();
    fetch(`/api/nexus/shaping?conversationId=${encodeURIComponent(conversationId)}`, {
      credentials: "include", signal: ctrl.signal,
    })
      .then(r => r.ok ? r.json() : { entries: [] })
      .then((data: unknown) => {
        if (loadReqRef.current !== req) return;
        const saved = normalizeEntries(data);
        postedIdsRef.current = new Set(saved.map(e => e.id));
        setHudEvents(saved);
      })
      .catch(err => { if (err instanceof DOMException && err.name === "AbortError") return; });
    return () => ctrl.abort();
  }, [conversationId]);

  // ── Persist new events to API ──
  useEffect(() => {
    if (!conversationId) return;
    const next = allEvents.filter(e => PERSIST_TYPES.includes(e.type) && !postedIdsRef.current.has(e.id));
    for (const ev of next) {
      postedIdsRef.current.add(ev.id);
      void fetch("/api/nexus/shaping", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, type: ev.type, content: ev.payload, projectName: ev.projectName }),
      });
    }
  }, [allEvents, conversationId]);

  // ── Activity tracking — flip isActive on new events, clear after IDLE_MS ──
  useEffect(() => {
    const latest = allEvents[0];
    if (!latest || latest.id === lastEventIdRef.current) return;
    lastEventIdRef.current = latest.id;
    setIsActive(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIsActive(false), IDLE_MS);
  }, [allEvents]);

  useEffect(() => () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); }, []);

  // ── Derived display state ──
  const activityEvents = allEvents.filter(e => e.type !== "NAVIGATED");
  // On home (surface="activity") stay visible for the whole conversation once events arrive.
  // On workspace (surface="memory") respect the 8 s idle fade.
  const hasActivity = surface === "activity"
    ? activityEvents.length > 0
    : isActive && activityEvents.length > 0;
  const hasMemory = !!resumeBrief;

  if (docked || (!hasActivity && !hasMemory)) return null;

  const wrapStyle: CSSProperties = {
    position: "absolute",
    top: position.top,
    right: position.right,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    maxWidth: 300,
    pointerEvents: "auto",
  };

  // ── Collapsed pill ──
  if (!expanded) {
    const latestActivity = activityEvents[0];
    return (
      <div style={wrapStyle}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand Atlas Memory"
          style={{
            height: 28,
            padding: "0 11px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.09)",
            background: "rgba(8,8,10,0.6)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: hasActivity
              ? "0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(139,92,246,0.18)"
              : "0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,162,76,0.12)",
            cursor: "pointer",
            color: "inherit",
            maxWidth: 280,
          }}
        >
          {hasActivity ? <VioletPulse /> : <AmberDot />}
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {hasActivity
              ? (latestActivity ? `${ACTIVITY_LABEL[latestActivity.type]} · ${latestActivity.payload.length > 40 ? latestActivity.payload.slice(0, 38) + "…" : latestActivity.payload}` : "Active…")
              : resumeBrief?.projectName ?? "Atlas knows"
            }
          </span>
        </button>
      </div>
    );
  }

  // ── Expanded panel ──
  return (
    <div style={wrapStyle}>
      <div style={{
        width: 280,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(8,8,10,0.68)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.08)",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasActivity ? <VioletPulse /> : <AmberDot />}
            <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.7)", letterSpacing: "-0.005em" }}>
              {surface === "activity" ? "Atlas · Activity" : "Atlas · Memory"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <IBtn label="Collapse" onClick={() => setExpanded(false)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14" />
              </svg>
            </IBtn>
            <IBtn label="Dismiss" onClick={() => { setExpanded(false); setHudDocked(true); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </IBtn>
          </div>
        </div>

        {/* Layer 1 — Live Activity */}
        {hasActivity && (
          <>
            <SectionLabel>Live Activity</SectionLabel>
            <div style={{ paddingBottom: hasMemory ? 4 : 8 }}>
              {activityEvents.slice(0, 3).map((ev, i) => (
                <ActivityRow key={ev.id} ev={ev} dimmed={i > 0} />
              ))}
            </div>
          </>
        )}

        {/* Divider between layers */}
        {hasActivity && hasMemory && (
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 0" }} />
        )}

        {/* Layer 2 — Persistent Memory */}
        {hasMemory && (
          <>
            <SectionLabel>Atlas Knows</SectionLabel>
            <MemoryBlock brief={resumeBrief} />
          </>
        )}
      </div>
    </div>
  );
}

export default AtlasMemoryHUD;
