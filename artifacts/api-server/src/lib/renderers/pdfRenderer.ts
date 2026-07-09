// PDF renderer — plug-in #2 for the Artifact Engine.
// Generates a structured PDF brief (title, sections, bullet lists) from
// conversation context via Claude, then renders it with pdfkit.
import PDFDocument from "pdfkit";
import { z } from "zod";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { generateValidatedContentPlan } from "./contentPlan";

export interface PdfGenerationInput {
  context: string;
  title?: string;
  docType?: string;
}

const PdfContentPlanSchema = z.object({
  title: z.string().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        paragraphs: z.array(z.string()).optional(),
        bullets: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});
type PdfContentPlan = z.infer<typeof PdfContentPlanSchema>;

const PDF_CONTENT_PROMPT = `You are a professional writer producing a {DOC_TYPE} document from the conversation context below.

Conversation context:
{CONTEXT}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<document title>",
  "sections": [
    {
      "heading": "<section heading>",
      "paragraphs": ["<paragraph text>"],
      "bullets": ["<bullet point>"]
    }
  ]
}

Rules:
- Produce 3-8 sections that reflect what was actually discussed — do not invent content.
- A section may have paragraphs, bullets, or both; omit whichever isn't used.
- Keep language clear and professional. No filler, no placeholder text.`;

function buildPdfBuffer(plan: PdfContentPlan): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).font("Helvetica-Bold").text(plan.title, { align: "left" });
    doc.moveDown(1);

    for (const section of plan.sections) {
      doc.fontSize(15).font("Helvetica-Bold").text(section.heading);
      doc.moveDown(0.4);
      doc.fontSize(11).font("Helvetica");

      for (const paragraph of section.paragraphs ?? []) {
        doc.text(paragraph, { align: "left" });
        doc.moveDown(0.5);
      }
      for (const bullet of section.bullets ?? []) {
        doc.text(`•  ${bullet}`, { indent: 12 });
        doc.moveDown(0.2);
      }
      doc.moveDown(0.8);
    }

    doc.end();
  });
}

registerArtifactRenderer({
  type: "pdf",
  category: "document",
  async render(input: PdfGenerationInput): Promise<ArtifactRenderOutput> {
    const docType = input.docType ?? "brief";
    const prompt = PDF_CONTENT_PROMPT.replace("{DOC_TYPE}", docType).replace("{CONTEXT}", input.context);
    const plan = await generateValidatedContentPlan(prompt, PdfContentPlanSchema, "PDF renderer");
    if (input.title) plan.title = input.title;

    const buffer = await buildPdfBuffer(plan);

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
