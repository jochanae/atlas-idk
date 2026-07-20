import { describe, expect, it } from "vitest";
import {
  classifyAttachment,
  classifyProcessingStatus,
} from "../lib/attachmentClassify";

/**
 * Capability truth for multi-file inject.
 * Full resolveAttachmentIdsForModel needs DB; classification is the gate that
 * decides which uploaded IDs are eligible for model injection + extraction.
 */
describe("multi-file capability → model inclusion", () => {
  it("classifies DOCX as understood (extractable)", () => {
    const mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const c = classifyAttachment(mime, "brief.docx");
    expect(c.kind).toBe("doc");
    expect(c.processingStatus).toBe("understood");
    expect(
      classifyProcessingStatus(c.kind, mime, "brief.docx"),
    ).toBe("understood");
  });

  it("classifies PDF as understood / model-usable", () => {
    const c = classifyAttachment("application/pdf", "spec.pdf");
    expect(c.kind).toBe("pdf");
    expect(c.processingStatus).toBe("understood");
  });

  it("classifies PPTX as understood (extractable)", () => {
    const mime =
      "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const c = classifyAttachment(mime, "deck.pptx");
    expect(c.kind).toBe("doc");
    expect(c.processingStatus).toBe("understood");
  });

  it("classifies ZIP as unsupported / storage-only", () => {
    const c = classifyAttachment("application/zip", "bundle.zip");
    expect(c.kind).toBe("other");
    expect(c.processingStatus).toBe("unsupported");
  });

  it("injects extractable Office + PDF; ZIP stays out", () => {
    const files = [
      classifyAttachment(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "a.docx",
      ),
      classifyAttachment("application/pdf", "b.pdf"),
      classifyAttachment(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "c.pptx",
      ),
      classifyAttachment("application/zip", "d.zip"),
    ];
    const modelInjectable = files.filter(
      (f) => f.processingStatus === "understood",
    );
    expect(modelInjectable).toHaveLength(3);
    expect(modelInjectable.map((f) => f.kind)).toEqual([
      "doc",
      "pdf",
      "doc",
    ]);
  });
});
