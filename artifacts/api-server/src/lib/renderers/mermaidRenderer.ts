// Mermaid diagram renderer — plug-in for the Artifact Engine.
// Generates Mermaid diagram source (flowchart/sequence/architecture) from
// conversation context via Claude. The raw Mermaid source is stored as both
// the downloadable file (.mmd) and the inline preview payload, so a client
// can render it live with mermaid.js and the source can be regenerated/edited
// later without re-deriving it from a binary format.
import { z } from "zod";
import { registerArtifactRenderer, type ArtifactRenderOutput } from "../artifactEngine";
import { generateValidatedContentPlan } from "./contentPlan";

export interface MermaidGenerationInput {
  context: string;
  title?: string;
  diagramType?: "flowchart" | "sequence" | "architecture";
}

const MermaidContentPlanSchema = z.object({
  title: z.string().min(1),
  diagramType: z.enum(["flowchart", "sequence", "architecture"]),
  mermaidSource: z.string().min(1),
  summary: z.string().optional(),
});
type MermaidContentPlan = z.infer<typeof MermaidContentPlanSchema>;

const MERMAID_CONTENT_PROMPT = `You are a technical diagrammer producing a {DIAGRAM_TYPE} diagram from the conversation context below.

Conversation context:
{CONTEXT}

Output ONLY valid JSON (no markdown, no explanation) with this shape:
{
  "title": "<diagram title>",
  "diagramType": "{DIAGRAM_TYPE}",
  "mermaidSource": "<valid Mermaid diagram source, starting with the correct directive (e.g. 'flowchart TD', 'sequenceDiagram', 'flowchart LR' for architecture sketches)>",
  "summary": "<one sentence describing what the diagram shows>"
}

Rules:
- mermaidSource MUST be syntactically valid Mermaid syntax for a "{DIAGRAM_TYPE}" diagram — use flowchart syntax ("flowchart TD" or "flowchart LR") for both flowchart and architecture diagrams, and "sequenceDiagram" syntax for sequence diagrams.
- Reflect only what was actually discussed or reasonably implied in the conversation — do not invent unrelated nodes or actors.
- Keep node/actor labels short and concrete. Escape any characters Mermaid would otherwise choke on (e.g. wrap labels containing special characters in quotes).
- Do not include markdown code fences inside mermaidSource — just the raw Mermaid syntax.`;

function buildPrompt(input: MermaidGenerationInput): string {
  const diagramType = input.diagramType ?? "flowchart";
  return MERMAID_CONTENT_PROMPT.replace(/\{DIAGRAM_TYPE\}/g, diagramType).replace("{CONTEXT}", input.context);
}

registerArtifactRenderer({
  type: "mermaid",
  category: "diagram",
  async render(input: MermaidGenerationInput): Promise<ArtifactRenderOutput> {
    const prompt = buildPrompt(input);
    const plan = await generateValidatedContentPlan<MermaidContentPlan>(prompt, MermaidContentPlanSchema, "Mermaid renderer");
    if (input.title) plan.title = input.title;

    const buffer = Buffer.from(plan.mermaidSource, "utf-8");

    return {
      buffer,
      title: plan.title,
      mimeType: "text/vnd.mermaid",
      extension: "mmd",
      preview: {
        title: plan.title,
        diagramType: plan.diagramType,
        mermaidSource: plan.mermaidSource,
        summary: plan.summary ?? null,
      },
      summary: plan.summary ?? `Generated ${plan.diagramType} diagram "${plan.title}".`,
    };
  },
});
