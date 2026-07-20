import { describe, expect, it } from "vitest";
import {
  classifyAttachment,
  classifyProcessingStatus,
} from "../lib/attachmentClassify";

/**
 * Capability truth for the DOCX + PDF + PPTX repro.
 * Full resolveAttachmentIdsForModel needs DB; classification is the gate that
 * turns two uploaded IDs into one model-injected attachment.
 */
describe("multi-file capability → model inclusion", () => {
  it("classifies DOCX as unsupported / storage-only", () => {
    const mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const c = classifyAttachment(mime, "brief.docx");
    expect(c.kind).toBe("doc");
    expect(c.processingStatus).toBe("unsupported");
    expect(
      classifyProcessingStatus(c.kind, mime, "brief.docx"),
    ).toBe("unsupported");
  });

  it("classifies PDF as understood / model-usable", () => {
    const c = classifyAttachment("application/pdf", "spec.pdf");
    expect(c.kind).toBe("pdf");
    expect(c.processingStatus).toBe("understood");
  });

  it("classifies PPTX as unsupported / storage-only", () => {
    const mime =
      "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const c = classifyAttachment(mime, "deck.pptx");
    expect(c.kind).toBe("doc");
    expect(c.processingStatus).toBe("unsupported");
  });

  it("explains the 2→1 model loss: only understood files inject", () => {
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
    ];
    // PPTX failed upload in the repro — exclude from ready set.
    const ready = files.slice(0, 2);
    const modelInjectable = ready.filter((f) => f.processingStatus === "understood");
    expect(ready).toHaveLength(2);
    expect(modelInjectable).toHaveLength(1);
    expect(modelInjectable[0]!.kind).toBe("pdf");
  });
});
