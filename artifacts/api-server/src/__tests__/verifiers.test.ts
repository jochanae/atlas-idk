import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import PDFDocument from "pdfkit";
import "../lib/verifiers/pptxVerifier";
import "../lib/verifiers/docxVerifier";
import "../lib/verifiers/pdfVerifier";
import "../lib/verifiers/htmlVerifier";
import { getArtifactVerifier } from "../lib/verificationEngine";
import type { ArtifactRenderOutput } from "../lib/artifactEngine";

function fakeRendered(overrides: Partial<ArtifactRenderOutput> = {}): ArtifactRenderOutput {
  return {
    buffer: Buffer.from(""),
    title: "t",
    mimeType: "application/octet-stream",
    extension: "bin",
    preview: {},
    ...overrides,
  };
}

async function buildValidPptx(slideCount: number): Promise<Buffer> {
  const pptx = new PptxGenJS();
  for (let i = 0; i < slideCount; i++) {
    const slide = pptx.addSlide();
    slide.addText(`Slide ${i + 1} content`, { x: 1, y: 1, w: 5, h: 1 });
  }
  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

describe("pptxVerifier", () => {
  const verifier = getArtifactVerifier("pptx")!;

  it("passes a valid pptx fixture that matches the expected slide count", async () => {
    const buffer = await buildValidPptx(3);
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ expectedCounts: { slides: 3 } }),
      input: {},
      projectId: 1,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails a deliberately broken pptx (not a zip) with the correct reason", async () => {
    const buffer = Buffer.from("this is not a real pptx file");
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered(),
      input: {},
      projectId: 1,
    });
    const openCheck = checks.find((c) => c.key === "pptx-opens");
    expect(openCheck?.pass).toBe(false);
    expect(openCheck?.reason).toMatch(/not a valid zip/i);
  });

  it("fails when the pptx has fewer slides than expected (truncation)", async () => {
    const buffer = await buildValidPptx(2);
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ expectedCounts: { slides: 5 } }),
      input: {},
      projectId: 1,
    });
    const slideCountCheck = checks.find((c) => c.key === "pptx-slide-count");
    expect(slideCountCheck?.pass).toBe(false);
    expect(slideCountCheck?.reason).toMatch(/Expected 5 slides but only found 2/);
  });

  it("fails when a slide has no visible text content", async () => {
    const pptx = new PptxGenJS();
    pptx.addSlide(); // empty slide, no text
    const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    const checks = await verifier.verify({ buffer, rendered: fakeRendered(), input: {}, projectId: 1 });
    const emptyCheck = checks.find((c) => c.key === "pptx-no-empty-slides");
    expect(emptyCheck?.pass).toBe(false);
  });
});

async function buildValidDocx(sectionCount: number): Promise<Buffer> {
  const children: Paragraph[] = [];
  for (let i = 0; i < sectionCount; i++) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("Section heading")],
      }),
      new Paragraph({ children: [new TextRun("Body content for this section.")] }),
    );
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

describe("docxVerifier", () => {
  const verifier = getArtifactVerifier("docx")!;

  it("passes a valid docx fixture that matches the expected section count", async () => {
    const buffer = await buildValidDocx(2);
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ expectedCounts: { sections: 2 } }),
      input: {},
      projectId: 1,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails a deliberately broken docx (corrupted zip) with the correct reason", async () => {
    const validBuffer = await buildValidDocx(1);
    const corrupted = validBuffer.subarray(0, Math.floor(validBuffer.length / 2));
    const checks = await verifier.verify({ buffer: corrupted, rendered: fakeRendered(), input: {}, projectId: 1 });
    const openCheck = checks.find((c) => c.key === "docx-opens");
    expect(openCheck?.pass).toBe(false);
  });

  it("fails when fewer section headings exist than expected", async () => {
    const buffer = await buildValidDocx(1);
    const checks = await verifier.verify({
      buffer,
      rendered: fakeRendered({ expectedCounts: { sections: 4 } }),
      input: {},
      projectId: 1,
    });
    const sectionCheck = checks.find((c) => c.key === "docx-expected-sections");
    expect(sectionCheck?.pass).toBe(false);
    expect(sectionCheck?.reason).toMatch(/Expected 4 section headings but only found 1/);
  });
});

async function buildValidPdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.text(text);
    doc.end();
  });
}

describe("pdfVerifier", () => {
  const verifier = getArtifactVerifier("pdf")!;

  it("passes a valid pdf fixture with real text content and a nonzero page count", async () => {
    const buffer = await buildValidPdf("Hello, this is real PDF content for verification.");
    const checks = await verifier.verify({ buffer, rendered: fakeRendered(), input: {}, projectId: 1 });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails a deliberately broken pdf (missing %PDF header) with the correct reason", async () => {
    const buffer = Buffer.from("not a pdf at all");
    const checks = await verifier.verify({ buffer, rendered: fakeRendered(), input: {}, projectId: 1 });
    const headerCheck = checks.find((c) => c.key === "pdf-header");
    expect(headerCheck?.pass).toBe(false);
    expect(headerCheck?.reason).toMatch(/%PDF-/);
  });
});

describe("htmlVerifier", () => {
  const verifier = getArtifactVerifier("html")!;

  it("passes a valid, safe, standalone HTML document", async () => {
    const html = "<!DOCTYPE html><html><body><h1>Hi</h1></body></html>";
    const checks = await verifier.verify({
      buffer: Buffer.from(html, "utf-8"),
      rendered: fakeRendered({ preview: { safe: true, reasons: [] } }),
      input: {},
      projectId: 1,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails a deliberately broken HTML fixture (empty file) with the correct reason", async () => {
    const checks = await verifier.verify({
      buffer: Buffer.from("", "utf-8"),
      rendered: fakeRendered({ preview: { safe: true, reasons: [] } }),
      input: {},
      projectId: 1,
    });
    const persistedCheck = checks.find((c) => c.key === "html-persisted");
    expect(persistedCheck?.pass).toBe(false);
  });

  it("surfaces the renderer's own unsafe verdict as a failed check with the real reason", async () => {
    const html = "<!DOCTYPE html><html><body><script>eval('x')</script></body></html>";
    const checks = await verifier.verify({
      buffer: Buffer.from(html, "utf-8"),
      rendered: fakeRendered({ preview: { safe: false, reasons: ["Contains eval() — unsupported dynamic code execution."] } }),
      input: {},
      projectId: 1,
    });
    const safeCheck = checks.find((c) => c.key === "html-safe");
    expect(safeCheck?.pass).toBe(false);
    expect(safeCheck?.reason).toMatch(/eval/);
  });
});
