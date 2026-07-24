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

  it("replaces false success claims when the tool was attempted but failed (quiet recovery)", () => {
    const result = checkDeliverableClaims(
      "I've created a spreadsheet with the pricing options. It's in Outputs.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: true },
    );
    expect(result.clean).toBe(false);
    expect(result.correction).toMatch(/couldn't finish that file/i);
    expect(result.correction).not.toMatch(/It's in Outputs/i);
    expect(result.correction).not.toMatch(/I started to claim/i);
  });

  it("strips false readiness claims when generate_deliverable was never called (no dump footer)", () => {
    const result = checkDeliverableClaims(
      "I've created a spreadsheet with the pricing options. It's in Outputs.\n\nWe can refine columns next.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: false },
    );
    expect(result.clean).toBe(false);
    expect(result.correction).toMatch(/We can refine columns next/i);
    expect(result.correction).not.toMatch(/It's in Outputs/i);
    expect(result.correction).not.toMatch(/No downloadable file was produced/i);
    expect(result.correction).not.toMatch(/I started to claim/i);
  });

  it("replaces a short false 'strategy brief is ready' message with quiet recovery", () => {
    const result = checkDeliverableClaims(
      "Your strategy brief is ready, Jo — download it from the card above.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: false },
    );
    expect(result.clean).toBe(false);
    expect(result.correction).toMatch(/don't have a downloadable file/i);
    expect(result.correction).not.toMatch(/download it from the card/i);
  });

  it("catches progressive 'Generating the brief now' left in the final reply", () => {
    const result = checkDeliverableClaims(
      "Generating the brief now — hang tight.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: false },
    );
    expect(result.clean).toBe(false);
    expect(result.correction).not.toMatch(/Generating the brief/i);
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
    expect(result.correction).not.toMatch(/downloadable file/i);
  });

  it("preserves PulseDesk-style kickoff prose (no tool call, no download claim)", () => {
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

  it("corrects 'open the file' / download-from-card claims even when no tool was called", () => {
    const result = checkDeliverableClaims(
      "Open the file from the card when you're ready.",
      { generatedArtifactsCount: 0, generateDeliverableAttempted: false },
    );
    expect(result.clean).toBe(false);
    expect(result.correction).not.toMatch(/Open the file from the card/i);
  });
});
