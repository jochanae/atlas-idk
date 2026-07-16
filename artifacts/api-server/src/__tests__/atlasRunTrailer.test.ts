import { describe, expect, it } from "vitest";
import {
  appendAtlasRunTrailer,
  hasAtlasRunTrailer,
} from "../lib/atlasRunTrailer";

describe("atlasRunTrailer", () => {
  it("appends Atlas-Run trailer when runId is present", () => {
    expect(appendAtlasRunTrailer("Fix auth", "run-123")).toBe(
      "Fix auth\n\nAtlas-Run: run-123",
    );
  });

  it("leaves message unchanged when runId is missing", () => {
    expect(appendAtlasRunTrailer("Fix auth", null)).toBe("Fix auth");
    expect(appendAtlasRunTrailer("Fix auth", undefined)).toBe("Fix auth");
  });

  it("does not double-stamp an existing trailer", () => {
    const stamped = "Fix auth\n\nAtlas-Run: run-123";
    expect(appendAtlasRunTrailer(stamped, "run-456")).toBe(stamped);
  });

  it("detects trailer in multi-line commit messages", () => {
    expect(hasAtlasRunTrailer("Fix auth\n\nAtlas-Run: abc-def")).toBe(true);
    expect(hasAtlasRunTrailer("Human commit")).toBe(false);
    expect(hasAtlasRunTrailer("Mentions Atlas-Run: without newline prefix")).toBe(false);
  });
});
