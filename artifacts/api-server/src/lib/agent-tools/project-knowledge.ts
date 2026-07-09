import { tool } from "ai";
import { z } from "zod";
import { computeProjectKnowledge } from "../projectKnowledge";
import type { AgentToolContext } from "./context";

/**
 * Project Knowledge as an agent tool — Phase 3B, wired into the shared
 * agent-tools registry. Answers "show me every invite flow I've ever built"
 * style questions by grouping cross-project hits by project and scoring
 * maturity, instead of the plain hit list from search_all_projects.
 */
export function projectKnowledgeTool(ctx: AgentToolContext) {
  return tool({
    description:
      "Find every place across the user's projects where a concept/feature has been built before (e.g. 'invite flow', 'onboarding', 'auth'), grouped by project with a maturity score. Use when the user asks 'have I built X before', 'which project has the best version of X', or wants a concept-level view rather than raw search hits.",
    inputSchema: z.object({
      concept: z.string().min(1).describe("Concept or feature name to look for, e.g. 'invite flow'"),
    }),
    execute: async ({ concept }) => {
      const started = performance.now();
      ctx.emitToolCall("project_knowledge", { concept });
      try {
        const result = await computeProjectKnowledge(ctx.userId, concept);
        ctx.emitToolResult("project_knowledge", true, Math.round(performance.now() - started));
        return { ok: true, ...result };
      } catch (err) {
        ctx.emitToolResult("project_knowledge", false, Math.round(performance.now() - started));
        return { ok: false, error: String(err) };
      }
    },
  });
}
