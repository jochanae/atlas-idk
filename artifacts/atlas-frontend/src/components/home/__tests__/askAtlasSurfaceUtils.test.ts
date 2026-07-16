import { describe, expect, it } from "vitest";
import {
  askAtlasMessageHasSketch,
  resolveAskAtlasSketchSrc,
} from "../askAtlasSurfaceUtils";
import {
  buildSketchPrompt,
  formatSketchUserPromptDisplay,
} from "@/lib/sketchStylePresets";

describe("resolveAskAtlasSketchSrc", () => {
  it("prefers imageB64 over imageGen and imageUrl", () => {
    expect(
      resolveAskAtlasSketchSrc({
        imageB64: "AAA",
        imageMimeType: "image/jpeg",
        imageGen: { images: [{ imageUrl: "data:image/png;base64,BBB" }] },
        imageUrl: "https://example.com/x.png",
      }),
    ).toBe("data:image/jpeg;base64,AAA");
  });

  it("reads imageGen when imageB64 is absent (stream delivery path)", () => {
    expect(
      resolveAskAtlasSketchSrc({
        imageGen: { images: [{ imageUrl: "data:image/png;base64,CCC" }] },
      }),
    ).toBe("data:image/png;base64,CCC");
  });

  it("falls back to imageUrl", () => {
    expect(resolveAskAtlasSketchSrc({ imageUrl: "https://cdn/x.png" })).toBe(
      "https://cdn/x.png",
    );
  });

  it("returns null when no sketch payload exists", () => {
    expect(resolveAskAtlasSketchSrc({})).toBeNull();
  });
});

describe("askAtlasMessageHasSketch", () => {
  it("is true while pending even without a src", () => {
    expect(askAtlasMessageHasSketch({ pendingSketch: true })).toBe(true);
  });

  it("is true when imageGen is present", () => {
    expect(
      askAtlasMessageHasSketch({
        imageGen: { images: [{ imageUrl: "data:image/png;base64,x" }] },
      }),
    ).toBe(true);
  });
});

describe("formatSketchUserPromptDisplay", () => {
  it("collapses the raw marker prompt to a short label", () => {
    const prompt = buildSketchPrompt("concept", "A rooftop cafe with string lights");
    expect(formatSketchUserPromptDisplay(prompt)).toBe("Sketch as Concept");
  });

  it("leaves ordinary user text alone", () => {
    expect(formatSketchUserPromptDisplay("Just thinking out loud")).toBe(
      "Just thinking out loud",
    );
  });
});
