import { useState, useCallback } from "react";
import { useDesignPlan } from "@/hooks/useDesignPlan";
import type { DesignPlanBody, DesignPlanInteractionPatterns, DesignPlanResponsiveIntent } from "@/hooks/useDesignPlan";

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  padding: "5px 8px",
  fontSize: 12,
  color: FG,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  lineHeight: 1.4,
};

function PlanRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ fontSize: 12.5, color: FG, lineHeight: 1.55, opacity: 0.9 }}>{value}</span>
    </div>
  );
}

function PlanListRow({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: GOLD, opacity: 0.4, fontFamily: MONO, fontSize: 10, marginTop: 1, flexShrink: 0 }}>{i + 1}.</span>
            <span style={{ fontSize: 12, color: FG, lineHeight: 1.5, opacity: 0.9 }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "3px 0" }}>
      <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.55, width: 52, flexShrink: 0, paddingTop: 2, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: FG, lineHeight: 1.45, opacity: 0.9 }}>{value}</span>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={labelStyle}>{label}</span>
      <input
        style={inputStyle}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
      />
    </div>
  );
}

function EditListField({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [newVal, setNewVal] = useState("");
  const addItem = () => {
    const t = newVal.trim();
    if (!t) return;
    onChange([...items, t]);
    setNewVal("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.5, width: 14 }}>{i + 1}.</span>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={item}
              onChange={(e) => {
                const updated = [...items];
                updated[i] = e.target.value;
                onChange(updated);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 11, padding: "0 2px", opacity: 0.6 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder={placeholder ?? "Add item…"}
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!newVal.trim()}
          style={{
            background: "transparent",
            border: `1px solid ${BORDER}`,
            borderRadius: 3,
            padding: "4px 8px",
            fontFamily: MONO,
            fontSize: 10,
            color: newVal.trim() ? GOLD : MUTED,
            cursor: newVal.trim() ? "pointer" : "default",
            opacity: newVal.trim() ? 1 : 0.5,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status, version }: { status: "draft" | "proposed" | "committed"; version: number }) {
  const config = {
    draft: { color: MUTED, label: "Draft" },
    proposed: { color: "#FBBF24", label: "Proposed" },
    committed: { color: "#4ADE80", label: "Committed" },
  }[status];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: config.color, flexShrink: 0, boxShadow: status !== "draft" ? `0 0 5px ${config.color}66` : "none" }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: config.color, letterSpacing: "0.12em", textTransform: "uppercase" }}>{config.label}</span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.4 }}>v{version}</span>
    </div>
  );
}

interface DesignPlanPanelProps {
  projectId: number;
}

