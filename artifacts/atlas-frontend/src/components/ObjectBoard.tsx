import { useCallback, useEffect, useRef, useState } from "react";
import { CREATABLE_OBJECT_TYPES, OBJECT_TYPES, type ObjectType } from "./objectTypes";

const GOLD = "var(--atlas-gold)";
const MUTED = "var(--atlas-muted)";
const FG = "var(--atlas-fg)";
const BORDER = "var(--atlas-border)";
const MONO = "var(--app-font-mono)";

export type { ObjectType };

const TYPE_CONFIG: Record<ObjectType, { icon: string; color: string }> = {
  Idea:              { icon: "·", color: "#f59e0b" },
  Goal:              { icon: "·", color: "#4ade80" },
  Blocker:           { icon: "·", color: "#f87171" },
  Decision:          { icon: "·", color: "#60a5fa" },
  Audience:          { icon: "·", color: "#a78bfa" },
  Feature:           { icon: "·", color: "#34d399" },
  Risk:              { icon: "·", color: "#fb923c" },
  Insight:           { icon: "·", color: "#e879f9" },
  Question:          { icon: "·", color: "#38bdf8" },
  EngineeringEvent:  { icon: "·", color: "#94a3b8" },
};

const PROMOTABLE = new Set(["Idea", "Insight", "Question", "Goal", "Feature", "Risk"]);

export type ProjectObject = {
  id: number;
  type: ObjectType;
  title: string;
  summary: string | null;
  status: string;
  createdAt: string;
};

function fmtAge(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 86400000);
    if (d === 0) return "today";
    if (d === 1) return "1d ago";
    if (d < 30) return `${d}d ago`;
    const m = Math.floor(d / 30);
    return `${m}mo ago`;
  } catch { return ""; }
}

function TypeBadge({ type }: { type: ObjectType }) {
  const cfg = TYPE_CONFIG[type] ?? { icon: "·", color: MUTED };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: cfg.color,
      opacity: 0.85,
    }}>
      <span style={{ fontSize: 10 }}>{cfg.icon}</span>
      {type}
    </span>
  );
}

function ObjectCard({
  obj, onClick,
}: {
  obj: ProjectObject;
  onClick: (obj: ProjectObject) => void;
}) {
  return (
    <button
      onClick={() => onClick(obj)}
      style={{
        width: "100%", textAlign: "left",
        padding: "10px 12px",
        background: "rgba(255,255,255,0.018)",
        border: `1px solid ${BORDER}`,
        borderRadius: 7,
        cursor: "pointer",
        transition: "background 120ms, border-color 120ms",
        display: "flex", flexDirection: "column", gap: 5,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.035)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,162,76,0.2)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.018)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <TypeBadge type={obj.type} />
        <span style={{ fontFamily: MONO, fontSize: 8, color: MUTED, opacity: 0.35 }}>
          {fmtAge(obj.createdAt)}
        </span>
      </div>
      <div style={{ fontSize: 12, color: FG, fontWeight: 500, lineHeight: 1.35, opacity: 0.9 }}>
        {obj.title}
      </div>
      {obj.summary && (
        <div style={{
          fontSize: 11, color: MUTED, lineHeight: 1.5, opacity: 0.65,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        } as React.CSSProperties}>
          {obj.summary}
        </div>
      )}
    </button>
  );
}

