// Presentation Director — turns conversation context into a renderer-agnostic
// SlidePlan (Phase 3B.3). This is the "creative brain": it decides the
// presentation's purpose, the slide story, and which layout best communicates
// each idea. It knows nothing about PPTX/DOCX/PDF/HTML — every renderer
// consumes the same SlidePlan and is responsible only for painting it.
import { generateValidatedContentPlan } from "../renderers/contentPlan";
import { ICON_KEYS } from "../deliverable-theme/icons/iconLibrary";
import { SlidePlanSchema, LAYOUT_KEYS, type SlidePlan } from "./schema";

const DIRECTOR_PROMPT = `You are the Presentation Director for Atlas. Given the conversation context below, design a {DOC_TYPE} that tells a clear story — not a generic slide-per-topic dump.

Conversation context:
{CONTEXT}

Your job, in order:
1. Decide the presentation's PURPOSE (e.g. "investor pitch", "beta tester introduction", "training deck", "board update", "sales deck", "project update"). Infer it from the context; don't ask.
2. Decide the SLIDE STORY — the sequence of ideas that best serves that purpose. Vary the rhythm: don't repeat the same layout back to back unless the content genuinely calls for it.
3. For each slide, choose the layout that best fits what that slide is trying to say from this exact set: ${LAYOUT_KEYS.join(", ")}.
4. Fill in the fields required for that chosen layout. Keep every layout's content genuinely justified by the conversation — do not invent facts, numbers, or claims that were not discussed. If you don't have real numbers, use directional/qualitative language instead of specific stats.
5. For feature_grid, timeline, kpi_metrics, and process_flow items, optionally set "icon" to the single most semantically fitting key from this fixed vocabulary (omit it if nothing fits well — never invent a key outside this list): ${ICON_KEYS.join(", ")}.

Layout field shapes (only include the fields for the layout you chose):
- hero: { layout: "hero", eyebrow?, heading, subheading? }
- problem_opportunity: { layout: "problem_opportunity", eyebrow?, heading, points: string[] (1-5) }
- solution: { layout: "solution", eyebrow?, heading, description?, points: string[] (1-5) }
- feature_grid: { layout: "feature_grid", heading, features: [{ title, description, icon? }] (2-4) }
- timeline: { layout: "timeline", heading, milestones: [{ label, description?, icon? }] (2-6) }
- kpi_metrics: { layout: "kpi_metrics", heading, metrics: [{ value, label, icon? }] (2-4) }
- comparison: { layout: "comparison", heading, columns: [{ title, points: string[] }] (exactly 2) }
- process_flow: { layout: "process_flow", heading, steps: [{ title, description?, icon? }] (2-5) }
- screenshot_showcase: { layout: "screenshot_showcase", heading, caption?, highlights: string[] (1-4) }
- quote: { layout: "quote", quote, attribution? }
- closing_cta: { layout: "closing_cta", heading, subheading?, actionItems: string[] (1-6) }
- content_bullets (fallback only, avoid unless nothing else fits): { layout: "content_bullets", heading, bullets: string[] (1-6) }

Output ONLY valid JSON (no markdown, no explanation) with this exact shape:
{
  "title": "<deck title>",
  "subtitle": "<optional one-line subtitle>",
  "purpose": "<the purpose you inferred>",
  "slides": [ <3-12 slide objects using the shapes above, first slide should almost always be "hero"> ]
}`;

export async function directPresentation(context: string, docType: string): Promise<SlidePlan> {
  const prompt = DIRECTOR_PROMPT.replace("{DOC_TYPE}", docType).replace("{CONTEXT}", context);
  return generateValidatedContentPlan<SlidePlan>(prompt, SlidePlanSchema, "Presentation Director");
}
