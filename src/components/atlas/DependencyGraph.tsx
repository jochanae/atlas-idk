import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueItem } from "./TaskQueue";

export interface PlanStep {
  id: string;
  label: string;
  dependsOn: string[]; // IDs of steps this depends on
}

interface DependencyGraphProps {
  steps: PlanStep[];
  onPromoteToQueue?: (step: PlanStep) => void;
  onStepTap?: (step: PlanStep) => void;
}

const NODE_W = 140;
const NODE_H = 44;
const GAP_X = 180;
const GAP_Y = 72;
const PAD = 24;

function layoutNodes(steps: PlanStep[]) {
  // Topological sort into layers
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
      // Cycle — just dump remaining
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

export function DependencyGraph({ steps, onPromoteToQueue, onStepTap }: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

  const { positions, width, height } = layoutNodes(steps);
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  // Edges
  const edges: { from: { x: number; y: number }; to: { x: number; y: number }; key: string }[] = [];
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
        maxHeight: 320,
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
      </div>

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
              stroke="var(--accent-gold)"
              strokeWidth={1.5}
              strokeOpacity={0.4}
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
                stroke={isHovered ? "var(--accent-gold)" : "color-mix(in oklab, var(--accent-gold) 25%, var(--border))"}
                strokeWidth={1}
              />
              {/* Gold dot */}
              <circle cx={pos.x + 12} cy={pos.y + NODE_H / 2} r={3} fill="var(--accent-gold)" fillOpacity={0.6} />
              <text
                x={pos.x + 22}
                y={pos.y + NODE_H / 2 + 1}
                dominantBaseline="central"
                fill="var(--foreground)"
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
                    onPromoteToQueue(step);
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
