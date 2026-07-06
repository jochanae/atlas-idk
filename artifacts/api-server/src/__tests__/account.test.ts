import { describe, expect, it } from "vitest";
import {
  buildAccountCapacity,
  buildAccountPlan,
  planTierLabel,
  subscriptionTierToPlanTier,
} from "../lib/account";

describe("subscriptionTierToPlanTier", () => {
  it("maps known subscription tiers", () => {
    expect(subscriptionTierToPlanTier("free")).toBe("free");
    expect(subscriptionTierToPlanTier("pro")).toBe("pro");
    expect(subscriptionTierToPlanTier("studio")).toBe("studio");
    expect(subscriptionTierToPlanTier("founder")).toBe("studio");
    expect(subscriptionTierToPlanTier("teams")).toBe("enterprise");
    expect(subscriptionTierToPlanTier(undefined)).toBe("free");
  });
});

describe("planTierLabel", () => {
  it("returns display labels", () => {
    expect(planTierLabel("free")).toBe("Free");
    expect(planTierLabel("pro")).toBe("Pro");
    expect(planTierLabel("studio")).toBe("Studio");
    expect(planTierLabel("enterprise")).toBe("Enterprise");
  });
});

describe("buildAccountPlan", () => {
  it("returns the account plan response shape", () => {
    const cycleResetAt = new Date("2026-07-24T00:00:00.000Z");
    expect(buildAccountPlan("pro", cycleResetAt)).toEqual({
      tier: "pro",
      tier_label: "Pro",
      cycle_reset_at: "2026-07-24T00:00:00.000Z",
      manage_url: "/account/plan",
    });
  });
});

describe("buildAccountCapacity", () => {
  it("computes remaining from included and used", () => {
    const pool = {
      userId: 1,
      tier: "pro",
      monthlyAllotment: 100,
      dailyAllotment: 5,
      usedThisPeriod: 27,
      usedToday: 2,
      topupBalance: 10,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-24T00:00:00.000Z"),
      dayStart: new Date("2026-07-06T00:00:00.000Z"),
      updatedAt: new Date("2026-07-06T00:00:00.000Z"),
    };

    expect(buildAccountCapacity(pool)).toEqual({
      included: 100,
      used: 27,
      remaining: 73,
      cycle_reset_at: "2026-07-24T00:00:00.000Z",
      auto_topup: null,
    });
  });

  it("never returns negative remaining", () => {
    const pool = {
      userId: 1,
      tier: "explorer",
      monthlyAllotment: 30,
      dailyAllotment: 5,
      usedThisPeriod: 45,
      usedToday: 0,
      topupBalance: 0,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-24T00:00:00.000Z"),
      dayStart: new Date("2026-07-06T00:00:00.000Z"),
      updatedAt: new Date("2026-07-06T00:00:00.000Z"),
    };

    expect(buildAccountCapacity(pool).remaining).toBe(0);
  });
});
