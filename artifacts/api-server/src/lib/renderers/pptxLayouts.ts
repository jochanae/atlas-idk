// PPTX layout executors (Phase 3B.3) — one drawing function per Presentation
// Director layout. These functions ONLY know how to paint a given layout's
// content using theme tokens; they contain zero content-generation logic.
// Keeping this separate from the Director means the same layout catalog can
// be re-implemented for DOCX/PDF/HTML later without touching director.ts.
import type PptxGenJS from "pptxgenjs";
import type { DeliverableTheme } from "../deliverable-theme/tokens";
import type { Slide } from "../presentation-director/schema";
import { renderIconDataUri } from "../deliverable-theme/icons/renderIcon";
import type { IconKey } from "../deliverable-theme/icons/iconLibrary";

const CONTENT_TOP = 0.42;
const CONTENT_BOTTOM = 5.15;
const FULL_W = "90%";

function drawEyebrow(slide: PptxGenJS.Slide, theme: DeliverableTheme, text: string, y: number): void {
  slide.addText(text.toUpperCase(), {
    x: 0.5, y, w: FULL_W, h: 0.3,
    fontFace: theme.fonts.body, fontSize: 11, bold: true, charSpacing: 2,
    color: theme.colors.accent,
  });
}

function drawHeading(slide: PptxGenJS.Slide, theme: DeliverableTheme, text: string, y: number, size = 28): void {
  slide.addText(text, {
    x: 0.5, y, w: FULL_W, h: 0.8,
    fontFace: theme.fonts.heading, fontSize: size, bold: true,
    color: theme.colors.heading,
  });
}

function drawAccentRule(slide: PptxGenJS.Slide, theme: DeliverableTheme, y: number, w = 0.9): void {
  slide.addShape("rect", { x: 0.52, y, w, h: 0.025, fill: { color: theme.colors.accent } });
}

function drawBulletList(
  slide: PptxGenJS.Slide,
  theme: DeliverableTheme,
  items: string[],
  opts: { x: number; y: number; w: PptxGenJS.Coord; h: number; fontSize?: number },
): void {
  slide.addText(
    items.map((b) => ({
      text: b,
      options: { bullet: { code: "25AA", color: theme.colors.accent }, breakLine: true, paraSpaceAfter: 10 },
    })),
    {
      x: opts.x, y: opts.y, w: opts.w, h: opts.h, valign: "top",
      fontFace: theme.fonts.body, fontSize: opts.fontSize ?? 15, color: theme.colors.body,
    },
  );
}

function drawIcon(
  slide: PptxGenJS.Slide,
  theme: DeliverableTheme,
  icon: IconKey | undefined,
  x: number, y: number, size: number,
  colorHex: string = theme.colors.accent,
): void {
  if (!icon) return;
  slide.addImage({ data: renderIconDataUri(icon, colorHex), x, y, w: size, h: size });
}

function drawCard(
  slide: PptxGenJS.Slide,
  theme: DeliverableTheme,
  x: number, y: number, w: number, h: number,
): void {
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: theme.colors.surface },
    line: { color: theme.colors.accentDim, width: 0.75 },
  });
  slide.addShape("rect", { x, y, w: 0.04, h, fill: { color: theme.colors.accent } });
}

type LayoutDrawFn = (slide: PptxGenJS.Slide, theme: DeliverableTheme, content: Slide) => void;

