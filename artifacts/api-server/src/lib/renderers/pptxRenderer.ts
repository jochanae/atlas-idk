// PPTX renderer — plug-in #3 for the Artifact Engine.
// Generates a structured slide deck (title slide + content slides) from
// conversation context via Claude, then renders it with pptxgenjs.
import PptxGenJS from "pptxgenjs";
import { z } from "zod";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { generateValidatedContentPlan } from "./contentPlan";

export interface PptxGenerationInput {
  context: string;
  title?: string;
  docType?: string;
}

const PptxContentPlanSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  slides: z
    .array(
      z.object({
        heading: z.string().min(1),
        bullets: z.array(z.string()).default([]),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});
type PptxContentPlan = z.infer<typeof PptxContentPlanSchema>;

const PPTX_CONTENT_PROMPT = `You are a presentation writer producing a {DOC_TYPE} slide deck from the conversation context below.

Conversation context:
{CONTEXT}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<deck title>",
  "subtitle": "<optional one-line subtitle>",
  "slides": [
    {
      "heading": "<slide heading>",
      "bullets": ["<bullet point, keep short>"],
      "notes": "<optional speaker notes>"
    }
  ]
}

Rules:
- Produce 4-10 content slides that reflect what was actually discussed — do not invent content.
- Each slide should have 2-5 short bullets, not paragraphs.
- Keep headings and bullets concise — this is a deck, not a document.`;

function buildPptxBuffer(plan: PptxContentPlan): Promise<Buffer> {
  const pptx = new PptxGenJS();

  const titleSlide = pptx.addSlide();
  titleSlide.addText(plan.title, {
    x: 0.5, y: 2.0, w: "90%", h: 1.2,
    fontSize: 32, bold: true, align: "left",
  });
  if (plan.subtitle) {
    titleSlide.addText(plan.subtitle, {
      x: 0.5, y: 3.1, w: "90%", h: 0.8,
      fontSize: 16, color: "666666", align: "left",
    });
  }

  for (const slide of plan.slides) {
    const s = pptx.addSlide();
    s.addText(slide.heading, {
      x: 0.5, y: 0.4, w: "90%", h: 0.8,
      fontSize: 24, bold: true,
    });
    if (slide.bullets.length > 0) {
      s.addText(
        slide.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.5, y: 1.4, w: "90%", h: 4.5, fontSize: 16, valign: "top" },
      );
    }
    if (slide.notes) {
      s.addNotes(slide.notes);
    }
  }

  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

registerArtifactRenderer({
  type: "pptx",
  category: "presentation",
  async render(input: PptxGenerationInput): Promise<ArtifactRenderOutput> {
    const docType = input.docType ?? "deck";
    const prompt = PPTX_CONTENT_PROMPT.replace("{DOC_TYPE}", docType).replace("{CONTEXT}", input.context);
    const plan = await generateValidatedContentPlan<PptxContentPlan>(prompt, PptxContentPlanSchema, "PPTX renderer");
    if (input.title) plan.title = input.title;

    const buffer = await buildPptxBuffer(plan);

    return {
      buffer,
      title: plan.title,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
      preview: {
        title: plan.title,
        subtitle: plan.subtitle,
        slideHeadings: plan.slides.map((s) => s.heading),
        slideCount: plan.slides.length + 1,
      },
      summary: `Generated deck "${plan.title}" (${plan.slides.length + 1} slides).`,
    };
  },
});
