import { useAccountPlan, useAccountCapacity } from "@/lib/useAccountMock";
import type { CSSProperties } from "react";

/**
 * AccountSummarySections
 *
 * Renders the Identity → Continuity → Plan → Capacity blocks that sit
 * above the existing project dropdown actions in the project sheet.
 *
 * All action items (Rename, Export, Archive, Switch project, etc.) remain
 * in workspace.tsx and are NOT re-implemented here.
 */

const labelStyle: CSSProperties = {
  fontFamily: "var(--app-font-mono)",
  fontSize: 9.5,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--atlas-muted)",
  opacity: 0.7,
  padding: "6px 12px 2px",
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: "var(--atlas-border)",
  margin: "6px 6px",
  opacity: 0.5,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 12px",
  fontFamily: "var(--app-font-sans)",
  fontSize: 12.5,
  color: "var(--atlas-fg)",
};

export type AccountSummaryProps = {
  projectName: string | null;
  workspaceLabel?: string | null;
  updatedLabel?: string | null;
  collaboratorCount?: number;
  lastSessionTitle?: string | null;
  readinessLabel?: string | null;
  memoryStatus?: "healthy" | "attention" | "unknown";
  onManagePlan?: () => void;
  onAddCapacity?: () => void;
  onAutoTopup?: () => void;
};

