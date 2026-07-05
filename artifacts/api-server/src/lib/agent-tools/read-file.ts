import { readFile } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { resolveWorkspacePath } from "../projectWorkspace";
import type { AgentToolContext } from "./context";

const MAX_LINES = 8000;

export function readFileTool(ctx: AgentToolContext) {
  return tool({
    description: "Read the contents of a file in the project workspace.",
    inputSchema: z.object({
      path: z.string().describe("Relative path to the file"),
    }),
    execute: async ({ path }) => {
      const started = performance.now();
      const stepId = ctx.stepId();
      ctx.emitToolCall("read_file", { path, stepId });
      try {
        const abs = resolveWorkspacePath(ctx.workspaceDir, path);
        const raw = await readFile(abs, "utf8");
        const lines = raw.split("\n");
        const truncated = lines.length > MAX_LINES;
        const content = truncated ? lines.slice(0, MAX_LINES).join("\n") : raw;
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("read_file", true, ms);
        return { content, truncated, lineCount: lines.length };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("read_file", false, ms);
        return { error: String(err), content: null };
      }
    },
  });
}
