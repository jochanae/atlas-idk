// Shared LLM content-plan generation helper for document renderers (DOCX/PDF/PPTX/XLSX).
// Each renderer defines its own zod schema for the JSON shape it expects back from
// Claude; this helper handles the call + markdown-fence stripping + validation so
// renderers fail with a clear error instead of producing a malformed file.
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { logger } from "../logger";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateValidatedContentPlan<T>(
  prompt: string,
  schema: ZodType<T, any, any>,
  rendererName: string,
): Promise<T> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2200,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!raw) {
    throw new Error(`${rendererName}: content generation produced no output`);
  }

  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    logger.warn({ raw, rendererName }, "contentPlan: JSON parse failed");
    throw new Error(`${rendererName}: content generation returned invalid JSON`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    logger.warn({ issues: result.error.issues, rendererName }, "contentPlan: schema validation failed");
    throw new Error(`${rendererName}: content generation returned an unexpected shape`);
  }
  return result.data;
}
