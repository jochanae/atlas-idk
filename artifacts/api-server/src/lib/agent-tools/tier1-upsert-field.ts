import { tool } from "ai";
import { z } from "zod";
import { TIER1_FIELD_KEYS } from "@workspace/db";
import type { AgentToolContext } from "./context";
import { canPersistInferredConfidence, upsertTier1Field } from "../../services/tier1";

export function tier1UpsertFieldTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Save one Tier 1 project memory field. Use when the user has clearly answered one of the six foundational questions in conversation. Never guess — only call with the user's actual words (lightly cleaned).",
    inputSchema: z.object({
      field: z.enum(TIER1_FIELD_KEYS),
      value: z.string().min(2).max(2000),
      confidence: z.enum(["explicit", "inferred"]).describe(
        "explicit = user stated it directly; inferred = you paraphrased from context",
      ),
    }),
    execute: async ({ field, value, confidence }) => {
      const started = performance.now();
      ctx.emitToolCall("tier1_upsert_field", { field, confidence });
      try {
        if (confidence === "inferred" && !canPersistInferredConfidence(ctx.messages)) {
          const ms = Math.round(performance.now() - started);
          ctx.emitToolResult("tier1_upsert_field", false, ms);
          return { ok: false, error: "needs_confirmation" };
        }

        const result = await upsertTier1Field(ctx.projectId, ctx.userId, field, value);
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("tier1_upsert_field", result.ok, ms);
        if (result.ok) {
          ctx.emitNamedEvent("memory_update", { type: "tier1", field, remaining: result.remaining });
        }
        return result;
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("tier1_upsert_field", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
