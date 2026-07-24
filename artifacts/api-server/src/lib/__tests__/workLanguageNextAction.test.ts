import { describe, expect, it } from "vitest";
import { workLanguageNextAction } from "../workLanguageNextAction";

describe("workLanguageNextAction (M2.4 Phase B)", () => {
  it("returns the first open question as work language", () => {
    expect(
      workLanguageNextAction(["Who is this for?", "What ships first?"], []),
    ).toBe("Who is this for?");
  });

  it("falls back to a constraint when no open question", () => {
    expect(workLanguageNextAction([], ["Must stay privacy-first"])).toBe(
      "Must stay privacy-first",
    );
  });

  it("returns empty when there is no work observation", () => {
    expect(workLanguageNextAction([], [])).toBe("");
    expect(workLanguageNextAction(["  "], ["  "])).toBe("");
  });

  it("never emits stage Mad Lib homework prefixes", () => {
    const out = workLanguageNextAction(["pricing for v1?"], []);
    expect(out).not.toMatch(/^Answer:/);
    expect(out).not.toMatch(/Start shaping/i);
    expect(out).not.toMatch(/Pressure-test:/i);
    expect(out).not.toMatch(/Joy is listening/i);
  });
});
