import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { computeArchitectureDiff } from "../architectureDiff";
import type { AgentToolContext } from "./context";

/**
 * Architecture Diff as an agent tool — Phase 3A step 2, wired into the
 * shared agent-tools registry so any conversation surface can invoke it,
 * not just the /architecture-diff page.
 */
export function architectureDiffTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Compare two of the user's projects across architecture categories (routes, dependencies, data entities, components, auth approach). Use when the user asks how two projects differ structurally, or wants to compare an approach across projects. If you don't know project IDs, use list_user_projects or search_all_projects first.",
    inputSchema: z.object({
      projectAId: z.number().int().describe("First project's numeric id"),
      projectBId: z.number().int().describe("Second project's numeric id"),
    }),
    execute: async ({ projectAId, projectBId }) => {
      const started = performance.now();
      ctx.emitToolCall("architecture_diff", { projectAId, projectBId });
      try {
        const owned = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(eq(projectsTable.userId, ctx.userId));
        const ownedIds = new Set(owned.map((p) => p.id));
        if (!ownedIds.has(projectAId) || !ownedIds.has(projectBId)) {
          ctx.emitToolResult("architecture_diff", false, Math.round(performance.now() - started));
          return { ok: false, error: "One or both project ids do not belong to this user." };
        }

        const result = await computeArchitectureDiff(ctx.userId, projectAId, projectBId);
        const ms = Math.round(performance.now() - started);
        if (!result) {
          ctx.emitToolResult("architecture_diff", false, ms);
          return { ok: false, error: "Could not compute a diff for those projects." };
        }
        ctx.emitToolResult("architecture_diff", true, ms);
        return { ok: true, diff: result };
      } catch (err) {
        ctx.emitToolResult("architecture_diff", false, Math.round(performance.now() - started));
        return { ok: false, error: String(err) };
      }
    },
  });
}
