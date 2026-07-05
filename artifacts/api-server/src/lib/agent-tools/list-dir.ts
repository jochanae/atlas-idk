import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { resolveWorkspacePath } from "../projectWorkspace";
import type { AgentToolContext } from "./context";

const EXCLUDED = new Set(["node_modules", ".git", "dist", ".next", ".cache", "coverage"]);

export function listDirTool(ctx: AgentToolContext) {
  return tool({
    description: "List files and directories at a path in the project workspace.",
    inputSchema: z.object({
      path: z.string().default("."),
    }),
    execute: async ({ path: relPath }) => {
      const started = performance.now();
      ctx.emitToolCall("list_dir", { path: relPath });
      try {
        const abs = resolveWorkspacePath(ctx.workspaceDir, relPath || ".");
        const entries = await readdir(abs);
        const children: Array<{ name: string; path: string; type: "file" | "dir" }> = [];
        for (const name of entries.sort()) {
          if (name.startsWith(".") || EXCLUDED.has(name)) continue;
          const childPath = path.join(abs, name);
          const rel = relPath && relPath !== "." ? `${relPath}/${name}` : name;
          try {
            const s = await stat(childPath);
            children.push({ name, path: rel, type: s.isDirectory() ? "dir" : "file" });
          } catch { /* skip */ }
        }
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("list_dir", true, ms);
        return { children };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        ctx.emitToolResult("list_dir", false, ms);
        return { error: String(err), children: [] };
      }
    },
  });
}
