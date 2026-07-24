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

// ─── constants ────────────────────────────────────────────────────────────────

const AMBER = "rgb(201,162,76)";
const VIOLET_CORE = "rgb(139,92,246)";
const VIOLET_RING = "rgb(167,139,250)";
const FONT_MONO = "var(--app-font-mono, 'Geist Mono', ui-monospace, monospace)";
const FONT_SANS = "var(--app-font-sans, 'Geist', ui-sans-serif, system-ui)";

/** Shaping signals shown in Joy Knows — awareness layer only. */
const SHAPING_TYPES: HudEventType[] = ["INTENT", "TENSION", "PROJECT", "MEMORY", "DECISION"];

/** Signals persisted to the API for session restoration. */
const PERSIST_TYPES: HudEventType[] = ["INTENT", "PROJECT", "MEMORY", "DECISION", "TENSION"];

const ALL_EVENT_TYPES: HudEventType[] = [
  "INTENT","MEMORY","DECISION","INGESTED","NAVIGATED","EXTRACTED","TENSION","PROJECT",
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function isHudType(v: unknown): v is HudEventType {
  return typeof v === "string" && ALL_EVENT_TYPES.includes(v as HudEventType);
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

type PersistedEntry = {
  id?: unknown; type?: unknown; content?: unknown; payload?: unknown;
  projectName?: unknown; at?: unknown; createdAt?: unknown;
  created_at?: unknown; timestamp?: unknown;
};

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

// ─── snapshot derivation ──────────────────────────────────────────────────────

type SnapshotRow = { label: string; value: string };

function deriveSnapshot(events: HudEvent[]): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  const latest = (type: HudEventType) => events.find(e => e.type === type);

  const intent   = latest("INTENT");
  const project  = latest("PROJECT");
  const memory   = latest("MEMORY");
  const decision = latest("DECISION");
  const tension  = latest("TENSION");

  if (intent)   rows.push({ label: "Topic",              value: intent.payload });
  if (project)  rows.push({ label: "Potential Project",  value: project.payload });
  if (memory)   rows.push({ label: "Memory recalled",    value: memory.payload });
  if (decision) rows.push({ label: "Constraint",         value: decision.payload });
  if (tension)  rows.push({ label: "Tension",            value: tension.payload });

  return rows;
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

function SnapshotPanel({
  rows,
  status,
  isRestored,
}: {
  rows: SnapshotRow[];
  status: string;
  isRestored: boolean;
}) {
  return (
    <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Snapshot rows */}
      {rows.map((row, i) => (
        <div key={i} style={{ padding: "5px 0", borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 2 }}>
            {row.label}
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 11, color: "rgba(255,255,255,0.68)", lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {row.value}
          </div>
        </div>
      ))}

      {/* Quiet status only — Phase B: no Stage labels (Exploration/Shaping/Forming) */}
      <div style={{ marginTop: rows.length > 0 ? 10 : 0, paddingTop: rows.length > 0 ? 8 : 0, borderTop: rows.length > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          {isRestored
            ? <span style={{ color: AMBER, opacity: 0.45, fontSize: 10, flexShrink: 0, marginTop: 1 }}>↺</span>
            : <VioletPulse />
          }
          <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: isRestored ? "rgba(255,255,255,0.35)" : VIOLET_RING, lineHeight: 1.5, letterSpacing: "0.02em" }}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export interface AtlasMemoryHUDProps {
  position?: { top?: number; right?: number };
  /** Nexus conversationId — enables persisting shaping events to the API. */
  conversationId?: string | null;
}

export function AtlasMemoryHUD({
  position = { top: 12, right: 12 },
  conversationId,
}: AtlasMemoryHUDProps) {
  const allEvents = useHudFeed();
  const [expanded, setExpanded] = useState(false);
  const docked = useHudDocked();

  const postedIdsRef     = useRef(new Set<string>());
  const apiLoadedIdsRef  = useRef(new Set<string>());
  const loadReqRef       = useRef(0);

  // ── Load persisted shaping events when conversationId changes ──
  useEffect(() => {
    if (conversationId === undefined) return;
    const req = ++loadReqRef.current;
    clearHudEvents();
    postedIdsRef.current = new Set();
    apiLoadedIdsRef.current = new Set();

    if (!conversationId) return;
    const ctrl = new AbortController();
    fetch(`/api/nexus/shaping?conversationId=${encodeURIComponent(conversationId)}`, {
      credentials: "include", signal: ctrl.signal,
    })
      .then(r => r.ok ? r.json() : { entries: [] })
      .then((data: unknown) => {
        if (loadReqRef.current !== req) return;
        const saved = normalizeEntries(data);
        postedIdsRef.current  = new Set(saved.map(e => e.id));
        apiLoadedIdsRef.current = new Set(saved.map(e => e.id));
        setHudEvents(saved);
      })
      .catch(err => { if (err instanceof DOMException && err.name === "AbortError") return; });
    return () => ctrl.abort();
  }, [conversationId]);

  // ── Persist new shaping events to API ──
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

  // ── Derived state ──
  const shapingEvents = allEvents.filter(e => SHAPING_TYPES.includes(e.type));
  const hasNewLiveEvents = shapingEvents.some(e => !apiLoadedIdsRef.current.has(e.id));
  const wasRestored = apiLoadedIdsRef.current.size > 0;
  const isRestored = wasRestored && !hasNewLiveEvents;

  const snapshot = deriveSnapshot(shapingEvents);
  const status   = isRestored
    ? "Picking up the thread."
    : "Listening…";

  if (docked || shapingEvents.length === 0) return null;

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
    const topSignal = shapingEvents[0];
    const pillLabel = snapshot[0]?.value ?? topSignal?.payload ?? "Joy Knows";
    return (
      <div style={wrapStyle}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand Joy Knows"
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
            boxShadow: !isRestored
              ? "0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(139,92,246,0.18)"
              : "0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,162,76,0.12)",
            cursor: "pointer",
            color: "inherit",
            maxWidth: 280,
          }}
        >
          {!isRestored ? <VioletPulse /> : <AmberDot />}
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pillLabel.length > 44 ? pillLabel.slice(0, 42) + "…" : pillLabel}
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
            {!isRestored ? <VioletPulse /> : <AmberDot />}
            <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.7)", letterSpacing: "-0.005em" }}>
              Joy Knows
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

        {/* Snapshot */}
        <SnapshotPanel
          rows={snapshot}
          status={status}
          isRestored={isRestored}
        />
      </div>
    </div>
  );
}

export default AtlasMemoryHUD;
