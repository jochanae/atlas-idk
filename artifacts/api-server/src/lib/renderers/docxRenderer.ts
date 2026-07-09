// DOCX renderer — Phase 2A's proving renderer for the Artifact Engine.
// Generates a structured Word document (title, sections, bullet lists) from
// conversation context via Claude, then renders it to a real .docx buffer.
import Anthropic from "@anthropic-ai/sdk";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { logger } from "../logger";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface DocxGenerationInput {
  /** Conversation/context text to ground the document in. */
  context: string;
  /** Optional explicit doc title; Atlas infers one from context if omitted. */
  title?: string;
  /** e.g. "brief", "spec", "report" — nudges structure/tone. */
  docType?: string;
}

interface DocxContentPlan {
  title: string;
  sections: Array<{
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
  }>;
}

const DOCX_CONTENT_PROMPT = `You are a professional writer producing a {DOC_TYPE} document from the conversation context below.

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

async function generateContentPlan(context: string, docType: string): Promise<DocxContentPlan | null> {
  const prompt = DOCX_CONTENT_PROMPT.replace("{DOC_TYPE}", docType).replace("{CONTEXT}", context);
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2200,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!raw) return null;
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    return JSON.parse(jsonStr) as DocxContentPlan;
  } catch {
    logger.warn({ raw }, "docxRenderer: JSON parse failed");
    return null;
  }
}

function buildDocxBuffer(plan: DocxContentPlan): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: plan.title,
      heading: HeadingLevel.TITLE,
    }),
  ];

  for (const section of plan.sections) {
    children.push(
      new Paragraph({
        text: section.heading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
      }),
    );
    for (const paragraph of section.paragraphs ?? []) {
      children.push(new Paragraph({ children: [new TextRun(paragraph)], spacing: { after: 120 } }));
    }
    for (const bullet of section.bullets ?? []) {
      children.push(
        new Paragraph({
          text: bullet,
          bullet: { level: 0 },
          spacing: { after: 80 },
        }),
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

registerArtifactRenderer({
  type: "docx",
  category: "document",
  async render(input: DocxGenerationInput): Promise<ArtifactRenderOutput> {
    const docType = input.docType ?? "brief";
    const plan = await generateContentPlan(input.context, docType);
    if (!plan) {
      throw new Error("DOCX renderer: content generation produced no output");
    }
    if (input.title) plan.title = input.title;

    const buffer = await buildDocxBuffer(plan);

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
      summary: `Generated document "${plan.title}" (${plan.sections.length} sections).`,
    };
  },
});
