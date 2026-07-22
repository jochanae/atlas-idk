import { describe, expect, it } from "vitest";
import { checkDeliverableClaims } from "../deliverableOutputGuard";

describe("checkDeliverableClaims", () => {
  it("is clean when an artifact was actually generated", () => {
    const result = checkDeliverableClaims(
      "I've created a spreadsheet with the pricing options. Download it from the card.",
      { generatedArtifactsCount: 1 },
    );
    expect(result.clean).toBe(true);
  });

  it("replaces false success claims when no artifact exists", () => {
    const result = checkDeliverableClaims(
      "I've created a spreadsheet with the pricing options. It's in Outputs.",
      { generatedArtifactsCount: 0 },
    );
    expect(result.clean).toBe(false);
    expect(result.correction).toMatch(/haven't generated|did not complete/i);
    expect(result.correction).not.toMatch(/It's in Outputs/i);
  });

  it("mentions retry when the tool was attempted but failed", () => {
    const result = checkDeliverableClaims(
      "Here's your spreadsheet — the file is ready.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: true },
    );
    expect(result.clean).toBe(false);
    expect(result.correction).toMatch(/tried to generate/i);
  });

  it("ignores prose that does not claim a file was produced", () => {
    const result = checkDeliverableClaims(
      "I can outline columns for a spreadsheet if you want one.",
      { generatedArtifactsCount: 0 },
    );
    expect(result.clean).toBe(true);
  });

  // Regression: Aura Focus / CommunityBridge R1 — discovery conclusion wiped
  // because bare "open it" matched the old deliverable pattern.
  it("does not replace discovery prose that says 'open it' without a file claim", () => {
    const discovery = [
      "All six foundational dimensions are locked.",
      "Purpose, audience, identity, and wedge are clear.",
      "Ready to open it in Workspace and shape the MVP,",
      "or keep refining the core organization experience here first?",
    ].join(" ");
    const result = checkDeliverableClaims(discovery, { generatedArtifactsCount: 0 });
    expect(result.clean).toBe(true);
    expect(result.correction).toBe(discovery);
    expect(result.correction).not.toMatch(/haven't generated a downloadable file/i);
  });

  it("still catches 'open the file' / 'download it' false claims", () => {
    expect(
      checkDeliverableClaims("Open the file from the card when you're ready.", {
        generatedArtifactsCount: 0,
      }).clean,
    ).toBe(false);
    expect(
      checkDeliverableClaims("Download it whenever you need the deck.", {
        generatedArtifactsCount: 0,
      }).clean,
    ).toBe(false);
  });
});
