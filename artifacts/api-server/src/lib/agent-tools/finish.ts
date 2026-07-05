import { tool } from "ai";
import { z } from "zod";
import type { AgentToolContext } from "./context";

export function finishTool(ctx: AgentToolContext) {
  return tool({
    description: "Signal that the task is complete and terminate the agent loop.",
    inputSchema: z.object({
      summary: z.string(),
    }),
    execute: async ({ summary }) => {
      const started = performance.now();
      ctx.emitToolCall("finish", { summary });
      ctx.sideEffects.finishSummary = summary;
      const ms = Math.round(performance.now() - started);
      ctx.emitToolResult("finish", true, ms);
      return { ok: true, summary };
    },
  });
}
