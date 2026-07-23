// PDF renderer — plug-in for the Artifact Engine (Phase 3B.4: themed + document-native).
// PDF is treated as a rendered export of the same themed document model DOCX
// uses (shared DocumentContentPlan) rather than a second, independent design
// system — same typography, spacing, callouts, tables, checklists; drawn with
// pdfkit primitives since PDF has no document-object model to build against.
import PDFDocument from "pdfkit";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { resolveDeliverableTheme, type DeliverableTheme } from "../deliverable-theme/tokens";
import { loadProjectThemeSignals } from "../deliverable-theme/projectSignals";
import {
  DocumentContentPlanSchema,
  DOCUMENT_CONTENT_PROMPT,
  type DocumentContentPlan,
  type DocumentBlock,
} from "../deliverable-theme/documentContentPlan";
import { generateValidatedContentPlan } from "./contentPlan";

export interface PdfGenerationInput {
  context: string;
  title?: string;
  docType?: string;
  projectId?: number;
  styleOverride?: string;
}

const PAGE_MARGIN = 56;
const CALLOUT_TONE_COLOR: Record<string, string> = {
  info: "#2A2E3A",
  warning: "#3A2E1A",
  success: "#1E3324",
};

function hex(color: string): string {
  return color.startsWith("#") ? color : `#${color}`;
}

/**
 * Paint the themed page fill. Atlas Obsidian (and most inferred themes) use
 * light heading/body on a dark background — same tokens as PPTX. PDFKit
 * defaults to a white page, so without this fill light text becomes invisible.
 */
function paintPageBackground(doc: PDFKit.PDFDocument, theme: DeliverableTheme): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(hex(theme.colors.background));
  doc.restore();
  // Keep the text cursor inside the margin after the full-page fill.
  doc.x = PAGE_MARGIN;
  doc.y = PAGE_MARGIN;
  doc.fillColor(hex(theme.colors.body));
}

function drawFooter(doc: PDFKit.PDFDocument, theme: DeliverableTheme, brandLabel: string): void {
  const bottom = doc.page.height - PAGE_MARGIN + 14;
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor(hex(theme.colors.footer))
    .text(brandLabel, PAGE_MARGIN, bottom, { width: 200, align: "left" })
    .text(`Page ${doc.bufferedPageRange().count}`, doc.page.width - PAGE_MARGIN - 100, bottom, {
      width: 100,
      align: "right",
    });
  doc.fillColor(hex(theme.colors.body));
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottomLimit = doc.page.height - PAGE_MARGIN - 20;
  if (doc.y + needed > bottomLimit) doc.addPage();
}

function drawBlock(doc: PDFKit.PDFDocument, block: DocumentBlock, theme: DeliverableTheme): void {
  const width = doc.page.width - PAGE_MARGIN * 2;

  switch (block.type) {
    case "paragraph":
      ensureSpace(doc, 40);
      doc.fontSize(11).font("Helvetica").fillColor(hex(theme.colors.body)).text(block.text, { width, align: "left" });
      doc.moveDown(0.6);
      return;

    case "bullets":
      for (const item of block.items) {
        ensureSpace(doc, 20);
        doc
          .fontSize(11)
          .font("Helvetica")
          .fillColor(hex(theme.colors.body))
          .text(`\u2022  ${item}`, { width: width - 12, indent: 12 });
        doc.moveDown(0.15);
      }
      doc.moveDown(0.4);
      return;

    case "checklist":
      for (const item of block.items) {
        ensureSpace(doc, 20);
        doc.fontSize(11).font("Helvetica-Bold").fillColor(hex(theme.colors.accent)).text("\u2610  ", { continued: true, width });
        doc.font("Helvetica").fillColor(hex(theme.colors.body)).text(item, { width: width - 12 });
        doc.moveDown(0.15);
      }
      doc.moveDown(0.4);
      return;

    case "quote": {
      ensureSpace(doc, 50);
      const startY = doc.y;
      doc
        .fontSize(11.5)
        .font("Helvetica-Oblique")
        .fillColor(hex(theme.colors.body))
        .text(`\u201C${block.text}\u201D`, PAGE_MARGIN + 16, startY, { width: width - 16 });
      const endY = doc.y;
      doc.moveTo(PAGE_MARGIN, startY - 2).lineTo(PAGE_MARGIN, endY + 2).lineWidth(3).strokeColor(hex(theme.colors.accent)).stroke();
      if (block.attribution) {
        doc.fontSize(9).font("Helvetica").fillColor(hex(theme.colors.bodyMuted)).text(`— ${block.attribution}`, PAGE_MARGIN + 16, endY + 4);
      }
      doc.moveDown(0.8);
      return;
    }

    case "callout": {
      const boxColor = CALLOUT_TONE_COLOR[block.tone ?? "info"] ?? hex(theme.colors.surface);
      doc.fontSize(11).font("Helvetica");
      const textHeight = doc.heightOfString(block.text, { width: width - 32 });
      const boxHeight = textHeight + 24;
      ensureSpace(doc, boxHeight + 10);
      const y = doc.y;
      doc.rect(PAGE_MARGIN, y, width, boxHeight).fill(boxColor);
      doc.rect(PAGE_MARGIN, y, 4, boxHeight).fill(hex(theme.colors.accent));
      doc.fillColor(hex(theme.colors.heading)).text(block.text, PAGE_MARGIN + 20, y + 12, { width: width - 40 });
      doc.y = y + boxHeight + 12;
      return;
    }

    case "table": {
      const colWidth = width / block.headers.length;
      ensureSpace(doc, 24);
      let y = doc.y;
      doc.fontSize(10).font("Helvetica-Bold").fillColor(hex(theme.colors.heading));
      block.headers.forEach((h, i) => doc.text(h, PAGE_MARGIN + i * colWidth, y, { width: colWidth - 8 }));
      y += 18;
      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + width, y).strokeColor(hex(theme.colors.accentDim)).lineWidth(1).stroke();
      y += 6;
      doc.font("Helvetica").fillColor(hex(theme.colors.body));
      for (const row of block.rows) {
        ensureSpace(doc, 20);
        y = doc.y;
        row.forEach((cell, i) => doc.text(cell, PAGE_MARGIN + i * colWidth, y, { width: colWidth - 8 }));
        doc.moveDown(1);
      }
      doc.moveDown(0.5);
      return;
    }
  }
}

