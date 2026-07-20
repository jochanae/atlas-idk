import { describe, it, expect } from "vitest";
import { checkAttachmentClaims } from "../attachmentOutputGuard";
import type { AttachmentEvidence } from "../attachmentOutputGuard";

const noEvidence: AttachmentEvidence = {
  resolvedAttachmentCount: 0,
  toolsExecutedThisTurn: new Set(),
};

const withAttachment: AttachmentEvidence = {
  resolvedAttachmentCount: 1,
  toolsExecutedThisTurn: new Set(),
};

const withFileRead: AttachmentEvidence = {
  resolvedAttachmentCount: 0,
  toolsExecutedThisTurn: new Set(["read_file"]),
};

const mixed: AttachmentEvidence = {
  resolvedAttachmentCount: 2,
  toolsExecutedThisTurn: new Set(["read_file", "search_codebase"]),
};

// ── CASE 1: Zero current-turn attachments ────────────────────────────────────

describe("zero current-turn attachments", () => {
  it("blocks 'the screenshot shows'", () => {
    const result = checkAttachmentClaims(
      "The screenshot shows a sidebar with three navigation items.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.correction).toMatch(/don't have access to any attachment/i);
  });

  it("blocks 'I can see' with attachment context", () => {
    const result = checkAttachmentClaims(
      "I can see the image you uploaded — it looks like a login form.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("blocks 'the attached file contains'", () => {
    const result = checkAttachmentClaims(
      "The attached file contains a list of user requirements.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("blocks 'I read the file'", () => {
    const result = checkAttachmentClaims(
      "I read the file you shared and the structure looks good.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
  });

  it("blocks 'I opened the attachment'", () => {
    const result = checkAttachmentClaims(
      "I opened the attachment — the design has a blue header.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
  });

  it("blocks 'I pulled the file'", () => {
    const result = checkAttachmentClaims(
      "I pulled the file and can confirm it's a CSV with 3 columns.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
  });

  it("blocks 'I checked the file'", () => {
    const result = checkAttachmentClaims(
      "I checked the file and everything looks correct.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
  });

  it("blocks 'looking at the screenshot'", () => {
    const result = checkAttachmentClaims(
      "Looking at the screenshot, the button alignment is off.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
  });

  it("blocks 'based on the image'", () => {
    const result = checkAttachmentClaims(
      "Based on the image, the color palette is mostly neutral grays.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
  });

  it("blocks 'the image shows'", () => {
    const result = checkAttachmentClaims(
      "The image shows a dashboard with four metric cards at the top.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
  });

  it("includes the violating snippet in the correction", () => {
    const result = checkAttachmentClaims(
      "The screenshot shows a dark theme with a sidebar.",
      noEvidence,
    );
    expect(result.clean).toBe(false);
    expect(result.correction).toMatch(/I said:/i);
    expect(result.correction).toMatch(/screenshot/i);
  });

  it("passes clean prose with no attachment claims", () => {
    const result = checkAttachmentClaims(
      "That sounds like a solid direction. Let me know what you want to build next.",
      noEvidence,
    );
    expect(result.clean).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("does NOT flag 'I can see why that's frustrating' (non-attachment context)", () => {
    const result = checkAttachmentClaims(
      "I can see why that's frustrating — the latency issue would affect every user.",
      noEvidence,
    );
    expect(result.clean).toBe(true);
  });

  it("does NOT flag 'I can see your point'", () => {
    const result = checkAttachmentClaims(
      "I can see your point about the naming convention.",
      noEvidence,
    );
    expect(result.clean).toBe(true);
  });

  it("does NOT flag 'I can see the appeal of that approach'", () => {
    const result = checkAttachmentClaims(
      "I can see the appeal of that approach — it keeps the codebase flat.",
      noEvidence,
    );
    expect(result.clean).toBe(true);
  });
});

// ── CASE 2: Prior-message attachment — no current-turn attachment ─────────────
// The key invariant: resolvedAttachmentCount covers CURRENT TURN only.
// If the user referenced an image from a prior message but didn't re-attach it,
// the guard should still fire (the model cannot actually re-read past attachments).

describe("prior-message attachment reference (no current-turn attachment)", () => {
  it("blocks claims about content from a prior attachment", () => {
    const result = checkAttachmentClaims(
      "Based on the screenshot you sent earlier, the layout looks good.",
      noEvidence, // resolvedAttachmentCount=0 for THIS turn
    );
    expect(result.clean).toBe(false);
  });

  it("passes when re-attached in this turn (resolvedCount > 0)", () => {
    const result = checkAttachmentClaims(
      "Based on the screenshot you sent, the layout looks good.",
      withAttachment,
    );
    expect(result.clean).toBe(true);
  });
});

// ── CASE 3: Mixed readable / unreadable attachments ──────────────────────────
// If at least one file resolved, all claims are treated as supported.
// The model received real content; it can reference what it saw.

describe("mixed readable/unreadable attachments", () => {
  it("passes when at least one attachment resolved (even if others were skipped)", () => {
    const result = checkAttachmentClaims(
      "The attached file contains the user requirements I was expecting.",
      withAttachment, // resolvedAttachmentCount=1
    );
    expect(result.clean).toBe(true);
  });

  it("passes with multiple resolved + tool reads", () => {
    const result = checkAttachmentClaims(
      "The screenshot shows the login page. I read the file and confirmed the structure.",
      mixed,
    );
    expect(result.clean).toBe(true);
  });

  it("blocks when resolvedCount=0 even if attachments were requested (all skipped)", () => {
    const allSkipped: AttachmentEvidence = {
      resolvedAttachmentCount: 0,
      toolsExecutedThisTurn: new Set(),
    };
    const result = checkAttachmentClaims(
      "The attached file contains several sections.",
      allSkipped,
    );
    expect(result.clean).toBe(false);
  });
});

// ── CASE 4: Tool-claim truth — file-reading tool executed ─────────────────────
// When a file-reading tool actually ran (read_file, read_reference_project_file,
// list_reference_project_dir), the model's file content claims are legitimate.

describe("tool-claim truth (file-reading tool executed)", () => {
  it("passes when read_file ran", () => {
    const result = checkAttachmentClaims(
      "I read the file and found three exported functions.",
      withFileRead,
    );
    expect(result.clean).toBe(true);
  });

  it("passes when read_reference_project_file ran", () => {
    const evidence: AttachmentEvidence = {
      resolvedAttachmentCount: 0,
      toolsExecutedThisTurn: new Set(["read_reference_project_file"]),
    };
    const result = checkAttachmentClaims(
      "I opened the file — it has a standard Express router setup.",
      evidence,
    );
    expect(result.clean).toBe(true);
  });

  it("does NOT pass for non-file tools (search_codebase alone is not file-read evidence)", () => {
    const evidence: AttachmentEvidence = {
      resolvedAttachmentCount: 0,
      toolsExecutedThisTurn: new Set(["search_codebase", "architecture_diff"]),
    };
    const result = checkAttachmentClaims(
      "The attached file contains the auth module.",
      evidence,
    );
    expect(result.clean).toBe(false);
  });

  it("passes for list_reference_project_dir", () => {
    const evidence: AttachmentEvidence = {
      resolvedAttachmentCount: 0,
      toolsExecutedThisTurn: new Set(["list_reference_project_dir"]),
    };
    const result = checkAttachmentClaims(
      "Looking at the file structure, the routes are well organised.",
      evidence,
    );
    expect(result.clean).toBe(true);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty string gracefully", () => {
    const result = checkAttachmentClaims("", noEvidence);
    expect(result.clean).toBe(true);
  });

  it("handles whitespace-only string", () => {
    const result = checkAttachmentClaims("   \n\n   ", noEvidence);
    expect(result.clean).toBe(true);
  });

  it("correction always contains actionable follow-up instruction", () => {
    const result = checkAttachmentClaims("The screenshot shows the form.", noEvidence);
    expect(result.correction).toMatch(/drop it into the next message/i);
  });

  it("correction is non-empty when guard fires", () => {
    const result = checkAttachmentClaims("The image shows a dashboard.", noEvidence);
    expect(result.clean).toBe(false);
    expect(result.correction.length).toBeGreaterThan(0);
  });

  it("violation snippet is capped at 120 chars", () => {
    const longClaim =
      "The screenshot shows a very long description that goes on and on about the content of the image that was supposedly attached to this message.";
    const result = checkAttachmentClaims(longClaim, noEvidence);
    expect(result.clean).toBe(false);
    for (const v of result.violations) {
      expect(v.length).toBeLessThanOrEqual(120);
    }
  });
});
