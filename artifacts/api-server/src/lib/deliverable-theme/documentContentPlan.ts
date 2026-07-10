// Shared document-native content model for DOCX/PDF (Phase 3B.4).
//
// DOCX and PDF are documents, not slides — they get one richer content plan
// with document-native structures (cover page, executive summary, sections
// made of typed blocks) instead of trying to recreate the Presentation
// Director's slide layout catalog. PDF renders this exact same plan so the
// two formats stay visually consistent without being a second design system.
import { z } from "zod";
import { ICON_KEYS } from "./icons/iconLibrary";

const IconKeySchema = z.enum(ICON_KEYS as unknown as [string, ...string[]]);

export const DocumentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().min(1) }),
  z.object({ type: z.literal("bullets"), items: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal("checklist"), items: z.array(z.string().min(1)).min(1) }),
  z.object({
    type: z.literal("quote"),
    text: z.string().min(1),
    attribution: z.string().optional(),
  }),
  z.object({
    type: z.literal("callout"),
    text: z.string().min(1),
    tone: z.enum(["info", "warning", "success"]).optional(),
    icon: IconKeySchema.optional(),
  }),
  z.object({
    type: z.literal("table"),
    headers: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())).min(1),
  }),
]);
export type DocumentBlock = z.infer<typeof DocumentBlockSchema>;

export const DocumentSectionSchema = z.object({
  heading: z.string().min(1),
  blocks: z.array(DocumentBlockSchema).min(1),
});
export type DocumentSection = z.infer<typeof DocumentSectionSchema>;

export const DocumentContentPlanSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  executiveSummary: z.string().optional(),
  sections: z.array(DocumentSectionSchema).min(1),
});
export type DocumentContentPlan = z.infer<typeof DocumentContentPlanSchema>;

export const DOCUMENT_CONTENT_PROMPT = `You are a professional writer producing a {DOC_TYPE} document from the conversation context below.

Conversation context:
{CONTEXT}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<document title>",
  "subtitle": "<optional one-line subtitle/tagline>",
  "executiveSummary": "<optional 2-4 sentence summary, only for longer/strategic documents>",
  "sections": [
    {
      "heading": "<section heading>",
      "blocks": [
        { "type": "paragraph", "text": "<prose>" },
        { "type": "bullets", "items": ["<point>"] },
        { "type": "checklist", "items": ["<actionable item>"] },
        { "type": "quote", "text": "<notable quote or key line>", "attribution": "<optional source>" },
        { "type": "callout", "text": "<important note>", "tone": "info|warning|success", "icon": "<optional icon key>" },
        { "type": "table", "headers": ["<col>"], "rows": [["<cell>"]] }
      ]
    }
  ]
}

Icon vocabulary (use ONLY these keys, and only for callout blocks where a visual really helps — most callouts should omit "icon"): ${ICON_KEYS.join(", ")}.

Rules:
- Produce 3-8 sections that reflect what was actually discussed — do not invent content.
- Mix block types deliberately: use "table" for comparisons/structured data, "checklist" for action items, "quote" for a notable line, "callout" to highlight a risk/insight, "bullets" for general lists, "paragraph" for narrative.
- Most sections should use 1-3 blocks. Do not pad with filler.
- Only include "executiveSummary" for strategic/report-style documents, not short briefs.
- Keep language clear and professional. No filler, no placeholder text.`;
