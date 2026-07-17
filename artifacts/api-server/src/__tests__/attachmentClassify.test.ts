import { describe, expect, it } from "vitest";
import {
  classifyAttachment,
  classifyAttachmentKind,
  classifyProcessingStatus,
  libraryKindForAttachment,
} from "../lib/attachmentClassify";

describe("attachmentClassify", () => {
  it("classifies images as understood", () => {
    expect(classifyAttachment("image/png", "shot.png")).toEqual({
      kind: "image",
      processingStatus: "understood",
    });
  });

  it("classifies PDFs as understood", () => {
    expect(classifyAttachment("application/pdf", "brief.pdf")).toEqual({
      kind: "pdf",
      processingStatus: "understood",
    });
  });

  it("classifies code by extension", () => {
    expect(classifyAttachmentKind("application/octet-stream", "App.tsx")).toBe(
      "code",
    );
    expect(
      classifyProcessingStatus("code", "application/octet-stream", "App.tsx"),
    ).toBe("understood");
  });

  it("marks docx/xlsx unsupported", () => {
    expect(
      classifyAttachment(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "spec.docx",
      ),
    ).toEqual({ kind: "doc", processingStatus: "unsupported" });
    expect(
      classifyAttachment(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "nums.xlsx",
      ),
    ).toEqual({ kind: "spreadsheet", processingStatus: "unsupported" });
  });

  it("marks unknown types unsupported", () => {
    expect(classifyAttachment("application/octet-stream", "blob.bin")).toEqual({
      kind: "other",
      processingStatus: "unsupported",
    });
  });

  it("maps kinds to library kinds", () => {
    expect(libraryKindForAttachment("image")).toBe("sketch");
    expect(libraryKindForAttachment("pdf")).toBe("document");
    expect(libraryKindForAttachment("other")).toBe("other");
  });
});
