import { tool } from "ai";
import { z } from "zod";
import { computeComponentRegistry } from "../componentRegistry";
import type { AgentToolContext } from "./context";

/**
 * Shared Component Registry as an agent tool — Phase 3B step 2, wired into
 * the shared agent-tools registry. Surfaces components duplicated across the
 * user's projects (candidates for extraction into a shared lib).
 */
export function componentRegistryTool(ctx: AgentToolContext) {
  return tool({
    description:
      "List React components that appear across two or more of the user's projects — duplicate/extraction candidates (e.g. 'you've built a Modal 4 times'). Use when the user asks about shared components, duplicated UI, or whether something should be promoted into a shared library.",
    inputSchema: z.object({}),
    execute: async () => {
      const started = performance.now();
      ctx.emitToolCall("component_registry", {});
      try {
        const result = await computeComponentRegistry(ctx.userId);
        ctx.emitToolResult("component_registry", true, Math.round(performance.now() - started));
        return { ok: true, ...result };
      } catch (err) {
        ctx.emitToolResult("component_registry", false, Math.round(performance.now() - started));
        return { ok: false, error: String(err) };
      }
    },
  });
}
