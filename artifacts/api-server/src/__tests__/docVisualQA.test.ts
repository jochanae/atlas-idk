import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getVisualQAChecker } from "../lib/visualQAEngine";
import "../lib/visualQACheckers/docVisualQA";

const WIDTH = 200;
const HEIGHT = 260;

async function solidPng(hex: string): Promise<Buffer> {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

async function pngWithTextPatches(bgHex: string, textHex: string): Promise<Buffer> {
  const bg = await solidPng(bgHex);
  const clean = textHex.replace("#", "");
  const patch = await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) },
    },
  })
    .png()
    .toBuffer();
  const composites = Array.from({ length: 60 }, (_, i) => ({
    input: patch,
    top: (i * 11) % (HEIGHT - 10),
    left: (i * 17) % (WIDTH - 10),
  }));
  return sharp(bg).composite(composites).png().toBuffer();
}

describe.each([
  { type: "docx", format: "docx" },
  { type: "pdf", format: "pdf" },
])("$type visual QA checker", ({ type, format }) => {
  const checker = getVisualQAChecker(type);

  it(`is registered under type "${type}"`, () => {
    expect(checker).toBeDefined();
    expect(checker?.format).toBe(format);
  });

  it("flags a visually blank page as blank-page", async () => {
    const blank = await solidPng("FFFFFF");
    const issues = await checker!.check({ pages: [blank], input: {}, preview: {} });
    expect(issues.some((i) => i.rule === "blank-page" && i.pageIndex === 0)).toBe(true);
  });

  it("does not flag a page with real text-like content as blank or low-contrast", async () => {
    const populated = await pngWithTextPatches("FFFFFF", "111111");
    const issues = await checker!.check({ pages: [populated], input: {}, preview: {} });
    expect(issues.some((i) => i.rule === "blank-page" || i.rule === "low-contrast")).toBe(false);
  });

  it("flags a narrow-luminance page as low-contrast", async () => {
    const lowContrast = await pngWithTextPatches("EAEAEA", "D0D0D0");
    const issues = await checker!.check({ pages: [lowContrast], input: {}, preview: {} });
    expect(issues.some((i) => i.rule === "low-contrast" && i.pageIndex === 0)).toBe(true);
  });

  it("flags an overly long section heading as dense-heading", async () => {
    const populated = await pngWithTextPatches("FFFFFF", "111111");
    const longHeading = "A ".repeat(60);
    const issues = await checker!.check({
      pages: [populated],
      input: {},
      preview: { sectionHeadings: [longHeading, "Short Heading"] },
    });
    const dense = issues.find((i) => i.rule === "dense-heading");
    expect(dense).toBeDefined();
    expect(dense?.message).toContain("Section 1");
  });

  it("does not flag well-formed section headings", async () => {
    const populated = await pngWithTextPatches("FFFFFF", "111111");
    const issues = await checker!.check({
      pages: [populated],
      input: {},
      preview: { sectionHeadings: ["Executive Summary", "Our Approach"] },
    });
    expect(issues.some((i) => i.rule === "dense-heading")).toBe(false);
  });
});