function relTime(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  if (days <= 0) return "soon";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

export default function AccountSummarySections(props: AccountSummaryProps) {
  const { plan } = useAccountPlan();
  const { capacity } = useAccountCapacity();

  const pct = capacity && capacity.included > 0
    ? Math.max(0, Math.min(100, (capacity.remaining / capacity.included) * 100))
    : 0;

  return (
    <>
      {/* ── IDENTITY ── */}
      <div style={labelStyle}>Identity</div>
      <div style={{ padding: "2px 12px 8px" }}>
        <div style={{
          fontFamily: "var(--app-font-sans)",
          fontSize: 15,
          color: "var(--atlas-fg)",
          fontWeight: 600,
          letterSpacing: "-0.005em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {props.projectName ?? "Untitled project"}
        </div>
        <div style={{
          marginTop: 4,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          fontFamily: "var(--app-font-mono)",
          fontSize: 10.5,
          color: "var(--atlas-muted)",
          letterSpacing: "0.04em",
        }}>
          {props.workspaceLabel && <span>{props.workspaceLabel}</span>}
          {props.updatedLabel && <><span style={{ opacity: 0.4 }}>·</span><span>Updated {props.updatedLabel}</span></>}
          {typeof props.collaboratorCount === "number" && (
            <><span style={{ opacity: 0.4 }}>·</span><span>{props.collaboratorCount} collaborator{props.collaboratorCount === 1 ? "" : "s"}</span></>
          )}
        </div>
      </div>

      <div style={dividerStyle} />

      {/* ── CONTINUITY (Axiom differentiator) ── */}
      <div style={labelStyle}>Continuity</div>
      <div style={{ padding: "2px 12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          fontFamily: "var(--app-font-sans)",
          fontSize: 12.5,
          color: "var(--atlas-fg)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: "var(--atlas-gold)",
            boxShadow: "0 0 8px rgba(201,162,76,0.6)",
            flexShrink: 0,
          }} />
          Joy knows this project
        </div>
        {props.lastSessionTitle && (
          <div style={{ fontSize: 11.5, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)" }}>
            Last: <span style={{ color: "var(--atlas-fg)", opacity: 0.85 }}>{props.lastSessionTitle}</span>
          </div>
        )}
        <div style={{
          display: "flex", gap: 10, flexWrap: "wrap",
          fontFamily: "var(--app-font-mono)", fontSize: 10.5,
          color: "var(--atlas-muted)", letterSpacing: "0.04em",
        }}>
          {props.readinessLabel && <span>Readiness: <span style={{ color: "var(--atlas-fg)" }}>{props.readinessLabel}</span></span>}
          <span>
            Memory: <span style={{ color: props.memoryStatus === "attention" ? "rgba(252,165,165,0.9)" : "var(--atlas-gold)" }}>
              {props.memoryStatus === "attention" ? "Attention" : "Healthy"}
            </span>
          </span>
        </div>
      </div>

      <div style={dividerStyle} />

      {/* ── PLAN (collapsible) ── */}
      <details style={{ margin: "2px 0" }}>
        <summary
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 12px", cursor: "pointer", listStyle: "none",
            fontFamily: "var(--app-font-mono)", fontSize: 9.5,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--atlas-muted)", opacity: 0.75,
          }}
        >
          <span>Your plan</span>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 10,
            padding: "2px 7px", borderRadius: 999,
            background: "color-mix(in oklab, var(--atlas-gold) 14%, transparent)",
            border: "1px solid color-mix(in oklab, var(--atlas-gold) 32%, transparent)",
            color: "var(--atlas-gold)", letterSpacing: "0.06em",
            textTransform: "none",
          }}>
            {plan?.tier_label ?? "—"}
          </span>
        </summary>
        <button
          type="button"
          onClick={props.onManagePlan}
          style={{
            ...rowStyle,
            width: "calc(100% - 12px)",
            margin: "2px 6px 6px",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: 6,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 11.5, color: "var(--atlas-muted)" }}>Manage plan</span>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ color: "var(--atlas-muted)", opacity: 0.6 }}>
            <path d="M4.5 2l3 4-3 4" />
          </svg>
        </button>
      </details>

      {/* ── EXECUTION CAPACITY (collapsible) ── */}
      <details style={{ margin: "2px 0" }}>
        <summary
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 12px", cursor: "pointer", listStyle: "none",
            fontFamily: "var(--app-font-mono)", fontSize: 9.5,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--atlas-muted)", opacity: 0.75,
          }}
        >
          <span>Execution capacity</span>
          <span style={{
            fontFamily: "var(--app-font-sans)", fontSize: 11,
            color: "var(--atlas-fg)", textTransform: "none", letterSpacing: 0,
          }}>
            {capacity ? `${capacity.remaining} / ${capacity.included}` : "—"}
          </span>
        </summary>
        <div style={{ padding: "2px 12px 10px" }}>
          <div style={{
            height: 4, borderRadius: 999,
            background: "rgba(201,162,76,0.14)", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: "linear-gradient(90deg, var(--atlas-gold), color-mix(in oklab, var(--atlas-gold) 60%, white))",
              transition: "width 260ms ease",
            }} />
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={props.onAddCapacity}
              style={{
                flex: 1, padding: "6px 8px", borderRadius: 6,
                background: "color-mix(in oklab, var(--atlas-gold) 12%, transparent)",
                border: "1px solid color-mix(in oklab, var(--atlas-gold) 32%, transparent)",
                color: "var(--atlas-gold)", cursor: "pointer",
                fontFamily: "var(--app-font-mono)", fontSize: 10.5,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}
            >
              Add capacity
            </button>
            <button
              type="button"
              onClick={props.onAutoTopup}
              style={{
                flex: 1, padding: "6px 8px", borderRadius: 6,
                background: "transparent",
                border: "1px solid var(--atlas-border)",
                color: "var(--atlas-fg)", cursor: "pointer",
                fontFamily: "var(--app-font-mono)", fontSize: 10.5,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}
            >
              Auto top-up
            </button>
          </div>
          {capacity?.cycle_reset_at && (
            <div style={{
              marginTop: 6, fontSize: 10.5,
              fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)",
              letterSpacing: "0.04em", opacity: 0.8,
            }}>
              Resets {relTime(capacity.cycle_reset_at)}
            </div>
          )}
        </div>
      </details>

      <div style={dividerStyle} />

    </>
  );
}
