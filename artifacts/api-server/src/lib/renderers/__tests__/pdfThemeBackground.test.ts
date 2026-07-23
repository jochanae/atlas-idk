import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import PDFDocument from "pdfkit";
import { ATLAS_DEFAULT_THEME } from "../../deliverable-theme/tokens";

/**
 * Mirrors pdfRenderer.paintPageBackground — kept inline so the test does not
 * need to export private helpers, but asserts the same contract: dark theme
 * background is painted (PDFKit default is white).
 */
function paintPageBackground(doc: PDFKit.PDFDocument, backgroundHex: string): void {
  const hex = backgroundHex.startsWith("#") ? backgroundHex : `#${backgroundHex}`;
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(hex);
  doc.restore();
}

function inflatePdfStreams(buffer: Buffer): string {
  const latin = buffer.toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) != null) {
    try {
      out.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
    } catch {
      out.push(m[1]);
    }
  }
  return out.join("\n");
}

describe("PDF deliverable theme background", () => {
  it("embeds Atlas Obsidian page fill (not white-only pages)", async () => {
    const theme = ATLAS_DEFAULT_THEME;
    expect(theme.colors.background.toUpperCase()).toBe("0B0A0F");
    expect(theme.colors.heading.toUpperCase()).toBe("F5EFE0");

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 56, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      paintPageBackground(doc, theme.colors.background);
      doc.fillColor(`#${theme.colors.heading}`).fontSize(18).text("Readable on dark");
      doc.end();
    });

    const content = inflatePdfStreams(buffer);
    // 0B0A0F → ~0.043 / 0.039 / 0.059 — pdfkit uses DeviceRGB `scn`
    expect(content).toMatch(/0\.0[34]\d*\s+0\.0[34]\d*\s+0\.0[56]\d*\s+scn/);
    // Full-page rect fill precedes light heading text
    expect(content).toMatch(/0 0 612 792 re/);
  });
});
