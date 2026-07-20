import { describe, expect, it } from "vitest";
import {
  attachmentExtLabel,
  documentAnalyzedSubtitle,
  formatAttachmentSize,
  responseGeneratedSubtitle,
  unsupportedAttachmentReason,
} from "../workspaceActivityFormat";

describe("formatAttachmentSize", () => {
  it("formats bytes / KB / MB", () => {
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(2400)).toBe("2.3 KB");
    expect(formatAttachmentSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });
});

describe("attachmentExtLabel", () => {
  it("prefers filename extension", () => {
    expect(attachmentExtLabel("quarterly-deck.pptx")).toBe("pptx");
    expect(attachmentExtLabel("shot.PNG")).toBe("png");
  });
});

describe("unsupportedAttachmentReason", () => {
  it("returns PPTX contract string", () => {
    expect(
      unsupportedAttachmentReason(
        "quarterly-deck.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe("PPTX not yet readable");
  });

  it("maps machine reasons", () => {
    expect(unsupportedAttachmentReason("a.bin", undefined, "download_failed")).toBe(
      "Could not load file from storage",
    );
  });
});

describe("documentAnalyzedSubtitle", () => {
  it("counts words and slides", () => {
    expect(documentAnalyzedSubtitle("hello world")).toBe("2 words");
    expect(
      documentAnalyzedSubtitle("[Slide 1]\none two\n\n[Slide 2]\nthree"),
    ).toBe("2 slides · 3 words");
  });
});

describe("responseGeneratedSubtitle", () => {
  it("includes ms and tokens when present", () => {
    expect(
      responseGeneratedSubtitle({
        executionTimeMs: 1520,
        inputTokens: 100,
        outputTokens: 50,
      }),
    ).toBe("1520 ms · 150 tokens");
  });

  it("omits when empty", () => {
    expect(responseGeneratedSubtitle({})).toBeUndefined();
  });
});
