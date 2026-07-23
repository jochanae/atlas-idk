// DOCX renderer — plug-in for the Artifact Engine (Phase 3B.4: themed + document-native).
// Renders the shared DocumentContentPlan (see deliverable-theme/documentContentPlan.ts)
// as a real .docx using document-native structures: cover page, executive summary,
// section headers, tables, quotes, checklists, and callout boxes — all styled from
// the shared DeliverableTheme tokens rather than hardcoded fonts/colors.
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  PageBreak,
} from "docx";
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

export interface DocxGenerationInput {
  context: string;
  title?: string;
  docType?: string;
  projectId?: number;
  styleOverride?: string;
}

const CALLOUT_TONE_SHADE: Record<string, string> = {
  info: "2A2E3A",
  warning: "3A2E1A",
  success: "1E3324",
};

function calloutShade(theme: DeliverableTheme, tone?: string): string {
  return CALLOUT_TONE_SHADE[tone ?? "info"] ?? theme.colors.surface;
}

function textRun(text: string, opts: Record<string, unknown> = {}, theme?: DeliverableTheme) {
  return new TextRun({ text, font: theme?.fonts.body, color: theme?.colors.body, ...opts } as any);
}

function renderBlock(block: DocumentBlock, theme: DeliverableTheme): (Paragraph | Table)[] {
  switch (block.type) {
    case "paragraph":
      return [new Paragraph({ children: [textRun(block.text, {}, theme)], spacing: { after: 160 } })];

    case "bullets":
      return block.items.map(
        (item) =>
          new Paragraph({
            children: [textRun(item, {}, theme)],
            bullet: { level: 0 },
            spacing: { after: 80 },
          }),
      );

    case "checklist":
      return block.items.map(
        (item) =>
          new Paragraph({
            children: [
              textRun("\u2610  ", { color: theme.colors.accent, bold: true }, theme),
              textRun(item, {}, theme),
            ],
            spacing: { after: 90 },
          }),
      );

    case "quote":
      return [
        new Paragraph({
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: theme.colors.accent, space: 8 } },
          children: [textRun(`\u201C${block.text}\u201D`, { italics: true }, theme)],
          spacing: { before: 160, after: block.attribution ? 40 : 160 },
        }),
        ...(block.attribution
          ? [
              new Paragraph({
                indent: { left: 360 },
                children: [textRun(`— ${block.attribution}`, { color: theme.colors.bodyMuted, size: 20 }, theme)],
                spacing: { after: 160 },
              }),
            ]
          : []),
      ];

    case "callout": {
      const shade = calloutShade(theme, block.tone);
      return [
        new Paragraph({
          shading: { type: ShadingType.SOLID, color: shade, fill: shade },
          border: {
            left: { style: BorderStyle.SINGLE, size: 24, color: theme.colors.accent, space: 6 },
          },
          children: [textRun(block.text, { color: theme.colors.heading }, theme)],
          spacing: { before: 120, after: 160 },
        }),
      ];
    }

    case "table": {
      const headerRow = new TableRow({
        tableHeader: true,
        children: block.headers.map(
          (h) =>
            new TableCell({
              shading: { type: ShadingType.SOLID, color: theme.colors.surface, fill: theme.colors.surface },
              children: [
                new Paragraph({ children: [textRun(h, { bold: true, color: theme.colors.heading }, theme)] }),
              ],
            }),
        ),
      });
      const bodyRows = block.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) => new TableCell({ children: [new Paragraph({ children: [textRun(cell, {}, theme)] })] }),
            ),
          }),
      );
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }),
        new Paragraph({ spacing: { after: 160 } }),
      ];
    }
  }
}

function buildDocxBuffer(plan: DocumentContentPlan, theme: DeliverableTheme, brandLabel: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Cover page: title + subtitle, vertically-weighted, then a hard page break.
  children.push(
    new Paragraph({ spacing: { before: 2400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [textRun(plan.title, { bold: true, size: 56, font: theme.fonts.heading, color: theme.colors.heading })],
    }),
  );
  if (plan.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [textRun(plan.subtitle, { size: 28, color: theme.colors.accent, font: theme.fonts.body })],
      }),
    );
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  if (plan.executiveSummary) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [textRun("Executive Summary", { font: theme.fonts.heading, color: theme.colors.heading, bold: true })],
        spacing: { after: 160 },
      }),
      new Paragraph({ children: [textRun(plan.executiveSummary, {}, theme)], spacing: { after: 300 } }),
    );
  }

  for (const section of plan.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.colors.accentDim, space: 4 } },
        children: [textRun(section.heading, { font: theme.fonts.heading, color: theme.colors.heading, bold: true })],
        spacing: { before: 300, after: 160 },
      }),
    );
    for (const block of section.blocks) {
      children.push(...renderBlock(block, theme));
    }
  }

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [textRun(brandLabel, { size: 16, color: theme.colors.footer }, theme)],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  textRun("Page ", { size: 16, color: theme.colors.footer }, theme),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: theme.colors.footer } as any),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

registerArtifactRenderer({
  type: "docx",
  category: "document",
  async render(input: DocxGenerationInput): Promise<ArtifactRenderOutput> {
    const docType = input.docType ?? "brief";
    const prompt = DOCUMENT_CONTENT_PROMPT.replace("{DOC_TYPE}", docType).replace("{CONTEXT}", input.context);
    const [plan, themeSignals] = await Promise.all([
      generateValidatedContentPlan(prompt, DocumentContentPlanSchema, "DOCX renderer"),
      input.projectId
        ? loadProjectThemeSignals(input.projectId, input.styleOverride)
        : input.styleOverride
          ? Promise.resolve({ styleOverride: input.styleOverride })
          : Promise.resolve(undefined),
    ]);
    if (input.title) plan.title = input.title;
    const theme = await resolveDeliverableTheme(themeSignals);

    const buffer = await buildDocxBuffer(plan, theme, "Joy");

    return {
      buffer,
      title: plan.title,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
      preview: {
        title: plan.title,
        sectionHeadings: plan.sections.map((s) => s.heading),
        sectionCount: plan.sections.length,
      },
      expectedCounts: { sections: plan.sections.length },
      summary: `Generated document "${plan.title}" (${plan.sections.length} sections).`,
    };
  },
});
