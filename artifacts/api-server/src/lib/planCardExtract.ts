/**
 * Shared Plan Card structuring pass — extracts a StructuredPlanArtifact from
 * assistant prose via Haiku. Used by legacy /api/chat (planMode) and Nexus
 * (requestedArtifact: "plan").
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

export type StructuredPlanArtifact = {
  type: "plan";
  title: string;
  confidence: "high" | "medium" | "low";
  steps: Array<{
    label: string;
    stepType: string;
    moscow: string;
    file?: string;
  }>;
  estimatedChanges?: number;
  reversible?: boolean;
  amFields?: string[];
};

const VALID_AM_FIELDS = [
  "identity",
  "intent",
  "intent.purpose",
  "pages",
  "components",
  "data",
  "data.entities",
  "logic",
  "buildState",
];

const EXTRACT_PROMPT = `Extract a structured plan from this assistant response. Return ONLY a JSON object — no markdown fences, no explanation.

JSON shape:
{"title":"concise plan title","confidence":"high"|"medium"|"low","steps":[{"label":"short action phrase","stepType":"analysis"|"edit"|"push"|"read"|"other","moscow":"must"|"should"|"could"|"wont","file":"optional/path.ts"}],"estimatedChanges":0,"reversible":true,"amFields":["intent","pages","data","data.entities","components","logic","buildState","identity"]}

amFields must be an array of zero or more strings chosen from this vocabulary only: "identity", "intent", "intent.purpose", "pages", "components", "data", "data.entities", "logic", "buildState". Include only fields this plan proposes to change.

Assistant response:
`;

/**
 * Returns a Plan Card payload when the reply is an actionable plan (≥2 steps
 * and estimatedChanges > 0 or edit/push steps). Returns null for clarify /
 * conversational replies so the client does not show a hollow card.
 */
export async function extractPlanCardFromAssistantText(
  anthropic: Anthropic,
  displayContent: string,
): Promise<StructuredPlanArtifact | null> {
  if (!displayContent || displayContent.length <= 40) return null;

  try {
    const planExtrResp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: EXTRACT_PROMPT + displayContent.slice(0, 3000),
        },
      ],
    });
    const rawPlan =
      planExtrResp.content[0]?.type === "text" ? planExtrResp.content[0].text.trim() : "";
    const jsonMatch = rawPlan.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const estimatedChanges = Number(parsed.estimatedChanges ?? 0);
    const hasEditSteps =
      Array.isArray(parsed.steps) &&
      (parsed.steps as Array<{ stepType?: string }>).some(
        (s) => s.stepType === "edit" || s.stepType === "push",
      );
    if (
      !parsed.title ||
      !Array.isArray(parsed.steps) ||
      (parsed.steps as unknown[]).length < 2 ||
      !(estimatedChanges > 0 || hasEditSteps)
    ) {
      return null;
    }

    const { type: _t, ...planRest } = parsed;
    const rawAmFields = Array.isArray(planRest.amFields) ? (planRest.amFields as unknown[]) : [];
    const amFields = rawAmFields.filter(
      (f): f is string => typeof f === "string" && VALID_AM_FIELDS.includes(f),
    );

    return {
      type: "plan",
      title: String(planRest.title ?? ""),
      confidence: (planRest.confidence as "high" | "medium" | "low") ?? "medium",
      steps: (planRest.steps as StructuredPlanArtifact["steps"]) ?? [],
      ...(planRest.estimatedChanges != null
        ? { estimatedChanges: Number(planRest.estimatedChanges) }
        : {}),
      ...(planRest.reversible != null ? { reversible: Boolean(planRest.reversible) } : {}),
      ...(amFields.length > 0 ? { amFields } : {}),
    };
  } catch (planErr) {
    logger.warn({ err: planErr }, "plan card extraction failed — non-fatal");
    return null;
  }
}
