import { describe, expect, it } from "vitest";
import { buildWorkspaceContextSeed, isUnresolvedDecisionEntry } from "@/lib/activeProjectContext";

describe("active project Ask Atlas seed", () => {
  it("includes project name, recent events, and unresolved decisions", () => {
    const seed = buildWorkspaceContextSeed({
      projectId: 42,
      sessionId: 9001,
      projectName: "SanctumIQ Pitch Deck",
      memoryBrief: "fundraising pitch deck",
      lastUserGoal: "tighten the mobile escape hatch",
      recentEvents: ["Run: Updated mobile navigation"],
      unresolvedDecisions: [{ id: 7, title: "Choose donor proof points" }],
      updatedAt: Date.now(),
    });

    expect(seed).toContain("SanctumIQ Pitch Deck");
    expect(seed).toContain("Run: Updated mobile navigation");
    expect(seed).toContain("Choose donor proof points");
  });

  it("detects open decision entries from current entry shape", () => {
    expect(isUnresolvedDecisionEntry({ status: "draft", mode: "decision" })).toBe(true);
    expect(isUnresolvedDecisionEntry({ status: "parked", verb: "decision_catch" })).toBe(true);
    expect(isUnresolvedDecisionEntry({ status: "committed", mode: "decision" })).toBe(false);
    expect(isUnresolvedDecisionEntry({ status: "draft", mode: "think" })).toBe(false);
  });
});