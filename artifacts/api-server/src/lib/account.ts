import type { capacityPoolsTable } from "@workspace/db";

export type AccountPlanTier = "free" | "pro" | "studio" | "enterprise";

export interface AccountPlanResponse {
  tier: AccountPlanTier;
  tier_label: string;
  cycle_reset_at: string;
  manage_url: string;
}

export interface AccountAutoTopup {
  enabled: boolean;
  threshold: number;
  refill_amount_usd: number;
  monthly_ceiling_usd: number | null;
}

export interface AccountCapacityResponse {
  included: number;
  used: number;
  remaining: number;
  cycle_reset_at: string;
  auto_topup: AccountAutoTopup | null;
}

const TIER_LABELS: Record<AccountPlanTier, string> = {
  free: "Free",
  pro: "Pro",
  studio: "Studio",
  enterprise: "Enterprise",
};

export function subscriptionTierToPlanTier(
  subscriptionTier: string | null | undefined,
): AccountPlanTier {
  switch (subscriptionTier) {
    case "pro":
      return "pro";
    case "studio":
    case "founder":
      return "studio";
    case "teams":
      return "enterprise";
    default:
      return "free";
  }
}

export function planTierLabel(tier: AccountPlanTier): string {
  return TIER_LABELS[tier];
}

export function buildAccountPlan(
  subscriptionTier: string | null | undefined,
  cycleResetAt: Date,
): AccountPlanResponse {
  const tier = subscriptionTierToPlanTier(subscriptionTier);
  return {
    tier,
    tier_label: planTierLabel(tier),
    cycle_reset_at: cycleResetAt.toISOString(),
    manage_url: "/account/plan",
  };
}

export function buildAccountCapacity(
  pool: typeof capacityPoolsTable.$inferSelect,
): AccountCapacityResponse {
  const included = pool.monthlyAllotment;
  const used = pool.usedThisPeriod;
  const remaining = Math.max(0, included - used);

  return {
    included,
    used,
    remaining,
    cycle_reset_at: pool.periodEnd.toISOString(),
    auto_topup: null,
  };
}
