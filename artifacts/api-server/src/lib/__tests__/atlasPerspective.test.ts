import { describe, expect, it } from "vitest";
import {
  normalizePerspective,
  isAtlasPerspective,
  perspectiveMetaLine,
} from "../atlasPerspective";

describe("normalizePerspective (api-server)", () => {
  it("maps legacy chat modes to canonical perspectives", () => {
    expect(normalizePerspective("flow")).toBe("storyteller");
    expect(normalizePerspective("build")).toBe("builder");
    expect(normalizePerspective("look")).toBe("designer");
    expect(normalizePerspective("scenario")).toBe("storyteller");
  });

  it("passes through canonical ids", () => {
    for (const id of ["designer", "builder", "storyteller"] as const) {
      expect(normalizePerspective(id)).toBe(id);
      expect(isAtlasPerspective(id)).toBe(true);
    }
  });

  it("defaults unknown to storyteller", () => {
    expect(normalizePerspective(undefined)).toBe("storyteller");
    expect(normalizePerspective("nope")).toBe("storyteller");
  });
});

describe("perspectiveMetaLine", () => {
  it("acknowledges perspective and speculate for Phase A stub", () => {
    expect(perspectiveMetaLine("builder", false)).toContain("builder");
    expect(perspectiveMetaLine("designer", true)).toContain("speculate");
  });
});
