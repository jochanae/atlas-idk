import { useEffect, useState, useCallback } from "react";

/**
 * Capacity is metered ONLY for AI execution (Forge codegen, sketch, image edits).
 * Thinking (chat/plan/decide/ledger) is never metered.
 *
 * Frontend runs against a mock until backend endpoints ship. See
 * docs/handoffs/2026-07-05-capacity-metering-backend.md for the contract.
 */

export type CapacityTier = "explorer" | "pro" | "studio" | "teams";

export type ExecutionKind =
  | "forge_codegen"
  | "sketch_generation"
  | "image_edit"
  | "agent_execution";

export interface CapacitySnapshot {
  tier: CapacityTier;
  remaining: number;
  total: number;
  usedThisPeriod: number;
  topupBalance: number;
  dailyRemaining: number;
  dailyTotal: number;
  periodStart: string;
  periodEnd: string;
  resetsAt: string;
}

export interface CapacityEstimate {
  credits: number;
  confidence: "high" | "medium" | "low";
  breakdown: {
    estimatedTokens: number;
    estimatedFilesTouched: number;
    estimatedComponentsAdded: number;
    model: string;
  };
  translation: string;
  sufficient: boolean;
  wouldRemainAfter: number;
}

/**
 * Enforcement flag. Flip to true only when backend endpoints are live and
 * verified. Until then, UI renders but never actually blocks execution.
 */
export const CAPACITY_ENFORCEMENT_ENABLED = false;

/** Working defaults — not final pricing. */
const TIER_DEFAULTS: Record<CapacityTier, { monthly: number; daily: number | null }> = {
  explorer: { monthly: 30, daily: 5 },
  pro: { monthly: 150, daily: 5 },
  studio: { monthly: 600, daily: null },
  teams: { monthly: 600, daily: null },
};

/** Mock snapshot — tweak `used` to preview each threshold. */
const MOCK_TIER: CapacityTier = "pro";
const MOCK_USED = 22;

function mockSnapshot(): CapacitySnapshot {
  const { monthly, daily } = TIER_DEFAULTS[MOCK_TIER];
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    tier: MOCK_TIER,
    remaining: Math.max(0, monthly - MOCK_USED),
    total: monthly,
    usedThisPeriod: MOCK_USED,
    topupBalance: 0,
    dailyRemaining: daily ?? 0,
    dailyTotal: daily ?? 0,
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    periodEnd: periodEnd.toISOString(),
    resetsAt: periodEnd.toISOString(),
  };
}

function mockEstimate(kind: ExecutionKind, remaining: number): CapacityEstimate {
  const base = {
    forge_codegen: { credits: 3, files: 18, components: 2, tokens: 45000 },
    sketch_generation: { credits: 1, files: 0, components: 0, tokens: 8000 },
    image_edit: { credits: 1, files: 0, components: 0, tokens: 6000 },
    agent_execution: { credits: 2, files: 6, components: 0, tokens: 22000 },
  }[kind];

  return {
    credits: base.credits,
    confidence: "medium",
    breakdown: {
      estimatedTokens: base.tokens,
      estimatedFilesTouched: base.files,
      estimatedComponentsAdded: base.components,
      model: "claude-sonnet-4",
    },
    translation:
      base.files > 0
        ? `Modifies ~${base.files} files, generates ${base.components} new components`
        : `Generates one ${kind.replace("_", " ")}`,
    sufficient: remaining >= base.credits,
    wouldRemainAfter: Math.max(0, remaining - base.credits),
  };
}

export function useCapacity() {
  const [snapshot, setSnapshot] = useState<CapacitySnapshot | null>(null);

  useEffect(() => {
    // TODO(backend): swap for `fetch('/api/capacity')` when live
    setSnapshot(mockSnapshot());
  }, []);

  const estimate = useCallback(
    async (kind: ExecutionKind, _payload?: unknown): Promise<CapacityEstimate> => {
      // TODO(backend): POST /api/capacity/estimate
      const current = snapshot?.remaining ?? 0;
      return mockEstimate(kind, current);
    },
    [snapshot],
  );

  const percentRemaining = snapshot
    ? Math.round((snapshot.remaining / Math.max(1, snapshot.total)) * 100)
    : 100;

  return {
    snapshot,
    percentRemaining,
    estimate,
    enforcementEnabled: CAPACITY_ENFORCEMENT_ENABLED,
    refresh: () => setSnapshot(mockSnapshot()),
  };
}

/** Translate raw credits into human-legible units. */
export function translateCredits(credits: number): {
  smallEdits: number;
  mediumFeatures: number;
  majorBuilds: number;
} {
  return {
    smallEdits: credits,
    mediumFeatures: Math.floor(credits / 3),
    majorBuilds: Math.floor(credits / 8),
  };
}
