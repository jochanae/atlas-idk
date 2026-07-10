import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getVisualQAChecker } from "../lib/visualQAEngine";
import "../lib/visualQACheckers/pptxVisualQA";

const WIDTH = 200;
const HEIGHT = 120;
const BG_HEX = "0B0A0F";

async function solidPng(hex: string): Promise<Buffer> {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

async function pngWithBottomBand(bgHex: string, bandHex: string, bandFraction: number): Promise<Buffer> {
  const bg = await solidPng(bgHex);
  const bandHeight = Math.round(HEIGHT * bandFraction);
  const band = await sharp({
    create: { width: WIDTH, height: bandHeight, channels: 3, background: hexToRgbObj(bandHex) },
  })
    .png()
    .toBuffer();
  return sharp(bg)
    .composite([{ input: band, top: HEIGHT - bandHeight, left: 0 }])
    .png()
    .toBuffer();
}

function hexToRgbObj(hex: string) {
  const clean = hex.replace("#", "");
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}

describe("pptx visual QA checker", () => {
  const checker = getVisualQAChecker("pptx");
  it("is registered under type 'pptx'", () => {
    expect(checker).toBeDefined();
    expect(checker?.format).toBe("pptx");
  });

  it("flags a visually blank slide as empty-slide", async () => {
    const blank = await solidPng(BG_HEX);
    const issues = await checker!.check({ pages: [blank], input: {}, preview: { themeBackground: BG_HEX } });
    expect(issues.some((i) => i.rule === "empty-slide" && i.pageIndex === 0)).toBe(true);
  });

  it("does not flag a slide with real contrast/content as empty or low-contrast", async () => {
    const patch = await sharp({ create: { width: 10, height: 10, channels: 3, background: hexToRgbObj("F5EFE0") } })
      .png()
      .toBuffer();
    const composites = Array.from({ length: 40 }, (_, i) => ({
      input: patch,
      top: (i * 7) % (HEIGHT - 10),
      left: (i * 13) % (WIDTH - 10),
    }));
    const noisy = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: hexToRgbObj(BG_HEX) } })
      .composite(composites)
      .png()
      .toBuffer();
    const issues = await checker!.check({ pages: [noisy], input: {}, preview: { themeBackground: BG_HEX } });
    expect(issues.some((i) => i.rule === "empty-slide")).toBe(false);
  });

  it("flags bottom-edge content bleed as bottom-edge-overflow", async () => {
    const overflowing = await pngWithBottomBand(BG_HEX, "F5EFE0", 0.15);
    const issues = await checker!.check({ pages: [overflowing], input: {}, preview: { themeBackground: BG_HEX } });
    expect(issues.some((i) => i.rule === "bottom-edge-overflow" && i.pageIndex === 0)).toBe(true);
  });

  it("does not flag overflow when the bottom band matches the background", async () => {
    const clean = await solidPng(BG_HEX);
    const issues = await checker!.check({ pages: [clean], input: {}, preview: { themeBackground: BG_HEX } });
    expect(issues.some((i) => i.rule === "bottom-edge-overflow")).toBe(false);
  });

  it("flags a dense heading and an orphan bullet from renderer preview data", async () => {
    const clean = await solidPng(BG_HEX);
    const longHeading = "A ".repeat(60);
    const issues = await checker!.check({
      pages: [clean],
      input: {},
      preview: {
        themeBackground: BG_HEX,
        contentSummary: [
          { layout: "content_bullets", heading: longHeading, itemTexts: ["Hi", "A real bullet point here", "OK"] },
        ],
      },
    });
    expect(issues.some((i) => i.rule === "dense-heading" && i.pageIndex === 0)).toBe(true);
    const orphan = issues.find((i) => i.rule === "orphan-bullet" && i.pageIndex === 0);
    expect(orphan).toBeDefined();
    expect(orphan?.message).toContain("Hi");
    expect(orphan?.message).toContain("OK");
  });

  it("does not flag well-formed structural content", async () => {
    const clean = await solidPng(BG_HEX);
    const issues = await checker!.check({
      pages: [clean],
      input: {},
      preview: {
        themeBackground: BG_HEX,
        contentSummary: [
          { layout: "content_bullets", heading: "Our Approach", itemTexts: ["We ship weekly", "We measure everything"] },
        ],
      },
    });
    expect(issues.some((i) => i.rule === "dense-heading" || i.rule === "orphan-bullet")).toBe(false);
  });
});