export const PPTX_LAYOUTS: Record<Slide["layout"], LayoutDrawFn> = {
  hero(slide, theme, content) {
    if (content.layout !== "hero") return;
    if (content.eyebrow) drawEyebrow(slide, theme, content.eyebrow, 1.7);
    slide.addText(content.heading, {
      x: 0.6, y: content.eyebrow ? 2.05 : 2.3, w: "88%", h: 1.1,
      fontFace: theme.fonts.heading, fontSize: 36, bold: true, color: theme.colors.heading,
    });
    drawAccentRule(slide, theme, content.eyebrow ? 3.15 : 3.4, 1.4);
    if (content.subheading) {
      slide.addText(content.subheading, {
        x: 0.6, y: content.eyebrow ? 3.35 : 3.6, w: "80%", h: 0.7,
        fontFace: theme.fonts.body, fontSize: 16, italic: true, color: theme.colors.accent,
      });
    }
  },

  problem_opportunity(slide, theme, content) {
    if (content.layout !== "problem_opportunity") return;
    let y = CONTENT_TOP;
    if (content.eyebrow) { drawEyebrow(slide, theme, content.eyebrow, y); y += 0.4; }
    drawHeading(slide, theme, content.heading, y);
    y += 0.7;
    drawAccentRule(slide, theme, y);
    y += 0.35;
    drawBulletList(slide, theme, content.points, { x: 0.5, y, w: FULL_W, h: CONTENT_BOTTOM - y, fontSize: 16 });
  },

  solution(slide, theme, content) {
    if (content.layout !== "solution") return;
    let y = CONTENT_TOP;
    if (content.eyebrow) { drawEyebrow(slide, theme, content.eyebrow, y); y += 0.4; }
    drawHeading(slide, theme, content.heading, y);
    y += 0.7;
    drawAccentRule(slide, theme, y);
    y += 0.3;
    if (content.description) {
      slide.addText(content.description, {
        x: 0.5, y, w: FULL_W, h: 0.6,
        fontFace: theme.fonts.body, fontSize: 15, italic: true, color: theme.colors.accent,
      });
      y += 0.55;
    }
    drawBulletList(slide, theme, content.points, { x: 0.5, y, w: FULL_W, h: CONTENT_BOTTOM - y, fontSize: 16 });
  },

  feature_grid(slide, theme, content) {
    if (content.layout !== "feature_grid") return;
    drawHeading(slide, theme, content.heading, CONTENT_TOP);
    drawAccentRule(slide, theme, 1.12);
    const cols = content.features.length > 2 ? 2 : content.features.length;
    const rows = Math.ceil(content.features.length / cols);
    const gap = 0.25;
    const cardW = (9.0 - gap * (cols - 1)) / cols;
    const cardH = (CONTENT_BOTTOM - 1.35 - gap * (rows - 1)) / rows;
    content.features.forEach((f, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 0.5 + col * (cardW + gap);
      const y = 1.35 + row * (cardH + gap);
      drawCard(slide, theme, x, y, cardW, cardH);
      const hasIcon = Boolean(f.icon);
      if (hasIcon) drawIcon(slide, theme, f.icon, x + 0.2, y + 0.15, 0.32);
      const titleX = hasIcon ? x + 0.62 : x + 0.2;
      const titleW = hasIcon ? cardW - 0.82 : cardW - 0.4;
      slide.addText(f.title, {
        x: titleX, y: y + 0.12, w: titleW, h: 0.4, valign: "middle",
        fontFace: theme.fonts.heading, fontSize: 15, bold: true, color: theme.colors.accent,
      });
      slide.addText(f.description, {
        x: x + 0.2, y: y + 0.55, w: cardW - 0.4, h: cardH - 0.7,
        fontFace: theme.fonts.body, fontSize: 12, color: theme.colors.body, valign: "top",
      });
    });
  },

  timeline(slide, theme, content) {
    if (content.layout !== "timeline") return;
    drawHeading(slide, theme, content.heading, CONTENT_TOP);
    drawAccentRule(slide, theme, 1.12);
    const n = content.milestones.length;
    const trackY = 2.6;
    const startX = 0.9;
    const endX = 9.1;
    const step = (endX - startX) / Math.max(n - 1, 1);
    slide.addShape("line", {
      x: startX, y: trackY, w: endX - startX, h: 0,
      line: { color: theme.colors.accentDim, width: 1.5 },
    });
    content.milestones.forEach((m, i) => {
      const x = startX + step * i;
      slide.addShape("ellipse", {
        x: x - 0.06, y: trackY - 0.06, w: 0.12, h: 0.12,
        fill: { color: theme.colors.accent }, line: { type: "none" },
      });
      if (m.icon) drawIcon(slide, theme, m.icon, x - 0.15, trackY - 1.15, 0.3);
      slide.addText(m.label, {
        x: x - 0.75, y: trackY - 0.75, w: 1.5, h: 0.55,
        fontFace: theme.fonts.heading, fontSize: 13, bold: true, align: "center",
        color: theme.colors.heading,
      });
      if (m.description) {
        slide.addText(m.description, {
          x: x - 0.75, y: trackY + 0.2, w: 1.5, h: 1.4,
          fontFace: theme.fonts.body, fontSize: 10.5, align: "center",
          color: theme.colors.bodyMuted, valign: "top",
        });
      }
    });
  },

  kpi_metrics(slide, theme, content) {
    if (content.layout !== "kpi_metrics") return;
    drawHeading(slide, theme, content.heading, CONTENT_TOP);
    drawAccentRule(slide, theme, 1.12);
    const n = content.metrics.length;
    const gap = 0.3;
    const cardW = (9.0 - gap * (n - 1)) / n;
    const cardH = 2.1;
    const y = 1.9;
    content.metrics.forEach((m, i) => {
      const x = 0.5 + i * (cardW + gap);
      drawCard(slide, theme, x, y, cardW, cardH);
      if (m.icon) drawIcon(slide, theme, m.icon, x + cardW - 0.5, y + 0.18, 0.32);
      slide.addText(m.value, {
        x: x + 0.15, y: y + 0.2, w: cardW - 0.3, h: 0.9,
        fontFace: theme.fonts.heading, fontSize: 30, bold: true, color: theme.colors.accent,
      });
      slide.addText(m.label, {
        x: x + 0.15, y: y + 1.15, w: cardW - 0.3, h: 0.8,
        fontFace: theme.fonts.body, fontSize: 12, color: theme.colors.bodyMuted, valign: "top",
      });
    });
  },

  comparison(slide, theme, content) {
    if (content.layout !== "comparison") return;
    drawHeading(slide, theme, content.heading, CONTENT_TOP);
    drawAccentRule(slide, theme, 1.12);
    const gap = 0.3;
    const colW = (9.0 - gap) / 2;
    content.columns.forEach((c, i) => {
      const x = 0.5 + i * (colW + gap);
      slide.addText(c.title, {
        x, y: 1.35, w: colW, h: 0.45,
        fontFace: theme.fonts.heading, fontSize: 16, bold: true, color: theme.colors.accent,
      });
      drawBulletList(slide, theme, c.points, { x, y: 1.85, w: colW, h: CONTENT_BOTTOM - 1.85, fontSize: 13.5 });
    });
  },

  process_flow(slide, theme, content) {
    if (content.layout !== "process_flow") return;
    drawHeading(slide, theme, content.heading, CONTENT_TOP);
    drawAccentRule(slide, theme, 1.12);
    const n = content.steps.length;
    const gap = 0.2;
    const cardW = (9.0 - gap * (n - 1)) / n;
    const y = 1.6;
    const cardH = 3.2;
    content.steps.forEach((s, i) => {
      const x = 0.5 + i * (cardW + gap);
      drawCard(slide, theme, x, y, cardW, cardH);
      if (s.icon) drawIcon(slide, theme, s.icon, x + cardW - 0.48, y + 0.15, 0.3);
      slide.addText(String(i + 1), {
        x: x + 0.15, y: y + 0.12, w: cardW - 0.3, h: 0.5,
        fontFace: theme.fonts.heading, fontSize: 22, bold: true, color: theme.colors.accent,
      });
      slide.addText(s.title, {
        x: x + 0.15, y: y + 0.65, w: cardW - 0.3, h: 0.6,
        fontFace: theme.fonts.heading, fontSize: 13, bold: true, color: theme.colors.heading, valign: "top",
      });
      if (s.description) {
        slide.addText(s.description, {
          x: x + 0.15, y: y + 1.3, w: cardW - 0.3, h: cardH - 1.45,
          fontFace: theme.fonts.body, fontSize: 11, color: theme.colors.bodyMuted, valign: "top",
        });
      }
    });
  },

  screenshot_showcase(slide, theme, content) {
    if (content.layout !== "screenshot_showcase") return;
    drawHeading(slide, theme, content.heading, CONTENT_TOP);
    drawAccentRule(slide, theme, 1.12);
    // No real screenshot assets yet — a styled frame placeholder keeps the
    // layout usable now; swap in real captures once available.
    slide.addShape("roundRect", {
      x: 0.5, y: 1.4, w: 4.4, h: 3.6, rectRadius: 0.08,
      fill: { color: theme.colors.surface },
      line: { color: theme.colors.accentDim, width: 1 },
    });
    slide.addText(content.caption ?? "Product view", {
      x: 0.5, y: 3.1, w: 4.4, h: 0.5, align: "center",
      fontFace: theme.fonts.body, fontSize: 11, italic: true, color: theme.colors.bodyMuted,
    });
    drawBulletList(slide, theme, content.highlights, { x: 5.2, y: 1.5, w: 4.3, h: 3.4, fontSize: 14 });
  },

  quote(slide, theme, content) {
    if (content.layout !== "quote") return;
    slide.addShape("rect", { x: 0.6, y: 1.8, w: 0.05, h: 2.0, fill: { color: theme.colors.accent } });
    slide.addText(`"${content.quote}"`, {
      x: 0.95, y: 1.7, w: "80%", h: 1.8,
      fontFace: theme.fonts.heading, fontSize: 24, italic: true, color: theme.colors.heading, valign: "middle",
    });
    if (content.attribution) {
      slide.addText(content.attribution, {
        x: 0.95, y: 3.6, w: "70%", h: 0.5,
        fontFace: theme.fonts.body, fontSize: 13, color: theme.colors.accent,
      });
    }
  },

  closing_cta(slide, theme, content) {
    if (content.layout !== "closing_cta") return;
    drawHeading(slide, theme, content.heading, 1.0, 32);
    drawAccentRule(slide, theme, 1.75, 1.2);
    if (content.subheading) {
      slide.addText(content.subheading, {
        x: 0.5, y: 1.95, w: FULL_W, h: 0.5,
        fontFace: theme.fonts.body, fontSize: 15, italic: true, color: theme.colors.accent,
      });
    }
    slide.addText(
      content.actionItems.map((a, i) => ({
        text: `${i + 1}.  ${a}`,
        options: { breakLine: true, paraSpaceAfter: 12 },
      })),
      {
        x: 0.5, y: 2.6, w: FULL_W, h: 2.3, valign: "top",
        fontFace: theme.fonts.body, fontSize: 15, color: theme.colors.body,
      },
    );
  },

  content_bullets(slide, theme, content) {
    if (content.layout !== "content_bullets") return;
    drawHeading(slide, theme, content.heading, CONTENT_TOP);
    drawAccentRule(slide, theme, 1.12);
    drawBulletList(slide, theme, content.bullets, { x: 0.5, y: 1.5, w: FULL_W, h: 3.6, fontSize: 16 });
  },
};