function buildPdfBuffer(plan: DocumentContentPlan, theme: DeliverableTheme, brandLabel: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    // Every new page (including the first) must get the themed background
    // before content draws — mirrors pptxLayouts slide background fill.
    doc.on("pageAdded", () => {
      paintPageBackground(doc, theme);
    });
    doc.on("end", () => {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        drawFooter(doc, theme, brandLabel);
      }
      resolve(Buffer.concat(chunks));
    });

    // First page already exists when PDFDocument constructs — paint it now
    // (pageAdded only fires for subsequent addPage calls).
    paintPageBackground(doc, theme);

    // Cover page.
    doc.fillColor(hex(theme.colors.heading)).fontSize(30).font("Helvetica-Bold").text(plan.title, { align: "left" });
    if (plan.subtitle) {
      doc.moveDown(0.4);
      doc.fillColor(hex(theme.colors.accent)).fontSize(14).font("Helvetica").text(plan.subtitle);
    }
    doc.addPage();

    if (plan.executiveSummary) {
      doc.fontSize(16).font("Helvetica-Bold").fillColor(hex(theme.colors.heading)).text("Executive Summary");
      doc.moveDown(0.4);
      doc.fontSize(11).font("Helvetica").fillColor(hex(theme.colors.body)).text(plan.executiveSummary);
      doc.moveDown(1);
    }

    for (const section of plan.sections) {
      ensureSpace(doc, 40);
      doc.fontSize(15).font("Helvetica-Bold").fillColor(hex(theme.colors.heading)).text(section.heading);
      const lineY = doc.y + 2;
      doc.moveTo(PAGE_MARGIN, lineY).lineTo(doc.page.width - PAGE_MARGIN, lineY).strokeColor(hex(theme.colors.accentDim)).lineWidth(0.75).stroke();
      doc.moveDown(0.6);
      for (const block of section.blocks) drawBlock(doc, block, theme);
      doc.moveDown(0.4);
    }

    doc.end();
  });
}

registerArtifactRenderer({
  type: "pdf",
  category: "document",
  async render(input: PdfGenerationInput): Promise<ArtifactRenderOutput> {
    const docType = input.docType ?? "brief";
    const prompt = DOCUMENT_CONTENT_PROMPT.replace("{DOC_TYPE}", docType).replace("{CONTEXT}", input.context);
    const [plan, themeSignals] = await Promise.all([
      generateValidatedContentPlan(prompt, DocumentContentPlanSchema, "PDF renderer"),
      input.projectId
        ? loadProjectThemeSignals(input.projectId, input.styleOverride)
        : input.styleOverride
          ? Promise.resolve({ styleOverride: input.styleOverride })
          : Promise.resolve(undefined),
    ]);
    if (input.title) plan.title = input.title;
    const theme = await resolveDeliverableTheme(themeSignals);

    const buffer = await buildPdfBuffer(plan, theme, "Joy");

    return {
      buffer,
      title: plan.title,
      mimeType: "application/pdf",
      extension: "pdf",
      preview: {
        title: plan.title,
        sectionHeadings: plan.sections.map((s) => s.heading),
        sectionCount: plan.sections.length,
      },
      summary: `Generated document "${plan.title}" (${plan.sections.length} sections).`,
    };
  },
});
