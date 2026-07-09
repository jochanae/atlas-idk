// PPTX renderer — plug-in #3 for the Artifact Engine.
// Generates a structured slide deck (title slide + content slides) from
// conversation context via Claude, then renders it with pptxgenjs.
import PptxGenJS from "pptxgenjs";
import { z } from "zod";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { generateValidatedContentPlan } from "./contentPlan";
import { resolveDeliverableTheme, type DeliverableTheme } from "../deliverable-theme/tokens";

const MASTER_NAME = "ATLAS_DECK_MASTER";

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

function defineDeckMaster(pptx: PptxGenJS, theme: DeliverableTheme, brandLabel: string): void {
  pptx.defineSlideMaster({
    title: MASTER_NAME,
    background: { color: theme.colors.background },
    objects: [
      // Thin accent rule separating content from the footer band.
      {
        rect: {
          x: 0.5, y: 5.28, w: 9.0, h: 0.012,
          fill: { color: theme.colors.accentDim },
        },
      },
      {
        text: {
          text: brandLabel,
          options: {
            x: 0.5, y: 5.35, w: 6.0, h: 0.3,
            fontFace: theme.fonts.body, fontSize: 9,
            color: theme.colors.footer, align: "left",
          },
        },
      },
    ],
    slideNumber: {
      x: 9.0, y: 5.35, w: 0.5, h: 0.3,
      fontFace: theme.fonts.body, fontSize: 9, color: theme.colors.footer, align: "right",
    },
  });
}

function buildPptxBuffer(plan: PptxContentPlan, brandLabel: string): Promise<Buffer> {
  const theme = resolveDeliverableTheme();
  const pptx = new PptxGenJS();
  defineDeckMaster(pptx, theme, brandLabel);

  const titleSlide = pptx.addSlide({ masterName: MASTER_NAME });
  titleSlide.addText(plan.title, {
    x: 0.6, y: 2.05, w: "88%", h: 1.1,
    fontFace: theme.fonts.heading, fontSize: 36, bold: true, align: "left",
    color: theme.colors.heading,
  });
  // Accent divider under the deck title, echoing the app's own gold rule.
  titleSlide.addShape("rect", {
    x: 0.62, y: 3.15, w: 1.4, h: 0.03,
    fill: { color: theme.colors.accent },
  });
  if (plan.subtitle) {
    titleSlide.addText(plan.subtitle, {
      x: 0.6, y: 3.35, w: "80%", h: 0.7,
      fontFace: theme.fonts.body, fontSize: 16, italic: true, align: "left",
      color: theme.colors.accent,
    });
  }

  for (const slide of plan.slides) {
    const s = pptx.addSlide({ masterName: MASTER_NAME });
    s.addText(slide.heading, {
      x: 0.5, y: 0.42, w: "90%", h: 0.7,
      fontFace: theme.fonts.heading, fontSize: 26, bold: true,
      color: theme.colors.heading,
    });
    s.addShape("rect", {
      x: 0.52, y: 1.12, w: 0.9, h: 0.025,
      fill: { color: theme.colors.accent },
    });
    if (slide.bullets.length > 0) {
      s.addText(
        slide.bullets.map((b) => ({
          text: b,
          options: {
            bullet: { code: "25AA", color: theme.colors.accent },
            breakLine: true,
            paraSpaceAfter: 12,
          },
        })),
        {
          x: 0.5, y: 1.5, w: "90%", h: 3.6, valign: "top",
          fontFace: theme.fonts.body, fontSize: 16, color: theme.colors.body,
        },
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

    const buffer = await buildPptxBuffer(plan, "Atlas");

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
