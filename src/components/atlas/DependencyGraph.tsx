import { useRef, useState } from "react";

export interface PlanStep {
  id: string;
  label: string;
  dependsOn: string[]; // IDs of steps this depends on
}

interface DependencyGraphProps {
  steps: PlanStep[];
  onPromoteToQueue?: (step: PlanStep, context: PromoteContext) => void;
  onStepTap?: (step: PlanStep) => void;
  onExportJSON?: () => void;
}

/** Context passed alongside a promoted step so the queue knows "why". */
export interface PromoteContext {
  dependencyLabels: string[];
  dependentLabels: string[];
}

const NODE_W = 140;
const NODE_H = 44;
const GAP_X = 180;
const GAP_Y = 72;
const PAD = 24;

/** Detect cycles via DFS. Returns the list of IDs in the first cycle found, or null. */
function detectCycle(steps: PlanStep[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const s of steps) {
    adj.set(s.id, [...s.dependsOn]);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const s of steps) color.set(s.id, WHITE);

  for (const s of steps) {
    if (color.get(s.id) !== WHITE) continue;
    const stack: string[] = [s.id];
    while (stack.length) {
      const u = stack[stack.length - 1];
      if (color.get(u) === WHITE) {
        color.set(u, GRAY);
        for (const v of adj.get(u) ?? []) {
          if (color.get(v) === GRAY) {
            // Found cycle — trace it
            const cycle: string[] = [v];
            let cur = u;
            while (cur !== v) {
              cycle.push(cur);
              cur = parent.get(cur) ?? v;
            }
            cycle.push(v);
            return cycle;
          }
          if (color.get(v) === WHITE) {
            parent.set(v, u);
            stack.push(v);
          }
        }
      } else {
        color.set(u, BLACK);
        stack.pop();
      }
    }
  }
  return null;
}

function sanitizeSteps(raw: PlanStep[]): PlanStep[] {
  const ids = new Set(raw.map((s) => s.id));
  return raw.map((s) => ({
    ...s,
    // Strip dangling dependency refs that point to non-existent steps
    dependsOn: s.dependsOn.filter((d) => ids.has(d)),
  }));
}

function layoutNodes(steps: PlanStep[]) {
  try {
    return layoutNodesInner(steps);
  } catch {
    // Fallback: single-column linear layout
    const positions = new Map<string, { x: number; y: number; layer: number; idx: number }>();
    steps.forEach((s, i) => positions.set(s.id, { x: PAD, y: PAD + i * GAP_Y, layer: 0, idx: i }));
    return {
      positions,
      width: NODE_W + PAD * 2,
      height: Math.max((steps.length - 1) * GAP_Y + NODE_H + PAD * 2, 120),
    };
  }
}

function layoutNodesInner(steps: PlanStep[]) {
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const s of steps) {
    if (!incoming.has(s.id)) incoming.set(s.id, new Set());
    if (!outgoing.has(s.id)) outgoing.set(s.id, new Set());
    for (const dep of s.dependsOn) {
      if (!outgoing.has(dep)) outgoing.set(dep, new Set());
      outgoing.get(dep)!.add(s.id);
      incoming.get(s.id)!.add(dep);
    }
  }

  const layers: string[][] = [];
  const assigned = new Set<string>();
  const remaining = new Set(steps.map((s) => s.id));

  while (remaining.size > 0) {
    const layer: string[] = [];
    for (const id of remaining) {
      const deps = incoming.get(id) ?? new Set();
      const unmet = [...deps].filter((d) => !assigned.has(d));
      if (unmet.length === 0) layer.push(id);
    }
    if (layer.length === 0) {
      // Cycle fallback — dump remaining so layout completes
      layer.push(...remaining);
    }
    for (const id of layer) {
      remaining.delete(id);
      assigned.add(id);
    }
    layers.push(layer);
  }

  const positions = new Map<string, { x: number; y: number; layer: number; idx: number }>();
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    for (let ni = 0; ni < layer.length; ni++) {
      positions.set(layer[ni], {
        x: PAD + li * GAP_X,
        y: PAD + ni * GAP_Y,
        layer: li,
        idx: ni,
      });
    }
  }

  const maxX = (layers.length - 1) * GAP_X + NODE_W + PAD * 2;
  const maxRows = Math.max(...layers.map((l) => l.length), 1);
  const maxY = (maxRows - 1) * GAP_Y + NODE_H + PAD * 2;

  return { positions, width: Math.max(maxX, 300), height: Math.max(maxY, 120) };
}

