// XLSX renderer — plug-in #4 for the Artifact Engine.
// Generates a structured tabular workbook (budgets, comparisons, data tables)
// from conversation context via Claude, then renders it with exceljs.
import ExcelJS from "exceljs";
import { z } from "zod";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { generateValidatedContentPlan } from "./contentPlan";

export interface XlsxGenerationInput {
  context: string;
  title?: string;
  docType?: string;
  /** When true, asks the model to include real formula cells (e.g. SUM totals) instead of only literal values. */
  includeFormulas?: boolean;
}

const XlsxCellSchema = z.union([
  z.string(),
  z.number(),
  z.object({ formula: z.string().min(1) }),
]);

const XlsxContentPlanSchema = z.object({
  title: z.string().min(1),
  sheets: z
    .array(
      z.object({
        name: z.string().min(1),
        columns: z.array(z.string()).min(1),
        rows: z.array(z.array(XlsxCellSchema)),
      }),
    )
    .min(1),
});
type XlsxContentPlan = z.infer<typeof XlsxContentPlanSchema>;
type XlsxCell = z.infer<typeof XlsxCellSchema>;

function isFormulaCell(cell: XlsxCell): cell is { formula: string } {
  return typeof cell === "object" && cell !== null && "formula" in cell;
}

function xlsxPrompt(docType: string, context: string, includeFormulas: boolean): string {
  const formulaRule = includeFormulas
    ? `- Where a total, average, or other derived value is discussed, add it as a formula cell: { "formula": "SUM(B2:B5)" } (no leading "="). Use real spreadsheet formulas referencing the sheet's own cells, not made-up syntax.`
    : `- Use only literal string/number cell values — do not use formulas.`;
  return `You are a data analyst producing a ${docType} spreadsheet from the conversation context below.

Conversation context:
${context}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<workbook title>",
  "sheets": [
    {
      "name": "<sheet name, e.g. 'Budget'>",
      "columns": ["<column header>"],
      "rows": [["<cell value, or {\\"formula\\": \\"SUM(B2:B5)\\"} for a computed cell>"]]
    }
  ]
}

Rules:
- Produce 1-3 sheets that reflect tabular/data-driven content actually discussed (budgets, comparisons, schedules, etc.) — do not invent numbers or rows that weren't discussed or reasonably implied.
- Every row array must have the same length as the columns array.
- Sheet names must be short (max 31 characters, no special characters).
${formulaRule}`;
}

function buildXlsxBuffer(plan: XlsxContentPlan): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Atlas";
  workbook.created = new Date();

  for (const sheetPlan of plan.sheets) {
    const safeName = sheetPlan.name.replace(/[[\]*/\\?:]/g, "").slice(0, 31) || "Sheet1";
    const sheet = workbook.addWorksheet(safeName);

    sheet.addRow(sheetPlan.columns);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
    });

    for (const row of sheetPlan.rows) {
      const rowValues = row.map((cell) => (isFormulaCell(cell) ? { formula: cell.formula } : cell));
      sheet.addRow(rowValues);
    }

    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 40);
    });
  }

  return workbook.xlsx.writeBuffer().then((buf) => Buffer.from(buf));
}

registerArtifactRenderer({
  type: "xlsx",
  category: "spreadsheet",
  async render(input: XlsxGenerationInput): Promise<ArtifactRenderOutput> {
    const docType = input.docType ?? "table";
    const includeFormulas = input.includeFormulas ?? false;
    const prompt = xlsxPrompt(docType, input.context, includeFormulas);
    const plan = await generateValidatedContentPlan(prompt, XlsxContentPlanSchema, "XLSX renderer");
    if (input.title) plan.title = input.title;

    const rowMismatch = plan.sheets.find((s) => s.rows.some((r) => r.length !== s.columns.length));
    if (rowMismatch) {
      throw new Error(`XLSX renderer: sheet "${rowMismatch.name}" has rows that don't match its column count`);
    }

    const buffer = await buildXlsxBuffer(plan);

    return {
      buffer,
      title: plan.title,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      preview: {
        title: plan.title,
        formulasRequested: includeFormulas,
        sheets: plan.sheets.map((s) => ({
          name: s.name,
          columns: s.columns,
          rowCount: s.rows.length,
          hasFormulas: s.rows.some((r) => r.some(isFormulaCell)),
        })),
      },
      expectedCounts: { sheets: plan.sheets.length },
      summary: `Generated workbook "${plan.title}" (${plan.sheets.length} sheet${plan.sheets.length === 1 ? "" : "s"}).`,
    };
  },
});
