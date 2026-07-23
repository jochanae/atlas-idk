import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";
import { markTier1Skipped } from "../../services/tier1";

export function tier1MarkSkippedTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Call ONLY when the user has clearly told you to stop asking Tier 1 questions (e.g. 'skip', 'stop asking that', 'I don't want to answer'). Prevents Joy from asking again this project.",
    inputSchema: z.object({}),
    execute: async () => {
      const started = performance.now();
      ctx.emitToolCall("tier1_mark_skipped", {});
      try {
        const result = await markTier1Skipped(ctx.projectId, ctx.userId);
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("tier1_mark_skipped", result.ok, ms);
        if (result.ok) {
          ctx.emitNamedEvent("memory_update", { type: "tier1", skipped: true });
        }
        return result;
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("tier1_mark_skipped", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
