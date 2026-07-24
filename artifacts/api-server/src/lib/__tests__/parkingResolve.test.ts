import { describe, expect, it } from "vitest";
import {
  RESOLVE_SCORE_MIN,
  scoreParkResolveMatch,
  shouldAutoResolveParked,
} from "../parkingResolve";
import { detectDeferralParkCandidates } from "../detectDeferralParkCandidates";
import { parkActionForConfidence } from "../parkingConfidence";

describe("parkingResolve precision", () => {
  it("exact titles resolve", () => {
    expect(shouldAutoResolveParked(
      "Entrepreneurs are the primary audience",
      "Entrepreneurs are the primary audience",
    )).toBe(true);
    expect(scoreParkResolveMatch(
      "Entrepreneurs are the primary audience",
      "Entrepreneurs are the primary audience",
    )).toBe(1);
  });

  it("rejects short substring false positives", () => {
    // Legacy bug: "Pricing" ⊆ "Pricing tension for EU launch"
    expect(shouldAutoResolveParked("Pricing", "Pricing tension for EU launch")).toBe(false);
    expect(scoreParkResolveMatch("Pricing", "Pricing tension for EU launch")).toBeLessThan(RESOLVE_SCORE_MIN);
  });

  it("rejects loosely related titles", () => {
    expect(shouldAutoResolveParked(
      "Should we expand to multiple cities?",
      "Lock editorial identity sentence",
    )).toBe(false);
  });

  it("accepts strong overlapping unresolved items", () => {
    expect(shouldAutoResolveParked(
      "Primary audience should be entrepreneurs",
      "Entrepreneurs are the primary audience",
    )).toBe(true);
  });
});

describe("detectDeferralParkCandidates", () => {
  it("detects decide-later language in ask band", () => {
    const found = detectDeferralParkCandidates({
      userMessage: "What about pricing?",
      assistantResponse: "We'll decide later whether sponsorship or subscriptions come first.",
    });
    expect(found.length).toBeGreaterThan(0);
    const c = found[0]!;
    expect(parkActionForConfidence(c.confidence)).toBe("ask");
    expect(c.confidence).toBeGreaterThanOrEqual(80);
    expect(c.confidence).toBeLessThan(95);
  });

  it("ignores ordinary chat without deferral", () => {
    const found = detectDeferralParkCandidates({
      userMessage: "Looks good",
      assistantResponse: "Great — I'll update the summary.",
    });
    expect(found).toEqual([]);
  });
});
