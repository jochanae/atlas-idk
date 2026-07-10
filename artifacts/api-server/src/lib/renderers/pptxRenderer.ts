// PPTX renderer — plug-in #3 for the Artifact Engine.
// Phase 3B.3: content/structure decisions now come from the Presentation
// Director (renderer-agnostic SlidePlan); this file only executes that plan —
// picking the layout-drawing function for each slide and painting it with the
// current theme tokens via pptxLayouts.ts.
import PptxGenJS from "pptxgenjs";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { resolveDeliverableTheme, type DeliverableTheme } from "../deliverable-theme/tokens";
import { loadProjectThemeSignals } from "../deliverable-theme/projectSignals";
import { directPresentation } from "../presentation-director/director";
import type { SlidePlan } from "../presentation-director/schema";
import { PPTX_LAYOUTS } from "./pptxLayouts";

const MASTER_NAME = "ATLAS_DECK_MASTER";

export interface PptxGenerationInput {
  context: string;
  title?: string;
  docType?: string;
  /** Owning project — used to infer a project theme (Phase 3B.2). Falls back to the Atlas default theme when absent. */
  projectId?: number;
  /** Explicit user instruction on visual style, e.g. "make it look playful and colorful". Wins over the inferred project theme. */
  styleOverride?: string;
}

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

async function buildPptxBuffer(plan: SlidePlan, brandLabel: string, theme: DeliverableTheme): Promise<Buffer> {
  const pptx = new PptxGenJS();
  defineDeckMaster(pptx, theme, brandLabel);

  for (const slideContent of plan.slides) {
    const slide = pptx.addSlide({ masterName: MASTER_NAME });
    const draw = PPTX_LAYOUTS[slideContent.layout];
    draw(slide, theme, slideContent);
  }

  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

registerArtifactRenderer({
  type: "pptx",
  category: "presentation",
  async render(input: PptxGenerationInput): Promise<ArtifactRenderOutput> {
    const docType = input.docType ?? "deck";
    const [plan, themeSignals] = await Promise.all([
      directPresentation(input.context, docType),
      input.projectId
        ? loadProjectThemeSignals(input.projectId, input.styleOverride)
        : input.styleOverride
          ? Promise.resolve({ styleOverride: input.styleOverride })
          : Promise.resolve(undefined),
    ]);
    if (input.title) plan.title = input.title;
    const theme = await resolveDeliverableTheme(themeSignals);

    const buffer = await buildPptxBuffer(plan, "Atlas", theme);

    return {
      buffer,
      title: plan.title,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
      preview: {
        title: plan.title,
        subtitle: plan.subtitle,
        purpose: plan.purpose,
        theme: theme.name,
        slideHeadings: plan.slides.map((s) => ("heading" in s ? s.heading : s.layout)),
        slideCount: plan.slides.length,
      },
      expectedCounts: { slides: plan.slides.length },
      summary: `Generated deck "${plan.title}" (${plan.slides.length} slides, ${plan.purpose}, theme: ${theme.name}).`,
    };
  },
});
