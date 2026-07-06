/**
 * useAccountMock — temporary account-scoped plan + capacity source.
 *
 * Backend endpoints are not live yet. When they land, replace the internals
 * of `useAccountPlan` / `useAccountCapacity` with real fetches — component
 * consumers do not change.
 *
 * See docs/handoffs/2026-07-06-account-plan-capacity-backend.md for the
 * expected response shapes.
 */

export const USE_MOCK_ACCOUNT = true;

export type AccountPlan = {
  tier: "free" | "pro" | "studio" | "enterprise";
  tier_label: string;
  cycle_reset_at: string; // ISO
  manage_url: string;
};

export type AutoTopup = {
  enabled: boolean;
  threshold: number;
  refill_amount_usd: number;
  monthly_ceiling_usd: number | null;
};

export type AccountCapacity = {
  included: number;
  used: number;
  remaining: number;
  cycle_reset_at: string; // ISO
  auto_topup: AutoTopup | null;
};

const MOCK_PLAN: AccountPlan = {
  tier: "pro",
  tier_label: "Pro",
  cycle_reset_at: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
  manage_url: "/account/plan",
};

const MOCK_CAPACITY: AccountCapacity = {
  included: 100,
  used: 27,
  remaining: 73,
  cycle_reset_at: MOCK_PLAN.cycle_reset_at,
  auto_topup: null,
};

export function useAccountPlan(): { plan: AccountPlan | null; loading: boolean } {
  if (USE_MOCK_ACCOUNT) return { plan: MOCK_PLAN, loading: false };
  return { plan: null, loading: true };
}

export function useAccountCapacity(): { capacity: AccountCapacity | null; loading: boolean } {
  if (USE_MOCK_ACCOUNT) return { capacity: MOCK_CAPACITY, loading: false };
  return { capacity: null, loading: true };
}
