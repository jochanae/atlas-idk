import { tool } from "ai";
import { z } from "zod";
import { runVerifyInWorkspace } from "../verifyRunner";
import type { AgentToolContext } from "./context";

export function runTypecheckTool(ctx: AgentToolContext) {
  return tool({
    description: "Run TypeScript type checking in the project workspace.",
    inputSchema: z.object({
      scope: z.enum(["frontend", "backend", "both"]).optional(),
    }),
    execute: async ({ scope }) => {
      const started = performance.now();
      ctx.emitToolCall("run_typecheck", { scope: scope ?? "both" });
      if (!ctx.sideEffects.buildRunEmitted) {
        ctx.writeStep({ verb: "Typechecking", target: scope ?? "both", phase: "verify" });
        ctx.sideEffects.buildRunEmitted = true;
      }
      try {
        const result = await runVerifyInWorkspace(ctx.workspaceDir, "typecheck");
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("run_typecheck", result.ok, ms);
        return {
          ok: result.ok,
          errors: result.errors,
          durationMs: result.durationMs,
          outputTail: result.lines.slice(-20).join("\n"),
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("run_typecheck", false, ms);
        return { ok: false, errors: [], error: String(err) };
      }
    },
  });
}
