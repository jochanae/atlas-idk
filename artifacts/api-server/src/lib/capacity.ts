import { randomUUID } from "node:crypto";
import { db, capacityPoolsTable, entriesTable, generationRuns, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

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
  estimateId: string;
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

const TIER_ALLOTMENTS: Record<CapacityTier, { monthly: number; daily: number | null }> = {
  explorer: { monthly: 30, daily: 5 },
  pro: { monthly: 150, daily: 5 },
  studio: { monthly: 600, daily: null },
  teams: { monthly: 600, daily: null },
};

const KIND_DEFAULTS: Record<ExecutionKind, { tokens: number; files: number; components: number; model: string }> = {
  forge_codegen: { tokens: 45000, files: 18, components: 2, model: "claude-sonnet-4" },
  sketch_generation: { tokens: 8000, files: 0, components: 0, model: "claude-sonnet-4" },
  image_edit: { tokens: 6000, files: 0, components: 0, model: "claude-sonnet-4" },
  agent_execution: { tokens: 22000, files: 6, components: 0, model: "claude-sonnet-4" },
};

function utcMonthBounds(now = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function subscriptionTierToCapacityTier(subscriptionTier: string | null | undefined): CapacityTier {
  switch (subscriptionTier) {
    case "pro":
      return "pro";
    case "studio":
      return "studio";
    case "teams":
      return "teams";
    case "founder":
      return "studio";
    default:
      return "explorer";
  }
}

export function poolToSnapshot(pool: typeof capacityPoolsTable.$inferSelect): CapacitySnapshot {
  const monthlyRemaining = Math.max(0, pool.monthlyAllotment - pool.usedThisPeriod);
  const remaining = monthlyRemaining + pool.topupBalance;
  const dailyTotal = pool.dailyAllotment ?? 0;
  const dailyRemaining = pool.dailyAllotment == null
    ? remaining
    : Math.max(0, pool.dailyAllotment - pool.usedToday);

  return {
    tier: pool.tier as CapacityTier,
    remaining,
    total: pool.monthlyAllotment,
    usedThisPeriod: pool.usedThisPeriod,
    topupBalance: pool.topupBalance,
    dailyRemaining,
    dailyTotal,
    periodStart: pool.periodStart.toISOString(),
    periodEnd: pool.periodEnd.toISOString(),
    resetsAt: pool.periodEnd.toISOString(),
  };
}

function modelTierMultiplier(model: string): number {
  return model.toLowerCase().includes("opus") ? 2 : 1;
}

function computeCredits(
  estimatedTokens: number,
  estimatedFilesTouched: number,
  model: string,
): number {
  return Math.ceil(
    estimatedTokens / 15000 +
    estimatedFilesTouched / 20 +
    modelTierMultiplier(model),
  );
}

function estimateFromPayload(
  kind: ExecutionKind,
  payload?: { prompt?: string; context?: unknown; model?: string },
): CapacityEstimate["breakdown"] {
  const defaults = KIND_DEFAULTS[kind];
  const prompt = payload?.prompt ?? "";
  const promptLen = prompt.length;
  const contextSize = payload?.context ? JSON.stringify(payload.context).length : 0;
  const scale = 1 + Math.min(1.5, (promptLen + contextSize) / 4000);
  const model = payload?.model ?? defaults.model;

  const estimatedTokens = Math.round(defaults.tokens * scale);
  const estimatedFilesTouched = kind === "forge_codegen" || kind === "agent_execution"
    ? Math.max(1, Math.round(defaults.files * scale))
    : defaults.files;
  const estimatedComponentsAdded = kind === "forge_codegen"
    ? Math.max(0, Math.round(defaults.components * Math.min(1.5, scale)))
    : defaults.components;

  return { estimatedTokens, estimatedFilesTouched, estimatedComponentsAdded, model };
}

function buildTranslation(breakdown: CapacityEstimate["breakdown"], kind: ExecutionKind): string {
  if (breakdown.estimatedFilesTouched > 0) {
    return `Modifies ~${breakdown.estimatedFilesTouched} files, generates ${breakdown.estimatedComponentsAdded} new components`;
  }
  return `Generates one ${kind.replace(/_/g, " ")}`;
}

export function estimateConfidence(
  kind: ExecutionKind,
  payload?: { prompt?: string; context?: unknown },
): "high" | "medium" | "low" {
  if (!payload?.prompt?.trim()) return "low";
  if (kind === "image_edit" || kind === "sketch_generation") return "high";
  if (payload.context) return "medium";
  return "medium";
}

export async function applyPoolResets(
  pool: typeof capacityPoolsTable.$inferSelect,
): Promise<typeof capacityPoolsTable.$inferSelect> {
  const now = new Date();
  const dayStart = utcDayStart(now);
  const { periodStart, periodEnd } = utcMonthBounds(now);
  const updates: Partial<typeof capacityPoolsTable.$inferInsert> = {};

  if (pool.dayStart < dayStart) {
    updates.usedToday = 0;
    updates.dayStart = dayStart;
  }

  if (pool.periodEnd <= now) {
    updates.usedThisPeriod = 0;
    updates.periodStart = periodStart;
    updates.periodEnd = periodEnd;
  }

  if (Object.keys(updates).length === 0) return pool;

  const [updated] = await db
    .update(capacityPoolsTable)
    .set(updates)
    .where(eq(capacityPoolsTable.userId, pool.userId))
    .returning();

  return updated ?? pool;
}

export async function bootstrapCapacityPool(
  userId: number,
  tier: CapacityTier,
): Promise<typeof capacityPoolsTable.$inferSelect> {
  const allotments = TIER_ALLOTMENTS[tier];
  const now = new Date();
  const { periodStart, periodEnd } = utcMonthBounds(now);
  const dayStart = utcDayStart(now);

  const [pool] = await db
    .insert(capacityPoolsTable)
    .values({
      userId,
      tier,
      monthlyAllotment: allotments.monthly,
      dailyAllotment: allotments.daily,
      usedThisPeriod: 0,
      usedToday: 0,
      topupBalance: 0,
      periodStart,
      periodEnd,
      dayStart,
    })
    .onConflictDoUpdate({
      target: capacityPoolsTable.userId,
      set: {
        tier,
        monthlyAllotment: allotments.monthly,
        dailyAllotment: allotments.daily,
        updatedAt: now,
      },
    })
    .returning();

  if (!pool) throw new Error("Failed to bootstrap capacity pool");
  return pool;
}

export async function bootstrapCapacityPoolForUser(userId: number): Promise<typeof capacityPoolsTable.$inferSelect> {
  const [user] = await db
    .select({ subscriptionTier: usersTable.subscriptionTier })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const tier = subscriptionTierToCapacityTier(user?.subscriptionTier);
  return bootstrapCapacityPool(userId, tier);
}

export async function getOrCreatePool(userId: number): Promise<typeof capacityPoolsTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(capacityPoolsTable)
    .where(eq(capacityPoolsTable.userId, userId))
    .limit(1);

  const pool = existing ?? await bootstrapCapacityPoolForUser(userId);
  return applyPoolResets(pool);
}

export function buildEstimate(
  kind: ExecutionKind,
  payload: { prompt?: string; context?: unknown; model?: string } | undefined,
  snapshot: CapacitySnapshot,
): CapacityEstimate {
  const breakdown = estimateFromPayload(kind, payload);
  const credits = computeCredits(
    breakdown.estimatedTokens,
    breakdown.estimatedFilesTouched,
    breakdown.model,
  );
  const dailyOk = snapshot.dailyTotal === 0 || snapshot.dailyRemaining >= credits;
  const sufficient = snapshot.remaining >= credits && dailyOk;

  return {
    estimateId: `est_${randomUUID()}`,
    credits,
    confidence: estimateConfidence(kind, payload),
    breakdown,
    translation: buildTranslation(breakdown, kind),
    sufficient,
    wouldRemainAfter: Math.max(0, snapshot.remaining - credits),
  };
}

async function resolveProjectId(runId?: string): Promise<number | null> {
  if (!runId) return null;
  const [run] = await db
    .select({ projectId: generationRuns.projectId })
    .from(generationRuns)
    .where(eq(generationRuns.id, runId))
    .limit(1);
  if (run) return run.projectId;

  try {
    const result = await db.execute<{ project_id: number }>(sql`
      SELECT project_id FROM execution_runs WHERE id = ${runId} LIMIT 1
    `);
    const row = result.rows[0];
    return row?.project_id ?? null;
  } catch {
    return null;
  }
}

export interface ConsumeInput {
  kind: ExecutionKind;
  estimateId?: string;
  actualCredits: number;
  actualTokens?: number;
  filesTouched?: number;
  componentsAdded?: number;
  runId?: string;
  ledgerEntryId?: string;
  model?: string;
}

export async function consumeCapacity(
  userId: number,
  input: ConsumeInput,
): Promise<{ snapshot: CapacitySnapshot; paymentRequired: boolean; debt?: number }> {
  const pool = await getOrCreatePool(userId);
  const credits = Math.max(0, Math.ceil(input.actualCredits));

  const monthlyRemainingBefore = Math.max(0, pool.monthlyAllotment - pool.usedThisPeriod);
  const fromMonthly = Math.min(credits, monthlyRemainingBefore);
  const fromTopup = credits - fromMonthly;

  let newTopupBalance = pool.topupBalance - fromTopup;
  let debt: number | undefined;
  let paymentRequired = false;

  if (newTopupBalance < 0) {
    debt = Math.abs(newTopupBalance);
    newTopupBalance = 0;
    paymentRequired = true;
    logger.warn({ userId, credits, debt }, "capacity: debt incurred — work already completed");
  }

  const [updated] = await db
    .update(capacityPoolsTable)
    .set({
      usedThisPeriod: pool.usedThisPeriod + credits,
      usedToday: pool.usedToday + credits,
      topupBalance: newTopupBalance,
    })
    .where(eq(capacityPoolsTable.userId, userId))
    .returning();

  const snapshot = poolToSnapshot(updated ?? pool);

  const projectId = await resolveProjectId(input.runId);
  if (projectId) {
    const details = {
      estimateId: input.estimateId,
      estimate: input.estimateId,
      actual: credits,
      actualTokens: input.actualTokens,
      filesTouched: input.filesTouched,
      componentsAdded: input.componentsAdded,
      model: input.model ?? KIND_DEFAULTS[input.kind].model,
      runId: input.runId,
      ledgerEntryId: input.ledgerEntryId,
      debt,
    };

    try {
      await db.insert(entriesTable).values({
        projectId,
        type: "Decision",
        status: "committed",
        severity: "info",
        mode: "capacity",
        verb: "capacity_consumed",
        title: "Capacity consumed",
        summary: `Executed · ${input.kind} · ${credits} credits`,
        details: JSON.stringify(details),
        enrichmentJson: JSON.stringify(details),
      });
    } catch (err) {
      logger.warn({ err, userId, projectId }, "capacity: ledger entry insert failed");
    }
  }

  return { snapshot, paymentRequired, debt };
}

export async function resetDuePools(): Promise<number> {
  const now = new Date();
  const dayStart = utcDayStart(now);
  const { periodStart, periodEnd } = utcMonthBounds(now);

  const dailyUpdated = await db
    .update(capacityPoolsTable)
    .set({ usedToday: 0, dayStart })
    .where(sql`${capacityPoolsTable.dayStart} < ${dayStart}`)
    .returning({ userId: capacityPoolsTable.userId });

  const monthlyUpdated = await db
    .update(capacityPoolsTable)
    .set({
      usedThisPeriod: 0,
      periodStart,
      periodEnd,
    })
    .where(sql`${capacityPoolsTable.periodEnd} <= ${now}`)
    .returning({ userId: capacityPoolsTable.userId });

  return dailyUpdated.length + monthlyUpdated.length;
}
