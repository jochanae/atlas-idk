import { describe, expect, it } from "vitest";
import {
  classifyAttachment,
  normalizeModelMediaType,
} from "../lib/attachmentClassify";

describe("classifyAttachment", () => {
  it.each([
    ["image/png", "shot.png", "image"],
    ["image/jpeg", "photo.jpg", "image"],
    ["image/jpg", "photo.jpeg", "image"],
    ["image/webp", "mock.webp", "image"],
    ["application/pdf", "brief.pdf", "pdf"],
    ["text/plain", "notes.txt", "text"],
    ["text/markdown", "readme.md", "text"],
    ["application/octet-stream", "readme.markdown", "text"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "doc.docx",
      "doc",
    ],
    [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "deck.pptx",
      "doc",
    ],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "sheet.xlsx",
      "spreadsheet",
    ],
    ["text/csv", "data.csv", "spreadsheet"],
    ["text/plain", "data.csv", "spreadsheet"],
  ])("marks %s/%s understood", (mimeType, filename, kind) => {
    expect(classifyAttachment(mimeType, filename)).toEqual({
      kind,
      processingStatus: "understood",
    });
  });

  it.each([
    ["application/zip", "bundle.zip", "other"],
  ])("stores but does not understand %s/%s", (mimeType, filename, kind) => {
    expect(classifyAttachment(mimeType, filename)).toEqual({
      kind,
      processingStatus: "unsupported",
    });
  });

  it.each([
    ["image/gif", "anim.gif"],
    ["image/svg+xml", "icon.svg"],
    ["image/bmp", "scan.bmp"],
    ["application/x-msdownload", "setup.exe"],
    ["application/octet-stream", "unknown.bin"],
  ])("marks unsupported image/unknown type %s/%s as other", (mimeType, filename) => {
    expect(classifyAttachment(mimeType, filename)).toEqual({
      kind: "other",
      processingStatus: "unsupported",
    });
  });

  it("normalizes browser image/jpg alias to image/jpeg for model providers", () => {
    expect(normalizeModelMediaType("image/jpg", "photo.jpg")).toBe("image/jpeg");
    expect(normalizeModelMediaType("image/jpeg", "photo.jpg")).toBe("image/jpeg");
    expect(normalizeModelMediaType("image/png", "shot.png")).toBe("image/png");
    expect(normalizeModelMediaType("application/octet-stream", "photo.jpeg")).toBe(
      "image/jpeg",
    );
  });
});