export function DesignPlanPanel({ projectId }: DesignPlanPanelProps) {
  const { plan, loading, generating, committing, saving, generate, patchBody, commit } = useDesignPlan(projectId);
  const [editMode, setEditMode] = useState(false);
  const [localBody, setLocalBody] = useState<DesignPlanBody>({});

  const startEdit = useCallback(() => {
    setLocalBody(plan?.body ? { ...plan.body } : {});
    setEditMode(true);
  }, [plan]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setLocalBody({});
  }, []);

  const handleSave = useCallback(async () => {
    await patchBody(localBody);
    setEditMode(false);
    setLocalBody({});
  }, [patchBody, localBody]);

  const setField = useCallback(<K extends keyof DesignPlanBody>(key: K, val: DesignPlanBody[K]) => {
    setLocalBody((prev) => ({ ...prev, [key]: val }));
  }, []);

  const setInteraction = useCallback(<K extends keyof DesignPlanInteractionPatterns>(key: K, val: string) => {
    setLocalBody((prev) => ({
      ...prev,
      interactionPatterns: { ...(prev.interactionPatterns ?? {}), [key]: val },
    }));
  }, []);

  const setResponsive = useCallback(<K extends keyof DesignPlanResponsiveIntent>(key: K, val: string) => {
    setLocalBody((prev) => ({
      ...prev,
      responsiveIntent: { ...(prev.responsiveIntent ?? {}), [key]: val },
    }));
  }, []);

  if (loading && !plan) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, opacity: 0.5, fontStyle: "italic" }}>Loading…</span>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, opacity: 0.5, fontStyle: "italic", display: "block", marginBottom: 4 }}>
            No Design Plan yet.
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED, opacity: 0.35, fontStyle: "italic" }}>
            Atlas reads your Soul tab and generates a structured design brief.
          </span>
        </div>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating}
          style={{
            padding: "7px 18px",
            borderRadius: 5,
            background: generating ? "transparent" : "rgba(201,162,76,0.1)",
            border: `1px solid rgba(201,162,76,${generating ? "0.2" : "0.4"})`,
            color: generating ? MUTED : GOLD,
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: generating ? "default" : "pointer",
          }}
        >
          {generating ? "Generating…" : "Generate Design Plan"}
        </button>
      </div>
    );
  }

  const body = editMode ? localBody : (plan.body as DesignPlanBody);
  const responsive = body.responsiveIntent;
  const interaction = body.interactionPatterns;

  return (
    <div style={{ padding: "0 16px 24px", background: BG }}>
      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 0 10px",
        borderBottom: `1px solid ${BORDER}`,
        marginBottom: 2,
      }}>
        <StatusBadge status={plan.status as "draft" | "proposed" | "committed"} version={plan.version} />
        <div style={{ display: "flex", gap: 6 }}>
          {editMode ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  background: "transparent",
                  border: `1px solid ${BORDER}`,
                  color: MUTED,
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                style={{
                  padding: "4px 12px",
                  borderRadius: 4,
                  background: saving ? "transparent" : GOLD,
                  border: "none",
                  color: saving ? MUTED : BG,
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: saving ? "default" : "pointer",
                  fontWeight: 600,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              {plan.status !== "committed" && (
                <button
                  type="button"
                  onClick={() => void commit()}
                  disabled={committing}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: committing ? "transparent" : GOLD,
                    border: "none",
                    color: committing ? MUTED : BG,
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: committing ? "default" : "pointer",
                    fontWeight: 600,
                    opacity: committing ? 0.5 : 1,
                  }}
                >
                  {committing ? "…" : "Commit"}
                </button>
              )}
              <button
                type="button"
                onClick={startEdit}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  background: "transparent",
                  border: `1px solid ${BORDER}`,
                  color: MUTED,
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,162,76,0.3)";
                  (e.currentTarget as HTMLButtonElement).style.color = GOLD;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
                  (e.currentTarget as HTMLButtonElement).style.color = MUTED;
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  background: "transparent",
                  border: `1px solid ${BORDER}`,
                  color: MUTED,
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: generating ? "default" : "pointer",
                  opacity: generating ? 0.4 : 0.7,
                }}
              >
                {generating ? "…" : "↻"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Committed note: editing will fork a new version */}
      {plan.status === "committed" && !editMode && (
        <div style={{ padding: "6px 0 4px" }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.4 }}>
            Editing a committed plan creates a new proposed version.
          </span>
        </div>
      )}

      {/* Fields — edit mode */}
      {editMode ? (
        <>
          <EditField
            label="Navigation"
            value={body.navigationPattern ?? ""}
            onChange={(v) => setField("navigationPattern", v)}
            placeholder="e.g. bottom-tab-bar | sidebar | top-nav"
          />
          <EditField
            label="Component Pattern"
            value={body.componentPatterns ?? ""}
            onChange={(v) => setField("componentPatterns", v)}
            placeholder="e.g. card-grid | list-view | dashboard | feed"
          />

          <div style={{ padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ ...labelStyle, display: "block", marginBottom: 6 }}>Responsive Intent</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {(["mobile", "tablet", "desktop"] as const).map((key) => (
                <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.55, width: 48, flexShrink: 0, paddingTop: 6, textTransform: "uppercase" }}>
                    {key}
                  </span>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={(responsive as DesignPlanResponsiveIntent | undefined)?.[key] ?? ""}
                    onChange={(e) => setResponsive(key, e.target.value)}
                    placeholder={`Describe ${key} layout…`}
                  />
                </div>
              ))}
            </div>
          </div>

          <EditListField
            label="Information Hierarchy"
            items={body.informationHierarchy ?? []}
            onChange={(v) => setField("informationHierarchy", v)}
            placeholder="Add priority item…"
          />

          <EditField label="Motion" value={body.motionPhilosophy ?? ""} onChange={(v) => setField("motionPhilosophy", v)} placeholder="e.g. minimal | purposeful" />
          <EditField label="Card Density" value={body.cardDensity ?? ""} onChange={(v) => setField("cardDensity", v)} placeholder="e.g. spacious | compact | dense" />
          <EditField label="Typography Scale" value={body.typographyScale ?? ""} onChange={(v) => setField("typographyScale", v)} placeholder="e.g. large | standard | compact" />
          <EditField label="Empty States" value={body.emptyStates ?? ""} onChange={(v) => setField("emptyStates", v)} placeholder="e.g. illustrated | instructional | minimal" />

          <div style={{ padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ ...labelStyle, display: "block", marginBottom: 6 }}>Interactions</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {([
                { key: "primaryAction", label: "Primary" },
                { key: "secondaryAction", label: "Secondary" },
                { key: "editingStyle", label: "Editing" },
                { key: "confirmationBehavior", label: "Confirm" },
                { key: "gestures", label: "Gestures" },
                { key: "scrollingBehavior", label: "Scrolling" },
              ] as const).map(({ key, label }) => (
                <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.55, width: 58, flexShrink: 0, paddingTop: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {label}
                  </span>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={(interaction as DesignPlanInteractionPatterns | undefined)?.[key] ?? ""}
                    onChange={(e) => setInteraction(key, e.target.value)}
                    placeholder=""
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Read mode */}
          <PlanRow label="Navigation" value={body.navigationPattern} />
          <PlanRow label="Component Pattern" value={body.componentPatterns} />

          {(responsive?.mobile || responsive?.tablet || responsive?.desktop) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ ...labelStyle, marginBottom: 4 }}>Responsive Intent</span>
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 5, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                <SubRow label="Mobile" value={responsive.mobile} />
                <SubRow label="Tablet" value={responsive.tablet} />
                <SubRow label="Desktop" value={responsive.desktop} />
              </div>
            </div>
          )}

          <PlanListRow label="Information Hierarchy" items={body.informationHierarchy} />
          <PlanRow label="Motion" value={body.motionPhilosophy} />
          <PlanRow label="Card Density" value={body.cardDensity} />
          <PlanRow label="Typography Scale" value={body.typographyScale} />
          <PlanRow label="Empty States" value={body.emptyStates} />

          {interaction && Object.values(interaction).some(Boolean) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ ...labelStyle, marginBottom: 4 }}>Interactions</span>
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 5, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                {([
                  { key: "primaryAction", label: "Primary Action" },
                  { key: "secondaryAction", label: "Secondary Action" },
                  { key: "editingStyle", label: "Editing" },
                  { key: "confirmationBehavior", label: "Confirmation" },
                  { key: "gestures", label: "Gestures" },
                  { key: "scrollingBehavior", label: "Scrolling" },
                ] as const).map(({ key, label }) => {
                  const val = interaction[key];
                  if (!val) return null;
                  return (
                    <div key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.55, width: 90, flexShrink: 0, paddingTop: 2, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 12, color: FG, lineHeight: 1.45, opacity: 0.9 }}>{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {plan.committedAt && (
            <div style={{ paddingTop: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, opacity: 0.4 }}>
                Committed {new Date(plan.committedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