function TypeFilterBar({
  counts, active, onSelect,
}: {
  counts: Partial<Record<ObjectType | "All", number>>;
  active: ObjectType | "All";
  onSelect: (t: ObjectType | "All") => void;
}) {
  const total = (counts["All"] ?? 0);
  const types: Array<ObjectType | "All"> = ["All", ...CREATABLE_OBJECT_TYPES];

  return (
    <div style={{
      display: "flex", gap: 4, flexWrap: "wrap",
      marginBottom: 10,
    }}>
      {types.map(t => {
        const isActive = active === t;
        const n = t === "All" ? total : (counts[t] ?? 0);
        if (t !== "All" && n === 0) return null;
        const cfg = t !== "All" ? TYPE_CONFIG[t as ObjectType] : null;
        return (
          <button
            key={t}
            onClick={() => onSelect(t)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "3px 7px",
              borderRadius: 4,
              border: isActive
                ? `1px solid ${cfg?.color ?? GOLD}`
                : `1px solid rgba(255,255,255,0.07)`,
              background: isActive
                ? `${cfg?.color ?? GOLD}18`
                : "transparent",
              fontFamily: MONO, fontSize: 8,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: isActive ? (cfg?.color ?? GOLD) : MUTED,
              opacity: isActive ? 1 : 0.5,
              cursor: "pointer",
              transition: "all 120ms",
            }}
          >
            {cfg && <span style={{ fontSize: 9 }}>{cfg.icon}</span>}
            {t}
            {n > 0 && (
              <span style={{
                marginLeft: 1,
                fontFamily: MONO, fontSize: 7.5,
                opacity: 0.7,
              }}>
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function AddObjectForm({
  projectId, onCreated, onCancel,
}: {
  projectId: number | string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ObjectType>("Idea");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: t,
          summary: summary.trim() || undefined,
          status: "committed",
        }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create");
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid rgba(255,255,255,0.1)`,
    borderRadius: 5,
    color: FG, fontFamily: MONO, fontSize: 11,
    padding: "6px 8px",
    outline: "none",
  };

  return (
    <div style={{
      padding: "11px 12px",
      border: `1px solid rgba(201,162,76,0.25)`,
      borderRadius: 7,
      background: "rgba(201,162,76,0.03)",
      display: "flex", flexDirection: "column", gap: 8,
      marginBottom: 10,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, opacity: 0.7 }}>
        New Object
      </div>

      {/* Type selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {CREATABLE_OBJECT_TYPES.map(t => {
          const cfg = TYPE_CONFIG[t];
          const isSelected = type === t;
          return (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 7px", borderRadius: 4,
                border: isSelected ? `1px solid ${cfg.color}` : `1px solid rgba(255,255,255,0.07)`,
                background: isSelected ? `${cfg.color}18` : "transparent",
                fontFamily: MONO, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em",
                color: isSelected ? cfg.color : MUTED,
                cursor: "pointer", opacity: isSelected ? 1 : 0.45,
                transition: "all 100ms",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <input
        ref={titleRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") void submit(); if (e.key === "Escape") onCancel(); }}
        placeholder="Title"
        style={inputStyle}
      />

      <textarea
        value={summary}
        onChange={e => setSummary(e.target.value)}
        placeholder="Summary (optional)"
        rows={2}
        style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
      />

      {error && <div style={{ fontSize: 10, color: "#f87171", fontFamily: MONO }}>{error}</div>}

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => void submit()}
          disabled={busy || !title.trim()}
          style={{
            flex: 1, padding: "6px 0",
            borderRadius: 5, border: "1px solid rgba(201,162,76,0.3)",
            background: "rgba(201,162,76,0.1)",
            color: GOLD, fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em",
            textTransform: "uppercase", cursor: busy ? "default" : "pointer",
            opacity: busy || !title.trim() ? 0.4 : 1,
          }}
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 12px",
            borderRadius: 5, border: `1px solid rgba(255,255,255,0.08)`,
            background: "transparent",
            color: MUTED, fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em",
            textTransform: "uppercase", cursor: "pointer", opacity: 0.5,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ObjectDetailPanel({
  obj, onClose, onDeleted, onUpdated,
}: {
  obj: ProjectObject;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const cfg = TYPE_CONFIG[obj.type] ?? { icon: "·", color: MUTED };
  const [deleting, setDeleting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const canPromote = PROMOTABLE.has(obj.type) && obj.type !== "Decision";

  const handleDelete = async () => {
    if (!window.confirm("Remove this object?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/entries/${obj.id}`, { method: "DELETE", credentials: "include" });
      onDeleted();
    } catch { setDeleting(false); }
  };

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const res = await fetch(`/api/entries/${obj.id}/promote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toType: "Decision" }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      onUpdated();
    } catch {
      setPromoting(false);
    }
  };

  return (
    <div style={{
      padding: "12px 13px",
      border: `1px solid ${cfg.color}28`,
      borderRadius: 7,
      background: `${cfg.color}08`,
      display: "flex", flexDirection: "column", gap: 9,
      marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <TypeBadge type={obj.type} />
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none",
            color: MUTED, fontFamily: MONO, fontSize: 8, letterSpacing: "0.1em",
            textTransform: "uppercase", cursor: "pointer", opacity: 0.4,
          }}
        >
          close
        </button>
      </div>

      <div style={{ fontSize: 13, color: FG, fontWeight: 500, lineHeight: 1.4 }}>
        {obj.title}
      </div>

      {obj.summary && (
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6, opacity: 0.8 }}>
          {obj.summary}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: MUTED, opacity: 0.35 }}>
          {fmtAge(obj.createdAt)}
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          {canPromote && (
            <button
              onClick={() => void handlePromote()}
              disabled={promoting}
              style={{
                background: "transparent", border: "none",
                fontFamily: MONO, fontSize: 8, letterSpacing: "0.1em",
                textTransform: "uppercase", color: GOLD,
                opacity: promoting ? 0.3 : 0.85, cursor: promoting ? "default" : "pointer",
              }}
            >
              {promoting ? "promoting…" : "promote to decision"}
            </button>
          )}
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            style={{
              background: "transparent", border: "none",
              fontFamily: MONO, fontSize: 8, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "#f87171",
              opacity: deleting ? 0.3 : 0.5, cursor: deleting ? "default" : "pointer",
            }}
          >
            {deleting ? "removing…" : "remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ObjectBoard({
  projectId, refreshKey,
}: {
  projectId: number | string;
  refreshKey?: number;
}) {
  const [objects, setObjects] = useState<ProjectObject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ObjectType | "All">("All");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<ProjectObject | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/objects`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setObjects(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load objects");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const counts = (objects ?? []).reduce<Partial<Record<ObjectType | "All", number>>>((acc, o) => {
    acc[o.type] = (acc[o.type] ?? 0) + 1;
    acc["All"] = (acc["All"] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = (objects ?? []).filter(o => typeFilter === "All" || o.type === typeFilter);

  if (loading) {
    return (
      <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: "24px 0", opacity: 0.4 }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: MUTED, fontSize: 11, padding: "16px 0", opacity: 0.5 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{
          fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.14em",
          textTransform: "uppercase", color: MUTED, opacity: 0.45,
        }}>
          {counts["All"] ?? 0} objects
        </span>
        <button
          onClick={() => { setAdding(a => !a); setSelected(null); }}
          style={{
            background: "transparent", border: `1px solid rgba(201,162,76,0.25)`,
            borderRadius: 4, padding: "2px 8px",
            fontFamily: MONO, fontSize: 8, letterSpacing: "0.1em",
            textTransform: "uppercase", color: GOLD, opacity: 0.7,
            cursor: "pointer",
          }}
        >
          + add
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <AddObjectForm
          projectId={projectId}
          onCreated={() => { setAdding(false); void load(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Selected detail */}
      {selected && !adding && (
        <ObjectDetailPanel
          obj={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); void load(); }}
          onUpdated={() => { setSelected(null); void load(); }}
        />
      )}

      {/* Type filter */}
      {(counts["All"] ?? 0) > 0 && (
        <TypeFilterBar counts={counts} active={typeFilter} onSelect={setTypeFilter} />
      )}

      {/* Objects list */}
      {filtered.length === 0 && (
        <div style={{ color: MUTED, fontSize: 11, opacity: 0.4, padding: "20px 0", textAlign: "center", lineHeight: 1.6 }}>
          {(counts["All"] ?? 0) === 0
            ? "Atlas extracts objects from your conversations.\nStart talking — ideas, goals, and blockers will appear here."
            : `No ${typeFilter} objects yet.`
          }
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {filtered.map(obj => (
          <ObjectCard
            key={obj.id}
            obj={obj}
            onClick={o => {
              setSelected(selected?.id === o.id ? null : o);
              setAdding(false);
            }}
          />
        ))}
      </div>
    </div>
  );
}
