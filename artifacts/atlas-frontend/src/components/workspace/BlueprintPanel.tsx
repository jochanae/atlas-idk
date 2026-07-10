import { useState, useCallback, useEffect } from "react";
import { useApplicationModel } from "@/hooks/useApplicationModel";
import type { AMPage, AMComponent, AMEntity, AMRelationship, AMLogic, ApplicationModelPatch } from "@/hooks/useApplicationModel";
import { useModelAlignment } from "@/hooks/useModelAlignment";
import type { AlignmentResult, AlignmentItemResult } from "@/hooks/useModelAlignment";
import { useProjectDNA } from "@/hooks/useProjectDNA";
import type { ProjectDNAPatch } from "@/hooks/useProjectDNA";
import { useDesignPlan } from "@/hooks/useDesignPlan";
import { ExperienceIntentCard } from "./ExperienceIntentCard";
import { DesignPlanPanel } from "./DesignPlanPanel";
import { PipelineSketchPanel } from "./PipelineSketchPanel";
import { DecisionIntelligencePanel } from "./DecisionIntelligencePanel";

type BPTab = "spec" | "components" | "data" | "logic" | "soul" | "design" | "sketch" | "docs" | "decisions";

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
  opacity: 0.8,
};

const mutedStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  color: MUTED,
  opacity: 0.6,
  fontStyle: "italic",
};

function EmptySlot({ message }: { message: string }) {
  return (
    <div style={{ padding: "32px 20px", textAlign: "center" }}>
      <p style={mutedStyle}>{message}</p>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ fontSize: 13, color: FG, lineHeight: 1.55 }}>{value}</span>
    </div>
  );
}

function TagList({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: GOLD, opacity: 0.5, fontFamily: MONO, fontSize: 10, marginTop: 2 }}>—</span>
            <span style={{ fontSize: 12, color: FG, lineHeight: 1.5, opacity: 0.9 }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ALIGNMENT_COLORS: Record<string, string> = {
  aligned: "#4ADE80",
  partial: "#FBBF24",
  drift: "#F87171",
  "no-builds": "#8B8577",
  empty: "#8B8577",
};

const ALIGNMENT_LABELS: Record<string, string> = {
  aligned: "Aligned",
  partial: "Partial",
  drift: "Drift",
  "no-builds": "No builds yet",
  empty: "Blueprint empty",
};

function AlignmentBadge({ alignment }: { alignment: AlignmentResult | null }) {
  if (!alignment || alignment.status === "empty") return null;
  const color = ALIGNMENT_COLORS[alignment.status] ?? MUTED;
  const label = ALIGNMENT_LABELS[alignment.status] ?? alignment.status;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        boxShadow: `0 0 5px ${color}66`,
      }} />
      <span style={{ fontFamily: MONO, fontSize: 9, color, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </span>
    </div>
  );
}