export function DependencyGraph({ steps: rawSteps, onPromoteToQueue, onStepTap, onExportJSON }: DependencyGraphProps) {
  const steps = sanitizeSteps(rawSteps);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [cycleCopied, setCycleCopied] = useState(false);

  if (steps.length === 0) {
    return (
      <div
        style={{
          padding: "32px 20px",
          textAlign: "center",
          color: "var(--muted-text)",
          fontSize: 13,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.04em",
        }}
      >
        No plan steps yet. Use Plan mode to generate an architectural breakdown.
      </div>
    );
  }

  const cycleIds = detectCycle(steps);
  const cycleSet = new Set(cycleIds ?? []);
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  const { positions, width, height } = layoutNodes(steps);

  // Build dependency context for a step
  const buildContext = (step: PlanStep): PromoteContext => {
    const dependencyLabels = step.dependsOn
      .map((id) => stepMap.get(id)?.label)
      .filter(Boolean) as string[];
    const dependentLabels = steps
      .filter((s) => s.dependsOn.includes(step.id))
      .map((s) => s.label);
    return { dependencyLabels, dependentLabels };
  };

  // Edges
  const edges: { from: { x: number; y: number }; to: { x: number; y: number }; key: string; inCycle: boolean }[] = [];
  for (const step of steps) {
    const toPos = positions.get(step.id);
    if (!toPos) continue;
    for (const depId of step.dependsOn) {
      const fromPos = positions.get(depId);
      if (!fromPos) continue;
      edges.push({
        from: { x: fromPos.x + NODE_W, y: fromPos.y + NODE_H / 2 },
        to: { x: toPos.x, y: toPos.y + NODE_H / 2 },
        key: `${depId}->${step.id}`,
        inCycle: cycleSet.has(depId) && cycleSet.has(step.id),
      });
    }
  }

  return (
    <div
      style={{
        background: "color-mix(in oklab, var(--surface) 92%, var(--accent-gold) 8%)",
        border: "1px solid color-mix(in oklab, var(--accent-gold) 15%, var(--border))",
        borderRadius: 12,
        overflow: "auto",
        maxHeight: 360,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "0.5px solid color-mix(in oklab, var(--border) 60%, transparent)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--accent-gold)",
            opacity: 0.9,
          }}
        >
          Dependency Map · {steps.length} steps
        </span>
        {onExportJSON && (
          <button
            onClick={onExportJSON}
            style={{
              background: "color-mix(in oklab, var(--accent-gold) 12%, transparent)",
              border: "0.5px solid color-mix(in oklab, var(--accent-gold) 30%, var(--border))",
              borderRadius: 6,
              padding: "3px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--accent-gold)",
              cursor: "pointer",
              transition: "opacity 160ms ease",
            }}
          >
            ↓ Blueprint
          </button>
        )}
      </div>

      {/* Cycle Warning Banner */}
      {cycleIds && cycleIds.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "8px 12px 4px",
            padding: "8px 12px",
            background: "color-mix(in oklab, var(--accent-gold) 10%, var(--surface))",
            border: "1px solid color-mix(in oklab, var(--accent-gold) 40%, var(--border))",
            borderRadius: 8,
            animation: "atlas-bubble-in 300ms ease forwards",
          }}
        >
          <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="var(--accent-gold)" strokeWidth={1.4} strokeLinecap="round">
            <path d="M8 1L1 14h14L8 1z" />
            <path d="M8 6v4M8 12v.5" />
          </svg>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--accent-gold)",
              letterSpacing: "0.05em",
              lineHeight: 1.4,
            }}
          >
            <strong>Cycle detected</strong> — {[...new Set(cycleIds)].map((id) => stepMap.get(id)?.label ?? id).join(" → ")}. Resolve dependencies to unlock execution order.
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const uniqueIds = [...new Set(cycleIds)];
              const traceLines = uniqueIds.map((id) => `${stepMap.get(id)?.label ?? id} (${id})`).join(" → ");
              const edgeLines = uniqueIds.map((id, i) => {
                const nextId = uniqueIds[(i + 1) % uniqueIds.length];
                return `  ${id} → ${nextId}`;
              }).join("\n");
              const clipText = `Cycle detected\nTrace: ${traceLines}\nEdges:\n${edgeLines}`;
              navigator.clipboard.writeText(clipText).then(
                () => setCycleCopied(true),
                () => {},
              );
              setTimeout(() => setCycleCopied(false), 1800);
            }}
            style={{
              flexShrink: 0,
              padding: "3px 8px",
              borderRadius: 5,
              border: "0.5px solid color-mix(in oklab, var(--accent-gold) 30%, var(--border))",
              background: cycleCopied ? "color-mix(in oklab, var(--accent-gold) 20%, var(--surface))" : "transparent",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--accent-gold)",
              cursor: "pointer",
              transition: "background 160ms ease",
            }}
          >
            {cycleCopied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        style={{ display: "block", minWidth: width }}
      >
        {/* Edges */}
        {edges.map((e) => {
          const midX = (e.from.x + e.to.x) / 2;
          return (
            <path
              key={e.key}
              d={`M${e.from.x},${e.from.y} C${midX},${e.from.y} ${midX},${e.to.y} ${e.to.x},${e.to.y}`}
              fill="none"
              stroke={e.inCycle ? "var(--ember)" : "var(--accent-gold)"}
              strokeWidth={e.inCycle ? 2 : 1.5}
              strokeOpacity={e.inCycle ? 0.7 : 0.4}
              strokeDasharray={e.inCycle ? "4 3" : undefined}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={6} markerHeight={6} orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--accent-gold)" fillOpacity={0.5} />
          </marker>
        </defs>

        {/* Nodes */}
        {steps.map((step) => {
          const pos = positions.get(step.id);
          if (!pos) return null;
          const isHovered = hoveredId === step.id;
          const isCycled = cycleSet.has(step.id);
          return (
            <g
              key={step.id}
              onMouseEnter={() => setHoveredId(step.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onStepTap?.(step)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={isHovered ? "color-mix(in oklab, var(--surface) 80%, var(--accent-gold) 20%)" : "var(--surface)"}
                stroke={isCycled ? "var(--ember)" : isHovered ? "var(--accent-gold)" : "color-mix(in oklab, var(--accent-gold) 25%, var(--border))"}
                strokeWidth={isCycled ? 1.5 : 1}
                strokeDasharray={isCycled ? "3 2" : undefined}
              />
              {/* Gold dot */}
              <circle cx={pos.x + 12} cy={pos.y + NODE_H / 2} r={3} fill={isCycled ? "var(--ember)" : "var(--accent-gold)"} fillOpacity={0.6} />
              <text
                x={pos.x + 22}
                y={pos.y + NODE_H / 2 + 1}
                dominantBaseline="central"
                fill={isCycled ? "var(--ember)" : "var(--foreground)"}
                fontSize={11}
                fontFamily="var(--font-mono)"
              >
                {step.label.length > 14 ? step.label.slice(0, 13) + "…" : step.label}
              </text>
              {/* Promote arrow */}
              {onPromoteToQueue && (
                <g
                  onClick={(e) => {
                    e.stopPropagation();
                    onPromoteToQueue(step, buildContext(step));
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={pos.x + NODE_W - 26}
                    y={pos.y + 6}
                    width={20}
                    height={20}
                    rx={4}
                    fill="transparent"
                  />
                  <path
                    d={`M${pos.x + NODE_W - 19},${pos.y + 20} l5,-6 5,6`}
                    stroke="var(--accent-gold)"
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                    opacity={isHovered ? 0.9 : 0}
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
