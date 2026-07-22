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

  it("replaces false success claims when the tool was attempted but failed", () => {
    const result = checkDeliverableClaims(
      "I've created a spreadsheet with the pricing options. It's in Outputs.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: true },
    );
    expect(result.clean).toBe(false);
    expect(result.correction).toMatch(/tried to generate/i);
    expect(result.correction).not.toMatch(/It's in Outputs/i);
  });

  it("does NOT wipe prose when generate_deliverable was never called", () => {
    const result = checkDeliverableClaims(
      "I've created a spreadsheet with the pricing options. It's in Outputs.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: false },
    );
    expect(result.clean).toBe(true);
    expect(result.correction).toMatch(/I've created a spreadsheet/i);
    expect(result.correction).not.toMatch(/haven't generated a downloadable file/i);
  });

  it("ignores prose that does not claim a file was produced", () => {
    const result = checkDeliverableClaims(
      "I can outline columns for a spreadsheet if you want one.",
      { generatedArtifactsCount: 0 },
    );
    expect(result.clean).toBe(true);
  });

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

  it("preserves PulseDesk-style kickoff prose (no tool call)", () => {
    const kickoff = [
      "PulseDesk is a mobile-first live status dashboard for remote engineering leads.",
      "Purpose: high-level deployment visibility without digging through Jira.",
      "Audience: remote engineering leads.",
      "Identity: PulseDesk — calm, glanceable, mobile-first.",
      "Wedge: status without ticket archaeology.",
      "I've mapped the foundation — ready to open it in Workspace and start shaping the MVP.",
    ].join(" ");
    const result = checkDeliverableClaims(kickoff, {
      generatedArtifactsCount: 0,
      generateDeliverableAttempted: false,
    });
    expect(result.clean).toBe(true);
    expect(result.correction).toContain("PulseDesk");
    expect(result.correction).not.toMatch(/downloadable file/i);
  });

  it("still catches 'open the file' / 'download it' when the tool was attempted", () => {
    expect(
      checkDeliverableClaims("Open the file from the card when you're ready.", {
        generatedArtifactsCount: 0,
        generateDeliverableAttempted: true,
      }).clean,
    ).toBe(false);
    expect(
      checkDeliverableClaims("Download it whenever you need the deck.", {
        generatedArtifactsCount: 0,
        generateDeliverableAttempted: true,
      }).clean,
    ).toBe(false);
  });

  it("does not wipe 'open the file' false positives when no tool was called", () => {
    const result = checkDeliverableClaims(
      "Open the file from the card when you're ready.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: false },
    );
    expect(result.clean).toBe(true);
    expect(result.correction).toContain("Open the file");
  });
});
