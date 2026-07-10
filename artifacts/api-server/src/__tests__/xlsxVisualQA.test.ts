import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getVisualQAChecker } from "../lib/visualQAEngine";
import "../lib/visualQACheckers/xlsxVisualQA";

const WIDTH = 200;
const HEIGHT = 150;

async function solidPng(hex: string): Promise<Buffer> {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

async function pngWithGrid(): Promise<Buffer> {
  const bg = await solidPng("FFFFFF");
  const line = await sharp({ create: { width: WIDTH, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .png()
    .toBuffer();
  const composites = Array.from({ length: 8 }, (_, i) => ({ input: line, top: i * 18, left: 0 }));
  return sharp(bg).composite(composites).png().toBuffer();
}

describe("xlsx visual QA checker", () => {
  const checker = getVisualQAChecker("xlsx");

  it("is registered under type 'xlsx'", () => {
    expect(checker).toBeDefined();
    expect(checker?.format).toBe("xlsx");
  });

  it("flags a visually blank printed page as blank-page", async () => {
    const blank = await solidPng("FFFFFF");
    const issues = await checker!.check({
      pages: [blank],
      input: {},
      preview: { sheets: [{ name: "Sheet1", columns: ["A", "B"], rowCount: 10, hasFormulas: false }] },
    });
    expect(issues.some((i) => i.rule === "blank-page" && i.pageIndex === 0)).toBe(true);
  });

  it("does not flag a page with visible grid/content", async () => {
    const populated = await pngWithGrid();
    const issues = await checker!.check({
      pages: [populated],
      input: {},
      preview: { sheets: [{ name: "Sheet1", columns: ["A", "B"], rowCount: 10, hasFormulas: false }] },
    });
    expect(issues.some((i) => i.rule === "blank-page")).toBe(false);
  });

  it("flags a workbook whose sheets report zero rows as no-printable-data", async () => {
    const populated = await pngWithGrid();
    const issues = await checker!.check({
      pages: [populated],
      input: {},
      preview: { sheets: [{ name: "Sheet1", columns: ["A"], rowCount: 0, hasFormulas: false }] },
    });
    expect(issues.some((i) => i.rule === "no-printable-data")).toBe(true);
  });

  it("does not flag a workbook with real row data", async () => {
    const populated = await pngWithGrid();
    const issues = await checker!.check({
      pages: [populated],
      input: {},
      preview: { sheets: [{ name: "Sheet1", columns: ["A"], rowCount: 12, hasFormulas: false }] },
    });
    expect(issues.some((i) => i.rule === "no-printable-data")).toBe(false);
  });
});
