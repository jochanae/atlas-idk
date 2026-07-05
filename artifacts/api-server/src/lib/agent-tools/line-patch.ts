import { readFile } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { resolveWorkspacePath } from "../projectWorkspace";
import type { AgentToolContext } from "./context";

export function linePatchTool(ctx: AgentToolContext) {
  return tool({
    description: "Patch specific lines in a file by line range replacement.",
    inputSchema: z.object({
      path: z.string(),
      startLine: z.number().int().min(1),
      endLine: z.number().int().min(1),
      newContent: z.string(),
      reason: z.string(),
    }),
    execute: async ({ path: filePath, startLine, endLine, newContent, reason }) => {
      const started = performance.now();
      ctx.emitToolCall("line_patch", { path: filePath, startLine, endLine, reason });
      try {
        const abs = resolveWorkspacePath(ctx.workspaceDir, filePath);
        const raw = await readFile(abs, "utf8");
        const lines = raw.split("\n");
        const start = Math.max(1, startLine);
        const end = Math.min(lines.length, endLine);
        const findBlock = lines.slice(start - 1, end).join("\n");
        const replaceBlock = newContent;

        ctx.sideEffects.linePatches.push({
          path: filePath,
          find: findBlock,
          replace: replaceBlock,
        });
        ctx.writeStep({ verb: "Patching", target: filePath, phase: "build" });

        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("line_patch", true, ms);
        return {
          ok: true,
          path: filePath,
          hint: "run_typecheck recommended after line patches",
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("line_patch", false, ms);
        return { ok: false, error: String(err) };
      }
    },
  });
}
