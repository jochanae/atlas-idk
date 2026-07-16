import { describe, expect, it } from "vitest";
import { isUsableDraftHtml, downloadPathFor } from "../library/openDraftPreview";

describe("openDraftPreview helpers", () => {
  it("builds the canonical download path from sourceRef ids", () => {
    expect(downloadPathFor({
      sourceKind: "project-artifact",
      sourceId: "680",
      projectId: 260,
    })).toBe("/api/projects/260/artifacts/680/download");
  });

  it("accepts doctype and html-rooted documents", () => {
    expect(isUsableDraftHtml("<!DOCTYPE html><html><body>ok</body></html>")).toBe(true);
    expect(isUsableDraftHtml("  <html lang='en'><body>ok</body></html>")).toBe(true);
    expect(isUsableDraftHtml('{"error":"Unauthorized"}')).toBe(false);
    expect(isUsableDraftHtml("<div>fragment</div>")).toBe(false);
  });
});
