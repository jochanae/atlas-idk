import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { classify } from "@/lib/outputsClassification";
import { resolveItemDestination } from "@/lib/resolveItemDestination";

/**
 * ArtifactsGallery — the "Joy Generated" artifact list.
 *
 * Extracted verbatim from PreviewPanel so it can also render as a sub-tab
 * inside the workspace Outputs panel. Cross-panel actions ("Open in Draft",
 * "Open Live Preview") are dispatched as window events so this component
 * stays self-contained:
 *
 *   • axiom:preview-open-html   → PreviewPanel opens sandbox with html
 *   • axiom:preview-set-mode    → PreviewPanel switches to "local"
 */

type ProjectArtifact = {
  id: number;
  projectId: number;
  type: string;
  version: number;
  title: string;
  metadata: Record<string, unknown>;
  payload: Record<string, unknown>;
  createdAt: string;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, flexShrink: 0, minWidth: 80, paddingTop: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.75, lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

const bucketOf = (t: string): "history" | "sketch" | "build" | "design" | "preview" | "other" => {
  if (t.startsWith("history") || t.includes("message") || t.includes("response") || t.includes("thought")) return "history";
  if (t === "visual_sketch" || t === "pipeline_sketch" || t.includes("sketch")) return "sketch";
  if (t === "build_output" || t.includes("build")) return "build";
  if (t === "design_plan" || t === "blueprint_snapshot") return "design";
  if (t === "html_preview" || t === "html" || t === "landing_draft" || t === "export_package") return "preview";
  return "other";
};

export function ArtifactsGallery({ projectId, enabled = true }: { projectId: number; enabled?: boolean }) {
  const { data: artifactsData, isLoading: artifactsLoading, refetch: refetchArtifacts } = useQuery({
    queryKey: ["project-artifacts", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/artifacts`);
      if (!res.ok) throw new Error("Failed to load artifacts");
      return res.json() as Promise<{ artifacts: ProjectArtifact[] }>;
    },
    enabled,
    staleTime: 20_000,
    refetchInterval: enabled ? 15_000 : false,
  });

  // Slice 3: shared classifier is the sole inclusion authority for Artifacts.
  const artifacts = useMemo(
    () => (artifactsData?.artifacts ?? []).filter((a) => classify({
      type: a.type,
      extension: typeof a.metadata?.extension === "string" ? (a.metadata.extension as string) : null,
      metadata: a.metadata ?? null,
    }).includedInArtifacts),
    [artifactsData],
  );
  const [expandedArtifactId, setExpandedArtifactId] = useState<number | null>(null);
  const [artifactBucket, setArtifactBucket] = useState<string>("all");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Gallery header */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--atlas-border)", background: "var(--atlas-surface)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", letterSpacing: "0.05em" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--atlas-gold)", display: "inline-block", boxShadow: "0 0 6px rgba(201,162,76,0.5)" }} />
          Joy Generated
        </span>
        <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45 }}>
          {artifacts.length > 0 ? `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}` : ""}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => refetchArtifacts()}
          title="Refresh"
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px", color: "var(--atlas-muted)", fontSize: 10, fontFamily: "var(--app-font-mono)", borderRadius: 4, opacity: 0.45, transition: "opacity 140ms" }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.45")}
        >
          ↻
        </button>
      </div>

      {/* Bucket chips */}
      {artifacts.length > 0 && (() => {
        const counts: Record<string, number> = { all: artifacts.length, history: 0, sketch: 0, build: 0, design: 0, preview: 0, other: 0 };
        for (const a of artifacts) counts[bucketOf(a.type)]++;
        const CHIPS: Array<{ id: string; label: string; color: string }> = [
          { id: "all",     label: "All",       color: "var(--atlas-gold)" },
          { id: "history", label: "History",   color: "rgba(180,180,190,0.85)" },
          { id: "sketch",  label: "Sketches",  color: "rgba(167,139,250,0.9)" },
          { id: "build",   label: "Builds",    color: "rgba(52,211,153,0.85)" },
          { id: "design",  label: "Design",    color: "var(--atlas-gold)" },
          { id: "preview", label: "Previews",  color: "rgba(251,191,36,0.85)" },
          { id: "other",   label: "Other",     color: "var(--atlas-muted)" },
        ].filter(c => c.id === "all" || counts[c.id] > 0);
        return (
          <div style={{ flexShrink: 0, display: "flex", gap: 5, padding: "6px 10px", borderBottom: "1px solid var(--atlas-border)", background: "var(--atlas-bg)", overflowX: "auto" }} className="scrollbar-none">
            {CHIPS.map(chip => {
              const active = artifactBucket === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setArtifactBucket(chip.id)}
                  style={{
                    fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                    padding: "3px 8px", borderRadius: 10, cursor: "pointer", flexShrink: 0,
                    color: active ? chip.color : "var(--atlas-muted)",
                    background: active ? "rgba(0,0,0,0.35)" : "transparent",
                    border: `1px solid ${active ? chip.color : "var(--atlas-border)"}`,
                    opacity: active ? 1 : 0.55,
                    transition: "opacity 140ms, border-color 140ms",
                  }}
                >
                  {chip.label} <span style={{ opacity: 0.5, marginLeft: 3 }}>{counts[chip.id]}</span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Gallery body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
        {artifactsLoading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 80 }}>
            <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35 }}>loading…</span>
          </div>
        )}

        {!artifactsLoading && artifacts.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 120, gap: 8, padding: "24px 16px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" opacity={0.1}>
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="var(--atlas-fg)" strokeWidth="1.5" />
              <path d="M8 12h8M12 8v8" stroke="var(--atlas-fg)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div style={{ fontSize: 10.5, color: "var(--atlas-muted)", opacity: 0.35, textAlign: "center", fontFamily: "var(--app-font-mono)", lineHeight: 1.7 }}>
              No artifacts yet.
              <br />
              Commit a design plan, approve a blueprint,
              <br />
              or run a build to see them here.
            </div>
          </div>
        )}

        {!artifactsLoading && (() => {
          type TypeCfg = { label: string; color: string; bg: string; border: string };
          const TYPE_CONFIG: Record<string, TypeCfg> = {
            design_plan:        { label: "DESIGN",    color: "var(--atlas-gold)",        bg: "rgba(201,162,76,0.08)",  border: "rgba(201,162,76,0.2)"  },
            blueprint_snapshot: { label: "BLUEPRINT", color: "rgba(96,165,250,0.9)",     bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.18)" },
            build_output:       { label: "BUILD",     color: "rgba(52,211,153,0.85)",    bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.18)" },
            visual_sketch:      { label: "SKETCH",    color: "rgba(167,139,250,0.85)",   bg: "rgba(167,139,250,0.06)",border: "rgba(167,139,250,0.18)"},
            pipeline_sketch:    { label: "SKETCH",    color: "rgba(167,139,250,0.85)",   bg: "rgba(167,139,250,0.06)",border: "rgba(167,139,250,0.18)"},
            landing_draft:      { label: "LANDING",   color: "rgba(251,146,60,0.85)",    bg: "rgba(251,146,60,0.06)", border: "rgba(251,146,60,0.18)" },
            export_package:     { label: "EXPORT",    color: "rgba(34,211,238,0.85)",    bg: "rgba(34,211,238,0.06)", border: "rgba(34,211,238,0.18)" },
            html_preview:       { label: "PREVIEW",   color: "rgba(251,191,36,0.85)",    bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.2)"  },
            html:               { label: "HTML",       color: "rgba(251,191,36,0.85)",    bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.2)"  },
          };

          const latestIdByType: Record<string, number> = {};
          for (const a of artifacts) {
            if (!(a.type in latestIdByType)) latestIdByType[a.type] = a.id;
          }

          const relTime = (iso: string) => {
            const diff = Date.now() - new Date(iso).getTime();
            const mins = Math.floor(diff / 60000);
            const hrs = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            if (mins < 1) return "just now";
            if (mins < 60) return `${mins}m ago`;
            if (hrs < 24) return `${hrs}h ago`;
            return `${days}d ago`;
          };

          const visible = artifactBucket === "all" ? artifacts : artifacts.filter(a => bucketOf(a.type) === artifactBucket);
          if (visible.length === 0) {
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.4 }}>
                Nothing in this bucket yet.
              </div>
            );
          }
          return visible.map(artifact => {
            const cfg = TYPE_CONFIG[artifact.type] ?? {
              label: artifact.type.toUpperCase().slice(0, 8),
              color: "var(--atlas-muted)", bg: "rgba(255,255,255,0.03)", border: "var(--atlas-border)",
            };
            const isExpanded = expandedArtifactId === artifact.id;
            const isLatest = latestIdByType[artifact.type] === artifact.id;
            const isBuild = artifact.type === "build_output";
            const isBlueprint = artifact.type === "blueprint_snapshot";
            const isDesignPlan = artifact.type === "design_plan";
            const isSketch = artifact.type === "visual_sketch";
            const metaExt = typeof artifact.metadata?.extension === "string" ? (artifact.metadata.extension as string).toLowerCase() : "";
            const resolution = resolveItemDestination({
              type: artifact.type,
              extension: metaExt || null,
              metadata: artifact.metadata ?? null,
            });
            const isHtmlPreview = resolution.destination === "sandbox";

            const dp = artifact.payload as Record<string, unknown>;
            const bpIdentity = (artifact.payload.identity as Record<string, unknown>) ?? {};
            const bpIntent   = (artifact.payload.intent   as Record<string, unknown>) ?? {};
            const bpPages    = (artifact.payload.pages    as Array<{ name?: string; purpose?: string }>) ?? [];
            const bpComps    = (artifact.payload.components as Array<{ name?: string }>) ?? [];
            const bpData     = (artifact.payload.data     as Record<string, unknown>) ?? {};
            const bpLogic    = (artifact.payload.logic    as unknown[]) ?? [];
            const bpCP       = (artifact.payload.creativePrinciples as string[]) ?? [];
            const bpEI       = (artifact.payload.experienceIntent   as Record<string, unknown>) ?? {};
            const fileCount  = isBuild ? (artifact.metadata.fileCount as number | undefined) : undefined;

            return (
              <div key={artifact.id} style={{ display: "flex", flexDirection: "column" }}>
                <div
                  onClick={() => setExpandedArtifactId(isExpanded ? null : artifact.id)}
                  style={{
                    background: cfg.bg,
                    border: `1px solid ${cfg.border}`,
                    borderRadius: isExpanded ? "6px 6px 0 0" : 6,
                    padding: "7px 10px",
                    display: "flex", flexDirection: "column", gap: 4,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 7.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                      color: cfg.color, background: "rgba(0,0,0,0.25)", borderRadius: 3,
                      padding: "1px 5px", flexShrink: 0,
                    }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 7.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.4, flexShrink: 0 }}>
                      v{artifact.version}
                    </span>
                    {isLatest && (
                      <span style={{ fontSize: 7, fontFamily: "var(--app-font-mono)", color: cfg.color, opacity: 0.6, background: "rgba(0,0,0,0.2)", borderRadius: 2, padding: "0 4px", flexShrink: 0 }}>
                        LATEST
                      </span>
                    )}
                    <span style={{ fontSize: 10.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.85, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {artifact.title}
                    </span>
                    <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35, flexShrink: 0 }}>
                      {relTime(artifact.createdAt)}
                    </span>
                    <span style={{ fontSize: 7.5, color: "var(--atlas-muted)", opacity: 0.25, flexShrink: 0, marginLeft: 2 }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {resolution.available && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={e => e.stopPropagation()}>
                      {isHtmlPreview && (
                        <button
                          onClick={async () => {
                            const preview = artifact.payload.preview as { html?: string } | undefined;
                            let html = (artifact.payload.html as string | undefined) ?? preview?.html;
                            if (!html) {
                              try {
                                const res = await fetch(`/api/projects/${projectId}/artifacts/${artifact.id}/download`, { credentials: "include" });
                                if (res.ok) html = await res.text();
                              } catch { /* fall through */ }
                            }
                            if (!html) return;
                            window.dispatchEvent(new CustomEvent("axiom:open-preview", { detail: { source: "sandbox", content: html } }));
                          }}
                          style={{
                            fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                            color: "rgba(251,191,36,0.85)", background: "rgba(251,191,36,0.08)",
                            border: "1px solid rgba(251,191,36,0.2)", borderRadius: 3,
                            padding: "2px 7px", cursor: "pointer",
                          }}
                        >
                          {resolution.actionLabel}
                        </button>
                      )}
                      {resolution.destination === "viewer" && (
                        <button
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent("axiom:open-artifact-viewer", {
                              detail: { id: artifact.id, type: artifact.type, projectId },
                            }));
                          }}
                          style={{
                            fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                            color: "rgba(167,139,250,0.85)", background: "rgba(167,139,250,0.08)",
                            border: "1px solid rgba(167,139,250,0.2)", borderRadius: 3,
                            padding: "2px 7px", cursor: "pointer",
                          }}
                        >
                          {resolution.actionLabel}
                        </button>
                      )}
                      {resolution.destination === "download" && (
                        <button
                          onClick={() => window.open(`/api/projects/${projectId}/artifacts/${artifact.id}/download`, "_blank")}
                          style={{
                            fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                            color: "rgba(201,162,76,0.85)", background: "rgba(201,162,76,0.08)",
                            border: "1px solid rgba(201,162,76,0.2)", borderRadius: 3,
                            padding: "2px 7px", cursor: "pointer",
                          }}
                        >
                          {resolution.actionLabel}
                        </button>
                      )}
                    </div>
                  )}

                  {isBuild && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={e => e.stopPropagation()}>
                      {typeof fileCount === "number" && (
                        <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45 }}>
                          {fileCount} source files
                        </span>
                      )}
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent("axiom:preview-set-mode", { detail: { source: "local" } }))}
                        style={{
                          fontSize: 8.5, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                          color: "rgba(52,211,153,0.8)", background: "rgba(52,211,153,0.08)",
                          border: "1px solid rgba(52,211,153,0.2)", borderRadius: 3,
                          padding: "2px 7px", cursor: "pointer",
                        }}
                      >
                        → Open Live Preview
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div style={{
                    background: "rgba(0,0,0,0.18)", border: `1px solid ${cfg.border}`, borderTop: "none",
                    borderRadius: "0 0 6px 6px", padding: "10px 12px",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    {isDesignPlan && (
                      <>
                        {dp.navigationPattern   && <DetailRow label="Navigation"     value={String(dp.navigationPattern)} />}
                        {dp.componentPatterns   && <DetailRow label="Components"     value={String(dp.componentPatterns)} />}
                        {dp.motionPhilosophy    && <DetailRow label="Motion"         value={String(dp.motionPhilosophy)} />}
                        {dp.typographyScale     && <DetailRow label="Typography"     value={String(dp.typographyScale)} />}
                        {dp.colorStrategy       && <DetailRow label="Color"          value={String(dp.colorStrategy)} />}
                        {dp.cardDensity         && <DetailRow label="Card density"   value={String(dp.cardDensity)} />}
                        {dp.layoutArchetype     && <DetailRow label="Layout"         value={String(dp.layoutArchetype)} />}
                        {dp.dataDisplayStyle    && <DetailRow label="Data display"   value={String(dp.dataDisplayStyle)} />}
                        {(dp.responsiveIntent as Record<string, unknown>)?.mobile && (
                          <DetailRow label="Mobile intent" value={String((dp.responsiveIntent as Record<string, unknown>).mobile)} />
                        )}
                        {(dp.interactionPatterns as Record<string, unknown>)?.primaryAction && (
                          <DetailRow label="Primary action" value={String((dp.interactionPatterns as Record<string, unknown>).primaryAction)} />
                        )}
                        {(dp.interactionPatterns as Record<string, unknown>)?.feedbackStyle && (
                          <DetailRow label="Feedback style" value={String((dp.interactionPatterns as Record<string, unknown>).feedbackStyle)} />
                        )}
                        {Array.isArray(dp.informationHierarchy) && dp.informationHierarchy.length > 0 && (
                          <div>
                            <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>INFO HIERARCHY</span>
                            {(dp.informationHierarchy as string[]).map((h, i) => (
                              <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>· {h}</div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(dp.keyComponents) && dp.keyComponents.length > 0 && (
                          <div>
                            <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>KEY COMPONENTS</span>
                            {(dp.keyComponents as string[]).map((c, i) => (
                              <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>· {c}</div>
                            ))}
                          </div>
                        )}
                        {dp.accessibilityNotes && <DetailRow label="Accessibility" value={String(dp.accessibilityNotes)} />}
                      </>
                    )}

                    {isBlueprint && (
                      <>
                        {bpIdentity.name        && <DetailRow label="Project"      value={String(bpIdentity.name)} />}
                        {bpIdentity.tagline     && <DetailRow label="Tagline"      value={String(bpIdentity.tagline)} />}
                        {(bpIntent.summary as string | undefined) && <DetailRow label="Intent"  value={String(bpIntent.summary)} />}
                        {(bpIntent.primaryGoal as string | undefined) && <DetailRow label="Goal" value={String(bpIntent.primaryGoal)} />}
                        {(bpIntent.targetUser as string | undefined) && <DetailRow label="User"  value={String(bpIntent.targetUser)} />}
                        {bpPages.length > 0 && (
                          <div>
                            <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>PAGES ({bpPages.length})</span>
                            {bpPages.map((p, i) => (
                              <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>
                                · {p.name ?? "Untitled"}{p.purpose ? ` — ${p.purpose}` : ""}
                              </div>
                            ))}
                          </div>
                        )}
                        {bpComps.length > 0 && (
                          <div>
                            <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>COMPONENTS ({bpComps.length})</span>
                            {bpComps.slice(0, 8).map((c, i) => (
                              <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>· {c.name ?? "Unnamed"}</div>
                            ))}
                            {bpComps.length > 8 && <div style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.3, paddingLeft: 8 }}>+{bpComps.length - 8} more</div>}
                          </div>
                        )}
                        {Array.isArray((bpData as Record<string, unknown>).entities) && ((bpData as Record<string, unknown>).entities as unknown[]).length > 0 && (
                          <DetailRow label="Data entities" value={`${((bpData as Record<string, unknown>).entities as unknown[]).length} defined`} />
                        )}
                        {bpLogic.length > 0 && <DetailRow label="Logic rules" value={`${bpLogic.length} rules`} />}
                        {bpCP.length > 0 && (
                          <div>
                            <span style={{ fontSize: 8, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.45, display: "block", marginBottom: 4, letterSpacing: "0.08em" }}>CREATIVE PRINCIPLES</span>
                            {bpCP.map((p, i) => (
                              <div key={i} style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, paddingLeft: 8, lineHeight: 1.8 }}>· {p}</div>
                            ))}
                          </div>
                        )}
                        {(bpEI.tone as string | undefined) && <DetailRow label="Tone" value={String(bpEI.tone)} />}
                        {(bpEI.energyLevel as string | undefined) && <DetailRow label="Energy" value={String(bpEI.energyLevel)} />}
                        {(bpEI.interaction as string | undefined) && <DetailRow label="Interaction" value={String(bpEI.interaction)} />}
                        {artifact.payload.snapshotAt && (
                          <DetailRow label="Captured at" value={new Date(String(artifact.payload.snapshotAt)).toLocaleString()} />
                        )}
                      </>
                    )}

                    {isBuild && (
                      <>
                        {typeof fileCount === "number" && <DetailRow label="Source files" value={String(fileCount)} />}
                        {artifact.metadata.builtAt && <DetailRow label="Built at" value={new Date(String(artifact.metadata.builtAt)).toLocaleString()} />}
                        <div style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.28, lineHeight: 1.6, marginTop: 2 }}>
                          Build records link to the project's live devserver. Historical per-build snapshots require an external artifact store.
                        </div>
                      </>
                    )}

                    {isSketch && (
                      <>
                        {(artifact.payload.description as string | undefined) && (
                          <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.65, lineHeight: 1.7, borderLeft: `2px solid ${cfg.border}`, paddingLeft: 8 }}>
                            {String(artifact.payload.description)}
                          </div>
                        )}
                        {((artifact.payload.signals as Record<string, string[]> | undefined)?.emotionalRegister?.length ?? 0) > 0 && (
                          <DetailRow label="Emotional register" value={(artifact.payload.signals as Record<string, string[]>).emotionalRegister.join(", ")} />
                        )}
                        {((artifact.payload.signals as Record<string, string[]> | undefined)?.visualLanguage?.length ?? 0) > 0 && (
                          <DetailRow label="Visual language" value={(artifact.payload.signals as Record<string, string[]>).visualLanguage.join(", ")} />
                        )}
                        {((artifact.payload.signals as Record<string, string[]> | undefined)?.colorMood?.length ?? 0) > 0 && (
                          <DetailRow label="Color mood" value={(artifact.payload.signals as Record<string, string[]>).colorMood.join(", ")} />
                        )}
                        {((artifact.payload.signals as Record<string, string[]> | undefined)?.layoutApproach?.length ?? 0) > 0 && (
                          <DetailRow label="Layout" value={(artifact.payload.signals as Record<string, string[]>).layoutApproach.join(", ")} />
                        )}
                        {((artifact.payload.signals as Record<string, string[]> | undefined)?.typographyStyle?.length ?? 0) > 0 && (
                          <DetailRow label="Typography" value={(artifact.payload.signals as Record<string, string[]>).typographyStyle.join(", ")} />
                        )}
                        {artifact.metadata.analyzedAt && (
                          <DetailRow label="Analyzed at" value={new Date(String(artifact.metadata.analyzedAt)).toLocaleString()} />
                        )}
                      </>
                    )}

                    {!isDesignPlan && !isBlueprint && !isBuild && !isSketch && (
                      <div style={{ fontSize: 9.5, fontFamily: "var(--app-font-mono)", color: "var(--atlas-fg)", opacity: 0.55, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
                        {JSON.stringify(artifact.payload, null, 2)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
