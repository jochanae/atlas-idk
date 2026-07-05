import { tool } from "ai";
import { z } from "zod";
import { runVerifyInWorkspace } from "../verifyRunner";
import type { AgentToolContext } from "./context";

export function runTestsTool(ctx: AgentToolContext) {
  return tool({
    description: "Run the project test suite and return a pass/fail summary.",
    inputSchema: z.object({
      pattern: z.string().optional(),
    }),
    execute: async ({ pattern }) => {
      const started = performance.now();
      ctx.emitToolCall("run_tests", { pattern });
      ctx.writeStep({ verb: "Testing", target: pattern ?? "all", phase: "verify" });
      try {
        const result = await runVerifyInWorkspace(ctx.workspaceDir, "test");
        const passed = result.ok;
        const failedMatch = result.lines.join("\n").match(/(\d+)\s+failed/i);
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("run_tests", passed, ms);
        return {
          ok: passed,
          passed,
          failedCount: failedMatch ? Number(failedMatch[1]) : (passed ? 0 : 1),
          durationMs: result.durationMs,
          summary: result.lines.slice(-10).join("\n"),
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("run_tests", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