function AlignmentSection({ alignment }: { alignment: AlignmentResult | null }) {
  if (!alignment || alignment.status === "empty" || alignment.status === "no-builds") return null;

  const missing = [
    ...alignment.pages.filter((p) => !p.found).map((p) => ({ kind: "Page", name: p.name })),
    ...alignment.components.filter((c) => !c.found).map((c) => ({ kind: "Component", name: c.name })),
    ...alignment.entities.filter((e) => !e.found).map((e) => ({ kind: "Entity", name: e.name })),
  ];

  if (missing.length === 0 && alignment.status === "aligned") return null;

  return (
    <div style={{
      margin: "12px 16px 0",
      padding: "10px 12px",
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${BORDER}`,
      borderRadius: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: missing.length > 0 ? 8 : 0 }}>
        <span style={{ ...labelStyle, opacity: 0.6 }}>Build Alignment</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.5 }}>
          {alignment.builtFileCount} file{alignment.builtFileCount !== 1 ? "s" : ""} built
        </span>
      </div>
      {missing.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {missing.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.5, width: 68, flexShrink: 0 }}>
                {item.kind}
              </span>
              <span style={{ fontSize: 11.5, color: FG, opacity: 0.7 }}>{item.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: "#F87171", opacity: 0.7, marginLeft: "auto" }}>
                missing
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpecTab({ model, alignment }: {
  model: ReturnType<typeof useApplicationModel>["model"];
  alignment: AlignmentResult | null;
}) {
  const identity = model?.identity ?? {};
  const intent = model?.intent ?? {};

  const hasContent = identity.name || identity.purpose || identity.audience || intent.summary ||
    intent.coreProblems?.length || intent.keyOutcomes?.length || intent.constraints?.length;

  if (!hasContent) {
    return <EmptySlot message="Chat with Atlas to define what you're building. Spec fills here." />;
  }

  return (
    <div style={{ padding: "4px 16px 24px" }}>
      <FieldRow label="App Name" value={identity.name} />
      <FieldRow label="Purpose" value={identity.purpose} />
      <FieldRow label="Audience" value={identity.audience} />
      <FieldRow label="Category" value={identity.category} />
      <FieldRow label="Intent" value={intent.summary} />
      <TagList label="Core Problems" items={intent.coreProblems} />
      <TagList label="Key Outcomes" items={intent.keyOutcomes} />
      <TagList label="Constraints" items={intent.constraints} />
      <AlignmentSection alignment={alignment} />
    </div>
  );
}

function PageCard({ page }: { page: AMPage }) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, color: FG, fontWeight: 500 }}>{page.name}</span>
        {page.route && (
          <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED, opacity: 0.7 }}>{page.route}</span>
        )}
      </div>
      {page.description && (
        <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>{page.description}</span>
      )}
    </div>
  );
}

function ComponentCard({ comp }: { comp: AMComponent }) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 3,
    }}>
      <span style={{ fontSize: 13, color: FG, fontWeight: 500 }}>{comp.name}</span>
      {comp.description && (
        <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>{comp.description}</span>
      )}
    </div>
  );
}

function ComponentsTab({ model }: { model: ReturnType<typeof useApplicationModel>["model"] }) {
  const pages = model?.pages ?? [];
  const components = model?.components ?? [];

  if (!pages.length && !components.length) {
    return <EmptySlot message="Pages and components appear here as you describe your screens." />;
  }

  return (
    <div style={{ padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {pages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={labelStyle}>Pages</span>
          {pages.map((p) => <PageCard key={p.id} page={p} />)}
        </div>
      )}
      {components.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={labelStyle}>Components</span>
          {components.map((c) => <ComponentCard key={c.id} comp={c} />)}
        </div>
      )}
    </div>
  );
}

function EntityCard({ entity }: { entity: AMEntity }) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <span style={{ fontSize: 13, color: FG, fontWeight: 500 }}>{entity.name}</span>
      {entity.description && (
        <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>{entity.description}</span>
      )}
      {entity.fields && entity.fields.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
          {entity.fields.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: FG, opacity: 0.85 }}>{f.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: GOLD, opacity: 0.55 }}>{f.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RelationshipRow({ rel, entities }: { rel: AMRelationship; entities: AMEntity[] }) {
  const fromName = entities.find((e) => e.id === rel.from)?.name ?? rel.from;
  const toName = entities.find((e) => e.id === rel.to)?.name ?? rel.to;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 12, color: FG }}>{fromName}</span>
      <span style={{ fontFamily: MONO, fontSize: 9, color: GOLD, opacity: 0.6 }}>
        {rel.type === "one-to-many" ? "1→n" : rel.type === "many-to-many" ? "n→n" : "1→1"}
      </span>
      <span style={{ fontSize: 12, color: FG }}>{toName}</span>
      {rel.label && <span style={{ fontSize: 10.5, color: MUTED, opacity: 0.7, marginLeft: 4 }}>{rel.label}</span>}
    </div>
  );
}

function DataTab({ model }: { model: ReturnType<typeof useApplicationModel>["model"] }) {
  const data = model?.data ?? { entities: [], relationships: [] };
  const entities = data.entities ?? [];
  const relationships = data.relationships ?? [];

  if (!entities.length && !relationships.length) {
    return <EmptySlot message="Data entities and relationships appear here as you describe your data model." />;
  }

  return (
    <div style={{ padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {entities.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={labelStyle}>Entities</span>
          {entities.map((e) => <EntityCard key={e.id} entity={e} />)}
        </div>
      )}
      {relationships.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ ...labelStyle, marginBottom: 6 }}>Relationships</span>
          {relationships.map((r) => <RelationshipRow key={r.id} rel={r} entities={entities} />)}
        </div>
      )}
    </div>
  );
}

function LogicCard({ rule }: { rule: AMLogic }) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: FG, fontWeight: 500 }}>{rule.name}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: GOLD, opacity: 0.55, textTransform: "uppercase" }}>{rule.type}</span>
      </div>
      {rule.description && (
        <span style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>{rule.description}</span>
      )}
    </div>
  );
}

function LogicTab({ model }: { model: ReturnType<typeof useApplicationModel>["model"] }) {
  const logic = model?.logic ?? [];

  if (!logic.length) {
    return <EmptySlot message="Business rules and logic appear here as you define how your app behaves." />;
  }

  return (
    <div style={{ padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={labelStyle}>Rules &amp; Logic</span>
      {logic.map((l) => <LogicCard key={l.id} rule={l} />)}
    </div>
  );
}

function ApproveButton({
  approvedAt,
  onApprove,
  onUnapprove,
  busy,
}: {
  approvedAt?: string | null;
  onApprove: () => void;
  onUnapprove: () => void;
  busy: boolean;
}) {
  if (approvedAt) {
    const date = new Date(approvedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return (
      <button
        type="button"
        onClick={onUnapprove}
        disabled={busy}
        title={`Approved ${date} — click to revoke`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 5,
          background: "rgba(201,162,76,0.15)",
          border: "1px solid rgba(201,162,76,0.45)",
          color: GOLD,
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.5 : 1,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 6l3 3 5-5" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Approved {date}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onApprove}
      disabled={busy}
      style={{
        padding: "4px 10px",
        borderRadius: 5,
        background: "transparent",
        border: `1px solid ${BORDER}`,
        color: MUTED,
        fontFamily: MONO,
        fontSize: 9.5,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.5 : 1,
        transition: "border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,162,76,0.4)";
        (e.currentTarget as HTMLButtonElement).style.color = GOLD;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
        (e.currentTarget as HTMLButtonElement).style.color = MUTED;
      }}
    >
      Approve Direction
    </button>
  );
}

// ── DocsTab ───────────────────────────────────────────────────────────────────

type DocArtifact = { id: number; title: string; payload: { markdown?: string }; metadata: { generatedAt?: string }; createdAt: string };

function DocsTab({ projectId }: { projectId: number }) {
  const [doc, setDoc] = useState<DocArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/artifacts?type=documentation`, { credentials: "include" });
      if (!r.ok) throw new Error("fetch failed");
      const data = await r.json() as { artifacts?: DocArtifact[] };
      setDoc(data.artifacts?.[0] ?? null);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void fetchLatest(); }, [fetchLatest]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/docs/generate`, { method: "POST", credentials: "include" });
      const data = await r.json() as DocArtifact & { error?: string };
      if (!r.ok) { setError((data as { error?: string }).error ?? "Generation failed"); return; }
      setDoc(data);
    } catch { setError("Network error — please try again."); } finally {
      setGenerating(false);
    }
  }, [projectId]);

  if (loading) return <div style={{ padding: "32px 20px", textAlign: "center" }}><span style={mutedStyle}>Loading…</span></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ ...labelStyle, opacity: 0.6 }}>{doc ? `v${(doc as any).version ?? "—"} · ${new Date(doc.createdAt).toLocaleDateString()}` : "No docs yet"}</span>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
            color: generating ? MUTED : GOLD, background: "none", border: `1px solid ${generating ? BORDER : GOLD}`,
            borderRadius: 4, padding: "4px 10px", cursor: generating ? "default" : "pointer", opacity: generating ? 0.5 : 1,
          }}
        >
          {generating ? "Generating…" : doc ? "Regenerate" : "Generate Docs"}
        </button>
      </div>
      {error && (
        <div style={{ padding: "8px 16px", background: "rgba(180,60,60,0.12)", borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#c97070" }}>{error}</span>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {doc?.payload?.markdown ? (
          <pre style={{
            fontFamily: MONO, fontSize: 11.5, color: FG, lineHeight: 1.7, whiteSpace: "pre-wrap",
            wordBreak: "break-word", margin: 0, background: "none", border: "none",
          }}>
            {doc.payload.markdown}
          </pre>
        ) : (
          <EmptySlot message="Generate documentation from the Application Model — covers architecture, data model, pages, and core logic." />
        )}
      </div>
    </div>
  );
}

interface BlueprintPanelProps {
  projectId: number;
  refreshTrigger?: number;
  readinessScore?: number;
}

export function BlueprintPanel({ projectId, refreshTrigger, readinessScore }: BlueprintPanelProps) {
  const [activeTab, setActiveTab] = useState<BPTab>("spec");
  const [approving, setApproving] = useState(false);
  const { model, loading, approve, unapprove, refetch, patch } = useApplicationModel(projectId);
  const [patchSaving, setPatchSaving] = useState(false);
  const { alignment, refetch: refetchAlignment } = useModelAlignment(projectId);
  const { dna, refetch: refetchDna, patch: dnaPatch } = useProjectDNA(projectId);
  const [dnaPatchSaving, setDnaPatchSaving] = useState(false);
  const { plan: designPlan } = useDesignPlan(projectId);

  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger === 0) return;
    void refetch();
    void refetchAlignment();
    void refetchDna();
  }, [refreshTrigger, refetch, refetchAlignment, refetchDna]);

  const handleApprove = useCallback(async () => {
    setApproving(true);
    await approve();
    setApproving(false);
  }, [approve]);

  const handleUnapprove = useCallback(async () => {
    setApproving(true);
    await unapprove();
    setApproving(false);
  }, [unapprove]);

  const hasSoul = !!(
    dna &&
    ((dna.experienceIntent.emotionalRegister?.length ?? 0) > 0 ||
      (dna.experienceIntent.visualLanguage?.length ?? 0) > 0 ||
      (dna.creativePrinciples?.length ?? 0) > 0)
  );

  const handlePatch = useCallback(async (update: ApplicationModelPatch) => {
    setPatchSaving(true);
    await patch(update);
    setPatchSaving(false);
  }, [patch]);

  const handleDnaPatch = useCallback(async (update: ProjectDNAPatch) => {
    setDnaPatchSaving(true);
    await dnaPatch(update);
    setDnaPatchSaving(false);
  }, [dnaPatch]);

  const tabs: { id: BPTab; label: string; dot?: boolean }[] = [
    { id: "spec", label: "Spec" },
    { id: "components", label: "Components" },
    { id: "data", label: "Data Model" },
    { id: "logic", label: "Logic" },
    { id: "soul", label: "Soul", dot: hasSoul },
    { id: "sketch", label: "Sketch" },
    { id: "design", label: "Design" },
    { id: "decisions", label: "Decisions" },
    { id: "docs", label: "Docs" },
  ];

  const approvedAt = model?.intent?.approvedAt;
  const hasAnyContent = model && (
    model.identity?.name ||
    model.intent?.summary ||
    model.pages?.length ||
    model.data?.entities?.length ||
    model.logic?.length
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px 10px",
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, opacity: 0.7 }}>
            Blueprint
          </span>
          {model?.identity?.name && (
            <span style={{ fontSize: 13, color: FG, fontWeight: 500, lineHeight: 1.2 }}>
              {model.identity.name}
            </span>
          )}
          <AlignmentBadge alignment={alignment} />
          {/* #74 readiness + #80 stage + #78 design plan status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
            {readinessScore != null && (
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "2px 7px", borderRadius: 5,
                background: readinessScore >= 60 ? "rgba(52,211,153,0.1)" : readinessScore >= 30 ? "rgba(201,162,76,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${readinessScore >= 60 ? "rgba(52,211,153,0.3)" : readinessScore >= 30 ? "rgba(201,162,76,0.3)" : "rgba(255,255,255,0.1)"}`,
                color: readinessScore >= 60 ? "rgb(52,211,153)" : readinessScore >= 30 ? GOLD : MUTED,
              }}>
                {readinessScore >= 60 ? "Ready to Build" : readinessScore >= 30 ? "Shaping" : "Exploring"} · {readinessScore}%
              </span>
            )}
            {designPlan?.status === "committed" && (
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "2px 7px", borderRadius: 5,
                background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "rgb(52,211,153)",
              }}>
                Design · Committed
              </span>
            )}
            {designPlan?.status === "proposed" && (
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "2px 7px", borderRadius: 5,
                background: "rgba(201,162,76,0.08)", border: "1px solid rgba(201,162,76,0.25)", color: GOLD,
              }}>
                Design · Proposed
              </span>
            )}
            {designPlan?.status === "draft" && (
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "2px 7px", borderRadius: 5,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: MUTED,
              }}>
                Design · Draft
              </span>
            )}
          </div>
        </div>
        {hasAnyContent && (
          <ApproveButton
            approvedAt={approvedAt}
            onApprove={() => void handleApprove()}
            onUnapprove={() => void handleUnapprove()}
            busy={approving}
          />
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: "flex",
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0,
        padding: "0 12px",
      }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "8px 10px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === t.id ? `2px solid ${GOLD}` : "2px solid transparent",
              color: activeTab === t.id ? GOLD : MUTED,
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "color 0.15s",
              marginBottom: -1,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {t.label}
              {t.dot && (
                <span style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: GOLD,
                  opacity: activeTab === t.id ? 1 : 0.5,
                  display: "inline-block",
                  flexShrink: 0,
                  marginTop: -6,
                }} />
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loading && !model && (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <span style={mutedStyle}>Loading…</span>
          </div>
        )}
        {!loading && activeTab === "spec" && <SpecTab model={model} alignment={alignment} />}
        {!loading && activeTab === "components" && <ComponentsTab model={model} />}
        {!loading && activeTab === "data" && <DataTab model={model} />}
        {!loading && activeTab === "logic" && <LogicTab model={model} />}
        {!loading && activeTab === "soul" && dna && (
          <ExperienceIntentCard
            dna={dna}
            onSave={handleDnaPatch}
            saving={dnaPatchSaving}
          />
        )}
        {!loading && activeTab === "soul" && !dna && (
          <EmptySlot message="Share how you want this product to feel — Axiom will capture it here." />
        )}
        {activeTab === "sketch" && <PipelineSketchPanel projectId={projectId} />}
        {activeTab === "design" && <DesignPlanPanel projectId={projectId} />}
        {activeTab === "decisions" && <DecisionIntelligencePanel projectId={projectId} />}
        {activeTab === "docs" && <DocsTab projectId={projectId} />}
      </div>

      {/* Footer: version + last extracted */}
      {model && (
        <div style={{
          padding: "8px 16px",
          borderTop: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.5 }}>
            v{model.version}
          </span>
          {model.buildState?.lastExtractedAt && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.5 }}>
              extracted {new Date(model.buildState.lastExtractedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
