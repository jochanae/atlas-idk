import { describe, expect, it } from "vitest";
import {
  normalizePerspective,
  legacyWasScenario,
  isAtlasPerspective,
  PERSPECTIVE_CONTRACT,
} from "../atlasPerspective";

describe("normalizePerspective", () => {
  it("maps legacy chat modes", () => {
    expect(normalizePerspective("flow")).toBe("storyteller");
    expect(normalizePerspective("build")).toBe("builder");
    expect(normalizePerspective("look")).toBe("designer");
    expect(normalizePerspective("scenario")).toBe("storyteller");
  });

  it("passes through canonical ids", () => {
    expect(normalizePerspective("designer")).toBe("designer");
    expect(normalizePerspective("builder")).toBe("builder");
    expect(normalizePerspective("storyteller")).toBe("storyteller");
  });

  it("defaults unknown to storyteller", () => {
    expect(normalizePerspective("nope")).toBe("storyteller");
    expect(normalizePerspective(null)).toBe("storyteller");
  });
});

describe("legacyWasScenario", () => {
  it("detects scenario storage", () => {
    expect(legacyWasScenario("scenario")).toBe(true);
    expect(legacyWasScenario("flow")).toBe(false);
  });
});

describe("contracts", () => {
  it("has one-sentence contracts for every perspective", () => {
    for (const id of ["designer", "builder", "storyteller"] as const) {
      expect(isAtlasPerspective(id)).toBe(true);
      expect(PERSPECTIVE_CONTRACT[id].length).toBeGreaterThan(20);
    }
  });
});
